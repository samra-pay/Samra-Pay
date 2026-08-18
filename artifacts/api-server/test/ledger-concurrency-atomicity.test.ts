import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  PostgresLedgerControl,
  PostgresLedgerJournalWriter,
  PostgresPersistenceContext,
  createDatabase,
} from "@workspace/db";

const connectionString = process.env["TEST_DATABASE_URL"];
if (!connectionString) {
  throw new Error(
    "TEST_DATABASE_URL is required for PostgreSQL concurrency and atomicity tests.",
  );
}

const connections = new Set<ReturnType<typeof createDatabase>>();

function openConnection(max?: number) {
  const opened = createDatabase({
    connectionString,
    ...(max ? { poolConfig: { max } } : {}),
  });
  connections.add(opened);
  return opened;
}

const controlConnection = openConnection();
const controlContext = new PostgresPersistenceContext(controlConnection.pool);

test.after(async () => {
  await Promise.all(
    [...connections].map(async (opened) => {
      connections.delete(opened);
      await opened.pool.end();
    }),
  );
});

test("CLAUDE-LED-032 Balance check and hold insert use the same locked transaction connection", async () => {
  for (const poolSize of [1, 20]) {
    const connection = openConnection(poolSize);
    const context = new PostgresPersistenceContext(connection.pool);
    const ledger = new PostgresLedgerControl(context);
    const fixture = await prepareFundedAccount(
      `connection-${poolSize}`,
      context,
    );
    await context.run(async () => {
      const lockedClient = context.query();
      const before = await lockedClient.query<{ backend_pid: number }>(
        `SELECT pg_backend_pid() AS backend_pid`,
      );
      await ledger.reserve(reserveCommand(fixture, `connection-${poolSize}`));
      const after = await context
        .query()
        .query<{ backend_pid: number }>(
          `SELECT pg_backend_pid() AS backend_pid`,
        );
      assert.equal(context.query(), lockedClient);
      assert.equal(after.rows[0]!.backend_pid, before.rows[0]!.backend_pid);
    });
    const balance = await ledger.getCustomerBalance(fixture.accountRef);
    assert.deepEqual(balance, {
      naturalBalanceMinor: 10_000n,
      activeHoldsMinor: 10_000n,
      availableMinor: 0n,
    });
  }
});

test("CLAUDE-LED-031 Concurrent reserves cannot oversubscribe an account", async () => {
  const fixture = await prepareFundedAccount(
    "oversubscription",
    controlContext,
  );
  const first = openConnection(1);
  const second = openConnection(1);
  const attempts = await Promise.allSettled([
    new PostgresLedgerControl(
      new PostgresPersistenceContext(first.pool),
    ).reserve(reserveCommand(fixture, "first")),
    new PostgresLedgerControl(
      new PostgresPersistenceContext(second.pool),
    ).reserve(reserveCommand(fixture, "second")),
  ]);
  assert.equal(
    attempts.filter((attempt) => attempt.status === "fulfilled").length,
    1,
  );
  const rejection = attempts.find(
    (attempt) => attempt.status === "rejected",
  ) as PromiseRejectedResult;
  assert.match(String(rejection.reason), /insufficient available funds/i);

  const persisted = await controlConnection.pool.query<{
    active_count: string;
    active_amount: string;
  }>(
    `SELECT count(*)::text AS active_count,
            COALESCE(sum(amount_minor),0)::text AS active_amount
     FROM samra_core.ledger_holds
     WHERE product_account_id = $1 AND state = 'active'`,
    [fixture.productAccountId],
  );
  assert.deepEqual(persisted.rows[0], {
    active_count: "1",
    active_amount: "10000",
  });
});

