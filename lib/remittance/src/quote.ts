import { assertDomain } from "./errors";
import { add, convert, money, multiplyByRational, rational } from "./money";
import type { Money, Rational } from "./money";
import type { RemittanceQuote } from "./model";

export type QuotePolicy = Readonly<{
  flatFeeMinor: bigint;
  variableFeeRate: Rational;
  usdToEtbRate: Rational;
  ttlMilliseconds: number;
}>;

export const DEFAULT_DEMO_QUOTE_POLICY: QuotePolicy = Object.freeze({
  flatFeeMinor: 300n,
  variableFeeRate: rational(0n, 1n),
  usdToEtbRate: rational(180n, 1n),
  ttlMilliseconds: 10 * 60 * 1_000,
});

export type CreateQuoteInput = Readonly<{
  id: string;
  actorId: string;
  sourceAccountId: string;
  beneficiaryId: string;
  sourceAmountMinor: bigint;
  fundingMethod?: "samra_balance";
  deliveryMethod: "bank" | "wallet";
  createdAt: Date;
  policy?: QuotePolicy;
}>;

export function createQuote(input: CreateQuoteInput): RemittanceQuote {
  const policy = input.policy ?? DEFAULT_DEMO_QUOTE_POLICY;
  assertDomain(
    input.sourceAmountMinor > 0n,
    "INVALID_ARGUMENT",
    "The source amount must be greater than zero.",
  );
  assertDomain(
    Number.isInteger(policy.ttlMilliseconds) && policy.ttlMilliseconds > 0,
    "INVALID_ARGUMENT",
    "The quote lifetime must be a positive whole number of milliseconds.",
  );

  const sourceAmount = money(input.sourceAmountMinor, "USD");
  const variableFeeMinor = multiplyByRational(
    sourceAmount.amountMinor,
    policy.variableFeeRate,
    "HALF_UP",
  );
  const feeAmount = money(policy.flatFeeMinor + variableFeeMinor, "USD");
  const debitAmount = add(sourceAmount, feeAmount);
  const recipientAmount = convert(
    sourceAmount,
    "ETB",
    policy.usdToEtbRate,
    "HALF_UP",
  );
  const createdAt = input.createdAt.toISOString();
  const expiresAt = new Date(
    input.createdAt.getTime() + policy.ttlMilliseconds,
  ).toISOString();

  return deepFreeze({
    id: input.id,
    actorId: input.actorId,
    sourceAccountId: input.sourceAccountId,
    beneficiaryId: input.beneficiaryId,
    sourceAmount,
    feeAmount,
    debitAmount,
    recipientAmount,
    rate: {
      sourceCurrency: "USD" as const,
      destinationCurrency: "ETB" as const,
      value: policy.usdToEtbRate,
    },
    fundingMethod: input.fundingMethod ?? "samra_balance",
    deliveryMethod: input.deliveryMethod,
    estimatedDelivery:
      input.deliveryMethod === "wallet" ? "Within minutes" : "Same day",
    createdAt,
    expiresAt,
  });
}

export function isQuoteExpired(quote: RemittanceQuote, at: Date): boolean {
  return at.getTime() >= Date.parse(quote.expiresAt);
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }

  for (const nested of Object.values(value)) {
    deepFreeze(nested);
  }

  return Object.freeze(value);
}
