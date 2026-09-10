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
  PostgresAlphaAccessStore,
  AlphaAccessDeniedError,
  AlphaAdmissionRequiredError,
  PostgresCustomerIdentityCaseStore,
  PostgresCustomerWalletStore,
  ALPHA_WALLET_PROVISIONING_DISCLOSURE,
  PostgresCustomerFunnelStore,
  ALPHA_ONBOARDING_CONSENT_BUNDLE,
  CustomerIdentityConflictError,
  RandomIdGenerator,
  createDatabase,
} from "@workspace/db";
import type { ProviderEvent } from "@workspace/remittance";
import { DemoRuntime } from "../src/domain/demo-runtime";
import {
  CustomerWalletProvisioningService,
  DeterministicFakeCrossmintAdapter,
} from "../src/domain/customer-wallet";
import { Auth0CustomerActorResolver } from "../src/domain/customer-auth";
import type { Request } from "express";
import { PostgresReconciliationStore } from "../src/domain/postgres-reconciliation";
import {
  parseSharedTestManifest,
  runSharedTestOperation,
} from "../../../lib/db/src/shared-test-operator";

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

test("shared synthetic operator previews roll back, binds two invitations, and applies only admitted fake identity decisions", async () => {
  const { context } = createRuntime();
  // Roll back this entire fixture so the existing lifetime admission tests start closed.
  const rollback = new Error("operator fixture complete");
  await assert.rejects(
    context.run(async () => {
      const issuer = `https://${randomUUID()}.operator.samra.test/`;
      const subject = `auth0|${randomUUID()}`;
      const otherSubject = `auth0|${randomUUID()}`;
      const manifest = parseSharedTestManifest({
        environment: "test",
        operation: "invite",
        operatorAlias: "operator_fixture",
        issuer,
        admissionLimit: 5,
        subjects: [subject, otherSubject],
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      });
      const counts = async () =>
        (
          await context.query().query(
            `SELECT (SELECT count(*)::int FROM samra_core.alpha_invitations) AS invitations,
              (SELECT count(*)::int FROM samra_core.customers) AS customers,
              (SELECT count(*)::int FROM samra_core.audit_events) AS audits,
              (SELECT admission_limit FROM samra_core.alpha_release_controls) AS admission_limit`,
          )
        ).rows[0];
      const before = await counts();
      await assert.rejects(
        runSharedTestOperation(
          context,
          { ...manifest, environment: "dev" },
          true,
        ),
        /connected database/,
      );
      assert.equal(
        (await runSharedTestOperation(context, manifest)).applied,
        false,
      );
      assert.deepEqual(await counts(), before);
      await runSharedTestOperation(context, manifest, true);
      const applied = await counts();
      assert.equal(applied.invitations, 2);
      assert.equal(applied.customers, before.customers);
      assert.equal(applied.admission_limit, 5);
      await runSharedTestOperation(context, manifest, true);
      assert.deepEqual(await counts(), applied);
      if (manifest.operation !== "invite")
        throw new Error("Expected invitation fixture");
      await assert.rejects(
        runSharedTestOperation(
          context,
          { ...manifest, subjects: [subject, "auth0|replacement"] },
          true,
        ),
        /Existing invitations differ/,
      );
      await assert.rejects(
        runSharedTestOperation(
          context,
          { ...manifest, expiresAt: new Date(Date.now() - 1000).toISOString() },
          true,
        ),
        /expiry/,
      );
      const onboarding = new PostgresCustomerOnboardingStore(
        context,
        new PostgresAlphaAccessStore(context),
      );
      await assert.rejects(
        onboarding.startAuth0Onboarding({
          issuer,
          subject: "auth0|uninvited",
          idempotencyKey: "operator-uninvited-fixture",
        }),
        AlphaAccessDeniedError,
      );
      assert.equal(
        (
          await onboarding.startAuth0Onboarding({
            issuer,
            subject,
            idempotencyKey: "operator-start-fixture",
          })
        ).snapshot.state,
        "consent_pending",
      );
      const store = new PostgresCustomerIdentityCaseStore(context);
      await assert.rejects(
        store.prepareAuth0IdentityCase({
          issuer,
          subject,
          idempotencyKey: "operator-before-consent-fixture",
        }),
      );
      await onboarding.recordAuth0ConsentBundle({
        issuer,
        subject,
        idempotencyKey: "operator-consent-fixture",
        bundleVersion: ALPHA_ONBOARDING_CONSENT_BUNDLE.bundleVersion,
        locale: ALPHA_ONBOARDING_CONSENT_BUNDLE.locale,
        decisions: ALPHA_ONBOARDING_CONSENT_BUNDLE.documents.map(
          (document) => ({
            consentType: document.consentType,
            documentVersion: document.documentVersion,
            decision: "accepted" as const,
          }),
        ),
      });
      const prepared = await store.prepareAuth0IdentityCase({
        issuer,
        subject,
        idempotencyKey: "operator-inquiry-fixture",
      });
      const identityCaseId = prepared.snapshot.identityCaseId;
      await store.attachProviderInquiry({
        identityCaseId,
        providerRequestKey: prepared.providerRequestKey,
        providerInquiryRef: `inq_fake_${randomUUID()}`,
      });
      const decision = parseSharedTestManifest({
        environment: "test",
        operation: "identity-decision",
        operatorAlias: "operator_fixture",
        issuer,
        subject,
        identityCaseId,
        decision: "approved",
        commandId: "synthetic_operator_decision_fixture",
      });
      if (decision.operation !== "identity-decision")
        throw new Error("Expected decision fixture");
      await assert.rejects(
        runSharedTestOperation(
          context,
          { ...decision, subject: otherSubject },
          true,
        ),
        /admitted, active/,
      );
      await assert.rejects(
        runSharedTestOperation(
          context,
          {
            ...decision,
            identityCaseId: `identity_case_${randomUUID().replaceAll("-", "")}`,
          },
          true,
        ),
        /does not belong/,
      );
      const funding = parseSharedTestManifest({
        environment: "test",
        operation: "fund-synthetic-account",
        operatorAlias: "operator_fixture",
        issuer,
        subject,
        amountMinor: "50000",
      });
      await assert.rejects(
        runSharedTestOperation(context, funding, true),
        /Approved simulated identity/,
      );
      const beforeDecision = await counts();
      await runSharedTestOperation(context, decision);
      assert.equal(
        (await store.getAuth0IdentityCase({ issuer, subject })).state,
        "pending",
      );
      assert.deepEqual(await counts(), beforeDecision);
      assert.match(
        (await runSharedTestOperation(context, decision, true)).result,
        /approved; applied/,
      );
      assert.equal(
        (await onboarding.getAuth0Onboarding({ issuer, subject })).state,
        "identity_approved",
      );
      assert.match(
        (await runSharedTestOperation(context, decision, true)).result,
        /replayed/,
      );
      await assert.rejects(
        runSharedTestOperation(
          context,
          { ...decision, decision: "declined" },
          true,
        ),
        /different evidence/,
      );
      assert.equal(
        (await store.getAuth0IdentityCase({ issuer, subject })).state,
        "approved",
      );
      const customerId = (
        await context
          .query()
          .query<{ customer_id: string }>(
            "SELECT customer_id FROM samra_core.customer_auth_identities WHERE issuer=$1 AND subject=$2",
            [issuer, subject],
          )
      ).rows[0]!.customer_id;
      const accountRef = `synthetic_usd_${customerId.replaceAll("-", "")}`;
      await assert.rejects(
        runSharedTestOperation(context, funding, true),
        /ready, consented synthetic wallet/,
      );
      const actorResolver = new Auth0CustomerActorResolver(
        new PostgresCustomerIdentityStore(context),
        issuer,
      );
      const request = {
        auth: { payload: { iss: issuer, sub: subject } },
      } as Request;
      await assert.rejects(actorResolver.resolve(request), /onboarding/);
      const wallets = new CustomerWalletProvisioningService({
        store: new PostgresCustomerWalletStore(context),
        provider: new DeterministicFakeCrossmintAdapter(),
      });
      await wallets.startAuth0Wallet({
        issuer,
        subject,
        idempotencyKey: "operator-wallet-fixture",
        consent: {
          bundleVersion: ALPHA_WALLET_PROVISIONING_DISCLOSURE.bundleVersion,
          documentVersion: ALPHA_WALLET_PROVISIONING_DISCLOSURE.documentVersion,
          locale: ALPHA_WALLET_PROVISIONING_DISCLOSURE.locale,
          decision: "accepted",
        },
      });
      const beforeFunding = await onboarding.getAuth0Onboarding({
        issuer,
        subject,
      });
      await runSharedTestOperation(context, funding);
      assert.deepEqual(
        await onboarding.getAuth0Onboarding({ issuer, subject }),
        beforeFunding,
      );
      assert.equal(
        (
          await context
            .query()
            .query(
              "SELECT 1 FROM samra_core.product_accounts WHERE external_ref=$1",
              [accountRef],
            )
        ).rowCount,
        0,
      );
      await runSharedTestOperation(context, funding, true);
      const activated = await onboarding.getAuth0Onboarding({
        issuer,
        subject,
      });
      assert.equal(activated.state, "activated");
      assert.equal(activated.version, beforeFunding.version + 2);
      assert.equal(
        (await actorResolver.resolve(request)).id,
        activated.customerId,
      );
      assert.equal(
        (await wallets.getAuth0Wallet({ issuer, subject })).state,
        "ready",
      );
      const fundedCounts = await counts();
      const ledger = new PostgresLedgerControl(context);
      assert.equal(
        (await ledger.getCustomerBalance(accountRef)).availableMinor,
        50000n,
      );
      await runSharedTestOperation(context, funding, true);
      assert.deepEqual(
        await onboarding.getAuth0Onboarding({ issuer, subject }),
        activated,
      );
      assert.deepEqual(await counts(), fundedCounts);
      assert.equal(
        (await ledger.getCustomerBalance(accountRef)).availableMinor,
        50000n,
      );
      if (funding.operation !== "fund-synthetic-account")
        throw new Error("Expected funding fixture");
      await assert.rejects(
        runSharedTestOperation(
          context,
          { ...funding, amountMinor: "60000" },
          true,
        ),
      );
      assert.equal(
        (await ledger.getCustomerBalance(accountRef)).availableMinor,
        50000n,
      );
      await assert.rejects(
        runSharedTestOperation(
          context,
          { ...funding, subject: otherSubject },
          true,
        ),
        /admitted, active/,
      );
      const audits = JSON.stringify(
        (
          await context
            .query()
            .query(
              "SELECT metadata, actor_id FROM samra_core.audit_events WHERE entity_type = 'synthetic_test_setup'",
            )
        ).rows,
      );
      assert.equal(audits.includes(subject), false);
      assert.equal(audits.includes(otherSubject), false);
      assert.match(audits, /operator_fixture/);
      // The second admitted tester cannot target the first case or simulate a real inquiry.
      await onboarding.startAuth0Onboarding({
        issuer,
        subject: otherSubject,
        idempotencyKey: "operator-second-start-fixture",
      });
      await onboarding.recordAuth0ConsentBundle({
        issuer,
        subject: otherSubject,
        idempotencyKey: "operator-second-consent-fixture",
        bundleVersion: ALPHA_ONBOARDING_CONSENT_BUNDLE.bundleVersion,
        locale: ALPHA_ONBOARDING_CONSENT_BUNDLE.locale,
        decisions: ALPHA_ONBOARDING_CONSENT_BUNDLE.documents.map(
          (document) => ({
            consentType: document.consentType,
            documentVersion: document.documentVersion,
            decision: "accepted" as const,
          }),
        ),
      });
      const otherCase = await store.prepareAuth0IdentityCase({
        issuer,
        subject: otherSubject,
        idempotencyKey: "operator-second-inquiry-fixture",
      });
      await store.attachProviderInquiry({
        identityCaseId: otherCase.snapshot.identityCaseId,
        providerRequestKey: otherCase.providerRequestKey,
        providerInquiryRef: `inq_non_synthetic_${randomUUID()}`,
      });
      await assert.rejects(
        runSharedTestOperation(
          context,
          { ...decision, subject: otherSubject },
          true,
        ),
        /does not belong/,
      );
      await assert.rejects(
        runSharedTestOperation(
          context,
          {
            ...decision,
            subject: otherSubject,
            identityCaseId: otherCase.snapshot.identityCaseId,
            commandId: "synthetic_operator_second_fixture",
          },
          true,
        ),
        /required for non-synthetic/,
      );
      assert.equal(
        (await store.getAuth0IdentityCase({ issuer, subject: otherSubject }))
          .state,
        "pending",
      );
      await context
        .query()
        .query(
          "UPDATE samra_core.alpha_invitations SET revoked_at = now() WHERE issuer = $1 AND subject = $2",
          [issuer, subject],
        );
      await assert.rejects(
        runSharedTestOperation(context, decision, true),
        /admitted, active/,
      );
      await assert.rejects(
        runSharedTestOperation(context, funding, true),
        /admitted, active/,
      );
      await assert.rejects(
        runSharedTestOperation(context, manifest, true),
        /reactivation/,
      );
      throw rollback;
    }),
    (error) => error === rollback,
  );
});

