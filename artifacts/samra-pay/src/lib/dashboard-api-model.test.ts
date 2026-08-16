import { describe, expect, it } from "vitest";

import {
  accountBalancePresentation,
  activityAmountPresentation,
  customerInitials,
  isUnavailableFinancialPreview,
} from "./dashboard-api-model";

describe("API dashboard presentation", () => {
  it("formats the exact post-transfer ledger balance without recalculating it", () => {
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

  it("uses the backend activity direction only for display", () => {
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

  it("keeps unsupported financial previews out of API mode", () => {
    expect(isUnavailableFinancialPreview("cards")).toBe(true);
    expect(isUnavailableFinancialPreview("rewards")).toBe(true);
    expect(isUnavailableFinancialPreview("settings")).toBe(false);
    expect(customerInitials("Samra Demo Customer")).toBe("SD");
  });
});
