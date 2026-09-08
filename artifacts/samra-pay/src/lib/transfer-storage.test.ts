import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  TRANSFER_STORAGE_KEY,
  loadTransfers,
  saveTransfers,
  type PersistedTransfer,
} from "./transfer-storage";

const BANK: PersistedTransfer = {
  id: 1,
  recipient: "Synthetic Recipient A",
  location: "Addis Ababa, ET",
  date: "Sep 8, 2026",
  usd: 500,
  etb: 90000,
  status: "Completed",
  deliveryMethod: "bank",
};
const WALLET: PersistedTransfer = {
  ...BANK,
  id: 2,
  recipient: "Synthetic Recipient B",
  deliveryMethod: "wallet",
};
const LEGACY = [
  {
    ...BANK,
    bankId: "synthetic-bank",
    accountNumber: "synthetic-account-do-not-persist",
    unknownField: { contact: "synthetic-private" },
  },
  {
    ...WALLET,
    walletId: "synthetic-wallet",
    phoneNumber: "synthetic-phone-do-not-persist",
  },
];
const FALLBACK = [BANK];

beforeEach(() => localStorage.clear());
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function stored() {
  return JSON.parse(localStorage.getItem(TRANSFER_STORAGE_KEY)!);
}

describe("transfer history storage boundary", () => {
  it("returns display-only fallback for an empty store", () => {
    expect(loadTransfers(FALLBACK)).toEqual(FALLBACK);
    expect(loadTransfers(LEGACY)).toEqual([BANK, WALLET]);
  });
  it("scrubs legacy identifiers from both returned records and the persisted payload", () => {
    localStorage.setItem(TRANSFER_STORAGE_KEY, JSON.stringify(LEGACY));
    expect(loadTransfers([])).toEqual([BANK, WALLET]);
    expect(stored()).toEqual([BANK, WALLET]);
    expect(loadTransfers([])).toEqual([BANK, WALLET]);
  });
  it("never writes bank or contact fields even when callers pass extra runtime properties", () => {
    saveTransfers(LEGACY);
    expect(stored()).toEqual([BANK, WALLET]);
    for (const field of [
      "accountNumber",
      "phoneNumber",
      "bankId",
      "walletId",
      "unknownField",
    ]) {
      expect(localStorage.getItem(TRANSFER_STORAGE_KEY)).not.toContain(field);
    }
  });
  it.each([
    "not-valid-json{{{",
    JSON.stringify({ accountNumber: "synthetic-private" }),
  ])("removes invalid legacy payload %s", (raw) => {
    localStorage.setItem(TRANSFER_STORAGE_KEY, raw);
    expect(loadTransfers(FALLBACK)).toEqual(FALLBACK);
    expect(localStorage.getItem(TRANSFER_STORAGE_KEY)).toBeNull();
  });
  it("drops malformed rows without allowing nested data through display fields", () => {
    localStorage.setItem(
      TRANSFER_STORAGE_KEY,
      JSON.stringify([
        null,
        1,
        [],
        { ...BANK, recipient: { accountNumber: "synthetic-private" } },
        ...LEGACY,
      ]),
    );
    expect(loadTransfers([])).toEqual([BANK, WALLET]);
    expect(stored()).toEqual([BANK, WALLET]);
  });
  it("removes the previous sensitive payload if a rewrite fails", () => {
    localStorage.setItem(TRANSFER_STORAGE_KEY, JSON.stringify(LEGACY));
    const browserStorage = localStorage;
    const failingSet = vi.fn(() => { throw new DOMException("Quota exceeded", "QuotaExceededError"); });
    vi.stubGlobal("localStorage", {
      getItem: browserStorage.getItem.bind(browserStorage),
      removeItem: browserStorage.removeItem.bind(browserStorage),
      setItem: failingSet,
    });
    expect(loadTransfers([])).toEqual([BANK, WALLET]);
    expect(failingSet).toHaveBeenCalledOnce();
    expect(browserStorage.getItem(TRANSFER_STORAGE_KEY)).toBeNull();
  });
  it("does not leave old details behind when a normal save fails", () => {
    localStorage.setItem(TRANSFER_STORAGE_KEY, JSON.stringify(LEGACY));
    const browserStorage = localStorage;
    const failingSet = vi.fn(() => { throw new Error("storage unavailable"); });
    vi.stubGlobal("localStorage", {
      getItem: browserStorage.getItem.bind(browserStorage),
      removeItem: browserStorage.removeItem.bind(browserStorage),
      setItem: failingSet,
    });
    saveTransfers([BANK]);
    expect(failingSet).toHaveBeenCalledOnce();
    expect(browserStorage.getItem(TRANSFER_STORAGE_KEY)).toBeNull();
  });
  it("remains usable when browser storage access is denied", () => {
    const denied = vi.fn(() => { throw new Error("storage unavailable"); });
    vi.stubGlobal("localStorage", { getItem: denied, removeItem: denied });
    expect(loadTransfers(FALLBACK)).toEqual(FALLBACK);
    expect(denied).toHaveBeenCalledTimes(2);
  });
  it("preserves history order across saves and reloads", () => {
    saveTransfers([BANK]);
    saveTransfers([WALLET, ...loadTransfers([])]);
    expect(loadTransfers([])).toEqual([WALLET, BANK]);
  });
});