test("updated consent notices preserve v1 receipt replay but reject new v1 commands", async () => {
  const { context } = createRuntime();
  const rollback = new Error("historical receipt fixture complete");
  await assert.rejects(
    context.run(async () => {
      const issuer = `https://${randomUUID()}.consent.samra.test/`;
      const subject = `auth0|${randomUUID()}`;
      const store = new PostgresCustomerOnboardingStore(context);
      const { snapshot } = await store.startAuth0Onboarding({
        issuer,
        subject,
        idempotencyKey: "historical-consent-start",
      });
      const bundle = {
        ...snapshot.consentBundle,
        bundleVersion: "alpha-non-production-v1",
        documents: snapshot.consentBundle.documents.map((d) => ({
          ...d,
          documentVersion: "alpha-non-production-v1",
        })),
      };
      const decisions = bundle.documents
        .map((d) => ({
          consentType: d.consentType,
          documentVersion: d.documentVersion,
          decision: "accepted" as const,
        }))
        .sort((a, b) => a.consentType.localeCompare(b.consentType));
      const input = {
        issuer,
        subject,
        idempotencyKey: "historical-consent-receipt",
        bundleVersion: bundle.bundleVersion,
        locale: bundle.locale,
        decisions,
      };
      const priorSnapshot = {
        ...snapshot,
        state: "identity_in_progress",
        latestCompletedStep: "required_consents",
        version: 2,
        consentBundle: bundle,
      };
      const requestHash = sha256(
        JSON.stringify({
          bundleVersion: bundle.bundleVersion,
          locale: bundle.locale,
          decisions,
        }),
      );
      // A retained pre-upgrade response fixture; no existing receipt is rewritten.
      await context.query().query(
        `INSERT INTO samra_core.idempotency_records
       (scope,idempotency_key,request_hash,state,resource_type,resource_id,response_status,response_body,completed_at,expires_at)
       VALUES ($1,$2,$3,'succeeded','customer_onboarding',$4,200,$5::jsonb,now(),now()+interval '10 years')`,
        [
          `${snapshot.customerId}:onboarding-consents`,
          sha256(input.idempotencyKey),
          requestHash,
          snapshot.onboardingId,
          JSON.stringify(priorSnapshot),
        ],
      );
      const replay = await store.recordAuth0ConsentBundle(input);
      assert.equal(replay.replayed, true);
      assert.deepEqual(replay.snapshot, priorSnapshot);
      await assert.rejects(
        store.recordAuth0ConsentBundle({
          ...input,
          idempotencyKey: "unrecorded-v1-command",
        }),
        /not current/,
      );
      await assert.rejects(
        store.recordAuth0ConsentBundle({
          ...input,
          decisions: decisions.map((d) => ({
            ...d,
            decision: "declined" as const,
          })),
        }),
        /different consent decisions/,
      );
      assert.equal(
        (await store.getAuth0Onboarding({ issuer, subject })).state,
        "consent_pending",
      );
      assert.equal(
        (
          await context
            .query()
            .query(
              "SELECT count(*)::int AS n FROM samra_core.customer_consents WHERE onboarding_id=$1",
              [snapshot.onboardingId],
            )
        ).rows[0].n,
        0,
      );
      throw rollback;
    }),
    (error) => error === rollback,
  );
});

