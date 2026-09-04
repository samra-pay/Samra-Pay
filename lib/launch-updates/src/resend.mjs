// Server-only transport preparation. Not a signup lifecycle or permission to send.
// No contact creation, reactivation, suppression removal, or automatic retries.
const API_ORIGIN = "https://api.resend.com";
const SENDERS = new Set([
  "Samra Pay <updates@mail.samrapay.com>",
  "updates@mail.samrapay.com",
]);
const MAX_RESPONSE_BYTES = 16_384;
const NOT_FOUND = Symbol("resource-not-found");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SUPPRESSION_ORIGINS = new Set(["bounce", "complaint", "manual"]);

// Never attach an upstream error/body, request URL, email, or secret as a cause.
class TransportError extends Error {
  constructor(code) {
    super(`Resend transport: ${code}`);
    this.name = "ResendTransportError";
    this.code = code;
  }
}

function fail(code) {
  throw new TransportError(code);
}

function serverOnly() {
  if (typeof window !== "undefined") fail("SERVER_ONLY");
}

function normalizeEmail(value) {
  if (typeof value !== "string" || value.length > 254) fail("INVALID_REQUEST");
  const email = value.trim().toLowerCase();
  const parts = email.split("@");
  if (parts.length !== 2 || parts[0].length > 64) fail("INVALID_REQUEST");
  const [local, domain] = parts;
  const atom = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+$/;
  const labels = domain.split(".");
  if (
    !local.split(".").every((part) => atom.test(part)) ||
    labels.length < 2 ||
    !labels.every((label) =>
      /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label),
    ) ||
    !/^[a-z]{2,63}$/.test(labels.at(-1))
  ) {
    fail("INVALID_REQUEST");
  }
  return email;
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validId(value) {
  return typeof value === "string" && UUID.test(value);
}

function cancelBody(response) {
  try {
    // Cleanup must not prolong an already failed request or expose its error.
    const pending = response?.body?.cancel();
    if (pending && typeof pending.catch === "function") pending.catch(() => {});
  } catch {
    // An already consumed/locked body needs no additional cancellation.
  }
}

async function readJson(response, signal) {
  const contentType = response.headers?.get("content-type");
  const contentLength = response.headers?.get("content-length");
  if (
    typeof contentType !== "string" ||
    !/^application\/json(?:\s*;|$)/i.test(contentType) ||
    (contentLength !== null &&
      (!/^\d+$/.test(contentLength) ||
        Number(contentLength) > MAX_RESPONSE_BYTES)) ||
    typeof response.body?.getReader !== "function"
  ) {
    fail("INVALID_RESPONSE");
  }

  const reader = response.body.getReader();
  const cancelReader = () => {
    reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", cancelReader, { once: true });
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let body = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) fail("INVALID_RESPONSE");
      bytes += value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) fail("INVALID_RESPONSE");
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    return JSON.parse(body);
  } catch (error) {
    if (error instanceof TransportError) throw error;
    fail("INVALID_RESPONSE");
  } finally {
    // Do not wait for a misbehaving stream's cancellation.
    signal.removeEventListener("abort", cancelReader);
    cancelReader();
    reader.releaseLock();
  }
}

/**
 * Requires a deliberately injected fetch implementation and server-held key.
 * Caller owns opt-in proof, durable state, suppression checks, rate limiting,
 * and a persisted opaque idempotency key reused for the same confirmation.
 * A send response confirms API acceptance only, not delivery or subscription.
 */
