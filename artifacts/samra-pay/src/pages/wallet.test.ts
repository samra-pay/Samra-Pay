import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SamraOnboardingSourceProvider } from "@workspace/samra-client/react";
import type {
  CustomerOnboardingSnapshot,
  CustomerWalletSnapshot,
  SamraOnboardingSource,
} from "@workspace/samra-client/onboarding";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CustomerWalletPage from "./wallet";

vi.mock("@/lib/customer-auth", () => ({
  useCustomerAuth: () => ({ signOut: vi.fn() }),
}));

const onboarding: CustomerOnboardingSnapshot = {
  onboardingId: "onboarding-test",
  customerId: "customer-test",
  state: "wallet_ready",
  latestCompletedStep: "wallet_ready",
  reasonFamily: null,
  version: 1,
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
const wallet: CustomerWalletSnapshot = {
  walletId: "wallet-test",
  state: "ready",
  reasonFamily: null,
  provider: "crossmint",
  asset: "USDC",
  network: "base-sepolia",
  custodyModel: "customer-controlled",
  publicAddress: "0x1111111111111111111111111111111111111111",
  configurationVersion: "crossmint-sandbox-evm-customer-email-v1",
  synthetic: false,
  version: 1,
  readyAt: "2026-09-07T00:00:00Z",
  createdAt: "2026-09-07T00:00:00Z",
  updatedAt: "2026-09-07T00:00:00Z",
  nextAllowedActions: ["review_wallet"],
};
let root: Root;
let host: HTMLDivElement;
let client: QueryClient;
let source: SamraOnboardingSource;
const getOnboarding = vi.fn();
const getWallet = vi.fn();
const mutate = vi.fn(() => {
  throw new Error("Unexpected mutation");
});
const writeText = vi.fn();

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}
async function render() {
  await act(async () => {
    root.render(
      createElement(
        QueryClientProvider,
        { client },
        createElement(
          SamraOnboardingSourceProvider,
          { mode: "api", source },
          createElement(CustomerWalletPage),
        ),
      ),
    );
  });
  await settle();
}
function button(label: string): HTMLButtonElement {
  const result = Array.from(document.querySelectorAll("button")).find(
    (item) => item.textContent === label,
  );
  if (!result) throw new Error(`Missing button: ${label}`);
  return result;
}
async function click(label: string) {
  await act(async () => button(label).click());
  await settle();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  writeText.mockResolvedValue(undefined);
  getOnboarding.mockResolvedValue(onboarding);
  getWallet.mockResolvedValue(wallet);
  source = {
    getOnboarding,
    getWalletDisclosure: mutate,
    getWallet,
    startOnboarding: mutate,
    submitConsentBundle: mutate,
    getIdentityCase: mutate,
    startIdentityVerification: mutate,
    startWalletProvisioning: mutate,
  };
  client = new QueryClient();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  expect(mutate).not.toHaveBeenCalled();
  await act(async () => root.unmount());
  client.clear();
  host.remove();
  vi.unstubAllGlobals();
});