test("customer funnel attribution is append-only, concurrent, privacy-safe, and derives the five-send milestone only from durable transfers", async () => {
  const first = createRuntime();
  const second = createRuntime();
  const firstFunnel = new PostgresCustomerFunnelStore(first.context);
  const secondFunnel = new PostgresCustomerFunnelStore(second.context);
  const onboarding = new PostgresCustomerOnboardingStore(first.context);
  const identityCases = new PostgresCustomerIdentityCaseStore(first.context);
  const newIssuer = `https://${randomUUID()}.funnel.samra.test/`;
  const newSubject = `auth0|${randomUUID()}`;
  const newSession = `acq_${randomUUID().replaceAll("-", "")}`;

  const concurrentEvents = await Promise.all([
    firstFunnel.recordEvent({
      sessionId: newSession,
      idempotencyKey: "funnel-event-concurrent-001",
      eventType: "landing_view",
      platform: "web",
      attribution: {
        channel: "paid_social",
        source: "instagram",
        medium: "paid_social",
        campaign: "alpha_launch",
      },
    }),
    secondFunnel.recordEvent({
      sessionId: newSession,
      idempotencyKey: "funnel-event-concurrent-001",
      eventType: "landing_view",
      platform: "web",
      attribution: {
        channel: "paid_social",
        source: "instagram",
        medium: "paid_social",
        campaign: "alpha_launch",
      },
    }),
  ]);
  assert.deepEqual(concurrentEvents.map((receipt) => receipt.recorded).sort(), [
    false,
    true,
  ]);
  assert.equal(
    concurrentEvents[0]!.recordedAt,
    concurrentEvents[1]!.recordedAt,
  );
  await assert.rejects(
    firstFunnel.recordEvent({
      sessionId: newSession,
      idempotencyKey: "funnel-event-concurrent-001",
      eventType: "signup_started",
      platform: "web",
      attribution: {
        channel: "paid_social",
        source: "instagram",
        medium: "paid_social",
        campaign: "changed_campaign",
      },
    }),
    /reused with different input/,
  );
  await assert.rejects(
    firstFunnel.recordEvent({
      sessionId: newSession,
      idempotencyKey: "funnel-event-private-url-001",
      eventType: "signup_started",
      platform: "web",
      attribution: {
        channel: "referral",
        source: "https://example.test/path?email=private@example.test",
      },
    }),
    /lowercase slug/,
  );

  await firstFunnel.recordEvent({
    sessionId: newSession,
    idempotencyKey: "funnel-event-signup-001",
    eventType: "signup_started",
    platform: "web",
    attribution: {
      channel: "paid_social",
      source: "instagram",
      medium: "paid_social",
      campaign: "alpha_launch",
    },
  });
  await onboarding.startAuth0Onboarding({
    issuer: newIssuer,
    subject: newSubject,
    idempotencyKey: "funnel-onboarding-start-001",
  });
  await onboarding.recordAuth0ConsentBundle({
    issuer: newIssuer,
    subject: newSubject,
    idempotencyKey: "funnel-consent-bundle-001",
    bundleVersion: ALPHA_ONBOARDING_CONSENT_BUNDLE.bundleVersion,
    locale: ALPHA_ONBOARDING_CONSENT_BUNDLE.locale,
    decisions: ALPHA_ONBOARDING_CONSENT_BUNDLE.documents.map((document) => ({
      consentType: document.consentType,
      documentVersion: document.documentVersion,
      decision: "accepted" as const,
    })),
  });
  const prepared = await identityCases.prepareAuth0IdentityCase({
    issuer: newIssuer,
    subject: newSubject,
    idempotencyKey: "funnel-identity-start-001",
  });
  const providerInquiryRef = `inq_${randomUUID()}`;
  await identityCases.attachProviderInquiry({
    identityCaseId: prepared.snapshot.identityCaseId,
    providerRequestKey: prepared.providerRequestKey,
    providerInquiryRef,
  });
  await identityCases.recordProviderEvent({
    identityCaseId: prepared.snapshot.identityCaseId,
    providerInquiryRef,
    providerEventRef: `evt_${randomUUID()}`,
    eventType: "inquiry.approved",
    decision: "approved",
    payloadDigest: sha256("synthetic approved identity evidence"),
  });

  const concurrentLinks = await Promise.all([
    firstFunnel.bindAuth0Session({
      issuer: newIssuer,
      subject: newSubject,
      sessionId: newSession,
      idempotencyKey: "funnel-bind-concurrent-001",
    }),
    secondFunnel.bindAuth0Session({
      issuer: newIssuer,
      subject: newSubject,
      sessionId: newSession,
      idempotencyKey: "funnel-bind-concurrent-002",
    }),
  ]);
  assert.deepEqual(concurrentLinks.map((receipt) => receipt.linked).sort(), [
    false,
    true,
  ]);
  assert.equal(concurrentLinks[0]!.customerId, concurrentLinks[1]!.customerId);

  const legacyIssuer = `https://${randomUUID()}.legacy-funnel.samra.test/`;
  const legacySubject = `auth0|${randomUUID()}`;
  const identityStore = new PostgresCustomerIdentityStore(first.context);
  await identityStore.bindAuth0Identity({
    customerExternalRef: "demo_customer_001",
    issuer: legacyIssuer,
    subject: legacySubject,
  });
  await onboarding.startAuth0Onboarding({
    issuer: legacyIssuer,
    subject: legacySubject,
    idempotencyKey: "funnel-legacy-onboarding-001",
  });
  await assert.rejects(
    firstFunnel.bindAuth0Session({
      issuer: legacyIssuer,
      subject: legacySubject,
      sessionId: newSession,
      idempotencyKey: "funnel-conflicting-link-001",
    }),
    /already linked to another customer/,
  );

  const legacySession = `acq_${randomUUID().replaceAll("-", "")}`;
  await firstFunnel.recordEvent({
    sessionId: legacySession,
    idempotencyKey: "funnel-legacy-landing-001",
    eventType: "landing_view",
    platform: "mobile",
    attribution: {
      channel: "referral",
      source: "community_partner",
      medium: "referral",
      campaign: "diaspora_alpha",
    },
  });
  await firstFunnel.bindAuth0Session({
    issuer: legacyIssuer,
    subject: legacySubject,
    sessionId: legacySession,
    idempotencyKey: "funnel-legacy-bind-001",
  });

  for (let send = 1; send <= 5; send += 1) {
    const quote = await first.runtime.service.createQuote({
      actorId: "demo_customer_001",
      sourceAccountId: "demo_usd_account_001",
      beneficiaryId: "beneficiary_bank_001",
      sourceAmountMinor: 100n,
      fundingMethod: "samra_balance",
      deliveryMethod: "bank",
    });
    const transfer = await first.runtime.service.createTransfer({
      actorId: "demo_customer_001",
      quoteId: quote.id,
      idempotencyKey: `funnel-five-send-${send}-${randomUUID()}`,
    });
    await advanceUntil(first.runtime, transfer.id, "COMPLETED");
  }

  const report = await firstFunnel.funnelReport({
    from: new Date(Date.now() - 60_000),
    to: new Date(Date.now() + 60_000),
    now: new Date("2026-08-19T12:30:00.000Z"),
  });
  assert.deepEqual(report.milestones, {
    linked_customer: 2,
    onboarding_started: 2,
    consent_completed: 1,
    identity_approved: 1,
    activated: 1,
    send_1_completed: 1,
    send_2_completed: 1,
    send_3_completed: 1,
    send_4_completed: 1,
    send_5_completed: 1,
  });
  assert.equal(report.eventSessions.landing_view, 2);
  assert.equal(report.eventSessions.signup_started, 1);
  assert.equal(report.eventSessions.quote_completed, 0);
  assert.deepEqual(
    report.firstTouch.map((row) => [row.channel, row.customers]).sort(),
    [
      ["paid_social", 1],
      ["referral", 1],
    ],
  );
  assert.deepEqual(report.firstTouch, report.lastNonDirect);
  assert.deepEqual(report.privacy, {
    aggregateOnly: true,
    containsCustomerIdentifiers: false,
    acceptedDimensions: ["channel", "source", "medium", "campaign"],
  });
  assert.equal(JSON.stringify(report).includes(newSubject), false);
  assert.equal(JSON.stringify(report).includes("demo_customer_001"), false);

  const evidence = await first.connection.pool.query<{
    events: string;
    links: string;
    audit_document: string;
  }>(
    `SELECT
       (SELECT count(*)::text
          FROM samra_core.customer_acquisition_events event
          JOIN samra_core.customer_acquisition_sessions session
            ON session.id = event.session_id
         WHERE session.external_ref = $1) AS events,
       (SELECT count(*)::text
          FROM samra_core.customer_acquisition_links link
          JOIN samra_core.customer_acquisition_sessions session
            ON session.id = link.session_id
         WHERE session.external_ref = $1) AS links,
       COALESCE(string_agg(audit.event_key || audit.metadata::text, ''), '')
         AS audit_document
      FROM samra_core.audit_events audit
     WHERE audit.action = 'customer_acquisition_session_linked'`,
    [newSession],
  );
  assert.equal(evidence.rows[0]!.events, "2");
  assert.equal(evidence.rows[0]!.links, "1");
  assert.equal(evidence.rows[0]!.audit_document.includes(newSubject), false);
  await assert.rejects(
    first.connection.pool.query(
      `UPDATE samra_core.customer_acquisition_events
          SET campaign = 'tampered'
        WHERE session_id = (
          SELECT id FROM samra_core.customer_acquisition_sessions
           WHERE external_ref = $1
        )`,
      [newSession],
    ),
    /append-only/,
  );
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
         WHERE onboarding_id = $1::uuid) AS consent_rows,
       (SELECT count(*)::text FROM samra_core.customer_onboarding_transitions
         WHERE onboarding_id = $1::uuid) AS transition_rows,
       (SELECT count(*)::text FROM samra_core.audit_events
         WHERE entity_type = 'customer_onboarding'
           AND entity_id = ($1::uuid)::text)
         AS audit_rows,
       (SELECT count(*)::text FROM samra_core.idempotency_records
         WHERE resource_type = 'customer_onboarding'
           AND resource_id = $1::uuid)
         AS idempotency_rows,
       (SELECT COALESCE(string_agg(idempotency_key, ''), '')
          FROM samra_core.customer_consents
         WHERE onboarding_id = $1::uuid)
         AS stored_keys,
       (SELECT COALESCE(string_agg(event_key || metadata::text, ''), '')
          FROM samra_core.audit_events
         WHERE entity_type = 'customer_onboarding'
           AND entity_id = ($1::uuid)::text)
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
           WHERE onboarding_id = $1::uuid) AS consents,
         (SELECT count(*)::text
            FROM samra_core.customer_onboarding_transitions
           WHERE onboarding_id = $1::uuid) AS transitions,
         (SELECT count(*)::text FROM samra_core.audit_events
           WHERE entity_type = 'customer_onboarding'
             AND entity_id = ($1::uuid)::text)
           AS audits,
         (SELECT count(*)::text FROM samra_core.idempotency_records
           WHERE resource_type = 'customer_onboarding'
             AND resource_id = $1::uuid)
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

