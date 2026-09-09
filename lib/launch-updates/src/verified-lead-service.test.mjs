import assert from "node:assert/strict";
import test from "node:test";
import {
  createVerifiedLeadHandler,
  sendNextLeadVerification,
  MARKETING_NOTICE_VERSION,
} from "./verified-lead-service.mjs";
const origin = "https://www.samrapay.com";
const request = (path, body, headers = {}) =>
  new Request(origin + path, {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/json",
      "idempotency-key": "request-command-001",
      ...headers,
    },
    body: JSON.stringify(body),
  });
const input = {
  email: "reader@example.test",
  emailConsent: true,
  adsConsent: false,
  noticeVersion: MARKETING_NOTICE_VERSION,
  locale: "en",
};
test("confirmation GET never verifies; restrictive page requires explicit submission", async () => {
  let calls = 0;
  const handler = createVerifiedLeadHandler({
    store: {
      register: async () => {},
      confirm: async () => {
        calls++;
      },
    },
    allowRequest: async () => true,
  });
  const result = await handler(new Request(origin + "/confirm-email"));
  const html = await result.text();
  assert.equal(calls, 0);
  assert.match(html, /addEventListener\('submit'/);
  assert.match(html, /type="checkbox"/);
  assert.doesNotMatch(html, /checkbox" checked/);
  assert.equal(result.headers.get("referrer-policy"), "no-referrer");
  assert.match(
    result.headers.get("content-security-policy"),
    /default-src 'none'/,
  );
  assert.doesNotMatch(html, /googletagmanager|google-analytics|facebook\.net/);
});
test("registration requires independent explicit choices, known notice and origin", async () => {
  const seen = [];
  const handler = createVerifiedLeadHandler({
    store: { register: async (v) => seen.push(v), confirm: async () => false },
    allowRequest: async () => true,
  });
  assert.equal(
    (await handler(request("/api/v1/marketing-leads", input))).status,
    202,
  );
  assert.equal(seen[0].adsConsent, false);
  assert.equal(
    (
      await handler(
        request("/api/v1/marketing-leads", { ...input, adsConsent: undefined }),
      )
    ).status,
    422,
  );
  assert.equal(
    (
      await handler(
        request("/api/v1/marketing-leads", { ...input, noticeVersion: "old" }),
      )
    ).status,
    422,
  );
  assert.equal(
    (
      await handler(
        request("/api/v1/marketing-leads", input, {
          origin: "https://evil.example",
        }),
      )
    ).status,
    422,
  );
  assert.equal(seen.length, 1);
});
test("confirmation passes the email owner's separate checkbox choice", async () => {
  const seen = [];
  const handler = createVerifiedLeadHandler({
    store: {
      register: async () => {},
      confirm: async (...v) => {
        seen.push(v);
        return true;
      },
    },
    allowRequest: async () => true,
  });
  const r = await handler(
    request("/api/v1/marketing-leads/confirm", {
      token: "synthetic-token",
      adsConsent: false,
    }),
  );
  assert.deepEqual(await r.json(), { confirmed: true });
  assert.deepEqual(seen, [["synthetic-token", false]]);
  assert.equal(
    (await handler(new Request(origin + "/api/v1/marketing-leads/confirm")))
      .status,
    405,
  );
});
test("rate limit, bot trap and body limit prevent store effects", async () => {
  let calls = 0;
  const store = {
    register: async () => {
      calls++;
    },
    confirm: async () => false,
  };
  assert.throws(() => createVerifiedLeadHandler({ store }), /CONFIGURATION/);
  const blocked = createVerifiedLeadHandler({
    store,
    allowRequest: async () => false,
  });
  assert.equal(
    (await blocked(request("/api/v1/marketing-leads", input))).status,
    429,
  );
  const handler = createVerifiedLeadHandler({
    store,
    allowRequest: async () => true,
  });
  assert.equal(
    (
      await handler(
        request("/api/v1/marketing-leads", { ...input, website: "bot" }),
      )
    ).status,
    202,
  );
  assert.equal(
    (
      await handler(
        request("/api/v1/marketing-leads", {
          ...input,
          email: "x".repeat(5000),
        }),
      )
    ).status,
    503,
  );
  assert.equal(calls, 0);
});
test("verification email worker uses stable provider key and fragment token without logging it", async () => {
  const sent = [];
  const message = {
    email: "reader@example.test",
    locale: "en",
    token: "synthetic-token",
    idempotencyKey: "lead-verification-synthetic",
  };
  const store = {
    claimVerificationEmail: async () => ({
      id: "opaque-id",
      leaseId: "opaque-lease",
    }),
    deliverVerificationEmail: async (id, lease, send) => {
      assert.equal(id, "opaque-id");
      await send(message);
      return true;
    },
  };
  const result = await sendNextLeadVerification({
    store,
    transport: { sendConfirmation: async (v) => sent.push(v) },
  });
  assert.deepEqual(result, { processed: true });
  assert.equal(sent[0].idempotencyKey, message.idempotencyKey);
  assert.match(sent[0].text, /\/confirm-email#synthetic-token/);
  assert.equal(sent[0].replyTo, "support@samrapay.com");
  assert.doesNotMatch(JSON.stringify(result), /token|reader/);
});
