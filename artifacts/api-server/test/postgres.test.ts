import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  PostgresLedgerControl,
  PostgresPersistenceContext,
  PostgresRemittanceRepository,
  PostgresOperationsStore,
  RandomIdGenerator,
  createDatabase,
} from "@workspace/db";
import { DemoRuntime } from "../src/domain/demo-runtime";
import { PostgresReconciliationStore } from "../src/domain/postgres-reconciliation";

const connectionString = process.env["TEST_DATABASE_URL"];
if (!connectionString) {
  throw new Error(
    "TEST_DATABASE_URL is required for PostgreSQL acceptance tests.",
  );
}

const connections: ReturnType<typeof createDatabase>[] = [];

function createRuntime() {
  const connection = createDatabase({ connectionString });
  connections.push(connection);
  const context = new PostgresPersistenceContext(connection.pool);
  const operationsStore = new PostgresOperationsStore(context);
  return {
    connection,
    context,
    runtime: new DemoRuntime({
      repository: new PostgresRemittanceRepository(context),
      ledger: new PostgresLedgerControl(context),
      unitOfWork: context,
      reconciliationStore: new PostgresReconciliationStore(context),
      operationsStore,
      ids: new RandomIdGenerator(),
      nextReconciliationId: () => `recon_run_${randomUUID()}`,
    }),
    operationsStore,
  };
}

test.after(async () => {
  await Promise.all(connections.map((connection) => connection.pool.end()));
});

test("PostgreSQL is the durable source of truth across atomicity, concurrency, restart, ledger, refund, and reconciliation", async () => {
  const first = createRuntime();

  const failedQuote = await first.runtime.service.createQuote({
    actorId: "demo_customer_001",
    sourceAccountId: "demo_usd_account_001",
    beneficiaryId: "beneficiary_bank_001",
    sourceAmountMinor: 1_000n,
    fundingMethod: "samra_balance",
    deliveryMethod: "bank",
  });
  const providers = first.runtime.providers as unknown as {
    submitTransfer: (...args: unknown[]) => Promise<never>;
  };
  const originalSubmit = first.runtime.providers.submitTransfer.bind(
    first.runtime.providers,
  );
  providers.submitTransfer = async () => {
    throw new Error("synthetic provider failure");
  };
  await assert.rejects(
    first.runtime.service.createTransfer({
      actorId: "demo_customer_001",
      quoteId: failedQuote.id,
      idempotencyKey: "atomic-rollback-key",
    }),
    /synthetic provider failure/,
  );
  providers.submitTransfer = originalSubmit as typeof providers.submitTransfer;
  const rolledBack = await first.connection.pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM samra_core.ledger_holds
     WHERE business_event_id LIKE 'transfer_%'`,
  );
  assert.equal(rolledBack.rows[0]!.count, "0");
  assert.equal(
    await first.runtime.service.quoteStatus(failedQuote.id),
    "active",
  );

  const quote = await first.runtime.service.createQuote({
    actorId: "demo_customer_001",
    sourceAccountId: "demo_usd_account_001",
    beneficiaryId: "beneficiary_bank_001",
    sourceAmountMinor: 10_000n,
    fundingMethod: "samra_balance",
    deliveryMethod: "bank",
  });
  assert.equal(quote.feeAmount.amountMinor, 300n);
  assert.equal(quote.recipientAmount.amountMinor, 1_800_000n);

  const second = createRuntime();
  const [createdA, createdB] = await Promise.all([
    first.runtime.service.createTransfer({
      actorId: "demo_customer_001",
      quoteId: quote.id,
      idempotencyKey: "concurrent-create-key",
    }),
    second.runtime.service.createTransfer({
      actorId: "demo_customer_001",
      quoteId: quote.id,
      idempotencyKey: "concurrent-create-key",
    }),
  ]);
  assert.equal(createdA.id, createdB.id);
  const oneTransfer = await first.connection.pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM samra_core.remittance_transfers
     WHERE quote_id = (SELECT id FROM samra_core.remittance_quotes WHERE external_ref = $1)`,
    [quote.id],
  );
  assert.equal(oneTransfer.rows[0]!.count, "1");

  const heldBalance = await first.runtime.accountResponse();
  assert.equal(heldBalance.bookBalance.minorUnits, "425000");
  assert.equal(heldBalance.availableBalance.minorUnits, "414700");

  const restarted = createRuntime();
  const recovered = await restarted.runtime.service.getTransfer(
    "demo_customer_001",
    createdA.id,
  );
  assert.equal(recovered.state, "SUBMITTED");
  assert.equal(recovered.quote.debitAmount.amountMinor, 10_300n);
  await advanceUntil(restarted.runtime, createdA.id, "COMPLETED");
  const completedBalance = await restarted.runtime.accountResponse();
  assert.equal(completedBalance.bookBalance.minorUnits, "414700");
  assert.equal(completedBalance.availableBalance.minorUnits, "414700");

  const reconciliation = await restarted.runtime.runReconciliation(
    "demo_customer_001",
    "happy_path",
  );
  assert.equal(reconciliation.items.length, 1);
  assert.equal(reconciliation.items[0]!.classification, "matched");
  const afterReconRestart = createRuntime();
  assert.deepEqual(
    await afterReconRestart.runtime.getReconciliation(reconciliation.id),
    reconciliation,
  );

  const beforeRefund = await afterReconRestart.runtime.accountResponse();
  const refundQuote = await afterReconRestart.runtime.service.createQuote({
    actorId: "demo_customer_001",
    sourceAccountId: "demo_usd_account_001",
    beneficiaryId: "beneficiary_wallet_001",
    sourceAmountMinor: 5_000n,
    fundingMethod: "samra_balance",
    deliveryMethod: "wallet",
  });
  const refundTransfer = await afterReconRestart.runtime.service.createTransfer(
    {
      actorId: "demo_customer_001",
      quoteId: refundQuote.id,
      idempotencyKey: "settlement-refund-key",
    },
  );
  await afterReconRestart.runtime.service.selectAndAdvanceFakeScenario(
    "demo_customer_001",
    refundTransfer.id,
    "SETTLEMENT_REFUND",
  );
  await advanceUntil(afterReconRestart.runtime, refundTransfer.id, "REVERSED");
  const afterRefund = await afterReconRestart.runtime.accountResponse();
  assert.deepEqual(afterRefund, beforeRefund);

  const accounting = await first.connection.pool.query<{
    unbalanced: string;
    duplicate_reversals: string;
    duplicate_commands: string;
    outbox_count: string;
    audit_count: string;
  }>(
    `SELECT
       (SELECT count(*) FROM (
          SELECT j.id FROM samra_core.ledger_journals j
          JOIN samra_core.ledger_postings p ON p.journal_id = j.id
          GROUP BY j.id
          HAVING sum(CASE WHEN p.side='debit' THEN p.amount_minor ELSE 0 END)
              <> sum(CASE WHEN p.side='credit' THEN p.amount_minor ELSE 0 END)
        ) x)::text AS unbalanced,
       (SELECT count(*) FROM (
          SELECT reverses_journal_id FROM samra_core.ledger_journals
          WHERE reverses_journal_id IS NOT NULL GROUP BY reverses_journal_id HAVING count(*) > 1
        ) x)::text AS duplicate_reversals,
       (SELECT count(*) FROM (
          SELECT command_key FROM samra_core.provider_command_attempts
          GROUP BY command_key HAVING count(*) > 1
        ) x)::text AS duplicate_commands,
       (SELECT count(*) FROM samra_core.outbox_events)::text AS outbox_count,
       (SELECT count(*) FROM samra_core.audit_events)::text AS audit_count`,
  );
  assert.equal(accounting.rows[0]!.unbalanced, "0");
  assert.equal(accounting.rows[0]!.duplicate_reversals, "0");
  assert.equal(accounting.rows[0]!.duplicate_commands, "0");
  assert.ok(Number(accounting.rows[0]!.outbox_count) > 0);
  assert.ok(Number(accounting.rows[0]!.audit_count) > 0);
});

