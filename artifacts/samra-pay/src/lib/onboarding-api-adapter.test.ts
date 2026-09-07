import { afterEach, describe, expect, it, vi } from "vitest";

import { GeneratedSamraOnboardingSource } from "@workspace/samra-client/generated-transport";
import { SYNTHETIC_WALLET_PROVISIONING_INPUT } from "@workspace/samra-client/onboarding";

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
    bundleVersion: "alpha-non-production-v1",
    locale: "en-US",
    legalEffect: "non_production",
    documents: [
      {
        consentType: "terms_of_service",
        documentVersion: "alpha-non-production-v1",
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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("generated onboarding API adapter", () => {
  it("requests the caller's hosted inquiry without caching or sending client identity", async () => {
    const launch = {
      provider: "persona",
      environment: "sandbox",
      url: "https://inquiry.withpersona.com/verify?code=SYNTHETICHOSTEDLINK123",
    };
    const fetchMock = vi.fn(async () => jsonResponse(launch, 200));
    vi.stubGlobal("fetch", fetchMock);
    const result =
      await new GeneratedSamraOnboardingSource().createIdentityHostedLaunch(
        "launch-command-001",
      );
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/onboarding/identity/launch");
    expect(init.method).toBe("POST");
    expect(init.cache).toBe("no-store");
    expect(init.signal).toBeDefined();
    expect(init.body).toBeUndefined();
    expect(new Headers(init.headers).get("idempotency-key")).toBe(
      "launch-command-001",
    );
    expect(result).toEqual(launch);
    expect(Object.isFrozen(result)).toBe(true);
  });

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
