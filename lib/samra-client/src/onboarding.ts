import { SAMRA_LEGAL_PATHS } from "./legal.ts";

export const CUSTOMER_ONBOARDING_STATES = Object.freeze([
  "not_started",
  "authenticated",
  "consent_pending",
  "identity_in_progress",
  "identity_review",
  "identity_approved",
  "bank_link_pending",
  "bank_matched",
  "wallet_consent_pending",
  "wallet_provisioning",
  "wallet_ready",
  "funding_ready",
  "activated",
  "restricted",
] as const);

export type CustomerOnboardingState =
  (typeof CUSTOMER_ONBOARDING_STATES)[number];

export type CustomerConsentType =
  "terms_of_service" | "privacy_notice" | "electronic_communications";

export type CustomerConsentDecision = "accepted" | "declined";

export type CustomerConsentDocument = Readonly<{
  consentType: CustomerConsentType;
  documentVersion: string;
  required: boolean;
}>;

export type CustomerConsentBundle = Readonly<{
  bundleVersion: string;
  locale: string;
  legalEffect: "non_production";
  documents: readonly CustomerConsentDocument[];
}>;

export type CustomerOnboardingSnapshot = Readonly<{
  onboardingId: string;
  customerId: string;
  state: CustomerOnboardingState;
  latestCompletedStep: string;
  reasonFamily: string | null;
  version: number;
  enteredAt: string;
  createdAt: string;
  updatedAt: string;
  consentBundle: CustomerConsentBundle;
  nextAllowedActions: readonly string[];
}>;

export type CustomerIdentityCaseState =
  "created" | "pending" | "review" | "approved" | "declined" | "error";

export type CustomerIdentityProviderDecision = Exclude<
  CustomerIdentityCaseState,
  "created"
>;

export type CustomerIdentityCaseSnapshot = Readonly<{
  identityCaseId: string;
  state: CustomerIdentityCaseState;
  reasonFamily: string | null;
  provider: "persona";
  synthetic: true;
  version: number;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
  nextAllowedActions: readonly string[];
}>;

export type CustomerWalletState =
  "created" | "provisioning" | "ready" | "restricted" | "error";

export type StartCustomerWalletProvisioningInput = Readonly<{
  bundleVersion:
    "alpha-wallet-non-production-v1" | "sandbox-customer-wallet-v1";
  documentVersion:
    "alpha-wallet-non-production-v1" | "sandbox-customer-wallet-v1";
  locale: "en-US";
  decision: "accepted";
}>;

export const SYNTHETIC_WALLET_PROVISIONING_INPUT: StartCustomerWalletProvisioningInput =
  Object.freeze({
    bundleVersion: "alpha-wallet-non-production-v1",
    documentVersion: "alpha-wallet-non-production-v1",
    locale: "en-US",
    decision: "accepted",
  });

export type CustomerWalletSnapshot = Readonly<{
  walletId: string;
  state: CustomerWalletState;
  reasonFamily: string | null;
  provider: "crossmint";
  asset: "USDC";
  network: string | null;
  custodyModel: string | null;
  publicAddress: string | null;
  configurationVersion:
    "crossmint-synthetic-v1" | "crossmint-sandbox-evm-customer-email-v1";
  synthetic: boolean;
  version: number;
  readyAt: string | null;
  createdAt: string;
  updatedAt: string;
  nextAllowedActions: readonly string[];
}>;

export type SubmitCustomerConsentBundleInput = Readonly<{
  bundleVersion: string;
  locale: string;
  decisions: readonly Readonly<{
    consentType: CustomerConsentType;
    documentVersion: string;
    decision: CustomerConsentDecision;
  }>[];
}>;

export type CustomerConsentPresentation = Readonly<{
  title: string;
  summary: string;
  href: string | null;
}>;

