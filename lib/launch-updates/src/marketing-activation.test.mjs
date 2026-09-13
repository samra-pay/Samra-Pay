import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes, randomUUID } from "node:crypto";
import { Webhook } from "svix";
import { createPreferenceTokens } from "./preference-tokens.mjs";
import {
  createPreferenceHandler,
  preferencePage,
} from "./marketing-preferences.mjs";
import { createMarketingWebhook } from "./marketing-webhook.mjs";
import {
  createGoogleAudienceAdapter,
  createMetaAudienceAdapter,
  audienceEmailHash,
} from "./audience-providers.mjs";
import {
  loadMarketingRuntime,
  createMarketingApplication,
} from "./marketing-runtime.mjs";
const origin = "https://www.samrapay.com";
const request = (path, body, headers = {}) =>
  new Request(origin + path, {
    method: "POST",
    headers: { origin, "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
const fixture = () =>
  createPreferenceTokens({
    keys: { v1: randomBytes(32) },
    activeVersion: "v1",
  });
test("preference capabilities reject tampering, expiry and other key versions", () => {
  const key = randomBytes(32),
    now = Date.now(),
    id = randomUUID();
  const tokens = createPreferenceTokens({
    keys: { v1: key },
    activeVersion: "v1",
    now: () => now,
  });
  const token = tokens.issue(id);
  assert.equal(tokens.verify(token), id);
  assert.equal(tokens.verify(token + "x"), null);
  assert.equal(fixture().verify(token), null);
  assert.equal(
    createPreferenceTokens({
      keys: { v1: key },
      activeVersion: "v1",
      now: () => now + 181 * 86400000,
    }).verify(token),
    null,
  );
});
test("preferences are explicit POST-only, independent, repeatable withdrawals", async () => {
  const tokens = fixture(),
    id = randomUUID(),
    token = tokens.issue(id),
    calls = [];
  const handle = createPreferenceHandler({
    tokens,
    leads: {
      withdraw: async (...a) => calls.push(["all", ...a]),
      withdrawAdvertising: async (...a) => calls.push(["ads", ...a]),
    },
  });
  assert.equal(
    (await handle(new Request(origin + "/api/v1/marketing-leads/preferences")))
      .status,
    405,
  );
  assert.equal(
    (
      await handle(
        request("/api/v1/marketing-leads/preferences", {
          token,
          scope: "grant",
        }),
      )
    ).status,
    422,
  );
  assert.equal(
    (
      await handle(
        request(
          "/api/v1/marketing-leads/preferences",
          { token, scope: "ads" },
          { origin: "https://attacker.test" },
        ),
      )
    ).status,
    422,
  );
  for (const scope of ["ads", "ads", "all"])
    assert.equal(
      (
        await handle(
          request("/api/v1/marketing-leads/preferences", { token, scope }),
        )
      ).status,
      200,
    );
  assert.deepEqual(
    calls.map((c) => c[0]),
    ["ads", "ads", "all"],
  );
  assert.notEqual(calls[0][2], calls[1][2]);
  const page = preferencePage();
  assert.match(
    page.headers.get("content-security-policy"),
    /default-src 'none'/,
  );
  assert.equal(page.headers.get("referrer-policy"), "no-referrer");
  assert.match(await page.text(), /addEventListener\('submit'/);
});
test("Resend verifies raw-body signatures and timestamp, preserving no raw payload", async () => {
  const secret = "whsec_" + randomBytes(32).toString("base64"),
    signer = new Webhook(secret),
    calls = [];
  const handle = createMarketingWebhook({
    secret,
    store: { providerEvent: async (e) => calls.push(e) },
  });
  const payload = JSON.stringify({
      type: "email.complained",
      data: { to: ["reader@example.test"], subject: "private subject" },
    }),
    id = "msg_synthetic_event_001";
  const req = (raw = payload, date = new Date()) =>
    new Request(origin + "/api/v1/marketing-leads/resend-webhook", {
      method: "POST",
      headers: {
        "svix-id": id,
        "svix-timestamp": String(Math.floor(date.getTime() / 1000)),
        "svix-signature": signer.sign(id, date, payload),
      },
      body: raw,
    });
  assert.equal((await handle(req(payload + " "))).status, 400);
  assert.equal(
    (await handle(req(payload, new Date(Date.now() - 600000)))).status,
    400,
  );
  assert.equal((await handle(req())).status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].reason, "complained");
  assert.equal(JSON.stringify(calls).includes("private subject"), false);
  assert.match(calls[0].payloadHash, /^[a-f0-9]{64}$/);
});
test("Google sends hashed permissioned members and waits for destination completion", async () => {
  const calls = [];
  let status = "PROCESSING";
  const destination = {
    operatingAccount: { accountType: "GOOGLE_ADS", accountId: "1234567890" },
    productDestinationId: "123456",
  };
  const adapter = createGoogleAudienceAdapter({
    accountId: "1234567890",
    audienceId: "123456",
    termsAccepted: true,
    accessToken: async () => "synthetic-token",
    fetchImpl: async (url, init) => {
      calls.push({ url, ...init });
      return Response.json(
        url.includes("requestStatus")
          ? {
              requestStatusPerDestination: [
                { destination, requestStatus: status },
              ],
            }
          : { requestId: "request-001" },
      );
    },
  });
  assert.deepEqual(
    await adapter.submit({ email: "reader@example.test", member: true }),
    { state: "pending", requestId: "request-001" },
  );
  const body = JSON.parse(calls[0].body);
  assert.equal(body.consent.adUserData, "CONSENT_GRANTED");
  assert.equal(calls[0].body.includes("reader@"), false);
  assert.equal(body.audienceMembers.length, 1);
  assert.equal(await adapter.status("request-001"), "pending");
  status = "SUCCESS";
  assert.equal(await adapter.status("request-001"), "accepted");
  status = "PARTIAL_SUCCESS";
  assert.equal(await adapter.status("request-001"), "blocked");
  await adapter.submit({ email: "reader@example.test", member: false });
  assert.match(calls.at(-1).url, /audienceMembers:remove$/);
  assert.equal(JSON.parse(calls.at(-1).body).consent, undefined);
  assert.equal(
    audienceEmailHash("A.B@gmail.com", "google"),
    audienceEmailHash("ab@gmail.com", "google"),
  );
});
test("Meta uses fixed endpoint, hashed email and rejects partial acceptance", async () => {
  let invalid = 0;
  const calls = [];
  const adapter = createMetaAudienceAdapter({
    audienceId: "12345678",
    apiVersion: "v25.0",
    termsAccepted: true,
    accessToken: async () => "synthetic-token",
    fetchImpl: async (url, init) => {
      calls.push({ url, ...init });
      return Response.json({
        audience_id: "12345678",
        num_received: 1,
        num_invalid_entries: invalid,
        session_id: "session-1",
      });
    },
  });
  assert.equal(
    (await adapter.submit({ email: "reader@example.test", member: true }))
      .state,
    "accepted",
  );
  assert.equal(calls[0].body.includes("reader@"), false);
  assert.equal(calls[0].redirect, "error");
  await adapter.submit({ email: "reader@example.test", member: false });
  assert.equal(calls[1].method, "DELETE");
  invalid = 1;
  await assert.rejects(
    adapter.submit({ email: "reader@example.test", member: true }),
    /UNCERTAIN/,
  );
});
test("runtime is disabled without explicit configuration and exposes no public worker/metrics", async () => {
  await assert.rejects(
    loadMarketingRuntime({ env: {} }),
    /CONFIGURATION_REQUIRED/,
  );
  const app = createMarketingApplication({
    leads: { register: async () => {}, confirm: async () => false },
    activation: { allowRequest: async () => true },
    preferenceTokens: fixture(),
    webhookSecret: "whsec_" + randomBytes(32).toString("base64"),
    emailTransport: {},
  });
  for (const path of ["/metrics", "/worker", "/api/v1/accounts"])
    assert.equal((await app.handle(new Request(origin + path))).status, 404);
  assert.equal(
    (await app.handle(new Request("https://attacker.test/confirm-email")))
      .status,
    404,
  );
});

test("Resend contact sync honors existing unsubscribe and only adds verified segment", async () => {
  const { createResendContactAdapter } =
    await import("./resend-contact-sync.mjs");
  let unsubscribed = false;
  const calls = [];
  const adapter = createResendContactAdapter({
    segmentId: randomUUID(),
    topicId: randomUUID(),
    suppression: { getSuppression: async () => null },
    transport: {
      getContact: async () => ({ id: "contact-1", unsubscribed }),
      addContactToSegment: async () => calls.push("segment"),
      optContactIntoTopic: async () => calls.push("topic"),
      unsubscribeContact: async () => calls.push("unsubscribe"),
    },
  });
  assert.equal(
    (await adapter.submit({ email: "reader@example.test", member: true }))
      .state,
    "accepted",
  );
  assert.deepEqual(calls, ["segment", "topic"]);
  await adapter.submit({ email: "reader@example.test", member: false });
  assert.equal(calls.at(-1), "unsubscribe");
  unsubscribed = true;
  assert.equal(
    (await adapter.submit({ email: "reader@example.test", member: true }))
      .state,
    "suppressed",
  );
  assert.equal(calls.length, 3);
});
test("Google token refresh is shared, cached and renewed without exposing credentials", async () => {
  const { createGoogleMarketingToken } =
    await import("./google-marketing-token.mjs");
  let time = 1000,
    calls = 0;
  const token = createGoogleMarketingToken({
    clientId: "synthetic-client",
    clientSecret: "synthetic-secret",
    refreshToken: "synthetic-refresh",
    now: () => time,
    fetchImpl: async () => {
      calls++;
      return Response.json({
        access_token: "synthetic-access",
        token_type: "Bearer",
        expires_in: 3600,
      });
    },
  });
  assert.deepEqual(await Promise.all([token(), token()]), [
    "synthetic-access",
    "synthetic-access",
  ]);
  assert.equal(calls, 1);
  await token();
  assert.equal(calls, 1);
  time += 3600000;
  await token();
  assert.equal(calls, 2);
});
