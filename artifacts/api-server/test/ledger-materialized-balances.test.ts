import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  PostgresLedgerBalanceProjection,
  PostgresLedgerControl,
  PostgresLedgerJournalWriter,
  PostgresPersistenceContext,
  createDatabase,
} from "@workspace/db";

const connectionString = process.env["TEST_DATABASE_URL"];
if (!connectionString) {
  throw new Error(
    "TEST_DATABASE_URL is required for PostgreSQL materialized balance tests.",
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
const journals = new PostgresLedgerJournalWriter(context);
const ledger = new PostgresLedgerControl(context);
const projection = new PostgresLedgerBalanceProjection(context);

test.after(async () => {
  await Promise.all(
    [...connections].map(async (opened) => {
      connections.delete(opened);
      await opened.pool.end();
    }),
  );
});

test("Materialized ledger balances remain journal-derived under concurrency, rollback, restart, drift, and rebuild", async () => {
  const fixtureId = randomUUID();
  const accountRef = `materialized-product:${fixtureId}`;
  const accountCode = `materialized-liability:${fixtureId}`;
  const product = await connection.pool.query<{ id: string }>(
    `INSERT INTO samra_core.product_accounts
     (customer_id, external_ref, kind, currency)
     SELECT id, $1, 'domestic_cash', 'USD'
     FROM samra_core.customers WHERE external_ref = 'demo_customer_001'
     RETURNING id`,
    [accountRef],
  );
  assert.equal(product.rowCount, 1);
  const account = await connection.pool.query<{ id: string }>(
    `INSERT INTO samra_core.ledger_accounts
     (code, name, account_class, normal_side, currency, product_account_id)
     VALUES ($1,'Materialized balance assurance','liability','credit','USD',$2)
     RETURNING id`,
    [accountCode, product.rows[0]!.id],
  );
  const accountId = account.rows[0]!.id;

  assert.deepEqual(await readProjection(accountId), {
    natural_balance_minor: "0",
    active_holds_minor: "0",
    available_balance_minor: "0",
    applied_posting_count: "0",
    active_hold_count: "0",
  });

  await journals.post({
    eventType: "ledger_materialized_opening",
    eventId: fixtureId,
    description: "Materialized balance assurance opening",
    postings: [
      ["control_rain_usd", "debit", 50_000n],
      [accountCode, "credit", 50_000n],
    ],
    metadata: { synthetic: "true", fixtureId },
  });
  assert.deepEqual(await ledger.getCustomerBalance(accountRef), {
    naturalBalanceMinor: 50_000n,
    activeHoldsMinor: 0n,
    availableMinor: 50_000n,
  });

  const transferId = `materialized-hold:${fixtureId}`;
  const hold = await ledger.reserve({
    transferId,
    accountId: accountRef,
    amountMinor: 7_500n,
    principalAmountMinor: 7_000n,
    feeAmountMinor: 500n,
    currency: "USD",
    idempotencyKey: `${transferId}:reserve`,
  });
  assert.deepEqual(await ledger.getCustomerBalance(accountRef), {
    naturalBalanceMinor: 50_000n,
    activeHoldsMinor: 7_500n,
    availableMinor: 42_500n,
  });
  await ledger.release({
    transferId,
    holdId: hold.holdId,
    idempotencyKey: `${transferId}:release`,
  });
  assert.deepEqual(await ledger.getCustomerBalance(accountRef), {
    naturalBalanceMinor: 50_000n,
    activeHoldsMinor: 0n,
    availableMinor: 50_000n,
  });

  const rollbackEventId = `materialized-rollback:${fixtureId}`;
  const rollbackSignal = new Error("materialized-assurance-rollback");
  await assert.rejects(
    context.run(async () => {
      await journals.post({
        eventType: "ledger_materialized_rollback",
        eventId: rollbackEventId,
        description: "Materialized projection transaction rollback",
        postings: [
          ["control_rain_usd", "debit", 900n],
          [accountCode, "credit", 900n],
        ],
        metadata: { synthetic: "true", fixtureId },
      });
      assert.equal(
        (await ledger.getCustomerBalance(accountRef)).naturalBalanceMinor,
        50_900n,
      );
      throw rollbackSignal;
    }),
    (error) => error === rollbackSignal,
  );
  assert.equal(
    (await ledger.getCustomerBalance(accountRef)).naturalBalanceMinor,
    50_000n,
  );
  assert.equal(
    (
      await connection.pool.query<{ count: string }>(
        `SELECT count(*)::text AS count
         FROM samra_core.ledger_journals
         WHERE business_event_type = 'ledger_materialized_rollback'
           AND business_event_id = $1`,
        [rollbackEventId],
      )
    ).rows[0]!.count,
    "0",
  );

  const concurrentPostingCount = 24;
  await Promise.all(
    Array.from({ length: concurrentPostingCount }, async (_, index) => {
      const opened = openConnection(1);
      const workerContext = new PostgresPersistenceContext(opened.pool);
      await new PostgresLedgerJournalWriter(workerContext).post({
        eventType: "ledger_materialized_concurrency",
        eventId: `${fixtureId}:${index}`,
        description: "Concurrent materialized balance assurance",
        postings: [
          ["control_rain_usd", "debit", 100n],
          [accountCode, "credit", 100n],
        ],
        metadata: { synthetic: "true", fixtureId, index: String(index) },
      });
    }),
  );
  assert.deepEqual(await ledger.getCustomerBalance(accountRef), {
    naturalBalanceMinor: 52_400n,
    activeHoldsMinor: 0n,
    availableMinor: 52_400n,
  });
  assert.deepEqual(
    await projection.verify({
      sweepRef: `materialized-clean:${fixtureId}`,
      actorType: "system",
      actorId: "ledger-assurance",
    }),
    [],
  );

  await assert.rejects(
    connection.pool.query(
      `UPDATE samra_core.ledger_account_balances
       SET natural_balance_minor = natural_balance_minor + 1,
           available_balance_minor = available_balance_minor + 1
       WHERE account_id = $1`,
      [accountId],
    ),
    /derived and cannot be edited directly/,
  );
  await assert.rejects(
    connection.pool.query(
      `DELETE FROM samra_core.ledger_account_balances WHERE account_id = $1`,
      [accountId],
    ),
    /cannot be deleted/,
  );

  await connection.pool.query(
    `ALTER TABLE samra_core.ledger_account_balances
     DISABLE TRIGGER ledger_account_balances_derived_only`,
  );
  try {
    await connection.pool.query(
      `UPDATE samra_core.ledger_account_balances
       SET natural_balance_minor = natural_balance_minor + 77,
           available_balance_minor = available_balance_minor + 77
       WHERE account_id = $1`,
      [accountId],
    );
  } finally {
    await connection.pool.query(
      `ALTER TABLE samra_core.ledger_account_balances
       ENABLE TRIGGER ledger_account_balances_derived_only`,
    );
  }

  const drift = await projection.verify({
    sweepRef: `materialized-drift:${fixtureId}`,
    actorType: "operator",
    actorId: "ledger-assurance-operator",
  });
  assert.equal(drift.length, 1);
  assert.deepEqual(drift[0], {
    accountId,
    accountCode,
    currency: "USD",
    projectedNaturalMinor: "52477",
    actualNaturalMinor: "52400",
    projectedActiveHoldsMinor: "0",
    actualActiveHoldsMinor: "0",
    projectedAvailableMinor: "52477",
    actualAvailableMinor: "52400",
    projectedPostingCount: "25",
    actualPostingCount: "25",
    projectedActiveHoldCount: "0",
    actualActiveHoldCount: "0",
  });

  const commandRef = `materialized-rebuild:${fixtureId}`;
  const reason = "Repair the deliberately corrupted assurance projection.";
  const rebuilt = await projection.rebuild({
    commandRef,
    operatorId: "ledger-assurance-operator",
    reason,
  });
  assert.equal(rebuilt.state, "completed");
  assert.equal(rebuilt.driftedAccountCount, 1);
  assert.deepEqual(
    await projection.rebuild({
      commandRef,
      operatorId: "ledger-assurance-operator",
      reason,
    }),
    rebuilt,
  );
  await assert.rejects(
    projection.rebuild({
      commandRef,
      operatorId: "ledger-assurance-operator",
      reason: "Attempt to reuse the command with altered evidence.",
    }),
    /already used with different evidence/,
  );
  await assert.rejects(
    connection.pool.query(
      `UPDATE samra_core.ledger_balance_rebuild_commands
       SET reason = 'Unauthorized direct rebuild evidence change'
       WHERE command_ref = $1`,
      [commandRef],
    ),
    /cannot be edited directly/,
  );

  assert.deepEqual(await ledger.getCustomerBalance(accountRef), {
    naturalBalanceMinor: 52_400n,
    activeHoldsMinor: 0n,
    availableMinor: 52_400n,
  });
  assert.deepEqual(
    await projection.verify({
      sweepRef: `materialized-repaired:${fixtureId}`,
      actorType: "system",
      actorId: "ledger-assurance",
    }),
    [],
  );

  const evidence = await connection.pool.query<{
    action: string;
    actor_type: string;
    actor_id: string | null;
  }>(
    `SELECT action, actor_type, actor_id
     FROM samra_core.audit_events
     WHERE event_key IN ($1,$2,$3)
     ORDER BY event_key`,
    [
      `ledger:balance-sweep:materialized-drift:${fixtureId}`,
      `ledger:balance-rebuild:${commandRef}`,
      `ledger:balance-sweep:materialized-repaired:${fixtureId}`,
    ],
  );
  assert.deepEqual(evidence.rows.map((row) => row.action).sort(), [
    "ledger_balance_projection_drift_detected",
    "ledger_balance_projection_rebuilt",
    "ledger_balance_projection_verified",
  ]);
  assert.ok(
    evidence.rows.every(
      (row) => row.actor_type !== "anonymous" && row.actor_id !== null,
    ),
  );

  const restarted = openConnection(1);
  const restartedContext = new PostgresPersistenceContext(restarted.pool);
  assert.deepEqual(
    await new PostgresLedgerControl(restartedContext).getCustomerBalance(
      accountRef,
    ),
    {
      naturalBalanceMinor: 52_400n,
      activeHoldsMinor: 0n,
      availableMinor: 52_400n,
    },
  );
  assert.deepEqual(
    await new PostgresLedgerBalanceProjection(restartedContext).verify({
      sweepRef: `materialized-restart:${fixtureId}`,
      actorType: "system",
      actorId: "ledger-assurance-restart",
    }),
    [],
  );
});

async function readProjection(accountId: string) {
  const result = await connection.pool.query<{
    natural_balance_minor: string;
    active_holds_minor: string;
    available_balance_minor: string;
    applied_posting_count: string;
    active_hold_count: string;
  }>(
    `SELECT natural_balance_minor::text, active_holds_minor::text,
            available_balance_minor::text, applied_posting_count::text,
            active_hold_count::text
     FROM samra_core.ledger_account_balances WHERE account_id = $1`,
    [accountId],
  );
  assert.equal(result.rowCount, 1);
  return result.rows[0]!;
}
