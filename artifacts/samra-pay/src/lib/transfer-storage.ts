/**
 * Persistent storage for demo transfer history.
 * Transfers are saved to localStorage so saved recipients (and their
 * delivery details) survive page refresh.
 */

export const TRANSFER_STORAGE_KEY = "samra_transfers";

export interface PersistedTransfer {
  id: number;
  recipient: string;
  location: string;
  date: string;
  usd: number;
  etb: number;
  status: string;
  // delivery details — persisted so the form can be pre-filled on re-use
  deliveryMethod?: "bank" | "wallet";
  bankId?: string;
  accountNumber?: string;
  walletId?: string;
  phoneNumber?: string;
}

export function loadTransfers(fallback: PersistedTransfer[]): PersistedTransfer[] {
  try {
    const raw = localStorage.getItem(TRANSFER_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as PersistedTransfer[];
    }
  } catch {
    // ignore parse / quota errors
  }
  return fallback;
}

export function saveTransfers(transfers: PersistedTransfer[]): void {
  try {
    localStorage.setItem(TRANSFER_STORAGE_KEY, JSON.stringify(transfers));
  } catch {
    // ignore quota errors
  }
}
