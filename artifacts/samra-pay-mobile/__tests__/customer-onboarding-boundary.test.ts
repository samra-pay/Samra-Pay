import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const loginSource = read("../app/login.tsx");
const onboardingSource = read("../app/onboarding.tsx");
const authSource = read("../context/AuthContext.tsx");
const nativeAuthSource = read("../lib/native-auth0.ts");
const expoConfigSource = read("../app.config.cjs");
const runtimeSource = read("../lib/samra-runtime.tsx");
const layoutSource = read("../app/_layout.tsx");
const legalRouteSource = read("../app/legal/[kind].tsx");
const sharedJourneySource = read("../../../lib/samra-client/src/onboarding.ts");
const sharedReactSource = read("../../../lib/samra-client/src/react.tsx");
const ciWorkflowSource = read("../../../.github/workflows/ci.yml");
const releaseWorkflowSource = read(
  "../../../.github/workflows/release-candidate.yml",
);

describe("mobile customer-onboarding trust boundary", () => {
  it("does not collect local credentials and delegates connected sign-in to Auth0", () => {
    expect(loginSource).not.toMatch(/TextInput|keyboardType|secureTextEntry/);
    expect(loginSource).toContain("Continue securely with Auth0");
    expect(loginSource).toContain("Direct password entry is disabled");
    expect(loginSource).toContain("disabled={loading}");
  });

  it("uses local storage only for the named synthetic session", () => {
    expect(authSource).toContain(
      'const STORAGE_KEY = "samra-pay-demo-session"',
    );
    expect(authSource).toContain('config.mode === "disabled"');
    expect(authSource).toContain("setAuthTokenGetter(");
    expect(authSource).not.toMatch(/accessToken|refreshToken|idToken/);
    expect(nativeAuthSource).not.toMatch(
      /AsyncStorage|localStorage|sessionStorage/,
    );
  });

  it("keeps native Auth0 out of Expo Go and applies it only at native build time", () => {
    expect(nativeAuthSource).toContain('import("react-native-auth0")');
    expect(nativeAuthSource).toContain("credentialsManager.saveCredentials");
    expect(nativeAuthSource).toContain("credentialsManager.getCredentials");
    expect(nativeAuthSource).toContain("useDPoP: false");
    expect(nativeAuthSource).not.toContain("offline_access");
    expect(expoConfigSource).toContain('if (mode === "disabled") return expo');
    expect(expoConfigSource).toContain('"react-native-auth0"');
    expect(expoConfigSource).toContain('"samrapayauth"');
  });

  it("builds API-mode mobile artifacts only with a complete synthetic Auth0 configuration", () => {
    for (const workflow of [ciWorkflowSource, releaseWorkflowSource]) {
      expect(workflow).toContain('EXPO_PUBLIC_SAMRA_ENVIRONMENT: "staging"');
      expect(workflow).toContain('EXPO_PUBLIC_SAMRA_AUTH_MODE: "auth0-native"');
      expect(workflow).toContain(
        'EXPO_PUBLIC_AUTH0_DOMAIN: "auth0.ci.invalid"',
      );
      expect(workflow).toContain(
        'EXPO_PUBLIC_AUTH0_CLIENT_ID: "NativeCiClient_12345678"',
      );
      expect(workflow).toContain(
        'EXPO_PUBLIC_AUTH0_AUDIENCE: "https://api.staging.samrapay.com"',
      );
    }
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
    expect(onboardingSource).not.toContain(
      "SYNTHETIC_WALLET_PROVISIONING_INPUT",
    );
    expect(onboardingSource).toContain("useCustomerWalletDisclosure");
    expect(onboardingSource).toContain("walletProvisioningInputFromDisclosure");
    expect(onboardingSource).toMatch(
      /const WALLET_DISCLOSURE_STATES[\s\S]*?"wallet_control_setup"[\s\S]*?"wallet_ready"[\s\S]*?\]\);/,
    );
    expect(onboardingSource).toMatch(
      /wallet\?\.nextAllowedActions\.includes\(\s*"accept_current_wallet_disclosure"/,
    );
    expect(onboardingSource).toContain("disclosure.presentation.title");
    expect(onboardingSource).toContain("disclosure.presentation.body");
    expect(onboardingSource).toContain(
      "disclosure.presentation.acceptanceLabel",
    );
    expect(onboardingSource).toContain(
      "walletDisclosure.presentation.actionLabel",
    );
    expect(sharedJourneySource).toContain(
      "does not create a blockchain wallet, tokens",
    );
    expect(onboardingSource).toContain(
      'journey.stage === "wallet_control_setup"',
    );
    expect(onboardingSource).toContain('iconName="clock"');
    expect(onboardingSource).toContain("wallet-creation outcome is unknown");
    expect(onboardingSource).toContain("another provider create stays blocked");
    expect(onboardingSource).toContain("Resume synthetic wallet setup");
    expect(onboardingSource).toContain("const walletMutationError");
    expect(onboardingSource).toContain(
      'journey.stage === "wallet_control_setup"',
    );
    expect(onboardingSource).toContain(
      'walletDisclosure?.environment === "synthetic"',
    );
    expect(onboardingSource).not.toContain("No second test-network wallet");
    expect(onboardingSource).not.toContain("Retry non-production wallet setup");
    expect(onboardingSource).not.toContain(
      "This non-production flow creates no account, wallet",
    );
    expect(onboardingSource).toContain(
      "non-production wallet creation is a separate, explicitly disclosed",
    );
    expect(onboardingSource).toContain("!wallet.synthetic");
    expect(onboardingSource).toContain("[journey.stage, walletDisclosure]");
    expect(sharedReactSource).toContain(
      "setQueryData(samraQueryKeys.walletDisclosure, null)",
    );
    expect(sharedReactSource).toContain("async onSettled()");
    expect(sharedReactSource).toContain(
      "queryClient.invalidateQueries({ queryKey: samraQueryKeys.wallet })",
    );
    expect(onboardingSource).toContain("wallet.synthetic");
    expect(onboardingSource).toContain("Non-production wallet");
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