export function getCustomerConsentPresentation(
  consentType: CustomerConsentType,
): CustomerConsentPresentation {
  const presentations: Readonly<
    Record<CustomerConsentType, CustomerConsentPresentation>
  > = {
    terms_of_service: Object.freeze({
      title: "Terms of Service",
      summary: "The rules for using the Samra Pay alpha experience.",
      href: SAMRA_LEGAL_PATHS.terms,
    }),
    privacy_notice: Object.freeze({
      title: "Privacy Notice",
      summary: "How Samra handles onboarding and verification information.",
      href: SAMRA_LEGAL_PATHS.privacy,
    }),
    electronic_communications: Object.freeze({
      title: "Electronic Communications",
      summary: "Permission to deliver required notices electronically.",
      href: SAMRA_LEGAL_PATHS["electronic-communications"],
    }),
  };
  return presentations[consentType];
}

export interface SamraOnboardingSource {
  getOnboarding(): Promise<CustomerOnboardingSnapshot | null>;
  startOnboarding(idempotencyKey: string): Promise<CustomerOnboardingSnapshot>;
  submitConsentBundle(
    input: SubmitCustomerConsentBundleInput,
    idempotencyKey: string,
  ): Promise<CustomerOnboardingSnapshot>;
  getIdentityCase(): Promise<CustomerIdentityCaseSnapshot | null>;
  startIdentityVerification(
    idempotencyKey: string,
  ): Promise<CustomerIdentityCaseSnapshot>;
  getWallet(): Promise<CustomerWalletSnapshot | null>;
  startWalletProvisioning(
    input: StartCustomerWalletProvisioningInput,
    idempotencyKey: string,
  ): Promise<CustomerWalletSnapshot>;
}

export interface SamraOnboardingDemoControls {
  advanceIdentity(
    identityCaseId: string,
    decision: CustomerIdentityProviderDecision,
    idempotencyKey: string,
  ): Promise<CustomerIdentityCaseSnapshot>;
  reset?(): Promise<void>;
}

export type OnboardingJourneyStage =
  | "welcome"
  | "consent"
  | "identity_start"
  | "identity_pending"
  | "identity_review"
  | "identity_approved"
  | "identity_declined"
  | "identity_error"
  | "wallet_consent"
  | "wallet_provisioning"
  | "wallet_ready"
  | "wallet_error"
  | "account_setup"
  | "complete"
  | "restricted";

export type OnboardingJourneyView = Readonly<{
  stage: OnboardingJourneyStage;
  step: number;
  totalSteps: 4;
  progressPercent: number;
  eyebrow: string;
  title: string;
  description: string;
  statusTone: "neutral" | "progress" | "success" | "warning" | "danger";
}>;

const JOURNEY_COPY: Readonly<
  Record<
    OnboardingJourneyStage,
    Omit<OnboardingJourneyView, "stage" | "totalSteps" | "progressPercent">
  >
