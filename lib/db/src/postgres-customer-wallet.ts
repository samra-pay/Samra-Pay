import { createHash, randomUUID } from "node:crypto";
import { DomainError } from "@workspace/remittance";
import {
  ALPHA_ONBOARDING_CONSENT_BUNDLE,
  CustomerOnboardingAccessRestrictedError,
  CustomerOnboardingNotFoundError,
  type CustomerOnboardingState,
} from "./postgres-customer-onboarding";
import {
  normalizeAuth0Issuer,
  normalizeAuth0Subject,
} from "./postgres-customer-identities";
import type { PostgresPersistenceContext } from "./postgres-persistence";

export const CUSTOMER_WALLET_STATES = Object.freeze([
  "created",
  "provisioning",
  "customer_control_setup",
  "ready",
  "restricted",
  "error",
] as const);

export type CustomerWalletState = (typeof CUSTOMER_WALLET_STATES)[number];

export const ALPHA_WALLET_PROVISIONING_DISCLOSURE = Object.freeze({
  bundleVersion: "alpha-wallet-non-production-v2",
  documentVersion: "alpha-wallet-non-production-v2",
  locale: "en-US",
  legalEffect: "non_production" as const,
  provider: "crossmint" as const,
  asset: "USDC" as const,
  environment: "synthetic" as const,
  createsRealWallet: false,
  enablesFunding: false,
  enablesRemittance: false,
});

export const ALPHA_WALLET_CONFIGURATION_VERSION =
  "crossmint-synthetic-v1" as const;

export const CUSTOMER_CONTROLLED_SANDBOX_CONFIGURATION_VERSION =
  "crossmint-sandbox-evm-customer-email-v1" as const;
export const CUSTOMER_CONTROLLED_SANDBOX_DISCLOSURE = Object.freeze({
  bundleVersion: "sandbox-customer-wallet-v2",
  documentVersion: "sandbox-customer-wallet-v2",
  locale: "en-US",
  legalEffect: "non_production" as const,
  provider: "crossmint" as const,
  asset: "USDC" as const,
  environment: "staging" as const,
  createsRealWallet: true,
  enablesFunding: false,
  enablesRemittance: false,
});
export type CustomerWalletStorePolicy =
  | Readonly<{ mode: "fake" }>
  | Readonly<{ mode: "crossmint-sandbox-customer"; allowedCustomerId: string }>;

export type CustomerWalletProvisioningConsent = Readonly<{
  bundleVersion: string;
  documentVersion: string;
  locale: string;
  decision: "accepted";
}>;

export type CustomerWalletProviderResult = Readonly<{
  providerWalletRef: string;
  network: string;
  custodyModel: string;
  publicAddress: string | null;
  configurationVersion: string;
}>;

export type CustomerWalletSnapshot = Readonly<{
  walletId: string;
  state: CustomerWalletState;
  reasonFamily: string | null;
  provider: "crossmint";
  asset: "USDC";
  network: string | null;
  custodyModel: string | null;
  publicAddress: string | null;
  configurationVersion: string;
  synthetic: boolean;
  version: number;
  readyAt: string | null;
  createdAt: string;
  updatedAt: string;
  nextAllowedActions: readonly string[];
}>;

export type PreparedCustomerWallet = Readonly<{
  snapshot: CustomerWalletSnapshot;
  providerRequestKey: string;
  ownerLocator: string;
  created: boolean;
}>;

export class CustomerWalletNotFoundError extends Error {
  constructor() {
    super("The authenticated customer does not have a wallet record.");
    this.name = "CustomerWalletNotFoundError";
  }
}

type IdentityContextRow = {
  identity_state: "active" | "revoked";
  customer_id: string;
  customer_external_ref: string;
  customer_state: "active" | "suspended" | "closed";
  onboarding_id: string;
  onboarding_state: CustomerOnboardingState;
  onboarding_reason_family: string | null;
  onboarding_version: number;
  identity_case_state: string | null;
};

type OnboardingRow = {
  id: string;
  state: CustomerOnboardingState;
  reason_family: string | null;
  version: number;
};

