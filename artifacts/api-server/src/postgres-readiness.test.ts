import assert from "node:assert/strict";
import test from "node:test";
import { assertPostgresRuntimeReady } from "@workspace/db";

type ReadinessPool = Parameters<typeof assertPostgresRuntimeReady>[0];

test("PostgreSQL readiness checks required relations without writing", async () => {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const pool = {
    async query(sql: string, values: unknown[]) {
      calls.push({ sql, values });
      return { rows: [] };
    },
  } as unknown as ReadinessPool;

  await assertPostgresRuntimeReady(pool);
  assert.equal(calls.length, 1);
  assert.match(calls[0]!.sql, /to_regclass/);
  assert.doesNotMatch(
    calls[0]!.sql,
    /\b(?:insert|update|delete|alter|drop)\b/i,
  );
  assert.deepEqual(calls[0]!.values, [
    [
      "samra_core.customers",
      "samra_core.customer_auth_identities",
      "samra_core.customer_onboardings",
      "samra_core.customer_onboarding_transitions",
      "samra_core.customer_consents",
      "samra_core.customer_identity_cases",
      "samra_core.customer_identity_case_transitions",
      "samra_core.customer_identity_provider_events",
      "samra_core.customer_acquisition_sessions",
      "samra_core.customer_acquisition_events",
      "samra_core.customer_acquisition_links",
      "samra_core.ledger_journals",
      "samra_core.ledger_account_balances",
      "samra_core.remittance_transfers",
      "samra_core.remittance_workflow_work",
      "samra_core.audit_events",
      "samra_core.reconciliation_exceptions",
      "samra_core.operations_cases",
      "samra_core.workforce_users",
    ],
  ]);
});

test("PostgreSQL readiness rejects an incomplete migrated schema", async () => {
  const pool = {
    async query() {
      return {
        rows: [{ relation_name: "samra_core.ledger_account_balances" }],
      };
    },
  } as unknown as ReadinessPool;

  await assert.rejects(
    assertPostgresRuntimeReady(pool),
    /schema is not ready; 1 required relation\(s\) are missing/,
  );
});
