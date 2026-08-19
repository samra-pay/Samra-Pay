import type pg from "pg";

const REQUIRED_RUNTIME_RELATIONS = Object.freeze([
  "samra_core.customers",
  "samra_core.customer_auth_identities",
  "samra_core.customer_onboardings",
  "samra_core.customer_onboarding_transitions",
  "samra_core.customer_consents",
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
): Promise<void> {
  const result = await pool.query<{ relation_name: string }>(
    `SELECT relation_name
       FROM unnest($1::text[]) AS required(relation_name)
      WHERE to_regclass(relation_name) IS NULL
      ORDER BY relation_name`,
    [REQUIRED_RUNTIME_RELATIONS],
  );
  if (result.rows.length > 0) {
    throw new Error(
      `PostgreSQL schema is not ready; ${result.rows.length} required relation(s) are missing.`,
    );
  }
}
