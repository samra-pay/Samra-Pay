import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SamraOnboardingSourceProvider } from "@workspace/samra-client/react";
import type {
  CustomerOnboardingSnapshot,
  SamraOnboardingSource,
} from "@workspace/samra-client/onboarding";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { PublicLanguageProvider } from "@/lib/public-i18n";
import CustomerAccountPage from "./account";
import CustomerSession from "./customer-session";

const { signOut } = vi.hoisted(() => ({ signOut: vi.fn() }));
vi.mock("@/lib/customer-auth", () => ({
  useCustomerAuth: () => ({ signOut }),
}));

const saved: CustomerOnboardingSnapshot = {
  onboardingId: "onboarding-test",
  customerId: "11111111-1111-4111-8111-12345678abcd",
  state: "identity_review",
  latestCompletedStep: "consents",
  reasonFamily: null,
  version: 3,
  enteredAt: "2026-09-07T00:00:00Z",
  createdAt: "2026-09-07T00:00:00Z",
  updatedAt: "2026-09-07T00:00:00Z",
  consentBundle: {
    bundleVersion: "test",
    locale: "en-US",
    legalEffect: "non_production",
    documents: [],
  },
  nextAllowedActions: [],
};
let root: Root;
let host: HTMLDivElement;
let client: QueryClient;
const getOnboarding = vi.fn();
const forbidden = vi.fn(() => {
  throw new Error("Unexpected provider or mutation call");
});
let source: SamraOnboardingSource;

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}
async function render(page = CustomerAccountPage) {
  await act(async () => {
    root.render(
      createElement(
        QueryClientProvider,
        { client },
        createElement(
          SamraOnboardingSourceProvider,
          { mode: "api", source },
          createElement(PublicLanguageProvider, null, createElement(page)),
        ),
      ),
    );
  });
  await settle();
}
function button(label: string) {
  const match = Array.from(host.querySelectorAll("button")).find(
    (item) => item.textContent === label,
  );
  if (!match) throw new Error("Missing button: " + label);
  return match;
}
async function click(label: string) {
  await act(async () => button(label).click());
  await settle();
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  signOut.mockResolvedValue(undefined);
  getOnboarding.mockResolvedValue(saved);
  source = {
    getOnboarding,
    getWallet: forbidden,
    getIdentityCase: forbidden,
    startOnboarding: forbidden,
    submitConsentBundle: forbidden,
    startIdentityVerification: forbidden,
    startWalletProvisioning: forbidden,
  };
  client = new QueryClient();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  window.history.replaceState({}, "", "/account");
});
afterEach(async () => {
  expect(forbidden).not.toHaveBeenCalled();
  await act(async () => root.unmount());
  client.clear();
  host.remove();
  vi.unstubAllGlobals();
});

describe("private web account access", () => {
  it("shows the saved caller account before KYC and ignores URL identity claims", async () => {
    window.history.replaceState(
      {},
      "",
      "/account?customerId=untrusted&wallet=foreign",
    );
    await render();
    expect(getOnboarding).toHaveBeenCalledWith();
    expect(host.textContent).toContain("Account saved");
    expect(host.textContent).toContain("5678abcd");
    expect(host.textContent).not.toContain(saved.customerId);
    expect(host.textContent).not.toMatch(
      /untrusted|foreign|0\.00|KYC approved/,
    );
    expect(host.querySelector('a[href="/wallet"]')).toBeNull();
    expect(host.querySelector('a[href="/onboarding"]')).not.toBeNull();
    expect(host.textContent).toContain("No live financial access");
  });

  it("resumes the same account on a new page entry without another creation command", async () => {
    await render();
    await act(async () => root.unmount());
    client.clear();
    root = createRoot(host);
    await render();
    expect(getOnboarding).toHaveBeenCalledTimes(2);
    expect(host.textContent).toContain("5678abcd");
  });

  it("leaves first account creation to the explicit onboarding action", async () => {
    getOnboarding.mockResolvedValue(null);
    await render();
    expect(host.textContent).toContain("No Samra account has been created");
    expect(host.textContent).not.toContain("Account saved");
    expect(host.querySelector('a[href="/onboarding"]')?.textContent).toBe(
      "Start account setup",
    );
  });

  it("offers only the read-only wallet route when the saved wallet record is ready", async () => {
    getOnboarding.mockResolvedValue({ ...saved, state: "wallet_ready" });
    await render();
    expect(host.querySelector('a[href="/wallet"]')?.textContent).toBe(
      "View wallet record",
    );
    expect(host.textContent).not.toMatch(
      /Add money|Send money|available balance/i,
    );
  });

  it.each([401, 403, 503])(
    "hides cached account data during refresh and after a %s failure",
    async (status) => {
      await render();
      let reject!: (error: unknown) => void;
      getOnboarding.mockImplementationOnce(
        () =>
          new Promise((_, fail) => {
            reject = fail;
          }),
      );
      await act(async () => button("Refresh account").click());
      await settle();
      expect(host.textContent).not.toContain("5678abcd");
      expect(host.textContent).toContain("Checking your account");
      await act(async () =>
        reject({ status, message: "private provider message" }),
      );
      await settle();
      expect(host.textContent).not.toContain("5678abcd");
      expect(host.textContent).not.toContain("private provider message");
      expect(host.textContent).toContain("We couldn’t open your account");
    },
  );

  it("rejects restricted onboarding even when an earlier account is cached", async () => {
    client.setQueryData(
      ["samra", "onboarding", "account-access", "api"],
      saved,
    );
    getOnboarding.mockResolvedValue({ ...saved, state: "restricted" });
    await render();
    expect(host.textContent).not.toContain("5678abcd");
    expect(host.textContent).not.toContain("Account saved");
  });

  it("recovers an unavailable read without creating another account", async () => {
    getOnboarding.mockRejectedValueOnce(new Error("private network detail"));
    await render();
    await click("Refresh account");
    expect(host.textContent).toContain("Account saved");
    expect(getOnboarding).toHaveBeenCalledTimes(2);
  });

  it("removes account details immediately on logout and offers a safe retry on failure", async () => {
    signOut.mockRejectedValueOnce(new Error("private provider detail"));
    await render();
    await click("Sign out");
    expect(host.textContent).not.toContain("5678abcd");
    expect(host.textContent).toContain("We couldn’t complete sign-out");
    expect(host.textContent).not.toContain("private provider detail");
    await click("Sign out");
    expect(signOut).toHaveBeenCalledTimes(2);
  });

  it("routes a returning login to account access while verification is pending", async () => {
    window.history.replaceState({}, "", "/session");
    await render(CustomerSession);
    expect(window.location.pathname).toBe("/account");
  });

  it("routes an authenticated but unbound identity to onboarding", async () => {
    getOnboarding.mockResolvedValue(null);
    window.history.replaceState({}, "", "/session");
    await render(CustomerSession);
    expect(window.location.pathname).toBe("/onboarding");
  });

  it.each([{ ...saved, state: "restricted" }, null])(
    "never uses a stale session record to reach account access: %j",
    async (snapshot) => {
      getOnboarding.mockRejectedValue({
        status: 403,
        data: { code: "CUSTOMER_ACCESS_RESTRICTED" },
      });
      client.setQueryData(
        ["samra", "onboarding", "account-access", "api"],
        snapshot,
      );
      window.history.replaceState({}, "", "/session");
      await render(CustomerSession);
      expect(window.location.pathname).toBe("/session");
      expect(host.textContent).toContain("We couldn’t open your account");
    },
  );
});
