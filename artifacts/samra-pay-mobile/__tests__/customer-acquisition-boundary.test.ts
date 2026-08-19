import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const layoutSource = read("../app/_layout.tsx");
const onboardingSource = read("../app/onboarding.tsx");
const remittanceSource = read("../components/ApiRemittanceScreen.tsx");
const runtimeSource = read("../lib/samra-runtime.tsx");
const sessionSource = read("../lib/acquisition-session.ts");

describe("mobile customer-acquisition trust boundary", () => {
  it("enables capture only in API mode", () => {
    expect(runtimeSource).toContain('config.dataMode === "api"');
    expect(runtimeSource).toContain("new CustomerAcquisitionTracker");
    expect(runtimeSource).toContain("DISABLED_CUSTOMER_ACQUISITION_CLIENT");
    expect(runtimeSource).toContain("createMobileAcquisitionSessionStore()");
  });

  it("persists only a validated opaque acquisition reference", () => {
    expect(sessionSource).toContain("/^acq_[0-9a-f]{32}$/");
    expect(sessionSource).toContain("storage.setItem");
    expect(sessionSource).not.toMatch(/email|phone|name|token|customerId/);
  });

  it("records app, signup, bind, and successful server-quote boundaries", () => {
    expect(layoutSource).toContain('recordOnce("app_open")');
    expect(onboardingSource).toContain('recordOnce("signup_started")');
    expect(onboardingSource).toContain("void acquisition.bind()");
    expect(remittanceSource).toContain('recordOnce("quote_started")');
    expect(remittanceSource).toContain('recordOnce("quote_completed")');
    expect(
      remittanceSource.indexOf('recordOnce("quote_completed")'),
    ).toBeGreaterThan(remittanceSource.indexOf("quoteMutation.mutateAsync"));
    expect(onboardingSource).not.toContain("await acquisition.bind()");
  });
});

function read(relativePath: string): string {
  return readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    "utf8",
  );
}
