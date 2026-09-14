import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOnboardingJourneyView,
  parseCustomerWalletDisclosure,
  STAGING_CUSTOMER_WALLET_DISCLOSURE,
  SYNTHETIC_CUSTOMER_WALLET_DISCLOSURE,
  SYNTHETIC_WALLET_PROVISIONING_INPUT,
  SyntheticSamraOnboardingSource,
  walletProvisioningInputFromDisclosure,
  type CustomerConsentDecision,
  type CustomerOnboardingSnapshot,
  type CustomerWalletDisclosure,
  type CustomerWalletSnapshot,
} from "./onboarding.ts";

const now = "2026-08-19T00:00:00.000Z";

function consentInput(
  onboarding: CustomerOnboardingSnapshot,
  decision: CustomerConsentDecision = "accepted",
) {
  return {
    bundleVersion: onboarding.consentBundle.bundleVersion,
    locale: onboarding.consentBundle.locale,
    decisions: onboarding.consentBundle.documents.map((document) => ({
      consentType: document.consentType,
      documentVersion: document.documentVersion,
      decision,
    })),
  } as const;
}

test("journey copy is deterministic and does not overstate capability", async () => {
  const source = new SyntheticSamraOnboardingSource(() => now);
  assert.equal(buildOnboardingJourneyView(null, null).stage, "welcome");

  const onboarding = await source.startOnboarding("start-demo-0001");
  const consent = buildOnboardingJourneyView(onboarding, null);
  assert.equal(consent.stage, "consent");
  assert.equal(consent.progressPercent, 25);

  const accepted = await source.submitConsentBundle(
    consentInput(onboarding),
    "consent-demo-001",
  );
  assert.equal(
    buildOnboardingJourneyView(accepted, null).stage,
    "identity_start",
  );

  const identity = await source.startIdentityVerification("identity-demo-01");
  assert.equal(
    buildOnboardingJourneyView(accepted, identity).stage,
    "identity_pending",
  );
  const approved = await source.advanceIdentity(
    identity.identityCaseId,
    "approved",
    "decision-demo-01",
  );
  const approvedOnboarding = await source.getOnboarding();
  const walletDisclosure = await source.getWalletDisclosure();
  const approvedView = buildOnboardingJourneyView(
    approvedOnboarding,
    approved,
    null,
    walletDisclosure,
  );
  assert.equal(approvedView.stage, "wallet_consent");
  assert.equal(approvedView.progressPercent, 75);
  assert.deepEqual(walletDisclosure, SYNTHETIC_CUSTOMER_WALLET_DISCLOSURE);
  assert.equal(approvedView.title, walletDisclosure.presentation.title);
  assert.equal(approvedView.description, walletDisclosure.presentation.body);
  assert.deepEqual(
    walletProvisioningInputFromDisclosure(walletDisclosure),
    SYNTHETIC_WALLET_PROVISIONING_INPUT,
  );

  const wallet = await source.startWalletProvisioning(
    SYNTHETIC_WALLET_PROVISIONING_INPUT,
    "wallet-demo-0001",
  );
  const walletReady = buildOnboardingJourneyView(
    await source.getOnboarding(),
    approved,
    wallet,
  );
  assert.equal(walletReady.stage, "wallet_ready");
  assert.match(walletReady.description, /funding.*disabled/i);
  assert.equal(wallet.synthetic, true);
  assert.equal(wallet.asset, "USDC");
  assert.equal(wallet.publicAddress, null);
});

