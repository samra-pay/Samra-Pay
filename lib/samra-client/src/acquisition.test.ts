import assert from "node:assert/strict";
import test from "node:test";

import {
  CustomerAcquisitionTracker,
  deriveWebCustomerAcquisitionAttribution,
  directCustomerAcquisitionAttribution,
  type CustomerAcquisitionSessionStore,
  type CustomerAcquisitionTransport,
} from "./acquisition.ts";

test("web attribution classifies known channels without retaining raw URLs or arbitrary campaign values", () => {
  assert.deepEqual(
    deriveWebCustomerAcquisitionAttribution({
      search:
        "?utm_source=instagram&utm_medium=paid_social&utm_campaign=alpha_launch&email=private%40example.test",
      referrer: "https://example.test/private/path?token=secret",
      currentOrigin: "https://samra.test",
      allowedCampaigns: ["alpha_launch"],
    }),
    {
      channel: "paid_social",
      source: "instagram",
      medium: "paid_social",
      campaign: "alpha_launch",
    },
  );

  const unknown = deriveWebCustomerAcquisitionAttribution({
    search:
      "?utm_source=private_person&utm_medium=referral&utm_campaign=private_person_123",
    referrer: "https://unknown.example/private?email=private@example.test",
    currentOrigin: "https://samra.test",
  });
  assert.deepEqual(unknown, {
    channel: "referral",
    source: null,
    medium: "referral",
    campaign: null,
  });
  assert.equal(JSON.stringify(unknown).includes("private"), false);
  assert.equal(JSON.stringify(unknown).includes("example"), false);
});

test("web attribution maps only controlled referrer hosts and never sends an unknown hostname", () => {
  assert.deepEqual(
    deriveWebCustomerAcquisitionAttribution({
      search: "",
      referrer: "https://www.google.com/search?q=samra+pay",
      currentOrigin: "https://samra.test",
    }),
    {
      channel: "organic_search",
      source: "google",
      medium: "organic",
      campaign: null,
    },
  );
  assert.deepEqual(
    deriveWebCustomerAcquisitionAttribution({
      search: "",
      referrer: "https://untrusted-referrer.example/customer/123",
      currentOrigin: "https://samra.test",
    }),
    {
      channel: "referral",
      source: null,
      medium: "referral",
      campaign: null,
    },
  );
  assert.deepEqual(
    deriveWebCustomerAcquisitionAttribution({
      search: "",
      referrer: "https://samra.test/remittance",
      currentOrigin: "https://samra.test",
    }),
    directCustomerAcquisitionAttribution(),
  );
});

test("tracker collapses concurrent events, reuses failed keys, persists only opaque sessions, and binds after capture", async () => {
  const calls: Array<
    Readonly<{ kind: "event" | "bind"; key: string; sessionId?: string }>
  > = [];
  const stored: string[] = [];
  let failFirst = true;
  const sessionId = "acq_0123456789abcdef0123456789abcdef";
  const transport: CustomerAcquisitionTransport = {
    async recordEvent(input, key) {
      calls.push({ kind: "event", key, sessionId: input.sessionId });
      if (failFirst) {
        failFirst = false;
        throw new Error("temporary outage");
      }
      return {
        sessionId,
        eventType: input.eventType,
        recorded: true,
        recordedAt: "2026-08-19T12:00:00.000Z",
      };
    },
    async bindSession(input, key) {
      calls.push({ kind: "bind", key, sessionId: input.sessionId });
    },
  };
  const store: CustomerAcquisitionSessionStore = {
    async get() {
      return null;
    },
    async set(value) {
      stored.push(value);
    },
  };
  let sequence = 0;
  const tracker = new CustomerAcquisitionTracker({
    platform: "mobile",
    attribution: directCustomerAcquisitionAttribution(),
    transport,
    sessionStore: store,
    createIdempotencyKey: () => `key-${++sequence}`,
  });

  assert.deepEqual(await tracker.recordOnce("app_open"), { status: "failed" });
  const [first, replay] = await Promise.all([
    tracker.recordOnce("app_open"),
    tracker.recordOnce("app_open"),
  ]);
  assert.deepEqual(first, { status: "recorded", sessionId });
  assert.deepEqual(replay, first);
  assert.equal(calls[0]!.key, calls[1]!.key);
  assert.deepEqual(stored, [sessionId]);
  assert.deepEqual(await tracker.recordOnce("app_open"), { status: "skipped" });
  assert.deepEqual(await tracker.bind(), { status: "bound", sessionId });
  assert.deepEqual(await tracker.bind(), { status: "skipped" });
  assert.deepEqual(calls.at(-1), {
    kind: "bind",
    key: "acquisition-bind-key-2",
    sessionId,
  });
});

