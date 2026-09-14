import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import {
  ALPHA_ONBOARDING_CONSENT_BUNDLE,
  CUSTOMER_CONTROLLED_SANDBOX_DISCLOSURE,
  createDatabase,
  PostgresCustomerOnboardingStore,
  PostgresCustomerWalletStore,
  PostgresPersistenceContext,
} from "@workspace/db";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const connectionString = process.env["TEST_DATABASE_URL"];
if (!connectionString) {
  throw new Error("TEST_DATABASE_URL is required for migration compatibility.");
}
const sourceUrl = new URL(connectionString);
if (!new Set(["127.0.0.1", "localhost"]).has(sourceUrl.hostname)) {
  throw new Error(
    "Migration compatibility can run only against a local disposable PostgreSQL service.",
  );
}

const execFileAsync = promisify(execFile);
const workspaceRoot = fileURLToPath(new URL("../../../", import.meta.url));
const migrationFolder = join(workspaceRoot, "lib/db/drizzle");
const baselineMigrationCount = 8;

type MigrationJournal = {
  version: string;
  dialect: string;
  entries: { idx: number; tag: string }[];
};

function databaseUrl(database: string): string {
  const url = new URL(connectionString!);
  url.pathname = `/${database}`;
  return url.toString();
}

async function seed(url: string): Promise<void> {
  await execFileAsync(
    "pnpm",
    ["--filter", "@workspace/db", "run", "test:seed"],
    {
      cwd: workspaceRoot,
      env: { ...process.env, TEST_DATABASE_URL: url },
      maxBuffer: 4 * 1024 * 1024,
    },
  );
}

async function readAndValidateMigrationJournal(): Promise<MigrationJournal> {
  const journal = JSON.parse(
    await readFile(join(migrationFolder, "meta/_journal.json"), "utf8"),
  ) as MigrationJournal;
  assert.equal(journal.dialect, "postgresql");
  assert.ok(
    journal.entries.length > baselineMigrationCount,
    "Migration journal must extend beyond the fixed 0007 compatibility baseline.",
  );
  assert.deepEqual(
    journal.entries.map(({ idx }) => idx),
    journal.entries.map((_, idx) => idx),
    "Migration journal indexes must be contiguous from zero.",
  );
  const journalFiles = journal.entries.map(({ tag }) => `${tag}.sql`).sort();
  assert.equal(
    new Set(journalFiles).size,
    journalFiles.length,
    "Migration journal tags must be unique.",
  );
  const migrationFiles = (await readdir(migrationFolder))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  assert.deepEqual(
    migrationFiles,
    journalFiles,
    "Migration SQL files must match the migration journal exactly.",
  );
  return journal;
}

async function createMigrationFolder(
  journal: MigrationJournal,
  entryCount: number,
  label: string,
): Promise<string> {
  const folder = await mkdtemp(join(tmpdir(), `samra-migrations-${label}-`));
  await mkdir(join(folder, "meta"), { recursive: true });
  const entries = journal.entries.slice(0, entryCount);
  assert.equal(entries.length, entryCount);
  for (const entry of entries) {
    await copyFile(
      join(migrationFolder, `${entry.tag}.sql`),
      join(folder, `${entry.tag}.sql`),
    );
  }
  await writeFile(
    join(folder, "meta/_journal.json"),
    `${JSON.stringify({ ...journal, entries }, null, 2)}\n`,
    "utf8",
  );
  return folder;
}

async function insertLegacyReadyStagingWallet(
  target: ReturnType<typeof createDatabase>,
  options: Readonly<{
    includeMapping?: boolean;
    documentVersion?: string;
  }> = {},
): Promise<
  Readonly<{
    walletId: string;
    onboardingId: string;
    address: string;
    customerExternalRef: string;
    auth: Readonly<{ issuer: string; subject: string }>;
  }>