type WalletRow = {
  id: string;
  external_ref: string;
  customer_id: string;
  onboarding_id: string;
  wallet_consent_id: string;
  provider: "crossmint";
  provider_request_key: string;
  creation_command_key: string;
  state: CustomerWalletState;
  reason_family: string | null;
  asset: "USDC";
  environment: "synthetic" | "staging";
  configuration_version: string;
  version: number;
  ready_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

type WalletMappingRow = {
  provider_wallet_ref: string;
  network: string;
  custody_model: string;
  public_address: string | null;
  configuration_version: string;
};

type WalletConsentRow = {
  bundle_version: string;
  document_version: string;
  decision: string;
  locale: string;
};

export class PostgresCustomerWalletStore {
  readonly #context: PostgresPersistenceContext;
  readonly #policy: CustomerWalletStorePolicy;
  readonly #configurationVersion: string;
  readonly #environment: "synthetic" | "staging";

  constructor(
    context: PostgresPersistenceContext,
    policy: CustomerWalletStorePolicy = { mode: "fake" },
  ) {
    this.#context = context;
    if (
      policy.mode !== "fake" &&
      (policy.mode !== "crossmint-sandbox-customer" ||
        !/^customer_[0-9a-f]{32}$/u.test(policy.allowedCustomerId))
    ) {
      throw new Error("Invalid customer wallet store policy.");
    }
    this.#policy = Object.freeze({ ...policy });
    this.#configurationVersion =
      policy.mode === "fake"
        ? ALPHA_WALLET_CONFIGURATION_VERSION
        : CUSTOMER_CONTROLLED_SANDBOX_CONFIGURATION_VERSION;
    this.#environment = policy.mode === "fake" ? "synthetic" : "staging";
  }

  async prepareAuth0Wallet(input: {
    issuer: string;
    subject: string;
    idempotencyKey: string;
    consent: CustomerWalletProvisioningConsent;
  }): Promise<PreparedCustomerWallet> {
    const issuer = normalizeAuth0Issuer(input.issuer);
    const subject = normalizeAuth0Subject(input.subject);
    const visibleKey = normalizeVisibleValue(
      input.idempotencyKey,
      "Idempotency-Key",
      8,
      128,
    );
    const commandKey = sha256(visibleKey);
    assertWalletConsent(
      input.consent,
      this.#policy.mode === "fake"
        ? ALPHA_WALLET_PROVISIONING_DISCLOSURE
        : CUSTOMER_CONTROLLED_SANDBOX_DISCLOSURE,
    );

    return this.#context.run(async () => {
      await lockIdentity(this.#context, issuer, subject);
      const identity = await selectIdentityContext(
        this.#context,
        issuer,
        subject,
        true,
      );
      if (!identity) throw new CustomerOnboardingNotFoundError();
      assertIdentityAccess(identity);
      if (
        this.#policy.mode === "crossmint-sandbox-customer" &&
        identity.customer_external_ref !== this.#policy.allowedCustomerId
      ) {
        throw new CustomerOnboardingAccessRestrictedError();
      }

      const existing = await selectWalletByOnboarding(
        this.#context,
        identity.onboarding_id,
        true,
      );
      if (existing) {
        if (
          existing.configuration_version !== this.#configurationVersion ||
          existing.environment !== this.#environment
        ) {
          throw new DomainError(
            "CONFLICT",
            "The existing wallet belongs to a different provider configuration.",
          );
        }
        if (identity.onboarding_state === "restricted") {
          const restricted = await restrictWalletForCustomerAccess(
            this.#context,
            existing,
            identity.onboarding_reason_family,
          );
          return Object.freeze({
            snapshot: await snapshotForWallet(this.#context, restricted),
            providerRequestKey: restricted.provider_request_key,
            ownerLocator: ownerLocator(identity.customer_external_ref),
            created: false,
          });
        }
        await assertCurrentOnboardingConsent(this.#context, identity);
        const refreshedLegacyConsent = await ensureCurrentWalletConsent(
          this.#context,
          existing,
          input.consent,
          commandKey,
        );
        if (
          existing.creation_command_key !== commandKey &&
          existing.environment !== "synthetic" &&
          !["customer_control_setup", "ready"].includes(existing.state) &&
          !refreshedLegacyConsent
        ) {
          throw new DomainError(
            "CONFLICT",
            "The customer wallet already exists under a different idempotency command.",
          );
        }
        if (
          (this.#environment === "staging" &&
            existing.state === "customer_control_setup" &&
            identity.onboarding_state !== "wallet_control_setup") ||
          (!["customer_control_setup", "ready", "restricted"].includes(
            existing.state,
          ) &&
            (identity.onboarding_state !== "wallet_provisioning" ||
              identity.identity_case_state !== "approved"))
        ) {
          throw invalidWalletTransition();
        }
        return Object.freeze({
          snapshot: await snapshotForWallet(this.#context, existing),
          providerRequestKey: existing.provider_request_key,
          ownerLocator: ownerLocator(identity.customer_external_ref),
          created: false,
        });
      }

      if (
        identity.onboarding_state !== "identity_approved" ||
        identity.identity_case_state !== "approved"
      ) {
        throw new DomainError(
          "INVALID_TRANSITION",
          "Wallet provisioning requires an approved Samra-owned identity case.",
        );
      }
      await assertCurrentOnboardingConsent(this.#context, identity);

      let onboarding: OnboardingRow = {
        id: identity.onboarding_id,
        state: identity.onboarding_state,
        reason_family: null,
        version: identity.onboarding_version,
      };
      onboarding = await transitionOnboarding(this.#context, onboarding, {
        state: "wallet_consent_pending",
        latestCompletedStep: "identity_approved",
        reasonFamily: null,
        commandKey: `wallet-consent-presented:${commandKey}`,
      });

      const consent = await this.#context.query().query<{ id: string }>(
        `INSERT INTO samra_core.customer_consents
         (customer_id, onboarding_id, consent_type, document_version,
          bundle_version, decision, locale, channel, idempotency_key)
         VALUES ($1,$2,'wallet_provisioning',$3,$4,'accepted',$5,'api',$6)
         RETURNING id`,
        [
          identity.customer_id,
          identity.onboarding_id,
          input.consent.documentVersion,
          input.consent.bundleVersion,
          input.consent.locale,
          commandKey,
        ],
      );

      const externalRef = `wallet_${randomUUID().replaceAll("-", "")}`;
      const providerRequestKey = fingerprint({
        provider: "crossmint",
        walletId: externalRef,
        configurationVersion: this.#configurationVersion,
      });
      const inserted = await this.#context.query().query<WalletRow>(
        `INSERT INTO samra_core.customer_wallets
         (external_ref, customer_id, onboarding_id, wallet_consent_id,
          provider, provider_request_key, creation_command_key, state, asset,
          environment, configuration_version)
         VALUES ($1,$2,$3,$4,'crossmint',$5,$6,'created','USDC',$8,$7)
         RETURNING ${walletReturningColumns()}`,
        [
          externalRef,
          identity.customer_id,
          identity.onboarding_id,
          consent.rows[0]!.id,
          providerRequestKey,
          commandKey,
          this.#configurationVersion,
          this.#environment,
        ],
      );
      const createdWallet = inserted.rows[0]!;
      await appendWalletTransition(this.#context, {
        wallet: createdWallet,
        nextState: "created",
        nextVersion: 1,
        reasonFamily: null,
        commandKey: `create:${commandKey}`,
        initial: true,
      });
      const provisioningWallet = await transitionWallet(this.#context, {
        wallet: createdWallet,
        nextState: "provisioning",
        reasonFamily: null,
        commandKey: `provision:${commandKey}`,
      });
      onboarding = await transitionOnboarding(this.#context, onboarding, {
        state: "wallet_provisioning",
        latestCompletedStep: "wallet_provisioning_consent",
        reasonFamily: null,
        commandKey: `wallet-provisioning:${commandKey}`,
      });
      await appendWalletAudit(this.#context, {
        wallet: provisioningWallet,
        actorId: identity.customer_external_ref,
        action: "customer_wallet_provisioning_started",
        metadata: {
          provider: "crossmint",
          asset: "USDC",
          environment: this.#environment,
          configurationVersion: this.#configurationVersion,
          consentDocumentVersion: input.consent.documentVersion,
          onboardingState: onboarding.state,
          createsRealWallet: this.#environment === "staging",
          enablesFunding: false,
          enablesRemittance: false,
        },
      });
      return Object.freeze({
        snapshot: mapWallet(provisioningWallet, undefined),
        providerRequestKey,
        ownerLocator: ownerLocator(identity.customer_external_ref),
        created: true,
      });
    });
  }

  async runAuthorizedProviderDispatch(
    input: {
      issuer: string;
      subject: string;
      walletId: string;
      providerRequestKey: string;
    },
    operation: () => Promise<CustomerWalletSnapshot>,
  ): Promise<CustomerWalletSnapshot> {
    const issuer = normalizeAuth0Issuer(input.issuer);
    const subject = normalizeAuth0Subject(input.subject);
    const walletId = normalizeVisibleValue(input.walletId, "wallet ID", 8, 128);
    const providerRequestKey = normalizeDigest(
      input.providerRequestKey,
      "provider request key",
    );

    return this.#context.run(async () => {
      await lockIdentity(this.#context, issuer, subject);
      const identity = await selectIdentityContext(
        this.#context,
        issuer,
        subject,
        true,
      );
      if (!identity) throw new CustomerOnboardingNotFoundError();
      assertIdentityAccess(identity);
      if (
        this.#policy.mode === "crossmint-sandbox-customer" &&
        identity.customer_external_ref !== this.#policy.allowedCustomerId
      ) {
        throw new CustomerOnboardingAccessRestrictedError();
      }
      if (identity.onboarding_state === "restricted") {
        throw new CustomerOnboardingAccessRestrictedError();
      }
      const wallet = await selectWalletByOnboarding(
        this.#context,
        identity.onboarding_id,
        true,
      );
      if (!wallet || wallet.external_ref !== walletId) {
        throw new CustomerWalletNotFoundError();
      }
      if (
        wallet.environment !== this.#environment ||
        wallet.configuration_version !== this.#configurationVersion
      ) {
        throw new DomainError(
          "CONFLICT",
          "The wallet provider dispatch belongs to a different configuration.",
        );
      }
      if (wallet.provider_request_key !== providerRequestKey) {
        throw new DomainError(
          "CONFLICT",
          "The provider request does not belong to this wallet.",
        );
      }

      const mapping = await selectWalletMapping(this.#context, wallet.id, true);
      const isCompletedReplay =
        (wallet.state === "ready" &&
          identity.onboarding_state === "wallet_ready") ||
        (wallet.state === "customer_control_setup" &&
          identity.onboarding_state === "wallet_control_setup");
      if (mapping && isCompletedReplay) {
        return mapWallet(wallet, mapping);
      }
      if (
        identity.onboarding_state !== "wallet_provisioning" ||
        identity.identity_case_state !== "approved"
      ) {
        throw invalidWalletTransition();
      }
      if (
        !new Set<CustomerWalletState>(["provisioning", "error"]).has(
          wallet.state,
        )
      ) {
        throw invalidWalletTransition();
      }
      if (mapping) {
        throw invalidWalletTransition();
      }

      return operation();
    });
  }

  async attachProviderWallet(input: {
    walletId: string;
    providerRequestKey: string;
    result: CustomerWalletProviderResult;
  }): Promise<CustomerWalletSnapshot> {
    const walletId = normalizeVisibleValue(input.walletId, "wallet ID", 8, 128);
    const providerRequestKey = normalizeDigest(
      input.providerRequestKey,
      "provider request key",
    );
    const result = normalizeProviderResult(
      input.result,
      this.#configurationVersion,
    );

    return this.#context.run(async () => {
      const locatedWallet = await selectWalletByExternalRef(
        this.#context,
        walletId,
        false,
      );
      if (!locatedWallet) throw new CustomerWalletNotFoundError();
      const onboarding = await selectOnboarding(
        this.#context,
        locatedWallet.onboarding_id,
        true,
      );
      if (!onboarding) throw new CustomerOnboardingNotFoundError();
      const wallet = await selectWalletByExternalRef(
        this.#context,
        walletId,
        true,
      );
      if (!wallet) throw new CustomerWalletNotFoundError();
      if (
        wallet.configuration_version !== result.configurationVersion ||
        wallet.environment !== this.#environment
      ) {
        throw new DomainError(
          "CONFLICT",
          "The provider response belongs to a different wallet configuration.",
        );
      }
      if (wallet.provider_request_key !== providerRequestKey) {
        throw new DomainError(
          "CONFLICT",
          "The provider request does not belong to this wallet.",
        );
      }

      const existingMapping = await selectWalletMapping(
        this.#context,
        wallet.id,
        true,
      );
      if (existingMapping) {
        if (!sameProviderResult(existingMapping, result)) {
          const restricted = await restrictWalletForProviderConflict(
            this.#context,
            wallet,
          );
          return mapWallet(restricted, existingMapping);
        }
        if (onboarding.state === "restricted") {
          const restricted = await restrictWalletForCustomerAccess(
            this.#context,
            wallet,
            onboarding.reason_family,
          );
          return mapWallet(restricted, existingMapping);
        }
        return mapWallet(wallet, existingMapping);
      }
      if (wallet.state === "ready") {
        throw invalidWalletTransition();
      }
      if (
        onboarding.state !== "wallet_provisioning" &&
        onboarding.state !== "restricted"
      ) {
        throw invalidWalletTransition();
      }
      if (
        !new Set<CustomerWalletState>([
          "provisioning",
          "error",
          "restricted",
        ]).has(wallet.state)
      ) {
        throw invalidWalletTransition();
      }

      await this.#context.query().query(
        `INSERT INTO samra_core.customer_wallet_provider_mappings
         (wallet_id, provider, provider_wallet_ref, network, custody_model,
          public_address, configuration_version)
         VALUES ($1,'crossmint',$2,$3,$4,$5,$6)`,
        [
          wallet.id,
          result.providerWalletRef,
          result.network,
          result.custodyModel,
          result.publicAddress,
          result.configurationVersion,
        ],
      );
      const mapping = mappingFromResult(result);
      if (onboarding.state === "restricted" || wallet.state === "restricted") {
        const restricted = await restrictWalletForCustomerAccess(
          this.#context,
          wallet,
          onboarding.reason_family,
        );
        await appendWalletAudit(this.#context, {
          wallet: restricted,
          eventSuffix: `restricted-provider:${sha256(result.providerWalletRef).slice(0, 16)}`,
          actorId: "customer-wallet-provider",
          action:
            "customer_wallet_provider_mapping_preserved_under_restriction",
          metadata: {
            provider: "crossmint",
            asset: "USDC",
            network: result.network,
            configurationVersion: result.configurationVersion,
            restrictionReasonFamily: restricted.reason_family,
            syntheticOnly: wallet.environment === "synthetic",
            enablesFunding: false,
            enablesRemittance: false,
          },
        });
        return mapWallet(restricted, mapping);
      }
      const attachedState: CustomerWalletState =
        this.#environment === "staging" ? "customer_control_setup" : "ready";
      const attached = await transitionWallet(this.#context, {
        wallet,
        nextState: attachedState,
        reasonFamily: null,
        commandKey: `provider-wallet:${sha256(result.providerWalletRef)}`,
      });
      const onboardingState: CustomerOnboardingState =
        this.#environment === "staging"
          ? "wallet_control_setup"
          : "wallet_ready";
      await transitionOnboarding(this.#context, onboarding, {
        state: onboardingState,
        latestCompletedStep:
          this.#environment === "staging"
            ? "wallet_created"
            : "wallet_provisioned",
        reasonFamily: null,
        commandKey: `${onboardingState}:${sha256(result.providerWalletRef)}`,
      });
      await appendWalletAudit(this.#context, {
        wallet: attached,
        actorId: "customer-wallet-provider",
        action: "customer_wallet_provider_mapping_attached",
        metadata: {
          provider: "crossmint",
          asset: "USDC",
          network: result.network,
          custodyModel: result.custodyModel,
          configurationVersion: result.configurationVersion,
          syntheticOnly: wallet.environment === "synthetic",
          customerControlSetupRequired: this.#environment === "staging",
        },
      });
      return mapWallet(attached, mapping);
    });
  }

  async recordProviderStartFailure(input: {
    walletId: string;
    reasonFamily: string;
  }): Promise<CustomerWalletSnapshot> {
    const walletId = normalizeVisibleValue(input.walletId, "wallet ID", 8, 128);
    const reasonFamily = normalizeVisibleValue(
      input.reasonFamily,
      "reason family",
      1,
      64,
    );
    return this.#context.run(async () => {
      const locatedWallet = await selectWalletByExternalRef(
        this.#context,
        walletId,
        false,
      );
      if (!locatedWallet) throw new CustomerWalletNotFoundError();
      const onboarding = await selectOnboarding(
        this.#context,
        locatedWallet.onboarding_id,
        true,
      );
      if (!onboarding) throw new CustomerOnboardingNotFoundError();
      const wallet = await selectWalletByExternalRef(
        this.#context,
        walletId,
        true,
      );
      if (!wallet) throw new CustomerWalletNotFoundError();
      const mapping = await selectWalletMapping(
        this.#context,
        wallet.id,
        false,
      );
      if (onboarding.state === "restricted") {
        const restricted = await restrictWalletForCustomerAccess(
          this.#context,
          wallet,
          onboarding.reason_family,
        );
        return mapWallet(restricted, mapping);
      }
      if (
        wallet.state === "error" ||
        wallet.state === "ready" ||
        wallet.state === "restricted"
      ) {
        return mapWallet(wallet, mapping);
      }
      if (wallet.state !== "provisioning") return mapWallet(wallet, mapping);
      const failed = await transitionWallet(this.#context, {
        wallet,
        nextState: "error",
        reasonFamily,
        commandKey: `provider-start-error:${wallet.version + 1}`,
      });
      await appendWalletAudit(this.#context, {
        wallet: failed,
        actorId: "customer-wallet-provider",
        action: "customer_wallet_provider_start_failed",
        metadata: {
          provider: "crossmint",
          reasonFamily,
          syntheticOnly: wallet.environment === "synthetic",
        },
      });
      return mapWallet(failed, mapping);
    });
  }

  async getAuth0Wallet(input: {
    issuer: string;
    subject: string;
  }): Promise<CustomerWalletSnapshot> {
    const issuer = normalizeAuth0Issuer(input.issuer);
    const subject = normalizeAuth0Subject(input.subject);
    const identity = await selectIdentityContext(
      this.#context,
      issuer,
      subject,
      false,
    );
    if (!identity) throw new CustomerOnboardingNotFoundError();
    assertIdentityAccess(identity);
    const wallet = await selectWalletByOnboarding(
      this.#context,
      identity.onboarding_id,
      false,
    );
    if (!wallet) throw new CustomerWalletNotFoundError();
    const snapshot = await snapshotForWallet(this.#context, wallet);
    return identity.onboarding_state === "restricted"
      ? restrictedWalletSnapshot(snapshot, identity.onboarding_reason_family)
      : snapshot;
  }
}

