import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const loginSource = read("../app/login.tsx");
const onboardingSource = read("../app/onboarding.tsx");
const authSource = read("../context/AuthContext.tsx");
const runtimeSource = read("../lib/samra-runtime.tsx");
const layoutSource = read("../app/_layout.tsx");
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
    expect(onboardingSource).toContain("Wallet provisioning remains disabled");
  });

  it("registers onboarding as a protected application route", () => {
    expect(layoutSource).toContain('<Stack.Screen name="onboarding"');
    expect(layoutSource).toContain("isSignedIn");
  });
});

function read(relativePath: string): string {
  return readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    "utf8",
  );
}