test("durable workers claim once across processes and resume timeout retries after restart", async () => {
  const first = createRuntime();
  const second = createRuntime();
  const quote = await first.runtime.service.createQuote({
    actorId: "demo_customer_001",
    sourceAccountId: "demo_usd_account_001",
    beneficiaryId: "beneficiary_bank_001",
    sourceAmountMinor: 2_000n,
    fundingMethod: "samra_balance",
    deliveryMethod: "bank",
  });
  const transfer = await first.runtime.service.createTransfer({
    actorId: "demo_customer_001",
    quoteId: quote.id,
    idempotencyKey: "durable-worker-concurrency-key",
  });

  await Promise.all([
    first.runtime.advanceWorkerBatch(1),
    second.runtime.advanceWorkerBatch(1),
  ]);
  const advancedOnce = await first.runtime.service.getTransfer(
    "demo_customer_001",
    transfer.id,
  );
  assert.equal(advancedOnce.state, "IN_TRANSIT");

  const timeoutQuote = await first.runtime.service.createQuote({
    actorId: "demo_customer_001",
    sourceAccountId: "demo_usd_account_001",
    beneficiaryId: "beneficiary_bank_001",
    sourceAmountMinor: 2_500n,
    fundingMethod: "samra_balance",
    deliveryMethod: "bank",
  });
  const timeoutTransfer = await first.runtime.service.createTransfer({
    actorId: "demo_customer_001",
    quoteId: timeoutQuote.id,
    idempotencyKey: "durable-timeout-restart-key",
  });
  await first.runtime.repository.saveFakeScenario(
    timeoutTransfer.id,
    "TIMEOUT_RETRY",
  );
  await first.runtime.advanceWorkerBatch(1);
  assert.equal(
    (
      await first.runtime.service.getTransfer(
        "demo_customer_001",
        timeoutTransfer.id,
      )
    ).state,
    "SUBMITTED",
  );

  await new Promise((resolve) => setTimeout(resolve, 120));
  const restarted = createRuntime();
  await restarted.runtime.advanceWorkerBatch(2);
  assert.equal(
    (
      await restarted.runtime.service.getTransfer(
        "demo_customer_001",
        timeoutTransfer.id,
      )
    ).state,
    "IN_TRANSIT",
  );
  await advanceUntil(restarted.runtime, transfer.id, "COMPLETED");
  await advanceUntil(restarted.runtime, timeoutTransfer.id, "COMPLETED");
});

