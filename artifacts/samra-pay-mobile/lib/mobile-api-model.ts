import type {
  AccountSummary,
  ActivityItem,
  Beneficiary,
  TransferStatus,
} from "@workspace/samra-client";

export function formatMinorUnits(
  minorUnits: string,
  fractionDigits = 2,
): string {
  const negative = minorUnits.startsWith("-");
  const digits = negative ? minorUnits.slice(1) : minorUnits;
  if (!/^\d+$/.test(digits)) return minorUnits;

  const padded = digits.padStart(fractionDigits + 1, "0");
  const whole =
    fractionDigits === 0 ? padded : padded.slice(0, -fractionDigits);
  const fraction = fractionDigits === 0 ? "" : padded.slice(-fractionDigits);
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}${grouped}${fraction ? `.${fraction}` : ""}`;
}

export function accountBalancePresentation(account: AccountSummary) {
  return {
    available: `$${formatMinorUnits(account.availableBalance.minorUnits)}`,
    book: `$${formatMinorUnits(account.bookBalance.minorUnits)}`,
  } as const;
}

export function activityAmountPresentation(item: ActivityItem): string {
  const symbol = item.amount.currency === "USD" ? "$" : "";
  const sign = item.direction === "credit" ? "+" : "−";
  return `${sign}${symbol}${formatMinorUnits(item.amount.minorUnits)} ${item.amount.currency}`;
}

export function beneficiaryDestination(beneficiary: Beneficiary): string {
  const details = beneficiary.deliveryDetails;
  return details.method === "bank"
    ? `${details.institutionName} •••• ${details.accountNumberLast4}`
    : `${details.institutionName} •••• ${details.phoneNumberLast4}`;
}

export function sanitizeUsdInput(value: string): string {
  const normalized = value.replace(/[^\d.]/g, "");
  const [whole = "", ...fractionParts] = normalized.split(".");
  const fraction = fractionParts.join("").slice(0, 2);
  const safeWhole = whole.replace(/^0+(?=\d)/, "").slice(0, 9);
  return fractionParts.length > 0
    ? `${safeWhole || "0"}.${fraction}`
    : safeWhole;
}

export function usdInputToMinorUnits(value: string): string | null {
  if (!/^\d+(?:\.\d{0,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  const minorUnits = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  return minorUnits > 0n ? minorUnits.toString() : null;
}

export function transferIdempotencyKey(quoteId: string): string {
  return `mobile-transfer-${quoteId}`.slice(0, 128);
}

export function cancelIdempotencyKey(transferId: string): string {
  return `mobile-cancel-${transferId}`.slice(0, 128);
}

export const TERMINAL_TRANSFER_STATUSES = new Set<TransferStatus>([
  "completed",
  "failed",
  "refunded",
  "cancelled",
]);

export function isTerminalTransferStatus(status: TransferStatus): boolean {
  return TERMINAL_TRANSFER_STATUSES.has(status);
}

export function transferStatusLabel(status: TransferStatus): string {
  return status.replaceAll("_", " ");
}