test("CLAUDE-LED-033 Concurrent capture and release resolve to one terminal state", async () => {
  // A capture must be able to consume an account whose entire balance is held.
  // This directly guards against double-counting the active hold and its debit.
  const exactFixture = await prepareFundedAccount(
    "exact-balance-capture",
    controlContext,
  );
  const exactLedger = new PostgresLedgerControl(controlContext);
  const exactTransferId = `exact-balance-capture:${randomUUID()}`;
  const exactHold = await exactLedger.reserve({
    ...reserveCommand(exactFixture, exactTransferId),
    transferId: exactTransferId,
  });
  await exactLedger.capture({
    transferId: exactTransferId,
    holdId: exactHold.holdId,
    idempotencyKey: `${exactTransferId}:capture`,
  });
  assert.deepEqual(await exactLedger.getCustomerBalance(exactFixture.accountRef), {
    naturalBalanceMinor: 0n,
    activeHoldsMinor: 0n,
    availableMinor: 0n,
  });

  const fixture = await prepareFundedAccount("terminal-race", controlContext);
  const setupLedger = new PostgresLedgerControl(controlContext);
  const transferId = `terminal-race:${randomUUID()}`;
  const hold = await setupLedger.reserve({
    ...reserveCommand(fixture, transferId),
    transferId,
  });
  const first = openConnection(1);
  const second = openConnection(1);
  const outcomes = await Promise.allSettled([
    new PostgresLedgerControl(
      new PostgresPersistenceContext(first.pool),
    ).capture({
      transferId,
      holdId: hold.holdId,
      idempotencyKey: `${transferId}:capture`,
    }),
    new PostgresLedgerControl(
      new PostgresPersistenceContext(second.pool),
    ).release({
      transferId,
      holdId: hold.holdId,
      idempotencyKey: `${transferId}:release`,
    }),
  ]);
  assert.equal(
    outcomes.filter((outcome) => outcome.status === "fulfilled").length,
    1,
  );
  assert.match(
    String(
      (
        outcomes.find(
          (outcome) => outcome.status === "rejected",
        ) as PromiseRejectedResult
      ).reason,
    ),
    /Only an active hold can be (captured|released)/,
  );

  const persisted = await controlConnection.pool.query<{
    state: "captured" | "released";
    terminal_at: Date;
    terminal_events: string;
    transfer_journals: string;
  }>(
    `SELECT h.state, h.terminal_at,
            (SELECT count(*) FROM samra_core.ledger_hold_events e
             WHERE e.hold_id = h.id AND e.event_type IN ('captured','released'))::text
              AS terminal_events,
            (SELECT count(*) FROM samra_core.ledger_journals j
             WHERE j.business_event_type = 'remittance_capture'
               AND j.business_event_id = $2)::text AS transfer_journals
     FROM samra_core.ledger_holds h WHERE h.id = $1`,
    [hold.holdId, transferId],
  );
  const row = persisted.rows[0]!;
  assert.ok(row.terminal_at instanceof Date);
  assert.equal(row.terminal_events, "1");
  assert.equal(row.transfer_journals, row.state === "captured" ? "1" : "0");
});

test("CLAUDE-LED-034 Journal posting rolls back every row after a mid-loop failure", async () => {
  const eventId = `mid-loop:${randomUUID()}`;
  const journals = new PostgresLedgerJournalWriter(controlContext);
  await assert.rejects(
    journals.post({
      eventType: "ledger_atomicity_assurance",
      eventId,
      description: "Synthetic four-leg mid-loop rollback assurance",
      postings: [
        ["control_rain_usd", "debit", 75n],
        ["control_rain_usd", "debit", 25n],
        [`missing-account:${randomUUID()}`, "credit", 50n],
        ["clearing_remittance_principal_usd", "credit", 50n],
      ],
      metadata: { synthetic: "true", testCase: "CLAUDE-LED-034" },
    }),
    /was not found/,
  );
  const residue = await controlConnection.pool.query<{
    journals: string;
    postings: string;
    audits: string;
  }>(
    `SELECT
       (SELECT count(*) FROM samra_core.ledger_journals
        WHERE business_event_type = 'ledger_atomicity_assurance'
          AND business_event_id = $1)::text AS journals,
       (SELECT count(*) FROM samra_core.ledger_postings p
        JOIN samra_core.ledger_journals j ON j.id = p.journal_id
        WHERE j.business_event_type = 'ledger_atomicity_assurance'
          AND j.business_event_id = $1)::text AS postings,
       (SELECT count(*) FROM samra_core.audit_events
        WHERE correlation_id = $1)::text AS audits`,
    [eventId],
  );
  assert.deepEqual(residue.rows[0], {
    journals: "0",
    postings: "0",
    audits: "0",
  });
});