> = Object.freeze({
  welcome: {
    step: 0,
    eyebrow: "Create your Samra profile",
    title: "A clear start, with no surprises",
    description:
      "We will record your required agreements, verify your identity, and show what remains before any financial capability is enabled.",
    statusTone: "neutral",
  },
  consent: {
    step: 1,
    eyebrow: "Step 1 of 4",
    title: "Review and accept the required agreements",
    description:
      "Each agreement is versioned and recorded separately. Nothing is preselected.",
    statusTone: "neutral",
  },
  identity_start: {
    step: 2,
    eyebrow: "Step 2 of 4",
    title: "Verify your identity",
    description:
      "Samra owns your onboarding status. Persona is the current verification adapter and cannot activate financial access by itself.",
    statusTone: "neutral",
  },
  identity_pending: {
    step: 2,
    eyebrow: "Identity verification",
    title: "Verification is in progress",
    description:
      "You can leave safely and return later. Samra will resume from the durable server state.",
    statusTone: "progress",
  },
  identity_review: {
    step: 2,
    eyebrow: "Identity verification",
    title: "Your verification needs review",
    description:
      "No action is required unless support contacts you. Financial access remains blocked during review.",
    statusTone: "warning",
  },
  identity_approved: {
    step: 3,
    eyebrow: "Step 3 of 4",
    title: "Identity verified",
    description:
      "Verification is complete. Review the wallet disclosure before any synthetic provisioning begins.",
    statusTone: "success",
  },
  identity_declined: {
    step: 2,
    eyebrow: "Identity verification",
    title: "We could not complete verification",
    description:
      "Financial access remains blocked. Contact support for the reviewed recovery or appeal path.",
    statusTone: "danger",
  },
  identity_error: {
    step: 2,
    eyebrow: "Identity verification",
    title: "Verification is temporarily unavailable",
    description:
      "Your progress is saved. Retry when you are ready; a provider outage cannot erase your Samra onboarding record.",
    statusTone: "danger",
  },
  wallet_consent: {
    step: 3,
    eyebrow: "Step 3 of 4",
    title: "Create your synthetic USDC wallet",
    description:
      "Crossmint is isolated behind a Samra-owned adapter. This alpha step records your disclosure decision and creates no real funds or financial access.",
    statusTone: "neutral",
  },
  wallet_provisioning: {
    step: 3,
    eyebrow: "Wallet setup",
    title: "Your wallet is being prepared",
    description:
      "Your progress is durable. You can leave and return while Samra safely resumes the provider result.",
    statusTone: "progress",
  },
  wallet_ready: {
    step: 3,
    eyebrow: "Step 3 of 4 complete",
    title: "Your synthetic wallet is ready",
    description:
      "The wallet record is ready. Funding, balances, remittance access, and live USDC remain disabled until their separate gates are approved.",
    statusTone: "success",
  },
  wallet_error: {
    step: 3,
    eyebrow: "Wallet setup",
    title: "Wallet setup is temporarily unavailable",
    description:
      "Your disclosure and Samra record are saved. Retry safely; a provider failure cannot create a second wallet.",
    statusTone: "danger",
  },
  account_setup: {
    step: 3,
    eyebrow: "Step 3 of 4",
    title: "Set up your account",
    description:
      "Bank, wallet, and funding setup will appear here only after each capability has a verified provider and policy boundary.",
    statusTone: "progress",
  },
  complete: {
    step: 4,
    eyebrow: "Onboarding complete",
    title: "Your Samra account is ready",
    description:
      "Your account setup is complete. Open your account to see the features available to you.",
    statusTone: "success",
  },
  restricted: {
    step: 2,
    eyebrow: "Account review",
    title: "Your onboarding needs support",
    description:
      "Financial access remains blocked while the reviewed support or compliance path is completed.",
    statusTone: "danger",
  },
});

export function buildOnboardingJourneyView(
  onboarding: CustomerOnboardingSnapshot | null,
  identityCase: CustomerIdentityCaseSnapshot | null,
  wallet: CustomerWalletSnapshot | null = null,
): OnboardingJourneyView {
  const stage = resolveJourneyStage(onboarding, identityCase, wallet);
  const copy = JOURNEY_COPY[stage];
  return Object.freeze({
    stage,
    totalSteps: 4,
    ...copy,
    progressPercent: Math.round((copy.step / 4) * 100),
  });
}