test("expired leases recover, retry exhaustion becomes operator-visible, and audit rows are immutable", async () => {
  const first = createRuntime();
  const quote = await first.runtime.service.createQuote({
    actorId: "demo_customer_001",
    sourceAccountId: "demo_usd_account_001",
    beneficiaryId: "beneficiary_bank_001",
    sourceAmountMinor: 1_500n,
    fundingMethod: "samra_balance",
    deliveryMethod: "bank",
  });
  const transfer = await first.runtime.service.createTransfer({
    actorId: "demo_customer_001",
    quoteId: quote.id,
    idempotencyKey: "expired-lease-recovery-key",
  });
  const start = new Date("2026-08-16T00:00:00.000Z");
  const abandoned = await first.operationsStore.claimWorkflowBatch({
    workerId: "dead-worker",
    limit: 1,
    now: start,
    leaseMilliseconds: 30_000,
  });
  assert.equal(abandoned.length, 1);
  const beforeExpiry = await first.operationsStore.claimWorkflowBatch({
    workerId: "replacement-worker",
    limit: 1,
    now: new Date(start.getTime() + 1_000),
    leaseMilliseconds: 30_000,
  });
  assert.equal(beforeExpiry.length, 0);
  const recovered = await first.operationsStore.claimWorkflowBatch({
    workerId: "replacement-worker",
    limit: 1,
    now: new Date(start.getTime() + 31_000),
    leaseMilliseconds: 30_000,
  });
  assert.equal(recovered.length, 1);
  assert.equal(recovered[0]!.transferId, transfer.id);
  assert.equal(recovered[0]!.attemptCount, 2);
  await first.operationsStore.settleWorkflowClaim({
    claimId: recovered[0]!.id,
    workerId: "replacement-worker",
    transferVersion: recovered[0]!.transferVersion,
    actionable: true,
    progressed: false,
    retryAt: new Date(start.getTime() + 31_001),
  });

  for (let attempt = 3; attempt <= 5; attempt += 1) {
    const now = new Date(start.getTime() + 40_000 + attempt * 1_000);
    const [claim] = await first.operationsStore.claimWorkflowBatch({
      workerId: "failing-worker",
      limit: 1,
      now,
      leaseMilliseconds: 30_000,
    });
    assert.ok(claim);
    await first.operationsStore.failWorkflowClaim({
      claimId: claim.id,
      workerId: "failing-worker",
      error: "deterministic worker failure",
      retryAt: new Date(now.getTime() + 1),
    });
  }
  const summary = await first.operationsStore.operationsSummary();
  assert.ok((summary.workflow["failed"] ?? 0) >= 1);
  const exhausted = await first.operationsStore.claimWorkflowBatch({
    workerId: "late-worker",
    limit: 10,
    now: new Date(start.getTime() + 120_000),
    leaseMilliseconds: 30_000,
  });
  assert.equal(
    exhausted.some((claim) => claim.transferId === transfer.id),
    false,
  );

  const auditKey = `append-only-${randomUUID()}`;
  await first.operationsStore.recordAudit({
    eventKey: auditKey,
    actorType: "operator",
    actorId: "demo_cs_agent_001",
    action: "test_append_only",
    entityType: "test",
    entityId: transfer.id,
  });
  await assert.rejects(
    first.connection.pool.query(
      `UPDATE samra_core.audit_events SET action = 'tampered' WHERE event_key = $1`,
      [auditKey],
    ),
    /append-only/,
  );
});

async function advanceUntil(
  runtime: DemoRuntime,
  transferId: string,
  expected: "COMPLETED" | "REVERSED",
) {
  for (let iteration = 0; iteration < 8; iteration += 1) {
    const transfer = await runtime.service.getTransfer(
      "demo_customer_001",
      transferId,
    );
    if (transfer.state === expected) return transfer;
    await runtime.advanceWorkerBatch();
  }
  const transfer = await runtime.service.getTransfer(
    "demo_customer_001",
    transferId,
  );
  assert.equal(transfer.state, expected);
  return transfer;
}
