import {
  PERSONAL_FUNDING_PAYMENT_STATUSES,
  PERSONAL_FUNDING_DELIVERY_STATUSES,
  type PersonalFundingProviderStatus,
} from "@workspace/db";
import type {
  PersonalFundingProvider,
  PersonalFundingStatusProvider,
} from "./personal-funding";

const endpoints = Object.freeze({
  staging: "https://staging.crossmint.com/api/2022-06-09/orders",
  production: "https://www.crossmint.com/api/2022-06-09/orders",
});
// Circle native USDC. Base is a proposed pilot network, not production approval.
const tokens = Object.freeze({
  staging: "base-sepolia:0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  production: "base:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
});

export class CrossmintOnrampUnavailableError extends Error {
  constructor() {
    super(
      "The funding provider response could not be confirmed. Reconcile this attempt before continuing.",
    );
    this.name = "CrossmintOnrampUnavailableError";
  }
}

/** Server-side order creation only. No token transfers, wallet creation or signing. */
export class CrossmintOnrampAdapter
  implements PersonalFundingProvider, PersonalFundingStatusProvider
{
  readonly environment: "staging" | "production";
  readonly #apiKey: string;
  readonly #receiptEmail: string;
  readonly #fetch: typeof fetch;
  constructor(
    config: {
      environment: "staging" | "production";
      apiKey: string;
      receiptEmail: string;
    },
    dependencies: { fetch?: typeof fetch } = {},
  ) {
    if (
      !Object.hasOwn(endpoints, config.environment) ||
      !new RegExp(`^sk_${config.environment}_[A-Za-z0-9]{16,480}$`, "u").test(
        config.apiKey,
      ) ||
      config.receiptEmail.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(config.receiptEmail)
    ) {
      throw new Error("Invalid Crossmint onramp server configuration.");
    }
    this.environment = config.environment;
    this.#apiKey = config.apiKey;
    // Single verified pilot participant. Never copied from a request body or logged.
    this.#receiptEmail = config.receiptEmail;
    this.#fetch = dependencies.fetch ?? fetch;
  }

  async createOrder(
    input: Parameters<PersonalFundingProvider["createOrder"]>[0],
  ): ReturnType<PersonalFundingProvider["createOrder"]> {
    if (
      input.environment !== this.environment ||
      !/^[1-9][0-9]{0,17}$/u.test(input.amountMinor) ||
      !/^0x[0-9a-f]{40}$/u.test(input.walletAddress) ||
      /^0x0{40}$/u.test(input.walletAddress) ||
      input.providerWalletRef !== `evm:${input.walletAddress}`
    )
      throw new CrossmintOnrampUnavailableError();
    const amount = BigInt(input.amountMinor);
    if (amount > 2000n) throw new CrossmintOnrampUnavailableError();
    try {
      const response = await this.#fetch(endpoints[this.environment], {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(4_000),
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-API-KEY": this.#apiKey,
        },
        body: JSON.stringify({
          state: "create",
          locale: "en-US",
          recipient: { walletAddress: input.walletAddress },
          payment: {
            method: "card",
            currency: "usd",
            receiptEmail: this.#receiptEmail,
          },
          lineItems: [
            {
              tokenLocator: tokens[this.environment],
              executionParameters: {
                mode: "exact-in",
                amount: `${amount / 100n}.${(amount % 100n).toString().padStart(2, "0")}`,
              },
            },
          ],
        }),
      });
      const value = await boundedJson(response, 201);
      const order = object(value?.["order"]);
      const providerOrderRef = order?.["orderId"];
      const clientSecret = value?.["clientSecret"];
      if (
        typeof providerOrderRef !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(
          providerOrderRef,
        ) ||
        typeof clientSecret !== "string" ||
        !/^[\x21-\x7e]{16,4096}$/u.test(clientSecret)
      ) {
        throw new CrossmintOnrampUnavailableError();
      }
      // Deliberately discard KYC, payment fields, raw payloads and checkout status.
      // This receipt proves only an order reference, never eligibility or delivery.
      return Object.freeze({ providerOrderRef, clientSecret });
    } catch {
      // No raw provider errors, tokens, receipts or personal data escape.
      throw new CrossmintOnrampUnavailableError();
    }
  }

  async readOrder(
    providerOrderRef: string,
  ): Promise<PersonalFundingProviderStatus> {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(
        providerOrderRef,
      )
    )
      throw new CrossmintOnrampUnavailableError();
    try {
      const response = await this.#fetch(
        `${endpoints[this.environment]}/${providerOrderRef}`,
        {
          method: "GET",
          redirect: "error",
          signal: AbortSignal.timeout(4_000),
          headers: { Accept: "application/json", "X-API-KEY": this.#apiKey },
        },
      );
      const value = await boundedJson(response, 200);
      const order = object(value?.["order"]);
      const payment = object(order?.["payment"]);
      const items = order?.["lineItems"];
      if (
        order?.["orderId"] !== providerOrderRef ||
        !payment ||
        typeof payment["status"] !== "string" ||
        !Array.isArray(items) ||
        items.length !== 1
      )
        throw new CrossmintOnrampUnavailableError();
      const item = object(items[0]);
      if (!item) throw new CrossmintOnrampUnavailableError();
      const delivery = object(item["delivery"]);
      const paymentStatus = (
        PERSONAL_FUNDING_PAYMENT_STATUSES as readonly unknown[]
      ).includes(payment["status"])
        ? (payment["status"] as PersonalFundingProviderStatus["paymentStatus"])
        : "unknown";
      const deliveryStatus =
        item["delivery"] === undefined
          ? "not-reported"
          : (PERSONAL_FUNDING_DELIVERY_STATUSES as readonly unknown[]).includes(
                delivery?.["status"],
              )
            ? (delivery![
                "status"
              ] as PersonalFundingProviderStatus["deliveryStatus"])
            : "unknown";
      // Never return preparation/KYC details, receipt email, secrets or provider errors.
      // These statuses report provider progress, not independent token delivery.
      return Object.freeze({ paymentStatus, deliveryStatus });
    } catch {
      throw new CrossmintOnrampUnavailableError();
    }
  }
}
async function boundedJson(response: Response, expectedStatus: number) {
  if (
    response.status !== expectedStatus ||
    !/^application\/json(?:\s*;|$)/iu.test(
      response.headers.get("content-type") ?? "",
    ) ||
    !response.body
  ) {
    await response.body?.cancel();
    throw new CrossmintOnrampUnavailableError();
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 64 * 1024) throw new CrossmintOnrampUnavailableError();
    chunks.push(chunk);
  }
  return object(JSON.parse(Buffer.concat(chunks).toString("utf8")));
}
function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
