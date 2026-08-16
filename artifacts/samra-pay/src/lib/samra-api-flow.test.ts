import { describe, expect, it } from "vitest";

import {
  clearActiveRemittanceFlow,
  formatExchangeRate,
  formatMinorUnits,
  getOrCreateTransferIdempotencyKey,
  isTerminalTransferStatus,
  persistActiveQuote,
  persistTransferForQuote,
  readActiveQuote,
  readActiveTransferId,
  readTransferForQuote,
  sanitizeUsdInput,
  toSyntheticBeneficiary,
  usdInputToMinorUnits,
  type KeyValueStorage,
} from "./samra-api-flow";

function memoryStorage(): KeyValueStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

describe("API remittance money helpers", () => {
  it("sanitizes USD input without doing floating-point money math", () => {
    expect(sanitizeUsdInput("$001,234.567")).toBe("1234.56");
    expect(usdInputToMinorUnits("1234.56")).toBe("123456");
    expect(usdInputToMinorUnits("0.00")).toBeNull();
    expect(usdInputToMinorUnits("1.234")).toBeNull();
  });

  it("formats minor units and decimal exchange rates", () => {
    expect(formatMinorUnits("425000")).toBe("4,250.00");
    expect(formatMinorUnits("180000", 2)).toBe("1,800.00");
    expect(formatExchangeRate("180.0000")).toBe("180");
  });
});

describe("API beneficiary presentation", () => {
  it("preserves the seeded recipient presentation without a hardcoded lookup", () => {
    expect(
      toSyntheticBeneficiary({
        id: "beneficiary_bank_001",
        displayName: "Abebe Bekele",
        city: "Addis Ababa",
        countryCode: "ET",
        deliveryDetails: {
          method: "bank",
          bankId: "cbe",
          institutionName: "Commercial Bank of Ethiopia",
          accountNumberLast4: "6789",
        },
        status: "active",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
    ).toEqual({
      id: "beneficiary_bank_001",
      name: "Abebe Bekele",
      location: "Addis Ababa, ET",
      deliveryMethod: "bank",
      deliveryLabel: "Commercial Bank of Ethiopia",
      deliveryDetail: "Bank account ending 6789",
    });
  });
});

describe("API remittance retry state", () => {
  it("reuses one transfer idempotency key per quote", () => {
    const storage = memoryStorage();
    const first = getOrCreateTransferIdempotencyKey(
      "quote_1",
      storage,
      () => "first-token",
    );
    const retry = getOrCreateTransferIdempotencyKey(
      "quote_1",
      storage,
      () => "different-token",
    );
    const otherQuote = getOrCreateTransferIdempotencyKey(
      "quote_2",
      storage,
      () => "second-token",
    );

    expect(retry).toBe(first);
    expect(otherQuote).not.toBe(first);
  });

  it("restores a server quote and transfer without storing recipient input", () => {
    const storage = memoryStorage();
    const quote = {
      id: "quote_1",
      status: "active",
      expiresAt: "2026-08-15T12:10:00.000Z",
      sourceAccountId: "account_1",
      beneficiaryId: "beneficiary_bank_001",
      sendAmount: { currency: "USD", minorUnits: "10000" },
      feeAmount: { currency: "USD", minorUnits: "300" },
      totalDebit: { currency: "USD", minorUnits: "10300" },
      receiveAmount: { currency: "ETB", minorUnits: "1800000" },
      exchangeRate: "180.0000",
      fundingMethod: "samra_balance",
      deliveryMethod: "bank",
      estimatedDelivery: "Within minutes",
    } as const;

    persistActiveQuote(quote, storage);
    persistTransferForQuote(quote.id, "transfer_1", storage);

    expect(readActiveQuote(storage)).toEqual(quote);
    expect(readTransferForQuote(quote.id, storage)).toBe("transfer_1");
    expect(readActiveTransferId(storage)).toBe("transfer_1");

    clearActiveRemittanceFlow(quote.id, storage);
    expect(readActiveQuote(storage)).toBeNull();
    expect(readActiveTransferId(storage)).toBe("");
  });
});

describe("API remittance terminal states", () => {
  it("does not label in-flight or refund-pending transfers as complete", () => {
    expect(isTerminalTransferStatus("submitted")).toBe(false);
    expect(isTerminalTransferStatus("refund_pending")).toBe(false);
    expect(isTerminalTransferStatus("completed")).toBe(true);
    expect(isTerminalTransferStatus("failed")).toBe(true);
    expect(isTerminalTransferStatus("refunded")).toBe(true);
    expect(isTerminalTransferStatus("cancelled")).toBe(true);
  });
});
