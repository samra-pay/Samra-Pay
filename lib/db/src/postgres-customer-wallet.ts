import { createHash, randomUUID } from "node:crypto";
import { DomainError } from "@workspace/remittance";
import {
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
  "ready",
  "restricted",
  "error",
] as const);

export type CustomerWalletState = (typeof CUSTOMER_WALLET_STATES)[number];

export const ALPHA_WALLET_PROVISIONING_DISCLOSURE = Object.freeze({
  bundleVersion: "alpha-wallet-non-production-v1",
  documentVersion: "alpha-wallet-non-production-v1",
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
  synthetic: true;
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
  onboarding_version: number;
  identity_case_state: string | null;
};

type OnboardingRow = {
  id: string;
  state: CustomerOnboardingState;
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
  environment: "synthetic";
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

export class PostgresCustomerWalletStore {
  readonly #context: PostgresPersistenceContext;

  constructor(context: PostgresPersistenceContext) {
    this.#context = context;
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
    assertWalletConsent(input.consent);

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

      const existing = await selectWalletByOnboarding(
        this.#context,
        identity.onboarding_id,
        true,
      );
      if (existing) {
        if (existing.creation_command_key !== commandKey) {
          throw new DomainError(
            "CONFLICT",
            "The customer wallet already exists under a different idempotency command.",
          );
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

      let onboarding: OnboardingRow = {
        id: identity.onboarding_id,
        state: identity.onboarding_state,
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
        configurationVersion: ALPHA_WALLET_CONFIGURATION_VERSION,
      });
      const inserted = await this.#context.query().query<WalletRow>(
        `INSERT INTO samra_core.customer_wallets
         (external_ref, customer_id, onboarding_id, wallet_consent_id,
          provider, provider_request_key, creation_command_key, state, asset,
          environment, configuration_version)
         VALUES ($1,$2,$3,$4,'crossmint',$5,$6,'created','USDC','synthetic',$7)
         RETURNING ${walletReturningColumns()}`,
        [
          externalRef,
          identity.customer_id,
          identity.onboarding_id,
          consent.rows[0]!.id,
          providerRequestKey,
          commandKey,
          ALPHA_WALLET_CONFIGURATION_VERSION,
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
          environment: "synthetic",
          configurationVersion: ALPHA_WALLET_CONFIGURATION_VERSION,
          consentDocumentVersion: input.consent.documentVersion,
          onboardingState: onboarding.state,
          createsRealWallet: false,
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
    const result = normalizeProviderResult(input.result);

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
        if (sameProviderResult(existingMapping, result)) {
          return mapWallet(wallet, existingMapping);
        }
        const restricted = await restrictWalletForProviderConflict(
          this.#context,
          wallet,
        );
        return mapWallet(restricted, existingMapping);
      }
      if (wallet.state === "restricted" || wallet.state === "ready") {
        return mapWallet(wallet, undefined);
      }
      if (
        !new Set<CustomerWalletState>(["provisioning", "error"]).has(
          wallet.state,
        )
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
      const ready = await transitionWallet(this.#context, {
        wallet,
        nextState: "ready",
        reasonFamily: null,
        commandKey: `provider-wallet:${sha256(result.providerWalletRef)}`,
      });
      if (onboarding.state !== "wallet_ready") {
        await transitionOnboarding(this.#context, onboarding, {
          state: "wallet_ready",
          latestCompletedStep: "wallet_provisioned",
          reasonFamily: null,
          commandKey: `wallet-ready:${sha256(result.providerWalletRef)}`,
        });
      }
      await appendWalletAudit(this.#context, {
        wallet: ready,
        actorId: "customer-wallet-provider",
        action: "customer_wallet_provider_mapping_attached",
        metadata: {
          provider: "crossmint",
          asset: "USDC",
          network: result.network,
          custodyModel: result.custodyModel,
          configurationVersion: result.configurationVersion,
          syntheticOnly: true,
        },
      });
      return mapWallet(ready, mappingFromResult(result));
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
        metadata: { provider: "crossmint", reasonFamily, syntheticOnly: true },
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
    return snapshotForWallet(this.#context, wallet);
  }
}

export type CustomerWalletStore = Pick<
  PostgresCustomerWalletStore,
  | "prepareAuth0Wallet"
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
    `SELECT id, state, version
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

async function snapshotForWallet(
  context: PostgresPersistenceContext,
  wallet: WalletRow,
): Promise<CustomerWalletSnapshot> {
  return mapWallet(
    wallet,
    await selectWalletMapping(context, wallet.id, false),
  );
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
     RETURNING id, state, version`,
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
      syntheticOnly: true,
    },
  });
  return restricted;
}

async function appendWalletAudit(
  context: PostgresPersistenceContext,
  input: Readonly<{
    wallet: WalletRow;
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
      `customer-wallet:${input.wallet.id}:version:${input.wallet.version}`,
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
): CustomerWalletSnapshot {
  return Object.freeze({
    walletId: wallet.external_ref,
    state: wallet.state,
    reasonFamily: wallet.reason_family,
    provider: "crossmint",
    asset: "USDC",
    network: mapping?.network ?? null,
    custodyModel: mapping?.custody_model ?? null,
    publicAddress: mapping?.public_address ?? null,
    configurationVersion: wallet.configuration_version,
    synthetic: true,
    version: wallet.version,
    readyAt: wallet.ready_at?.toISOString() ?? null,
    createdAt: wallet.created_at.toISOString(),
    updatedAt: wallet.updated_at.toISOString(),
    nextAllowedActions: walletNextActions(wallet.state),
  });
}

function walletNextActions(state: CustomerWalletState): readonly string[] {
  const actions: Readonly<Record<CustomerWalletState, readonly string[]>> = {
    created: ["await_wallet_provisioning"],
    provisioning: ["await_wallet_provisioning"],
    ready: ["continue_to_funding_setup"],
    restricted: ["contact_support"],
    error: ["retry_wallet_provisioning", "contact_support"],
  };
  return Object.freeze([...actions[state]]);
}

function normalizeProviderResult(
  result: CustomerWalletProviderResult,
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

function assertWalletConsent(consent: CustomerWalletProvisioningConsent): void {
  if (
    consent.bundleVersion !==
      ALPHA_WALLET_PROVISIONING_DISCLOSURE.bundleVersion ||
    consent.documentVersion !==
      ALPHA_WALLET_PROVISIONING_DISCLOSURE.documentVersion ||
    consent.locale !== ALPHA_WALLET_PROVISIONING_DISCLOSURE.locale ||
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
