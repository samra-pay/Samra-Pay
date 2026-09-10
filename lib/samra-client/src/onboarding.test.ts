import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOnboardingJourneyView,
  SYNTHETIC_WALLET_PROVISIONING_INPUT,
  SyntheticSamraOnboardingSource,
  type CustomerConsentDecision,
  type CustomerOnboardingSnapshot,
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
  const approvedView = buildOnboardingJourneyView(approvedOnboarding, approved);
  assert.equal(approvedView.stage, "wallet_consent");
  assert.equal(approvedView.progressPercent, 75);
  assert.match(approvedView.description, /no real funds/i);

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