> {
  const customerExternalRef = `customer_${randomUUID().replaceAll("-", "")}`;
  const auth = Object.freeze({
    issuer: `https://${randomUUID()}.legacy-wallet.samra.test/`,
    subject: `auth0|${randomUUID()}`,
  });
  const customer = await target.pool.query<{ id: string }>(
    `INSERT INTO samra_core.customers
       (external_ref, display_name, country_code, state, metadata)
     VALUES ($1, NULL, NULL, 'active', '{"profileStatus":"pending"}'::jsonb)
     RETURNING id`,
    [customerExternalRef],
  );
  const customerId = customer.rows[0]!.id;
  await target.pool.query(
    `INSERT INTO samra_core.customer_auth_identities
       (customer_id, provider, issuer, subject)
     VALUES ($1, 'auth0', $2, $3)`,
    [customerId, auth.issuer, auth.subject],
  );
  const onboarding = await target.pool.query<{ id: string }>(
    `INSERT INTO samra_core.customer_onboardings
       (customer_id, state, latest_completed_step, reason_family, version)
     VALUES ($1, 'wallet_provisioning', 'wallet_provisioning_consent', NULL, 1)
     RETURNING id`,
    [customerId],
  );
  const onboardingId = onboarding.rows[0]!.id;
  await target.pool.query(
    `INSERT INTO samra_core.customer_consents
       (customer_id, onboarding_id, consent_type, document_version,
        bundle_version, decision, locale, channel, idempotency_key)
     SELECT $1, $2, consent_type, 'alpha-non-production-v1',
            'alpha-non-production-v1', 'accepted', 'en-US', 'api', $3
       FROM unnest(ARRAY[
         'terms_of_service',
         'privacy_notice',
         'electronic_communications'
       ]) AS consent_types(consent_type)`,
    [customerId, onboardingId, "e".repeat(64)],
  );
  const consent = await target.pool.query<{ id: string }>(
    `INSERT INTO samra_core.customer_consents
       (customer_id, onboarding_id, consent_type, document_version,
        bundle_version, decision, locale, channel, idempotency_key)
     VALUES ($1, $2, 'wallet_provisioning', $3,
             'sandbox-customer-wallet-v1', 'accepted', 'en-US', 'api', $4)
     RETURNING id`,
    [
      customerId,
      onboardingId,
      options.documentVersion ?? "sandbox-customer-wallet-v1",
      "f".repeat(64),
    ],
  );
  const providerRequestKey = randomUUID().replaceAll("-", "").repeat(2);
  const creationCommandKey = randomUUID().replaceAll("-", "").repeat(2);
  const wallet = await target.pool.query<{ id: string }>(
    `INSERT INTO samra_core.customer_wallets
       (external_ref, customer_id, onboarding_id, wallet_consent_id,
        provider, provider_request_key, creation_command_key, state, asset,
        environment, configuration_version, version)
     VALUES ($1, $2, $3, $4, 'crossmint', $5, $6, 'provisioning', 'USDC',
             'staging', 'crossmint-sandbox-evm-customer-email-v1', 1)
     RETURNING id`,
    [
      `wallet_${randomUUID().replaceAll("-", "")}`,
      customerId,
      onboardingId,
      consent.rows[0]!.id,
      providerRequestKey,
      creationCommandKey,
    ],
  );
  const walletId = wallet.rows[0]!.id;
  const address = `0x${randomUUID().replaceAll("-", "").padEnd(40, "0")}`;
  if (options.includeMapping !== false) {
    await insertLegacyProviderMapping(target, walletId, address);
  }
  await target.pool.query(
    `UPDATE samra_core.customer_wallets
        SET state = 'ready', ready_at = now(), version = version + 1,
            updated_at = now()
      WHERE id = $1`,
    [walletId],
  );
  await target.pool.query(
    `UPDATE samra_core.customer_onboardings
        SET state = 'wallet_ready', latest_completed_step = 'wallet_provisioned',
            version = version + 1, entered_at = now(), updated_at = now()
      WHERE id = $1`,
    [onboardingId],
  );
  return Object.freeze({
    walletId,
    onboardingId,
    address,
    customerExternalRef,
    auth,
  });
}

async function insertLegacyProviderMapping(
  target: ReturnType<typeof createDatabase>,
  walletId: string,
  address: string,
): Promise<void> {
  await target.pool.query(
    `INSERT INTO samra_core.customer_wallet_provider_mappings
       (wallet_id, provider, provider_wallet_ref, network, custody_model,
        public_address, configuration_version)
     VALUES ($1, 'crossmint', $2, 'evm', 'smart-customer-email-recovery',
             $3, 'crossmint-sandbox-evm-customer-email-v1')`,
    [walletId, `evm:${address}`, address],
  );
}

async function insertApprovedWalletCustomer(
  target: ReturnType<typeof createDatabase>,
  baseConsentVersion: "alpha-non-production-v1" | "alpha-non-production-v2",
): Promise<Readonly<{ customerId: string; onboardingId: string }>> {
  const customer = await target.pool.query<{ id: string }>(
    `INSERT INTO samra_core.customers
       (external_ref, display_name, country_code, state, metadata)
     VALUES ($1, NULL, NULL, 'active', '{"profileStatus":"pending"}'::jsonb)
     RETURNING id`,
    [`customer_${randomUUID().replaceAll("-", "")}`],
  );
  const customerId = customer.rows[0]!.id;
  await target.pool.query(
    `INSERT INTO samra_core.customer_auth_identities
       (customer_id, provider, issuer, subject)
     VALUES ($1, 'auth0', $2, $3)`,
    [
      customerId,
      `https://${randomUUID()}.rollback.samra.test/`,
      `auth0|${randomUUID()}`,
    ],
  );
  const onboarding = await target.pool.query<{ id: string }>(
    `INSERT INTO samra_core.customer_onboardings
       (customer_id, state, latest_completed_step, reason_family, version)
     VALUES ($1, 'identity_approved', 'identity_verification', NULL, 1)
     RETURNING id`,
    [customerId],
  );
  const onboardingId = onboarding.rows[0]!.id;
  await target.pool.query(
    `INSERT INTO samra_core.customer_onboarding_transitions
       (onboarding_id, sequence, from_state, to_state, command_key)
     VALUES ($1, 1, NULL, 'identity_approved', $2)`,
    [
      onboardingId,
      `fixture:identity-approved:${randomUUID().replaceAll("-", "")}`,
    ],
  );
  await target.pool.query(
    `INSERT INTO samra_core.customer_identity_cases
       (external_ref, customer_id, onboarding_id, provider,
        provider_request_key, provider_inquiry_ref, state, decided_at)
     VALUES ($1, $2, $3, 'persona', $4, $5, 'approved', now())`,
    [
      `identity_${randomUUID().replaceAll("-", "")}`,
      customerId,
      onboardingId,
      randomUUID().replaceAll("-", "").repeat(2),
      `inquiry_${randomUUID().replaceAll("-", "")}`,
    ],
  );
  await target.pool.query(
    `INSERT INTO samra_core.customer_consents
       (customer_id, onboarding_id, consent_type, document_version,
        bundle_version, decision, locale, channel, idempotency_key)
     SELECT $1, $2, consent_type, $3, $3, 'accepted', 'en-US', 'api', $4
       FROM unnest(ARRAY[
         'terms_of_service',
         'privacy_notice',
         'electronic_communications'
       ]) AS consent_types(consent_type)`,
    [
      customerId,
      onboardingId,
      baseConsentVersion,
      randomUUID().replaceAll("-", "").repeat(2),
    ],
  );
  return Object.freeze({ customerId, onboardingId });
}

