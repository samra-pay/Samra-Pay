import assert from "node:assert/strict";
import { test } from "node:test";
import { createResendTransport } from "./resend.mjs";

const TEST_KEY = "unit-test-secret-not-a-real-key";
const EMAIL = "sample+launch@example.com";
const ID = "2d9e473e-9e66-43c2-8c08-375de4c96bf9";
const CONFIRMATION = Object.freeze({
  email: EMAIL,
  from: "Samra Pay <updates@mail.samrapay.com>",
  replyTo: "reply@example.com",
  subject: "Confirm launch updates",
  text: "Confirm your request.\nThis is a synthetic unit test.",
  idempotencyKey: "7d2bb6a3-555a-409c-a242-23ca6a770d19",
});

function setup(body = { id: ID }, status = 200) {
  const requests = [];
  const transport = createResendTransport({
    apiKey: TEST_KEY,
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return Response.json(body, { status });
    },
  });
  return { transport, requests };
}

function safeError(code) {
  return (error) => {
    assert.equal(error.name, "ResendTransportError");
    assert.equal(error.code, code);
    assert.equal(error.message, `Resend transport: ${code}`);
    assert.equal(error.cause, undefined);
    const rendered = `${error.stack} ${JSON.stringify(error)}`;
    for (const value of [TEST_KEY, EMAIL, "upstream-sensitive-body"]) {
      assert.equal(rendered.includes(value), false);
    }
    return true;
  };
}

test("requires server-side configuration and an explicit fetch implementation", () => {
  for (const config of [
    undefined,
    {},
    { apiKey: TEST_KEY },
    { apiKey: "", fetchImpl() {} },
    { apiKey: "  ", fetchImpl() {} },
    { apiKey: "secret\r\nheader", fetchImpl() {} },
    { apiKey: "a".repeat(1025), fetchImpl() {} },
    { apiKey: TEST_KEY, fetchImpl: "fetch" },
  ]) {
    assert.throws(
      () => createResendTransport(config),
      safeError("INVALID_CONFIGURATION"),
    );
  }
  for (const timeoutMs of [0, -1, 30_001, 1.5, NaN, Infinity, "5000"]) {
    assert.throws(
      () =>
        createResendTransport({ apiKey: TEST_KEY, fetchImpl() {}, timeoutMs }),
      safeError("INVALID_CONFIGURATION"),
    );
  }
});

test("browser guard rejects construction and use of an existing transport", async () => {
  const { transport, requests } = setup();
  const prior = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {},
  });
  try {
    assert.throws(
      () => createResendTransport({ apiKey: TEST_KEY, fetchImpl() {} }),
      safeError("SERVER_ONLY"),
    );
    await assert.rejects(
      transport.sendConfirmation(CONFIRMATION),
      safeError("SERVER_ONLY"),
    );
    await assert.rejects(transport.getContact(EMAIL), safeError("SERVER_ONLY"));
    await assert.rejects(
      transport.getSuppression(EMAIL),
      safeError("SERVER_ONLY"),
    );
    assert.equal(requests.length, 0);
  } finally {
    if (prior) Object.defineProperty(globalThis, "window", prior);
    else delete globalThis.window;
  }
});

test("exposes only three bounded operations without subscription mutation", () => {
  assert.deepEqual(Object.keys(setup().transport), [
    "sendConfirmation",
    "getContact",
    "getSuppression",
  ]);
  assert.equal(Object.isFrozen(setup().transport), true);
});

test("sends one plain-text confirmation with a stable caller-owned idempotency key", async () => {
  const { transport, requests } = setup({ id: ID, private_data: "discard" });
  assert.deepEqual(await transport.sendConfirmation(CONFIRMATION), { id: ID });
  assert.deepEqual(await transport.sendConfirmation(CONFIRMATION), { id: ID });
  assert.equal(requests.length, 2);
  for (const { url, options } of requests) {
    assert.equal(url, "https://api.resend.com/emails");
    assert.equal(options.method, "POST");
    assert.equal(options.redirect, "error");
    assert.equal(options.credentials, "omit");
    assert.equal(options.cache, "no-store");
    assert.equal(options.headers.Authorization, `Bearer ${TEST_KEY}`);
    assert.equal(
      options.headers["Idempotency-Key"],
      CONFIRMATION.idempotencyKey,
    );
    assert.equal(options.headers["Content-Type"], "application/json");
    assert.deepEqual(JSON.parse(options.body), {
      from: CONFIRMATION.from,
      to: [EMAIL],
      reply_to: CONFIRMATION.replyTo,
      subject: CONFIRMATION.subject,
      text: CONFIRMATION.text,
    });
  }
  assert.equal(requests[0].options.body, requests[1].options.body);
});

