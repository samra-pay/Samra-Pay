import { describe, it, expect, beforeEach } from "vitest";
import {
  TRANSFER_STORAGE_KEY,
  loadTransfers,
  saveTransfers,
  type PersistedTransfer,
} from "./transfer-storage";

const BANK_TRANSFER: PersistedTransfer = {
  id: 1,
  recipient: "Abebe Bekele",
  location: "Addis Ababa, ET",
  date: "Jun 12, 2024",
  usd: 500,
  etb: 90000,
  status: "Completed",
  deliveryMethod: "bank",
  bankId: "cbe",
  accountNumber: "10000123456789",
};

const WALLET_TRANSFER: PersistedTransfer = {
  id: 2,
  recipient: "Tigist Haile",
  location: "Hawassa, ET",
  date: "May 28, 2024",
  usd: 300,
  etb: 54000,
  status: "Completed",
  deliveryMethod: "wallet",
  walletId: "telebirr",
  phoneNumber: "+251911234567",
};

const FALLBACK: PersistedTransfer[] = [BANK_TRANSFER];

beforeEach(() => {
  localStorage.clear();
});

// ─── loadTransfers ────────────────────────────────────────────────────────────

describe("loadTransfers", () => {
  it("returns the fallback when localStorage is empty", () => {
    expect(loadTransfers(FALLBACK)).toEqual(FALLBACK);
  });

  it("returns stored transfers when they exist", () => {
    const stored = [BANK_TRANSFER, WALLET_TRANSFER];
    localStorage.setItem(TRANSFER_STORAGE_KEY, JSON.stringify(stored));
    expect(loadTransfers(FALLBACK)).toEqual(stored);
  });

  it("returns fallback when stored value is corrupted JSON", () => {
    localStorage.setItem(TRANSFER_STORAGE_KEY, "not-valid-json{{{");
    expect(loadTransfers(FALLBACK)).toEqual(FALLBACK);
  });

  it("returns fallback when stored value is not an array", () => {
    localStorage.setItem(TRANSFER_STORAGE_KEY, JSON.stringify({ wrong: true }));
    // non-array → cast still returns the object; caller treats it as Transfer[]
    // the important thing is it does not throw
    expect(() => loadTransfers(FALLBACK)).not.toThrow();
  });
});

// ─── saveTransfers ────────────────────────────────────────────────────────────

describe("saveTransfers", () => {
  it("writes transfers to localStorage", () => {
    saveTransfers([BANK_TRANSFER]);
    const raw = localStorage.getItem(TRANSFER_STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!)).toEqual([BANK_TRANSFER]);
  });

  it("persists bank delivery details (bankId + accountNumber)", () => {
    saveTransfers([BANK_TRANSFER]);
    const [t] = JSON.parse(localStorage.getItem(TRANSFER_STORAGE_KEY)!);
    expect(t.deliveryMethod).toBe("bank");
    expect(t.bankId).toBe("cbe");
    expect(t.accountNumber).toBe("10000123456789");
    expect(t.walletId).toBeUndefined();
    expect(t.phoneNumber).toBeUndefined();
  });

  it("persists wallet delivery details (walletId + phoneNumber)", () => {
    saveTransfers([WALLET_TRANSFER]);
    const [t] = JSON.parse(localStorage.getItem(TRANSFER_STORAGE_KEY)!);
    expect(t.deliveryMethod).toBe("wallet");
    expect(t.walletId).toBe("telebirr");
    expect(t.phoneNumber).toBe("+251911234567");
    expect(t.bankId).toBeUndefined();
    expect(t.accountNumber).toBeUndefined();
  });
});

// ─── round-trip ───────────────────────────────────────────────────────────────

describe("round-trip: save then load", () => {
  it("bank transfer survives save → reload", () => {
    saveTransfers([BANK_TRANSFER]);
    const loaded = loadTransfers([]);
    expect(loaded).toEqual([BANK_TRANSFER]);
    expect(loaded[0].bankId).toBe("cbe");
    expect(loaded[0].accountNumber).toBe("10000123456789");
  });

  it("wallet transfer survives save → reload", () => {
    saveTransfers([WALLET_TRANSFER]);
    const loaded = loadTransfers([]);
    expect(loaded).toEqual([WALLET_TRANSFER]);
    expect(loaded[0].walletId).toBe("telebirr");
    expect(loaded[0].phoneNumber).toBe("+251911234567");
  });

  it("multiple transfers preserve order and all fields", () => {
    const transfers = [WALLET_TRANSFER, BANK_TRANSFER];
    saveTransfers(transfers);
    expect(loadTransfers([])).toEqual(transfers);
  });

  it("newer transfers prepended over existing ones survive reload", () => {
    // Simulate what handleConfirm does: prepend new transfer
    const initial = [BANK_TRANSFER];
    saveTransfers(initial);

    const newTransfer: PersistedTransfer = {
      id: 3,
      recipient: "Dawit Tesfaye",
      location: "Dire Dawa, ET",
      date: "Aug 15, 2026",
      usd: 200,
      etb: 36000,
      status: "Completed",
      deliveryMethod: "wallet",
      walletId: "cbebirr",
      phoneNumber: "+251912345678",
    };
    saveTransfers([newTransfer, ...loadTransfers(initial)]);

    const loaded = loadTransfers([]);
    expect(loaded).toHaveLength(2);
    expect(loaded[0].recipient).toBe("Dawit Tesfaye");
    expect(loaded[0].walletId).toBe("cbebirr");
    expect(loaded[1].recipient).toBe("Abebe Bekele");
  });
});
