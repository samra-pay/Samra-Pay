import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const loginSource = read("../pages/login.tsx");
const onboardingSource = read("../pages/onboarding.tsx");
const runtimeSource = read("./samra-runtime.tsx");
const authSource = read("./customer-auth.tsx");
const appSource = read("../App.tsx");
const dashboardLayoutSource = read("../components/dashboard-layout.tsx");
const legalPageSource = read("../pages/legal.tsx");
const sharedJourneySource = read(
  "../../../../lib/samra-client/src/onboarding.ts",
);

describe("web customer-onboarding trust boundary", () => {
  it("does not collect a local email or password and delegates API sign-in to Auth0", () => {
    expect(loginSource).not.toMatch(/<input|type=["']password["']/);
    expect(loginSource).toContain("await auth.signIn()");
    expect(loginSource).toContain("Continue with Auth0");
    expect(loginSource).not.toMatch(/localStorage|sessionStorage|indexedDB/);
    expect(authSource).toContain("createAuth0Client");
    expect(authSource).toContain('cacheLocation: "memory"');
    expect(authSource).toContain("createAccessTokenGetter");
    expect(authSource).toContain("setAuthTokenGetter(");
    expect(authSource).toContain("handleRedirectCallback");
    expect(authSource).toContain("useRefreshTokens: false");
    expect(authSource).toContain('scope: "openid"');
    expect(authSource).not.toMatch(/localStorage|sessionStorage|indexedDB/);
    expect(appSource).toContain("<CustomerAuthProvider>");
    expect(appSource).toContain("<CustomerAuthGuard>");
    expect(dashboardLayoutSource).toContain("customerAuth.signOut()");
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
    expect(onboardingSource).toContain(
      "I understand this is a synthetic wallet",
    );
    expect(onboardingSource).toContain("SYNTHETIC_WALLET_PROVISIONING_INPUT");
    expect(onboardingSource).toContain("no tokens");
    expect(appSource).toContain('path="/electronic-communications"');
    expect(legalPageSource).toContain("getSamraLegalDocument");
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

  it("keeps wallet readiness out of API financial routes and recovers all onboarding queries", () => {
    expect(onboardingSource).toContain('runtime.mode === "mock"');
    expect(onboardingSource).toContain("Continue to synthetic dashboard");
    expect(onboardingSource).not.toContain(' : "/dashboard"');
    expect(onboardingSource).toContain("identityQuery.refetch()");
    expect(onboardingSource).toContain("walletQuery.refetch()");
    expect(onboardingSource).toContain("Financial access");
    expect(onboardingSource).toContain('role="alert"');
    expect(onboardingSource).toContain("motion-reduce:animate-none");
  });

  it("uses link semantics without nesting a button inside an anchor", () => {
    expect(onboardingSource).toContain("<Button asChild");
    expect(onboardingSource).not.toMatch(/<Link[^>]*>[\s\S]{0,120}<Button/);
  });
});

function read(relativePath: string): string {
  return readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    "utf8",
  );
}
