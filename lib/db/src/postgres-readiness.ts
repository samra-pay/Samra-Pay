import type pg from "pg";

const REQUIRED_RUNTIME_RELATIONS = Object.freeze([
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
]);

type ReadinessQueryable = Pick<pg.Pool, "query">;

/**
 * Verifies both connectivity and the minimum migrated schema required by the
 * compiled API. It never migrates, seeds, or changes database state.
 */
export async function assertPostgresRuntimeReady(
  pool: ReadinessQueryable,
  options: Readonly<{
    customerControlledSandboxWallets?: boolean;
    alphaReleaseAdmission?: boolean;
  }> = {},
): Promise<void> {
  const result = await pool.query<{ relation_name: string }>(
    `SELECT relation_name
       FROM unnest($1::text[]) AS required(relation_name)
      WHERE to_regclass(relation_name) IS NULL
      ORDER BY relation_name`,
    [
      [
        ...REQUIRED_RUNTIME_RELATIONS,
        ...(options.alphaReleaseAdmission
          ? [
              "samra_core.alpha_release_controls",
              "samra_core.alpha_invitations",
              "samra_core.alpha_admissions",
            ]
          : []),
      ],
    ],
  );
  if (result.rows.length > 0) {
    throw new Error(
      `PostgreSQL schema is not ready; ${result.rows.length} required relation(s) are missing.`,
    );
  }
  if (options.alphaReleaseAdmission) {
    const guards = await pool.query<{ ready: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM samra_core.alpha_release_controls
                       WHERE release_id = 'alpha-release-1') AND
         EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgrelid = 'samra_core.alpha_admissions'::regclass
                    AND tgname = 'alpha_admission_immutability_guard'
                    AND tgenabled = 'O' AND NOT tgisinternal) AND
         EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgrelid = 'samra_core.alpha_invitations'::regclass
                    AND tgname = 'alpha_invitation_identity_guard'
                    AND tgenabled = 'O' AND NOT tgisinternal) AS ready`,
    );
    if (guards.rows[0]?.ready !== true)
      throw new Error("PostgreSQL alpha admission migration is not ready.");
  }
  if (options.customerControlledSandboxWallets) {
    const guards = await pool.query<{ ready: boolean }>(
      `SELECT EXISTS (
       SELECT 1 FROM pg_trigger
          WHERE tgrelid = 'samra_core.customer_wallet_provider_mappings'::regclass
            AND tgname = 'customer_wallet_mapping_configuration_guard'
            AND tgenabled = 'O' AND NOT tgisinternal
       ) AND EXISTS (
         SELECT 1 FROM pg_trigger
          WHERE tgrelid = 'samra_core.customer_wallet_provider_mappings'::regclass
            AND tgname = 'customer_wallet_provider_mappings_append_only'
            AND tgenabled = 'O' AND NOT tgisinternal
       ) AND EXISTS (
         SELECT 1 FROM pg_trigger
          WHERE tgrelid = 'samra_core.customer_consents'::regclass
            AND tgname = 'customer_consents_append_only'
            AND tgenabled = 'O' AND NOT tgisinternal
       ) AND EXISTS (
         SELECT 1 FROM pg_trigger
          WHERE tgrelid = 'samra_core.customer_wallets'::regclass
            AND tgname = 'customer_wallets_controlled_mutation'
            AND tgenabled = 'O' AND NOT tgisinternal
            AND (tgtype::integer & 31) = 31
       ) AND EXISTS (
         SELECT 1 FROM pg_trigger
          WHERE tgrelid = 'samra_core.customer_onboardings'::regclass
            AND tgname = 'customer_onboardings_controlled_mutation'
            AND tgenabled = 'O' AND NOT tgisinternal
       ) AND EXISTS (
         SELECT 1 FROM pg_constraint
          WHERE conrelid = 'samra_core.customer_wallets'::regclass
            AND conname = 'customer_wallets_environment_chk' AND convalidated
            AND pg_get_constraintdef(oid) LIKE '%crossmint-sandbox-evm-customer-email-v1%'
       ) AND EXISTS (
         SELECT 1 FROM pg_constraint
          WHERE conrelid = 'samra_core.customer_wallets'::regclass
            AND conname = 'customer_wallets_state_chk' AND convalidated
            AND pg_get_constraintdef(oid) LIKE '%customer_control_setup%'
       ) AND EXISTS (
         SELECT 1 FROM pg_constraint
          WHERE conrelid = 'samra_core.customer_wallets'::regclass
            AND conname = 'customer_wallets_customer_control_setup_chk'
            AND convalidated
       ) AND EXISTS (
         SELECT 1 FROM pg_constraint
          WHERE conrelid = 'samra_core.customer_onboardings'::regclass
            AND conname = 'customer_onboardings_state_chk' AND convalidated
            AND pg_get_constraintdef(oid) LIKE '%wallet_control_setup%'
       ) AS ready`,
    );
    if (guards.rows[0]?.ready !== true) {
      throw new Error(
        "PostgreSQL customer-controlled sandbox wallet migration is not ready.",
      );
    }
  }
}