export type CustomerWalletStore = Pick<
  PostgresCustomerWalletStore,
  | "prepareAuth0Wallet"
  | "runAuthorizedProviderDispatch"
  | "attachProviderWallet"
  | "recordProviderStartFailure"
  | "getAuth0Wallet"
>;

async function selectIdentityContext(
  context: PostgresPersistenceContext,
  issuer: string,
  subject: string,
  forUpdate: boolean,
): Promise<IdentityContextRow | undefined> {
  const result = await context.query().query<IdentityContextRow>(
    `SELECT identity.state AS identity_state, customer.id AS customer_id,
            customer.external_ref AS customer_external_ref,
            customer.state AS customer_state, onboarding.id AS onboarding_id,
            onboarding.state AS onboarding_state,
            onboarding.reason_family AS onboarding_reason_family,
            onboarding.version AS onboarding_version,
            identity_case.state AS identity_case_state
     FROM samra_core.customer_auth_identities identity
     JOIN samra_core.customers customer ON customer.id = identity.customer_id
     JOIN samra_core.customer_onboardings onboarding
       ON onboarding.customer_id = customer.id
     LEFT JOIN samra_core.customer_identity_cases identity_case
       ON identity_case.onboarding_id = onboarding.id
     WHERE identity.provider = 'auth0'
       AND identity.issuer = $1 AND identity.subject = $2
     ${forUpdate ? "FOR UPDATE OF identity, customer, onboarding" : ""}
     LIMIT 1`,
    [issuer, subject],
  );
  return result.rows[0];
}

