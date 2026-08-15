export const PROMO_RATE = 180; // 1 USD = 180 ETB (illustrative demo rate)
export const CARD_FEE_RATE = 0.03;
export const ACH_FEE_RATE = 0.01;
export const SHEBA_MILES_THRESHOLD = 500;
export const SHEBA_MILES_BONUS = 100;

export type DeliveryMethod = "wallet" | "bank";
export type PaymentMethod = "balance" | "card" | "plaid";

/**
 * Sanitize a raw text-input value into a valid currency string:
 * digits only, at most one decimal point, at most two fractional digits.
 */
export function sanitizeUsdInput(raw: string): string {
  let val = raw.replace(/[^\d.]/g, "");
  const firstDot = val.indexOf(".");
  if (firstDot !== -1) {
    val =
      val.slice(0, firstDot + 1) +
      val.slice(firstDot + 1).replace(/\./g, "").slice(0, 2);
  }
  return val;
}

/** Parse a sanitized currency string to a non-negative amount in cents-safe form. */
export function parseUsd(value: string): number {
  const num = parseFloat(value || "0");
  if (!Number.isFinite(num) || num < 0) return 0;
  return Math.round(num * 100) / 100;
}

export interface Quote {
  amount: number;
  serviceFee: number;
  totalCharged: number;
  recipientEtb: number;
  shebaMilesEarned: number;
}

/** Compute the full quote from a cents-safe amount. All money math rounds to cents. */
export function computeQuote(
  amount: number,
  paymentMethod: PaymentMethod,
  plaidLinked: boolean,
): Quote {
  const feeRate =
    paymentMethod === "card"
      ? CARD_FEE_RATE
      : paymentMethod === "plaid" && !plaidLinked
        ? ACH_FEE_RATE
        : 0;
  const serviceFee = Math.round(amount * feeRate * 100) / 100;
  return {
    amount,
    serviceFee,
    totalCharged: Math.round((amount + serviceFee) * 100) / 100,
    recipientEtb: Math.round(amount * PROMO_RATE * 100) / 100,
    shebaMilesEarned: amount > SHEBA_MILES_THRESHOLD ? SHEBA_MILES_BONUS : 0,
  };
}

export function formatUsd(amount: number): string {
  return amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatEtb(amount: number): string {
  return amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
