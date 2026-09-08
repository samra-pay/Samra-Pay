import { TestDemoRuntime } from "../test/fixtures/demo-runtime";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import type { Server } from "node:http";
import type { RequestHandler } from "express";
import { UnauthorizedError } from "express-oauth2-jwt-bearer";
import { createApp } from "./app";
import type { ApiRuntimeConfig } from "./config";
import {
  DEMO_ACTOR,
  type PublicTransferDemoScenario,
} from "./domain/demo-runtime";
import { DEMO_LEDGER_ACCOUNT_IDS } from "./domain/demo-ledger";
import { Auth0CustomerActorResolver } from "./domain/customer-auth";
import {
  CustomerIdentityVerificationService,
  DeterministicFakePersonaAdapter,
} from "./domain/customer-identity";
import {
  CustomerWalletProvisioningService,
  DeterministicFakeCrossmintAdapter,
} from "./domain/customer-wallet";
import {
  ALPHA_ONBOARDING_CONSENT_BUNDLE,
  CustomerOnboardingNotFoundError,
  type CustomerOnboardingSnapshot,
  type CustomerOnboardingState,
  type CustomerOnboardingStore,
  type CustomerIdentityCaseStore,
  type CustomerFunnelStore,
  type CustomerWalletStore,
} from "@workspace/db";

const demoConfig: ApiRuntimeConfig = Object.freeze({
  backendMode: "demo",
  providerMode: "fake",
  devControlsEnabled: true,
  runWorker: false,
  workerIntervalMilliseconds: 5,
  customerAuth: Object.freeze({ mode: "disabled" }),
});

const disabledConfig: ApiRuntimeConfig = Object.freeze({
  backendMode: "disabled",
  providerMode: "fake",
  devControlsEnabled: false,
  runWorker: false,
  workerIntervalMilliseconds: 5,
  customerAuth: Object.freeze({ mode: "disabled" }),
});

type JsonObject = Record<string, unknown>;

function unusedIdentityVerificationService(): CustomerIdentityVerificationService {
  const notUsed = async (): Promise<never> => {
    throw new Error("not used by this test");
  };
  const store: CustomerIdentityCaseStore = {
    prepareAuth0IdentityCase: notUsed,
    attachProviderInquiry: notUsed,
    recordProviderStartFailure: notUsed,
    getAuth0IdentityCase: notUsed,
    recordProviderEvent: notUsed,
  };
  return new CustomerIdentityVerificationService({
    store,
    provider: new DeterministicFakePersonaAdapter(),
  });
}

function unusedWalletProvisioningService(): CustomerWalletProvisioningService {
  const notUsed = async (): Promise<never> => {
    throw new Error("not used by this test");
  };
  const store: CustomerWalletStore = {
    prepareAuth0Wallet: notUsed,
    attachProviderWallet: notUsed,
    recordProviderStartFailure: notUsed,
    getAuth0Wallet: notUsed,
  };
  return new CustomerWalletProvisioningService({
    store,
    provider: new DeterministicFakeCrossmintAdapter(),
  });
}

test("health remains available while disabled mode returns a stable 503 problem", async () => {
  await withServer(disabledConfig, undefined, async (origin) => {
    const health = await request(origin, "/api/healthz");
    assert.equal(health.status, 200);
    assert.deepEqual(health.body, { status: "ok" });
    const readiness = await request(origin, "/api/readyz");
    assert.equal(readiness.status, 200);
    assert.deepEqual(readiness.body, { status: "ready" });

    const unavailable = await request(origin, "/api/v1/me");
    assert.equal(unavailable.status, 503);
    assert.equal(unavailable.body["code"], "BACKEND_UNAVAILABLE");
    assert.equal(typeof unavailable.body["traceId"], "string");

    const hiddenDevRoute = await request(
      origin,
      "/api/v1/dev/reconciliation/runs/not-exposed",
    );
    assert.equal(hiddenDevRoute.status, 404);
    assert.equal(hiddenDevRoute.body["code"], "NOT_FOUND");
  });
});

test("public waitlist records explicit consent idempotently and rejects extra tracking data", async () => {
  await withServer(demoConfig, new TestDemoRuntime(), async (origin) => {
    const input = {
      email: "Founder@Example.Test",
      consent: true,
      consentVersion: "coming-soon-2026-08-30",
      locale: "en",
      website: "",
    };
    const headers = { "Idempotency-Key": "waitlist-command-001" };
    const accepted = await request(
      origin,
      "/api/v1/waitlist/subscriptions",
      { method: "POST", headers, body: input },
    );
    assert.equal(accepted.status, 202);
    assert.equal(accepted.body["accepted"], true);
    assert.equal(typeof accepted.body["acceptedAt"], "string");

    const replay = await request(origin, "/api/v1/waitlist/subscriptions", {
      method: "POST",
      headers,
      body: input,
    });
    assert.equal(replay.status, 202);
    assert.equal(replay.body["acceptedAt"], accepted.body["acceptedAt"]);

    const conflictingReplay = await request(
      origin,
      "/api/v1/waitlist/subscriptions",
      {
        method: "POST",
        headers,
        body: { ...input, email: "different@example.test" },
      },
    );
    assert.equal(conflictingReplay.status, 409);

    const trackingRejected = await request(
      origin,
      "/api/v1/waitlist/subscriptions",
      {
        method: "POST",
        headers: { "Idempotency-Key": "waitlist-command-002" },
        body: { ...input, deviceId: "do-not-collect" },
      },
    );
    assert.equal(trackingRejected.status, 422);

    const botRejected = await request(
      origin,
      "/api/v1/waitlist/subscriptions",
      {
        method: "POST",
        headers: { "Idempotency-Key": "waitlist-command-003" },
        body: { ...input, website: "https://spam.example" },
      },
    );
    assert.equal(botRejected.status, 422);
  });
});