async function assertSyntheticMixedConsentRejected(
  target: ReturnType<typeof createDatabase>,
  baseConsentVersion: "alpha-non-production-v1" | "alpha-non-production-v2",
  walletConsentVersion:
    "alpha-wallet-non-production-v1" | "alpha-wallet-non-production-v2",
): Promise<void> {
  const fixture = await insertApprovedWalletCustomer(
    target,
    baseConsentVersion,
  );
  const walletConsent = await target.pool.query<{ id: string }>(
    `INSERT INTO samra_core.customer_consents
       (customer_id, onboarding_id, consent_type, document_version,
        bundle_version, decision, locale, channel, idempotency_key)
     VALUES ($1, $2, 'wallet_provisioning', $3, $3, 'accepted', 'en-US',
             'api', $4)
     RETURNING id`,
    [
      fixture.customerId,
      fixture.onboardingId,
      walletConsentVersion,
      randomUUID().replaceAll("-", "").repeat(2),
    ],
  );
  await assert.rejects(
    target.pool.query(
      `INSERT INTO samra_core.customer_wallets
         (external_ref, customer_id, onboarding_id, wallet_consent_id,
          provider, provider_request_key, creation_command_key, state, asset,
          environment, configuration_version)
       VALUES ($1, $2, $3, $4, 'crossmint', $5, $6, 'created', 'USDC',
               'synthetic', 'crossmint-synthetic-v1')`,
      [
        `wallet_${randomUUID().replaceAll("-", "")}`,
        fixture.customerId,
        fixture.onboardingId,
        walletConsent.rows[0]!.id,
        randomUUID().replaceAll("-", "").repeat(2),
        randomUUID().replaceAll("-", "").repeat(2),
      ],
    ),
    (error: unknown) =>
      errorChainIncludes(
        error,
        "customer wallet creation requires an approved wallet disclosure",
      ),
  );
}

function errorChainIncludes(error: unknown, expected: string): boolean {
  let current: unknown = error;
  while (current instanceof Error) {
    if (current.message.includes(expected)) return true;
    current = (current as Error & { cause?: unknown }).cause;
  }
  return false;
}