export function createResendTransport({
  apiKey,
  fetchImpl,
  timeoutMs = 5_000,
} = {}) {
  serverOnly();
  if (
    typeof apiKey !== "string" ||
    !/^[\x21-\x7e]{1,1024}$/.test(apiKey) ||
    typeof fetchImpl !== "function" ||
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > 30_000
  ) {
    fail("INVALID_CONFIGURATION");
  }

  async function request(
    path,
    { method = "GET", body, idempotencyKey, allowMissing = false } = {},
  ) {
    serverOnly();
    const controller = new AbortController();
    let response;
    let timer;
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => {
        reject(new TransportError("REQUEST_TIMEOUT"));
        controller.abort();
        cancelBody(response);
      }, timeoutMs);
    });
    try {
      return await Promise.race([
        deadline,
        (async () => {
          const url = `${API_ORIGIN}${path}`;
          response = await fetchImpl(url, {
            method,
            headers: {
              Authorization: `Bearer ${apiKey}`,
              Accept: "application/json",
              ...(body ? { "Content-Type": "application/json" } : {}),
              ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
            },
            ...(body ? { body: JSON.stringify(body) } : {}),
            redirect: "error",
            credentials: "omit",
            cache: "no-store",
            signal: controller.signal,
          });
          if (controller.signal.aborted) fail("REQUEST_TIMEOUT");
          if (!response || !Number.isInteger(response.status))
            fail("INVALID_RESPONSE");
          if (
            response.redirected ||
            response.type === "opaqueredirect" ||
            (response.status >= 300 && response.status < 400)
          ) {
            fail("REDIRECT_REJECTED");
          }
          if (response.url && response.url !== url) fail("INVALID_RESPONSE");
          if (allowMissing && response.status === 404) return NOT_FOUND;
          if (response.status === 401 || response.status === 403)
            fail("AUTHORIZATION_FAILED");
          if (response.status === 429) fail("RATE_LIMITED");
          if (response.status >= 500 && response.status <= 599)
            fail("PROVIDER_UNAVAILABLE");
          if (response.status !== 200) fail("REQUEST_REJECTED");
          return await readJson(response, controller.signal);
        })(),
      ]);
    } catch (error) {
      if (error instanceof TransportError) throw error;
      fail("REQUEST_FAILED");
    } finally {
      clearTimeout(timer);
      cancelBody(response);
    }
  }

  async function sendConfirmation({
    email,
    from,
    replyTo,
    subject,
    text,
    idempotencyKey,
  } = {}) {
    serverOnly();
    const recipient = normalizeEmail(email);
    const replyAddress = normalizeEmail(replyTo);
    if (
      !SENDERS.has(from) ||
      typeof subject !== "string" ||
      subject.trim().length === 0 ||
      subject.length > 160 ||
      /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(subject) ||
      typeof text !== "string" ||
      text.trim().length === 0 ||
      text.length > 12_000 ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(text) ||
      typeof idempotencyKey !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9_/-]{15,255}$/.test(idempotencyKey)
    ) {
      fail("INVALID_REQUEST");
    }
    const result = await request("/emails", {
      method: "POST",
      idempotencyKey,
      body: { from, to: [recipient], reply_to: replyAddress, subject, text },
    });
    if (!isRecord(result) || !validId(result.id)) fail("INVALID_RESPONSE");
    return { id: result.id };
  }

  async function getContact(email) {
    const normalized = normalizeEmail(email);
    const result = await request(
      `/contacts/${encodeURIComponent(normalized)}`,
      { allowMissing: true },
    );
    if (result === NOT_FOUND) return null;
    if (
      !isRecord(result) ||
      result.object !== "contact" ||
      !validId(result.id) ||
      result.email !== normalized ||
      typeof result.unsubscribed !== "boolean"
    ) {
      fail("INVALID_RESPONSE");
    }
    return { id: result.id, unsubscribed: result.unsubscribed };
  }

  async function getSuppression(email) {
    const normalized = normalizeEmail(email);
    const result = await request(
      `/suppressions/${encodeURIComponent(normalized)}`,
      { allowMissing: true },
    );
    if (result === NOT_FOUND) return null;
    if (
      !isRecord(result) ||
      result.object !== "suppression" ||
      !validId(result.id) ||
      result.email !== normalized ||
      !SUPPRESSION_ORIGINS.has(result.origin)
    ) {
      fail("INVALID_RESPONSE");
    }
    return { id: result.id, origin: result.origin };
  }

  return Object.freeze({ sendConfirmation, getContact, getSuppression });
}
