import type { CustomerWalletProviderResult } from "@workspace/db";
import type { CustomerWalletProvider } from "./customer-wallet";

const CROSSMINT_SANDBOX_API_VERSION = "2025-06-09" as const;
const CROSSMINT_SANDBOX_API_ORIGIN = `https://staging.crossmint.com/api/${CROSSMINT_SANDBOX_API_VERSION}/`;
const CROSSMINT_CREATE_WALLET_PATH = "wallets";
const MAX_RESPONSE_BYTES = 64 * 1024;

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type CrossmintSandboxAdminSigner =
  | Readonly<{ type: "server" }>
  | Readonly<{ type: "external-wallet"; address: string }>;

export type CrossmintSandboxAdapterConfig = Readonly<
  {
    apiKey: string;
    apiVersion: typeof CROSSMINT_SANDBOX_API_VERSION;
    chainType: "evm";
    configurationVersion: string;
    requestTimeoutMilliseconds?: number;
  } & (
    | Readonly<{
        walletType: "smart";
        adminSigner: CrossmintSandboxAdminSigner;
      }>
    | Readonly<{
        walletType: "mpc";
      }>
  )
>;

export class CrossmintSandboxAdapter implements CustomerWalletProvider {
  readonly provider = "crossmint" as const;
  readonly #apiKey: string;
  readonly #configurationVersion: string;
  readonly #walletType: "smart" | "mpc";
  readonly #adminSigner: CrossmintSandboxAdminSigner | undefined;
  readonly #requestTimeoutMilliseconds: number;
  readonly #fetch: FetchLike;

  constructor(
    config: CrossmintSandboxAdapterConfig,
    dependencies: Readonly<{ fetch?: FetchLike }> = {},
  ) {
    assertApiKey(config.apiKey);
    if (config.apiVersion !== CROSSMINT_SANDBOX_API_VERSION) {
      throw new Error("The Crossmint sandbox API version is not approved.");
    }
    if (config.chainType !== "evm") {
      throw new Error("The Crossmint sandbox chain type is not approved.");
    }
    if (
      !/^crossmint-sandbox-[a-z0-9][a-z0-9-]{0,95}$/u.test(
        config.configurationVersion,
      )
    ) {
      throw new Error(
        "The Crossmint sandbox configuration version is invalid.",
      );
    }
    if (config.walletType === "smart") {
      assertAdminSigner(config.adminSigner);
      this.#adminSigner = Object.freeze({ ...config.adminSigner });
    } else if (config.walletType === "mpc") {
      this.#adminSigner = undefined;
    } else {
      throw new Error("The Crossmint sandbox wallet type is not approved.");
    }
    const requestTimeoutMilliseconds =
      config.requestTimeoutMilliseconds ?? 4_000;
    if (
      !Number.isInteger(requestTimeoutMilliseconds) ||
      requestTimeoutMilliseconds < 1 ||
      requestTimeoutMilliseconds > 4_000
    ) {
      throw new Error(
        "Crossmint requestTimeoutMilliseconds must be an integer from 1 to 4000.",
      );
    }

    this.#apiKey = config.apiKey;
    this.#configurationVersion = config.configurationVersion;
    this.#walletType = config.walletType;
    this.#requestTimeoutMilliseconds = requestTimeoutMilliseconds;
    this.#fetch = dependencies.fetch ?? fetch;
  }

  async createWallet(
    input: Readonly<{
      walletId: string;
      ownerLocator: string;
      providerRequestKey: string;
      asset: "USDC";
      configurationVersion: string;
    }>,
  ): Promise<CustomerWalletProviderResult> {
    assertCreateInput(input, this.#configurationVersion);
    const body =
      this.#walletType === "smart"
        ? {
            chainType: "evm" as const,
            type: "smart" as const,
            config: {
              adminSigner: this.#adminSigner,
            },
            owner: input.ownerLocator,
          }
        : {
            chainType: "evm" as const,
            type: "mpc" as const,
            owner: input.ownerLocator,
          };

    let response: Response;
    try {
      response = await this.#fetch(
        new URL(CROSSMINT_CREATE_WALLET_PATH, CROSSMINT_SANDBOX_API_ORIGIN),
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "X-API-KEY": this.#apiKey,
            "x-idempotency-key": input.providerRequestKey,
          },
          body: JSON.stringify(body),
          redirect: "error",
          signal: AbortSignal.timeout(this.#requestTimeoutMilliseconds),
        },
      );
    } catch {
      throw providerFailure();
    }

