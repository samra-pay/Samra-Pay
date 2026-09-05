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

/** Trusted, per-customer enrollment evidence; never accept this from a request body.
 * The resolver must read a verified, consented customer recovery enrollment.
 * It must preserve the enrollment across retries and reject changed ownership.
 */
export type CrossmintCustomerRecovery = Readonly<{
  ownerLocator: string;
  type: "email";
  email: string;
}>;

export type CrossmintSandboxAdapterConfig = Readonly<{
  apiKey: string;
  apiVersion: typeof CROSSMINT_SANDBOX_API_VERSION;
  chainType: "evm";
  walletType: "smart";
  configurationVersion: "crossmint-sandbox-customer-recovery-v1";
  requestTimeoutMilliseconds?: number;
}>;

export class CrossmintSandboxAdapter implements CustomerWalletProvider {
  readonly provider = "crossmint" as const;
  readonly #apiKey: string;
  readonly #configurationVersion: string;
  readonly #resolveCustomerRecovery: (
    ownerLocator: string,
  ) => Promise<CrossmintCustomerRecovery>;
  readonly #requestTimeoutMilliseconds: number;
  readonly #fetch: FetchLike;

  constructor(
    config: CrossmintSandboxAdapterConfig,
    dependencies: Readonly<{
      fetch?: FetchLike;
      resolveCustomerRecovery: (
        ownerLocator: string,
      ) => Promise<CrossmintCustomerRecovery>;
    }>,
  ) {
    assertApiKey(config.apiKey);
    if (config.apiVersion !== CROSSMINT_SANDBOX_API_VERSION) {
      throw new Error("The Crossmint sandbox API version is not approved.");
    }
    if (config.chainType !== "evm") {
      throw new Error("The Crossmint sandbox chain type is not approved.");
    }
    if (
      config.configurationVersion !== "crossmint-sandbox-customer-recovery-v1"
    ) {
      throw new Error(
        "The Crossmint sandbox configuration version is invalid.",
      );
    }
    // Reject legacy/global signers even if supplied by untyped configuration.
    if (config.walletType !== "smart" || "adminSigner" in config) {
      throw new Error("Customer wallets require customer-controlled recovery.");
    }
    if (typeof dependencies?.resolveCustomerRecovery !== "function") {
      throw new Error("Customer recovery enrollment is required.");
    }
    this.#resolveCustomerRecovery = dependencies.resolveCustomerRecovery;
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
    // A caller must not change ownership or retry identity while enrollment loads.
    input = Object.freeze({ ...input });
    assertCreateInput(input, this.#configurationVersion);
    // Copy only validated values. Do not retain recovery PII in provider mappings.
    let recovery: CrossmintCustomerRecovery;
    try {
      const resolved = await this.#resolveCustomerRecovery(input.ownerLocator);
      if (
        resolved?.ownerLocator !== input.ownerLocator ||
        resolved.type !== "email" ||
        typeof resolved.email !== "string" ||
        resolved.email.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(resolved.email)
      )
        throw providerFailure();
      recovery = Object.freeze({
        ownerLocator: resolved.ownerLocator,
        type: "email",
        email: resolved.email,
      });
    } catch {
      throw providerFailure();
    }
    const body = {
      chainType: "evm" as const,
      type: "smart" as const,
      config: { adminSigner: { type: "email", email: recovery.email } },
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
      const rawBody = await readBoundedResponse(response);
      parsed = JSON.parse(rawBody) as unknown;
    } catch {
      throw providerFailure();
    }
    return normalizeCreateResponse({
      value: parsed,
      expectedOwner: input.ownerLocator,
      expectedRecoveryEmail: recovery.email,
      configurationVersion: this.#configurationVersion,
    });
  }
}

function assertApiKey(value: string): void {
  if (
    typeof value !== "string" ||
    value.length < 16 ||
    value.length > 512 ||
    /[^\x21-\x7e]/u.test(value)
  ) {
    throw new Error("The Crossmint sandbox server API key is invalid.");
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

async function readBoundedResponse(response: Response): Promise<string> {
  if (!response.body) throw providerFailure();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.byteLength;
      if (length > MAX_RESPONSE_BYTES) {
        // Cancel without waiting for an untrusted producer to acknowledge it.
        void reader.cancel().catch(() => undefined);
        throw providerFailure();
      }
      chunks.push(next.value);
    }
    return Buffer.concat(chunks, length).toString("utf8");
  } finally {
    reader.releaseLock();
  }
}

function normalizeCreateResponse(
  input: Readonly<{
    value: unknown;
    expectedOwner: string;
    expectedRecoveryEmail: string;
    configurationVersion: string;
  }>,
): CustomerWalletProviderResult {
  const root = asRecord(input.value);
  const address = root?.["address"];
  if (
    root?.["chainType"] !== "evm" ||
    root?.["type"] !== "smart" ||
    root?.["owner"] !== input.expectedOwner ||
    typeof address !== "string" ||
    !isEvmAddress(address)
  ) {
    throw providerFailure();
  }
  assertResponseSigner(root, input.expectedRecoveryEmail);
  const normalizedAddress = address.toLowerCase();
  return Object.freeze({
    providerWalletRef: `evm:${normalizedAddress}`,
    network: "evm",
    // Creation proves recovery configuration, not enrolled passkey control.
    custodyModel: "smart-customer-recovery-pending-passkey",
    publicAddress: normalizedAddress,
    configurationVersion: input.configurationVersion,
  });
}

function assertResponseSigner(
  root: Record<string, unknown>,
  expectedEmail: string,
): void {
  const config = asRecord(root["config"]);
  const actual = asRecord(config?.["adminSigner"]);
  if (actual?.["type"] !== "email" || actual["email"] !== expectedEmail) {
    throw providerFailure();
  }
  // Unexpected operational authority on a newly created wallet needs review.
  for (const field of ["delegatedSigners", "signers"]) {
    const signers = config?.[field];
    if (
      signers !== undefined &&
      (!Array.isArray(signers) || signers.length !== 0)
    ) {
      throw providerFailure();
    }
  }
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
