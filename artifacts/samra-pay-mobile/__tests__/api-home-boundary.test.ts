import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const componentSource = readFileSync(
  fileURLToPath(new URL("../components/ApiHomeScreen.tsx", import.meta.url)),
  "utf8",
);
const cardsSource = readFileSync(
  fileURLToPath(new URL("../app/(tabs)/cards.tsx", import.meta.url)),
  "utf8",
);
const rewardsSource = readFileSync(
  fileURLToPath(new URL("../app/(tabs)/rewards.tsx", import.meta.url)),
  "utf8",
);

describe("mobile API home trust boundary", () => {
  it("does not import or merge legacy financial demo state", () => {
    expect(componentSource).not.toMatch(/mock-data/);
    expect(componentSource).not.toMatch(/TransferContext|sessionTransfers/);
    expect(componentSource).not.toMatch(/RECENT_TRANSACTIONS|SPENDING_DATA/);
  });

  it("renders explicit backend failure and synthetic-data copy", () => {
    expect(componentSource).toContain("Could not reach Samra Pay");
    expect(componentSource).toContain("API MODE · SYNTHETIC DATA");
    expect(componentSource).toMatch(
      /No mock financial data is shown in API\s+mode/,
    );
  });

  it("blocks unsupported card and rewards mock balances in API mode", () => {
    expect(cardsSource).toContain("dataMode === 'api'");
    expect(cardsSource).toContain("ApiUnavailableScreen");
    expect(rewardsSource).toContain("dataMode === 'api'");
    expect(rewardsSource).toContain("ApiUnavailableScreen");
  });
});
