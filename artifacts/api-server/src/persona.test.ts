import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import type {
  CustomerIdentityCaseSnapshot,
  CustomerIdentityCaseStore,
} from "@workspace/db";
import { createApp } from "./app";
import type {
  ApiRuntimeConfig,
  CustomerIdentityProviderConfig,
} from "./config";
import { DemoRuntime } from "./domain/demo-runtime";
import {
  PersonaSandboxAdapter,
  PersonaWebhookAuthenticationError,
  PersonaWebhookService,
  parsePersonaDecisionEvent,
  verifyPersonaWebhookSignature,
} from "./domain/persona";

const NOW_MILLISECONDS = Date.parse("2026-08-22T12:00:00.000Z");
const NOW_SECONDS = Math.floor(NOW_MILLISECONDS / 1_000);
const IDENTITY_CASE_ID = "identity_case_00000000000000000000000000000001";
const PROVIDER_INQUIRY_REF = "inq_12345678";
const CURRENT_SECRET = "current_persona_webhook_secret";
const PREVIOUS_SECRET = "previous_persona_webhook_secret";

const demoConfig: ApiRuntimeConfig = Object.freeze({
  backendMode: "demo",
  providerMode: "fake",
  devControlsEnabled: false,
  runWorker: false,
  workerIntervalMilliseconds: 5,
  customerAuth: Object.freeze({ mode: "disabled" }),
  customerIdentityProvider: Object.freeze({ mode: "fake" }),
});

function personaConfig(): Extract<
  CustomerIdentityProviderConfig,
  { mode: "persona-sandbox" }
> {
  return Object.freeze({
    mode: "persona-sandbox",
    apiKey: "persona_sandbox_test_key_123456789",
    inquiryTemplateId: "itmpl_AbCdEf123456",
    environmentId: "env_AbCdEf123456",
    webhookSecrets: Object.freeze([CURRENT_SECRET, PREVIOUS_SECRET]),
    apiVersion: "2025-10-27",
  });
}

function snapshot(): CustomerIdentityCaseSnapshot {
  return Object.freeze({
    identityCaseId: IDENTITY_CASE_ID,
    state: "approved",
    reasonFamily: null,
    provider: "persona",
    synthetic: true,
    version: 3,
    decidedAt: "2026-08-22T12:00:00.000Z",
    createdAt: "2026-08-22T11:00:00.000Z",
    updatedAt: "2026-08-22T12:00:00.000Z",
    nextAllowedActions: Object.freeze([]),
  });
}

function storeWith(
  overrides: Partial<CustomerIdentityCaseStore>,
): CustomerIdentityCaseStore {
  const notUsed = async (): Promise<never> => {
    throw new Error("unexpected store call");
  };
  return {
    prepareAuth0IdentityCase: notUsed,
    attachProviderInquiry: notUsed,
    recordProviderStartFailure: notUsed,
    getAuth0IdentityCase: notUsed,
    recordProviderEvent: notUsed,
    ...overrides,
  };
}

test("Persona sandbox inquiry creation is idempotent and sends only opaque Samra references", async () => {
  let observedUrl = "";
  let observedInit: RequestInit | undefined;
  const adapter = new PersonaSandboxAdapter(personaConfig(), {
    fetch: async (input, init) => {
      observedUrl = String(input);
      observedInit = init;
      return new Response(
        JSON.stringify({
          data: { type: "inquiry", id: PROVIDER_INQUIRY_REF },
        }),
        { status: 201, headers: { "content-type": "application/json" } },
      );
    },
  });
  const requestKey = "a".repeat(64);
  const result = await adapter.createInquiry({
    identityCaseId: IDENTITY_CASE_ID,
    providerRequestKey: requestKey,
  });

  assert.deepEqual(result, { providerInquiryRef: PROVIDER_INQUIRY_REF });
  assert.equal(observedUrl, "https://api.withpersona.com/api/v1/inquiries");
  assert.equal(observedInit?.method, "POST");
  assert.equal(observedInit?.redirect, "error");
  const headers = new Headers(observedInit?.headers);
  assert.equal(
    headers.get("authorization"),
    `Bearer ${personaConfig().apiKey}`,
  );
  assert.equal(headers.get("idempotency-key"), requestKey);
  assert.equal(headers.get("persona-version"), "2025-10-27");
  assert.equal(typeof observedInit?.body, "string");
  const body = JSON.parse(String(observedInit?.body)) as unknown;
  assert.deepEqual(body, {
    data: {
      attributes: {
        "inquiry-template-id": personaConfig().inquiryTemplateId,
        "reference-id": IDENTITY_CASE_ID,
      },
    },
  });
  assert.doesNotMatch(
    JSON.stringify(body),
    /email|phone|first.name|last.name|address|birth|auth0|token/iu,
  );
});

