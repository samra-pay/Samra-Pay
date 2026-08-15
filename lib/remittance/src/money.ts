import { DomainError, assertDomain } from "./errors";

export type Currency = "USD" | "ETB";

export type Money = Readonly<{
  amountMinor: bigint;
  currency: Currency;
  scale: 2;
}>;

export type Rational = Readonly<{
  numerator: bigint;
  denominator: bigint;
}>;

export type RoundingMode = "DOWN" | "HALF_UP";

const MINOR_PATTERN = /^(0|[1-9][0-9]*)$/;

export function money(
  amountMinor: bigint,
  currency: Currency,
  options: Readonly<{ allowNegative?: boolean }> = {},
): Money {
  assertDomain(
    options.allowNegative === true || amountMinor >= 0n,
    "INVALID_ARGUMENT",
    "Money cannot be negative.",
  );

  return Object.freeze({ amountMinor, currency, scale: 2 as const });
}

export function parseMinor(value: string, field = "amountMinor"): bigint {
  assertDomain(
    MINOR_PATTERN.test(value),
    "INVALID_ARGUMENT",
    `${field} must be a non-negative integer string.`,
    { field },
  );
  return BigInt(value);
}

export function rational(numerator: bigint, denominator: bigint): Rational {
  assertDomain(
    numerator >= 0n,
    "INVALID_ARGUMENT",
    "A rational numerator cannot be negative.",
  );
  assertDomain(
    denominator > 0n,
    "INVALID_ARGUMENT",
    "A rate denominator must be greater than zero.",
  );

  const divisor = greatestCommonDivisor(numerator, denominator);
  return Object.freeze({
    numerator: numerator / divisor,
    denominator: denominator / divisor,
  });
}

export function add(left: Money, right: Money): Money {
  assertSameCurrency(left, right);
  return money(left.amountMinor + right.amountMinor, left.currency, {
    allowNegative: left.amountMinor + right.amountMinor < 0n,
  });
}

export function multiplyByRational(
  amountMinor: bigint,
  multiplier: Rational,
  rounding: RoundingMode = "HALF_UP",
): bigint {
  assertDomain(
    amountMinor >= 0n,
    "INVALID_ARGUMENT",
    "The amount to convert cannot be negative.",
  );

  const product = amountMinor * multiplier.numerator;
  const quotient = product / multiplier.denominator;
  const remainder = product % multiplier.denominator;

  if (rounding === "HALF_UP" && remainder * 2n >= multiplier.denominator) {
    return quotient + 1n;
  }

  return quotient;
}

export function convert(
  source: Money,
  destinationCurrency: Currency,
  rate: Rational,
  rounding: RoundingMode = "HALF_UP",
): Money {
  assertDomain(
    rate.numerator > 0n,
    "INVALID_ARGUMENT",
    "A currency conversion rate must be greater than zero.",
  );
  return money(
    multiplyByRational(source.amountMinor, rate, rounding),
    destinationCurrency,
  );
}

export function formatMinor(amount: Money): string {
  const isNegative = amount.amountMinor < 0n;
  const absolute = isNegative ? -amount.amountMinor : amount.amountMinor;
  const whole = absolute / 100n;
  const fraction = (absolute % 100n).toString().padStart(2, "0");
  return `${isNegative ? "-" : ""}${whole.toString()}.${fraction}`;
}

function assertSameCurrency(left: Money, right: Money): void {
  if (left.currency !== right.currency || left.scale !== right.scale) {
    throw new DomainError(
      "INVALID_ARGUMENT",
      "Money values must use the same currency and scale.",
    );
  }
}

function greatestCommonDivisor(left: bigint, right: bigint): bigint {
  let a = left;
  let b = right;
  while (b !== 0n) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a;
}