test("customer-control setup remains an incomplete wallet stage", () => {
  const onboarding: CustomerOnboardingSnapshot = Object.freeze({
    onboardingId: "onboarding_control_setup",
    customerId: "customer_control_setup",
    state: "wallet_control_setup",
    latestCompletedStep: "wallet_provisioned",
    reasonFamily: null,
    version: 4,
    enteredAt: now,
    createdAt: now,
    updatedAt: now,
    consentBundle: {
      bundleVersion: "alpha-non-production-v2",
      locale: "en-US",
      legalEffect: "non_production",
      documents: [],
    },
    nextAllowedActions: ["await_customer_control_setup"],
  });
  const wallet: CustomerWalletSnapshot = Object.freeze({
    walletId: "wallet_0123456789abcdef0123456789abcdef",
    state: "customer_control_setup",
    reasonFamily: null,
    provider: "crossmint",
    asset: "USDC",
    network: "base-sepolia",
    custodyModel: "customer-controlled",
    publicAddress: null,
    configurationVersion: "crossmint-sandbox-evm-customer-email-v1",
    synthetic: false,
    version: 3,
    readyAt: null,
    createdAt: now,
    updatedAt: now,
    nextAllowedActions: ["await_customer_control_setup"],
  });
  const disclosure = STAGING_CUSTOMER_WALLET_DISCLOSURE;

  const view = buildOnboardingJourneyView(onboarding, null, wallet, disclosure);
  assert.equal(view.stage, "wallet_control_setup");
  assert.equal(view.progressPercent, 75);
  assert.equal(view.statusTone, "progress");
  assert.doesNotMatch(view.title, /ready|complete/iu);
  assert.match(view.description, /funding and remittance remain unavailable/iu);

  const legacyReadyView = buildOnboardingJourneyView(
    { ...onboarding, state: "wallet_ready" },
    null,
    {
      ...wallet,
      state: "ready",
      nextAllowedActions: ["await_customer_signer_setup"],
    },
    disclosure,
  );
  assert.equal(legacyReadyView.stage, "wallet_control_setup");
});

test("current consent actions interrupt later stages without erasing progress", () => {
  const onboarding: CustomerOnboardingSnapshot = Object.freeze({
    onboardingId: "onboarding_reconsent",
    customerId: "customer_reconsent",
    state: "identity_approved",
    latestCompletedStep: "identity_approved",
    reasonFamily: null,
    version: 7,
    enteredAt: now,
    createdAt: now,
    updatedAt: now,
    consentBundle: {
      bundleVersion: "alpha-non-production-v2",
      locale: "en-US",
      legalEffect: "non_production",
      documents: [],
    },
    nextAllowedActions: ["submit_required_consents"],
  });
  assert.equal(buildOnboardingJourneyView(onboarding, null).stage, "consent");

  const wallet: CustomerWalletSnapshot = Object.freeze({
    walletId: "wallet_reconsent_0123456789abcdef0123456789",
    state: "customer_control_setup",
    reasonFamily: null,
    provider: "crossmint",
    asset: "USDC",
    network: "evm",
    custodyModel: null,
    publicAddress: null,
    configurationVersion: "crossmint-sandbox-evm-customer-email-v1",
    synthetic: false,
    version: 4,
    readyAt: null,
    createdAt: now,
    updatedAt: now,
    nextAllowedActions: ["accept_current_wallet_disclosure"],
  });
  assert.equal(
    buildOnboardingJourneyView(
      {
        ...onboarding,
        state: "wallet_control_setup",
        nextAllowedActions: ["await_customer_control_setup"],
      },
      null,
      wallet,
      STAGING_CUSTOMER_WALLET_DISCLOSURE,
    ).stage,
    "wallet_consent",
  );
  assert.equal(
    buildOnboardingJourneyView(
      {
        ...onboarding,
        state: "wallet_ready",
        latestCompletedStep: "wallet_ready",
        nextAllowedActions: ["continue_to_funding_setup"],
      },
      null,
      {
        ...wallet,
        state: "ready",
        network: "synthetic",
        custodyModel: "synthetic",
        configurationVersion: "crossmint-synthetic-v1",
        synthetic: true,
        readyAt: now,
      },
      SYNTHETIC_CUSTOMER_WALLET_DISCLOSURE,
    ).stage,
    "wallet_consent",
  );
});

