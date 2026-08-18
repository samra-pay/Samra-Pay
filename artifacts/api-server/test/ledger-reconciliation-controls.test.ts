import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  PostgresOperationsStore,
  PostgresPersistenceContext,
  createDatabase,
} from "@workspace/db";
import { PostgresReconciliationStore } from "../src/domain/postgres-reconciliation";

const connectionString = process.env["TEST_DATABASE_URL"];
if (!connectionString) {
  throw new Error(
    "TEST_DATABASE_URL is required for PostgreSQL reconciliation control tests.",
  );
}

const connections: ReturnType<typeof createDatabase>[] = [];

function createOperationsStore() {
  const connection = createDatabase({ connectionString });
  connections.push(connection);
  const context = new PostgresPersistenceContext(connection.pool);
  return {
    connection,
    operations: new PostgresOperationsStore(context),
    reconciliation: new PostgresReconciliationStore(context),
  };
}

test.after(async () => {
  await Promise.all(connections.map((connection) => connection.pool.end()));
});

test("CLAUDE-LED-052 Reconciliation exceptions are never silently adjusted", async () => {
  const first = createOperationsStore();
  const runRef = `recon_control_${randomUUID()}`;
  const matchKey = `match:${randomUUID()}`;
  const reason =
    "Provider settlement evidence confirmed a one-dollar control variance.";
  const operatorId = "demo_ops_admin_001";
  const idempotencyKey = `resolve:${randomUUID()}`;

  const startedAt = new Date().toISOString();
  const completedAt = new Date(Date.parse(startedAt) + 1).toISOString();
  const reconciliationRun = {
    id: runRef,
    status: "completed" as const,
    provider: "caliza" as const,
    startedAt,
    completedAt,
    items: [
      {
        id: `recon_item_${matchKey}`,
        matchKey,
        classification: "amount_mismatch" as const,
        internalAmount: { currency: "USD" as const, minorUnits: "10000" },
        externalAmount: { currency: "USD" as const, minorUnits: "10100" },
      },
    ],
  };
  await first.reconciliation.save(reconciliationRun);
  await first.reconciliation.save(reconciliationRun);
  await assert.rejects(
    first.reconciliation.save({
      ...reconciliationRun,
      items: [
        {
          ...reconciliationRun.items[0]!,
          externalAmount: { currency: "USD", minorUnits: "10200" },
        },
      ],
    }),
    /already exists with different evidence/,
  );

  const fixture = await first.connection.pool.query<{
    exception_id: string;
    item_id: string;
  }>(
    `SELECT exception.id AS exception_id, item.id AS item_id
     FROM samra_core.reconciliation_exceptions exception
     JOIN samra_core.reconciliation_items item ON item.id = exception.item_id
     JOIN samra_core.reconciliation_runs run ON run.id = item.run_id
     WHERE run.external_ref = $1 AND item.match_key = $2`,
    [runRef, matchKey],
  );
  const exceptionId = fixture.rows[0]!.exception_id;
  const itemId = fixture.rows[0]!.item_id;

  const open = await first.operations.listReconciliationExceptions(200);
  assert.equal(open.find((entry) => entry.id === exceptionId)?.state, "open");

  await assert.rejects(
    first.connection.pool.query(
      `UPDATE samra_core.reconciliation_items
       SET internal_amount_minor = provider_amount_minor WHERE id = $1`,
      [itemId],
    ),
    /evidence is immutable/,
  );
  await assert.rejects(
    first.connection.pool.query(
      `UPDATE samra_core.reconciliation_exceptions
       SET state = 'ignored', resolved_at = now() WHERE id = $1`,
      [exceptionId],
    ),
    /controlled decision workflow/,
  );

  const command = {
    exceptionId,
    operatorId,
    reason,
    idempotencyKey,
  } as const;
  const [resolvedA, resolvedB] = await Promise.all([
    first.operations.resolveReconciliationException(command),
    first.operations.resolveReconciliationException(command),
  ]);
  assert.deepEqual(resolvedB, resolvedA);
  assert.equal(resolvedA.state, "resolved");
  assert.equal(resolvedA.resolvedBy, operatorId);
  assert.equal(resolvedA.resolutionNote, reason);
  assert.ok(resolvedA.resolutionJournalId);
  assert.ok(resolvedA.resolvedAt);

  await assert.rejects(
    first.operations.resolveReconciliationException({
      ...command,
      reason: "A different operator decision must never replay this command.",
    }),
    /already resolved with different evidence/,
  );

  const evidence = await first.connection.pool.query<{
    internal_amount_minor: string;
    provider_amount_minor: string;
    exception_state: string;
    assigned_to: string;
    resolved_by: string;
    resolution_note: string;
    resolution_journal_id: string;
    journal_state: string;
    journal_operator: string;
    journal_reason: string;
    debit_minor: string;
    credit_minor: string;
    posting_count: string;
    posting_shape: string;
    event_count: string;
    event_actor: string;
    event_decision: string;
    event_reason: string;
    audit_count: string;
  }>(
    `SELECT i.internal_amount_minor::text,
            i.provider_amount_minor::text,
            e.state::text AS exception_state,
            e.assigned_to, e.resolved_by, e.resolution_note,
            e.resolution_journal_id,
            j.state::text AS journal_state,
            j.metadata->>'operatorId' AS journal_operator,
            j.metadata->>'reason' AS journal_reason,
            (SELECT sum(p.amount_minor)::text
             FROM samra_core.ledger_postings p
             WHERE p.journal_id = j.id AND p.side = 'debit') AS debit_minor,
            (SELECT sum(p.amount_minor)::text
             FROM samra_core.ledger_postings p
             WHERE p.journal_id = j.id AND p.side = 'credit') AS credit_minor,
            (SELECT count(*)::text FROM samra_core.ledger_postings p
             WHERE p.journal_id = j.id) AS posting_count,
            (SELECT string_agg(account.code || ':' || p.side::text || ':' ||
                               p.amount_minor::text, ',' ORDER BY p.sequence)
             FROM samra_core.ledger_postings p
             JOIN samra_core.ledger_accounts account ON account.id = p.account_id
             WHERE p.journal_id = j.id) AS posting_shape,
            (SELECT count(*)::text
             FROM samra_core.reconciliation_exception_events event
             WHERE event.exception_id = e.id) AS event_count,
            event.actor_id AS event_actor,
            event.decision AS event_decision,
            event.reason AS event_reason,
            (SELECT count(*)::text FROM samra_core.audit_events audit
             WHERE audit.entity_type = 'reconciliation_exception'
               AND audit.entity_id = e.id::text
               AND audit.actor_type = 'operator'
               AND audit.actor_id = $2
               AND audit.action =
                 'reconciliation_exception_resolved_with_journal') AS audit_count
     FROM samra_core.reconciliation_exceptions e
     JOIN samra_core.reconciliation_items i ON i.id = e.item_id
     JOIN samra_core.ledger_journals j ON j.id = e.resolution_journal_id
     JOIN samra_core.reconciliation_exception_events event
       ON event.exception_id = e.id
     WHERE e.id = $1`,
    [exceptionId, operatorId],
  );
  assert.deepEqual(evidence.rows[0], {
    internal_amount_minor: "10000",
    provider_amount_minor: "10100",
    exception_state: "resolved",
    assigned_to: operatorId,
    resolved_by: operatorId,
    resolution_note: reason,
    resolution_journal_id: resolvedA.resolutionJournalId,
    journal_state: "posted",
    journal_operator: operatorId,
    journal_reason: reason,
    debit_minor: "100",
    credit_minor: "100",
    posting_count: "2",
    posting_shape:
      "asset_reconciliation_suspense_usd:debit:100,control_rain_usd:credit:100",
    event_count: "1",
    event_actor: operatorId,
    event_decision: "resolved_with_journal",
    event_reason: reason,
    audit_count: "1",
  });

  const posting = await first.connection.pool.query<{ id: string }>(
    `SELECT id FROM samra_core.ledger_postings
     WHERE journal_id = $1 ORDER BY sequence LIMIT 1`,
    [resolvedA.resolutionJournalId],
  );
  const resolutionEvent = await first.connection.pool.query<{ id: string }>(
    `SELECT id FROM samra_core.reconciliation_exception_events
     WHERE exception_id = $1`,
    [exceptionId],
  );
  await assert.rejects(
    first.connection.pool.query(
      `UPDATE samra_core.ledger_postings SET amount_minor = 1 WHERE id = $1`,
      [posting.rows[0]!.id],
    ),
    /immutable after posting/,
  );
  await assert.rejects(
    first.connection.pool.query(
      `UPDATE samra_core.reconciliation_exceptions
       SET resolution_note = 'tampered resolution reason' WHERE id = $1`,
      [exceptionId],
    ),
    /terminal and immutable/,
  );
  await assert.rejects(
    first.connection.pool.query(
      `DELETE FROM samra_core.reconciliation_exception_events WHERE id = $1`,
      [resolutionEvent.rows[0]!.id],
    ),
    /append-only/,
  );

  const restarted = createOperationsStore();
  const durable = await restarted.operations.listReconciliationExceptions(200);
  assert.deepEqual(
    durable.find((entry) => entry.id === exceptionId),
    resolvedA,
  );
  assert.deepEqual(
    await restarted.operations.resolveReconciliationException(command),
    resolvedA,
  );
});
