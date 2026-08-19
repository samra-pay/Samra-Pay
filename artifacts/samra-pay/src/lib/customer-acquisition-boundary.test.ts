import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const appSource = read("../App.tsx");
const onboardingSource = read("../pages/onboarding.tsx");
const remittanceSource = read("../pages/dashboard/remittance-api.tsx");
const runtimeSource = read("./samra-runtime.tsx");
const sharedTrackerSource = read(
  "../../../../lib/samra-client/src/acquisition.ts",
);

describe("web customer-acquisition trust boundary", () => {
  it("enables capture only in API mode and uses an HttpOnly server session", () => {
    expect(runtimeSource).toContain('mode === "api"');
    expect(runtimeSource).toContain("new CustomerAcquisitionTracker");
    expect(runtimeSource).toContain("allowCookieSession: true");
    expect(runtimeSource).toContain("DISABLED_CUSTOMER_ACQUISITION_CLIENT");
    expect(runtimeSource).not.toMatch(/localStorage|sessionStorage|indexedDB/);
  });

  it("records only the owned landing, signup, and server-quote boundaries", () => {
    expect(appSource).toContain('recordOnce("landing_view")');
    expect(onboardingSource).toContain('recordOnce("signup_started")');
    expect(onboardingSource).toContain("void acquisition.bind()");
    expect(remittanceSource).toContain('recordOnce("quote_started")');
    expect(remittanceSource).toContain('recordOnce("quote_completed")');
    expect(
      remittanceSource.indexOf('recordOnce("quote_completed")'),
    ).toBeGreaterThan(remittanceSource.indexOf("quoteMutation.mutateAsync"));
  });

  it("sanitizes attribution and keeps telemetry fail-open", () => {
    expect(sharedTrackerSource).toContain("SOURCE_ALIASES");
    expect(sharedTrackerSource).toContain("allowedCampaigns");
    expect(sharedTrackerSource).not.toMatch(/utm_content|utm_term/);
    expect(sharedTrackerSource).not.toContain('params.get("email")');
    expect(sharedTrackerSource).not.toContain('params.get("phone")');
    expect(sharedTrackerSource).toContain(
      'return Object.freeze({ status: "failed"',
    );
    expect(onboardingSource).not.toContain("await acquisition.bind()");
  });
});

function read(relativePath: string): string {
  return readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    "utf8",
  );
}