test("current wallet consent preserves funding and activation journey progress", () => {
  const readyWallet: CustomerWalletSnapshot = Object.freeze({
    walletId: "wallet_later_0123456789abcdef0123456789ab",
    state: "ready",
    reasonFamily: null,
    provider: "crossmint",
    asset: "USDC",
    network: "synthetic",
    custodyModel: "synthetic",
    publicAddress: null,
    configurationVersion: "crossmint-synthetic-v1",
    synthetic: true,
    version: 5,
    readyAt: now,
    createdAt: now,
    updatedAt: now,
    nextAllowedActions: ["continue_to_funding_setup"],
  });
  const laterOnboarding: CustomerOnboardingSnapshot = Object.freeze({
    onboardingId: "onboarding_later",
    customerId: "customer_later",
    state: "funding_ready",
    latestCompletedStep: "funding_setup",
    reasonFamily: null,
    version: 9,
    enteredAt: now,
    createdAt: now,
    updatedAt: now,
    consentBundle: {
      bundleVersion: "alpha-non-production-v2",
      locale: "en-US",
      legalEffect: "non_production",
      documents: [],
    },
    nextAllowedActions: ["activate_customer"],
  });

  assert.equal(
    buildOnboardingJourneyView(
      laterOnboarding,
      null,
      readyWallet,
      SYNTHETIC_CUSTOMER_WALLET_DISCLOSURE,
    ).stage,
    "account_setup",
  );
  assert.equal(
    buildOnboardingJourneyView(
      {
        ...laterOnboarding,
        state: "activated",
        latestCompletedStep: "activated",
        nextAllowedActions: [],
      },
      null,
      readyWallet,
      SYNTHETIC_CUSTOMER_WALLET_DISCLOSURE,
    ).stage,
    "complete",
  );
  assert.equal(
    buildOnboardingJourneyView(
      laterOnboarding,
      null,
      {
        ...readyWallet,
        nextAllowedActions: ["accept_current_wallet_disclosure"],
      },
      SYNTHETIC_CUSTOMER_WALLET_DISCLOSURE,
    ).stage,
    "wallet_consent",
  );
});

test("wallet disclosure acceptance fails closed for every incoherent tuple or copy", () => {
  const staging = STAGING_CUSTOMER_WALLET_DISCLOSURE;
  assert.equal(parseCustomerWalletDisclosure(staging), staging);
  assert.deepEqual(walletProvisioningInputFromDisclosure(staging), {
    bundleVersion: "sandbox-customer-wallet-v2",
    documentVersion: "sandbox-customer-wallet-v2",
    locale: "en-US",
    decision: "accepted",
  });

  const incoherent: unknown[] = [
    { ...staging, bundleVersion: "alpha-wallet-non-production-v2" },
    { ...staging, documentVersion: "alpha-wallet-non-production-v2" },
    { ...staging, locale: "am-ET" },
    { ...staging, legalEffect: "production" },
    { ...staging, environment: "synthetic" },
    { ...staging, createsRealWallet: false },
    { ...staging, customerControlSetupRequired: false },
    { ...staging, fundingEnabled: true },
    { ...staging, remittanceEnabled: true },
    {
      ...staging,
      presentation: { ...staging.presentation, body: "Substituted copy" },
    },
    { ...staging, provider: "crossmint" },
  ];

  for (const candidate of incoherent) {
    assert.throws(
      () => parseCustomerWalletDisclosure(candidate),
      /complete, recognized server contract/i,
    );
    assert.throws(
      () =>
        walletProvisioningInputFromDisclosure(
          candidate as CustomerWalletDisclosure,
        ),
      /complete, recognized server contract/i,
    );
  }
});

