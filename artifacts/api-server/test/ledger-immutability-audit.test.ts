import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  PostgresLedgerControl,
  PostgresLedgerJournalWriter,
  PostgresOperationsStore,
  PostgresPersistenceContext,
  PostgresRemittanceRepository,
  RandomIdGenerator,
  createDatabase,
} from "@workspace/db";
import type { ProviderEvent } from "@workspace/remittance";
import { DemoRuntime } from "../src/domain/demo-runtime";

const connectionString = process.env["TEST_DATABASE_URL"];
if (!connectionString) {
  throw new Error(
    "TEST_DATABASE_URL is required for PostgreSQL immutability and audit tests.",
  );
}

const connection = createDatabase({ connectionString });
const context = new PostgresPersistenceContext(connection.pool);
const journals = new PostgresLedgerJournalWriter(context);

test.after(async () => {
  await connection.pool.end();
});

test("CLAUDE-LED-044 Posted journals and their postings are immutable", async () => {
  await withinRollback(async () => {
    const journalId = await journals.post({
      eventType: "ledger_immutability_assurance",
      eventId: randomUUID(),
      description: "Synthetic posted-journal immutability assurance",
      postings: [
        ["control_rain_usd", "debit", 100n],
        ["clearing_remittance_principal_usd", "credit", 100n],
      ],
      metadata: { synthetic: "true", testCase: "CLAUDE-LED-044" },
    });
    const posting = await context.query().query<{ id: string }>(
      `SELECT id FROM samra_core.ledger_postings
       WHERE journal_id = $1 ORDER BY sequence LIMIT 1`,
      [journalId],
    );
    const postingId = posting.rows[0]!.id;

    await databaseRejection(
      "posted_posting_update",
      `UPDATE samra_core.ledger_postings SET amount_minor = 1 WHERE id = $1`,
      [postingId],
      /immutable after posting/,
    );
    await databaseRejection(
      "posted_posting_delete",
      `DELETE FROM samra_core.ledger_postings WHERE id = $1`,
      [postingId],
      /immutable after posting/,
    );
    await databaseRejection(
      "posted_journal_regression",
      `UPDATE samra_core.ledger_journals SET state = 'draft' WHERE id = $1`,
      [journalId],
      /can only be marked reversed by its posted reversal journal/,
    );

    const unchanged = await context.query().query<{
      state: string;
      amount_minor: string;
      posting_count: string;
    }>(
      `SELECT j.state::text, max(p.amount_minor)::text AS amount_minor,
              count(p.id)::text AS posting_count
       FROM samra_core.ledger_journals j
       JOIN samra_core.ledger_postings p ON p.journal_id = j.id
       WHERE j.id = $1 GROUP BY j.id`,
      [journalId],
    );
    assert.deepEqual(unchanged.rows[0], {
      state: "posted",
      amount_minor: "100",
      posting_count: "2",
    });
  });
});

test("CLAUDE-LED-046 Audit events cannot be modified or deleted", async () => {
  await withinRollback(async () => {
    const eventKey = `audit-immutability:${randomUUID()}`;
    const inserted = await context.query().query<{ id: string }>(
      `INSERT INTO samra_core.audit_events
       (event_key, actor_type, actor_id, action, entity_type, entity_id, metadata)
       VALUES ($1,'operator','audit-examiner','examiner_probe','assurance',$1,'{}'::jsonb)
       RETURNING id`,
      [eventKey],
    );
    const auditId = inserted.rows[0]!.id;
    await databaseRejection(
      "audit_update",
      `UPDATE samra_core.audit_events SET action = 'tampered' WHERE id = $1`,
      [auditId],
      /audit_events is append-only/,
    );
    await databaseRejection(
      "audit_delete",
      `DELETE FROM samra_core.audit_events WHERE id = $1`,
      [auditId],
      /audit_events is append-only/,
    );
    const unchanged = await context
      .query()
      .query<{ action: string }>(
        `SELECT action FROM samra_core.audit_events WHERE id = $1`,
        [auditId],
      );
    assert.equal(unchanged.rows[0]!.action, "examiner_probe");
  });
});

