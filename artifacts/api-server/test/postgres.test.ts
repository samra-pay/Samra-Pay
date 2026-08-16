import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  PostgresLedgerControl,
  PostgresPersistenceContext,
  PostgresRemittanceRepository,
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
  return {
    connection,
    context,
    runtime: new DemoRuntime({
      repository: new PostgresRemittanceRepository(context),
      ledger: new PostgresLedgerControl(context),
      unitOfWork: context,
      reconciliationStore: new PostgresReconciliationStore(context),
      ids: new RandomIdGenerator(),
      nextReconciliationId: () => `recon_run_${randomUUID()}`,
    }),
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