    if (response.status !== 200 && response.status !== 201) {
      throw providerFailure();
    }
    if (!isJsonResponse(response.headers.get("content-type"))) {
      throw providerFailure();
    }
    const declaredLength = Number(response.headers.get("content-length"));
    if (
      Number.isFinite(declaredLength) &&
      declaredLength > MAX_RESPONSE_BYTES
    ) {
      throw providerFailure();
    }

    let parsed: unknown;
    try {
      const rawBody = await response.text();
      if (Buffer.byteLength(rawBody, "utf8") > MAX_RESPONSE_BYTES) {
        throw providerFailure();
      }
      parsed = JSON.parse(rawBody) as unknown;
    } catch {
      throw providerFailure();
    }
    return normalizeCreateResponse({
      value: parsed,
      expectedOwner: input.ownerLocator,
      expectedWalletType: this.#walletType,
      expectedAdminSigner: this.#adminSigner,
      configurationVersion: this.#configurationVersion,
    });
  }
}

function assertApiKey(value: string): void {
  if (value.length < 16 || value.length > 512 || /[^\x21-\x7e]/u.test(value)) {
    throw new Error("The Crossmint sandbox server API key is invalid.");
  }
}

function assertAdminSigner(value: CrossmintSandboxAdminSigner): void {
  if (value.type === "server") {
    if (Object.keys(value).length !== 1) {
      throw new Error("The Crossmint server signer configuration is invalid.");
    }
    return;
  }
  if (
    value.type !== "external-wallet" ||
    !isEvmAddress(value.address) ||
    Object.keys(value).length !== 2
  ) {
    throw new Error("The Crossmint external signer configuration is invalid.");
  }
}

function assertCreateInput(
  input: Parameters<CustomerWalletProvider["createWallet"]>[0],
  expectedConfigurationVersion: string,
): void {
  if (!/^wallet_[0-9a-f]{32}$/u.test(input.walletId)) {
    throw new Error("The Crossmint wallet request ID is invalid.");
  }
  if (!/^userId:customer_[0-9a-f]{32}$/u.test(input.ownerLocator)) {
    throw new Error("The Crossmint wallet owner is invalid.");
  }
  if (!/^[0-9a-f]{64}$/u.test(input.providerRequestKey)) {
    throw new Error("The Crossmint provider request key is invalid.");
  }
  if (input.asset !== "USDC") {
    throw new Error("The Crossmint sandbox asset is not approved.");
  }
  if (input.configurationVersion !== expectedConfigurationVersion) {
    throw new Error("The Crossmint wallet configuration changed.");
  }
}

function normalizeCreateResponse(
  input: Readonly<{
    value: unknown;
    expectedOwner: string;
    expectedWalletType: "smart" | "mpc";
    expectedAdminSigner: CrossmintSandboxAdminSigner | undefined;
    configurationVersion: string;
  }>,
): CustomerWalletProviderResult {
  const root = asRecord(input.value);
  const address = root?.["address"];
  if (
    root?.["chainType"] !== "evm" ||
    root?.["type"] !== input.expectedWalletType ||
    root?.["owner"] !== input.expectedOwner ||
    typeof address !== "string" ||
    !isEvmAddress(address)
  ) {
    throw providerFailure();
  }
  if (input.expectedWalletType === "smart") {
    assertResponseSigner(root, input.expectedAdminSigner);
  }
  const normalizedAddress = address.toLowerCase();
  return Object.freeze({
    providerWalletRef: `evm:${normalizedAddress}`,
    network: "evm",
    custodyModel: custodyModelFor(
      input.expectedWalletType,
      input.expectedAdminSigner,
    ),
    publicAddress: normalizedAddress,
    configurationVersion: input.configurationVersion,
  });
}

function assertResponseSigner(
  root: Record<string, unknown>,
  expected: CrossmintSandboxAdminSigner | undefined,
): void {
  const config = asRecord(root["config"]);
  const actual = asRecord(config?.["adminSigner"]);
  if (!expected || actual?.["type"] !== expected.type) {
    throw providerFailure();
  }
  if (
    expected.type === "external-wallet" &&
    (typeof actual?.["address"] !== "string" ||
      actual["address"].toLowerCase() !== expected.address.toLowerCase())
  ) {
    throw providerFailure();
  }
}

function custodyModelFor(
  walletType: "smart" | "mpc",
  signer: CrossmintSandboxAdminSigner | undefined,
): string {
  if (walletType === "mpc") return "mpc";
  return signer?.type === "external-wallet"
    ? "smart-external-wallet"
    : "smart-server-signer";
}

function isEvmAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/u.test(value);
}

function isJsonResponse(value: string | null): boolean {
  return value !== null && /^application\/json(?:\s*;|$)/iu.test(value);
}

function providerFailure(): Error {
  return new Error("Crossmint sandbox wallet creation failed.");
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