test("identity cases survive concurrency and restart while provider replay, stale, conflict, rollback, and audit controls remain exact", async () => {
  const first = createRuntime();
  const second = createRuntime();
  const issuer = `https://${randomUUID()}.identity.samra.test/`;
  const subject = `auth0|${randomUUID()}`;
  const onboardingStore = new PostgresCustomerOnboardingStore(first.context);
  const started = await onboardingStore.startAuth0Onboarding({
    issuer,
    subject,
    idempotencyKey: "identity-onboarding-start-001",
  });
  const decisions = ALPHA_ONBOARDING_CONSENT_BUNDLE.documents.map(
    (document) => ({
      consentType: document.consentType,
      documentVersion: document.documentVersion,
      decision: "accepted" as const,
    }),
  );
  await onboardingStore.recordAuth0ConsentBundle({
    issuer,
    subject,
    idempotencyKey: "identity-consent-command-001",
    bundleVersion: ALPHA_ONBOARDING_CONSENT_BUNDLE.bundleVersion,
    locale: ALPHA_ONBOARDING_CONSENT_BUNDLE.locale,
    decisions,
  });

  const firstStore = new PostgresCustomerIdentityCaseStore(first.context);
  const secondStore = new PostgresCustomerIdentityCaseStore(second.context);
  const prepared = await Promise.all([
    firstStore.prepareAuth0IdentityCase({
      issuer,
      subject,
      idempotencyKey: "identity-case-start-001",
    }),
    secondStore.prepareAuth0IdentityCase({
      issuer,
      subject,
      idempotencyKey: "identity-case-start-002",
    }),
  ]);
  assert.deepEqual(prepared.map((result) => result.created).sort(), [
    false,
    true,
  ]);
  assert.equal(
    prepared[0]!.snapshot.identityCaseId,
    prepared[1]!.snapshot.identityCaseId,
  );
  assert.equal(
    prepared[0]!.providerRequestKey,
    prepared[1]!.providerRequestKey,
  );
  assert.equal(prepared[0]!.snapshot.state, "created");

  const identityCaseId = prepared[0]!.snapshot.identityCaseId;
  const providerRequestKey = prepared[0]!.providerRequestKey;
  const providerInquiryRef = `inq_fake_${randomUUID()}`;
  const attached = await Promise.all([
    firstStore.attachProviderInquiry({
      identityCaseId,
      providerRequestKey,
      providerInquiryRef,
    }),
    secondStore.attachProviderInquiry({
      identityCaseId,
      providerRequestKey,
      providerInquiryRef,
    }),
  ]);
  assert.deepEqual(
    attached.map((snapshot) => snapshot.state),
    ["pending", "pending"],
  );
  assert.equal(attached[0]!.version, 2);
  assert.equal(attached[1]!.version, 2);

  const restarted = new PostgresCustomerIdentityCaseStore(
    createRuntime().context,
  );
  const durable = await restarted.getAuth0IdentityCase({ issuer, subject });
  assert.equal(durable.identityCaseId, identityCaseId);
  assert.equal(durable.state, "pending");

  await assert.rejects(
    firstStore.recordProviderEvent({
      identityCaseId,
      providerInquiryRef: `inq_other_${randomUUID()}`,
      providerEventRef: `evt_wrong_inquiry_${randomUUID()}`,
      eventType: "inquiry.approved",
      decision: "approved",
      payloadDigest: sha256("wrong inquiry evidence"),
    }),
    /provider event does not belong to this identity inquiry/i,
  );

  const reviewEventRef = `evt_review_${randomUUID()}`;
  const reviewDigest = sha256("synthetic-review-evidence");
  const reviewed = await firstStore.recordProviderEvent({
    identityCaseId,
    providerInquiryRef,
    providerEventRef: reviewEventRef,
    eventType: "inquiry.marked-for-review",
    decision: "review",
    payloadDigest: reviewDigest,
  });
  assert.equal(reviewed.disposition, "applied");
  assert.equal(reviewed.snapshot.state, "review");
  assert.equal(reviewed.snapshot.version, 3);
  const replayedReview = await secondStore.recordProviderEvent({
    identityCaseId,
    providerInquiryRef,
    providerEventRef: reviewEventRef,
    eventType: "inquiry.marked-for-review",
    decision: "review",
    payloadDigest: reviewDigest,
  });
  assert.equal(replayedReview.replayed, true);
  assert.equal(replayedReview.snapshot.version, 3);

  const stale = await firstStore.recordProviderEvent({
    identityCaseId,
    providerInquiryRef,
    providerEventRef: `evt_pending_${randomUUID()}`,
    eventType: "inquiry.pending",
    decision: "pending",
    payloadDigest: sha256("late-pending-evidence"),
  });
  assert.equal(stale.disposition, "ignored_stale");
  assert.equal(stale.snapshot.state, "review");
  assert.equal(stale.snapshot.version, 3);

  const triggerSuffix = randomUUID().replaceAll("-", "");
  const functionName = `test_fail_identity_event_${triggerSuffix}`;
  const triggerName = `test_fail_identity_event_${triggerSuffix}`;
  const controlledEventRef = `evt_controlled_${randomUUID()}`;
  await first.connection.pool.query(
    `CREATE FUNCTION samra_core."${functionName}"()
     RETURNS trigger
     LANGUAGE plpgsql
     AS $$
     BEGIN
       IF NEW.provider_event_ref = '${controlledEventRef}' THEN
         RAISE EXCEPTION 'controlled identity event failure'
           USING ERRCODE = 'P0001';
       END IF;
       RETURN NEW;
     END;
     $$`,
  );
  await first.connection.pool.query(
    `CREATE TRIGGER "${triggerName}"
     BEFORE INSERT ON samra_core.customer_identity_provider_events
     FOR EACH ROW EXECUTE FUNCTION samra_core."${functionName}"()`,
  );
  try {
    await assert.rejects(
      firstStore.recordProviderEvent({
        identityCaseId,
        providerInquiryRef,
        providerEventRef: controlledEventRef,
        eventType: "inquiry.approved",
        decision: "approved",
        payloadDigest: sha256("controlled-approved-evidence"),
      }),
      /controlled identity event failure/i,
    );
    assert.equal(
      (await firstStore.getAuth0IdentityCase({ issuer, subject })).state,
      "review",
    );
    assert.equal(
      (await onboardingStore.getAuth0Onboarding({ issuer, subject })).state,
      "identity_review",
    );
  } finally {
    await first.connection.pool.query(
      `DROP TRIGGER IF EXISTS "${triggerName}"
       ON samra_core.customer_identity_provider_events`,
    );
    await first.connection.pool.query(
      `DROP FUNCTION IF EXISTS samra_core."${functionName}"()`,
    );
  }

  const approved = await firstStore.recordProviderEvent({
    identityCaseId,
    providerInquiryRef,
    providerEventRef: controlledEventRef,
    eventType: "inquiry.approved",
    decision: "approved",
    payloadDigest: sha256("controlled-approved-evidence"),
  });
  assert.equal(approved.disposition, "applied");
  assert.equal(approved.snapshot.state, "approved");
  assert.equal(approved.snapshot.version, 4);
  assert.equal(
    (await onboardingStore.getAuth0Onboarding({ issuer, subject })).state,
    "identity_approved",
  );

  const conflictEventRef = `evt_conflict_${randomUUID()}`;
  const conflictDigest = sha256("contradictory-declined-evidence");
  const conflict = await firstStore.recordProviderEvent({
    identityCaseId,
    providerInquiryRef,
    providerEventRef: conflictEventRef,
    eventType: "inquiry.declined",
    decision: "declined",
    payloadDigest: conflictDigest,
  });
  assert.equal(conflict.disposition, "conflict");
  assert.equal(conflict.snapshot.state, "approved");
  assert.equal(
    (await onboardingStore.getAuth0Onboarding({ issuer, subject })).state,
    "restricted",
  );
  const replayedConflict = await secondStore.recordProviderEvent({
    identityCaseId,
    providerInquiryRef,
    providerEventRef: conflictEventRef,
    eventType: "inquiry.declined",
    decision: "declined",
    payloadDigest: conflictDigest,
  });
  assert.equal(replayedConflict.replayed, true);
  assert.equal(replayedConflict.disposition, "conflict");
  await assert.rejects(
    secondStore.recordProviderEvent({
      identityCaseId,
      providerInquiryRef,
      providerEventRef: conflictEventRef,
      eventType: "inquiry.declined",
      decision: "declined",
      payloadDigest: sha256("changed-evidence"),
    }),
    /provider event reference was already used/i,
  );

  const evidence = await first.connection.pool.query<{
    cases: string;
    case_transitions: string;
    provider_events: string;
    onboarding_state: string;
    audit_document: string;
    stored_payloads: string;
    internal_case_id: string;
  }>(
    `SELECT
       (SELECT count(*)::text FROM samra_core.customer_identity_cases
         WHERE external_ref = $1) AS cases,
       (SELECT count(*)::text
          FROM samra_core.customer_identity_case_transitions transition
          JOIN samra_core.customer_identity_cases identity_case
            ON identity_case.id = transition.identity_case_id
         WHERE identity_case.external_ref = $1) AS case_transitions,
       (SELECT count(*)::text
          FROM samra_core.customer_identity_provider_events provider_event
          JOIN samra_core.customer_identity_cases identity_case
            ON identity_case.id = provider_event.identity_case_id
         WHERE identity_case.external_ref = $1) AS provider_events,
       (SELECT state FROM samra_core.customer_onboardings WHERE id = $2::uuid)
         AS onboarding_state,
       (SELECT COALESCE(string_agg(event_key || metadata::text, ''), '')
          FROM samra_core.audit_events
         WHERE entity_type = 'customer_identity_case') AS audit_document,
       (SELECT COALESCE(string_agg(payload_digest, ''), '')
          FROM samra_core.customer_identity_provider_events provider_event
          JOIN samra_core.customer_identity_cases identity_case
            ON identity_case.id = provider_event.identity_case_id
         WHERE identity_case.external_ref = $1) AS stored_payloads,
       (SELECT id::text FROM samra_core.customer_identity_cases
         WHERE external_ref = $1) AS internal_case_id`,
    [identityCaseId, started.snapshot.onboardingId],
  );
  assert.deepEqual(
    {
      cases: evidence.rows[0]!.cases,
      case_transitions: evidence.rows[0]!.case_transitions,
      provider_events: evidence.rows[0]!.provider_events,
      onboarding_state: evidence.rows[0]!.onboarding_state,
    },
    {
      cases: "1",
      case_transitions: "4",
      provider_events: "4",
      onboarding_state: "restricted",
    },
  );
  assert.equal(evidence.rows[0]!.audit_document.includes(subject), false);
  assert.equal(
    evidence.rows[0]!.audit_document.includes("identity-case-start-001"),
    false,
  );
  assert.equal(
    evidence.rows[0]!.stored_payloads.includes("synthetic-review-evidence"),
    false,
  );
  assert.match(evidence.rows[0]!.stored_payloads, /^[0-9a-f]+$/u);
  await assert.rejects(
    first.connection.pool.query(
      `UPDATE samra_core.customer_identity_provider_events
          SET payload_digest = payload_digest
        WHERE identity_case_id = $1::uuid`,
      [evidence.rows[0]!.internal_case_id],
    ),
  );
  await assert.rejects(
    first.connection.pool.query(
      `DELETE FROM samra_core.customer_identity_case_transitions
        WHERE identity_case_id = $1::uuid`,
      [evidence.rows[0]!.internal_case_id],
    ),
  );
  await assert.rejects(
    first.connection.pool.query(
      `UPDATE samra_core.customer_identity_cases
          SET provider_inquiry_ref = 'different', version = version + 1,
              updated_at = now()
        WHERE id = $1::uuid`,
      [evidence.rows[0]!.internal_case_id],
    ),
  );
});