test("Persona sandbox inquiry creation fails closed on provider errors or malformed evidence", async () => {
  const unavailable = new PersonaSandboxAdapter(personaConfig(), {
    fetch: async () =>
      new Response("provider detail must not escape", { status: 503 }),
  });
  await assert.rejects(
    unavailable.createInquiry({
      identityCaseId: IDENTITY_CASE_ID,
      providerRequestKey: "b".repeat(64),
    }),
    /Persona sandbox inquiry creation failed/,
  );

  const malformed = new PersonaSandboxAdapter(personaConfig(), {
    fetch: async () =>
      new Response(JSON.stringify({ data: { type: "inquiry", id: "wrong" } }), {
        status: 200,
      }),
  });
  await assert.rejects(
    malformed.createInquiry({
      identityCaseId: IDENTITY_CASE_ID,
      providerRequestKey: "c".repeat(64),
    }),
    /invalid inquiry response/,
  );
});

test("Persona webhook verification supports bounded secret rotation and rejects replay windows or tampering", () => {
  const rawBody = decisionEvent("inquiry.approved", "approved");
  const current = signatureHeader(rawBody, CURRENT_SECRET, NOW_SECONDS);
  const previous = signatureHeader(rawBody, PREVIOUS_SECRET, NOW_SECONDS);

  verifyPersonaWebhookSignature({
    rawBody,
    signatureHeader: current,
    webhookSecrets: [CURRENT_SECRET],
    nowMilliseconds: NOW_MILLISECONDS,
  });
  verifyPersonaWebhookSignature({
    rawBody,
    signatureHeader: `t=${NOW_SECONDS},v1=${"0".repeat(64)},v1=${previous.split("v1=")[1]}`,
    webhookSecrets: [CURRENT_SECRET, PREVIOUS_SECRET],
    nowMilliseconds: NOW_MILLISECONDS,
  });

  for (const input of [
    { rawBody, signatureHeader: undefined, nowMilliseconds: NOW_MILLISECONDS },
    {
      rawBody: Buffer.concat([rawBody, Buffer.from(" ")]),
      signatureHeader: current,
      nowMilliseconds: NOW_MILLISECONDS,
    },
    {
      rawBody,
      signatureHeader: signatureHeader(
        rawBody,
        CURRENT_SECRET,
        NOW_SECONDS - 301,
      ),
      nowMilliseconds: NOW_MILLISECONDS,
    },
    {
      rawBody,
      signatureHeader: signatureHeader(
        rawBody,
        CURRENT_SECRET,
        NOW_SECONDS + 301,
      ),
      nowMilliseconds: NOW_MILLISECONDS,
    },
  ]) {
    assert.throws(
      () =>
        verifyPersonaWebhookSignature({
          ...input,
          webhookSecrets: [CURRENT_SECRET, PREVIOUS_SECRET],
        }),
      PersonaWebhookAuthenticationError,
    );
  }
});

test("Persona webhook parsing accepts only the three durable Samra decisions", () => {
  const decisions = [
    ["inquiry.marked-for-review", "needs_review", "review"],
    ["inquiry.approved", "approved", "approved"],
    ["inquiry.declined", "declined", "declined"],
  ] as const;
  for (const [eventType, status, decision] of decisions) {
    assert.deepEqual(
      parsePersonaDecisionEvent(decisionEvent(eventType, status)),
      {
        identityCaseId: IDENTITY_CASE_ID,
        providerInquiryRef: PROVIDER_INQUIRY_REF,
        providerEventRef: "evt_12345678",
        eventType,
        decision,
      },
    );
  }
  assert.equal(
    parsePersonaDecisionEvent(decisionEvent("inquiry.completed", "completed")),
    null,
  );
  assert.throws(
    () =>
      parsePersonaDecisionEvent(decisionEvent("inquiry.approved", "declined")),
    /not a supported Persona decision event/,
  );
});