test("supports the exact raw sender and normalizes recipient and reply-to emails", async () => {
  const { transport, requests } = setup();
  await transport.sendConfirmation({
    ...CONFIRMATION,
    from: "updates@mail.samrapay.com",
    email: " Sample+Launch@Example.COM ",
    replyTo: " Reply@Example.COM ",
  });
  assert.equal(JSON.parse(requests[0].options.body).to[0], EMAIL);
  assert.equal(
    JSON.parse(requests[0].options.body).reply_to,
    "reply@example.com",
  );
});

test("rejects malformed confirmation fields without a request or sensitive error", async () => {
  const { transport, requests } = setup();
  const cases = [
    ["email", "bad"],
    ["email", "a@example.com\nBcc:x@example.com"],
    ["email", "a..b@example.com"],
    ["email", "a@-example.com"],
    ["email", "a@localhost"],
    ["email", "a".repeat(65) + "@example.com"],
    ["email", "a@" + "a".repeat(64) + ".com"],
    ["email", "a@example.com/path"],
    ["email", [EMAIL]],
    ["replyTo", undefined],
    ["replyTo", "Support <reply@example.com>"],
    ["from", "updates@samrapay.com"],
    ["from", "Other <updates@mail.samrapay.com>"],
    ["from", "Samra Pay <updates@mail.samrapay.com>\r\nBcc:x@example.com"],
    ["subject", "\nBad"],
    ["subject", ""],
    ["subject", "a".repeat(161)],
    ["subject", "hello\u2028there"],
    ["text", "   "],
    ["text", "bad\u0000body"],
    ["text", "a".repeat(12001)],
    ["idempotencyKey", EMAIL],
    ["idempotencyKey", "short"],
    ["idempotencyKey", "x".repeat(257)],
    ["idempotencyKey", "bad\nheader012345"],
  ];
  for (const [field, value] of cases) {
    await assert.rejects(
      transport.sendConfirmation({ ...CONFIRMATION, [field]: value }),
      safeError("INVALID_REQUEST"),
    );
  }
  await assert.rejects(
    transport.sendConfirmation(),
    safeError("INVALID_REQUEST"),
  );
  assert.equal(requests.length, 0);
});

test("retrieves a contact by encoded normalized email and returns minimal fields", async () => {
  const { transport, requests } = setup({
    object: "contact",
    id: ID,
    email: EMAIL,
    unsubscribed: true,
    first_name: "Do not return",
    properties: { sensitive: "discard" },
  });
  assert.deepEqual(await transport.getContact(" Sample+Launch@Example.COM "), {
    id: ID,
    unsubscribed: true,
  });
  assert.equal(
    requests[0].url,
    "https://api.resend.com/contacts/sample%2Blaunch%40example.com",
  );
  assert.equal(requests[0].options.method, "GET");
  assert.equal(requests[0].options.body, undefined);
  assert.equal(requests[0].options.headers["Idempotency-Key"], undefined);
});

test("retrieves each documented suppression origin without changing suppression", async () => {
  for (const origin of ["bounce", "complaint", "manual"]) {
    const { transport, requests } = setup({
      object: "suppression",
      id: ID,
      email: EMAIL,
      origin,
      source_id: null,
    });
    assert.deepEqual(await transport.getSuppression(EMAIL), { id: ID, origin });
    assert.equal(
      requests[0].url,
      "https://api.resend.com/suppressions/sample%2Blaunch%40example.com",
    );
    assert.equal(requests[0].options.method, "GET");
  }
});

test("only lookup 404s return null; a send 404 fails", async () => {
  const { transport } = setup({ message: "upstream-sensitive-body" }, 404);
  assert.equal(await transport.getContact(EMAIL), null);
  assert.equal(await transport.getSuppression(EMAIL), null);
  await assert.rejects(
    transport.sendConfirmation(CONFIRMATION),
    safeError("REQUEST_REJECTED"),
  );
});

test("fails closed on provider errors without retrying or exposing the response body", async () => {
  for (const [status, code] of [
    [400, "REQUEST_REJECTED"],
    [401, "AUTHORIZATION_FAILED"],
    [403, "AUTHORIZATION_FAILED"],
    [429, "RATE_LIMITED"],
    [500, "PROVIDER_UNAVAILABLE"],
    [503, "PROVIDER_UNAVAILABLE"],
  ]) {
    for (const operation of [
      "sendConfirmation",
      "getContact",
      "getSuppression",
    ]) {
      const { transport, requests } = setup(
        { message: `upstream-sensitive-body ${TEST_KEY} ${EMAIL}` },
        status,
      );
      await assert.rejects(
        transport[operation](
          operation === "sendConfirmation" ? CONFIRMATION : EMAIL,
        ),
        safeError(code),
      );
      assert.equal(requests.length, 1);
    }
  }
});