test("readiness fails closed without exposing persistence errors", async () => {
  const runtime = new TestDemoRuntime({
    readiness: async () => {
      throw new Error("postgresql://sensitive-host/internal-detail");
    },
  });
  await withServer(demoConfig, runtime, async (origin) => {
    const health = await request(origin, "/api/healthz");
    assert.equal(health.status, 200);
    const readiness = await request(origin, "/api/readyz");
    assert.equal(readiness.status, 503);
    assert.deepEqual(readiness.body, { status: "not_ready" });
    assert.doesNotMatch(JSON.stringify(readiness.body), /sensitive-host/);
  });
});

test("production-style demo mode does not mount dev controls", async () => {
  await withServer(
    { ...demoConfig, devControlsEnabled: false },
    new TestDemoRuntime(),
    async (origin) => {
      const me = await request(origin, "/api/v1/me");
      assert.equal(me.status, 200);
      const dev = await request(origin, "/api/v1/dev/reconciliation/runs", {
        method: "POST",
        body: {},
      });
      assert.equal(dev.status, 404);
      assert.equal(dev.body["code"], "NOT_FOUND");
    },
  );
});

test("Auth0 mode protects customer routes, resolves the canonical customer, and leaves internal test controls on their separate trust boundary", async () => {
  const issuer = "https://samra-test.us.auth0.com/";
  const authConfig: ApiRuntimeConfig = Object.freeze({
    ...demoConfig,
    persistenceMode: "postgres",
    customerAuth: Object.freeze({
      mode: "auth0",
      issuerBaseUrl: issuer,
      audience: "https://api.samrapay.test",
      tokenSigningAlgorithm: "RS256",
    }),
  });
  const identities = {
    async resolveAuth0Identity(input: { issuer: string; subject: string }) {
      if (input.issuer !== issuer || input.subject === "auth0|unbound") {
        return undefined;
      }
      return Object.freeze({
        identityId: `identity-${input.subject}`,
        identityState:
          input.subject === "auth0|revoked"
            ? ("revoked" as const)
            : ("active" as const),
        customerId: "00000000-0000-4000-8000-000000000001",
        customerExternalRef: DEMO_ACTOR.id,
        customerDisplayName: DEMO_ACTOR.displayName,
        customerState:
          input.subject === "auth0|suspended"
            ? ("suspended" as const)
            : input.subject === "auth0|closed"
              ? ("closed" as const)
              : ("active" as const),
        onboardingState:
          input.subject === "auth0|onboarding" ? "consent_pending" : null,
      });
    },
  };
  const resolver = new Auth0CustomerActorResolver(identities, issuer);
  const runtime = new TestDemoRuntime({
    actorResolver: resolver,
    beneficiaryActorResolver: resolver,
    customerAuthenticationMode: "auth0",
    customerOnboardingStore: {
      async startAuth0Onboarding() {
        throw new Error("not used by this authentication-boundary test");
      },
      async getAuth0Onboarding() {
        throw new Error("not used by this authentication-boundary test");
      },
      async recordAuth0ConsentBundle() {
        throw new Error("not used by this authentication-boundary test");
      },
    },
    customerIdentityVerificationService: unusedIdentityVerificationService(),
    customerWalletProvisioningService: unusedWalletProvisioningService(),
  });
  const customerAccessTokenMiddleware: RequestHandler = (req, _res, next) => {
    const authorization = req.header("authorization");
    if (!authorization?.startsWith("Bearer test:")) {
      next(new UnauthorizedError());
      return;
    }
    const subject = authorization.slice("Bearer test:".length);
    req.auth = {
      header: { alg: "RS256" },
      payload: {
        iss: issuer,
        sub: subject,
        aud: "https://api.samrapay.test",
        exp: Math.floor(Date.now() / 1_000) + 300,
      },
      token: authorization.slice("Bearer ".length),
    };
    next();
  };

  assert.throws(
    () => createApp(authConfig, new TestDemoRuntime()),
    /requires an Auth0-backed customer actor resolver/,
  );
  await withServer(authConfig, runtime, async (origin) => {
    const missing = await request(origin, "/api/v1/me");
    assert.equal(missing.status, 401);
    assert.equal(missing.body["code"], "CUSTOMER_AUTHENTICATION_REQUIRED");
    const malformed = await request(origin, "/api/v1/me", {
      headers: { authorization: "Bearer not-a-jwt" },
    });
    assert.equal(malformed.status, 401);
    assert.equal(malformed.body["code"], "CUSTOMER_AUTHENTICATION_REQUIRED");
  });

  await withServer(
    authConfig,
    runtime,
    async (origin) => {
      const missing = await request(origin, "/api/v1/me");
      assert.equal(missing.status, 401);
      assert.equal(missing.body["code"], "CUSTOMER_AUTHENTICATION_REQUIRED");
      assert.equal(
        missing.headers.get("www-authenticate"),
        'Bearer realm="samra-api"',
      );

      const unbound = await request(origin, "/api/v1/me", {
        headers: { authorization: "Bearer test:auth0|unbound" },
      });
      assert.equal(unbound.status, 403);
      assert.equal(unbound.body["code"], "CUSTOMER_IDENTITY_UNBOUND");

      const suspended = await request(origin, "/api/v1/me", {
        headers: { authorization: "Bearer test:auth0|suspended" },
      });
      assert.equal(suspended.status, 403);
      assert.equal(suspended.body["code"], "CUSTOMER_ACCESS_RESTRICTED");

      for (const subject of ["auth0|closed", "auth0|revoked"]) {
        const restricted = await request(origin, "/api/v1/me", {
          headers: { authorization: `Bearer test:${subject}` },
        });
        assert.equal(restricted.status, 403);
        assert.equal(restricted.body["code"], "CUSTOMER_ACCESS_RESTRICTED");
      }

      const onboardingRequired = await request(origin, "/api/v1/me", {
        headers: { authorization: "Bearer test:auth0|onboarding" },
      });
      assert.equal(onboardingRequired.status, 403);
      assert.equal(
        onboardingRequired.body["code"],
        "CUSTOMER_ONBOARDING_REQUIRED",
      );

      const currentCustomer = await request(origin, "/api/v1/me", {
        headers: {
          authorization: "Bearer test:auth0|active",
          "x-demo-actor-id": "demo_customer_002",
        },
      });
      assert.equal(currentCustomer.status, 200);
      assert.equal(currentCustomer.body["id"], DEMO_ACTOR.id);
      assert.equal(currentCustomer.body["displayName"], DEMO_ACTOR.displayName);

      const devControl = await request(
        origin,
        "/api/v1/dev/reconciliation/runs",
        { method: "POST", body: { scenario: "happy_path" } },
      );
      assert.equal(devControl.status, 201);
    },
    { customerAccessTokenMiddleware },
  );
});