test("telemetry failures and persistence failures never reject customer work", async () => {
  const failures: string[] = [];
  const tracker = new CustomerAcquisitionTracker({
    platform: "web",
    attribution: directCustomerAcquisitionAttribution(),
    allowCookieSession: true,
    sessionStore: {
      async get() {
        throw new Error("storage unavailable");
      },
      async set() {
        throw new Error("storage unavailable");
      },
    },
    transport: {
      async recordEvent() {
        throw new Error("api unavailable");
      },
      async bindSession() {
        throw new Error("api unavailable");
      },
    },
    onFailure: ({ operation }) => failures.push(operation),
  });

  assert.deepEqual(await tracker.recordOnce("landing_view"), {
    status: "failed",
  });
  assert.deepEqual(await tracker.bind(), { status: "failed" });
  assert.deepEqual(failures, ["load_session", "record_event", "bind_session"]);
});

test("tracker rejects inconsistent service receipts without replacing a durable session", async () => {
  const durableSessionId = "acq_0123456789abcdef0123456789abcdef";
  const changedSessionId = "acq_fedcba9876543210fedcba9876543210";
  let responseSessionId = changedSessionId;
  let responseEventType = "landing_view" as const;
  const tracker = new CustomerAcquisitionTracker({
    platform: "mobile",
    attribution: directCustomerAcquisitionAttribution(),
    sessionStore: {
      async get() {
        return durableSessionId;
      },
      async set() {
        throw new Error("an invalid receipt must never be persisted");
      },
    },
    transport: {
      async recordEvent() {
        return {
          sessionId: responseSessionId,
          eventType: responseEventType,
          recorded: true,
          recordedAt: "2026-08-19T12:00:00.000Z",
        };
      },
      async bindSession(input) {
        assert.equal(input.sessionId, durableSessionId);
      },
    },
  });

  assert.deepEqual(await tracker.recordOnce("app_open"), { status: "failed" });
  responseSessionId = durableSessionId;
  assert.deepEqual(await tracker.recordOnce("app_open"), { status: "failed" });
  responseEventType = "app_open";
  assert.deepEqual(await tracker.bind(), {
    status: "bound",
    sessionId: durableSessionId,
  });
});

test("binding waits for an in-flight capture so the authenticated link cannot race it", async () => {
  const sessionId = "acq_0123456789abcdef0123456789abcdef";
  let releaseCapture: (() => void) | undefined;
  let captured = false;
  const captureGate = new Promise<void>((resolve) => {
    releaseCapture = resolve;
  });
  const tracker = new CustomerAcquisitionTracker({
    platform: "web",
    attribution: directCustomerAcquisitionAttribution(),
    allowCookieSession: true,
    transport: {
      async recordEvent(input) {
        await captureGate;
        captured = true;
        return {
          sessionId,
          eventType: input.eventType,
          recorded: true,
          recordedAt: "2026-08-19T12:00:00.000Z",
        };
      },
      async bindSession(input) {
        assert.equal(captured, true);
        assert.equal(input.sessionId, sessionId);
      },
    },
  });

  const capture = tracker.recordOnce("signup_started");
  const bind = tracker.bind();
  releaseCapture?.();

  assert.deepEqual(await capture, { status: "recorded", sessionId });
  assert.deepEqual(await bind, { status: "bound", sessionId });
});
