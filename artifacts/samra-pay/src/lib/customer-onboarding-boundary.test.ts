import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const loginSource = read("../pages/login.tsx");
const onboardingSource = read("../pages/onboarding.tsx");
const runtimeSource = read("./samra-runtime.tsx");
const appSource = read("../App.tsx");
const sharedJourneySource = read(
  "../../../../lib/samra-client/src/onboarding.ts",
);

describe("web customer-onboarding trust boundary", () => {
  it("does not collect a local email or password and fails closed in API mode", () => {
    expect(loginSource).not.toMatch(/<input|type=["']password["']/);
    expect(loginSource).toContain('if (mode === "api") return');
    expect(loginSource).toContain("Auth0 sign-in not configured");
  });

  it("selects the API and synthetic onboarding sources explicitly", () => {
    expect(runtimeSource).toContain('mode === "api"');
    expect(runtimeSource).toContain("new GeneratedSamraOnboardingSource()");
    expect(runtimeSource).toContain("new SyntheticSamraOnboardingSource()");
    expect(runtimeSource).toContain(
      'onboardingDemoControls: mode === "mock" ? onboardingSource : null',
    );
  });

  it("starts every legal choice unselected and never persists onboarding truth locally", () => {
    expect(onboardingSource).toContain(
      "Partial<Record<CustomerConsentType, boolean>>",
    );
    expect(onboardingSource).toContain(
      "accepted[document.consentType] === true",
    );
    expect(onboardingSource).toContain("presentation.href");
    expect(sharedJourneySource).toContain("Nothing is preselected");
    expect(onboardingSource).not.toMatch(
      /localStorage|sessionStorage|indexedDB/,
    );
    expect(onboardingSource).toContain("Wallet provisioning remains disabled");
  });

  it("loads the isolated onboarding route lazily", () => {
    expect(appSource).toContain('lazy(() => import("@/pages/onboarding"))');
    expect(appSource).toContain('<Route path="/onboarding">');
    expect(appSource).toContain("<Suspense");
    expect(appSource).toContain("<RoutedErrorBoundary>");
  });

  it("preserves a public remittance quote through synthetic onboarding", () => {
    expect(onboardingSource).toContain("consumePostLoginRedirect()");
  });
});

function read(relativePath: string): string {
  return readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    "utf8",
  );
}
