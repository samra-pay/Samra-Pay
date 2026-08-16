import type {
  Beneficiary,
  DeliveryMethod,
  RemittanceQuote,
  TransferStatus,
} from "@workspace/samra-client";

export type SyntheticBeneficiary = Readonly<{
  id: string;
  name: string;
  location: string;
  deliveryMethod: DeliveryMethod;
  deliveryLabel: string;
  deliveryDetail: string;
}>;

export function toSyntheticBeneficiary(
  beneficiary: Beneficiary,
): SyntheticBeneficiary {
  const details = beneficiary.deliveryDetails;
  return {
    id: beneficiary.id,
    name: beneficiary.displayName,
    location: `${beneficiary.city}, ${beneficiary.countryCode}`,
    deliveryMethod: details.method,
    deliveryLabel: details.institutionName,
    deliveryDetail:
      details.method === "bank"
        ? `Bank account ending ${details.accountNumberLast4}`
        : `Mobile wallet ending ${details.phoneNumberLast4}`,
  };
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

export function formatMinorUnits(
  minorUnits: string,
  fractionDigits = 2,
): string {
  const isNegative = minorUnits.startsWith("-");
  const digits = isNegative ? minorUnits.slice(1) : minorUnits;
  if (!/^\d+$/.test(digits)) return minorUnits;

  if (fractionDigits === 0) {
    const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return `${isNegative ? "-" : ""}${grouped}`;
  }

  const padded = digits.padStart(fractionDigits + 1, "0");
  const whole = padded.slice(0, -fractionDigits) || "0";
  const fraction = fractionDigits > 0 ? padded.slice(-fractionDigits) : "";
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${isNegative ? "-" : ""}${grouped}${fraction ? `.${fraction}` : ""}`;
}

export function formatExchangeRate(rate: string): string {
  const [whole, fraction = ""] = rate.split(".");
  const trimmedFraction = fraction.replace(/0+$/, "");
  return trimmedFraction ? `${whole}.${trimmedFraction}` : whole;
}

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const ACTIVE_QUOTE_KEY = "samra.api.remittance.active-quote";
const ACTIVE_TRANSFER_KEY = "samra.api.remittance.active-transfer";
const IDEMPOTENCY_PREFIX = "samra.api.remittance.idempotency.";
const TRANSFER_FOR_QUOTE_PREFIX = "samra.api.remittance.transfer-for-quote.";

function readStorage(
  storage: KeyValueStorage | null,
  key: string,
): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writeStorage(
  storage: KeyValueStorage | null,
  key: string,
  value: string,
): void {
  try {
    storage?.setItem(key, value);
  } catch {
    // In-memory React guards still prevent duplicate submission this session.
  }
}

function removeStorage(storage: KeyValueStorage | null, key: string): void {
  try {
    storage?.removeItem(key);
  } catch {
    // Storage availability must never block an API operation or UI recovery.
  }
}

function browserStorage(): KeyValueStorage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function randomToken(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function getOrCreateTransferIdempotencyKey(
  quoteId: string,
  storage: KeyValueStorage | null = browserStorage(),
  tokenFactory: () => string = randomToken,
): string {
  const storageKey = `${IDEMPOTENCY_PREFIX}${quoteId}`;
  const stored = readStorage(storage, storageKey);
  if (stored) return stored;

  const created = `web-transfer-${tokenFactory()}`.slice(0, 128);
  writeStorage(storage, storageKey, created);
  return created;
}

export function getOrCreateCancelIdempotencyKey(
  transferId: string,
  storage: KeyValueStorage | null = browserStorage(),
  tokenFactory: () => string = randomToken,
): string {
  const storageKey = `${IDEMPOTENCY_PREFIX}cancel.${transferId}`;
  const stored = readStorage(storage, storageKey);
  if (stored) return stored;

  const created = `web-cancel-${tokenFactory()}`.slice(0, 128);
  writeStorage(storage, storageKey, created);
  return created;
}

function isMoney(value: unknown, currency: "USD" | "ETB"): boolean {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    record.currency === currency &&
    typeof record.minorUnits === "string" &&
    /^(0|[1-9][0-9]*)$/.test(record.minorUnits)
  );
}

function isStoredQuote(value: unknown): value is RemittanceQuote {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    ["active", "expired", "consumed"].includes(String(record.status)) &&
    typeof record.expiresAt === "string" &&
    typeof record.sourceAccountId === "string" &&
    typeof record.beneficiaryId === "string" &&
    isMoney(record.sendAmount, "USD") &&
    isMoney(record.feeAmount, "USD") &&
    isMoney(record.totalDebit, "USD") &&
    isMoney(record.receiveAmount, "ETB") &&
    typeof record.exchangeRate === "string" &&
    record.fundingMethod === "samra_balance" &&
    ["bank", "wallet"].includes(String(record.deliveryMethod)) &&
    typeof record.estimatedDelivery === "string"
  );
}

export function persistActiveQuote(
  quote: RemittanceQuote,
  storage: KeyValueStorage | null = browserStorage(),
): void {
  writeStorage(storage, ACTIVE_QUOTE_KEY, JSON.stringify(quote));
}

export function readActiveQuote(
  storage: KeyValueStorage | null = browserStorage(),
): RemittanceQuote | null {
  const raw = readStorage(storage, ACTIVE_QUOTE_KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isStoredQuote(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function persistTransferForQuote(
  quoteId: string,
  transferId: string,
  storage: KeyValueStorage | null = browserStorage(),
): void {
  writeStorage(storage, `${TRANSFER_FOR_QUOTE_PREFIX}${quoteId}`, transferId);
  writeStorage(storage, ACTIVE_TRANSFER_KEY, transferId);
}

export function readTransferForQuote(
  quoteId: string,
  storage: KeyValueStorage | null = browserStorage(),
): string | null {
  return readStorage(storage, `${TRANSFER_FOR_QUOTE_PREFIX}${quoteId}`);
}

export function readActiveTransferId(
  storage: KeyValueStorage | null = browserStorage(),
): string {
  return readStorage(storage, ACTIVE_TRANSFER_KEY) ?? "";
}

export function clearActiveRemittanceFlow(
  quoteId?: string,
  storage: KeyValueStorage | null = browserStorage(),
): void {
  removeStorage(storage, ACTIVE_QUOTE_KEY);
  removeStorage(storage, ACTIVE_TRANSFER_KEY);
  if (quoteId) {
    removeStorage(storage, `${TRANSFER_FOR_QUOTE_PREFIX}${quoteId}`);
    removeStorage(storage, `${IDEMPOTENCY_PREFIX}${quoteId}`);
  }
}