async function selectOnboarding(
  context: PostgresPersistenceContext,
  onboardingId: string,
  forUpdate: boolean,
): Promise<OnboardingRow | undefined> {
  const result = await context.query().query<OnboardingRow>(
    `SELECT id, state, reason_family, version
     FROM samra_core.customer_onboardings
     WHERE id = $1 ${forUpdate ? "FOR UPDATE" : ""}
     LIMIT 1`,
    [onboardingId],
  );
  return result.rows[0];
}

async function selectWalletByOnboarding(
  context: PostgresPersistenceContext,
  onboardingId: string,
  forUpdate: boolean,
): Promise<WalletRow | undefined> {
  const result = await context.query().query<WalletRow>(
    `${walletSelect()} WHERE onboarding_id = $1
     ${forUpdate ? "FOR UPDATE" : ""} LIMIT 1`,
    [onboardingId],
  );
  return result.rows[0];
}

async function selectWalletByExternalRef(
  context: PostgresPersistenceContext,
  externalRef: string,
  forUpdate: boolean,
): Promise<WalletRow | undefined> {
  const result = await context.query().query<WalletRow>(
    `${walletSelect()} WHERE external_ref = $1
     ${forUpdate ? "FOR UPDATE" : ""} LIMIT 1`,
    [externalRef],
  );
  return result.rows[0];
}