test("CLAUDE-LED-045 Every ledger mutation records the correct customer, system, operator, or provider actor", async () => {
  await withinRollback(async () => {
    const runtime = createRuntime();
    const workerTransfer = await createTransfer(runtime, "worker");
    await runtime.service.selectAndAdvanceFakeScenario(
      "demo_customer_001",
      workerTransfer.id,
      "HAPPY_PATH",
      { actorType: "system", actorId: "assurance-worker" },
    );

    const operatorTransfer = await createTransfer(runtime, "operator");
    await runtime.service.cancelTransfer({
      actorId: "demo_customer_001",
      transferId: operatorTransfer.id,
      idempotencyKey: `operator-cancel:${randomUUID()}`,
      auditActor: { actorType: "operator", actorId: "demo_ops_analyst_001" },
      auditReason: "Customer requested cancellation before capture.",
    });

    const providerTransfer = await createTransfer(runtime, "provider");
    const providerEvent: ProviderEvent = Object.freeze({
      provider: "CALIZA",
      providerEventId: `provider-webhook:${randomUUID()}`,
      transferId: providerTransfer.id,
      kind: "CALIZA_ACCEPTED",
      occurredAt: new Date().toISOString(),
      payload: Object.freeze({ assurance: "true" }),
    });
    await runtime.service.ingestProviderEvent(providerEvent);

    const evidence = await context.query().query<{
      actor_type: string;
      actor_id: string;
      action: string;
      correlation_id: string;
    }>(
      `SELECT actor_type::text, actor_id, action, correlation_id
       FROM samra_core.audit_events
       WHERE correlation_id = ANY($1::text[])
       ORDER BY occurred_at, id`,
      [[workerTransfer.id, operatorTransfer.id, providerTransfer.id]],
    );
    assertAuditActor(
      evidence.rows,
      workerTransfer.id,
      "customer",
      "demo_customer_001",
      "ledger_hold_reserved",
    );
    assertAuditActor(
      evidence.rows,
      workerTransfer.id,
      "system",
      "assurance-worker",
      "ledger_hold_captured",
    );
    assertAuditActor(
      evidence.rows,
      operatorTransfer.id,
      "operator",
      "demo_ops_analyst_001",
      "ledger_hold_released",
    );
    assertAuditActor(
      evidence.rows,
      providerTransfer.id,
      "provider",
      "caliza",
      "provider_event_recorded",
    );
    assertAuditActor(
      evidence.rows,
      providerTransfer.id,
      "provider",
      "caliza",
      "ledger_hold_captured",
    );
  });
});