test("Persona webhook HTTP boundary needs no customer token, stores digest-only evidence, and hides invalid signatures", async () => {
  const observed: Array<
    Parameters<CustomerIdentityCaseStore["recordProviderEvent"]>[0]
  > = [];
  const store = storeWith({
    async recordProviderEvent(input) {
      observed.push(input);
      return Object.freeze({
        snapshot: snapshot(),
        replayed: observed.length > 1,
        disposition: "applied" as const,
      });
    },
  });
  const service = new PersonaWebhookService({
    store,
    webhookSecrets: [CURRENT_SECRET, PREVIOUS_SECRET],
    clock: () => NOW_MILLISECONDS,
  });
  const runtime = new DemoRuntime({ personaWebhookService: service });
  const rawBody = decisionEvent("inquiry.approved", "approved");
  const signature = signatureHeader(rawBody, CURRENT_SECRET, NOW_SECONDS);

  await withServer(demoConfig, runtime, async (origin) => {
    const accepted = await rawRequest(origin, rawBody, signature);
    assert.equal(accepted.status, 200);
    assert.deepEqual(accepted.body, {
      received: true,
      replayed: false,
      disposition: "applied",
    });
    assert.equal(accepted.headers.get("www-authenticate"), null);

    const replayed = await rawRequest(origin, rawBody, signature);
    assert.equal(replayed.status, 200);
    assert.equal(replayed.body["replayed"], true);

    const ignoredBody = decisionEvent("inquiry.completed", "completed");
    const ignored = await rawRequest(
      origin,
      ignoredBody,
      signatureHeader(ignoredBody, CURRENT_SECRET, NOW_SECONDS),
    );
    assert.equal(ignored.status, 204);
    assert.equal(observed.length, 2);

    const rejected = await rawRequest(
      origin,
      rawBody,
      `t=${NOW_SECONDS},v1=${"0".repeat(64)}`,
    );
    assert.equal(rejected.status, 401);
    assert.equal(
      rejected.body["code"],
      "PROVIDER_WEBHOOK_AUTHENTICATION_FAILED",
    );
    assert.equal(rejected.headers.get("www-authenticate"), null);
    assert.doesNotMatch(
      JSON.stringify(rejected.body),
      /secret|signature|approved/iu,
    );
  });

  assert.equal(observed.length, 2);
  assert.deepEqual(observed[0], {
    identityCaseId: IDENTITY_CASE_ID,
    providerInquiryRef: PROVIDER_INQUIRY_REF,
    providerEventRef: "evt_12345678",
    eventType: "inquiry.approved",
    decision: "approved",
    payloadDigest: createHash("sha256").update(rawBody).digest("hex"),
  });
});

test("Persona webhook route is indistinguishable from a missing route when disabled", async () => {
  const rawBody = decisionEvent("inquiry.approved", "approved");
  await withServer(demoConfig, new DemoRuntime(), async (origin) => {
    const response = await rawRequest(
      origin,
      rawBody,
      signatureHeader(rawBody, CURRENT_SECRET, NOW_SECONDS),
    );
    assert.equal(response.status, 404);
    assert.equal(response.body["code"], "NOT_FOUND");
  });
});

function decisionEvent(eventType: string, status: string): Buffer {
  return Buffer.from(
    JSON.stringify({
      data: {
        type: "event",
        id: "evt_12345678",
        attributes: {
          name: eventType,
          payload: {
            data: {
              type: "inquiry",
              id: PROVIDER_INQUIRY_REF,
              attributes: {
                "reference-id": IDENTITY_CASE_ID,
                status,
              },
            },
          },
        },
      },
    }),
  );
}

function signatureHeader(
  rawBody: Buffer,
  secret: string,
  timestamp: number,
): string {
  const signature = createHmac("sha256", secret)
    .update(Buffer.concat([Buffer.from(`${timestamp}.`), rawBody]))
    .digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

async function rawRequest(
  origin: string,
  body: Buffer,
  signatureHeaderValue: string,
): Promise<
  Readonly<{ status: number; body: Record<string, unknown>; headers: Headers }>
> {
  const response = await fetch(`${origin}/api/v1/provider-events/persona`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "persona-signature": signatureHeaderValue,
    },
    body,
  });
  const text = await response.text();
  return Object.freeze({
    status: response.status,
    body: text ? (JSON.parse(text) as Record<string, unknown>) : {},
    headers: response.headers,
  });
}

async function withServer(
  config: ApiRuntimeConfig,
  runtime: DemoRuntime,
  run: (origin: string) => Promise<void>,
): Promise<void> {
  const app = createApp(config, runtime);
  const server = await new Promise<Server>((resolve, reject) => {
    const candidate = app.listen(0, "127.0.0.1", (error?: Error) =>
      error ? reject(error) : resolve(candidate),
    );
    candidate.once("error", reject);
  });
  const address = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    if (server.listening) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  }
}