test("RESILIENCE-WEEKLY-006 migration 0007 data upgrades to current and current replay is idempotent", async () => {
  const journal = await readAndValidateMigrationJournal();
  const currentMigrationCount = String(journal.entries.length);
  const databaseName = `samra_upgrade_${randomUUID().replaceAll("-", "")}`;
  const adminUrl = new URL(connectionString);
  adminUrl.pathname = "/postgres";
  const admin = createDatabase({ connectionString: adminUrl.toString() });
  const targetUrl = databaseUrl(databaseName);
  let target: ReturnType<typeof createDatabase> | undefined;
  let baselineFolder: string | undefined;
  let preCurrentFolder: string | undefined;
  try {
    await admin.pool.query(`CREATE DATABASE "${databaseName}"`);
    target = createDatabase({ connectionString: targetUrl });
    baselineFolder = await createMigrationFolder(
      journal,
      baselineMigrationCount,
      "0007",
    );
    await migrate(drizzle(target.pool), {
      migrationsFolder: baselineFolder,
      migrationsSchema: "samra_migrations",
      migrationsTable: "migration_history",
    });
    await seed(targetUrl);

    const baseline = await target.pool.query<{
      migrations: string;
      customers: string;
      opening_journals: string;
      balance_table: string | null;
    }>(
      `SELECT
         (SELECT count(*) FROM samra_migrations.migration_history)::text AS migrations,
         (SELECT count(*) FROM samra_core.customers)::text AS customers,
         (SELECT count(*) FROM samra_core.ledger_journals
          WHERE business_event_type = 'demo_seed'
            AND business_event_id = 'opening_balance_001')::text AS opening_journals,
         to_regclass('samra_core.ledger_account_balances')::text AS balance_table`,
    );
    assert.deepEqual(baseline.rows[0], {
      migrations: "8",
      customers: "2",
      opening_journals: "1",
      balance_table: null,
    });

    preCurrentFolder = await createMigrationFolder(
      journal,
      journal.entries.length - 1,
      "pre-current",
    );
    await migrate(drizzle(target.pool), {
      migrationsFolder: preCurrentFolder,
      migrationsSchema: "samra_migrations",
      migrationsTable: "migration_history",
    });
    const legacyReadyWallet = await insertLegacyReadyStagingWallet(target);
    await migrate(drizzle(target.pool), {
      migrationsFolder: migrationFolder,
      migrationsSchema: "samra_migrations",
      migrationsTable: "migration_history",
    });
    const correctedWallet = await target.pool.query<{
      wallet_state: string;
      onboarding_state: string;
      latest_completed_step: string;
      ready_at: Date | null;
      public_address: string | null;
      wallet_transition_count: string;
      onboarding_transition_count: string;
      audit_count: string;
    }>(
      `SELECT wallet.state AS wallet_state,
              onboarding.state AS onboarding_state,
              onboarding.latest_completed_step,
              wallet.ready_at,
              mapping.public_address,
              (SELECT count(*)::text
                 FROM samra_core.customer_wallet_transitions transition
                WHERE transition.wallet_id = wallet.id
                  AND transition.to_state = 'customer_control_setup')
                AS wallet_transition_count,
              (SELECT count(*)::text
                 FROM samra_core.customer_onboarding_transitions transition
                WHERE transition.onboarding_id = onboarding.id
                  AND transition.to_state = 'wallet_control_setup')
                AS onboarding_transition_count,
              (SELECT count(*)::text
                 FROM samra_core.audit_events audit
                WHERE audit.entity_type = 'customer_wallet'
                  AND audit.entity_id = wallet.id::text
                  AND audit.action = 'customer_wallet_customer_control_setup_required')
                AS audit_count
         FROM samra_core.customer_wallets wallet
         JOIN samra_core.customer_onboardings onboarding
           ON onboarding.id = wallet.onboarding_id
         JOIN samra_core.customer_wallet_provider_mappings mapping
           ON mapping.wallet_id = wallet.id
        WHERE wallet.id = $1 AND onboarding.id = $2`,
      [legacyReadyWallet.walletId, legacyReadyWallet.onboardingId],
    );
    assert.deepEqual(correctedWallet.rows, [
      {
        wallet_state: "customer_control_setup",
        onboarding_state: "wallet_control_setup",
        latest_completed_step: "wallet_created",
        ready_at: null,
        public_address: legacyReadyWallet.address,
        wallet_transition_count: "1",
        onboarding_transition_count: "1",
        audit_count: "1",
      },
    ]);

    const context = new PostgresPersistenceContext(target.pool);
    const onboardingStore = new PostgresCustomerOnboardingStore(context);
    const staleConsent = await onboardingStore.getAuth0Onboarding(
      legacyReadyWallet.auth,
    );
    assert.equal(staleConsent.state, "wallet_control_setup");
    assert.ok(
      staleConsent.nextAllowedActions.includes("submit_required_consents"),
    );
    const refreshedOnboarding = await onboardingStore.recordAuth0ConsentBundle({
      ...legacyReadyWallet.auth,
      idempotencyKey: "legacy-base-consent-refresh-001",
      bundleVersion: ALPHA_ONBOARDING_CONSENT_BUNDLE.bundleVersion,
      locale: ALPHA_ONBOARDING_CONSENT_BUNDLE.locale,
      decisions: ALPHA_ONBOARDING_CONSENT_BUNDLE.documents.map((document) => ({
        consentType: document.consentType,
        documentVersion: document.documentVersion,
        decision: "accepted" as const,
      })),
    });
    assert.equal(refreshedOnboarding.snapshot.state, "wallet_control_setup");
    assert.equal(
      refreshedOnboarding.snapshot.nextAllowedActions.includes(
        "submit_required_consents",
      ),
      false,
    );

    const walletStore = new PostgresCustomerWalletStore(context, {
      mode: "crossmint-sandbox-customer",
      allowedCustomerId: legacyReadyWallet.customerExternalRef,
    });
    const staleWalletConsent = await walletStore.getAuth0Wallet(
      legacyReadyWallet.auth,
    );
    assert.deepEqual(staleWalletConsent.nextAllowedActions, [
      "accept_current_wallet_disclosure",
    ]);
    const refreshedWallet = await walletStore.prepareAuth0Wallet({
      ...legacyReadyWallet.auth,
      idempotencyKey: "legacy-wallet-consent-refresh-001",
      consent: {
        bundleVersion: CUSTOMER_CONTROLLED_SANDBOX_DISCLOSURE.bundleVersion,
        documentVersion: CUSTOMER_CONTROLLED_SANDBOX_DISCLOSURE.documentVersion,
        locale: CUSTOMER_CONTROLLED_SANDBOX_DISCLOSURE.locale,
        decision: "accepted",
      },
    });
    assert.equal(refreshedWallet.created, false);
    assert.equal(refreshedWallet.snapshot.state, "customer_control_setup");
    assert.deepEqual(refreshedWallet.snapshot.nextAllowedActions, [
      "await_customer_control_setup",
    ]);
    const replayedWallet = await walletStore.prepareAuth0Wallet({
      ...legacyReadyWallet.auth,
      idempotencyKey: "legacy-wallet-consent-refresh-002",
      consent: {
        bundleVersion: CUSTOMER_CONTROLLED_SANDBOX_DISCLOSURE.bundleVersion,
        documentVersion: CUSTOMER_CONTROLLED_SANDBOX_DISCLOSURE.documentVersion,
        locale: CUSTOMER_CONTROLLED_SANDBOX_DISCLOSURE.locale,
        decision: "accepted",
      },
    });
    assert.equal(replayedWallet.created, false);
    assert.deepEqual(replayedWallet.snapshot, refreshedWallet.snapshot);
    const preservedConsentEvidence = await target.pool.query<{
      wallet_consent_rows: string;
      legacy_wallet_consent_rows: string;
      current_wallet_consent_command_key: string;
      provider_mapping_rows: string;
      wallet_transition_rows: string;
      wallet_audit_rows: string;
    }>(
      `SELECT
         (SELECT count(*)::text
            FROM samra_core.customer_consents consent
            JOIN samra_core.customer_wallets wallet
              ON wallet.customer_id = consent.customer_id
             AND wallet.onboarding_id = consent.onboarding_id
           WHERE wallet.id = $1
             AND consent.consent_type = 'wallet_provisioning')
           AS wallet_consent_rows,
         (SELECT count(*)::text
            FROM samra_core.customer_consents consent
            JOIN samra_core.customer_wallets wallet
              ON wallet.customer_id = consent.customer_id
             AND wallet.onboarding_id = consent.onboarding_id
           WHERE wallet.id = $1
             AND consent.consent_type = 'wallet_provisioning'
             AND consent.bundle_version = 'sandbox-customer-wallet-v1')
           AS legacy_wallet_consent_rows,
         (SELECT consent.idempotency_key
            FROM samra_core.customer_consents consent
            JOIN samra_core.customer_wallets wallet
              ON wallet.customer_id = consent.customer_id
             AND wallet.onboarding_id = consent.onboarding_id
           WHERE wallet.id = $1
             AND consent.consent_type = 'wallet_provisioning'
             AND consent.bundle_version = $2
             AND consent.document_version = $3)
           AS current_wallet_consent_command_key,
         (SELECT count(*)::text
            FROM samra_core.customer_wallet_provider_mappings
           WHERE wallet_id = $1) AS provider_mapping_rows,
         (SELECT count(*)::text
            FROM samra_core.customer_wallet_transitions
           WHERE wallet_id = $1) AS wallet_transition_rows,
         (SELECT count(*)::text
            FROM samra_core.audit_events
           WHERE entity_type = 'customer_wallet'
             AND entity_id = $1::text) AS wallet_audit_rows`,
      [
        legacyReadyWallet.walletId,
        CUSTOMER_CONTROLLED_SANDBOX_DISCLOSURE.bundleVersion,
        CUSTOMER_CONTROLLED_SANDBOX_DISCLOSURE.documentVersion,
      ],
    );
    assert.deepEqual(preservedConsentEvidence.rows[0], {
      wallet_consent_rows: "2",
      legacy_wallet_consent_rows: "1",
      current_wallet_consent_command_key: createHash("sha256")
        .update("legacy-wallet-consent-refresh-001")
        .digest("hex"),
      provider_mapping_rows: "1",
      wallet_transition_rows: "1",
      wallet_audit_rows: "2",
    });
    await seed(targetUrl);
    await seed(targetUrl);
    await migrate(drizzle(target.pool), {
      migrationsFolder: migrationFolder,
      migrationsSchema: "samra_migrations",
      migrationsTable: "migration_history",
    });

    const upgraded = await target.pool.query<{
      migrations: string;
      customers: string;
      opening_journals: string;
      natural_balance_minor: string;
      truth_balance_minor: string;
      quote_guard: string;
      resolution_columns: string;
      customer_auth_identity_table: string;
      customer_auth_identity_guard: string;
      customer_onboarding_tables: string;
      customer_onboarding_guards: string;
      customer_identity_tables: string;
      customer_identity_guards: string;
      customer_acquisition_tables: string;
      customer_acquisition_guards: string;
      pending_profile_columns: string;
    }>(
      `SELECT
         (SELECT count(*) FROM samra_migrations.migration_history)::text AS migrations,
         (SELECT count(*) FROM samra_core.customers)::text AS customers,
         (SELECT count(*) FROM samra_core.ledger_journals
          WHERE business_event_type = 'demo_seed'
            AND business_event_id = 'opening_balance_001')::text AS opening_journals,
         (SELECT balance.natural_balance_minor::text
          FROM samra_core.ledger_account_balances balance
          JOIN samra_core.ledger_accounts account ON account.id = balance.account_id
          WHERE account.code = 'demo_usd_account_001') AS natural_balance_minor,
         (SELECT truth.natural_balance_minor::text
          FROM samra_core.ledger_account_balance_truth truth
          JOIN samra_core.ledger_accounts account ON account.id = truth.account_id
          WHERE account.code = 'demo_usd_account_001') AS truth_balance_minor,
         (SELECT count(*)::text FROM pg_trigger
          WHERE tgname = 'remittance_quotes_snapshot_immutable'
            AND NOT tgisinternal) AS quote_guard,
         (SELECT count(*)::text FROM information_schema.columns
          WHERE table_schema = 'samra_core'
            AND table_name = 'reconciliation_exceptions'
            AND column_name IN ('resolved_by','resolution_journal_id',
                                'resolution_idempotency_key')) AS resolution_columns,
         (SELECT count(*)::text FROM information_schema.tables
          WHERE table_schema = 'samra_core'
            AND table_name = 'customer_auth_identities')
           AS customer_auth_identity_table,
         (SELECT count(*)::text FROM pg_trigger
          WHERE tgname = 'customer_auth_identities_controlled_mutation'
            AND NOT tgisinternal) AS customer_auth_identity_guard,
         (SELECT count(*)::text FROM information_schema.tables
          WHERE table_schema = 'samra_core'
            AND table_name IN ('customer_onboardings',
                               'customer_onboarding_transitions',
                               'customer_consents')) AS customer_onboarding_tables,
         (SELECT count(*)::text FROM pg_trigger
          WHERE tgname IN ('customer_onboardings_controlled_mutation',
                           'customer_onboarding_transitions_append_only',
                           'customer_consents_append_only')
            AND NOT tgisinternal) AS customer_onboarding_guards,
         (SELECT count(*)::text FROM information_schema.tables
          WHERE table_schema = 'samra_core'
            AND table_name IN ('customer_identity_cases',
                               'customer_identity_case_transitions',
                               'customer_identity_provider_events'))
           AS customer_identity_tables,
         (SELECT count(*)::text FROM pg_trigger
          WHERE tgname IN ('customer_identity_cases_controlled_mutation',
                           'customer_identity_case_transitions_append_only',
                           'customer_identity_provider_events_append_only')
            AND NOT tgisinternal) AS customer_identity_guards,
         (SELECT count(*)::text FROM information_schema.tables
          WHERE table_schema = 'samra_core'
            AND table_name IN ('customer_wallets',
                               'customer_wallet_provider_mappings',
                               'customer_wallet_transitions'))
           AS customer_wallet_tables,
         (SELECT count(*)::text FROM pg_trigger
          WHERE tgname IN ('customer_wallets_controlled_mutation',
                           'customer_wallet_provider_mappings_append_only',
                           'customer_wallet_transitions_append_only')
            AND NOT tgisinternal) AS customer_wallet_guards,
         (SELECT count(*)::text FROM information_schema.tables
          WHERE table_schema = 'samra_core'
            AND table_name IN ('customer_acquisition_sessions',
                               'customer_acquisition_events',
                               'customer_acquisition_links'))
           AS customer_acquisition_tables,
         (SELECT count(*)::text FROM pg_trigger
          WHERE tgname IN ('customer_acquisition_sessions_append_only',
                           'customer_acquisition_events_append_only',
                           'customer_acquisition_links_append_only')
            AND NOT tgisinternal) AS customer_acquisition_guards,
         (SELECT count(*)::text FROM information_schema.columns
          WHERE table_schema = 'samra_core' AND table_name = 'customers'
            AND column_name IN ('display_name','country_code')
            AND is_nullable = 'YES') AS pending_profile_columns`,
    );
    assert.deepEqual(upgraded.rows[0], {
      migrations: currentMigrationCount,
      customers: "3",
      opening_journals: "1",
      natural_balance_minor: "425000",
      truth_balance_minor: "425000",
      quote_guard: "1",
      resolution_columns: "3",
      customer_auth_identity_table: "1",
      customer_auth_identity_guard: "1",
      customer_onboarding_tables: "3",
      customer_onboarding_guards: "3",
      customer_identity_tables: "3",
      customer_identity_guards: "3",
      customer_wallet_tables: "3",
      customer_wallet_guards: "3",
      customer_acquisition_tables: "3",
      customer_acquisition_guards: "3",
      pending_profile_columns: "2",
    });
  } finally {
    if (target) await target.pool.end();
    if (baselineFolder)
      await rm(baselineFolder, { recursive: true, force: true });
    if (preCurrentFolder)
      await rm(preCurrentFolder, { recursive: true, force: true });
    await admin.pool.query(
      `DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`,
    );
    await admin.pool.end();
  }
});

