import assert from "node:assert/strict";
import test from "node:test";

import {
  customFetch,
  RequestTimeoutError,
  setAuthTokenGetter,
} from "./custom-fetch.ts";

test("customFetch parses successful JSON responses", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ status: "ok" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  try {
    assert.deepEqual(await customFetch("/api/test"), { status: "ok" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("customFetch aborts a stalled request with an explicit timeout error", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_input, init) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener(
        "abort",
        () => reject(init.signal?.reason),
        { once: true },
      );
    });

  try {
    await assert.rejects(
      customFetch("/api/stalled", { timeoutMs: 5 }),
      (error: unknown) =>
        error instanceof RequestTimeoutError && error.timeoutMs === 5,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("customFetch preserves caller cancellation instead of labeling it a timeout", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_input, init) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener(
        "abort",
        () => reject(init.signal?.reason),
        { once: true },
      );
    });
  const controller = new AbortController();

  try {
    const request = customFetch("/api/cancelled", {
      signal: controller.signal,
      timeoutMs: 1_000,
    });
    controller.abort(new Error("caller cancelled"));
    await assert.rejects(request, /caller cancelled/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("customFetch resolves short-lived bearer tokens per request without overriding callers", async () => {
  const originalFetch = globalThis.fetch;
  const observed: string[] = [];
  globalThis.fetch = async (_input, init) => {
    observed.push(new Headers(init?.headers).get("authorization") ?? "");
    return new Response(JSON.stringify({ status: "ok" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  let tokenVersion = 0;
  setAuthTokenGetter(() => `short-lived-${++tokenVersion}`);

  try {
    await customFetch("/api/first");
    await customFetch("/api/second");
    await customFetch("/api/explicit", {
      headers: { Authorization: "Bearer caller-owned" },
    });

    assert.deepEqual(observed, [
      "Bearer short-lived-1",
      "Bearer short-lived-2",
      "Bearer caller-owned",
    ]);
    assert.equal(tokenVersion, 2);
  } finally {
    setAuthTokenGetter(null);
    globalThis.fetch = originalFetch;
  }
});
