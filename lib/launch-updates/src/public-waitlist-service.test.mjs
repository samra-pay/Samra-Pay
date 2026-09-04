import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createPublicWaitlistService,
  publicWaitlistContract,
} from "./public-waitlist-service.mjs";

const CONTACT_ID = "2d9e473e-9e66-43c2-8c08-375de4c96bf9";
const SEGMENT_ID = "3302de0a-0f51-4c3e-9f4e-f26ebf95f412";
const TOPIC_ID = "244e46ec-7cda-4cf2-8e6e-1e13093125ab";
const EMAIL = "reader@example.com";
const NOW = Date.parse("2026-09-04T20:00:00.000Z");
const env = Object.freeze({
  SAMRA_LAUNCH_UPDATES_MODE: "waitlist",
  SAMRA_CLOUD_PROJECT_ID: "samra-pay-production",
  K_SERVICE: "samra-launch-updates",
  SAMRA_RESEND_SECRET_VERSION: "1",
  SAMRA_RESEND_SEGMENT_ID: SEGMENT_ID,
  SAMRA_RESEND_TOPIC_ID: TOPIC_ID,
  RESEND_API_KEY: "re_unit_test_not_a_real_key_123456",
});

function request(body, overrides = {}) {
  return new Request(
    overrides.url ?? "https://www.samrapay.com/api/v1/waitlist/subscriptions",
    {
      method: overrides.method ?? "POST",
      headers: {
        Origin: overrides.origin ?? "https://www.samrapay.com",
        "Content-Type": overrides.contentType ?? "application/json",
        "Idempotency-Key": overrides.idempotencyKey ?? "waitlist-test-001",
        ...(overrides.headers ?? {}),
      },
      body: overrides.method === "GET" ? undefined : JSON.stringify(body),
    },
  );
}

function validBody(overrides = {}) {
  return {
    email: EMAIL,
    consent: true,
    consentVersion: publicWaitlistContract.consentVersion,
    locale: "en",
    website: "",
    ...overrides,
  };
}

function setup(responses = []) {
  const requests = [];
  const queue = [...responses];
  const service = createPublicWaitlistService({
    env,
    now: () => NOW,
    providerMinimumIntervalMs: 0,
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      const response = queue.shift();
      assert.ok(response, "unexpected provider request");
      return response;
    },
  });
  return { service, requests };
}

function contact(unsubscribed = false) {
  return Response.json({
    object: "contact",
    id: CONTACT_ID,
    email: EMAIL,
    unsubscribed,
  });
}

test("rejects disabled or mismatched runtime configuration before serving", () => {
  for (const patch of [
    { SAMRA_LAUNCH_UPDATES_MODE: "disabled" },
    { SAMRA_CLOUD_PROJECT_ID: "other" },
    { K_SERVICE: "other" },
    { SAMRA_RESEND_SECRET_VERSION: "latest" },
    { SAMRA_RESEND_SEGMENT_ID: "bad" },
    { SAMRA_RESEND_TOPIC_ID: "bad" },
    { RESEND_API_KEY: "bad" },
  ]) {
    assert.throws(
      () =>
        createPublicWaitlistService({
          env: { ...env, ...patch },
          fetchImpl() {},
        }),
      /PUBLIC_WAITLIST_CONFIGURATION_INVALID/u,
    );
  }
});

test("reports health without contacting Resend", async () => {
  const { service, requests } = setup();
  const response = await service.handle(
    new Request("https://samra-pay-production.web.app/healthz"),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok" });
  assert.equal(requests.length, 0);
});

test("creates a new Resend contact and returns no address or provider id", async () => {
  const { service, requests } = setup([
    new Response(null, { status: 404 }),
    Response.json({ object: "contact", id: CONTACT_ID }, { status: 201 }),
  ]);
  const response = await service.handle(request(validBody()));
  assert.equal(response.status, 202);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), {
    accepted: true,
    acceptedAt: "2026-09-04T20:00:00.000Z",
  });
  assert.equal(requests.length, 2);
  assert.deepEqual(JSON.parse(requests[1].options.body), {
    email: EMAIL,
    unsubscribed: false,
    segments: [{ id: SEGMENT_ID }],
    topics: [{ id: TOPIC_ID, subscription: "opt_in" }],
  });
});

test("adds an existing subscribed contact to the waitlist segment and topic", async () => {
  const { service, requests } = setup([
    contact(false),
    Response.json({ id: SEGMENT_ID }),
    Response.json({ id: CONTACT_ID }),
  ]);
  const response = await service.handle(request(validBody()));
  assert.equal(response.status, 202);
  assert.equal(requests.length, 3);
  assert.equal(requests[1].options.method, "POST");
  assert.equal(
    requests[1].url,
    `https://api.resend.com/contacts/${CONTACT_ID}/segments/${SEGMENT_ID}`,
  );
  assert.equal(requests[2].options.method, "PATCH");
  assert.equal(
    requests[2].url,
    `https://api.resend.com/contacts/${CONTACT_ID}/topics`,
  );
});

test("accepts an existing globally unsubscribed contact without mutation", async () => {
  const { service, requests } = setup([contact(true)]);
  const response = await service.handle(request(validBody()));
  assert.equal(response.status, 202);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].options.method, "GET");
});

test("silently accepts the honeypot without contacting Resend", async () => {
  const { service, requests } = setup();
  const response = await service.handle(
    request(validBody({ website: "https://bot.example" })),
  );
  assert.equal(response.status, 202);
  assert.equal(requests.length, 0);
});

test("rejects untrusted origins, invalid consent, extra data, and malformed headers", async () => {
  const cases = [
    request(validBody(), { origin: "https://attacker.example" }),
    request(validBody({ consent: false })),
    request({ ...validBody(), campaign: "secret" }),
    request(validBody(), { contentType: "text/plain" }),
    request(validBody(), { idempotencyKey: "short" }),
  ];
  const { service, requests } = setup();
  for (const candidate of cases) {
    const response = await service.handle(candidate);
    assert.equal(response.status, 422);
    assert.deepEqual(await response.json(), {
      accepted: false,
      code: "INVALID_REQUEST",
    });
  }
  assert.equal(requests.length, 0);
});

test("maps provider failure to a sanitized unavailable response", async () => {
  const { service } = setup([
    Response.json({ message: `${EMAIL} private` }, { status: 500 }),
  ]);
  const response = await service.handle(request(validBody()));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    accepted: false,
    code: "WAITLIST_UNAVAILABLE",
  });
});