describe("read-only customer wallet dashboard", () => {
  it("retrieves only the caller's record and never substitutes a zero balance or empty history", async () => {
    window.history.replaceState(
      {},
      "",
      "/wallet?customerId=another&address=untrusted",
    );
    await render();
    expect(getOnboarding).toHaveBeenCalledWith();
    expect(getWallet).toHaveBeenCalledWith();
    expect(getOnboarding.mock.invocationCallOrder[0]).toBeLessThan(
      getWallet.mock.invocationCallOrder[0],
    );
    expect(host.textContent).toContain("Staging wallet · non-production only");
    expect(host.textContent).toContain(
      "Intended product asset · USDCUnavailable",
    );
    expect(host.textContent).toContain(
      "does not recognize or present a wallet balance",
    );
    expect(host.textContent).toContain("Activity unavailable");
    expect(host.textContent).not.toMatch(
      /0\.00|No activity yet|untrusted|wallet is empty|no token balance/i,
    );
    expect(button("Add money").disabled).toBe(true);
    expect(button("Send").disabled).toBe(true);
    await click("Wallet details");
    expect(document.body.textContent).toContain(wallet.publicAddress);
    expect(document.body.textContent).toContain("base-sepolia");
    await click("Copy wallet address");
    expect(writeText).toHaveBeenCalledExactlyOnceWith(wallet.publicAddress);
    expect(document.body.textContent).toContain("Wallet address copied.");
  });

  it.each([
    {
      state: "customer_control_setup" as const,
      nextAllowedActions: ["await_customer_control_setup"],
    },
    {
      state: "ready" as const,
      nextAllowedActions: ["await_customer_signer_setup"],
    },
  ])(
    "hides wallet details and financial controls while customer control is incomplete: $state",
    async ({ state, nextAllowedActions }) => {
      getOnboarding.mockResolvedValue({
        ...onboarding,
        state: "wallet_control_setup",
        latestCompletedStep: "wallet_provisioned",
      });
      getWallet.mockResolvedValue({
        ...wallet,
        state,
        publicAddress: "0x2222222222222222222222222222222222222222",
        readyAt: null,
        nextAllowedActions,
      });

      await render();

      expect(getWallet).toHaveBeenCalledTimes(1);
      expect(host.textContent).toContain("Wallet setup is not complete");
      expect(host.textContent).toContain(
        "Customer signing and recovery setup are still required",
      );
      expect(
        Array.from(host.querySelectorAll("button")).some(
          (item) => item.textContent === "Wallet details",
        ),
      ).toBe(false);
      expect(host.textContent).not.toContain("Intended product asset");
      expect(host.textContent).not.toContain("Add money");
      expect(host.textContent).not.toContain("Send");
      expect(document.body.textContent).not.toContain(
        "0x2222222222222222222222222222222222222222",
      );
      expect(document.body.textContent).not.toContain("Copy wallet address");
    },
  );

  it.each([
    null,
    { ...onboarding, state: "restricted" },
    { ...onboarding, state: "identity_review" },
  ])(
    "does not read a wallet before eligible onboarding: %j",
    async (snapshot) => {
      getOnboarding.mockResolvedValue(snapshot);
      await render();
      expect(getWallet).not.toHaveBeenCalled();
      expect(host.textContent).toContain("Wallet setup is not complete");
      expect(host.querySelector('a[href="/onboarding"]')).not.toBeNull();
    },
  );

  it.each(["restricted", "error", "provisioning", "created"])(
    "hides address details for %s wallets",
    async (state) => {
      getWallet.mockResolvedValue({ ...wallet, state });
      await render();
      expect(host.textContent).not.toContain("Wallet details");
      expect(document.body.textContent).not.toContain(wallet.publicAddress);
    },
  );

  it.each([401, 403, 503])(
    "hides cached details after a %s refresh failure",
    async (status) => {
      await render();
      await click("Wallet details");
      let reject!: (error: unknown) => void;
      getOnboarding.mockImplementationOnce(
        () =>
          new Promise((_, no) => {
            reject = no;
          }),
      );
      await act(async () => {
        void client.refetchQueries({ queryKey: ["samra", "wallet-overview"] });
      });
      await settle();
      expect(document.body.textContent).not.toContain(wallet.publicAddress);
      expect(host.textContent).toContain("Checking your wallet");
      await act(async () =>
        reject({ status, message: "private provider response" }),
      );
      await settle();
      expect(host.textContent).toContain("Wallet unavailable");
      expect(host.textContent).not.toContain("private provider response");
      expect(getWallet).toHaveBeenCalledTimes(1);
    },
  );

  it("recovers a failed wallet read without retaining another record", async () => {
    getWallet.mockRejectedValueOnce(new Error("network"));
    await render();
    expect(host.textContent).toContain("Wallet unavailable");
    await click("Refresh wallet");
    expect(host.textContent).toContain("Wallet record ready");
    expect(getOnboarding).toHaveBeenCalledTimes(2);
    expect(getWallet).toHaveBeenCalledTimes(2);
  });

  it("reports clipboard failure without claiming success", async () => {
    writeText.mockRejectedValueOnce(new Error("denied"));
    await render();
    await click("Wallet details");
    await click("Copy wallet address");
    expect(document.body.textContent).toContain("Couldn’t copy the address");
    expect(document.body.textContent).not.toContain("Wallet address copied.");
  });

  it("labels synthetic records and does not invent an address", async () => {
    getWallet.mockResolvedValue({
      ...wallet,
      synthetic: true,
      publicAddress: null,
      network: null,
      configurationVersion: "crossmint-synthetic-v1",
    });
    await render();
    expect(host.textContent).toContain("Synthetic wallet preview");
    await click("Wallet details");
    expect(document.body.textContent).toContain("Not available");
    expect(document.body.textContent).not.toContain("Copy wallet address");
  });

  it("revalidates an old cached record before displaying it on page entry", async () => {
    client.setQueryData(["samra", "wallet-overview", "api"], wallet);
    getOnboarding.mockResolvedValue({ ...onboarding, state: "restricted" });
    await render();
    expect(getWallet).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain(wallet.publicAddress);
    expect(host.textContent).not.toContain("Wallet details");
  });
});