test("PostgreSQL is the durable source of truth across atomicity, concurrency, restart, ledger, refund, and reconciliation", async () => {
  const first = createRuntime();
  const accountBaseline = await first.runtime.accountResponse();
  const holdBaseline = await first.connection.pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM samra_core.ledger_holds
     WHERE business_event_id LIKE 'transfer_%'`,
  );

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
  assert.equal(rolledBack.rows[0]!.count, holdBaseline.rows[0]!.count);
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
  assert.equal(
    heldBalance.bookBalance.minorUnits,
    accountBaseline.bookBalance.minorUnits,
  );
  assert.equal(
    heldBalance.availableBalance.minorUnits,
    (BigInt(accountBaseline.availableBalance.minorUnits) - 10_300n).toString(),
  );

  const restarted = createRuntime();
  const recovered = await restarted.runtime.service.getTransfer(
    "demo_customer_001",
    createdA.id,
  );
  assert.equal(recovered.state, "SUBMITTED");
  assert.equal(recovered.quote.debitAmount.amountMinor, 10_300n);
  await advanceUntil(restarted.runtime, createdA.id, "COMPLETED");
  const completedBalance = await restarted.runtime.accountResponse();
  const expectedCompletedBalance = (
    BigInt(accountBaseline.bookBalance.minorUnits) - 10_300n
  ).toString();
  assert.equal(
    completedBalance.bookBalance.minorUnits,
    expectedCompletedBalance,
  );
  assert.equal(
    completedBalance.availableBalance.minorUnits,
    expectedCompletedBalance,
  );

  const reconciliation = await restarted.runtime.runReconciliation(
    "demo_customer_001",
    "happy_path",
  );
  assert.ok(
    reconciliation.items.some(
      (item) =>
        item.matchKey === createdA.id && item.classification === "matched",
    ),
  );
  assert.equal(
    reconciliation.items.every((item) => item.classification === "matched"),
    true,
  );
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

test("provider event retry is not suppressed after its transaction rolls back", async () => {
  const fixture = createRuntime();
  const transfer = await createSubmittedTransfer(
    fixture.runtime,
    "provider-event-rollback",
  );
  const accepted = providerEvent({
    provider: "CALIZA",
    providerEventId: `rollback-accepted:${randomUUID()}`,
    transferId: transfer.id,
    kind: "CALIZA_ACCEPTED",
    occurredAt: new Date().toISOString(),
  });
  const repository = fixture.runtime.repository as {
    saveTransfer: typeof fixture.runtime.repository.saveTransfer;
  };
  const saveTransfer = repository.saveTransfer.bind(fixture.runtime.repository);
  repository.saveTransfer = async (candidate, auditActor) => {
    await saveTransfer(candidate, auditActor);
    if (candidate.id === transfer.id && candidate.state === "IN_TRANSIT") {
      throw new Error("INJECTED_AFTER_PROVIDER_EVENT_PERSISTENCE");
    }
  };

  try {
    await assert.rejects(
      fixture.runtime.service.ingestProviderEvent(accepted),
      /INJECTED_AFTER_PROVIDER_EVENT_PERSISTENCE/,
    );
  } finally {
    repository.saveTransfer = saveTransfer;
  }

  const rolledBack = await fixture.connection.pool.query<{
    provider_events: string;
    capture_journals: string;
    transfer_state: string;
    hold_state: string;
    state_change_outbox: string;
  }>(
    `SELECT
       (SELECT count(*) FROM samra_core.provider_events
        WHERE provider = 'caliza' AND provider_event_id = $1)::text
          AS provider_events,
       (SELECT count(*) FROM samra_core.ledger_journals
        WHERE business_event_type = 'remittance_capture'
          AND business_event_id = $2)::text AS capture_journals,
       (SELECT state::text FROM samra_core.remittance_transfers
        WHERE external_ref = $2) AS transfer_state,
       (SELECT state::text FROM samra_core.ledger_holds
        WHERE business_event_type = 'remittance_transfer'
          AND business_event_id = $2) AS hold_state,
       (SELECT count(*) FROM samra_core.outbox_events outbox
        JOIN samra_core.remittance_transfers transfer
          ON transfer.id = outbox.aggregate_id
        WHERE transfer.external_ref = $2
          AND outbox.event_type = 'TRANSFER_STATE_CHANGED')::text
          AS state_change_outbox`,
    [accepted.providerEventId, transfer.id],
  );
  assert.deepEqual(rolledBack.rows[0], {
    provider_events: "0",
    capture_journals: "0",
    transfer_state: "submitted",
    hold_state: "active",
    state_change_outbox: "0",
  });

  const replay = await fixture.runtime.service.ingestProviderEvent(accepted);
  assert.equal(replay.disposition, "PROCESSED");
  assert.equal(replay.transfer.state, "IN_TRANSIT");
  const duplicate = await fixture.runtime.service.ingestProviderEvent(accepted);
  assert.equal(duplicate.disposition, "DUPLICATE");
  assert.equal(duplicate.transfer.version, replay.transfer.version);

  const recovered = await fixture.connection.pool.query<{
    provider_events: string;
    provider_event_state: string;
    provider_event_attempts: number;
    capture_journals: string;
    captured_hold_events: string;
    state_change_outbox: string;
  }>(
    `SELECT
       (SELECT count(*) FROM samra_core.provider_events
        WHERE provider = 'caliza' AND provider_event_id = $1)::text
          AS provider_events,
       (SELECT state::text FROM samra_core.provider_events
        WHERE provider = 'caliza' AND provider_event_id = $1)
          AS provider_event_state,
       (SELECT attempt_count FROM samra_core.provider_events
        WHERE provider = 'caliza' AND provider_event_id = $1)
          AS provider_event_attempts,
       (SELECT count(*) FROM samra_core.ledger_journals
        WHERE business_event_type = 'remittance_capture'
          AND business_event_id = $2)::text AS capture_journals,
       (SELECT count(*) FROM samra_core.ledger_hold_events event
        JOIN samra_core.ledger_holds hold ON hold.id = event.hold_id
        WHERE hold.business_event_type = 'remittance_transfer'
          AND hold.business_event_id = $2
          AND event.event_type = 'captured')::text AS captured_hold_events,
       (SELECT count(*) FROM samra_core.outbox_events outbox
        JOIN samra_core.remittance_transfers transfer
          ON transfer.id = outbox.aggregate_id
        WHERE transfer.external_ref = $2
          AND outbox.event_type = 'TRANSFER_STATE_CHANGED')::text
          AS state_change_outbox`,
    [accepted.providerEventId, transfer.id],
  );
  assert.deepEqual(recovered.rows[0], {
    provider_events: "1",
    provider_event_state: "processed",
    provider_event_attempts: 2,
    capture_journals: "1",
    captured_hold_events: "1",
    state_change_outbox: "1",
  });

  const deliveredAt = new Date(
    Date.parse(accepted.occurredAt) + 1_000,
  ).toISOString();
  await fixture.runtime.service.ingestProviderEvent(
    providerEvent({
      provider: "CALIZA",
      providerEventId: `rollback-delivered:${randomUUID()}`,
      transferId: transfer.id,
      kind: "CALIZA_DELIVERED",
      occurredAt: deliveredAt,
    }),
  );
  const completed = await fixture.runtime.service.ingestProviderEvent(
    providerEvent({
      provider: "CHAPA",
      providerEventId: `rollback-paid:${randomUUID()}`,
      transferId: transfer.id,
      kind: "CHAPA_PAID",
      occurredAt: new Date(Date.parse(deliveredAt) + 1_000).toISOString(),
    }),
  );
  assert.equal(completed.transfer.state, "COMPLETED");
});

test("deferred provider events drain once after restart and remain deduplicated", async () => {
  const first = createRuntime();
  const transfer = await createSubmittedTransfer(
    first.runtime,
    "provider-event-restart",
  );
  const baseTime = Date.now();
  const paid = providerEvent({
    provider: "CHAPA",
    providerEventId: `restart-paid:${randomUUID()}`,
    transferId: transfer.id,
    kind: "CHAPA_PAID",
    occurredAt: new Date(baseTime + 3_000).toISOString(),
  });
  const accepted = providerEvent({
    provider: "CALIZA",
    providerEventId: `restart-accepted:${randomUUID()}`,
    transferId: transfer.id,
    kind: "CALIZA_ACCEPTED",
    occurredAt: new Date(baseTime + 1_000).toISOString(),
  });
  const delivered = providerEvent({
    provider: "CALIZA",
    providerEventId: `restart-delivered:${randomUUID()}`,
    transferId: transfer.id,
    kind: "CALIZA_DELIVERED",
    occurredAt: new Date(baseTime + 2_000).toISOString(),
  });

  const deferred = await first.runtime.service.ingestProviderEvent(paid);
  assert.equal(deferred.disposition, "DEFERRED");
  assert.equal(deferred.transfer.state, "SUBMITTED");
  const deferredEvidence = await first.connection.pool.query<{
    state: string;
    attempt_count: number;
  }>(
    `SELECT state::text, attempt_count
     FROM samra_core.provider_events
     WHERE provider = 'chapa' AND provider_event_id = $1`,
    [paid.providerEventId],
  );
  assert.deepEqual(deferredEvidence.rows[0], {
    state: "deferred",
    attempt_count: 1,
  });

  const restarted = createRuntime();
  const acceptedResult =
    await restarted.runtime.service.ingestProviderEvent(accepted);
  assert.equal(acceptedResult.transfer.state, "IN_TRANSIT");
  const deliveredResult =
    await restarted.runtime.service.ingestProviderEvent(delivered);
  assert.equal(deliveredResult.transfer.state, "COMPLETED");
  assert.deepEqual(
    deliveredResult.processedEvents.map((event) => event.kind),
    ["CALIZA_DELIVERED", "CHAPA_PAID"],
  );

  const replayed = createRuntime();
  const duplicate = await replayed.runtime.service.ingestProviderEvent(paid);
  assert.equal(duplicate.disposition, "DUPLICATE");
  assert.equal(duplicate.transfer.state, "COMPLETED");
  assert.equal(
    (
      await replayed.runtime.service.getTransfer(
        "demo_customer_001",
        transfer.id,
      )
    ).state,
    "COMPLETED",
  );

  const evidence = await first.connection.pool.query<{
    provider_event_id: string;
    state: string;
    attempt_count: number;
  }>(
    `SELECT provider_event_id, state::text, attempt_count
     FROM samra_core.provider_events
     WHERE (provider = 'chapa' AND provider_event_id = $1)
        OR (provider = 'caliza' AND provider_event_id = ANY($2::text[]))
     ORDER BY provider_event_id`,
    [
      paid.providerEventId,
      [accepted.providerEventId, delivered.providerEventId],
    ],
  );
  assert.deepEqual(evidence.rows, [
    {
      provider_event_id: accepted.providerEventId,
      state: "processed",
      attempt_count: 1,
    },
    {
      provider_event_id: delivered.providerEventId,
      state: "processed",
      attempt_count: 1,
    },
    {
      provider_event_id: paid.providerEventId,
      state: "processed",
      attempt_count: 3,
    },
  ]);
  const financialEffects = await first.connection.pool.query<{
    business_event_type: string;
    effect_count: string;
  }>(
    `SELECT business_event_type, count(*)::text AS effect_count
     FROM samra_core.ledger_journals
     WHERE business_event_id = $1
       AND business_event_type IN (
         'remittance_capture',
         'remittance_settlement',
         'remittance_fee_recognition'
       )
     GROUP BY business_event_type
     ORDER BY business_event_type`,
    [transfer.id],
  );
  assert.deepEqual(financialEffects.rows, [
    { business_event_type: "remittance_capture", effect_count: "1" },
    {
      business_event_type: "remittance_fee_recognition",
      effect_count: "1",
    },
    { business_event_type: "remittance_settlement", effect_count: "1" },
  ]);
  const outbox = await first.connection.pool.query<{ count: string }>(
    `SELECT count(*)::text AS count
     FROM samra_core.outbox_events outbox
     JOIN samra_core.remittance_transfers transfer
       ON transfer.id = outbox.aggregate_id
     WHERE transfer.external_ref = $1
       AND outbox.event_type = 'TRANSFER_STATE_CHANGED'`,
    [transfer.id],
  );
  assert.equal(outbox.rows[0]!.count, "2");
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

async function createSubmittedTransfer(runtime: DemoRuntime, label: string) {
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
    idempotencyKey: `${label}:${randomUUID()}`,
  });
}

function providerEvent(input: Omit<ProviderEvent, "payload">): ProviderEvent {
  return Object.freeze({
    ...input,
    payload: Object.freeze({ assurance: "financial-replay" }),
  });
}

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

test("alpha admission is atomic, identity-bound, revocable, restart-safe and capped at 100 lifetime customers", async () => {
  const first = createRuntime();
  const second = createRuntime();
  const pool = first.connection.pool;
  const access = new PostgresAlphaAccessStore(first.context);
  const onboarding = new PostgresCustomerOnboardingStore(first.context, access);
  const restarted = new PostgresCustomerOnboardingStore(
    second.context,
    new PostgresAlphaAccessStore(second.context),
  );
  const issuer = `https://${randomUUID()}.alpha.samra.test/`;
  const input = (subject: string) => ({
    issuer,
    subject,
    idempotencyKey: `alpha-start-${subject}`,
  });
  const invite = async (subject: string, expired = false) => {
    await pool.query(
      `INSERT INTO samra_core.alpha_invitations (issuer, subject, expires_at)
      VALUES ($1, $2, now() + $3::interval)`,
      [issuer, subject, expired ? "-1 hour" : "1 hour"],
    );
  };
  const limit = async (n: number) => {
    await pool.query(
      `UPDATE samra_core.alpha_release_controls SET admission_limit = $1`,
      [n],
    );
  };
  const count = async () =>
    Number(
      (
        await pool.query(
          `SELECT count(*) AS count FROM samra_core.alpha_admissions`,
        )
      ).rows[0].count,
    );
  const denied = async (subject: string) => {
    const before = await onboardingPersistenceCounts(pool);
    await assert.rejects(
      onboarding.startAuth0Onboarding(input(subject)),
      AlphaAccessDeniedError,
    );
    assert.deepEqual(await onboardingPersistenceCounts(pool), before);
  };
  assert.equal(await count(), 0);
  await denied("auth0|uninvited");
  await invite("auth0|first");
  await denied("auth0|first"); // migration starts closed
  await limit(1);
  await invite("auth0|expired", true);
  await denied("auth0|expired");
  await invite("auth0|revoked");
  await pool.query(
    `UPDATE samra_core.alpha_invitations SET revoked_at = now() WHERE issuer = $1 AND subject = $2`,
    [issuer, "auth0|revoked"],
  );
  await denied("auth0|revoked");
  await assert.rejects(
    access.assertAuth0Access(input("auth0|first")),
    AlphaAdmissionRequiredError,
  );
  await assert.rejects(
    onboarding.startAuth0Onboarding({
      ...input("auth0|first"),
      issuer: "https://wrong-tenant.samra.test/",
    }),
    AlphaAccessDeniedError,
  );

  // A failed outer unit of work must release both the customer and admission slot.
  const beforeFailure = await onboardingPersistenceCounts(pool);
  await assert.rejects(
    first.context.run(async () => {
      await onboarding.startAuth0Onboarding(input("auth0|first"));
      throw new Error("controlled alpha transaction failure");
    }),
    /controlled alpha transaction failure/,
  );
  assert.deepEqual(await onboardingPersistenceCounts(pool), beforeFailure);
  assert.equal(await count(), 0);

  const starts = await Promise.all([
    onboarding.startAuth0Onboarding(input("auth0|first")),
    restarted.startAuth0Onboarding({
      ...input("auth0|first"),
      idempotencyKey: "different-retry-key",
    }),
  ]);
  assert.deepEqual(starts.map((r) => r.created).sort(), [false, true]);
  assert.equal(starts[0]!.snapshot.customerId, starts[1]!.snapshot.customerId);
  assert.equal(starts[0]!.snapshot.state, "consent_pending");
  assert.equal(await count(), 1);
  await access.assertAuth0Access(input("auth0|first"));
  await pool.query(
    `UPDATE samra_core.alpha_invitations SET expires_at = now() - interval '1 hour' WHERE issuer = $1 AND subject = $2`,
    [issuer, "auth0|first"],
  );
  await limit(0); // pause new admission, preserve returning users
  assert.equal(
    (await restarted.startAuth0Onboarding(input("auth0|first"))).snapshot
      .customerId,
    starts[0]!.snapshot.customerId,
  );
  await access.assertAuth0Access(input("auth0|first"));

  // Competing instances reach each cohort exactly; revocation cannot recycle a slot.
  for (const [target, expectedNew] of [
    [5, 4],
    [25, 20],
    [100, 75],
  ]) {
    await limit(target!);
    const subjects = Array.from(
      { length: expectedNew! + 2 },
      (_, i) => `auth0|batch-${target}-${i}`,
    );
    await Promise.all(subjects.map((subject) => invite(subject)));
    const results = await Promise.allSettled(
      subjects.map((subject, i) =>
        (i % 2 === 0 ? onboarding : restarted).startAuth0Onboarding(
          input(subject),
        ),
      ),
    );
    assert.equal(
      results.filter((r) => r.status === "fulfilled").length,
      expectedNew,
    );
    for (const r of results)
      if (r.status === "rejected")
        assert.ok(r.reason instanceof AlphaAccessDeniedError);
    assert.equal(await count(), target);
  }
  await pool.query(
    `UPDATE samra_core.alpha_invitations SET revoked_at = now() WHERE issuer = $1 AND subject = $2`,
    [issuer, "auth0|first"],
  );
  await assert.rejects(
    access.assertAuth0Access(input("auth0|first")),
    AlphaAccessDeniedError,
  );
  await denied("auth0|first");
  await invite("auth0|one-too-many");
  await denied("auth0|one-too-many");
  assert.equal(await count(), 100);
  await assert.rejects(limit(101), /check constraint/);
  await assert.rejects(
    pool.query(
      `UPDATE samra_core.alpha_admissions SET slot = slot WHERE slot = 1`,
    ),
    /immutable/,
  );
  await assert.rejects(
    pool.query(`DELETE FROM samra_core.alpha_admissions WHERE slot = 1`),
    /immutable/,
  );
  await assert.rejects(
    pool.query(
      `UPDATE samra_core.alpha_invitations SET subject = 'auth0|replacement' WHERE issuer = $1 AND subject = $2`,
      [issuer, "auth0|first"],
    ),
    /immutable/,
  );
  const audit = await pool.query(
    `SELECT metadata FROM samra_core.audit_events WHERE action = 'alpha_customer_admitted'`,
  );
  assert.equal(audit.rowCount, 100);
  assert.doesNotMatch(JSON.stringify(audit.rows), /auth0|subject|issuer|email/);
});