test("staging wallet ready and ambiguous-failure copy remain evidence-bound", () => {
  const baseOnboarding: CustomerOnboardingSnapshot = Object.freeze({
    onboardingId: "onboarding_staging_copy",
    customerId: "customer_staging_copy",
    state: "wallet_ready",
    latestCompletedStep: "wallet_ready",
    reasonFamily: null,
    version: 5,
    enteredAt: now,
    createdAt: now,
    updatedAt: now,
    consentBundle: {
      bundleVersion: "alpha-non-production-v2",
      locale: "en-US",
      legalEffect: "non_production",
      documents: [],
    },
    nextAllowedActions: ["review_wallet"],
  });
  const stagingWallet: CustomerWalletSnapshot = Object.freeze({
    walletId: "wallet_staging_copy_000000000000000000000001",
    state: "ready",
    reasonFamily: null,
    provider: "crossmint",
    asset: "USDC",
    network: "base-sepolia",
    custodyModel: "customer-controlled",
    publicAddress: null,
    configurationVersion: "crossmint-sandbox-evm-customer-email-v1",
    synthetic: false,
    version: 5,
    readyAt: now,
    createdAt: now,
    updatedAt: now,
    nextAllowedActions: ["review_wallet"],
  });

  const ready = buildOnboardingJourneyView(
    baseOnboarding,
    null,
    stagingWallet,
    STAGING_CUSTOMER_WALLET_DISCLOSURE,
  );
  assert.equal(ready.stage, "wallet_ready");
  assert.match(ready.title, /non-production wallet/i);
  assert.doesNotMatch(`${ready.title} ${ready.description}`, /synthetic/i);

  const pending = buildOnboardingJourneyView(
    { ...baseOnboarding, state: "wallet_provisioning" },
    null,
    { ...stagingWallet, state: "provisioning", readyAt: null },
    SYNTHETIC_CUSTOMER_WALLET_DISCLOSURE,
  );
  assert.equal(pending.stage, "wallet_provisioning");
  assert.match(pending.description, /provider outcome is not reconciled/i);
  assert.match(pending.description, /another create remains blocked/i);
  assert.doesNotMatch(`${pending.title} ${pending.description}`, /synthetic/i);

  const retry = buildOnboardingJourneyView(
    { ...baseOnboarding, state: "wallet_provisioning" },
    null,
    { ...stagingWallet, state: "error", reasonFamily: "provider_unavailable" },
    SYNTHETIC_CUSTOMER_WALLET_DISCLOSURE,
  );
  assert.equal(retry.stage, "wallet_error");
  assert.match(retry.description, /outcome is unknown/i);
  assert.match(retry.description, /Samra command is preserved/i);
  assert.match(retry.description, /blocked until the result is reconciled/i);
  assert.doesNotMatch(retry.description, /no second|cannot create|duplicate/i);
  assert.doesNotMatch(`${retry.title} ${retry.description}`, /synthetic/i);

  const mismatchedSynthetic = buildOnboardingJourneyView(
    { ...baseOnboarding, state: "wallet_provisioning" },
    null,
    {
      ...stagingWallet,
      state: "error",
      synthetic: true,
      configurationVersion: "crossmint-synthetic-v1",
    },
    STAGING_CUSTOMER_WALLET_DISCLOSURE,
  );
  assert.equal(mismatchedSynthetic.stage, "wallet_error");
  assert.match(
    mismatchedSynthetic.description,
    /automatic retry is unavailable/i,
  );
  assert.match(mismatchedSynthetic.description, /does not match/i);
});

test("synthetic consent requires the exact catalog and preserves key replays", async () => {
  const source = new SyntheticSamraOnboardingSource(() => now);
  const onboarding = await source.startOnboarding("start-demo-0002");
  const input = consentInput(onboarding);
  const first = await source.submitConsentBundle(input, "consent-demo-002");
  const replay = await source.submitConsentBundle(input, "consent-demo-002");
  assert.equal(first, replay);
  assert.equal(first.state, "identity_in_progress");

  await assert.rejects(
    source.submitConsentBundle(
      { ...input, locale: "am-ET" },
      "consent-demo-002",
    ),
    /reused for a different command/i,
  );
});

test("declined consent, identity review, provider error retry, and reset are explicit", async () => {
  const source = new SyntheticSamraOnboardingSource(() => now);
  let onboarding = await source.startOnboarding("start-demo-0003");
  onboarding = await source.submitConsentBundle(
    consentInput(onboarding, "declined"),
    "consent-demo-003",
  );
  assert.equal(onboarding.state, "consent_pending");
  assert.equal(onboarding.reasonFamily, "required_consent_declined");

  onboarding = await source.submitConsentBundle(
    consentInput(onboarding),
    "consent-demo-004",
  );
  const identity = await source.startIdentityVerification("identity-demo-02");
  const errored = await source.advanceIdentity(
    identity.identityCaseId,
    "error",
    "decision-demo-02",
  );
  assert.equal(
    buildOnboardingJourneyView(onboarding, errored).stage,
    "identity_error",
  );
  const retried = await source.startIdentityVerification("identity-demo-03");
  assert.equal(retried.state, "pending");
  assert.equal(retried.identityCaseId, identity.identityCaseId);
  assert.equal(retried.version, errored.version + 1);

  const reviewed = await source.advanceIdentity(
    identity.identityCaseId,
    "review",
    "decision-demo-03",
  );
  assert.equal(
    buildOnboardingJourneyView(await source.getOnboarding(), reviewed).stage,
    "identity_review",
  );

  await source.reset();
  assert.equal(await source.getOnboarding(), null);
  assert.equal(await source.getIdentityCase(), null);
  assert.equal(await source.getWallet(), null);
});

