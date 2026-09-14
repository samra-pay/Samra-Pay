import { createHash } from "node:crypto";
import type { CustomerWalletDisclosure as ApiCustomerWalletDisclosure } from "@workspace/api-zod";
import { DomainError } from "@workspace/remittance";
import {
  ALPHA_WALLET_CONFIGURATION_VERSION,
  ALPHA_WALLET_PROVISIONING_DISCLOSURE,
  CUSTOMER_CONTROLLED_SANDBOX_DISCLOSURE,
  CustomerOnboardingAccessRestrictedError,
  type CustomerWalletProviderResult,
  type CustomerWalletProvisioningConsent,
  type CustomerWalletSnapshot,
  type CustomerWalletStore,
} from "@workspace/db";

export type CustomerWalletProviderMode = "fake" | "crossmint-sandbox-customer";

export type CustomerWalletDisclosure = Readonly<ApiCustomerWalletDisclosure>;

const SYNTHETIC_WALLET_DISCLOSURE_PRESENTATION = Object.freeze({
  title: "Create your synthetic USDC wallet record",
  body: "This alpha step creates only a synthetic wallet record. It does not create a blockchain wallet, tokens, public address, balance, funding, remittance, transfers, withdrawals, or live financial access.",
  acceptanceLabel: "I understand this creates only a synthetic wallet record",
  actionLabel: "Create synthetic wallet",
});

const STAGING_WALLET_DISCLOSURE_PRESENTATION = Object.freeze({
  title: "Create your Crossmint non-production EVM wallet",
  body: "This creates a real, non-production Crossmint EVM wallet intended for future approved USDC use and associates it with your Samra account. Crossmint receives an opaque Samra customer reference and the configured tester recovery email for the wallet's email admin signer. Samra has not configured a token or on-chain asset for this wallet. Because this flow does not inspect on-chain holdings, it makes no claim that the address is empty; Samra does not recognize or present a wallet balance. Customer signing and recovery control have not been verified, so the wallet is not ready. Funding, remittance, transfers, withdrawals, and live financial access remain disabled.",
  acceptanceLabel:
    "I understand Crossmint receives the configured tester recovery email; this flow does not prove the wallet is empty or customer-controlled, and Samra does not present a wallet balance",
  actionLabel: "Create Crossmint test wallet",
});

export interface CustomerWalletProvider {
  readonly provider: "crossmint";
  createWallet(
    input: Readonly<{
      walletId: string;
      ownerLocator: string;
      providerRequestKey: string;
      asset: "USDC";
      configurationVersion: string;
    }>,
  ): Promise<CustomerWalletProviderResult>;
}

export class WalletProviderUnavailableError extends Error {
  constructor() {
    super(
      "Wallet provisioning is temporarily unavailable while Samra confirms the provider outcome.",
    );
    this.name = "WalletProviderUnavailableError";
  }
}

export class DeterministicFakeCrossmintAdapter implements CustomerWalletProvider {
  readonly provider = "crossmint" as const;

  async createWallet(
    input: Readonly<{
      walletId: string;
      ownerLocator: string;
      providerRequestKey: string;
      asset: "USDC";
      configurationVersion: string;
    }>,
  ): Promise<CustomerWalletProviderResult> {
    const digest = sha256(
      `${input.walletId}:${input.ownerLocator}:${input.providerRequestKey}:${input.asset}:${input.configurationVersion}`,
    );
    return Object.freeze({
      providerWalletRef: `wallet_fake_${digest.slice(0, 32)}`,
      network: "synthetic",
      custodyModel: "synthetic",
      publicAddress: null,
      configurationVersion: ALPHA_WALLET_CONFIGURATION_VERSION,
    });
  }
}

export class CustomerWalletProvisioningService {
  readonly #store: CustomerWalletStore;
  readonly #provider: CustomerWalletProvider;
  readonly #providerTimeoutMs: number;
  readonly #disclosure: CustomerWalletDisclosure;

  constructor(
    input: Readonly<{
      store: CustomerWalletStore;
      provider: CustomerWalletProvider;
      providerMode?: CustomerWalletProviderMode;
      providerTimeoutMs?: number;
    }>,
  ) {
    this.#store = input.store;
    this.#provider = input.provider;
    this.#disclosure = customerWalletDisclosureFor(
      input.providerMode ?? "fake",
    );
    this.#providerTimeoutMs = input.providerTimeoutMs ?? 5_000;
    if (
      !Number.isInteger(this.#providerTimeoutMs) ||
      this.#providerTimeoutMs < 1 ||
      this.#providerTimeoutMs > 30_000
    ) {
      throw new Error("providerTimeoutMs must be an integer from 1 to 30000.");
    }
  }