function walletSelect(): string {
  return `SELECT ${walletReturningColumns()}
          FROM samra_core.customer_wallets`;
}

function walletReturningColumns(): string {
  return `id, external_ref, customer_id, onboarding_id, wallet_consent_id,
          provider, provider_request_key, creation_command_key, state,
          reason_family, asset, environment, configuration_version, version,
          ready_at, created_at, updated_at`;
}

async function selectWalletMapping(
  context: PostgresPersistenceContext,
  walletId: string,
  forUpdate: boolean,
): Promise<WalletMappingRow | undefined> {
  const result = await context.query().query<WalletMappingRow>(
    `SELECT provider_wallet_ref, network, custody_model, public_address,
            configuration_version
     FROM samra_core.customer_wallet_provider_mappings
     WHERE wallet_id = $1 ${forUpdate ? "FOR UPDATE" : ""} LIMIT 1`,
    [walletId],
  );
  return result.rows[0];
}

async function ensureCurrentWalletConsent(
  context: PostgresPersistenceContext,
  wallet: WalletRow,
  expected: CustomerWalletProvisioningConsent,
  commandKey: string,
): Promise<boolean> {
  const result = await context.query().query<WalletConsentRow>(
    `SELECT bundle_version, document_version, decision, locale
       FROM samra_core.customer_consents
      WHERE id = $1
        AND customer_id = $2
        AND onboarding_id = $3
        AND consent_type = 'wallet_provisioning'
      LIMIT 1`,
    [wallet.wallet_consent_id, wallet.customer_id, wallet.onboarding_id],
  );
  const persisted = result.rows[0];
  if (!persisted) {
    throw new DomainError(
      "CONFLICT",
      "The existing wallet does not have durable wallet provisioning consent.",
    );
  }
  if (
    persisted.bundle_version === expected.bundleVersion &&
    persisted.document_version === expected.documentVersion &&
    persisted.locale === expected.locale &&
    persisted.decision === expected.decision
  ) {
    return false;
  }

  const legacyVersion =
    wallet.environment === "synthetic"
      ? "alpha-wallet-non-production-v1"
      : "sandbox-customer-wallet-v1";
  if (
    persisted.bundle_version !== legacyVersion ||
    persisted.document_version !== legacyVersion ||
    persisted.locale !== "en-US" ||
    persisted.decision !== "accepted"
  ) {
    throw new DomainError(
      "CONFLICT",
      "The existing wallet was created under an unrecognized wallet provisioning disclosure.",
    );
  }

  const existingCurrent = await context
    .query()
    .query<{ id: string; idempotency_key: string }>(
      `SELECT id, idempotency_key
       FROM samra_core.customer_consents
      WHERE customer_id = $1
        AND onboarding_id = $2
        AND consent_type = 'wallet_provisioning'
        AND document_version = $3
        AND bundle_version = $4
        AND decision = 'accepted'
        AND locale = $5
      LIMIT 1`,
      [
        wallet.customer_id,
        wallet.onboarding_id,
        expected.documentVersion,
        expected.bundleVersion,
        expected.locale,
      ],
    );
  if (existingCurrent.rows[0]) {
    return existingCurrent.rows[0].idempotency_key === commandKey;
  }

  const refreshed = await context.query().query<{ id: string }>(
    `INSERT INTO samra_core.customer_consents
     (customer_id, onboarding_id, consent_type, document_version,
      bundle_version, decision, locale, channel, idempotency_key)
     VALUES ($1,$2,'wallet_provisioning',$3,$4,'accepted',$5,'api',$6)
     ON CONFLICT (customer_id, idempotency_key, consent_type) DO NOTHING
     RETURNING id`,
    [
      wallet.customer_id,
      wallet.onboarding_id,
      expected.documentVersion,
      expected.bundleVersion,
      expected.locale,
      commandKey,
    ],
  );
  const current = await context.query().query<{ id: string }>(
    `SELECT id
       FROM samra_core.customer_consents
      WHERE customer_id = $1
        AND onboarding_id = $2
        AND consent_type = 'wallet_provisioning'
        AND document_version = $3
        AND bundle_version = $4
        AND decision = 'accepted'
        AND locale = $5
        AND idempotency_key = $6
      LIMIT 1`,
    [
      wallet.customer_id,
      wallet.onboarding_id,
      expected.documentVersion,
      expected.bundleVersion,
      expected.locale,
      commandKey,
    ],
  );
  if (!current.rows[0]) {
    throw new DomainError(
      "CONFLICT",
      "The current wallet provisioning disclosure could not be recorded.",
    );
  }
  if (refreshed.rows[0]) {
    await appendWalletAudit(context, {
      wallet,
      eventSuffix: `consent:${sha256(expected.bundleVersion).slice(0, 16)}`,
      actorId: "customer-wallet-consent",
      action: "customer_wallet_provisioning_consent_refreshed",
      metadata: {
        priorBundleVersion: persisted.bundle_version,
        bundleVersion: expected.bundleVersion,
        documentVersion: expected.documentVersion,
        locale: expected.locale,
        environment: wallet.environment,
        providerRedispatched: false,
      },
    });
  }
  return true;
}

