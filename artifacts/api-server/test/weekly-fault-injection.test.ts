import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  PostgresLedgerControl,
  PostgresPersistenceContext,
  createDatabase,
} from "@workspace/db";
import {
  assertLedgerHealthy,
  prepareFundedAccount,
  requiredPositiveInteger,
  reserveCommand,
} from "./weekly-resilience-fixtures";

const connectionString = process.env["TEST_DATABASE_URL"];
if (!connectionString) {
  throw new Error(
    "TEST_DATABASE_URL is required for controlled fault injection.",
  );
}

const rounds = requiredPositiveInteger("WEEKLY_FAULT_ROUNDS", 8, 40);
const database = createDatabase({ connectionString, poolConfig: { max: 8 } });
const context = new PostgresPersistenceContext(database.pool);

test.after(async () => database.pool.end());

test("RESILIENCE-WEEKLY-003 injected service-boundary failures roll back holds, journals, and audit", async () => {
  for (let round = 0; round < rounds; round += 1) {
    const fixture = await prepareFundedAccount(
      context,
      `fault-boundary-${round}`,
      20_000n,
    );
    const ledger = new PostgresLedgerControl(context);
    const rolledBackTransfer = `weekly-fault-reserve:${round}:${randomUUID()}`;
    await assert.rejects(
      context.run(async () => {
        await ledger.reserve(
          reserveCommand(fixture, rolledBackTransfer, 5_000n),
        );
        throw new Error("INJECTED_AFTER_RESERVE");
      }),
      /INJECTED_AFTER_RESERVE/,
    );
    const reserveResidue = await database.pool.query<{
      holds: string;
      audits: string;
    }>(
      `SELECT
         (SELECT count(*) FROM samra_core.ledger_holds
          WHERE business_event_id = $1)::text AS holds,
         (SELECT count(*) FROM samra_core.audit_events
          WHERE correlation_id = $1)::text AS audits`,
      [rolledBackTransfer],
    );
    assert.deepEqual(reserveResidue.rows[0], { holds: "0", audits: "0" });

    const transferId = `weekly-fault-capture:${round}:${randomUUID()}`;
    const hold = await ledger.reserve(
      reserveCommand(fixture, transferId, 5_000n),
    );
    await assert.rejects(
      context.run(async () => {
        await ledger.capture({
          transferId,
          holdId: hold.holdId,
          idempotencyKey: `${transferId}:capture`,
        });
        throw new Error("INJECTED_AFTER_CAPTURE");
      }),
      /INJECTED_AFTER_CAPTURE/,
    );
    const captureResidue = await database.pool.query<{
      state: string;
      capture_journals: string;
      capture_events: string;
      capture_audits: string;
    }>(
      `SELECT hold.state,
              (SELECT count(*) FROM samra_core.ledger_journals
               WHERE business_event_type = 'remittance_capture'
                 AND business_event_id = $1)::text AS capture_journals,
              (SELECT count(*) FROM samra_core.ledger_hold_events
               WHERE hold_id = hold.id AND event_type = 'captured')::text
                AS capture_events,
              (SELECT count(*) FROM samra_core.audit_events
               WHERE correlation_id = $1 AND action = 'ledger_hold_captured')::text
                AS capture_audits
       FROM samra_core.ledger_holds hold WHERE hold.id = $2`,
      [transferId, hold.holdId],
    );
    assert.deepEqual(captureResidue.rows[0], {
      state: "active",
      capture_journals: "0",
      capture_events: "0",
      capture_audits: "0",
    });
    await ledger.release({
      transferId,
      holdId: hold.holdId,
      idempotencyKey: `${transferId}:release-after-fault`,
    });
  }
  await assertLedgerHealthy(
    database,
    context,
    `weekly-service-faults:${randomUUID()}`,
  );
});

test("RESILIENCE-WEEKLY-004 statement timeouts abort the transaction and the pool recovers", async () => {
  const eventKey = `weekly-timeout:${randomUUID()}`;
  await assert.rejects(
    context.run(async () => {
      await context.query().query(
        `INSERT INTO samra_core.audit_events
         (event_key, actor_type, actor_id, action, entity_type, entity_id,
          correlation_id, metadata)
         VALUES ($1,'system','weekly-backend-resilience','fault_probe',
                 'fault_probe',$1,$1,'{"synthetic":true}'::jsonb)`,
        [eventKey],
      );
      await context.query().query(`SET LOCAL statement_timeout = '20ms'`);
      await context.query().query(`SELECT pg_sleep(0.2)`);
    }),
    /statement timeout|canceling statement/i,
  );
  const residue = await database.pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM samra_core.audit_events
     WHERE event_key = $1`,
    [eventKey],
  );
  assert.equal(residue.rows[0]!.count, "0");
  assert.equal(
    (await database.pool.query<{ value: number }>("SELECT 1 AS value")).rows[0]!
      .value,
    1,
  );
});

test("RESILIENCE-WEEKLY-005 terminated connections leave no partial journals and a new client recovers", async () => {
  for (let round = 0; round < Math.max(2, Math.floor(rounds / 2)); round += 1) {
    const eventId = `weekly-connection-loss:${round}:${randomUUID()}`;
    const crashDatabase = createDatabase({
      connectionString,
      poolConfig: { max: 1 },
    });
    const client = await crashDatabase.pool.connect();
    client.on("error", () => undefined);
    try {
      await client.query("BEGIN");
      const backend = await client.query<{ backend_pid: number }>(
        `SELECT pg_backend_pid() AS backend_pid`,
      );
      const journal = await client.query<{ id: string }>(
        `INSERT INTO samra_core.ledger_journals
         (business_event_type, business_event_id, currency, state, description, metadata)
         VALUES ('weekly_connection_fault',$1,'USD','draft',
                 'Synthetic weekly connection termination','{}'::jsonb)
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
      const interrupted = client.query(`SELECT pg_sleep(30)`).then(
        () => undefined,
        (error: unknown) => error,
      );
      const terminated = await database.pool.query<{ terminated: boolean }>(
        `SELECT pg_terminate_backend($1) AS terminated`,
        [backend.rows[0]!.backend_pid],
      );
      assert.equal(terminated.rows[0]!.terminated, true);
      assert.match(
        String(await interrupted),
        /terminating connection due to administrator command/i,
      );
    } finally {
      client.release(true);
      await crashDatabase.pool.end();
    }
    const residue = await database.pool.query<{
      journals: string;
      postings: string;
    }>(
      `SELECT
         (SELECT count(*) FROM samra_core.ledger_journals
          WHERE business_event_type = 'weekly_connection_fault'
            AND business_event_id = $1)::text AS journals,
         (SELECT count(*) FROM samra_core.ledger_postings posting
          JOIN samra_core.ledger_journals journal ON journal.id = posting.journal_id
          WHERE journal.business_event_type = 'weekly_connection_fault'
            AND journal.business_event_id = $1)::text AS postings`,
      [eventId],
    );
    assert.deepEqual(residue.rows[0], { journals: "0", postings: "0" });
  }
  await assertLedgerHealthy(
    database,
    context,
    `weekly-connection-faults:${randomUUID()}`,
  );
});