test("migration 0021 refuses malformed staging-ready wallet evidence", async () => {
  const journal = await readAndValidateMigrationJournal();
  const preCurrentMigrationCount = journal.entries.length - 1;
  const databaseName = `samra_invalid_wallet_${randomUUID().replaceAll("-", "")}`;
  const adminUrl = new URL(connectionString);
  adminUrl.pathname = "/postgres";
  const admin = createDatabase({ connectionString: adminUrl.toString() });
  const targetUrl = databaseUrl(databaseName);
  let target: ReturnType<typeof createDatabase> | undefined;
  let preCurrentFolder: string | undefined;
  try {
    await admin.pool.query(`CREATE DATABASE "${databaseName}"`);
    target = createDatabase({ connectionString: targetUrl });
    preCurrentFolder = await createMigrationFolder(
      journal,
      preCurrentMigrationCount,
      "missing-wallet-mapping",
    );
    await migrate(drizzle(target.pool), {
      migrationsFolder: preCurrentFolder,
      migrationsSchema: "samra_migrations",
      migrationsTable: "migration_history",
    });
    const malformed = await insertLegacyReadyStagingWallet(target, {
      includeMapping: false,
    });

    await assert.rejects(
      migrate(drizzle(target.pool), {
        migrationsFolder: migrationFolder,
        migrationsSchema: "samra_migrations",
        migrationsTable: "migration_history",
      }),
      (error: unknown) =>
        errorChainIncludes(
          error,
          "does not have exactly one valid provider mapping",
        ),
    );

    const unchanged = await target.pool.query<{
      migrations: string;
      wallet_state: string;
      onboarding_state: string;
      ready_at: Date | null;
      mapping_count: string;
    }>(
      `SELECT
         (SELECT count(*)::text
            FROM samra_migrations.migration_history) AS migrations,
         wallet.state AS wallet_state,
         onboarding.state AS onboarding_state,
         wallet.ready_at,
         (SELECT count(*)::text
            FROM samra_core.customer_wallet_provider_mappings mapping
           WHERE mapping.wallet_id = wallet.id) AS mapping_count
       FROM samra_core.customer_wallets wallet
       JOIN samra_core.customer_onboardings onboarding
         ON onboarding.id = wallet.onboarding_id
       WHERE wallet.id = $1 AND onboarding.id = $2`,
      [malformed.walletId, malformed.onboardingId],
    );
    assert.equal(unchanged.rows.length, 1);
    assert.equal(
      unchanged.rows[0]!.migrations,
      String(preCurrentMigrationCount),
    );
    assert.equal(unchanged.rows[0]!.wallet_state, "ready");
    assert.equal(unchanged.rows[0]!.onboarding_state, "wallet_ready");
    assert.notEqual(unchanged.rows[0]!.ready_at, null);
    assert.equal(unchanged.rows[0]!.mapping_count, "0");

    await insertLegacyProviderMapping(
      target,
      malformed.walletId,
      malformed.address,
    );
    const mismatchedConsent = await insertLegacyReadyStagingWallet(target, {
      documentVersion: "legacy-sandbox-customer-wallet-v0",
    });
    await assert.rejects(
      migrate(drizzle(target.pool), {
        migrationsFolder: migrationFolder,
        migrationsSchema: "samra_migrations",
        migrationsTable: "migration_history",
      }),
      (error: unknown) =>
        errorChainIncludes(
          error,
          "does not reference the exact sandbox wallet consent",
        ),
    );
    const consentFailure = await target.pool.query<{
      migrations: string;
      wallet_state: string;
      onboarding_state: string;
      document_version: string;
    }>(
      `SELECT
         (SELECT count(*)::text
            FROM samra_migrations.migration_history) AS migrations,
         wallet.state AS wallet_state,
         onboarding.state AS onboarding_state,
         consent.document_version
       FROM samra_core.customer_wallets wallet
       JOIN samra_core.customer_onboardings onboarding
         ON onboarding.id = wallet.onboarding_id
       JOIN samra_core.customer_consents consent
         ON consent.id = wallet.wallet_consent_id
       WHERE wallet.id = $1 AND onboarding.id = $2`,
      [mismatchedConsent.walletId, mismatchedConsent.onboardingId],
    );
    assert.deepEqual(consentFailure.rows, [
      {
        migrations: String(preCurrentMigrationCount),
        wallet_state: "ready",
        onboarding_state: "wallet_ready",
        document_version: "legacy-sandbox-customer-wallet-v0",
      },
    ]);
  } finally {
    if (target) await target.pool.end();
    if (preCurrentFolder)
      await rm(preCurrentFolder, { recursive: true, force: true });
    await admin.pool.query(
      `DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`,
    );
    await admin.pool.end();
  }
});

