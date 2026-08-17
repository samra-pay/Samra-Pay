import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");

function source(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

describe("mobile API-mode boundary", () => {
  it("selects API and mock dashboard implementations at the route boundary", () => {
    const route = source("app/(tabs)/index.tsx");
    expect(route).toContain("mode === 'api'");
    expect(route).toContain("<ApiDashboard />");
    expect(route).toContain("<MockDashboardScreen />");
  });

  it("keeps client-authored balance and session transfers out of the API dashboard", () => {
    const dashboard = source("components/ApiDashboard.tsx");
    expect(dashboard).toContain("useAccounts");
    expect(dashboard).toContain("useActivity");
    expect(dashboard).toContain("useTransfers");
    expect(dashboard).not.toContain("CHECKING_BALANCE");
    expect(dashboard).not.toContain("TransferContext");
  });

  it("uses server quotes and deterministic idempotent submission in API remittance", () => {
    const remittance = source("components/ApiRemittance.tsx");
    expect(remittance).toContain("useCreateQuote");
    expect(remittance).toContain("useCreateTransfer");
    expect(remittance).toContain("transferIdempotencyKey");
    expect(remittance).not.toContain("PROMO_RATE");
    expect(remittance).not.toContain("CARD_FEE_RATE");
  });

  it("blocks unsupported mock financial previews in API mode", () => {
    for (const route of ["app/(tabs)/cards.tsx", "app/(tabs)/rewards.tsx"]) {
      const contents = source(route);
      expect(contents).toContain("mode === 'api'");
      expect(contents).toContain("ApiModeUnavailable");
    }
  });
});
