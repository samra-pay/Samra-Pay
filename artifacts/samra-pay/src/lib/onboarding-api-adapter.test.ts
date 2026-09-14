import { afterEach, describe, expect, it, vi } from "vitest";

import { GeneratedSamraOnboardingSource } from "@workspace/samra-client/generated-transport";
import {
  STAGING_CUSTOMER_WALLET_DISCLOSURE,
  SYNTHETIC_WALLET_PROVISIONING_INPUT,
  walletProvisioningInputFromDisclosure,
} from "@workspace/samra-client/onboarding";

const onboarding = {
  onboardingId: "onboarding_001",
  customerId: "customer_001",
  state: "consent_pending",
  latestCompletedStep: "authenticated",
  reasonFamily: null,
  version: 1,
  enteredAt: "2026-08-19T00:00:00.000Z",
  createdAt: "2026-08-19T00:00:00.000Z",
  updatedAt: "2026-08-19T00:00:00.000Z",
  consentBundle: {
    bundleVersion: "alpha-non-production-v2",
    locale: "en-US",
    legalEffect: "non_production",
    documents: [
      {
        consentType: "terms_of_service",
        documentVersion: "alpha-non-production-v2",
        required: true,
      },
    ],
  },
  nextAllowedActions: ["submit_consents"],
};

const identityCase = {
  identityCaseId: "identity_case_001",
  state: "pending",
  reasonFamily: null,
  provider: "persona",
  synthetic: true,
  version: 1,
  decidedAt: null,
  createdAt: "2026-08-19T00:00:00.000Z",
  updatedAt: "2026-08-19T00:00:00.000Z",
  nextAllowedActions: ["continue_identity_verification"],
};

const wallet = {
  walletId: "wallet_0123456789abcdef0123456789abcdef",
  state: "ready",
  reasonFamily: null,
  provider: "crossmint",
  asset: "USDC",
  network: "synthetic",
  custodyModel: null,
  publicAddress: null,
  configurationVersion: "crossmint-synthetic-v1",
  synthetic: true,
  version: 2,
  readyAt: "2026-08-19T00:00:00.000Z",
  createdAt: "2026-08-19T00:00:00.000Z",
  updatedAt: "2026-08-19T00:00:00.000Z",
  nextAllowedActions: ["review_wallet"],
};

