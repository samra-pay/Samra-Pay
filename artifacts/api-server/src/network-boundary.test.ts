import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import test, { type TestContext } from "node:test";
import { createApp } from "./app";
import { loadApiRuntimeConfig } from "./config";
import { TestDemoRuntime } from "../test/fixtures/demo-runtime";

async function listen(t: TestContext, server: Server) {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(
    () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  );
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

test("CORS denies unknown origins, permits exact origins and preflight, and preserves native calls", async (t) => {
  const origin = await listen(
    t,
    createServer(
      createApp(
        loadApiRuntimeConfig({
          SAMRA_ALLOWED_ORIGINS: "https://app.samra.test",
        }),
      ),
    ),
  );
  for (const untrusted of [
    "https://other.samra.test",
    "https://app.samra.test.attacker.test",
    "null",
  ]) {
    const response = await fetch(`${origin}/api/healthz`, {
      headers: { Origin: untrusted },
    });
    assert.equal(response.status, 403);
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
  }
  const allowed = await fetch(`${origin}/api/healthz`, {
    headers: { Origin: "https://app.samra.test" },
  });
  assert.equal(allowed.status, 200);
  assert.equal(
    allowed.headers.get("Access-Control-Allow-Origin"),
    "https://app.samra.test",
  );
  assert.match(allowed.headers.get("Vary") ?? "", /Origin/);
  const preflight = await fetch(`${origin}/api/v1/waitlist/subscriptions`, {
    method: "OPTIONS",
    headers: {
      Origin: "https://app.samra.test",
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "authorization,content-type",
    },
  });
  assert.equal(preflight.status, 204);
  assert.equal(
    preflight.headers.get("Access-Control-Allow-Origin"),
    "https://app.samra.test",
  );
  const rejectedPreflight = await fetch(
    `${origin}/api/v1/waitlist/subscriptions`,
    {
      method: "OPTIONS",
      headers: {
        Origin: "https://other.samra.test",
        "Access-Control-Request-Method": "POST",
      },
    },
  );
  assert.equal(rejectedPreflight.status, 403);
  assert.equal(
    rejectedPreflight.headers.get("Access-Control-Allow-Origin"),
    null,
  );
  const native = await fetch(`${origin}/api/healthz`);
  assert.equal(native.status, 200);
  assert.equal(native.headers.get("Access-Control-Allow-Origin"), null);
});

test("empty origin configuration denies cross-origin access and serves JSON security headers", async (t) => {
  const origin = await listen(
    t,
    createServer(createApp(loadApiRuntimeConfig({}))),
  );
  const response = await fetch(`${origin}/api/healthz`, {
    headers: { Origin: "https://app.samra.test" },
  });
  assert.equal(response.status, 403);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
  for (const result of [response, await fetch(`${origin}/api/healthz`)]) {
    assert.match(
      result.headers.get("Strict-Transport-Security") ?? "",
      /max-age=31536000/,
    );
    assert.equal(result.headers.get("X-Content-Type-Options"), "nosniff");
    assert.equal(result.headers.get("X-Frame-Options"), "DENY");
    assert.equal(result.headers.get("Referrer-Policy"), "no-referrer");
    assert.equal(result.headers.get("Content-Security-Policy"), null);
    assert.equal(result.headers.get("X-Powered-By"), null);
  }
});

test("Express resolves client IP only through the explicitly trusted proxy chain", () => {
  const clientIp = (trusted: string | undefined) => {
    const app = createApp(
      loadApiRuntimeConfig({ SAMRA_TRUSTED_PROXIES: trusted }),
    );
    const request = Object.assign(Object.create(app.request), {
      app,
      socket: { remoteAddress: "127.0.0.1" },
      headers: { "x-forwarded-for": "192.0.2.66, 198.51.100.7" },
    });
    return request.ip;
  };
  assert.equal(clientIp(undefined), "127.0.0.1");
  assert.equal(clientIp("10.20.0.0/24"), "127.0.0.1");
  assert.equal(clientIp("127.0.0.1"), "198.51.100.7");
});

test("public write limits are separate per route and instance, with no global or Persona limiter", async (t) => {
  let writes = 0;
  const unexpectedWrite = async (): Promise<never> => {
    writes++;
    throw new Error("Unexpected write");
  };
  const makeApp = () =>
    createApp(
      loadApiRuntimeConfig({ NODE_ENV: "test", SAMRA_BACKEND_MODE: "demo" }),
      new TestDemoRuntime({
        customerFunnelStore: {
          recordEvent: unexpectedWrite,
          bindAuth0Session: unexpectedWrite,
          funnelReport: unexpectedWrite,
        },
      }),
    );
  const origin = await listen(t, createServer(makeApp()));
  const post = (path: string, base = origin) =>
    fetch(`${base}/api/v1${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
  for (let count = 0; count < 10; count++)
    assert.equal((await post("/waitlist/subscriptions")).status, 422);
  const limited = await post("/waitlist/subscriptions");
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get("Retry-After")) > 0);
  assert.match(
    limited.headers.get("Content-Type") ?? "",
    /application\/problem\+json/,
  );
  assert.equal(((await limited.json()) as { code: string }).code, "RATE_LIMITED");
  for (let count = 0; count < 60; count++)
    assert.equal((await post("/acquisition/events")).status, 422);
  assert.equal((await post("/acquisition/events")).status, 429);
  for (const path of ["/api/healthz", "/api/v1/me"]) {
    const result = await fetch(origin + path);
    assert.notEqual(result.status, 429);
    assert.equal(result.headers.get("RateLimit"), null);
  }
  const persona = await post("/provider-events/persona");
  assert.equal(persona.status, 404); // No provider configured; existing signed-webhook tests cover the active path.
  assert.equal(persona.headers.get("RateLimit"), null);
  const otherInstance = await listen(t, createServer(makeApp()));
  assert.equal(
    (await post("/waitlist/subscriptions", otherInstance)).status,
    422,
  );
  assert.equal(writes, 0);
});