test("synthetic wallet consent is exact, replay-safe, and creates one provider-neutral record", async () => {
  const source = new SyntheticSamraOnboardingSource(() => now);
  const onboarding = await source.startOnboarding("start-demo-0005");
  await source.submitConsentBundle(
    consentInput(onboarding),
    "consent-demo-006",
  );
  const identity = await source.startIdentityVerification("identity-demo-05");
  await source.advanceIdentity(
    identity.identityCaseId,
    "approved",
    "decision-demo-06",
  );

  const first = await source.startWalletProvisioning(
    SYNTHETIC_WALLET_PROVISIONING_INPUT,
    "wallet-demo-0002",
  );
  const replay = await source.startWalletProvisioning(
    SYNTHETIC_WALLET_PROVISIONING_INPUT,
    "wallet-demo-0002",
  );
  const secondCommand = await source.startWalletProvisioning(
    SYNTHETIC_WALLET_PROVISIONING_INPUT,
    "wallet-demo-0003",
  );

  assert.equal(first, replay);
  assert.equal(first, secondCommand);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.nextAllowedActions), true);
  assert.equal((await source.getOnboarding())?.state, "wallet_ready");

  await assert.rejects(
    source.startWalletProvisioning(
      {
        ...SYNTHETIC_WALLET_PROVISIONING_INPUT,
        documentVersion: "wrong-version" as never,
      },
      "wallet-demo-0004",
    ),
    /does not match the current catalog/i,
  );
});

test("contradictory terminal identity decisions restrict onboarding", async () => {
  const source = new SyntheticSamraOnboardingSource(() => now);
  const started = await source.startOnboarding("start-demo-0004");
  await source.submitConsentBundle(consentInput(started), "consent-demo-005");
  const identity = await source.startIdentityVerification("identity-demo-04");
  const approved = await source.advanceIdentity(
    identity.identityCaseId,
    "approved",
    "decision-demo-04",
  );
  const preserved = await source.advanceIdentity(
    identity.identityCaseId,
    "declined",
    "decision-demo-05",
  );
  assert.equal(preserved, approved);
  const onboarding = await source.getOnboarding();
  assert.equal(onboarding?.state, "restricted");
  assert.equal(
    buildOnboardingJourneyView(onboarding, preserved).stage,
    "restricted",
  );
});

test("server activation completes the journey even with a retained ready wallet", async () => {
  const source = new SyntheticSamraOnboardingSource(() => now);
  const started = await source.startOnboarding("activation-handoff-start");
  await source.submitConsentBundle(
    consentInput(started),
    "activation-handoff-consent",
  );
  const identity = await source.startIdentityVerification(
    "activation-handoff-identity",
  );
  const approved = await source.advanceIdentity(
    identity.identityCaseId,
    "approved",
    "activation-handoff-approval",
  );
  const wallet = await source.startWalletProvisioning(
    SYNTHETIC_WALLET_PROVISIONING_INPUT,
    "activation-handoff-wallet",
  );
  const walletReady = (await source.getOnboarding())!;
  const activated: CustomerOnboardingSnapshot = {
    ...walletReady,
    state: "activated",
    latestCompletedStep: "synthetic_account_activated",
    version: walletReady.version + 2,
  };

  // Only the server's activated state completes onboarding. A ready wallet or
  // an intermediate funding state cannot grant financial access.
  assert.equal(
    buildOnboardingJourneyView(walletReady, approved, wallet).stage,
    "wallet_ready",
  );
  assert.notEqual(
    buildOnboardingJourneyView(
      { ...walletReady, state: "funding_ready" },
      approved,
      wallet,
    ).stage,
    "complete",
  );
  for (const retainedWallet of [wallet, null]) {
    const view = buildOnboardingJourneyView(
      activated,
      approved,
      retainedWallet,
    );
    assert.equal(view.stage, "complete");
    assert.equal(view.progressPercent, 100);
  }
  // A restriction or unresolved wallet result continues to take precedence.
  for (const [state, expected] of [
    ["restricted", "restricted"],
    ["error", "wallet_error"],
    ["provisioning", "wallet_provisioning"],
  ] as const) {
    assert.equal(
      buildOnboardingJourneyView(activated, approved, { ...wallet, state })
        .stage,
      expected,
    );
  }
  assert.equal(
    buildOnboardingJourneyView(
      { ...activated, state: "restricted" },
      approved,
      wallet,
    ).stage,
    "restricted",
  );
});