const stagingWalletDisclosure = {
  bundleVersion: "sandbox-customer-wallet-v2",
  documentVersion: "sandbox-customer-wallet-v2",
  locale: "en-US",
  legalEffect: "non_production",
  environment: "staging",
  createsRealWallet: true,
  customerControlSetupRequired: true,
  fundingEnabled: false,
  remittanceEnabled: false,
  presentation: {
    title: "Create your Crossmint non-production EVM wallet",
    body: "This creates a real, non-production Crossmint EVM wallet intended for future approved USDC use and associates it with your Samra account. Crossmint receives an opaque Samra customer reference and the configured tester recovery email for the wallet's email admin signer. Samra has not configured a token or on-chain asset for this wallet. Because this flow does not inspect on-chain holdings, it makes no claim that the address is empty; Samra does not recognize or present a wallet balance. Customer signing and recovery control have not been verified, so the wallet is not ready. Funding, remittance, transfers, withdrawals, and live financial access remain disabled.",
    acceptanceLabel:
      "I understand Crossmint receives the configured tester recovery email; this flow does not prove the wallet is empty or customer-controlled, and Samra does not present a wallet balance",
    actionLabel: "Create Crossmint test wallet",
  },
} as const;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("generated onboarding API adapter", () => {
  it("sends command idempotency and returns immutable normalized state", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(onboarding, 201));
    vi.stubGlobal("fetch", fetchMock);
    const source = new GeneratedSamraOnboardingSource();

    const result = await source.startOnboarding("onboarding-command-001");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/onboarding");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("idempotency-key")).toBe(
      "onboarding-command-001",
    );
    expect(result).toEqual(onboarding);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.consentBundle.documents)).toBe(true);
  });

  it("maps only the documented unbound and missing cases to a resumable null", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ code: "CUSTOMER_IDENTITY_UNBOUND" }, 403),
      )
      .mockResolvedValueOnce(jsonResponse({ code: "NOT_FOUND" }, 404))
      .mockResolvedValueOnce(jsonResponse({ code: "NOT_FOUND" }, 404))
      .mockResolvedValueOnce(
        jsonResponse({ code: "CUSTOMER_AUTHENTICATION_REQUIRED" }, 401),
      );
    vi.stubGlobal("fetch", fetchMock);
    const source = new GeneratedSamraOnboardingSource();

    await expect(source.getOnboarding()).resolves.toBeNull();
    await expect(source.getIdentityCase()).resolves.toBeNull();
    await expect(source.getWallet()).resolves.toBeNull();
    await expect(source.getOnboarding()).rejects.toMatchObject({ status: 401 });
  });

  it("records the exact synthetic wallet disclosure without exposing provider identifiers", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(wallet, 201));
    vi.stubGlobal("fetch", fetchMock);
    const source = new GeneratedSamraOnboardingSource();

    const result = await source.startWalletProvisioning(
      SYNTHETIC_WALLET_PROVISIONING_INPUT,
      "wallet-command-001",
    );

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/onboarding/wallet");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("idempotency-key")).toBe(
      "wallet-command-001",
    );
    expect(JSON.parse(String(init.body))).toEqual(
      SYNTHETIC_WALLET_PROVISIONING_INPUT,
    );
    expect(result).toEqual(wallet);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.nextAllowedActions)).toBe(true);
    expect(result).not.toHaveProperty("providerWalletId");
  });

  it("fetches and submits the server-selected staging wallet disclosure", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(stagingWalletDisclosure))
      .mockResolvedValueOnce(
        jsonResponse(
          {
            ...wallet,
            state: "customer_control_setup",
            network: "base-sepolia",
            custodyModel: null,
            configurationVersion: "crossmint-sandbox-evm-customer-email-v1",
            synthetic: false,
            readyAt: null,
            nextAllowedActions: ["await_customer_control_setup"],
          },
          201,
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const source = new GeneratedSamraOnboardingSource();

    const disclosure = await source.getWalletDisclosure();
    const result = await source.startWalletProvisioning(
      walletProvisioningInputFromDisclosure(disclosure),
      "wallet-command-staging-001",
    );

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/v1/onboarding/wallet/disclosure",
    );
    expect(Object.isFrozen(disclosure)).toBe(true);
    expect(Object.isFrozen(disclosure.presentation)).toBe(true);
    expect(disclosure).toBe(STAGING_CUSTOMER_WALLET_DISCLOSURE);
    expect(disclosure).not.toHaveProperty("provider");
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe("/api/v1/onboarding/wallet");
    expect(JSON.parse(String(init.body))).toEqual({
      bundleVersion: stagingWalletDisclosure.bundleVersion,
      documentVersion: stagingWalletDisclosure.documentVersion,
      locale: stagingWalletDisclosure.locale,
      decision: "accepted",
    });
    expect(result.state).toBe("customer_control_setup");
    expect(result.custodyModel).toBeNull();
    expect(result.publicAddress).toBeNull();
  });

  it("rejects an incoherent server disclosure before it can be accepted", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        ...stagingWalletDisclosure,
        createsRealWallet: false,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const source = new GeneratedSamraOnboardingSource();

    await expect(source.getWalletDisclosure()).rejects.toThrow(
      /complete, recognized server contract/i,
    );
  });

  it("keeps the deterministic fake Persona command behind the explicit demo method", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ identityCase, replayed: false }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const source = new GeneratedSamraOnboardingSource();

    const result = await source.advanceIdentity(
      identityCase.identityCaseId,
      "review",
      "identity-command-001",
    );

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "/api/v1/dev/onboarding/identity/identity_case_001/decision",
    );
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("idempotency-key")).toBe(
      "identity-command-001",
    );
    expect(JSON.parse(String(init.body))).toEqual({ decision: "review" });
    expect(result).toEqual(identityCase);
    expect(Object.isFrozen(result)).toBe(true);
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
