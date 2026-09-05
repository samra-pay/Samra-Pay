import {
  CUSTOMER_CONTROLLED_SANDBOX_CONFIGURATION_VERSION,
  type CustomerWalletProviderResult,
} from "@workspace/db";
import type { CustomerWalletProvider } from "./customer-wallet";
import type { CustomerWalletProviderConfig } from "../config";

type Config = Extract<
  CustomerWalletProviderConfig,
  { mode: "crossmint-sandbox-customer" }
>;

// Creation only. This adapter has no transaction, recovery, or signing method.
export class CrossmintCustomerSandboxAdapter implements CustomerWalletProvider {
  readonly provider = "crossmint" as const;
  readonly #config: Config;
  readonly #fetch: typeof fetch;
  constructor(config: Config, dependencies: { fetch?: typeof fetch } = {}) {
    if (
      !/^sk_staging_[A-Za-z0-9]{16,480}$/u.test(config.apiKey) ||
      !/^customer_[0-9a-f]{32}$/u.test(config.allowedCustomerId) ||
      config.recoveryEmail.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(config.recoveryEmail)
    ) {
      throw new Error(
        "Invalid customer-controlled Crossmint sandbox configuration.",
      );
    }
    this.#config = Object.freeze({ ...config });
    this.#fetch = dependencies.fetch ?? fetch;
  }

  async createWallet(
    input: Parameters<CustomerWalletProvider["createWallet"]>[0],
  ): Promise<CustomerWalletProviderResult> {
    if (
      input.ownerLocator !== `userId:${this.#config.allowedCustomerId}` ||
      !/^wallet_[0-9a-f]{32}$/u.test(input.walletId) ||
      !/^[0-9a-f]{64}$/u.test(input.providerRequestKey) ||
      input.asset !== "USDC" ||
      input.configurationVersion !==
        CUSTOMER_CONTROLLED_SANDBOX_CONFIGURATION_VERSION
    ) {
      throw new Error(
        "The customer-controlled sandbox wallet request is not approved.",
      );
    }
    // The configured email belongs only to the allowlisted tester. It is never
    // accepted from an HTTP body or persisted in provider mapping/audit data.
    let value: unknown;
    try {
      const response = await this.#fetch(
        "https://staging.crossmint.com/api/2025-06-09/wallets",
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "X-API-KEY": this.#config.apiKey,
            "x-idempotency-key": input.providerRequestKey,
          },
          body: JSON.stringify({
            chainType: "evm",
            type: "smart",
            owner: input.ownerLocator,
            config: {
              adminSigner: { type: "email", email: this.#config.recoveryEmail },
            },
          }),
          redirect: "error",
          signal: AbortSignal.timeout(4000),
        },
      );
      if (
        ![200, 201].includes(response.status) ||
        !/^application\/json(?:\s*;|$)/iu.test(
          response.headers.get("content-type") ?? "",
        )
      ) {
        await response.body?.cancel();
        throw new Error();
      }
      if (!response.body) throw new Error();
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      for await (const chunk of response.body) {
        bytes += chunk.length;
        if (bytes > 64 * 1024) throw new Error();
        chunks.push(chunk);
      }
      value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw failure();
    }
    const wallet = record(value);
    const config = record(wallet?.["config"]);
    const admin = record(config?.["adminSigner"]);
    const address = wallet?.["address"];
    if (
      wallet?.["owner"] !== input.ownerLocator ||
      wallet?.["chainType"] !== "evm" ||
      wallet?.["type"] !== "smart" ||
      typeof address !== "string" ||
      !/^0x[0-9a-fA-F]{40}$/u.test(address) ||
      admin?.["type"] !== "email" ||
      admin["email"] !== this.#config.recoveryEmail
    )
      throw failure();
    // Do not accept an existing wallet with unexpected delegated authority.
    for (const delegated of [
      wallet?.["delegatedSigners"],
      config?.["delegatedSigners"],
    ]) {
      if (
        delegated !== undefined &&
        (!Array.isArray(delegated) || delegated.length !== 0)
      )
        throw failure();
    }
    const normalizedAddress = address.toLowerCase();
    return Object.freeze({
      providerWalletRef: `evm:${normalizedAddress}`,
      network: "evm",
      custodyModel: "smart-customer-email-recovery",
      publicAddress: normalizedAddress,
      configurationVersion: CUSTOMER_CONTROLLED_SANDBOX_CONFIGURATION_VERSION,
    });
  }
}
function failure(): Error {
  return new Error(
    "Customer-controlled Crossmint sandbox wallet creation failed.",
  );
}
function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