function resolveJourneyStage(
  onboarding: CustomerOnboardingSnapshot | null,
  identityCase: CustomerIdentityCaseSnapshot | null,
  wallet: CustomerWalletSnapshot | null,
): OnboardingJourneyStage {
  if (!onboarding || onboarding.state === "not_started") return "welcome";
  if (
    onboarding.state === "authenticated" ||
    onboarding.state === "consent_pending"
  ) {
    return "consent";
  }
  if (onboarding.state === "restricted") {
    return identityCase?.state === "declined"
      ? "identity_declined"
      : "restricted";
  }
  if (onboarding.state === "identity_review") return "identity_review";
  if (wallet?.state === "restricted") return "restricted";
  if (wallet?.state === "error") return "wallet_error";
  if (wallet?.state === "provisioning" || wallet?.state === "created") {
    return "wallet_provisioning";
  }
  // A retained wallet snapshot must not hide the server's later activation.
  // Restrictions and unresolved wallet results still take precedence.
  if (onboarding.state === "activated") return "complete";
  if (wallet?.state === "ready" || onboarding.state === "wallet_ready") {
    return "wallet_ready";
  }
  if (onboarding.state === "wallet_provisioning") return "wallet_provisioning";
  if (
    onboarding.state === "identity_approved" ||
    onboarding.state === "wallet_consent_pending"
  ) {
    return "wallet_consent";
  }
  if (onboarding.state === "identity_in_progress") {
    if (!identityCase || identityCase.state === "created") {
      return "identity_start";
    }
    if (identityCase.state === "review") return "identity_review";
    if (identityCase.state === "approved") return "identity_approved";
    if (identityCase.state === "declined") return "identity_declined";
    if (identityCase.state === "error") return "identity_error";
    return "identity_pending";
  }
  return "account_setup";
}

const SYNTHETIC_CONSENT_BUNDLE: CustomerConsentBundle = Object.freeze({
  bundleVersion: "alpha-non-production-v2",
  locale: "en-US",
  legalEffect: "non_production",
  documents: Object.freeze([
    Object.freeze({
      consentType: "terms_of_service" as const,
      documentVersion: "alpha-non-production-v2",
      required: true as const,
    }),
    Object.freeze({
      consentType: "privacy_notice" as const,
      documentVersion: "alpha-non-production-v2",
      required: true as const,
    }),
    Object.freeze({
      consentType: "electronic_communications" as const,
      documentVersion: "alpha-non-production-v2",
      required: true as const,
    }),
  ]),
});

type Replay<T> = Readonly<{ fingerprint: string; response: T }>;

