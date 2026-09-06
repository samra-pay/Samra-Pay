import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import test, { type TestContext } from "node:test";
import pino from "pino";
import { createApp } from "./app";
import type { ApiRuntimeConfig } from "./config";
import { createHttpLogger } from "./lib/http-logger";
import { loggerOptions } from "./lib/logger";

const disabledConfig: ApiRuntimeConfig = {
  backendMode: "disabled",
  providerMode: "fake",
  devControlsEnabled: false,
  runWorker: false,
  workerIntervalMilliseconds: 5,
  customerAuth: { mode: "disabled" },
};
const marker = "synthetic-sensitive-value";
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function captureLogger() {
  const records: Record<string, any>[] = [];
  const logger = pino(
    { ...loggerOptions, enabled: true, level: "trace", base: null },
    { write: (line) => records.push(JSON.parse(line)) },
  );
  return { logger, records };
}

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

test("API access logs omit sensitive paths, headers, cookies and bodies on success and failure", async (t) => {
  const { logger, records } = captureLogger();
  const origin = await listen(
    t,
    createServer(
      createApp(disabledConfig, undefined, { requestLogger: logger }),
    ),
  );
  const headers = {
    authorization: `Bearer ${marker}`,
    cookie: `session=${marker}`,
    "x-serverless-authorization": `Bearer ${marker}`,
    "x-request-id": marker,
    traceparent: marker,
    "content-type": "application/json",
  };
  const requests = [
    { path: `/api/healthz?token=${marker}`, expected: 200, method: "GET" },
    {
      path: `/api/unknown/${marker}`,
      expected: 404,
      method: "POST",
      body: JSON.stringify({ customerId: marker, email: marker }),
    },
    { path: "/api/v1/me", expected: 503, method: "GET" },
    {
      path: `/api/invalid/${marker}`,
      expected: 422,
      method: "POST",
      body: `{${marker}`,
    },
  ];
  for (const request of requests) {
    const response = await fetch(origin + request.path, {
      method: request.method,
      headers,
      ...(request.body ? { body: request.body } : {}),
    });
    const body = await response.json();
    assert.equal(response.status, request.expected);
    const record = records.at(-1)!;
    assert.equal(record.res.statusCode, request.expected);
    assert.deepEqual(Object.keys(record.req).sort(), ["id", "method"]);
    assert.match(record.req.id, uuid);
    if (request.expected >= 400) {
      assert.ok(typeof body === "object" && body !== null && "traceId" in body);
      assert.equal(body.traceId, record.req.id);
    }
  }
  assert.equal(records.length, requests.length);
  assert.equal(
    new Set(records.map((record) => record.req.id)).size,
    requests.length,
  );
  const output = JSON.stringify(records);
  assert.equal(output.includes(marker), false);
  assert.doesNotMatch(
    output,
    /"(?:url|headers|body|remoteAddress|remotePort|stack|cause)":/,
  );
  assert.ok(records.every((record) => Number.isFinite(record.responseTime)));
});

test("HTTP error output drops error messages, causes and provider properties", async (t) => {
  const { logger, records } = captureLogger();
  const middleware = createHttpLogger(logger);
  const origin = await listen(
    t,
    createServer((req, res) => {
      middleware(req, res);
      res.err = Object.assign(new Error(marker, { cause: new Error(marker) }), {
        code: marker,
        providerPayload: { token: marker },
      });
      res.statusCode = 500;
      res.setHeader("set-cookie", `session=${marker}`);
      res.end(marker);
    }),
  );
  await (await fetch(origin)).text();
  assert.equal(records.length, 1);
  assert.deepEqual(records[0]!.err, { type: "Error", code: "UNCLASSIFIED" });
  assert.equal(JSON.stringify(records).includes(marker), false);
});

test("process error output retains only a bounded operational code", () => {
  const { logger, records } = captureLogger();
  logger.error(
    {
      err: Object.assign(new Error(marker), {
        code: "ECONNRESET",
        cause: marker,
        providerPayload: marker,
      }),
    },
    "Graceful shutdown failed",
  );
  logger.error(
    { err: Object.assign(new Error(marker), { code: marker }) },
    "Error listening on port",
  );
  assert.deepEqual(
    records.map((record) => record.err),
    [
      { type: "Error", code: "ECONNRESET" },
      { type: "Error", code: "UNCLASSIFIED" },
    ],
  );
  assert.equal(JSON.stringify(records).includes(marker), false);
});