test("Auth0 onboarding starts and resumes before the financial-route authorization gate opens", async () => {
  const issuer = "https://samra-onboarding.us.auth0.com/";
  const authConfig: ApiRuntimeConfig = Object.freeze({
    ...demoConfig,
    persistenceMode: "postgres",
    customerAuth: Object.freeze({
      mode: "auth0",
      issuerBaseUrl: issuer,
      audience: "https://api.samrapay.test",
      tokenSigningAlgorithm: "RS256",
    }),
  });
  let bound = false;
  let state: CustomerOnboardingState = "consent_pending";
  let version = 1;
  let observedStartInput: Readonly<Record<string, unknown>> | undefined;
  const snapshot = (): CustomerOnboardingSnapshot =>
    Object.freeze({
      onboardingId: "00000000-0000-4000-8000-000000000099",
      customerId: "customer_pending_001",
      state,
      latestCompletedStep:
        state === "consent_pending" ? "authenticated" : "required_consents",
      reasonFamily: null,
      version,
      enteredAt: "2026-08-18T12:00:00.000Z",
      createdAt: "2026-08-18T12:00:00.000Z",
      updatedAt: "2026-08-18T12:00:00.000Z",
      nextAllowedActions:
        state === "consent_pending"
          ? ["review_required_consents", "submit_required_consents"]
          : ["start_identity_verification"],
      consentBundle: ALPHA_ONBOARDING_CONSENT_BUNDLE,
    });
  const onboardingStore: CustomerOnboardingStore = {
    async startAuth0Onboarding(input) {
      observedStartInput = input;
      const created = !bound;
      bound = true;
      return Object.freeze({ snapshot: snapshot(), created });
    },
    async getAuth0Onboarding() {
      if (!bound) throw new CustomerOnboardingNotFoundError();
      return snapshot();
    },
    async recordAuth0ConsentBundle() {
      if (!bound) throw new CustomerOnboardingNotFoundError();
      state = "identity_in_progress";
      version += 1;
      return Object.freeze({ snapshot: snapshot(), replayed: false });
    },
  };
  const identities = {
    async resolveAuth0Identity() {
      if (!bound) return undefined;
      return Object.freeze({
        identityId: "00000000-0000-4000-8000-000000000098",
        identityState: "active" as const,
        customerId: "00000000-0000-4000-8000-000000000097",
        customerExternalRef: "customer_pending_001",
        customerDisplayName: "Customer profile pending",
        customerState: "active" as const,
        onboardingState: state,
      });
    },
  };
  const resolver = new Auth0CustomerActorResolver(identities, issuer);
  const runtime = new TestDemoRuntime({
    actorResolver: resolver,
    beneficiaryActorResolver: resolver,
    customerAuthenticationMode: "auth0",
    customerOnboardingStore: onboardingStore,
    customerIdentityVerificationService: unusedIdentityVerificationService(),
    customerWalletProvisioningService: unusedWalletProvisioningService(),
  });
  const customerAccessTokenMiddleware: RequestHandler = (req, _res, next) => {
    const authorization = req.header("authorization");
    if (authorization !== "Bearer test:onboarding-subject") {
      next(new UnauthorizedError());
      return;
    }
    req.auth = {
      header: { alg: "RS256" },
      payload: {
        iss: issuer,
        sub: "auth0|onboarding-subject",
        aud: "https://api.samrapay.test",
        exp: Math.floor(Date.now() / 1_000) + 300,
        email: "client-claim-must-not-bind@example.test",
        name: "Client Claim Must Not Bind",
      },
      token: authorization.slice("Bearer ".length),
    };
    next();
  };
  const bearer = { authorization: "Bearer test:onboarding-subject" };

  await withServer(
    authConfig,
    runtime,
    async (origin) => {
      const beforeStart = await request(origin, "/api/v1/me", {
        headers: bearer,
      });
      assert.equal(beforeStart.status, 403);
      assert.equal(beforeStart.body["code"], "CUSTOMER_IDENTITY_UNBOUND");

      const missingKey = await request(origin, "/api/v1/onboarding", {
        method: "POST",
        headers: bearer,
      });
      assert.equal(missingKey.status, 422);

      const started = await request(origin, "/api/v1/onboarding", {
        method: "POST",
        headers: { ...bearer, "Idempotency-Key": "onboarding-start-001" },
      });
      assert.equal(started.status, 201);
      assert.equal(started.body["state"], "consent_pending");
      assert.equal(started.body["customerId"], "customer_pending_001");
      assert.equal(
        JSON.stringify(observedStartInput).includes("example.test"),
        false,
      );

      const resumedStart = await request(origin, "/api/v1/onboarding", {
        method: "POST",
        headers: { ...bearer, "Idempotency-Key": "onboarding-start-001" },
      });
      assert.equal(resumedStart.status, 200);
      const resumed = await request(origin, "/api/v1/onboarding", {
        headers: bearer,
      });
      assert.equal(resumed.status, 200);
      assert.equal(resumed.body["onboardingId"], started.body["onboardingId"]);

      const productsBlocked = await request(origin, "/api/v1/me", {
        headers: bearer,
      });
      assert.equal(productsBlocked.status, 403);
      assert.equal(
        productsBlocked.body["code"],
        "CUSTOMER_ONBOARDING_REQUIRED",
      );

      const consented = await request(origin, "/api/v1/onboarding/consents", {
        method: "POST",
        headers: { ...bearer, "Idempotency-Key": "consent-command-001" },
        body: {
          bundleVersion: ALPHA_ONBOARDING_CONSENT_BUNDLE.bundleVersion,
          locale: ALPHA_ONBOARDING_CONSENT_BUNDLE.locale,
          decisions: ALPHA_ONBOARDING_CONSENT_BUNDLE.documents.map(
            (document) => ({
              consentType: document.consentType,
              documentVersion: document.documentVersion,
              decision: "accepted",
            }),
          ),
        },
      });
      assert.equal(consented.status, 200);
      assert.equal(consented.body["state"], "identity_in_progress");
      assert.equal(consented.body["version"], 2);
    },
    { customerAccessTokenMiddleware },
  );
});