export class SyntheticSamraOnboardingSource
  implements SamraOnboardingSource, SamraOnboardingDemoControls
{
  readonly #clock: () => string;
  readonly #onboardingReplays = new Map<
    string,
    Replay<CustomerOnboardingSnapshot>
  >();
  readonly #identityReplays = new Map<
    string,
    Replay<CustomerIdentityCaseSnapshot>
  >();
  readonly #walletReplays = new Map<string, Replay<CustomerWalletSnapshot>>();
  #onboarding: CustomerOnboardingSnapshot | null = null;
  #identityCase: CustomerIdentityCaseSnapshot | null = null;
  #wallet: CustomerWalletSnapshot | null = null;

  constructor(clock: () => string = () => new Date().toISOString()) {
    this.#clock = clock;
  }

  async getOnboarding(): Promise<CustomerOnboardingSnapshot | null> {
    return this.#onboarding;
  }

  async startOnboarding(
    idempotencyKey: string,
  ): Promise<CustomerOnboardingSnapshot> {
    assertIdempotencyKey(idempotencyKey);
    if (this.#onboarding) return this.#onboarding;
    const now = this.#clock();
    this.#onboarding = freezeOnboarding({
      onboardingId: "onboarding_synthetic_alpha",
      customerId: "customer_synthetic_alpha",
      state: "consent_pending",
      latestCompletedStep: "authenticated",
      reasonFamily: null,
      version: 1,
      enteredAt: now,
      createdAt: now,
      updatedAt: now,
      consentBundle: SYNTHETIC_CONSENT_BUNDLE,
      nextAllowedActions: ["submit_consents", "sign_out"],
    });
    return this.#onboarding;
  }

  async submitConsentBundle(
    input: SubmitCustomerConsentBundleInput,
    idempotencyKey: string,
  ): Promise<CustomerOnboardingSnapshot> {
    assertIdempotencyKey(idempotencyKey);
    const onboarding = this.#requireOnboarding();
    const fingerprint = JSON.stringify(input);
    const replay = this.#onboardingReplays.get(idempotencyKey);
    if (replay) {
      if (replay.fingerprint !== fingerprint) throw idempotencyConflict();
      return replay.response;
    }
    if (onboarding.state !== "consent_pending") {
      throw new Error("Required consent can be submitted only while pending.");
    }
    validateConsentBundle(input, onboarding.consentBundle);
    const accepted = input.decisions.every(
      (decision) => decision.decision === "accepted",
    );
    const now = this.#clock();
    this.#onboarding = freezeOnboarding({
      ...onboarding,
      state: accepted ? "identity_in_progress" : "consent_pending",
      latestCompletedStep: accepted ? "required_consents" : "authenticated",
      reasonFamily: accepted ? null : "required_consent_declined",
      version: onboarding.version + 1,
      enteredAt: now,
      updatedAt: now,
      nextAllowedActions: accepted
        ? ["start_identity_verification", "sign_out"]
        : ["submit_consents", "sign_out"],
    });
    this.#onboardingReplays.set(
      idempotencyKey,
      Object.freeze({ fingerprint, response: this.#onboarding }),
    );
    return this.#onboarding;
  }

  async getIdentityCase(): Promise<CustomerIdentityCaseSnapshot | null> {
    return this.#identityCase;
  }

  async startIdentityVerification(
    idempotencyKey: string,
  ): Promise<CustomerIdentityCaseSnapshot> {
    assertIdempotencyKey(idempotencyKey);
    const onboarding = this.#requireOnboarding();
    if (this.#identityCase && this.#identityCase.state !== "error") {
      return this.#identityCase;
    }
    if (!this.#identityCase && onboarding.state !== "identity_in_progress") {
      throw new Error(
        "Identity verification can begin only after required consent.",
      );
    }
    const now = this.#clock();
    const priorIdentityCase = this.#identityCase;
    this.#identityCase = freezeIdentityCase({
      identityCaseId:
        priorIdentityCase?.identityCaseId ?? "identity_case_synthetic_alpha",
      state: "pending",
      reasonFamily: null,
      provider: "persona",
      synthetic: true,
      version: priorIdentityCase ? priorIdentityCase.version + 1 : 2,
      decidedAt: null,
      createdAt: priorIdentityCase?.createdAt ?? now,
      updatedAt: now,
      nextAllowedActions: ["continue_identity_verification", "exit_onboarding"],
    });
    return this.#identityCase;
  }

  async getWallet(): Promise<CustomerWalletSnapshot | null> {
    return this.#wallet;
  }

  async startWalletProvisioning(
    input: StartCustomerWalletProvisioningInput,
    idempotencyKey: string,
  ): Promise<CustomerWalletSnapshot> {
    assertIdempotencyKey(idempotencyKey);
    const onboarding = this.#requireOnboarding();
    const fingerprint = JSON.stringify(input);
    const replay = this.#walletReplays.get(idempotencyKey);
    if (replay) {
      if (replay.fingerprint !== fingerprint) throw idempotencyConflict();
      return replay.response;
    }
    validateWalletProvisioningInput(input);
    if (this.#wallet) return this.#wallet;
    if (onboarding.state !== "identity_approved") {
      throw new Error(
        "Wallet provisioning can begin only after identity approval.",
      );
    }
    const now = this.#clock();
    this.#wallet = freezeWallet({
      walletId: "wallet_0123456789abcdef0123456789abcdef",
      state: "ready",
      reasonFamily: null,
      provider: "crossmint",
      asset: "USDC",
      network: "synthetic",
      custodyModel: null,
      publicAddress: null,
      configurationVersion: "crossmint-synthetic-v1",
      synthetic: true,
      version: 2,
      readyAt: now,
      createdAt: now,
      updatedAt: now,
      nextAllowedActions: ["review_wallet", "exit_onboarding"],
    });
    this.#onboarding = updateSyntheticOnboarding(onboarding, {
      state: "wallet_ready",
      latestCompletedStep: "wallet_ready",
      reasonFamily: null,
      now,
    });
    this.#walletReplays.set(
      idempotencyKey,
      Object.freeze({ fingerprint, response: this.#wallet }),
    );
    return this.#wallet;
  }

  async advanceIdentity(
    identityCaseId: string,
    decision: CustomerIdentityProviderDecision,
    idempotencyKey: string,
  ): Promise<CustomerIdentityCaseSnapshot> {
    assertIdempotencyKey(idempotencyKey);
    const onboarding = this.#requireOnboarding();
    const identityCase = this.#identityCase;
    if (!identityCase || identityCase.identityCaseId !== identityCaseId) {
      throw new Error("The synthetic identity case was not found.");
    }
    const fingerprint = JSON.stringify({ identityCaseId, decision });
    const replay = this.#identityReplays.get(idempotencyKey);
    if (replay) {
      if (replay.fingerprint !== fingerprint) throw idempotencyConflict();
      return replay.response;
    }
    const now = this.#clock();
    const terminalConflict =
      (identityCase.state === "approved" && decision === "declined") ||
      (identityCase.state === "declined" && decision === "approved");
    if (terminalConflict) {
      this.#onboarding = updateSyntheticOnboarding(onboarding, {
        state: "restricted",
        latestCompletedStep: "identity_decision",
        reasonFamily: "identity_provider_conflict",
        now,
      });
      this.#identityReplays.set(
        idempotencyKey,
        Object.freeze({ fingerprint, response: identityCase }),
      );
      return identityCase;
    }
    if (
      identityCase.state === "approved" ||
      identityCase.state === "declined"
    ) {
      this.#identityReplays.set(
        idempotencyKey,
        Object.freeze({ fingerprint, response: identityCase }),
      );
      return identityCase;
    }

    this.#identityCase = freezeIdentityCase({
      ...identityCase,
      state: decision,
      reasonFamily:
        decision === "declined"
          ? "identity_declined"
          : decision === "error"
            ? "identity_provider_error"
            : null,
      version: identityCase.version + 1,
      decidedAt:
        decision === "approved" || decision === "declined" ? now : null,
      updatedAt: now,
      nextAllowedActions: identityActions(decision),
    });
    if (decision === "review") {
      this.#onboarding = updateSyntheticOnboarding(onboarding, {
        state: "identity_review",
        latestCompletedStep: "identity_submitted",
        reasonFamily: null,
        now,
      });
    } else if (decision === "approved") {
      this.#onboarding = updateSyntheticOnboarding(onboarding, {
        state: "identity_approved",
        latestCompletedStep: "identity_approved",
        reasonFamily: null,
        now,
      });
    } else if (decision === "declined") {
      this.#onboarding = updateSyntheticOnboarding(onboarding, {
        state: "restricted",
        latestCompletedStep: "identity_decision",
        reasonFamily: "identity_declined",
        now,
      });
    }
    this.#identityReplays.set(
      idempotencyKey,
      Object.freeze({ fingerprint, response: this.#identityCase }),
    );
    return this.#identityCase;
  }

  async reset(): Promise<void> {
    this.#onboarding = null;
    this.#identityCase = null;
    this.#wallet = null;
    this.#onboardingReplays.clear();
    this.#identityReplays.clear();
    this.#walletReplays.clear();
  }

  #requireOnboarding(): CustomerOnboardingSnapshot {
    if (!this.#onboarding) {
      throw new Error("The synthetic onboarding journey has not started.");
    }
    return this.#onboarding;
  }
}

