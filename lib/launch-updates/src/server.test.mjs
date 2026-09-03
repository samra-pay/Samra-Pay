import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createLaunchUpdatesConnectionTest,
  launchUpdatesIdentity,
} from "./server.mjs";

const start = Date.parse("2026-09-03T12:00:00.000Z");
function config(overrides = {}) {
  return {
    SAMRA_LAUNCH_UPDATES_MODE: "test",
    SAMRA_LAUNCH_UPDATES_TEST_RECIPIENT: "owner@example.com",
    SAMRA_LAUNCH_UPDATES_TEST_APPROVAL_ID: "synthetic-test-0001",
    SAMRA_LAUNCH_UPDATES_TEST_EXPIRES_AT: "2026-09-03T12:30:00.000Z",
    SAMRA_RESEND_SECRET_VERSION: "1",
    RESEND_API_KEY: "re_synthetic_test_fixture_not_a_credential",
    ...overrides,
  };
}
function harness(overrides = {}, responder) {
  const calls = [];
  const client = createLaunchUpdatesConnectionTest({
    env: config(overrides),
    now: () => start,
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      if (responder) return responder(url, options);
      if (options.method === "GET") return new Response("{}", { status: 404 });
      return Response.json({ id: "557934fe-0b4c-4b48-b71c-e929d9dab974" });
    },
  });
  return { client, calls };
}

test("disabled by default without accessing a key or network", async () => {
  const env = Object.defineProperty({}, "RESEND_API_KEY", {
    get() {
      throw new Error("must not read secrets in disabled mode");
    },
  });
  const client = createLaunchUpdatesConnectionTest({ env });
  assert.equal(client.enabled, false);
  await assert.rejects(client.sendConnectionTest(), /LAUNCH_UPDATES_DISABLED/u);
});

test("fixed production identity; secret payload and recipient are never returned", async () => {
  const { client, calls } = harness();
  assert.equal(
    calls.length,
    0,
    "constructing the adapter does not call Resend",
  );
  assert.deepEqual(launchUpdatesIdentity, {
    projectId: "samra-pay-production",
    secretId: "samra-production-resend-api-key",
    from: "Samra Pay <updates@mail.samrapay.com>",
    replyTo: "support@samrapay.com",
  });
  assert.doesNotMatch(JSON.stringify(client), /re_synthetic|owner@example/u);
  assert.equal(Object.isFrozen(client.metadata), true);
});

test("one approved recipient, fixed content, and repeated calls share one send", async () => {
  const { client, calls } = harness();
  const results = await Promise.all([
    client.sendConnectionTest(),
    client.sendConnectionTest(),
  ]);
  assert.deepEqual(results[0], results[1]);
  const sends = calls.filter(({ options }) => options.method === "POST");
  assert.equal(sends.length, 1);
  const body = JSON.parse(sends[0].options.body);
  assert.deepEqual(body.to, ["owner@example.com"]);
  assert.equal(body.from, launchUpdatesIdentity.from);
  assert.equal(body.reply_to, launchUpdatesIdentity.replyTo);
  assert.equal(body.subject, "Samra Pay email connection test");
  assert.match(body.text, /No launch-updates subscription has been created/u);
  assert.doesNotMatch(
    body.text,
    /https?:\/\//u,
    "no broken future confirmation link",
  );
  const headers = new Headers(sends[0].options.headers);
  assert.equal(
    headers.get("Idempotency-Key"),
    "samra-launch-updates-test-synthetic-test-0001",
  );
  assert.doesNotMatch(headers.get("Idempotency-Key"), /owner|@/u);
});