test("acquisition capture is public and privacy-safe while customer binding remains Auth0-gated", async () => {
  const issuer = "https://samra-acquisition.us.auth0.com/";
  const authConfig: ApiRuntimeConfig = Object.freeze({
    ...demoConfig,
    persistenceMode: "postgres",
    customerAuth: Object.freeze({
      mode: "auth0",
      issuerBaseUrl: issuer,
      audience: "https://api.samrapay.test",
      tokenSigningAlgorithm: "RS256",
    }),
  });
  const sessionId = "acq_00000000000000000000000000000001";
  const observed: Array<Readonly<Record<string, unknown>>> = [];
  const funnel: CustomerFunnelStore = {
    async recordEvent(input) {
      observed.push(input);
      return Object.freeze({
        sessionId,
        eventType: input.eventType,
        recorded: true,
        recordedAt: "2026-08-19T12:00:00.000Z",
        synthetic: true,
      });
    },
    async bindAuth0Session(input) {
      observed.push(input);
      return Object.freeze({
        sessionId: input.sessionId,
        customerId: "customer_pending_001",
        linked: true,
        linkedAt: "2026-08-19T12:01:00.000Z",
        synthetic: true,
      });
    },
    async funnelReport() {
      throw new Error("not used by this route test");
    },
  };
  const identities = {
    async resolveAuth0Identity() {
      return Object.freeze({
        identityId: "00000000-0000-4000-8000-000000000098",
        identityState: "active" as const,
        customerId: "00000000-0000-4000-8000-000000000097",
        customerExternalRef: "customer_pending_001",
        customerDisplayName: "Customer profile pending",
        customerState: "active" as const,
        onboardingState: "consent_pending" as const,
      });
    },
  };
  const resolver = new Auth0CustomerActorResolver(identities, issuer);
  const runtime = new TestDemoRuntime({
    actorResolver: resolver,
    beneficiaryActorResolver: resolver,
    customerAuthenticationMode: "auth0",
    customerOnboardingStore: {
      async startAuth0Onboarding() {
        throw new Error("not used by this acquisition route test");
      },
      async getAuth0Onboarding() {
        throw new Error("not used by this acquisition route test");
      },
      async recordAuth0ConsentBundle() {
        throw new Error("not used by this acquisition route test");
      },
    },
    customerIdentityVerificationService: unusedIdentityVerificationService(),
    customerWalletProvisioningService: unusedWalletProvisioningService(),
    customerFunnelStore: funnel,
  });
  let authenticationCalls = 0;
  const customerAccessTokenMiddleware: RequestHandler = (req, _res, next) => {
    authenticationCalls += 1;
    const authorization = req.header("authorization");
    if (authorization !== "Bearer test:acquisition-subject") {
      next(new UnauthorizedError());
      return;
    }
    req.auth = {
      header: { alg: "RS256" },
      payload: {
        iss: issuer,
        sub: "auth0|acquisition-subject",
        aud: "https://api.samrapay.test",
        exp: Math.floor(Date.now() / 1_000) + 300,
      },
      token: authorization.slice("Bearer ".length),
    };
    next();
  };

  await withServer(
    authConfig,
    runtime,
    async (origin) => {
      const recorded = await request(origin, "/api/v1/acquisition/events", {
        method: "POST",
        headers: { "Idempotency-Key": "acquisition-event-001" },
        body: {
          eventType: "landing_view",
          platform: "web",
          attribution: {
            channel: "paid_social",
            source: "instagram",
            medium: "paid_social",
            campaign: "alpha_launch",
          },
        },
      });
      assert.equal(recorded.status, 201);
      assert.equal(authenticationCalls, 0);
      assert.equal(recorded.body["sessionId"], sessionId);
      const cookie = recorded.headers.get("set-cookie") ?? "";
      assert.match(cookie, /samra_acquisition_session=/);
      assert.match(cookie, /HttpOnly/i);
      assert.match(cookie, /SameSite=Lax/i);

      const rawUrlRejected = await request(
        origin,
        "/api/v1/acquisition/events",
        {
          method: "POST",
          headers: { "Idempotency-Key": "acquisition-event-002" },
          body: {
            eventType: "landing_view",
            platform: "web",
            attribution: {
              channel: "referral",
              source: "https://example.test/private?email=user@example.test",
              medium: null,
              campaign: null,
            },
          },
        },
      );
      assert.equal(rawUrlRejected.status, 422);
      assert.equal(observed.length, 1);

      const unauthenticatedBind = await request(
        origin,
        "/api/v1/acquisition/bind",
        {
          method: "POST",
          headers: {
            "Idempotency-Key": "acquisition-bind-001",
            cookie: `samra_acquisition_session=${sessionId}`,
          },
          body: {},
        },
      );
      assert.equal(unauthenticatedBind.status, 401);

      const bound = await request(origin, "/api/v1/acquisition/bind", {
        method: "POST",
        headers: {
          authorization: "Bearer test:acquisition-subject",
          "Idempotency-Key": "acquisition-bind-001",
          cookie: `samra_acquisition_session=${sessionId}`,
        },
        body: {},
      });
      assert.equal(bound.status, 201);
      assert.equal(bound.body["customerId"], "customer_pending_001");
      assert.deepEqual(observed[1], {
        issuer,
        subject: "auth0|acquisition-subject",
        sessionId,
        idempotencyKey: "acquisition-bind-001",
      });
    },
    { customerAccessTokenMiddleware },
  );
});

