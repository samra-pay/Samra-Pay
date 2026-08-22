import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const loginSource = read("../app/login.tsx");
const onboardingSource = read("../app/onboarding.tsx");
const authSource = read("../context/AuthContext.tsx");
const runtimeSource = read("../lib/samra-runtime.tsx");
const layoutSource = read("../app/_layout.tsx");
const legalRouteSource = read("../app/legal/[kind].tsx");
const sharedJourneySource = read("../../../lib/samra-client/src/onboarding.ts");

describe("mobile customer-onboarding trust boundary", () => {
  it("does not collect local credentials and keeps API sign-in disabled", () => {
    expect(loginSource).not.toMatch(/TextInput|keyboardType|secureTextEntry/);
    expect(loginSource).toContain('if (mode !== "mock")');
    expect(loginSource).toContain('disabled={loading || mode !== "mock"}');
    expect(loginSource).toContain("Auth0 sign-in not configured");
  });

  it("uses local storage only for the named synthetic session", () => {
    expect(authSource).toContain(
      'const STORAGE_KEY = "samra-pay-demo-session"',
    );
    expect(authSource).toContain('if (mode !== "mock")');
    expect(authSource).toContain('if (mode === "mock")');
    expect(authSource).not.toMatch(/accessToken|refreshToken|idToken/);
  });

  it("shares normalized onboarding truth and exposes fake controls only in mock mode", () => {
    expect(runtimeSource).toContain("new GeneratedSamraOnboardingSource()");
    expect(runtimeSource).toContain("new SyntheticSamraOnboardingSource()");
    expect(runtimeSource).toContain(
      'demoControls={config.dataMode === "mock" ? onboardingSource : null}',
    );
    expect(onboardingSource).not.toMatch(
      /AsyncStorage|localStorage|sessionStorage/,
    );
    expect(sharedJourneySource).toContain("Nothing is preselected");
    expect(onboardingSource).toContain(
      "I understand this is a synthetic wallet",
    );
    expect(onboardingSource).toContain("SYNTHETIC_WALLET_PROVISIONING_INPUT");
    expect(onboardingSource).toContain("no tokens");
  });

  it("registers onboarding as a protected application route", () => {
    expect(layoutSource).toContain('<Stack.Screen name="onboarding"');
    expect(layoutSource).toContain('<Stack.Screen name="legal/[kind]"');
    expect(layoutSource).toContain("isSignedIn");
  });

  it("lets customers review every legal choice without toggling consent", () => {
    expect(onboardingSource).toContain("presentation.href");
    expect(onboardingSource).toContain('accessibilityRole="link"');
    expect(onboardingSource).toContain("`/legal/${legalKind}` as Href");
    expect(legalRouteSource).toContain("getSamraLegalDocument");
    expect(legalRouteSource).toContain('accessibilityRole="header"');
  });

  it("fails closed on query errors and does not expose a blocked API dashboard", () => {
    expect(onboardingSource).toContain("MobileOnboardingFailure");
    expect(onboardingSource).toContain("identityQuery.refetch()");
    expect(onboardingSource).toContain("walletQuery.refetch()");
    expect(onboardingSource).toContain('runtime.mode === "mock"');
    expect(onboardingSource).toContain("Continue to synthetic dashboard");
    expect(onboardingSource).toContain(
      "AccessibilityInfo.announceForAccessibility",
    );
  });
});

function read(relativePath: string): string {
  return readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    "utf8",
  );
}