test("CLAUDE-LED-035 Connection loss before posting leaves no partial posted journal", async () => {
  const eventId = `connection-loss:${randomUUID()}`;
  const crashConnection = openConnection(1);
  const client = await crashConnection.pool.connect();
  client.on("error", () => undefined);
  try {
    await client.query("BEGIN");
    const backend = await client.query<{ backend_pid: number }>(
      `SELECT pg_backend_pid() AS backend_pid`,
    );
    const journal = await client.query<{ id: string }>(
      `INSERT INTO samra_core.ledger_journals
       (business_event_type, business_event_id, currency, state, description, metadata)
       VALUES ('ledger_connection_loss_assurance',$1,'USD','draft',
               'Synthetic connection-loss assurance','{}'::jsonb)
       RETURNING id`,
      [eventId],
    );
    await client.query(
      `INSERT INTO samra_core.ledger_postings
       (journal_id, account_id, sequence, side, amount_minor)
       SELECT $1, id, 1, 'debit', 100
       FROM samra_core.ledger_accounts WHERE code = 'control_rain_usd'`,
      [journal.rows[0]!.id],
    );
    await client.query(
      `INSERT INTO samra_core.ledger_postings
       (journal_id, account_id, sequence, side, amount_minor)
       SELECT $1, id, 2, 'credit', 100
       FROM samra_core.ledger_accounts
       WHERE code = 'clearing_remittance_principal_usd'`,
      [journal.rows[0]!.id],
    );
    // Keep an explicit command in flight so the forced disconnect is observed
    // as an awaited rejection rather than an asynchronous client error.
    const interruptedCommand = assert.rejects(
      client.query(`SELECT pg_sleep(30)`),
      /terminating connection due to administrator command/,
    );
    const terminated = await controlConnection.pool.query<{
      terminated: boolean;
    }>(`SELECT pg_terminate_backend($1) AS terminated`, [
      backend.rows[0]!.backend_pid,
    ]);
    assert.equal(terminated.rows[0]!.terminated, true);
    await interruptedCommand;
  } finally {
    client.release(true);
  }

  const assurance = await controlConnection.pool.query<{
    journal_count: string;
    posting_count: string;
    unbalanced_posted: string;
  }>(
    `SELECT
       (SELECT count(*) FROM samra_core.ledger_journals
        WHERE business_event_type = 'ledger_connection_loss_assurance'
          AND business_event_id = $1)::text AS journal_count,
       (SELECT count(*) FROM samra_core.ledger_postings p
        JOIN samra_core.ledger_journals j ON j.id = p.journal_id
        WHERE j.business_event_type = 'ledger_connection_loss_assurance'
          AND j.business_event_id = $1)::text AS posting_count,
       (SELECT count(*) FROM (
          SELECT j.id FROM samra_core.ledger_journals j
          JOIN samra_core.ledger_postings p ON p.journal_id = j.id
          WHERE j.state IN ('posted','reversed')
          GROUP BY j.id
          HAVING sum(CASE WHEN p.side='debit' THEN p.amount_minor ELSE -p.amount_minor END) <> 0
        ) broken)::text AS unbalanced_posted`,
    [eventId],
  );
  assert.deepEqual(assurance.rows[0], {
    journal_count: "0",
    posting_count: "0",
    unbalanced_posted: "0",
  });
});

type FundedAccount = Readonly<{
  accountRef: string;
  accountCode: string;
  productAccountId: string;
}>;

async function prepareFundedAccount(
  label: string,
  context: PostgresPersistenceContext,
): Promise<FundedAccount> {
  const unique = `${label}:${randomUUID()}`;
  const accountRef = `atomic-product:${unique}`;
  const accountCode = `atomic-liability:${unique}`;
  const product = await context.query().query<{ id: string }>(
    `INSERT INTO samra_core.product_accounts
     (customer_id, external_ref, kind, currency)
     SELECT id, $1, 'domestic_cash', 'USD'
     FROM samra_core.customers WHERE external_ref = 'demo_customer_001'
     RETURNING id`,
    [accountRef],
  );
  await context.query().query(
    `INSERT INTO samra_core.ledger_accounts
     (code, name, account_class, normal_side, currency, product_account_id)
     VALUES ($1,$2,'liability','credit','USD',$3)`,
    [accountCode, `Synthetic atomicity ${label}`, product.rows[0]!.id],
  );
  await new PostgresLedgerJournalWriter(context).post({
    eventType: "ledger_atomicity_opening",
    eventId: unique,
    description: "Synthetic concurrency opening balance",
    postings: [
      ["control_rain_usd", "debit", 10_000n],
      [accountCode, "credit", 10_000n],
    ],
    metadata: { synthetic: "true", fixtureId: unique },
  });
  return Object.freeze({
    accountRef,
    accountCode,
    productAccountId: product.rows[0]!.id,
  });
}

function reserveCommand(fixture: FundedAccount, label: string) {
  const transferId = `atomic-reserve:${label}:${randomUUID()}`;
  return {
    transferId,
    accountId: fixture.accountRef,
    amountMinor: 10_000n,
    principalAmountMinor: 10_000n,
    feeAmountMinor: 0n,
    currency: "USD" as const,
    idempotencyKey: `${transferId}:reserve`,
  };
}