async function assertCurrentOnboardingConsent(
  context: PostgresPersistenceContext,
  identity: Pick<IdentityContextRow, "customer_id" | "onboarding_id">,
): Promise<void> {
  const result = await context.query().query<{
    consent_type: string;
    document_version: string;
    bundle_version: string;
    decision: string;
    locale: string;
  }>(
    `SELECT consent_type, document_version, bundle_version, decision, locale
       FROM samra_core.customer_consents
      WHERE customer_id = $1
        AND onboarding_id = $2
        AND consent_type IN
            ('terms_of_service','privacy_notice','electronic_communications')`,
    [identity.customer_id, identity.onboarding_id],
  );
  const hasCurrentAcceptance = ALPHA_ONBOARDING_CONSENT_BUNDLE.documents.every(
    (document) =>
      result.rows.some(
        (consent) =>
          consent.consent_type === document.consentType &&
          consent.document_version === document.documentVersion &&
          consent.bundle_version ===
            ALPHA_ONBOARDING_CONSENT_BUNDLE.bundleVersion &&
          consent.decision === "accepted" &&
          consent.locale === ALPHA_ONBOARDING_CONSENT_BUNDLE.locale,
      ),
  );
  if (!hasCurrentAcceptance) {
    throw new DomainError(
      "INVALID_TRANSITION",
      "The current non-production onboarding consent bundle is required before wallet provisioning.",
    );
  }
}

async function snapshotForWallet(
  context: PostgresPersistenceContext,
  wallet: WalletRow,
): Promise<CustomerWalletSnapshot> {
  return mapWallet(
    wallet,
    await selectWalletMapping(context, wallet.id, false),
    await hasCurrentWalletConsent(context, wallet),
  );
}

async function hasCurrentWalletConsent(
  context: PostgresPersistenceContext,
  wallet: WalletRow,
): Promise<boolean> {
  const disclosure =
    wallet.environment === "synthetic"
      ? ALPHA_WALLET_PROVISIONING_DISCLOSURE
      : CUSTOMER_CONTROLLED_SANDBOX_DISCLOSURE;
  const result = await context.query().query<{ accepted: boolean }>(
    `SELECT EXISTS (
       SELECT 1
         FROM samra_core.customer_consents
        WHERE customer_id = $1
          AND onboarding_id = $2
          AND consent_type = 'wallet_provisioning'
          AND bundle_version = $3
          AND document_version = $4
          AND locale = $5
          AND decision = 'accepted'
     ) AS accepted`,
    [
      wallet.customer_id,
      wallet.onboarding_id,
      disclosure.bundleVersion,
      disclosure.documentVersion,
      disclosure.locale,
    ],
  );
  return result.rows[0]?.accepted === true;
}

async function transitionWallet(
  context: PostgresPersistenceContext,
  input: Readonly<{
    wallet: WalletRow;
    nextState: CustomerWalletState;
    reasonFamily: string | null;
    commandKey: string;
  }>,
): Promise<WalletRow> {
  const nextVersion = input.wallet.version + 1;
  const updated = await context.query().query<WalletRow>(
    `UPDATE samra_core.customer_wallets
     SET state = $2, reason_family = $3, version = version + 1,
         ready_at = CASE WHEN $2 = 'ready' THEN now() ELSE ready_at END,
         updated_at = now()
     WHERE id = $1 AND version = $4
     RETURNING ${walletReturningColumns()}`,
    [
      input.wallet.id,
      input.nextState,
      input.reasonFamily,
      input.wallet.version,
    ],
  );
  const row = updated.rows[0];
  if (!row) throw walletConcurrencyConflict();
  await appendWalletTransition(context, {
    wallet: input.wallet,
    nextState: input.nextState,
    nextVersion,
    reasonFamily: input.reasonFamily,
    commandKey: input.commandKey,
    initial: false,
  });
  return row;
}

