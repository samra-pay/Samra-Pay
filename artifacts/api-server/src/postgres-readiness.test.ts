import assert from "node:assert/strict";
import test from "node:test";
import { assertPostgresRuntimeReady } from "@workspace/db";
import { loadApiRuntimeConfig } from "./config";
import { requiresCustomerWalletControlSchema } from "./domain/create-demo-runtime";

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
      "samra_core.customer_wallets",
      "samra_core.customer_wallet_provider_mappings",
      "samra_core.customer_wallet_transitions",
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

test("fake-provider shared Dev/Test rejects schema through 0020 and accepts current wallet controls", async () => {
  for (const deployment of ["dev", "test"] as const) {
    const config = loadApiRuntimeConfig({
      NODE_ENV: "production",
      SAMRA_RELEASE_PROFILE: "synthetic-shared",
      SAMRA_DEPLOYMENT_ENVIRONMENT: deployment,
      GOOGLE_CLOUD_PROJECT: `samra-pay-${deployment}`,
      SAMRA_ALLOWED_ORIGINS: `https://${deployment}.example.test`,
      SAMRA_BACKEND_MODE: "demo",
      SAMRA_PROVIDER_MODE: "fake",
      SAMRA_PERSISTENCE_MODE: "postgres",
      SAMRA_CUSTOMER_AUTH_MODE: "auth0",
      AUTH0_ISSUER_BASE_URL: `https://auth.${deployment}.example.test`,
      AUTH0_AUDIENCE:
        deployment === "dev"
          ? "https://api.samrapay.com/development"
          : "https://api.samrapay.com/test",
      SAMRA_CUSTOMER_IDENTITY_PROVIDER_MODE: "fake",
      SAMRA_CUSTOMER_WALLET_PROVIDER_MODE: "fake",
      SAMRA_RUN_WORKER: "true",
      SAMRA_INTERNAL_OPERATIONS_ENABLED: "false",
    });
    assert.deepEqual(config.customerWalletProvider, { mode: "fake" });
    assert.equal(requiresCustomerWalletControlSchema(config), true);

    for (const walletControlsReady of [false, true]) {
      let calls = 0;
      const statements: string[] = [];
      const pool = {
        async query(sql: string) {
          statements.push(sql);
          calls++;
          if (calls === 1) return { rows: [] };
          if (calls === 2) return { rows: [{ ready: true }] };
          return { rows: [{ ready: walletControlsReady }] };
        },
      } as unknown as ReadinessPool;

      const readiness = assertPostgresRuntimeReady(pool, {
        alphaReleaseAdmission: true,
        customerWalletControls: requiresCustomerWalletControlSchema(config),
      });
      if (walletControlsReady) await readiness;
      else {
        await assert.rejects(
          readiness,
          /customer wallet control migration is not ready/,
        );
      }
      assert.equal(calls, 3);
      assert.match(statements[2]!, /customer_wallets_controlled_mutation/);
      assert.match(statements[2]!, /customer_control_setup/);
      assert.match(statements[2]!, /wallet_control_setup/);
    }
  }
});