function updateSyntheticOnboarding(
  onboarding: CustomerOnboardingSnapshot,
  input: Readonly<{
    state: CustomerOnboardingState;
    latestCompletedStep: string;
    reasonFamily: string | null;
    now: string;
  }>,
): CustomerOnboardingSnapshot {
  return freezeOnboarding({
    ...onboarding,
    state: input.state,
    latestCompletedStep: input.latestCompletedStep,
    reasonFamily: input.reasonFamily,
    version: onboarding.version + 1,
    enteredAt: input.now,
    updatedAt: input.now,
    nextAllowedActions: onboardingActions(input.state),
  });
}

function onboardingActions(state: CustomerOnboardingState): readonly string[] {
  if (state === "identity_review") return ["await_identity_review", "sign_out"];
  if (state === "identity_approved") return ["continue_to_wallet_setup"];
  if (state === "wallet_ready") return ["review_wallet", "sign_out"];
  if (state === "restricted") return ["contact_support", "sign_out"];
  return ["resume_onboarding", "sign_out"];
}

function identityActions(
  state: CustomerIdentityProviderDecision,
): readonly string[] {
  const actions: Readonly<
    Record<CustomerIdentityProviderDecision, readonly string[]>
  > = {
    pending: ["continue_identity_verification", "exit_onboarding"],
    review: ["await_identity_review", "contact_support"],
    approved: ["continue_to_wallet_setup"],
    declined: ["contact_support"],
    error: ["retry_identity_verification", "contact_support"],
  };
  return actions[state];
}