for (const [field, value] of [
  ["SAMRA_LAUNCH_UPDATES_MODE", "live"],
  ["SAMRA_LAUNCH_UPDATES_MODE", "production"],
  ["SAMRA_LAUNCH_UPDATES_TEST_RECIPIENT", ""],
  ["SAMRA_LAUNCH_UPDATES_TEST_RECIPIENT", "a@example.com,b@example.com"],
  [
    "SAMRA_LAUNCH_UPDATES_TEST_RECIPIENT",
    "a@example.com\r\nBcc: b@example.com",
  ],
  ["SAMRA_LAUNCH_UPDATES_TEST_APPROVAL_ID", "owner@example.com"],
  ["SAMRA_LAUNCH_UPDATES_TEST_APPROVAL_ID", ""],
  ["SAMRA_RESEND_SECRET_VERSION", "latest"],
  ["SAMRA_RESEND_SECRET_VERSION", "0"],
  ["SAMRA_RESEND_SECRET_VERSION", "01"],
  ["RESEND_API_KEY", ""],
  ["SAMRA_LAUNCH_UPDATES_TEST_EXPIRES_AT", "2026-09-03T11:00:00.000Z"],
  ["SAMRA_LAUNCH_UPDATES_TEST_EXPIRES_AT", "2026-09-03T14:00:00.000Z"],
  ["SAMRA_LAUNCH_UPDATES_TEST_EXPIRES_AT", "not-a-date"],
  ["VITE_RESEND_API_KEY", "accidentally-public"],
  ["NEXT_PUBLIC_RESEND_API_KEY", "accidentally-public"],
]) {
  test(`rejects invalid or unsafe configuration: ${field} / ${JSON.stringify(value)}`, () => {
    assert.throws(() => harness({ [field]: value }), {
      message: "LAUNCH_UPDATES_TEST_CONFIGURATION_INVALID",
    });
  });
}

test("requires explicit network injection and refuses browser use", () => {
  assert.throws(
    () =>
      createLaunchUpdatesConnectionTest({ env: config(), now: () => start }),
    /CONFIGURATION_INVALID/u,
  );
  Object.defineProperty(globalThis, "window", {
    value: {},
    configurable: true,
  });
  try {
    assert.throws(
      () => createLaunchUpdatesConnectionTest(),
      /CONFIGURATION_INVALID/u,
    );
  } finally {
    delete globalThis.window;
  }
});

test("expired approval prevents even the first network call", async () => {
  let timestamp = start;
  let called = false;
  const client = createLaunchUpdatesConnectionTest({
    env: config(),
    now: () => timestamp,
    fetchImpl: async () => {
      called = true;
      throw new Error("not expected");
    },
  });
  timestamp += 31 * 60 * 1000;
  await assert.rejects(client.sendConnectionTest(), /APPROVAL_EXPIRED/u);
  assert.equal(called, false);
});

for (const invalidTime of [NaN, start - 1, start + 31 * 60 * 1000]) {
  for (const invalidAfter of [1, 2]) {
    test(`rechecks approval after lookup ${invalidAfter} when clock becomes ${String(invalidTime)}`, async () => {
      let timestamp = start;
      const calls = [];
      const client = createLaunchUpdatesConnectionTest({
        env: config(),
        now: () => timestamp,
        fetchImpl: async (_url, options) => {
          calls.push(options.method);
          if (calls.length === invalidAfter) timestamp = invalidTime;
          return new Response("{}", { status: 404 });
        },
      });
      await assert.rejects(client.sendConnectionTest(), /APPROVAL_EXPIRED/u);
      assert.deepEqual(calls, Array(invalidAfter).fill("GET"));
    });
  }
}

test("refuses a suppressed recipient without removing suppression or sending", async () => {
  const { client, calls } = harness({}, (url) =>
    String(url).includes("/suppressions/")
      ? Response.json({
          object: "suppression",
          id: "d5a220b7-6126-47d6-912d-922539eecfcb",
          email: "owner@example.com",
          origin: "complaint",
        })
      : new Response("{}", { status: 404 }),
  );
  await assert.rejects(client.sendConnectionTest(), /RECIPIENT_UNAVAILABLE/u);
  assert.equal(
    calls.every(({ options }) => options.method === "GET"),
    true,
  );
});

test("refuses a globally unsubscribed contact without reactivation", async () => {
  const { client, calls } = harness({}, (url) =>
    String(url).includes("/contacts/")
      ? Response.json({
          object: "contact",
          id: "363a98a9-2b22-40ed-8ce0-0d872227d6f3",
          email: "owner@example.com",
          unsubscribed: true,
        })
      : new Response("{}", { status: 404 }),
  );
  await assert.rejects(client.sendConnectionTest(), /RECIPIENT_UNAVAILABLE/u);
  assert.equal(
    calls.every(({ options }) => options.method === "GET"),
    true,
  );
});

test("uncertain upstream result remains a failure and cannot cause an automatic retry", async () => {
  const { client, calls } = harness(
    {},
    () => new Response("sensitive upstream detail", { status: 500 }),
  );
  await assert.rejects(
    client.sendConnectionTest(),
    (error) => !String(error).includes("sensitive upstream"),
  );
  const count = calls.length;
  await assert.rejects(client.sendConnectionTest());
  assert.equal(calls.length, count);
});
