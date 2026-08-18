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
    "TEST_DATABASE_URL is required for PostgreSQL reversal and refund tests.",
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

const connection = openConnection();
const context = new PostgresPersistenceContext(connection.pool);
const ledger = new PostgresLedgerControl(context);

test.after(async () => {
  await Promise.all(
    [...connections].map(async (opened) => {
      connections.delete(opened);
      await opened.pool.end();
    }),
  );
});

test("CLAUDE-LED-036 Reversal mirrors every leg with flipped side and nets to zero", async () => {
  await withinRollback(async () => {
    const fixture = await prepareCapturedTransfer("mirror", context, ledger);
    await refund(ledger, fixture);

    const reversalId = await findReversalId(context, fixture.originalJournalId);
    const original = await readPostings(context, fixture.originalJournalId);
    const reversal = await readPostings(context, reversalId);
    assert.deepEqual(
      reversal,
      original.map((posting) => ({
        ...posting,
        side: posting.side === "debit" ? "credit" : "debit",
      })),
    );

    const net = await context.query().query<{
      account_code: string;
      delta: string;
      posting_count: string;
    }>(
      `SELECT a.code AS account_code,
              sum(CASE WHEN p.side = 'debit' THEN p.amount_minor
                       ELSE -p.amount_minor END)::text AS delta,
              count(*)::text AS posting_count
       FROM samra_core.ledger_postings p
       JOIN samra_core.ledger_accounts a ON a.id = p.account_id
       WHERE p.journal_id = ANY($1::uuid[])
       GROUP BY a.code
       ORDER BY a.code`,
      [[fixture.originalJournalId, reversalId]],
    );
    assert.ok(net.rows.length >= 2);
    assert.ok(net.rows.every((row) => row.delta === "0"));
    assert.ok(net.rows.every((row) => row.posting_count === "2"));
  });
});

test("CLAUDE-LED-038 Reversal does not mutate the original journal", async () => {
  await withinRollback(async () => {
    const fixture = await prepareCapturedTransfer("immutable", context, ledger);
    const before = await readJournalSnapshot(
      context,
      fixture.originalJournalId,
    );
    assert.equal(
      await readJournalState(context, fixture.originalJournalId),
      "posted",
    );

    await refund(ledger, fixture);

    const after = await readJournalSnapshot(context, fixture.originalJournalId);
    assert.deepEqual(after, before);
    assert.equal(
      await readJournalState(context, fixture.originalJournalId),
      "reversed",
    );
    assert.notEqual(
      await findReversalId(context, fixture.originalJournalId),
      fixture.originalJournalId,
    );
  });
});

test("CLAUDE-LED-037 Reversal is idempotent", async () => {
  await withinRollback(async () => {
    const fixture = await prepareCapturedTransfer(
      "idempotent",
      context,
      ledger,
    );

    await refund(ledger, fixture);
    await refund(ledger, fixture);

    const persisted = await context.query().query<{
      reversal_count: string;
      balance_minor: string;
    }>(
      `SELECT
         (SELECT count(*) FROM samra_core.ledger_journals
          WHERE reverses_journal_id = $1)::text AS reversal_count,
         (SELECT COALESCE(sum(
            CASE WHEN p.side = a.normal_side THEN p.amount_minor
                 ELSE -p.amount_minor END
          ), 0)
          FROM samra_core.ledger_accounts a
          LEFT JOIN samra_core.ledger_postings p ON p.account_id = a.id
          LEFT JOIN samra_core.ledger_journals j
            ON j.id = p.journal_id AND j.state IN ('posted','reversed')
          WHERE a.code = $2)::text AS balance_minor`,
      [fixture.originalJournalId, fixture.accountCode],
    );
    assert.deepEqual(persisted.rows[0], {
      reversal_count: "1",
      balance_minor: "50000",
    });
  });
});

test("CLAUDE-LED-039 Concurrent reversals of one journal create exactly one reversal", async () => {
  const fixture = await context.run(() =>
    prepareCapturedTransfer("concurrent", context, ledger),
  );
  const first = openConnection(1);
  const second = openConnection(1);
  const firstLedger = new PostgresLedgerControl(
    new PostgresPersistenceContext(first.pool),
  );
  const secondLedger = new PostgresLedgerControl(
    new PostgresPersistenceContext(second.pool),
  );

  await Promise.all([
    refund(firstLedger, fixture),
    refund(secondLedger, fixture),
  ]);

  const persisted = await connection.pool.query<{
    reversal_count: string;
    customer_delta: string;
    balance_minor: string;
  }>(
    `SELECT
       (SELECT count(*) FROM samra_core.ledger_journals
        WHERE reverses_journal_id = $1)::text AS reversal_count,
       (SELECT sum(CASE WHEN p.side = a.normal_side THEN p.amount_minor
                        ELSE -p.amount_minor END)
        FROM samra_core.ledger_postings p
        JOIN samra_core.ledger_accounts a ON a.id = p.account_id
        JOIN samra_core.ledger_journals j ON j.id = p.journal_id
        WHERE a.code = $2
          AND (j.id = $1 OR j.reverses_journal_id = $1))::text AS customer_delta,
       (SELECT COALESCE(sum(
          CASE WHEN p.side = a.normal_side THEN p.amount_minor
               ELSE -p.amount_minor END
        ), 0)
        FROM samra_core.ledger_accounts a
        LEFT JOIN samra_core.ledger_postings p ON p.account_id = a.id
        LEFT JOIN samra_core.ledger_journals j
          ON j.id = p.journal_id AND j.state IN ('posted','reversed')
        WHERE a.code = $2)::text AS balance_minor`,
    [fixture.originalJournalId, fixture.accountCode],
  );
  assert.deepEqual(persisted.rows[0], {
    reversal_count: "1",
    customer_delta: "0",
    balance_minor: "50000",
  });
});

