import { describe, expect, it } from "vitest";

import {
  accountBalancePresentation,
  activityAmountPresentation,
  beneficiaryDestination,
  isTerminalTransferStatus,
  sanitizeUsdInput,
  transferIdempotencyKey,
  usdInputToMinorUnits,
} from "./mobile-api-model";

describe("mobile API presentation", () => {
  it("renders the exact ledger-derived post-transfer balance", () => {
    expect(
      accountBalancePresentation({
        id: "account_1",
        kind: "domestic",
        displayName: "Samra USD",
        last4: "4242",
        currency: "USD",
        bookBalance: { currency: "USD", minorUnits: "414700" },
        availableBalance: { currency: "USD", minorUnits: "414700" },
        status: "active",
      }),
    ).toEqual({ available: "$4,147.00", book: "$4,147.00" });
  });

  it("uses backend direction and amount without floating-point arithmetic", () => {
    expect(
      activityAmountPresentation({
        id: "activity_1",
        accountId: "account_1",
        sourceType: "remittance",
        sourceId: "transfer_1",
        occurredAt: "2026-01-01T00:00:00.000Z",
        title: "Synthetic remittance",
        category: "remittance",
        direction: "debit",
        amount: { currency: "USD", minorUnits: "10300" },
        status: "completed",
      }),
    ).toBe("−$103.00 USD");
  });

  it("sanitizes USD input and converts it to exact minor units", () => {
    expect(sanitizeUsdInput("$001,234.567")).toBe("1234.56");
    expect(usdInputToMinorUnits("1234.56")).toBe("123456");
    expect(usdInputToMinorUnits("0.00")).toBeNull();
  });

  it("uses one deterministic retry key per server quote", () => {
    expect(transferIdempotencyKey("quote_1")).toBe("mobile-transfer-quote_1");
    expect(transferIdempotencyKey("quote_1")).toBe(
      transferIdempotencyKey("quote_1"),
    );
    expect(transferIdempotencyKey("quote_2")).not.toBe(
      transferIdempotencyKey("quote_1"),
    );
  });

  it("presents backend beneficiary details without a hardcoded lookup", () => {
    expect(
      beneficiaryDestination({
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
    ).toBe("Commercial Bank of Ethiopia •••• 6789");
  });

  it("does not treat in-flight or refund-pending work as terminal", () => {
    expect(isTerminalTransferStatus("submitted")).toBe(false);
    expect(isTerminalTransferStatus("refund_pending")).toBe(false);
    expect(isTerminalTransferStatus("completed")).toBe(true);
    expect(isTerminalTransferStatus("refunded")).toBe(true);
  });
});