test("development controls reject scenarios from the wrong domain", async () => {
  await withServer(demoConfig, new TestDemoRuntime(), async (origin) => {
    const transferControl = await request(
      origin,
      "/api/v1/dev/remittance/transfers/not-used/scenario",
      {
        method: "POST",
        body: { scenario: "reconciliation_amount_mismatch" },
      },
    );
    assert.equal(transferControl.status, 422);
    assert.equal(transferControl.body["code"], "VALIDATION_ERROR");

    const reconciliationControl = await request(
      origin,
      "/api/v1/dev/reconciliation/runs",
      { method: "POST", body: { scenario: "chapa_failure" } },
    );
    assert.equal(reconciliationControl.status, 422);
    assert.equal(reconciliationControl.body["code"], "VALIDATION_ERROR");
  });
});

test("$100 + $3 quote, idempotency, polling, and ledger-derived balances stay exact", async () => {
  const runtime = new TestDemoRuntime();
  await withServer(demoConfig, runtime, async (origin) => {
    const quote = await createQuote(origin, 10_000n);
    assert.deepEqual(quote["sendAmount"], {
      currency: "USD",
      minorUnits: "10000",
    });
    assert.deepEqual(quote["feeAmount"], {
      currency: "USD",
      minorUnits: "300",
    });
    assert.deepEqual(quote["totalDebit"], {
      currency: "USD",
      minorUnits: "10300",
    });
    assert.deepEqual(quote["receiveAmount"], {
      currency: "ETB",
      minorUnits: "1800000",
    });
    assert.equal(quote["exchangeRate"], "180");

    const created = await createTransfer(
      origin,
      String(quote["id"]),
      "create-key-001",
    );
    assert.equal(created.status, 201);
    assert.equal(created.body["status"], "submitted");

    const replay = await createTransfer(
      origin,
      String(quote["id"]),
      "create-key-001",
    );
    assert.equal(replay.status, 201);
    assert.equal(replay.body["id"], created.body["id"]);

    const secondQuote = await createQuote(origin, 5_000n);
    const conflict = await createTransfer(
      origin,
      String(secondQuote["id"]),
      "create-key-001",
    );
    assert.equal(conflict.status, 409);
    assert.equal(conflict.body["code"], "CONFLICT");

    let account = await getDemoAccount(origin);
    assert.equal(moneyMinor(account["bookBalance"]), "425000");
    assert.equal(moneyMinor(account["availableBalance"]), "414700");

    const transferId = String(created.body["id"]);
    assert.deepEqual(
      (await runtime.repository.listOutbox())
        .slice(0, 3)
        .map((message) => [message.type, message.payload["state"]]),
      [
        ["TRANSFER_CREATED", "CREATED"],
        ["FUNDS_RESERVED", "FUNDS_RESERVED"],
        ["TRANSFER_SUBMITTED", "SUBMITTED"],
      ],
    );
    for (const expected of ["in_transit", "payout_pending", "completed"]) {
      const advanced = await advanceScenario(origin, transferId, "happy_path");
      assert.equal(advanced["status"], expected);
      const polled = await request(
        origin,
        `/api/v1/remittance/transfers/${transferId}`,
      );
      assert.equal(polled.status, 200);
      assert.equal(polled.body["status"], expected);
    }

    account = await getDemoAccount(origin);
    assert.equal(moneyMinor(account["bookBalance"]), "414700");
    assert.equal(moneyMinor(account["availableBalance"]), "414700");

    const journals = runtime.ledger.repository.listJournals();
    assert.deepEqual(
      journals.map((journal) => journal.source.type),
      [
        "demo_seed",
        "remittance_capture",
        "remittance_settlement",
        "remittance_fee_recognition",
      ],
    );
    assert.equal(
      runtime.ledger.repository.getAccountBalance(
        DEMO_LEDGER_ACCOUNT_IDS.principalClearingUsd,
      ).naturalBalanceMinor,
      0n,
    );
    assert.equal(
      runtime.ledger.repository.getAccountBalance(
        DEMO_LEDGER_ACCOUNT_IDS.deferredFeeUsd,
      ).naturalBalanceMinor,
      0n,
    );
    assert.equal(
      runtime.ledger.repository.getAccountBalance(
        DEMO_LEDGER_ACCOUNT_IDS.feeRevenueUsd,
      ).naturalBalanceMinor,
      300n,
    );

    const reconciliation = await request(
      origin,
      "/api/v1/dev/reconciliation/runs",
      { method: "POST", body: { scenario: "happy_path" } },
    );
    assert.equal(reconciliation.status, 201);
    assert.equal(reconciliation.body["status"], "completed");
    const reconciliationItems = reconciliation.body["items"] as JsonObject[];
    assert.equal(reconciliationItems[0]?.["classification"], "matched");
    const fetchedRun = await request(
      origin,
      `/api/v1/dev/reconciliation/runs/${String(reconciliation.body["id"])}`,
    );
    assert.equal(fetchedRun.status, 200);
    assert.deepEqual(fetchedRun.body, reconciliation.body);
  });
});