test("rejects redirect status, followed redirects, and mismatched response URLs", async () => {
  const fixtures = [
    [
      Response.json(
        {},
        { status: 302, headers: { Location: "https://example.com" } },
      ),
      "REDIRECT_REJECTED",
    ],
    [{ status: 200, redirected: true }, "REDIRECT_REJECTED"],
    [{ status: 200, type: "opaqueredirect" }, "REDIRECT_REJECTED"],
    [{ status: 200, url: "https://example.com" }, "INVALID_RESPONSE"],
  ];
  for (const [response, code] of fixtures) {
    const transport = createResendTransport({
      apiKey: TEST_KEY,
      fetchImpl: async () => response,
    });
    await assert.rejects(transport.getContact(EMAIL), safeError(code));
  }
});

test("validates success envelopes and never treats malformed lookup data as absence", async () => {
  for (const body of [null, [], {}, { id: EMAIL }, { id: "" }, { id: 2 }]) {
    await assert.rejects(
      setup(body).transport.sendConfirmation(CONFIRMATION),
      safeError("INVALID_RESPONSE"),
    );
  }
  for (const body of [
    null,
    {},
    [],
    { object: "wrong", id: ID, email: EMAIL, unsubscribed: false },
    {
      object: "contact",
      id: ID,
      email: "different@example.com",
      unsubscribed: false,
    },
    { object: "contact", id: ID, email: EMAIL, unsubscribed: "false" },
    { object: "contact", id: EMAIL, email: EMAIL, unsubscribed: false },
  ]) {
    await assert.rejects(
      setup(body).transport.getContact(EMAIL),
      safeError("INVALID_RESPONSE"),
    );
  }
  for (const body of [
    null,
    {},
    [],
    { object: "wrong", id: ID, email: EMAIL, origin: "bounce" },
    {
      object: "suppression",
      id: ID,
      email: "different@example.com",
      origin: "bounce",
    },
    { object: "suppression", id: ID, email: EMAIL, origin: "unknown" },
    { object: "suppression", id: "not-an-id", email: EMAIL, origin: "manual" },
  ]) {
    await assert.rejects(
      setup(body).transport.getSuppression(EMAIL),
      safeError("INVALID_RESPONSE"),
    );
  }
});

test("rejects invalid JSON, oversized bodies, invalid UTF-8, and incorrect content types", async () => {
  const responses = [
    new Response("upstream-sensitive-body", {
      headers: { "Content-Type": "application/json" },
    }),
    Response.json({ id: ID, tooMuch: "x".repeat(17000) }),
    Response.json({ id: ID }, { headers: { "Content-Length": "17000" } }),
    Response.json({ id: ID }, { headers: { "Content-Length": "bad" } }),
    new Response(new Uint8Array([0xff]), {
      headers: { "Content-Type": "application/json" },
    }),
    new Response(JSON.stringify({ id: ID }), {
      headers: { "Content-Type": "text/html" },
    }),
    { status: "200" },
  ];
  for (const response of responses) {
    const transport = createResendTransport({
      apiKey: TEST_KEY,
      fetchImpl: async () => response,
    });
    await assert.rejects(
      transport.sendConfirmation(CONFIRMATION),
      safeError("INVALID_RESPONSE"),
    );
  }
});

test("sanitizes thrown fetch and JSON stream errors", async () => {
  const upstream = new Error(`upstream-sensitive-body ${EMAIL} ${TEST_KEY}`);
  const transport = createResendTransport({
    apiKey: TEST_KEY,
    fetchImpl: async () => {
      throw upstream;
    },
  });
  await assert.rejects(
    transport.getContact(EMAIL),
    safeError("REQUEST_FAILED"),
  );
  const failingStream = new ReadableStream({
    start(controller) {
      controller.error(upstream);
    },
  });
  const bodyTransport = createResendTransport({
    apiKey: TEST_KEY,
    fetchImpl: async () =>
      new Response(failingStream, {
        headers: { "Content-Type": "application/json" },
      }),
  });
  await assert.rejects(
    bodyTransport.getContact(EMAIL),
    safeError("INVALID_RESPONSE"),
  );
});

test("bounds the entire request even if fetch ignores abort", async () => {
  let signal;
  const transport = createResendTransport({
    apiKey: TEST_KEY,
    timeoutMs: 10,
    fetchImpl: async (_, options) => {
      signal = options.signal;
      return await new Promise(() => {});
    },
  });
  await assert.rejects(
    transport.getContact(EMAIL),
    safeError("REQUEST_TIMEOUT"),
  );
  assert.equal(signal.aborted, true);
});

test("deadline also bounds a stalled response stream", async () => {
  let signal;
  let cancelled = false;
  const transport = createResendTransport({
    apiKey: TEST_KEY,
    timeoutMs: 10,
    fetchImpl: async (_, options) => {
      signal = options.signal;
      return new Response(
        new ReadableStream({
          cancel() {
            cancelled = true;
          },
        }),
        {
          headers: { "Content-Type": "application/json" },
        },
      );
    },
  });
  await assert.rejects(
    transport.getSuppression(EMAIL),
    safeError("REQUEST_TIMEOUT"),
  );
  assert.equal(signal.aborted, true);
  assert.equal(cancelled, true);
});
