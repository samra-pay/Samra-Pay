import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import {
  PostgresLedgerControl,
  PostgresPersistenceContext,
  PostgresRemittanceRepository,
  PostgresOperationsStore,
  PostgresCustomerIdentityStore,
  PostgresCustomerOnboardingStore,
  ALPHA_ONBOARDING_CONSENT_BUNDLE,
  CustomerIdentityConflictError,
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

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function onboardingPersistenceCounts(
  pool: ReturnType<typeof createDatabase>["pool"],
): Promise<
  Readonly<{
    customers: string;
    identities: string;
    onboardings: string;
    transitions: string;
    audits: string;
    idempotency_records: string;
  }>
> {
  const result = await pool.query<{
    customers: string;
    identities: string;
    onboardings: string;
    transitions: string;
    audits: string;
    idempotency_records: string;
  }>(
    `SELECT
       (SELECT count(*)::text FROM samra_core.customers) AS customers,
       (SELECT count(*)::text FROM samra_core.customer_auth_identities)
         AS identities,
       (SELECT count(*)::text FROM samra_core.customer_onboardings)
         AS onboardings,
       (SELECT count(*)::text
          FROM samra_core.customer_onboarding_transitions) AS transitions,
       (SELECT count(*)::text FROM samra_core.audit_events) AS audits,
       (SELECT count(*)::text FROM samra_core.idempotency_records)
         AS idempotency_records`,
  );
  return Object.freeze({ ...result.rows[0]! });
}

test.after(async () => {
  await Promise.all(connections.map((connection) => connection.pool.end()));
});

test("Auth0 identity bindings are durable, idempotent, conflict-safe, and auditable without copying the subject into audit evidence", async () => {
  const first = createRuntime();
  const second = createRuntime();
  const issuer = `https://${randomUUID()}.samra-auth.test/`;
  const subject = `auth0|${randomUUID()}`;
  const firstStore = new PostgresCustomerIdentityStore(first.context);
  const secondStore = new PostgresCustomerIdentityStore(second.context);

  const concurrent = await Promise.all([
    firstStore.bindAuth0Identity({
      customerExternalRef: "demo_customer_001",
      issuer,
      subject,
    }),
    secondStore.bindAuth0Identity({
      customerExternalRef: "demo_customer_001",
      issuer,
      subject,
    }),
  ]);
  assert.deepEqual(concurrent.map((binding) => binding.created).sort(), [
    false,
    true,
  ]);
  assert.equal(concurrent[0]!.identityId, concurrent[1]!.identityId);

  const resolved = await firstStore.resolveAuth0Identity({ issuer, subject });
  assert.equal(resolved?.customerExternalRef, "demo_customer_001");
  assert.equal(resolved?.customerDisplayName, "Samra Demo Customer");
  assert.equal(resolved?.identityState, "active");
  assert.equal(resolved?.customerState, "active");

  await assert.rejects(
    secondStore.bindAuth0Identity({
      customerExternalRef: "demo_customer_002",
      issuer,
      subject,
    }),
    CustomerIdentityConflictError,
  );

  const contestedSubject = `auth0|${randomUUID()}`;
  const contested = await Promise.allSettled([
    firstStore.bindAuth0Identity({
      customerExternalRef: "demo_customer_001",
      issuer,
      subject: contestedSubject,
    }),
    secondStore.bindAuth0Identity({
      customerExternalRef: "demo_customer_002",
      issuer,
      subject: contestedSubject,
    }),
  ]);
  assert.equal(
    contested.filter((result) => result.status === "fulfilled").length,
    1,
  );
  assert.equal(
    contested.filter(
      (result) =>
        result.status === "rejected" &&
        result.reason instanceof CustomerIdentityConflictError,
    ).length,
    1,
  );
  const contestedResolution = await firstStore.resolveAuth0Identity({
    issuer,
    subject: contestedSubject,
  });
  assert.ok(
    contestedResolution?.customerExternalRef === "demo_customer_001" ||
      contestedResolution?.customerExternalRef === "demo_customer_002",
  );

  const evidence = await first.connection.pool.query<{
    binding_count: string;
    audit_count: string;
    audit_document: string;
  }>(
    `SELECT
       (SELECT count(*)::text
          FROM samra_core.customer_auth_identities
         WHERE provider = 'auth0' AND issuer = $1 AND subject = $2)
         AS binding_count,
       count(*)::text AS audit_count,
       COALESCE(string_agg(event_key || metadata::text, ''), '')
         AS audit_document
     FROM samra_core.audit_events
     WHERE entity_type = 'customer_auth_identity'
       AND entity_id = $3`,
    [issuer, subject, concurrent[0]!.identityId],
  );
  assert.equal(evidence.rows[0]!.binding_count, "1");
  assert.equal(evidence.rows[0]!.audit_count, "1");
  assert.equal(evidence.rows[0]!.audit_document.includes(subject), false);

  await assert.rejects(
    first.connection.pool.query(
      `UPDATE samra_core.customer_auth_identities
          SET subject = $1
        WHERE id = $2`,
      [`auth0|${randomUUID()}`, concurrent[0]!.identityId],
    ),
  );
  await assert.rejects(
    first.connection.pool.query(
      `DELETE FROM samra_core.customer_auth_identities WHERE id = $1`,
      [concurrent[0]!.identityId],
    ),
  );

  await first.connection.pool.query(
    `UPDATE samra_core.customer_auth_identities
        SET state = 'revoked', revoked_at = now(), updated_at = now()
      WHERE id = $1`,
    [concurrent[0]!.identityId],
  );
  const revoked = await firstStore.resolveAuth0Identity({ issuer, subject });
  assert.equal(revoked?.identityState, "revoked");
  await assert.rejects(
    firstStore.bindAuth0Identity({
      customerExternalRef: "demo_customer_001",
      issuer,
      subject,
    }),
    CustomerIdentityConflictError,
  );
  await assert.rejects(
    first.connection.pool.query(
      `UPDATE samra_core.customer_auth_identities
          SET state = 'active', revoked_at = NULL, updated_at = now()
        WHERE id = $1`,
      [concurrent[0]!.identityId],
    ),
  );
});

test("customer onboarding is atomic across first login, restart, consent replay, decline recovery, and audit evidence", async () => {
  const first = createRuntime();
  const second = createRuntime();
  const issuer = `https://${randomUUID()}.onboarding.samra.test/`;
  const subject = `auth0|${randomUUID()}`;
  const firstStore = new PostgresCustomerOnboardingStore(first.context);
  const secondStore = new PostgresCustomerOnboardingStore(second.context);

  const started = await Promise.all([
    firstStore.startAuth0Onboarding({
      issuer,
      subject,
      idempotencyKey: "first-login-command-001",
    }),
    secondStore.startAuth0Onboarding({
      issuer,
      subject,
      idempotencyKey: "first-login-command-002",
    }),
  ]);
  assert.deepEqual(started.map((result) => result.created).sort(), [
    false,
    true,
  ]);
  assert.equal(
    started[0]!.snapshot.onboardingId,
    started[1]!.snapshot.onboardingId,
  );
  assert.equal(
    started[0]!.snapshot.customerId,
    started[1]!.snapshot.customerId,
  );
  assert.equal(started[0]!.snapshot.state, "consent_pending");
  assert.equal(started[0]!.snapshot.version, 1);
  assert.equal(
    started[0]!.snapshot.consentBundle.legalEffect,
    "non_production",
  );

  const durable = await new PostgresCustomerOnboardingStore(
    second.context,
  ).getAuth0Onboarding({ issuer, subject });
  assert.equal(durable.onboardingId, started[0]!.snapshot.onboardingId);
  assert.equal(durable.customerId, started[0]!.snapshot.customerId);
  assert.equal(durable.state, "consent_pending");

  const initialized = await first.connection.pool.query<{
    customers: string;
    identities: string;
    onboardings: string;
    transitions: string;
    accounts: string;
    beneficiaries: string;
    display_name: string | null;
    country_code: string | null;
    audit_document: string;
  }>(
    `SELECT
       (SELECT count(*)::text FROM samra_core.customers
         WHERE external_ref = $1) AS customers,
       (SELECT count(*)::text FROM samra_core.customer_auth_identities
         WHERE provider = 'auth0' AND issuer = $2 AND subject = $3)
         AS identities,
       (SELECT count(*)::text FROM samra_core.customer_onboardings onboarding
         JOIN samra_core.customers customer ON customer.id = onboarding.customer_id
        WHERE customer.external_ref = $1) AS onboardings,
       (SELECT count(*)::text
          FROM samra_core.customer_onboarding_transitions transition
          JOIN samra_core.customer_onboardings onboarding
            ON onboarding.id = transition.onboarding_id
          JOIN samra_core.customers customer
            ON customer.id = onboarding.customer_id
         WHERE customer.external_ref = $1) AS transitions,
       (SELECT count(*)::text FROM samra_core.product_accounts account
          JOIN samra_core.customers customer ON customer.id = account.customer_id
         WHERE customer.external_ref = $1) AS accounts,
       (SELECT count(*)::text FROM samra_core.beneficiaries beneficiary
          JOIN samra_core.customers customer ON customer.id = beneficiary.customer_id
         WHERE customer.external_ref = $1) AS beneficiaries,
       (SELECT display_name FROM samra_core.customers WHERE external_ref = $1)
         AS display_name,
       (SELECT country_code FROM samra_core.customers WHERE external_ref = $1)
         AS country_code,
       (SELECT COALESCE(string_agg(event_key || metadata::text, ''), '')
          FROM samra_core.audit_events
         WHERE entity_id IN ($1, $4)) AS audit_document`,
    [durable.customerId, issuer, subject, durable.onboardingId],
  );
  assert.deepEqual(initialized.rows[0], {
    customers: "1",
    identities: "1",
    onboardings: "1",
    transitions: "1",
    accounts: "0",
    beneficiaries: "0",
    display_name: null,
    country_code: null,
    audit_document: initialized.rows[0]!.audit_document,
  });
  assert.equal(initialized.rows[0]!.audit_document.includes(subject), false);
  const pendingOperationsCustomer =
    await first.operationsStore.listOperationsCustomers({
      search: durable.customerId,
      limit: 10,
    });
  assert.equal(pendingOperationsCustomer.length, 1);
  assert.equal(
    pendingOperationsCustomer[0]!.displayName,
    "Customer profile pending",
  );
  assert.equal(pendingOperationsCustomer[0]!.countryCode, "--");
  assert.equal(
    pendingOperationsCustomer[0]!.status,
    "onboarding_consent_pending",
  );

  const decisions = ALPHA_ONBOARDING_CONSENT_BUNDLE.documents.map(
    (document) => ({
      consentType: document.consentType,
      documentVersion: document.documentVersion,
      decision: "accepted" as const,
    }),
  );
  const rawConsentKey = "required-consent-command-001";
  const consented = await Promise.all([
    firstStore.recordAuth0ConsentBundle({
      issuer,
      subject,
      idempotencyKey: rawConsentKey,
      bundleVersion: ALPHA_ONBOARDING_CONSENT_BUNDLE.bundleVersion,
      locale: ALPHA_ONBOARDING_CONSENT_BUNDLE.locale,
      decisions,
    }),
    secondStore.recordAuth0ConsentBundle({
      issuer,
      subject,
      idempotencyKey: rawConsentKey,
      bundleVersion: ALPHA_ONBOARDING_CONSENT_BUNDLE.bundleVersion,
      locale: ALPHA_ONBOARDING_CONSENT_BUNDLE.locale,
      decisions,
    }),
  ]);
  assert.deepEqual(consented.map((result) => result.replayed).sort(), [
    false,
    true,
  ]);
  assert.equal(consented[0]!.snapshot.state, "identity_in_progress");
  assert.equal(consented[0]!.snapshot.version, 2);
  assert.equal(
    consented[0]!.snapshot.onboardingId,
    consented[1]!.snapshot.onboardingId,
  );
  const identityPendingOperationsCustomer =
    await first.operationsStore.listOperationsCustomers({
      search: durable.customerId,
      limit: 10,
    });
  assert.equal(
    identityPendingOperationsCustomer[0]!.status,
    "onboarding_identity_in_progress",
  );

  const consentEvidence = await first.connection.pool.query<{
    consent_rows: string;
    transition_rows: string;
    audit_rows: string;
    idempotency_rows: string;
    stored_keys: string;
    audit_document: string;
  }>(
    `SELECT
       (SELECT count(*)::text FROM samra_core.customer_consents
         WHERE onboarding_id = $1) AS consent_rows,
       (SELECT count(*)::text FROM samra_core.customer_onboarding_transitions
         WHERE onboarding_id = $1) AS transition_rows,
       (SELECT count(*)::text FROM samra_core.audit_events
         WHERE entity_type = 'customer_onboarding' AND entity_id = $1::text)
         AS audit_rows,
       (SELECT count(*)::text FROM samra_core.idempotency_records
         WHERE resource_type = 'customer_onboarding'
           AND resource_id = $1::text)
         AS idempotency_rows,
       (SELECT COALESCE(string_agg(idempotency_key, ''), '')
          FROM samra_core.customer_consents WHERE onboarding_id = $1)
         AS stored_keys,
       (SELECT COALESCE(string_agg(event_key || metadata::text, ''), '')
          FROM samra_core.audit_events
         WHERE entity_type = 'customer_onboarding' AND entity_id = $1::text)
         AS audit_document`,
    [durable.onboardingId],
  );
  assert.deepEqual(
    {
      consent_rows: consentEvidence.rows[0]!.consent_rows,
      transition_rows: consentEvidence.rows[0]!.transition_rows,
      audit_rows: consentEvidence.rows[0]!.audit_rows,
      idempotency_rows: consentEvidence.rows[0]!.idempotency_rows,
    },
    {
      consent_rows: "3",
      transition_rows: "2",
      audit_rows: "2",
      idempotency_rows: "1",
    },
  );
  assert.equal(
    consentEvidence.rows[0]!.stored_keys.includes(rawConsentKey),
    false,
  );
  assert.equal(
    consentEvidence.rows[0]!.audit_document.includes(rawConsentKey),
    false,
  );
  assert.equal(
    consentEvidence.rows[0]!.audit_document.includes(subject),
    false,
  );
  await assert.rejects(
    first.connection.pool.query(
      `INSERT INTO samra_core.customer_consents
       (customer_id, onboarding_id, consent_type, document_version,
        bundle_version, decision, locale, channel, idempotency_key)
       SELECT customer.id, $1, 'privacy_notice', 'alpha-non-production-v1',
              'alpha-non-production-v1', 'accepted', 'en-US', 'api', $2
       FROM samra_core.customers customer
       WHERE customer.external_ref = 'demo_customer_001'`,
      [durable.onboardingId, "0".repeat(64)],
    ),
  );

  const replayAfterRestart = await new PostgresCustomerOnboardingStore(
    createRuntime().context,
  ).recordAuth0ConsentBundle({
    issuer,
    subject,
    idempotencyKey: rawConsentKey,
    bundleVersion: ALPHA_ONBOARDING_CONSENT_BUNDLE.bundleVersion,
    locale: ALPHA_ONBOARDING_CONSENT_BUNDLE.locale,
    decisions,
  });
  assert.equal(replayAfterRestart.replayed, true);
  assert.equal(replayAfterRestart.snapshot.version, 2);
  await assert.rejects(
    firstStore.recordAuth0ConsentBundle({
      issuer,
      subject,
      idempotencyKey: rawConsentKey,
      bundleVersion: ALPHA_ONBOARDING_CONSENT_BUNDLE.bundleVersion,
      locale: ALPHA_ONBOARDING_CONSENT_BUNDLE.locale,
      decisions: decisions.map((decision, index) =>
        index === 0 ? { ...decision, decision: "declined" as const } : decision,
      ),
    }),
    /idempotency key was already used/i,
  );
  await assert.rejects(
    first.connection.pool.query(
      `UPDATE samra_core.customer_consents SET locale = locale
        WHERE onboarding_id = $1`,
      [durable.onboardingId],
    ),
  );
  await assert.rejects(
    first.connection.pool.query(
      `DELETE FROM samra_core.customer_onboarding_transitions
        WHERE onboarding_id = $1`,
      [durable.onboardingId],
    ),
  );
  await assert.rejects(
    first.connection.pool.query(
      `UPDATE samra_core.customer_onboardings
          SET state = 'activated', version = version + 1, entered_at = now(),
              updated_at = now()
        WHERE id = $1`,
      [durable.onboardingId],
    ),
  );

  const declineSubject = `auth0|${randomUUID()}`;
  const declinedStart = await firstStore.startAuth0Onboarding({
    issuer,
    subject: declineSubject,
    idempotencyKey: "decline-start-command-001",
  });
  const declined = await firstStore.recordAuth0ConsentBundle({
    issuer,
    subject: declineSubject,
    idempotencyKey: "decline-consent-command-001",
    bundleVersion: ALPHA_ONBOARDING_CONSENT_BUNDLE.bundleVersion,
    locale: ALPHA_ONBOARDING_CONSENT_BUNDLE.locale,
    decisions: decisions.map((decision, index) =>
      index === 0 ? { ...decision, decision: "declined" as const } : decision,
    ),
  });
  assert.equal(declined.snapshot.state, "consent_pending");
  assert.equal(declined.snapshot.reasonFamily, "required_consent_declined");
  assert.equal(declined.snapshot.version, 2);
  const recovered = await firstStore.recordAuth0ConsentBundle({
    issuer,
    subject: declineSubject,
    idempotencyKey: "decline-consent-command-002",
    bundleVersion: ALPHA_ONBOARDING_CONSENT_BUNDLE.bundleVersion,
    locale: ALPHA_ONBOARDING_CONSENT_BUNDLE.locale,
    decisions,
  });
  assert.equal(recovered.snapshot.state, "identity_in_progress");
  assert.equal(recovered.snapshot.reasonFamily, null);
  assert.equal(recovered.snapshot.version, 3);
  assert.equal(
    recovered.snapshot.onboardingId,
    declinedStart.snapshot.onboardingId,
  );
});

test("customer onboarding rolls back every write after controlled mid-transaction failures and remains retryable", async () => {
  const target = createRuntime();
  const store = new PostgresCustomerOnboardingStore(target.context);
  const issuer = `https://${randomUUID()}.onboarding-rollback.samra.test/`;
  const failedStartSubject = `auth0|rollback-start-${randomUUID()}`;
  const failedConsentSubject = `auth0|rollback-consent-${randomUUID()}`;
  const failedStartKey = "rollback-first-login-command-001";
  const successfulStartKey = "rollback-first-login-command-002";
  const failedConsentKey = "rollback-consent-command-001";
  const triggerSuffix = randomUUID().replaceAll("-", "");
  const functionName = `test_fail_onboarding_transition_${triggerSuffix}`;
  const triggerName = `test_fail_onboarding_transition_${triggerSuffix}`;
  const failedStartCommand = `start:${sha256(failedStartKey)}`;
  const failedConsentCommand = `consent:${sha256(failedConsentKey)}`;
  const decisions = ALPHA_ONBOARDING_CONSENT_BUNDLE.documents.map(
    (document) => ({
      consentType: document.consentType,
      documentVersion: document.documentVersion,
      decision: "accepted" as const,
    }),
  );

  await target.connection.pool.query(
    `CREATE FUNCTION samra_core."${functionName}"()
     RETURNS trigger
     LANGUAGE plpgsql
     AS $$
     BEGIN
       IF NEW.command_key IN ('${failedStartCommand}', '${failedConsentCommand}') THEN
         RAISE EXCEPTION 'controlled onboarding transition failure'
           USING ERRCODE = 'P0001';
       END IF;
       RETURN NEW;
     END;
     $$`,
  );
  await target.connection.pool.query(
    `CREATE TRIGGER "${triggerName}"
     BEFORE INSERT ON samra_core.customer_onboarding_transitions
     FOR EACH ROW EXECUTE FUNCTION samra_core."${functionName}"()`,
  );

  try {
    const beforeStart = await onboardingPersistenceCounts(
      target.connection.pool,
    );
    await assert.rejects(
      store.startAuth0Onboarding({
        issuer,
        subject: failedStartSubject,
        idempotencyKey: failedStartKey,
      }),
      /controlled onboarding transition failure/i,
    );
    assert.deepEqual(
      await onboardingPersistenceCounts(target.connection.pool),
      beforeStart,
    );
    const failedIdentity = await target.connection.pool.query(
      `SELECT count(*)::int AS count
       FROM samra_core.customer_auth_identities
       WHERE provider = 'auth0' AND issuer = $1 AND subject = $2`,
      [issuer, failedStartSubject],
    );
    assert.equal(failedIdentity.rows[0]!.count, 0);

    const consentStart = await store.startAuth0Onboarding({
      issuer,
      subject: failedConsentSubject,
      idempotencyKey: successfulStartKey,
    });
    await assert.rejects(
      store.recordAuth0ConsentBundle({
        issuer,
        subject: failedConsentSubject,
        idempotencyKey: failedConsentKey,
        bundleVersion: ALPHA_ONBOARDING_CONSENT_BUNDLE.bundleVersion,
        locale: ALPHA_ONBOARDING_CONSENT_BUNDLE.locale,
        decisions,
      }),
      /controlled onboarding transition failure/i,
    );
    const afterConsentFailure = await store.getAuth0Onboarding({
      issuer,
      subject: failedConsentSubject,
    });
    assert.equal(afterConsentFailure.state, "consent_pending");
    assert.equal(afterConsentFailure.version, 1);
    const consentEvidence = await target.connection.pool.query<{
      consents: string;
      transitions: string;
      audits: string;
      idempotency_records: string;
    }>(
      `SELECT
         (SELECT count(*)::text FROM samra_core.customer_consents
           WHERE onboarding_id = $1) AS consents,
         (SELECT count(*)::text
            FROM samra_core.customer_onboarding_transitions
           WHERE onboarding_id = $1) AS transitions,
         (SELECT count(*)::text FROM samra_core.audit_events
           WHERE entity_type = 'customer_onboarding' AND entity_id = $1::text)
           AS audits,
         (SELECT count(*)::text FROM samra_core.idempotency_records
           WHERE resource_type = 'customer_onboarding'
             AND resource_id = $1::text)
           AS idempotency_records`,
      [consentStart.snapshot.onboardingId],
    );
    assert.deepEqual(consentEvidence.rows[0], {
      consents: "0",
      transitions: "1",
      audits: "1",
      idempotency_records: "0",
    });
  } finally {
    await target.connection.pool.query(
      `DROP TRIGGER IF EXISTS "${triggerName}"
       ON samra_core.customer_onboarding_transitions`,
    );
    await target.connection.pool.query(
      `DROP FUNCTION IF EXISTS samra_core."${functionName}"()`,
    );
  }

  const retriedStart = await store.startAuth0Onboarding({
    issuer,
    subject: failedStartSubject,
    idempotencyKey: failedStartKey,
  });
  assert.equal(retriedStart.created, true);
  assert.equal(retriedStart.snapshot.state, "consent_pending");
  const retriedConsent = await store.recordAuth0ConsentBundle({
    issuer,
    subject: failedConsentSubject,
    idempotencyKey: failedConsentKey,
    bundleVersion: ALPHA_ONBOARDING_CONSENT_BUNDLE.bundleVersion,
    locale: ALPHA_ONBOARDING_CONSENT_BUNDLE.locale,
    decisions,
  });
  assert.equal(retriedConsent.replayed, false);
  assert.equal(retriedConsent.snapshot.state, "identity_in_progress");
  assert.equal(retriedConsent.snapshot.version, 2);
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
    first.runtime.advanceWorkerBatch(25),
    second.runtime.advanceWorkerBatch(25),
  ]);
  const advancedOnce = await first.runtime.service.getTransfer(
    "demo_customer_001",
    transfer.id,
  );
  assert.equal(advancedOnce.state, "IN_TRANSIT");
  await advanceUntil(first.runtime, transfer.id, "COMPLETED");

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
  assert.equal(summary.customers["active"], 2);
  assert.ok((summary.workflow["failed"] ?? 0) >= 1);
  const customers = await first.operationsStore.listOperationsCustomers({
    search: "demo_customer_001",
    limit: 10,
  });
  assert.equal(customers.length, 1);
  assert.equal(customers[0]!.displayName, "Samra Demo Customer");
  assert.ok(customers[0]!.transferCount >= 1);
  assert.ok(BigInt(customers[0]!.totalSentMinor) > 0n);
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