test("CLAUDE-LED-047 A completed transfer is fully reconstructible from the audit trail", async () => {
  await withinRollback(async () => {
    const runtime = createRuntime();
    const transfer = await createTransfer(runtime, "reconstruction");
    for (let step = 0; step < 4; step += 1) {
      const current = await runtime.service.getTransfer(
        "demo_customer_001",
        transfer.id,
      );
      if (current.state === "COMPLETED") break;
      await runtime.service.selectAndAdvanceFakeScenario(
        "demo_customer_001",
        transfer.id,
        "HAPPY_PATH",
        { actorType: "system", actorId: "reconstruction-worker" },
      );
    }
    assert.equal(
      (await runtime.service.getTransfer("demo_customer_001", transfer.id))
        .state,
      "COMPLETED",
    );

    const sourceCounts = await context.query().query<{
      journals: string;
      hold_events: string;
      statuses: string;
      provider_events: string;
    }>(
      `SELECT
         (SELECT count(*) FROM samra_core.ledger_journals
          WHERE business_event_id = $1)::text AS journals,
         (SELECT count(*) FROM samra_core.ledger_hold_events e
          JOIN samra_core.ledger_holds h ON h.id = e.hold_id
          WHERE h.business_event_id = $1)::text AS hold_events,
         (SELECT count(*) FROM samra_core.remittance_transfer_status_history s
          JOIN samra_core.remittance_transfers t ON t.id = s.transfer_id
          WHERE t.external_ref = $1)::text AS statuses,
         (SELECT count(*) FROM samra_core.provider_events e
          JOIN samra_core.remittance_transfers t ON t.id = e.related_resource_id
          WHERE t.external_ref = $1)::text AS provider_events`,
      [transfer.id],
    );
    const audit = await context.query().query<{
      action: string;
      actor_type: string;
      entity_type: string;
      entity_id: string;
      correlation_id: string;
      metadata: Record<string, unknown>;
      occurred_at: Date;
    }>(
      `SELECT action, actor_type::text, entity_type, entity_id,
              correlation_id, metadata, occurred_at
       FROM samra_core.audit_events
       WHERE correlation_id = $1
       ORDER BY occurred_at, id`,
      [transfer.id],
    );
    const counts = countActions(audit.rows);
    assert.equal(
      counts["ledger_journal_posted"],
      Number(sourceCounts.rows[0]!.journals),
    );
    assert.equal(
      (counts["ledger_hold_reserved"] ?? 0) +
        (counts["ledger_hold_captured"] ?? 0),
      Number(sourceCounts.rows[0]!.hold_events),
    );
    assert.equal(
      counts["transfer_status_changed"],
      Number(sourceCounts.rows[0]!.statuses),
    );
    assert.equal(
      counts["provider_event_recorded"],
      Number(sourceCounts.rows[0]!.provider_events),
    );
    assert.ok(
      audit.rows.every((event) => event.correlation_id === transfer.id),
    );
    assert.ok(
      audit.rows.every(
        (event, index) =>
          index === 0 ||
          event.occurred_at.getTime() >=
            audit.rows[index - 1]!.occurred_at.getTime(),
      ),
    );
    const terminal = audit.rows.filter(
      (event) =>
        event.action === "transfer_status_changed" &&
        event.metadata["to"] === "COMPLETED",
    );
    assert.equal(terminal.length, 1);
  });
});

function createRuntime() {
  const operationsStore = new PostgresOperationsStore(context);
  return new DemoRuntime({
    repository: new PostgresRemittanceRepository(context),
    ledger: new PostgresLedgerControl(context),
    unitOfWork: context,
    operationsStore,
    ids: new RandomIdGenerator(),
  });
}

async function createTransfer(runtime: DemoRuntime, label: string) {
  const quote = await runtime.service.createQuote({
    actorId: "demo_customer_001",
    sourceAccountId: "demo_usd_account_001",
    beneficiaryId: "beneficiary_bank_001",
    sourceAmountMinor: 1_000n,
    fundingMethod: "samra_balance",
    deliveryMethod: "bank",
  });
  return runtime.service.createTransfer({
    actorId: "demo_customer_001",
    quoteId: quote.id,
    idempotencyKey: `audit-${label}:${randomUUID()}`,
  });
}

function assertAuditActor(
  events: readonly Readonly<{
    actor_type: string;
    actor_id: string;
    action: string;
    correlation_id: string;
  }>[],
  transferId: string,
  actorType: string,
  actorId: string,
  action: string,
) {
  assert.ok(
    events.some(
      (event) =>
        event.correlation_id === transferId &&
        event.actor_type === actorType &&
        event.actor_id === actorId &&
        event.action === action,
    ),
    `Missing ${actorType}:${actorId} ${action} audit for ${transferId}`,
  );
}

function countActions(events: readonly Readonly<{ action: string }>[]) {
  return events.reduce<Record<string, number>>((counts, event) => {
    counts[event.action] = (counts[event.action] ?? 0) + 1;
    return counts;
  }, {});
}

async function databaseRejection(
  savepoint: string,
  sql: string,
  parameters: readonly unknown[],
  message: RegExp,
) {
  await context.query().query(`SAVEPOINT ${savepoint}`);
  await assert.rejects(
    context.query().query(sql, [...parameters]),
    postgresError("55000", message),
  );
  await context.query().query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
}

function postgresError(code: string, message: RegExp) {
  return (error: unknown): boolean => {
    assert.ok(error instanceof Error);
    assert.equal((error as Error & { code?: string }).code, code);
    assert.match(error.message, message);
    return true;
  };
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
