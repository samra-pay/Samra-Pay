import { createHash } from "node:crypto";
import { DomainError } from "@workspace/remittance";
import {
  ALPHA_WALLET_CONFIGURATION_VERSION,
  type CustomerWalletProviderResult,
  type CustomerWalletProvisioningConsent,
  type CustomerWalletSnapshot,
  type CustomerWalletStore,
} from "@workspace/db";

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
    super("Wallet provisioning is temporarily unavailable. Please retry.");
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

  constructor(
    input: Readonly<{
      store: CustomerWalletStore;
      provider: CustomerWalletProvider;
      providerTimeoutMs?: number;
    }>,
  ) {
    this.#store = input.store;
    this.#provider = input.provider;
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
    const prepared = await this.#store.prepareAuth0Wallet(input);
    if (
      prepared.snapshot.state === "ready" ||
      prepared.snapshot.state === "restricted"
    ) {
      return Object.freeze({
        snapshot: prepared.snapshot,
        created: false,
      });
    }

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
      const failed = await this.#store.recordProviderStartFailure({
        walletId: prepared.snapshot.walletId,
        reasonFamily: "wallet_provider_unavailable",
      });
      if (failed.state !== "error") {
        return Object.freeze({ snapshot: failed, created: false });
      }
      throw new WalletProviderUnavailableError();
    }

    const snapshot = await this.#store.attachProviderWallet({
      walletId: prepared.snapshot.walletId,
      providerRequestKey: prepared.providerRequestKey,
      result: providerResult,
    });
    if (
      snapshot.state === "restricted" &&
      snapshot.reasonFamily === "wallet_provider_conflict"
    ) {
      throw new DomainError(
        "CONFLICT",
        "The wallet provider returned conflicting results. The onboarding record was restricted for review.",
      );
    }
    return Object.freeze({ snapshot, created: prepared.created });
  }

  getAuth0Wallet(input: {
    issuer: string;
    subject: string;
  }): Promise<CustomerWalletSnapshot> {
    return this.#store.getAuth0Wallet(input);
  }
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
