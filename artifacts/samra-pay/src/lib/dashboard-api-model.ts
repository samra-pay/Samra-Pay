import type { AccountSummary, ActivityItem } from "@workspace/samra-client";

import { formatMinorUnits } from "./samra-api-flow";

export function customerInitials(displayName: string): string {
  return displayName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function accountBalancePresentation(account: AccountSummary) {
  return {
    available: `$${formatMinorUnits(account.availableBalance.minorUnits)}`,
    book: `$${formatMinorUnits(account.bookBalance.minorUnits)}`,
  } as const;
}

export function activityAmountPresentation(item: ActivityItem) {
  const symbol = item.amount.currency === "USD" ? "$" : "";
  const sign = item.direction === "credit" ? "+" : "−";
  return `${sign}${symbol}${formatMinorUnits(item.amount.minorUnits)} ${item.amount.currency}`;
}

export function isUnavailableFinancialPreview(page: string | undefined) {
  return (
    page === "cards" ||
    page === "credit" ||
    page === "analytics" ||
    page === "rewards"
  );
}
