import assert from "node:assert/strict";
import test from "node:test";
import {
  readStagingRevisionProbeConfig,
  runStagingRevisionProbe,
} from "./staging-revision-probe";

const revision = "samra-api-aaaaaaaaaaaa";
const config = {
  probeUrl:
    "https://probe-aaaaaaaaaaaa---samra-api-934122615631.us-east4.run.app",
  serviceAudience: "https://samra-api-934122615631.us-east4.run.app",
  expectedRevision: revision,
  probeId: "probe-123-1",
  timeoutMs: 5000,
};

function cloudResponse(status: number, body: string, withRevision = false) {
  return new Response(body, {
    status,
    headers: withRevision
      ? {
          "content-type": "application/json",
          "cache-control": "no-store",
          "x-samra-cloud-run-revision": revision,
        }
      : {},
  });
}

function successfulFetch(
  calls: Array<{ url: string; authorization: boolean }>,
) {
  return (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    calls.push({ url, authorization: headers.has("authorization") });
    if (url.startsWith("http://metadata.google.internal/")) {
      assert.equal(headers.get("metadata-flavor"), "Google");
      assert.match(url, /audience=https%3A%2F%2Fsamra-api-/);
      return new Response(`a.${"b".repeat(120)}.c`, { status: 200 });
    }
    if (!headers.has("authorization")) return cloudResponse(403, "forbidden");
    if (url.includes("/api/healthz")) {
      return cloudResponse(200, JSON.stringify({ status: "ok" }), true);
    }
    return cloudResponse(200, JSON.stringify({ status: "ready" }), true);
  }) as typeof fetch;
}

test("validates the closed staging-probe environment", () => {
  assert.deepEqual(
    readStagingRevisionProbeConfig({
      SAMRA_PROBE_URL: config.probeUrl,
      SAMRA_SERVICE_AUDIENCE: config.serviceAudience,
      SAMRA_EXPECTED_REVISION: config.expectedRevision,
      SAMRA_PROBE_ID: config.probeId,
      SAMRA_PROBE_TIMEOUT_MS: "5000",
    }),
    config,
  );
  for (const environment of [
    { ...process.env },
    { ...process.env, SAMRA_PROBE_URL: "http://example.com" },
    {
      ...process.env,
      SAMRA_PROBE_URL: config.probeUrl,
      SAMRA_SERVICE_AUDIENCE: "https://example.com",
    },
    {
      ...process.env,
      SAMRA_PROBE_URL: `${config.probeUrl}/api/healthz`,
      SAMRA_SERVICE_AUDIENCE: config.serviceAudience,
    },
  ]) {
    assert.throws(() => readStagingRevisionProbeConfig(environment));
  }
});

test("proves unauthenticated rejection and authenticated exact-revision readiness", async () => {
  const calls: Array<{ url: string; authorization: boolean }> = [];
  const result = await runStagingRevisionProbe(config, successfulFetch(calls));
  assert.equal(result.status, "passed");
  assert.equal(result.unauthenticatedStatus, 403);
  assert.equal(result.authenticatedHealthStatus, 200);
  assert.equal(result.authenticatedReadinessStatus, 200);
  assert.equal(result.observedRevision, revision);
  assert.equal(result.tokenRecorded, false);
  assert.equal(calls.length, 4);
  assert.equal(JSON.stringify(result).includes("bbbbbbbb"), false);
});

test("retries transient network startup failures without retrying HTTP failures", async () => {
  const calls: Array<{ url: string; authorization: boolean }> = [];
  const baseFetch = successfulFetch(calls);
  let transientFailures = 2;
  const delays: number[] = [];
  const fetchImpl = (async (
    input: Parameters<typeof fetch>[0],
    init?: RequestInit,
  ) => {
    if (transientFailures > 0) {
      transientFailures -= 1;
      throw new TypeError("network is still attaching");
    }
    return baseFetch(input, init);
  }) as typeof fetch;

  const result = await runStagingRevisionProbe(
    config,
    fetchImpl,
    async (ms) => {
      delays.push(ms);
    },
  );

  assert.equal(result.status, "passed");
  assert.deepEqual(delays, [1000, 2000]);
  assert.equal(calls.length, 4);
});

test("fails closed on public access, wrong revision, bad readiness, or metadata failure", async () => {
  const scenarios: Array<typeof fetch> = [
    (async () =>
      cloudResponse(
        200,
        JSON.stringify({ status: "ok" }),
        true,
      )) as typeof fetch,
    (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("http://metadata.google.internal/")) {
        return new Response(`a.${"b".repeat(120)}.c`, { status: 200 });
      }
      const headers = new Headers(init?.headers);
      if (!headers.has("authorization")) return cloudResponse(403, "forbidden");
      return new Response(
        JSON.stringify({ status: url.includes("readyz") ? "ready" : "ok" }),
        {
          status: 200,
          headers: {
            "cache-control": "no-store",
            "x-samra-cloud-run-revision": "samra-api-wrong",
          },
        },
      );
    }) as typeof fetch,
    (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("http://metadata.google.internal/")) {
        return new Response(`a.${"b".repeat(120)}.c`, { status: 200 });
      }
      const headers = new Headers(init?.headers);
      if (!headers.has("authorization")) return cloudResponse(403, "forbidden");
      if (url.includes("readyz")) {
        return cloudResponse(
          503,
          JSON.stringify({ status: "not_ready" }),
          true,
        );
      }
      return cloudResponse(200, JSON.stringify({ status: "ok" }), true);
    }) as typeof fetch,
    (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      if (
        !headers.has("authorization") &&
        !url.startsWith("http://metadata.google.internal/")
      ) {
        return cloudResponse(403, "forbidden");
      }
      return new Response("unavailable", { status: 503 });
    }) as typeof fetch,
  ];
  for (const fetchImpl of scenarios) {
    await assert.rejects(runStagingRevisionProbe(config, fetchImpl));
  }
});