test("SAMRA_RUN_WORKER mode advances pending fake transfers to completion", async () => {
  const runtime = new TestDemoRuntime();
  await withServer(
    { ...demoConfig, runWorker: true },
    runtime,
    async (origin) => {
      const transferId = await createTransferForScenario(origin);
      let status: unknown = "submitted";
      for (
        let attempt = 0;
        attempt < 20 && status !== "completed";
        attempt += 1
      ) {
        await new Promise((resolve) => setTimeout(resolve, 10));
        const response = await request(
          origin,
          `/api/v1/remittance/transfers/${transferId}`,
        );
        status = response.body["status"];
      }
      assert.equal(status, "completed");
      const account = await getDemoAccount(origin);
      assert.equal(moneyMinor(account["bookBalance"]), "414700");
    },
  );
});

test("the worker preserves an explicitly selected failure scenario", async () => {
  const runtime = new TestDemoRuntime();
  await withServer(demoConfig, runtime, async (origin) => {
    const transferId = await createTransferForScenario(origin);
    const selected = await advanceScenario(origin, transferId, "chapa_failure");
    assert.equal(selected["status"], "in_transit");

    for (const expected of ["payout_pending", "refund_pending", "refunded"]) {
      await runtime.advanceWorkerBatch();
      const transfer = await request(
        origin,
        `/api/v1/remittance/transfers/${transferId}`,
      );
      assert.equal(transfer.body["status"], expected);
    }
  });
});

test("reconciliation changes each transfer from its own item classification", async () => {
  const runtime = new TestDemoRuntime();
  await withServer(demoConfig, runtime, async (origin) => {
    const transferIds: string[] = [];
    for (const [index, amountMinor] of [10_000n, 5_000n].entries()) {
      const quote = await createQuote(origin, amountMinor);
      const created = await createTransfer(
        origin,
        String(quote["id"]),
        `reconciliation-create-${index}`,
      );
      assert.equal(created.status, 201);
      const transferId = String(created.body["id"]);
      transferIds.push(transferId);
      for (let step = 0; step < 3; step += 1) {
        await advanceScenario(origin, transferId, "happy_path");
      }
    }

    const response = await request(origin, "/api/v1/dev/reconciliation/runs", {
      method: "POST",
      body: { scenario: "reconciliation_amount_mismatch" },
    });
    assert.equal(response.status, 201);
    const items = response.body["items"] as JsonObject[];
    assert.deepEqual(
      items.map((item) => item["classification"]),
      ["amount_mismatch", "matched"],
    );

    for (const item of items) {
      const transfer = await runtime.service.getTransfer(
        DEMO_ACTOR.id,
        String(item["matchKey"]),
      );
      assert.equal(
        transfer.reconciliationState,
        item["classification"] === "matched" ? "MATCHED" : "EXCEPTION",
      );
    }
    assert.equal(new Set(transferIds).size, 2);
  });
});

test("an over-balance transfer returns public INSUFFICIENT_FUNDS without internals", async () => {
  await withServer(demoConfig, new TestDemoRuntime(), async (origin) => {
    const quote = await createQuote(origin, 425_000n);
    const transfer = await createTransfer(
      origin,
      String(quote["id"]),
      "too-large-key-001",
    );
    assert.equal(transfer.status, 409);
    assert.equal(transfer.body["code"], "INSUFFICIENT_FUNDS");
    assert.equal(
      transfer.body["detail"],
      "The selected account does not have enough available demo funds.",
    );
    assert.equal(String(transfer.body["detail"]).includes("demo_usd"), false);
  });
});

test("concurrent commands cannot consume one quote or reserve its funds twice", async () => {
  const runtime = new TestDemoRuntime();
  await withServer(demoConfig, runtime, async (origin) => {
    const quote = await createQuote(origin, 10_000n);
    const responses = await Promise.all([
      createTransfer(origin, String(quote["id"]), "concurrent-create-a"),
      createTransfer(origin, String(quote["id"]), "concurrent-create-b"),
    ]);
    assert.deepEqual(
      responses.map((response) => response.status).sort(),
      [201, 409],
    );
    const conflict = responses.find((response) => response.status === 409);
    assert.equal(conflict?.body["code"], "QUOTE_ALREADY_USED");

    const transfers = await request(origin, "/api/v1/remittance/transfers");
    assert.equal(transfers.status, 200);
    assert.equal((transfers.body["items"] as JsonObject[]).length, 1);
    assert.equal(
      runtime.ledger.repository
        .listHolds(DEMO_LEDGER_ACCOUNT_IDS.customerUsd)
        .filter((hold) => hold.status === "active").length,
      1,
    );
    const account = await getDemoAccount(origin);
    assert.equal(moneyMinor(account["bookBalance"]), "425000");
    assert.equal(moneyMinor(account["availableBalance"]), "414700");
  });
});

test("quote creation rejects a beneficiary and delivery-rail mismatch", async () => {
  await withServer(demoConfig, new TestDemoRuntime(), async (origin) => {
    const response = await request(origin, "/api/v1/remittance/quotes", {
      method: "POST",
      body: {
        sourceAccountId: DEMO_LEDGER_ACCOUNT_IDS.customerUsd,
        beneficiaryId: "beneficiary_bank_001",
        sendAmount: { currency: "USD", minorUnits: "10000" },
        fundingMethod: "samra_balance",
        deliveryMethod: "wallet",
      },
    });
    assert.equal(response.status, 422);
    assert.equal(response.body["code"], "INVALID_ARGUMENT");
  });
});