async function prepareCapturedTransfer(
  label: string,
  fixtureContext: PostgresPersistenceContext,
  fixtureLedger: PostgresLedgerControl,
) {
  const fixtureId = `${label}:${randomUUID()}`;
  const transferId = `reversal:${fixtureId}`;
  const accountRef = `reversal_product:${fixtureId}`;
  const accountCode = `reversal_liability:${fixtureId}`;
  const fixtureJournals = new PostgresLedgerJournalWriter(fixtureContext);
  const product = await fixtureContext.query().query<{ id: string }>(
    `INSERT INTO samra_core.product_accounts
     (customer_id, external_ref, kind, currency)
     SELECT id, $1, 'domestic_cash', 'USD'
     FROM samra_core.customers WHERE external_ref = 'demo_customer_001'
     RETURNING id`,
    [accountRef],
  );
  assert.equal(product.rowCount, 1);
  await fixtureContext.query().query(
    `INSERT INTO samra_core.ledger_accounts
     (code, name, account_class, normal_side, currency, product_account_id)
     VALUES ($1,$2,'liability','credit','USD',$3)`,
    [accountCode, `Synthetic reversal ${label}`, product.rows[0]!.id],
  );
  await fixtureJournals.post({
    eventType: "ledger_reversal_assurance_opening",
    eventId: fixtureId,
    description: "Synthetic reversal assurance opening balance",
    postings: [
      ["control_rain_usd", "debit", 50_000n],
      [accountCode, "credit", 50_000n],
    ],
    metadata: { synthetic: "true", fixtureId },
  });
  const { holdId } = await fixtureLedger.reserve({
    transferId,
    accountId: accountRef,
    amountMinor: 10_300n,
    principalAmountMinor: 10_000n,
    feeAmountMinor: 300n,
    currency: "USD",
    idempotencyKey: `${transferId}:reserve`,
  });
  await fixtureLedger.capture({
    transferId,
    holdId,
    idempotencyKey: `${transferId}:capture`,
  });
  const original = await fixtureContext.query().query<{ id: string }>(
    `SELECT id FROM samra_core.ledger_journals
     WHERE business_event_type = 'remittance_capture'
       AND business_event_id = $1`,
    [transferId],
  );
  assert.equal(original.rowCount, 1);
  return {
    transferId,
    accountRef,
    accountCode,
    originalJournalId: original.rows[0]!.id,
    refundAmountMinor: 10_300n,
  };
}

async function refund(
  targetLedger: PostgresLedgerControl,
  fixture: Awaited<ReturnType<typeof prepareCapturedTransfer>>,
) {
  await targetLedger.refund({
    transferId: fixture.transferId,
    amountMinor: fixture.refundAmountMinor,
    currency: "USD",
    idempotencyKey: `${fixture.transferId}:refund`,
  });
}

async function findReversalId(
  targetContext: PostgresPersistenceContext,
  originalJournalId: string,
) {
  const result = await targetContext.query().query<{ id: string }>(
    `SELECT id FROM samra_core.ledger_journals
     WHERE reverses_journal_id = $1`,
    [originalJournalId],
  );
  assert.equal(result.rowCount, 1);
  return result.rows[0]!.id;
}

async function readPostings(
  targetContext: PostgresPersistenceContext,
  journalId: string,
) {
  const result = await targetContext.query().query<{
    account_code: string;
    sequence: number;
    side: "debit" | "credit";
    amount_minor: string;
  }>(
    `SELECT a.code AS account_code, p.sequence, p.side,
            p.amount_minor::text AS amount_minor
     FROM samra_core.ledger_postings p
     JOIN samra_core.ledger_accounts a ON a.id = p.account_id
     WHERE p.journal_id = $1
     ORDER BY p.sequence`,
    [journalId],
  );
  return result.rows;
}

async function readJournalSnapshot(
  targetContext: PostgresPersistenceContext,
  journalId: string,
) {
  const journal = await targetContext.query().query(
    `SELECT id::text, business_event_type, business_event_id, currency,
            description, reverses_journal_id::text, metadata,
            created_at, posted_at
     FROM samra_core.ledger_journals WHERE id = $1`,
    [journalId],
  );
  return {
    journal: journal.rows[0],
    postings: await readPostings(targetContext, journalId),
  };
}

async function readJournalState(
  targetContext: PostgresPersistenceContext,
  journalId: string,
) {
  const result = await targetContext
    .query()
    .query<{ state: string }>(
      `SELECT state::text FROM samra_core.ledger_journals WHERE id = $1`,
      [journalId],
    );
  return result.rows[0]!.state;
}

async function withinRollback(operation: () => Promise<void>): Promise<void> {
  const rollback = new RollbackAfterAssurance();
  await assert.rejects(
    context.run(async () => {
      await operation();
      throw rollback;
    }),
    (error) => error === rollback,
  );
}

class RollbackAfterAssurance extends Error {}
