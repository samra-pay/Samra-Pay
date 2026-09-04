import { createResendWaitlistTransport } from "./waitlist-resend.mjs";

const CONSENT_VERSION = "public-waitlist-2026-09-04";
const MAX_REQUEST_BYTES = 2_048;
const EXPECTED_PROJECT = "samra-pay-production";
const EXPECTED_SERVICE = "samra-launch-updates";
const EXPECTED_SECRET_VERSION = "1";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9_-]{7,79}$/u;
const ALLOWED_ORIGINS = new Set([
  "https://www.samrapay.com",
  "https://samra-pay-production.web.app",
]);

function configurationError() {
  throw new Error("PUBLIC_WAITLIST_CONFIGURATION_INVALID");
}

function json(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders,
    },
  });
}

function normalizeEmail(value) {
  if (typeof value !== "string" || value.length > 254) return null;
  const email = value.trim().normalize("NFKC").toLowerCase();
  const parts = email.split("@");
  if (parts.length !== 2 || parts[0].length > 64) return null;
  const [local, domain] = parts;
  const atom = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+$/u;
  const labels = domain.split(".");
  if (
    !local.split(".").every((part) => atom.test(part)) ||
    labels.length < 2 ||
    !labels.every((label) =>
      /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(label),
    ) ||
    !/^[a-z]{2,63}$/u.test(labels.at(-1))
  ) {
    return null;
  }
  return email;
}

async function readBody(request) {
  const declared = request.headers.get("content-length");
  if (
    declared !== null &&
    (!/^\d+$/u.test(declared) || Number(declared) > MAX_REQUEST_BYTES)
  ) {
    throw new Error("INVALID_REQUEST");
  }
  if (!request.body || typeof request.body.getReader !== "function")
    throw new Error("INVALID_REQUEST");
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let body = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) throw new Error("INVALID_REQUEST");
      bytes += value.byteLength;
      if (bytes > MAX_REQUEST_BYTES) throw new Error("INVALID_REQUEST");
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    return JSON.parse(body);
  } catch {
    throw new Error("INVALID_REQUEST");
  } finally {
    reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

function validSubscription(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const keys = Object.keys(body).sort();
  if (
    JSON.stringify(keys) !==
    JSON.stringify(
      ["consent", "consentVersion", "email", "locale", "website"].sort(),
    )
  ) {
    return null;
  }
  const email = normalizeEmail(body.email);
  if (
    !email ||
    body.consent !== true ||
    body.consentVersion !== CONSENT_VERSION ||
    !["en", "am"].includes(body.locale) ||
    typeof body.website !== "string" ||
    body.website.length > 200
  ) {
    return null;
  }
  return Object.freeze({ email, website: body.website });
}

export function createPublicWaitlistService({
  env = {},
  fetchImpl,
  now,
  providerMinimumIntervalMs = 550,
} = {}) {
  if (
    typeof window !== "undefined" ||
    !env ||
    typeof env !== "object" ||
    env.SAMRA_LAUNCH_UPDATES_MODE !== "waitlist" ||
    env.SAMRA_CLOUD_PROJECT_ID !== EXPECTED_PROJECT ||
    env.K_SERVICE !== EXPECTED_SERVICE ||
    env.SAMRA_RESEND_SECRET_VERSION !== EXPECTED_SECRET_VERSION ||
    !UUID.test(env.SAMRA_RESEND_SEGMENT_ID ?? "") ||
    !UUID.test(env.SAMRA_RESEND_TOPIC_ID ?? "") ||
    typeof env.RESEND_API_KEY !== "string" ||
    !/^re_[A-Za-z0-9_-]{10,}$/u.test(env.RESEND_API_KEY) ||
    typeof fetchImpl !== "function" ||
    (now !== undefined && typeof now !== "function") ||
    !Number.isInteger(providerMinimumIntervalMs) ||
    providerMinimumIntervalMs < 0 ||
    providerMinimumIntervalMs > 5_000
  ) {
    configurationError();
  }

  const clock = now ?? (() => Date.now());
  const transport = createResendWaitlistTransport({
    apiKey: env.RESEND_API_KEY,
    fetchImpl,
    minimumIntervalMs: providerMinimumIntervalMs,
  });
  const segmentId = env.SAMRA_RESEND_SEGMENT_ID;
  const topicId = env.SAMRA_RESEND_TOPIC_ID;

  return Object.freeze({
    async handle(request) {
      const url = new URL(request.url);
      if (url.pathname === "/healthz") {
        if (request.method !== "GET")
          return json(405, { status: "method_not_allowed" }, { Allow: "GET" });
        return json(200, { status: "ok" });
      }
      if (url.pathname !== "/api/v1/waitlist/subscriptions")
        return json(404, { status: "not_found" });
      if (request.method !== "POST")
        return json(405, { status: "method_not_allowed" }, { Allow: "POST" });

      try {
        if (
          !ALLOWED_ORIGINS.has(request.headers.get("origin") ?? "") ||
          !/^application\/json(?:\s*;|$)/iu.test(
            request.headers.get("content-type") ?? "",
          ) ||
          !IDEMPOTENCY_KEY.test(request.headers.get("idempotency-key") ?? "")
        ) {
          return json(422, { accepted: false, code: "INVALID_REQUEST" });
        }
        const subscription = validSubscription(await readBody(request));
        if (!subscription)
          return json(422, { accepted: false, code: "INVALID_REQUEST" });

        const acceptedAt = new Date(clock()).toISOString();
        if (subscription.website.length > 0)
          return json(202, { accepted: true, acceptedAt });

        let existing = await transport.getContact(subscription.email);
        if (!existing) {
          try {
            await transport.createContact({
              email: subscription.email,
              segmentId,
              topicId,
            });
          } catch {
            // Resolve a concurrent create without ever re-subscribing an existing contact.
            existing = await transport.getContact(subscription.email);
            if (!existing) throw new Error("WAITLIST_PROVIDER_FAILED");
          }
        }
        if (existing && !existing.unsubscribed) {
          await transport.addContactToSegment({
            contactId: existing.id,
            segmentId,
          });
          await transport.optContactIntoTopic({
            contactId: existing.id,
            topicId,
          });
        }
        return json(202, { accepted: true, acceptedAt });
      } catch {
        return json(503, { accepted: false, code: "WAITLIST_UNAVAILABLE" });
      }
    },
  });
}

export const publicWaitlistContract = Object.freeze({
  projectId: EXPECTED_PROJECT,
  serviceId: EXPECTED_SERVICE,
  secretVersion: EXPECTED_SECRET_VERSION,
  consentVersion: CONSENT_VERSION,
  origins: Object.freeze([...ALLOWED_ORIGINS]),
});