function validateConsentBundle(
  input: SubmitCustomerConsentBundleInput,
  bundle: CustomerConsentBundle,
): void {
  if (
    input.bundleVersion !== bundle.bundleVersion ||
    input.locale !== bundle.locale ||
    input.decisions.length !== bundle.documents.length
  ) {
    throw new Error("The consent bundle does not match the current catalog.");
  }
  const decisions = new Map(
    input.decisions.map((decision) => [decision.consentType, decision]),
  );
  if (decisions.size !== bundle.documents.length) {
    throw new Error("Each required consent must have one decision.");
  }
  for (const document of bundle.documents) {
    const decision = decisions.get(document.consentType);
    if (!decision || decision.documentVersion !== document.documentVersion) {
      throw new Error("The consent document versions do not match.");
    }
  }
}

function validateWalletProvisioningInput(
  input: StartCustomerWalletProvisioningInput,
): void {
  if (
    input.bundleVersion !== SYNTHETIC_WALLET_PROVISIONING_INPUT.bundleVersion ||
    input.documentVersion !==
      SYNTHETIC_WALLET_PROVISIONING_INPUT.documentVersion ||
    input.locale !== SYNTHETIC_WALLET_PROVISIONING_INPUT.locale ||
    input.decision !== SYNTHETIC_WALLET_PROVISIONING_INPUT.decision
  ) {
    throw new Error(
      "The wallet provisioning disclosure does not match the current catalog.",
    );
  }
}

function assertIdempotencyKey(value: string): void {
  if (
    value.length < 8 ||
    value.length > 128 ||
    value !== value.trim() ||
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw new Error("Idempotency keys must be 8 to 128 visible characters.");
  }
}

function idempotencyConflict(): Error {
  return new Error("The idempotency key was reused for a different command.");
}

function freezeOnboarding(
  snapshot: CustomerOnboardingSnapshot,
): CustomerOnboardingSnapshot {
  return Object.freeze({
    ...snapshot,
    consentBundle: Object.freeze({
      ...snapshot.consentBundle,
      documents: Object.freeze([...snapshot.consentBundle.documents]),
    }),
    nextAllowedActions: Object.freeze([...snapshot.nextAllowedActions]),
  });
}

function freezeIdentityCase(
  snapshot: CustomerIdentityCaseSnapshot,
): CustomerIdentityCaseSnapshot {
  return Object.freeze({
    ...snapshot,
    nextAllowedActions: Object.freeze([...snapshot.nextAllowedActions]),
  });
}

function freezeWallet(
  snapshot: CustomerWalletSnapshot,
): CustomerWalletSnapshot {
  return Object.freeze({
    ...snapshot,
    nextAllowedActions: Object.freeze([...snapshot.nextAllowedActions]),
  });
}