test("beneficiary CRUD is actor-owned, rail-safe, and soft-deleted", async () => {
  await withServer(demoConfig, new TestDemoRuntime(), async (origin) => {
    const seeded = await request(origin, "/api/v1/beneficiaries");
    assert.equal(seeded.status, 200);
    assert.deepEqual(
      (seeded.body as unknown as JsonObject[]).map((item) => item["id"]),
      ["beneficiary_bank_001", "beneficiary_wallet_001"],
    );
    assert.deepEqual(
      (seeded.body as unknown as JsonObject[]).map(
        (item) => item["displayName"],
      ),
      ["Abebe Bekele", "Tigist Haile"],
    );

    const actorBHeaders = { "x-demo-actor-id": "demo_customer_002" };
    const actorBList = await request(origin, "/api/v1/beneficiaries", {
      headers: actorBHeaders,
    });
    assert.deepEqual(
      (actorBList.body as unknown as JsonObject[]).map((item) => item["id"]),
      ["beneficiary_actor_b_001"],
    );
    for (const method of ["GET", "PATCH", "DELETE"]) {
      const isolated = await request(
        origin,
        "/api/v1/beneficiaries/beneficiary_bank_001",
        {
          method,
          headers: actorBHeaders,
          ...(method === "PATCH" ? { body: { city: "Gondar" } } : {}),
        },
      );
      assert.equal(isolated.status, 404);
      assert.equal(isolated.body["code"], "NOT_FOUND");
    }

    const mixedRail = await request(origin, "/api/v1/beneficiaries", {
      method: "POST",
      body: {
        displayName: "Invalid Recipient",
        city: "Addis Ababa",
        countryCode: "ET",
        deliveryDetails: {
          method: "bank",
          bankId: "cbe",
          accountNumber: "100000001111",
          phoneNumber: "+251911111111",
        },
      },
    });
    assert.equal(mixedRail.status, 422);

    const created = await request(origin, "/api/v1/beneficiaries", {
      method: "POST",
      body: {
        displayName: "New Synthetic Recipient",
        city: "Dire Dawa",
        countryCode: "ET",
        deliveryDetails: {
          method: "wallet",
          walletId: "cbebirr",
          phoneNumber: "+251922221234",
        },
      },
    });
    assert.equal(created.status, 201);
    const createdId = String(created.body["id"]);
    assert.match(createdId, /^beneficiary_[0-9a-f]{32}$/);
    assert.equal(created.body["actorId"], undefined);
    assert.equal(created.body["customerId"], undefined);
    assert.deepEqual(created.body["deliveryDetails"], {
      method: "wallet",
      walletId: "cbebirr",
      institutionName: "CBE Birr",
      phoneNumberLast4: "1234",
    });

    const wrongRailQuote = await request(origin, "/api/v1/remittance/quotes", {
      method: "POST",
      body: {
        sourceAccountId: DEMO_LEDGER_ACCOUNT_IDS.customerUsd,
        beneficiaryId: createdId,
        sendAmount: { currency: "USD", minorUnits: "10000" },
        fundingMethod: "samra_balance",
        deliveryMethod: "bank",
      },
    });
    assert.equal(wrongRailQuote.status, 422);

    const updated = await request(
      origin,
      `/api/v1/beneficiaries/${createdId}`,
      { method: "PATCH", body: { displayName: "Updated Recipient" } },
    );
    assert.equal(updated.status, 200);
    assert.equal(updated.body["displayName"], "Updated Recipient");

    const deleted = await request(
      origin,
      `/api/v1/beneficiaries/${createdId}`,
      { method: "DELETE" },
    );
    assert.equal(deleted.status, 204);
    const afterDelete = await request(
      origin,
      `/api/v1/beneficiaries/${createdId}`,
    );
    assert.equal(afterDelete.status, 404);
  });
});

test("cancel idempotency replays exactly and rejects key reuse for another transfer", async () => {
  await withServer(demoConfig, new TestDemoRuntime(), async (origin) => {
    const firstTransferId = await createTransferForScenario(origin);
    const cancelPath = `/api/v1/remittance/transfers/${firstTransferId}/cancel`;
    const first = await request(origin, cancelPath, {
      method: "POST",
      headers: { "Idempotency-Key": "cancel-key-001" },
    });
    assert.equal(first.status, 200);
    assert.equal(first.body["status"], "cancelled");

    const replay = await request(origin, cancelPath, {
      method: "POST",
      headers: { "Idempotency-Key": "cancel-key-001" },
    });
    assert.equal(replay.status, 200);
    assert.deepEqual(replay.body, first.body);

    const secondQuote = await createQuote(origin, 10_000n);
    const second = await createTransfer(
      origin,
      String(secondQuote["id"]),
      "create-key-002",
    );
    assert.equal(second.status, 201);
    const reused = await request(
      origin,
      `/api/v1/remittance/transfers/${String(second.body["id"])}/cancel`,
      {
        method: "POST",
        headers: { "Idempotency-Key": "cancel-key-001" },
      },
    );
    assert.equal(reused.status, 409);
    assert.equal(reused.body["code"], "CONFLICT");
  });
});

test("Caliza rejection releases the hold and posts no transfer journal", async () => {
  const runtime = new TestDemoRuntime();
  await withServer(demoConfig, runtime, async (origin) => {
    const transferId = await createTransferForScenario(origin);
    const failed = await advanceScenario(
      origin,
      transferId,
      "caliza_rejection",
    );
    assert.equal(failed["status"], "failed");
    const account = await getDemoAccount(origin);
    assert.equal(moneyMinor(account["bookBalance"]), "425000");
    assert.equal(moneyMinor(account["availableBalance"]), "425000");
    assert.deepEqual(
      runtime.ledger.repository
        .listJournals()
        .map((journal) => journal.source.type),
      ["demo_seed"],
    );
  });
});

test("payout failure reverses settlement then capture and restores the customer", async () => {
  const runtime = new TestDemoRuntime();
  await withServer(demoConfig, runtime, async (origin) => {
    const transferId = await createTransferForScenario(origin);
    for (const expected of [
      "in_transit",
      "payout_pending",
      "refund_pending",
      "refunded",
    ]) {
      const transfer = await advanceScenario(
        origin,
        transferId,
        "chapa_failure",
      );
      assert.equal(transfer["status"], expected);
    }
    assertRestoredLedger(runtime, 2, false);
    const account = await getDemoAccount(origin);
    assert.equal(moneyMinor(account["bookBalance"]), "425000");
    assert.equal(moneyMinor(account["availableBalance"]), "425000");
  });
});

