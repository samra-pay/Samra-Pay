import AsyncStorage from "@react-native-async-storage/async-storage";
import type {
  RemittanceQuote,
  Transfer,
  TransferStatus,
} from "@workspace/samra-client";

export interface AsyncKeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export type MobileRemittanceSession = Readonly<{
  version: 1;
  quote: RemittanceQuote;
  transferId?: string;
  transferIdempotencyKey?: string;
  cancelIdempotencyKey?: string;
}>;

const SESSION_KEY = "samra.mobile.remittance.session.v1";

function isNonEmptyIdentifier(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128;
}

function isMoney(value: unknown, currency: "USD" | "ETB"): boolean {
  if (!value || typeof value !== "object") return false;
  const money = value as Record<string, unknown>;
  return (
    money.currency === currency &&
    typeof money.minorUnits === "string" &&
    /^\d+$/.test(money.minorUnits)
  );
}

function isQuote(value: unknown): value is RemittanceQuote {
  if (!value || typeof value !== "object") return false;
  const quote = value as Record<string, unknown>;
  return (
    typeof quote.id === "string" &&
    ["active", "expired", "consumed"].includes(String(quote.status)) &&
    typeof quote.expiresAt === "string" &&
    typeof quote.sourceAccountId === "string" &&
    typeof quote.beneficiaryId === "string" &&
    isMoney(quote.sendAmount, "USD") &&
    isMoney(quote.feeAmount, "USD") &&
    isMoney(quote.totalDebit, "USD") &&
    isMoney(quote.receiveAmount, "ETB") &&
    typeof quote.exchangeRate === "string" &&
    quote.fundingMethod === "samra_balance" &&
    ["bank", "wallet"].includes(String(quote.deliveryMethod)) &&
    typeof quote.estimatedDelivery === "string"
  );
}

function isSession(value: unknown): value is MobileRemittanceSession {
  if (!value || typeof value !== "object") return false;
  const session = value as Record<string, unknown>;
  return (
    session.version === 1 &&
    isQuote(session.quote) &&
    (session.transferId === undefined ||
      isNonEmptyIdentifier(session.transferId)) &&
    (session.transferIdempotencyKey === undefined ||
      isNonEmptyIdentifier(session.transferIdempotencyKey)) &&
    (session.cancelIdempotencyKey === undefined ||
      isNonEmptyIdentifier(session.cancelIdempotencyKey))
  );
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

export async function loadRemittanceSession(
  storage: AsyncKeyValueStorage = AsyncStorage,
): Promise<MobileRemittanceSession | null> {
  const raw = await storage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isSession(parsed)) return parsed;
  } catch {
    // Invalid local recovery data must not survive another app launch.
  }
  await storage.removeItem(SESSION_KEY);
  return null;
}

async function saveSession(
  session: MobileRemittanceSession,
  storage: AsyncKeyValueStorage,
): Promise<void> {
  await storage.setItem(SESSION_KEY, JSON.stringify(session));
}

export async function persistActiveQuote(
  quote: RemittanceQuote,
  storage: AsyncKeyValueStorage = AsyncStorage,
): Promise<void> {
  await saveSession({ version: 1, quote }, storage);
}

export async function prepareTransferSubmission(
  quote: RemittanceQuote,
  storage: AsyncKeyValueStorage = AsyncStorage,
  tokenFactory: () => string = randomToken,
): Promise<string> {
  const existing = await loadRemittanceSession(storage);
  if (existing?.quote.id === quote.id && existing.transferIdempotencyKey) {
    return existing.transferIdempotencyKey;
  }
  const transferIdempotencyKey = `mobile-transfer-${tokenFactory()}`.slice(
    0,
    128,
  );
  await saveSession({ version: 1, quote, transferIdempotencyKey }, storage);
  return transferIdempotencyKey;
}

export async function persistCreatedTransfer(
  quote: RemittanceQuote,
  transferId: string,
  storage: AsyncKeyValueStorage = AsyncStorage,
): Promise<void> {
  const existing = await loadRemittanceSession(storage);
  await saveSession(
    {
      version: 1,
      quote,
      transferId,
      transferIdempotencyKey:
        existing?.quote.id === quote.id
          ? existing.transferIdempotencyKey
          : undefined,
    },
    storage,
  );
}

export type RecoveryTransferCreator = (
  input: Readonly<{ quoteId: string }>,
  idempotencyKey: string,
) => Promise<Transfer>;

/**
 * Closes the crash window after an idempotency key is durable but before the
 * created transfer id is durable. The backend command is replayed with the
 * exact same key, so recovery can only return the original transfer or create
 * it once. Local storage remains a recovery locator, never financial truth.
 */
export async function resumePreparedTransfer(
  session: MobileRemittanceSession,
  createTransfer: RecoveryTransferCreator,
  storage: AsyncKeyValueStorage = AsyncStorage,
): Promise<Transfer | null> {
  if (session.transferId || !session.transferIdempotencyKey) return null;

  const transfer = await createTransfer(
    { quoteId: session.quote.id },
    session.transferIdempotencyKey,
  );
  await persistCreatedTransfer(session.quote, transfer.id, storage);
  return transfer;
}

export const CANCELLABLE_TRANSFER_STATUSES = new Set<TransferStatus>([
  "created",
  "funds_reserved",
  "submitted",
]);

export type RecoveryCancellationCreator = (
  transferId: string,
  idempotencyKey: string,
) => Promise<Transfer>;

/** Replays a user-authorized cancellation that was interrupted by app exit. */
export async function resumePreparedCancellation(
  session: MobileRemittanceSession,
  transferStatus: TransferStatus,
  cancelTransfer: RecoveryCancellationCreator,
): Promise<Transfer | null> {
  if (
    !session.transferId ||
    !session.cancelIdempotencyKey ||
    !CANCELLABLE_TRANSFER_STATUSES.has(transferStatus)
  ) {
    return null;
  }
  return cancelTransfer(session.transferId, session.cancelIdempotencyKey);
}

export async function prepareCancelSubmission(
  session: MobileRemittanceSession,
  storage: AsyncKeyValueStorage = AsyncStorage,
  tokenFactory: () => string = randomToken,
): Promise<string> {
  if (session.cancelIdempotencyKey) return session.cancelIdempotencyKey;
  const cancelIdempotencyKey = `mobile-cancel-${tokenFactory()}`.slice(0, 128);
  await saveSession({ ...session, cancelIdempotencyKey }, storage);
  return cancelIdempotencyKey;
}

export async function clearRemittanceSession(
  storage: AsyncKeyValueStorage = AsyncStorage,
): Promise<void> {
  await storage.removeItem(SESSION_KEY);
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
  const amount = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  return amount > 0n ? amount.toString() : null;
}

export function formatMinorUnits(minorUnits: string): string {
  const padded = minorUnits.padStart(3, "0");
  const whole = padded.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${whole}.${padded.slice(-2)}`;
}
