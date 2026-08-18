import type { AccountSummary, ActivityItem } from "@workspace/samra-client";

import { formatMinorUnits } from "@/lib/remittance-session";

export function selectPrimaryUsdAccount(
  accounts: readonly AccountSummary[],
): AccountSummary | null {
  return (
    accounts.find(
      (account) =>
        account.kind === "domestic" &&
        account.currency === "USD" &&
        account.status === "active",
    ) ?? null
  );
}

export function accountBalancePresentation(account: AccountSummary) {
  return {
    available: `$${formatMinorUnits(account.availableBalance.minorUnits)}`,
    book: `$${formatMinorUnits(account.bookBalance.minorUnits)}`,
  } as const;
}

export function activityAmountPresentation(item: ActivityItem): string {
  const sign = item.direction === "credit" ? "+" : "−";
  const symbol = item.amount.currency === "USD" ? "$" : "";
  const suffix =
    item.amount.currency === "USD" ? "" : ` ${item.amount.currency}`;
  return `${sign}${symbol}${formatMinorUnits(item.amount.minorUnits)}${suffix}`;
}

export function activityMetadataPresentation(item: ActivityItem): string {
  const occurredAt = new Date(item.occurredAt);
  const date = Number.isNaN(occurredAt.getTime())
    ? "Unknown date"
    : occurredAt.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
  const category = item.category[0].toUpperCase() + item.category.slice(1);
  const status = item.status[0].toUpperCase() + item.status.slice(1);
  return `${date} · ${category} · ${status}`;
}

export function firstNameFromDisplayName(displayName: string): string {
  return displayName.trim().split(/\s+/).filter(Boolean)[0] ?? "there";
}