test("post-completion settlement refund reverses fee, settlement, then capture", async () => {
  const runtime = new TestDemoRuntime();
  await withServer(demoConfig, runtime, async (origin) => {
    const transferId = await createTransferForScenario(origin);
    for (const expected of [
      "in_transit",
      "payout_pending",
      "completed",
      "refund_pending",
      "refunded",
    ]) {
      const transfer = await advanceScenario(
        origin,
        transferId,
        "settlement_refund",
      );
      assert.equal(transfer["status"], expected);
    }
    assertRestoredLedger(runtime, 3, true);
    const account = await getDemoAccount(origin);
    assert.equal(moneyMinor(account["bookBalance"]), "425000");
    assert.equal(moneyMinor(account["availableBalance"]), "425000");
  });
});

async function createTransferForScenario(origin: string): Promise<string> {
  const quote = await createQuote(origin, 10_000n);
  const transfer = await createTransfer(
    origin,
    String(quote["id"]),
    "scenario-key-001",
  );
  assert.equal(transfer.status, 201);
  return String(transfer.body["id"]);
}

async function createQuote(origin: string, amountMinor: bigint) {
  const response = await request(origin, "/api/v1/remittance/quotes", {
    method: "POST",
    body: {
      sourceAccountId: DEMO_LEDGER_ACCOUNT_IDS.customerUsd,
      beneficiaryId: "beneficiary_bank_001",
      sendAmount: { currency: "USD", minorUnits: amountMinor.toString() },
      fundingMethod: "samra_balance",
      deliveryMethod: "bank",
    },
  });
  assert.equal(response.status, 201);
  return response.body;
}

function createTransfer(
  origin: string,
  quoteId: string,
  idempotencyKey: string,
) {
  return request(origin, "/api/v1/remittance/transfers", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: { quoteId },
  });
}

async function advanceScenario(
  origin: string,
  transferId: string,
  scenario: PublicTransferDemoScenario,
) {
  const response = await request(
    origin,
    `/api/v1/dev/remittance/transfers/${transferId}/scenario`,
    { method: "POST", body: { scenario } },
  );
  assert.equal(response.status, 200);
  return response.body;
}

async function getDemoAccount(origin: string): Promise<JsonObject> {
  const response = await request(origin, "/api/v1/accounts");
  assert.equal(response.status, 200);
  const accounts = response.body as unknown as JsonObject[];
  assert.equal(accounts.length, 1);
  return accounts[0] ?? {};
}

function moneyMinor(value: unknown): unknown {
  return (value as JsonObject)["minorUnits"];
}

function assertRestoredLedger(
  runtime: TestDemoRuntime,
  expectedReversals: number,
  expectFeeRecognition: boolean,
): void {
  const journals = runtime.ledger.repository.listJournals();
  const sourceTypes = journals.map((journal) => journal.source.type);
  assert.equal(
    sourceTypes.filter((source) => source === "remittance_refund_reversal")
      .length,
    expectedReversals,
  );
  assert.equal(
    sourceTypes.includes("remittance_fee_recognition"),
    expectFeeRecognition,
  );
  assert.equal(
    runtime.ledger.repository.getAccountBalance(
      DEMO_LEDGER_ACCOUNT_IDS.customerUsd,
    ).naturalBalanceMinor,
    425_000n,
  );
  assert.equal(
    runtime.ledger.repository.getAccountBalance(
      DEMO_LEDGER_ACCOUNT_IDS.rainControlUsd,
    ).naturalBalanceMinor,
    425_000n,
  );
  assert.equal(
    runtime.ledger.repository.getAccountBalance(
      DEMO_LEDGER_ACCOUNT_IDS.principalClearingUsd,
    ).naturalBalanceMinor,
    0n,
  );
  assert.equal(
    runtime.ledger.repository.getAccountBalance(
      DEMO_LEDGER_ACCOUNT_IDS.deferredFeeUsd,
    ).naturalBalanceMinor,
    0n,
  );
}

async function request(
  origin: string,
  path: string,
  options: Readonly<{
    method?: string;
    headers?: Readonly<Record<string, string>>;
    body?: unknown;
  }> = {},
): Promise<Readonly<{ status: number; body: JsonObject; headers: Headers }>> {
  const response = await fetch(`${origin}${path}`, {
    method: options.method,
    headers: {
      ...(options.body === undefined
        ? {}
        : { "content-type": "application/json" }),
      ...(options.headers ?? {}),
    },
    ...(options.body === undefined
      ? {}
      : { body: JSON.stringify(options.body) }),
  });
  const responseBody = await response.text();
  return {
    status: response.status,
    body: responseBody ? (JSON.parse(responseBody) as JsonObject) : {},
    headers: response.headers,
  };
}

async function withServer(
  config: ApiRuntimeConfig,
  runtime: TestDemoRuntime | undefined,
  run: (origin: string) => Promise<void>,
  dependencies: Parameters<typeof createApp>[2] = {},
): Promise<void> {
  const app = createApp(config, runtime, dependencies);
  const server = await new Promise<Server>((resolve, reject) => {
    const candidate = app.listen(0, "127.0.0.1", (error?: Error) =>
      error ? reject(error) : resolve(candidate),
    );
    candidate.once("error", reject);
  });
  const address = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    const workerTimer = app.locals["demoWorkerTimer"] as
      NodeJS.Timeout | undefined;
    if (workerTimer) {
      clearInterval(workerTimer);
    }
    if (server.listening) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  }
}


test("enabled runtime cannot silently fall back to an in-memory ledger", () => {
  for (const persistenceMode of [undefined, "memory"] as const) {
    assert.throws(() => createApp({ ...demoConfig, persistenceMode }), /requires SAMRA_PERSISTENCE_MODE=postgres/);
  }
});