test("migration 0021 preserves deployed synthetic rollback wallet writes while staging remains v2-only", async () => {
  const rollbackSourceSha = "836f76bd368e9d81c633d7483e48b907c42ef775" as const;
  assert.equal(rollbackSourceSha.length, 40);
  const journal = await readAndValidateMigrationJournal();
  const databaseName = `samra_wallet_rollback_${randomUUID().replaceAll("-", "")}`;
  const adminUrl = new URL(connectionString);
  adminUrl.pathname = "/postgres";
  const admin = createDatabase({ connectionString: adminUrl.toString() });
  const targetUrl = databaseUrl(databaseName);
  let target: ReturnType<typeof createDatabase> | undefined;
  try {
    await admin.pool.query(`CREATE DATABASE "${databaseName}"`);
    target = createDatabase({ connectionString: targetUrl });
    await migrate(drizzle(target.pool), {
      migrationsFolder: migrationFolder,
      migrationsSchema: "samra_migrations",
      migrationsTable: "migration_history",
    });
    assert.equal(
      journal.entries.at(-1)?.tag,
      "0021_customer_wallet_control_setup",
    );

    const legacy = await insertApprovedWalletCustomer(
      target,
      "alpha-non-production-v1",
    );
    const commandKey = createHash("sha256")
      .update("deployed-synthetic-wallet-command")
      .digest("hex");
    await target.pool.query(
      `UPDATE samra_core.customer_onboardings
          SET state = 'wallet_consent_pending', version = version + 1,
              entered_at = now(), updated_at = now()
        WHERE id = $1 AND version = 1`,
      [legacy.onboardingId],
    );
    await target.pool.query(
      `INSERT INTO samra_core.customer_onboarding_transitions
         (onboarding_id, sequence, from_state, to_state, command_key)
       VALUES ($1, 2, 'identity_approved', 'wallet_consent_pending', $2)`,
      [legacy.onboardingId, `wallet-consent-presented:${commandKey}`],
    );
    const walletConsent = await target.pool.query<{ id: string }>(
      `INSERT INTO samra_core.customer_consents
         (customer_id, onboarding_id, consent_type, document_version,
          bundle_version, decision, locale, channel, idempotency_key)
       VALUES ($1, $2, 'wallet_provisioning',
               'alpha-wallet-non-production-v1',
               'alpha-wallet-non-production-v1', 'accepted', 'en-US', 'api', $3)
       RETURNING id`,
      [legacy.customerId, legacy.onboardingId, commandKey],
    );
    const walletExternalRef = `wallet_${randomUUID().replaceAll("-", "")}`;
    const providerRequestKey = createHash("sha256")
      .update(
        JSON.stringify({
          provider: "crossmint",
          walletId: walletExternalRef,
          configurationVersion: "crossmint-synthetic-v1",
        }),
      )
      .digest("hex");
    const wallet = await target.pool.query<{ id: string }>(
      `INSERT INTO samra_core.customer_wallets
         (external_ref, customer_id, onboarding_id, wallet_consent_id,
          provider, provider_request_key, creation_command_key, state, asset,
          environment, configuration_version)
       VALUES ($1, $2, $3, $4, 'crossmint', $5, $6, 'created', 'USDC',
               'synthetic', 'crossmint-synthetic-v1')
       RETURNING id`,
      [
        walletExternalRef,
        legacy.customerId,
        legacy.onboardingId,
        walletConsent.rows[0]!.id,
        providerRequestKey,
        commandKey,
      ],
    );
    const walletId = wallet.rows[0]!.id;
    await target.pool.query(
      `INSERT INTO samra_core.customer_wallet_transitions
         (wallet_id, sequence, from_state, to_state, command_key)
       VALUES ($1, 1, NULL, 'created', $2)`,
      [walletId, `create:${commandKey}`],
    );
    await target.pool.query(
      `UPDATE samra_core.customer_wallets
          SET state = 'provisioning', version = version + 1, updated_at = now()
        WHERE id = $1 AND version = 1`,
      [walletId],
    );
    await target.pool.query(
      `INSERT INTO samra_core.customer_wallet_transitions
         (wallet_id, sequence, from_state, to_state, command_key)
       VALUES ($1, 2, 'created', 'provisioning', $2)`,
      [walletId, `provision:${commandKey}`],
    );
    await target.pool.query(
      `UPDATE samra_core.customer_onboardings
          SET state = 'wallet_provisioning',
              latest_completed_step = 'wallet_provisioning_consent',
              version = version + 1, entered_at = now(), updated_at = now()
        WHERE id = $1 AND version = 2`,
      [legacy.onboardingId],
    );
    await target.pool.query(
      `INSERT INTO samra_core.customer_onboarding_transitions
         (onboarding_id, sequence, from_state, to_state, command_key)
       VALUES ($1, 3, 'wallet_consent_pending', 'wallet_provisioning', $2)`,
      [legacy.onboardingId, `wallet-provisioning:${commandKey}`],
    );

    const providerWalletRef = `wallet_fake_${randomUUID()
      .replaceAll("-", "")
      .slice(0, 32)}`;
    const providerResultHash = createHash("sha256")
      .update(providerWalletRef)
      .digest("hex");
    await target.pool.query(
      `INSERT INTO samra_core.customer_wallet_provider_mappings
         (wallet_id, provider, provider_wallet_ref, network, custody_model,
          public_address, configuration_version)
       VALUES ($1, 'crossmint', $2, 'synthetic', 'synthetic', NULL,
               'crossmint-synthetic-v1')`,
      [walletId, providerWalletRef],
    );
    await target.pool.query(
      `UPDATE samra_core.customer_wallets
          SET state = 'ready', reason_family = NULL, version = version + 1,
              ready_at = now(), updated_at = now()
        WHERE id = $1 AND version = 2`,
      [walletId],
    );
    await target.pool.query(
      `INSERT INTO samra_core.customer_wallet_transitions
         (wallet_id, sequence, from_state, to_state, command_key)
       VALUES ($1, 3, 'provisioning', 'ready', $2)`,
      [walletId, `provider-wallet:${providerResultHash}`],
    );
    await target.pool.query(
      `UPDATE samra_core.customer_onboardings
          SET state = 'wallet_ready', latest_completed_step = 'wallet_provisioned',
              version = version + 1, entered_at = now(), updated_at = now()
        WHERE id = $1 AND version = 3`,
      [legacy.onboardingId],
    );
    await target.pool.query(
      `INSERT INTO samra_core.customer_onboarding_transitions
         (onboarding_id, sequence, from_state, to_state, command_key)
       VALUES ($1, 4, 'wallet_provisioning', 'wallet_ready', $2)`,
      [legacy.onboardingId, `wallet-ready:${providerResultHash}`],
    );

    const completed = await target.pool.query<{
      wallet_state: string;
      onboarding_state: string;
      mapping_count: string;
      v1_base_consent_count: string;
      v1_wallet_consent_count: string;
    }>(
      `SELECT wallet.state AS wallet_state,
              onboarding.state AS onboarding_state,
              (SELECT count(*)::text
                 FROM samra_core.customer_wallet_provider_mappings mapping
                WHERE mapping.wallet_id = wallet.id) AS mapping_count,
              (SELECT count(DISTINCT consent_type)::text
                 FROM samra_core.customer_consents consent
                WHERE consent.customer_id = wallet.customer_id
                  AND consent.onboarding_id = wallet.onboarding_id
                  AND consent.bundle_version = 'alpha-non-production-v1'
                  AND consent.document_version = 'alpha-non-production-v1'
                  AND consent.decision = 'accepted') AS v1_base_consent_count,
              (SELECT count(*)::text
                 FROM samra_core.customer_consents consent
                WHERE consent.id = wallet.wallet_consent_id
                  AND consent.bundle_version = 'alpha-wallet-non-production-v1'
                  AND consent.document_version = 'alpha-wallet-non-production-v1'
                  AND consent.decision = 'accepted') AS v1_wallet_consent_count
         FROM samra_core.customer_wallets wallet
         JOIN samra_core.customer_onboardings onboarding
           ON onboarding.id = wallet.onboarding_id
        WHERE wallet.id = $1`,
      [walletId],
    );
    assert.deepEqual(completed.rows, [
      {
        wallet_state: "ready",
        onboarding_state: "wallet_ready",
        mapping_count: "1",
        v1_base_consent_count: "3",
        v1_wallet_consent_count: "1",
      },
    ]);

    await assertSyntheticMixedConsentRejected(
      target,
      "alpha-non-production-v1",
      "alpha-wallet-non-production-v2",
    );
    await assertSyntheticMixedConsentRejected(
      target,
      "alpha-non-production-v2",
      "alpha-wallet-non-production-v1",
    );

    const staging = await insertApprovedWalletCustomer(
      target,
      "alpha-non-production-v2",
    );
    const legacyStagingConsent = await target.pool.query<{ id: string }>(
      `INSERT INTO samra_core.customer_consents
         (customer_id, onboarding_id, consent_type, document_version,
          bundle_version, decision, locale, channel, idempotency_key)
       VALUES ($1, $2, 'wallet_provisioning', 'sandbox-customer-wallet-v1',
               'sandbox-customer-wallet-v1', 'accepted', 'en-US', 'api', $3)
       RETURNING id`,
      [
        staging.customerId,
        staging.onboardingId,
        randomUUID().replaceAll("-", "").repeat(2),
      ],
    );
    await assert.rejects(
      target.pool.query(
        `INSERT INTO samra_core.customer_wallets
           (external_ref, customer_id, onboarding_id, wallet_consent_id,
            provider, provider_request_key, creation_command_key, state, asset,
            environment, configuration_version)
         VALUES ($1, $2, $3, $4, 'crossmint', $5, $6, 'created', 'USDC',
                 'staging', 'crossmint-sandbox-evm-customer-email-v1')`,
        [
          `wallet_${randomUUID().replaceAll("-", "")}`,
          staging.customerId,
          staging.onboardingId,
          legacyStagingConsent.rows[0]!.id,
          randomUUID().replaceAll("-", "").repeat(2),
          randomUUID().replaceAll("-", "").repeat(2),
        ],
      ),
      (error: unknown) =>
        errorChainIncludes(
          error,
          "customer wallet creation requires an approved wallet disclosure",
        ),
    );
  } finally {
    if (target) await target.pool.end();
    await admin.pool.query(
      `DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`,
    );
    await admin.pool.end();
  }
});
