import { describe, expect, it } from "vitest";

import type { AccountSummary, ActivityItem } from "@workspace/samra-client";

import {
  accountBalancePresentation,
  activityAmountPresentation,
  activityMetadataPresentation,
  firstNameFromDisplayName,
  selectPrimaryUsdAccount,
} from "./home-api-model";

const account: AccountSummary = {
  id: "account_1",
  kind: "domestic",
  displayName: "Samra USD",
  last4: "4242",
  currency: "USD",
  bookBalance: { currency: "USD", minorUnits: "414700" },
  availableBalance: { currency: "USD", minorUnits: "404400" },
  status: "active",
};

const activity: ActivityItem = {
  id: "activity_1",
  accountId: "account_1",
  sourceType: "remittance",
  sourceId: "transfer_1",
  occurredAt: "2026-08-18T12:00:00.000Z",
  title: "Remittance to Abebe Bekele",
  category: "remittance",
  direction: "debit",
  amount: { currency: "USD", minorUnits: "10300" },
  status: "completed",
};

describe("mobile API home presentation", () => {
  it("selects only an active domestic USD account", () => {
    expect(
      selectPrimaryUsdAccount([
        { ...account, id: "closed", status: "closed" },
        account,
      ]),
    ).toBe(account);
    expect(
      selectPrimaryUsdAccount([{ ...account, status: "restricted" }]),
    ).toBeNull();
  });

  it("presents backend book and available balances without recomputing them", () => {
    expect(accountBalancePresentation(account)).toEqual({
      available: "$4,044.00",
      book: "$4,147.00",
    });
  });

  it("uses backend direction and status for activity display", () => {
    expect(activityAmountPresentation(activity)).toBe("−$103.00");
    expect(
      activityAmountPresentation({ ...activity, direction: "credit" }),
    ).toBe("+$103.00");
    expect(activityMetadataPresentation(activity)).toMatch(
      /^Aug 18, 2026 · Remittance · Completed$/,
    );
  });

  it("derives the greeting from the API customer without a mock profile", () => {
    expect(firstNameFromDisplayName("  Samra Demo Customer ")).toBe("Samra");
    expect(firstNameFromDisplayName("   ")).toBe("there");
  });
});
