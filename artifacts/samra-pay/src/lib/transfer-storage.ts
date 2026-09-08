/** Demo history only. Delivery identifiers stay in the current page session. */
export const TRANSFER_STORAGE_KEY = "samra_transfers";

export interface PersistedTransfer {
  id: number;
  recipient: string;
  location: string;
  date: string;
  usd: number;
  etb: number;
  status: string;
  deliveryMethod?: "bank" | "wallet";
}

function sanitizeTransfers(values: unknown[]): PersistedTransfer[] {
  return values.flatMap((value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const entry = value as Record<string, unknown>;
    if (
      typeof entry.id !== "number" ||
      !Number.isFinite(entry.id) ||
      typeof entry.recipient !== "string" ||
      typeof entry.location !== "string" ||
      typeof entry.date !== "string" ||
      typeof entry.status !== "string" ||
      typeof entry.usd !== "number" ||
      !Number.isFinite(entry.usd) ||
      typeof entry.etb !== "number" ||
      !Number.isFinite(entry.etb)
    )
      return [];
    // Explicit allowlist applies to both legacy reads and all runtime writes.
    return [
      {
        id: entry.id,
        recipient: entry.recipient,
        location: entry.location,
        date: entry.date,
        usd: entry.usd,
        etb: entry.etb,
        status: entry.status,
        ...(entry.deliveryMethod === "bank" || entry.deliveryMethod === "wallet"
          ? { deliveryMethod: entry.deliveryMethod }
          : {}),
      },
    ];
  });
}

function removeStoredTransfers(): void {
  try {
    localStorage.removeItem(TRANSFER_STORAGE_KEY);
  } catch {
    // Browser storage may be unavailable; no details are returned or logged.
  }
}

export function loadTransfers(
  fallback: PersistedTransfer[],
): PersistedTransfer[] {
  try {
    const raw = localStorage.getItem(TRANSFER_STORAGE_KEY);
    if (raw !== null) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const sanitized = sanitizeTransfers(parsed);
        // Rewrite the browser payload, not just the returned objects. If a
        // quota error prevents replacement, saveTransfers removes the old data.
        saveTransfers(sanitized);
        return sanitized;
      }
      removeStoredTransfers();
    }
  } catch {
    removeStoredTransfers();
  }
  return sanitizeTransfers(fallback);
}

export function saveTransfers(transfers: PersistedTransfer[]): void {
  try {
    localStorage.setItem(
      TRANSFER_STORAGE_KEY,
      JSON.stringify(sanitizeTransfers(transfers)),
    );
  } catch {
    removeStoredTransfers();
  }
}