  async startAuth0Wallet(input: {
    issuer: string;
    subject: string;
    idempotencyKey: string;
    consent: CustomerWalletProvisioningConsent;
  }): Promise<
    Readonly<{ snapshot: CustomerWalletSnapshot; created: boolean }>
  > {
    assertCustomerWalletConsentMatchesDisclosure(
      input.consent,
      this.#disclosure,
    );
    const prepared = await this.#store.prepareAuth0Wallet(input);
    if (
      prepared.snapshot.state === "customer_control_setup" ||
      prepared.snapshot.state === "ready"
    ) {
      return Object.freeze({
        snapshot: prepared.snapshot,
        created: false,
      });
    }
    if (prepared.snapshot.state === "restricted") {
      throwWalletRestriction(prepared.snapshot);
    }
    if (this.#disclosure.environment === "staging" && !prepared.created) {
      throw new WalletProviderUnavailableError();
    }

    let snapshot: CustomerWalletSnapshot;
    try {
      snapshot = await this.#store.runAuthorizedProviderDispatch(
        {
          issuer: input.issuer,
          subject: input.subject,
          walletId: prepared.snapshot.walletId,
          providerRequestKey: prepared.providerRequestKey,
        },
        async () => {
          let providerResult: CustomerWalletProviderResult;
          try {
            providerResult = await withTimeout(
              this.#provider.createWallet({
                walletId: prepared.snapshot.walletId,
                ownerLocator: prepared.ownerLocator,
                providerRequestKey: prepared.providerRequestKey,
                asset: "USDC",
                configurationVersion: prepared.snapshot.configurationVersion,
              }),
              this.#providerTimeoutMs,
            );
          } catch {
            throw new WalletProviderUnavailableError();
          }
          return this.#store.attachProviderWallet({
            walletId: prepared.snapshot.walletId,
            providerRequestKey: prepared.providerRequestKey,
            result: providerResult,
          });
        },
      );
    } catch (error) {
      if (!(error instanceof WalletProviderUnavailableError)) throw error;
      const failed = await this.#store.recordProviderStartFailure({
        walletId: prepared.snapshot.walletId,
        reasonFamily:
          this.#disclosure.environment === "staging"
            ? "wallet_provider_outcome_unknown"
            : "wallet_provider_unavailable",
      });
      if (failed.state === "restricted") throwWalletRestriction(failed);
      if (failed.state !== "error") {
        return Object.freeze({ snapshot: failed, created: false });
      }
      throw error;
    }

    if (snapshot.state === "restricted") throwWalletRestriction(snapshot);
    return Object.freeze({ snapshot, created: prepared.created });
  }

  getAuth0Wallet(input: {
    issuer: string;
    subject: string;
  }): Promise<CustomerWalletSnapshot> {
    return this.#store.getAuth0Wallet(input);
  }
}

function throwWalletRestriction(snapshot: CustomerWalletSnapshot): never {
  if (snapshot.reasonFamily === "wallet_provider_conflict") {
    throw new DomainError(
      "CONFLICT",
      "The wallet provider returned conflicting results. The onboarding record was restricted for review.",
    );
  }
  throw new CustomerOnboardingAccessRestrictedError();
}

export function customerWalletDisclosureFor(
  providerMode: CustomerWalletProviderMode,
): CustomerWalletDisclosure {
  if (providerMode === "crossmint-sandbox-customer") {
    return Object.freeze({
      bundleVersion: CUSTOMER_CONTROLLED_SANDBOX_DISCLOSURE.bundleVersion,
      documentVersion: CUSTOMER_CONTROLLED_SANDBOX_DISCLOSURE.documentVersion,
      locale: CUSTOMER_CONTROLLED_SANDBOX_DISCLOSURE.locale,
      legalEffect: CUSTOMER_CONTROLLED_SANDBOX_DISCLOSURE.legalEffect,
      environment: "staging",
      createsRealWallet: true,
      customerControlSetupRequired: true,
      fundingEnabled: false,
      remittanceEnabled: false,
      presentation: STAGING_WALLET_DISCLOSURE_PRESENTATION,
    });
  }
  return Object.freeze({
    bundleVersion: ALPHA_WALLET_PROVISIONING_DISCLOSURE.bundleVersion,
    documentVersion: ALPHA_WALLET_PROVISIONING_DISCLOSURE.documentVersion,
    locale: ALPHA_WALLET_PROVISIONING_DISCLOSURE.locale,
    legalEffect: ALPHA_WALLET_PROVISIONING_DISCLOSURE.legalEffect,
    environment: "synthetic",
    createsRealWallet: false,
    customerControlSetupRequired: false,
    fundingEnabled: false,
    remittanceEnabled: false,
    presentation: SYNTHETIC_WALLET_DISCLOSURE_PRESENTATION,
  });
}

export function assertCustomerWalletConsentMatchesDisclosure(
  consent: CustomerWalletProvisioningConsent,
  disclosure: CustomerWalletDisclosure,
): void {
  if (
    consent.bundleVersion !== disclosure.bundleVersion ||
    consent.documentVersion !== disclosure.documentVersion ||
    consent.locale !== disclosure.locale ||
    consent.decision !== "accepted"
  ) {
    throw new DomainError(
      "INVALID_ARGUMENT",
      "The accepted wallet disclosure does not match the current server-selected version.",
    );
  }
}

export function toPublicCustomerWalletSnapshot(
  snapshot: CustomerWalletSnapshot,
): CustomerWalletSnapshot {
  if (
    snapshot.state === "ready" ||
    (snapshot.publicAddress === null && snapshot.custodyModel === null)
  ) {
    return snapshot;
  }
  return Object.freeze({
    ...snapshot,
    custodyModel: null,
    publicAddress: null,
  });
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error("wallet provider request timed out")),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