async function appendWalletTransition(
  context: PostgresPersistenceContext,
  input: Readonly<{
    wallet: WalletRow;
    nextState: CustomerWalletState;
    nextVersion: number;
    reasonFamily: string | null;
    commandKey: string;
    initial: boolean;
  }>,
): Promise<void> {
  await context.query().query(
    `INSERT INTO samra_core.customer_wallet_transitions
     (wallet_id, sequence, from_state, to_state, reason_family, command_key)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [
      input.wallet.id,
      input.nextVersion,
      input.initial ? null : input.wallet.state,
      input.nextState,
      input.reasonFamily,
      input.commandKey,
    ],
  );
}

async function transitionOnboarding(
  context: PostgresPersistenceContext,
  onboarding: OnboardingRow,
  target: Readonly<{
    state: CustomerOnboardingState;
    latestCompletedStep: string;
    reasonFamily: string | null;
    commandKey: string;
  }>,
): Promise<OnboardingRow> {
  if (onboarding.state === target.state) return onboarding;
  const nextVersion = onboarding.version + 1;
  const updated = await context.query().query<OnboardingRow>(
    `UPDATE samra_core.customer_onboardings
     SET state = $2, latest_completed_step = $3, reason_family = $4,
         version = version + 1, entered_at = now(), updated_at = now()
     WHERE id = $1 AND version = $5
     RETURNING id, state, reason_family, version`,
    [
      onboarding.id,
      target.state,
      target.latestCompletedStep,
      target.reasonFamily,
      onboarding.version,
    ],
  );
  const row = updated.rows[0];
  if (!row) throw walletConcurrencyConflict();
  await context.query().query(
    `INSERT INTO samra_core.customer_onboarding_transitions
     (onboarding_id, sequence, from_state, to_state, reason_family, command_key)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [
      onboarding.id,
      nextVersion,
      onboarding.state,
      target.state,
      target.reasonFamily,
      target.commandKey,
    ],
  );
  return row;
}

async function restrictWalletForProviderConflict(
  context: PostgresPersistenceContext,
  wallet: WalletRow,
): Promise<WalletRow> {
  if (wallet.state === "restricted") return wallet;
  const restricted = await transitionWallet(context, {
    wallet,
    nextState: "restricted",
    reasonFamily: "wallet_provider_conflict",
    commandKey: `provider-conflict:${wallet.version + 1}`,
  });
  const onboarding = await selectOnboarding(
    context,
    wallet.onboarding_id,
    true,
  );
  if (onboarding && onboarding.state !== "restricted") {
    await transitionOnboarding(context, onboarding, {
      state: "restricted",
      latestCompletedStep: "wallet_provider_response",
      reasonFamily: "wallet_provider_conflict",
      commandKey: `wallet-provider-conflict:${wallet.version + 1}`,
    });
  }
  await appendWalletAudit(context, {
    wallet: restricted,
    actorId: "customer-wallet-provider",
    action: "customer_wallet_provider_conflict_detected",
    metadata: {
      provider: "crossmint",
      reasonFamily: "wallet_provider_conflict",
      syntheticOnly: wallet.environment === "synthetic",
    },
  });
  return restricted;
}

async function restrictWalletForCustomerAccess(
  context: PostgresPersistenceContext,
  wallet: WalletRow,
  reasonFamily: string | null,
): Promise<WalletRow> {
  if (wallet.state === "restricted") return wallet;
  const normalizedReason = reasonFamily ?? "customer_access_restricted";
  const restricted = await transitionWallet(context, {
    wallet,
    nextState: "restricted",
    reasonFamily: normalizedReason,
    commandKey: `customer-access-restricted:${wallet.version + 1}`,
  });
  await appendWalletAudit(context, {
    wallet: restricted,
    actorId: "samra-control-plane",
    action: "customer_wallet_restricted_by_onboarding",
    metadata: {
      provider: "crossmint",
      reasonFamily: normalizedReason,
      syntheticOnly: wallet.environment === "synthetic",
      enablesFunding: false,
      enablesRemittance: false,
    },
  });
  return restricted;
}

async function appendWalletAudit(
  context: PostgresPersistenceContext,
  input: Readonly<{
    wallet: WalletRow;
    eventSuffix?: string;
    actorId: string;
    action: string;
    metadata: Readonly<Record<string, unknown>>;
  }>,
): Promise<void> {
  await context.query().query(
    `INSERT INTO samra_core.audit_events
     (event_key, actor_type, actor_id, action, entity_type, entity_id, metadata)
     VALUES ($1,'system',$2,$3,'customer_wallet',$4,$5::jsonb)`,
    [
      `customer-wallet:${input.wallet.id}:${
        input.eventSuffix ?? `version:${input.wallet.version}`
      }`,
      input.actorId,
      input.action,
      input.wallet.id,
      JSON.stringify(input.metadata),
    ],
  );
}

function mapWallet(
  wallet: WalletRow,
  mapping: WalletMappingRow | undefined,
  currentWalletConsentAccepted = true,
): CustomerWalletSnapshot {
  return Object.freeze({
    walletId: wallet.external_ref,
    state: wallet.state,
    reasonFamily: wallet.reason_family,
    provider: "crossmint",
    asset: "USDC",
    network: mapping?.network ?? null,
    custodyModel:
      wallet.state === "ready" ? (mapping?.custody_model ?? null) : null,
    publicAddress:
      wallet.state === "ready" ? (mapping?.public_address ?? null) : null,
    configurationVersion: wallet.configuration_version,
    synthetic: wallet.environment === "synthetic",
    version: wallet.version,
    readyAt: wallet.ready_at?.toISOString() ?? null,
    createdAt: wallet.created_at.toISOString(),
    updatedAt: wallet.updated_at.toISOString(),
    nextAllowedActions: walletNextActions(
      wallet.state,
      wallet.environment,
      currentWalletConsentAccepted,
    ),
  });
}

function restrictedWalletSnapshot(
  snapshot: CustomerWalletSnapshot,
  reasonFamily: string | null,
): CustomerWalletSnapshot {
  return Object.freeze({
    ...snapshot,
    state: "restricted",
    reasonFamily: reasonFamily ?? "customer_access_restricted",
    custodyModel: null,
    publicAddress: null,
    nextAllowedActions: Object.freeze(["contact_support"]),
  });
}

function walletNextActions(
  state: CustomerWalletState,
  environment: WalletRow["environment"],
  currentWalletConsentAccepted = true,
): readonly string[] {
  if (!currentWalletConsentAccepted && state !== "restricted") {
    return Object.freeze(["accept_current_wallet_disclosure"]);
  }
  const actions: Readonly<Record<CustomerWalletState, readonly string[]>> = {
    created: ["await_wallet_provisioning"],
    provisioning:
      environment === "staging"
        ? ["await_wallet_reconciliation", "contact_support"]
        : ["await_wallet_provisioning"],
    customer_control_setup: ["await_customer_control_setup"],
    ready: ["continue_to_funding_setup"],
    restricted: ["contact_support"],
    error:
      environment === "staging"
        ? ["await_wallet_reconciliation", "contact_support"]
        : ["retry_wallet_provisioning", "contact_support"],
  };
  return Object.freeze([...actions[state]]);
}

function normalizeProviderResult(
  result: CustomerWalletProviderResult,
  configurationVersion: string,
): CustomerWalletProviderResult {
  const normalized = Object.freeze({
    providerWalletRef: normalizeVisibleValue(
      result.providerWalletRef,
      "provider wallet reference",
      1,
      255,
    ),
    network: normalizeVisibleValue(result.network, "wallet network", 1, 64),
    custodyModel: normalizeVisibleValue(
      result.custodyModel,
      "wallet custody model",
      1,
      64,
    ),
    publicAddress:
      result.publicAddress === null
        ? null
        : normalizeVisibleValue(
            result.publicAddress,
            "wallet public address",
            1,
            255,
          ),
    configurationVersion: normalizeVisibleValue(
      result.configurationVersion,
      "wallet configuration version",
      1,
      128,
    ),
  });
  if (
    configurationVersion === CUSTOMER_CONTROLLED_SANDBOX_CONFIGURATION_VERSION
  ) {
    if (
      normalized.configurationVersion !== configurationVersion ||
      normalized.network !== "evm" ||
      normalized.custodyModel !== "smart-customer-email-recovery" ||
      normalized.publicAddress === null ||
      !/^0x[0-9a-f]{40}$/u.test(normalized.publicAddress) ||
      normalized.providerWalletRef !== `evm:${normalized.publicAddress}`
    ) {
      throw new DomainError(
        "INVALID_ARGUMENT",
        "The sandbox wallet provider returned unapproved configuration data.",
      );
    }
    return normalized;
  }
  if (
    normalized.network !== "synthetic" ||
    normalized.custodyModel !== "synthetic" ||
    normalized.publicAddress !== null ||
    normalized.configurationVersion !== ALPHA_WALLET_CONFIGURATION_VERSION
  ) {
    throw new DomainError(
      "INVALID_ARGUMENT",
      "The synthetic wallet provider returned unapproved configuration data.",
    );
  }
  return normalized;
}

function sameProviderResult(
  mapping: WalletMappingRow,
  result: CustomerWalletProviderResult,
): boolean {
  return (
    mapping.provider_wallet_ref === result.providerWalletRef &&
    mapping.network === result.network &&
    mapping.custody_model === result.custodyModel &&
    mapping.public_address === result.publicAddress &&
    mapping.configuration_version === result.configurationVersion
  );
}

function mappingFromResult(
  result: CustomerWalletProviderResult,
): WalletMappingRow {
  return {
    provider_wallet_ref: result.providerWalletRef,
    network: result.network,
    custody_model: result.custodyModel,
    public_address: result.publicAddress,
    configuration_version: result.configurationVersion,
  };
}

function assertWalletConsent(
  consent: CustomerWalletProvisioningConsent,
  disclosure: Readonly<{
    bundleVersion: string;
    documentVersion: string;
    locale: string;
  }>,
): void {
  if (
    consent.bundleVersion !== disclosure.bundleVersion ||
    consent.documentVersion !== disclosure.documentVersion ||
    consent.locale !== disclosure.locale ||
    consent.decision !== "accepted"
  ) {
    throw new DomainError(
      "INVALID_ARGUMENT",
      "The current non-production wallet provisioning disclosure must be accepted exactly.",
    );
  }
}

function assertIdentityAccess(identity: IdentityContextRow): void {
  if (
    identity.identity_state !== "active" ||
    identity.customer_state !== "active"
  ) {
    throw new CustomerOnboardingAccessRestrictedError();
  }
}

function ownerLocator(customerExternalRef: string): string {
  return `userId:${customerExternalRef}`;
}

async function lockIdentity(
  context: PostgresPersistenceContext,
  issuer: string,
  subject: string,
): Promise<void> {
  await context
    .query()
    .query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [
      `customer-wallet:${issuer}:${subject}`,
    ]);
}

function normalizeVisibleValue(
  value: string,
  label: string,
  minimum: number,
  maximum: number,
): string {
  if (
    value.length < minimum ||
    value.length > maximum ||
    value !== value.trim() ||
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw new DomainError(
      "INVALID_ARGUMENT",
      `${label} must be ${minimum} to ${maximum} visible characters.`,
    );
  }
  return value;
}

function normalizeDigest(value: string, label: string): string {
  if (!/^[0-9a-f]{64}$/u.test(value)) {
    throw new DomainError(
      "INVALID_ARGUMENT",
      `${label} must be a lowercase SHA-256 digest.`,
    );
  }
  return value;
}

function invalidWalletTransition(): DomainError {
  return new DomainError(
    "INVALID_TRANSITION",
    "The customer wallet cannot make the requested state transition.",
  );
}

function walletConcurrencyConflict(): DomainError {
  return new DomainError(
    "CONFLICT",
    "The customer wallet changed before the command could complete.",
  );
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function fingerprint(value: Readonly<Record<string, unknown>>): string {
  return sha256(JSON.stringify(value));
}
