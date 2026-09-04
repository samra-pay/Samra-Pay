const API_ORIGIN = "https://api.resend.com";
const MAX_RESPONSE_BYTES = 16_384;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

class WaitlistTransportError extends Error {
  constructor(code) {
    super(`Resend waitlist transport: ${code}`);
    this.name = "WaitlistTransportError";
    this.code = code;
  }
}

function fail(code) {
  throw new WaitlistTransportError(code);
}

function normalizeEmail(value) {
  if (typeof value !== "string" || value.length > 254) fail("INVALID_REQUEST");
  const email = value.trim().normalize("NFKC").toLowerCase();
  const parts = email.split("@");
  if (parts.length !== 2 || parts[0].length > 64) fail("INVALID_REQUEST");
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
    fail("INVALID_REQUEST");
  }
  return email;
}

function cancelBody(response) {
  try {
    const pending = response?.body?.cancel();
    if (pending && typeof pending.catch === "function") pending.catch(() => {});
  } catch {
    // A consumed or locked body needs no additional cleanup.
  }
}

async function readJson(response, signal) {
  const contentType = response.headers?.get("content-type");
  const contentLength = response.headers?.get("content-length");
  if (
    typeof contentType !== "string" ||
    !/^application\/json(?:\s*;|$)/iu.test(contentType) ||
    (contentLength !== null &&
      (!/^\d+$/u.test(contentLength) ||
        Number(contentLength) > MAX_RESPONSE_BYTES)) ||
    typeof response.body?.getReader !== "function"
  ) {
    fail("INVALID_RESPONSE");
  }

  const reader = response.body.getReader();
  const cancelReader = () => reader.cancel().catch(() => {});
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
    if (error instanceof WaitlistTransportError) throw error;
    fail("INVALID_RESPONSE");
  } finally {
    signal.removeEventListener("abort", cancelReader);
    cancelReader();
    reader.releaseLock();
  }
}

export function createResendWaitlistTransport({
  apiKey,
  fetchImpl,
  timeoutMs = 5_000,
  minimumIntervalMs = 0,
  clock = () => Date.now(),
  sleep = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
} = {}) {
  if (
    typeof window !== "undefined" ||
    typeof apiKey !== "string" ||
    !/^re_[A-Za-z0-9_-]{10,}$/u.test(apiKey) ||
    typeof fetchImpl !== "function" ||
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > 30_000 ||
    !Number.isInteger(minimumIntervalMs) ||
    minimumIntervalMs < 0 ||
    minimumIntervalMs > 5_000 ||
    typeof clock !== "function" ||
    typeof sleep !== "function"
  ) {
    fail("INVALID_CONFIGURATION");
  }

  let nextProviderRequestAt = 0;
  let reservation = Promise.resolve();

  async function reserveProviderRequest() {
    let release;
    const previous = reservation;
    reservation = new Promise((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      const wait = Math.max(0, nextProviderRequestAt - clock());
      if (wait > 0) await sleep(wait);
      nextProviderRequestAt = clock() + minimumIntervalMs;
    } finally {
      release();
    }
  }

  async function request(
    path,
    { method = "GET", body, allowMissing = false, allowConflict = false } = {},
  ) {
    await reserveProviderRequest();
    const controller = new AbortController();
    let response;
    let timer;
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => {
        reject(new WaitlistTransportError("REQUEST_TIMEOUT"));
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
              "User-Agent": "SamraPay-Waitlist/1.0",
              ...(body ? { "Content-Type": "application/json" } : {}),
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
          if (allowMissing && response.status === 404) {
            cancelBody(response);
            return null;
          }
          if (allowConflict && response.status === 409) {
            cancelBody(response);
            return null;
          }
          if (response.status === 401 || response.status === 403)
            fail("AUTHORIZATION_FAILED");
          if (response.status === 429) fail("RATE_LIMITED");
          if (response.status >= 500 && response.status <= 599)
            fail("PROVIDER_UNAVAILABLE");
          if (response.status !== 200 && response.status !== 201)
            fail("REQUEST_REJECTED");
          return await readJson(response, controller.signal);
        })(),
      ]);
    } catch (error) {
      if (error instanceof WaitlistTransportError) throw error;
      fail("REQUEST_FAILED");
    } finally {
      clearTimeout(timer);
      cancelBody(response);
    }
  }

  async function getContact(email) {
    const normalized = normalizeEmail(email);
    const result = await request(
      `/contacts/${encodeURIComponent(normalized)}`,
      { allowMissing: true },
    );
    if (result === null) return null;
    if (
      !result ||
      typeof result !== "object" ||
      result.object !== "contact" ||
      typeof result.id !== "string" ||
      !UUID.test(result.id) ||
      result.email !== normalized ||
      typeof result.unsubscribed !== "boolean"
    ) {
      fail("INVALID_RESPONSE");
    }
    return Object.freeze({ id: result.id, unsubscribed: result.unsubscribed });
  }

  async function createContact({ email, segmentId, topicId } = {}) {
    const normalized = normalizeEmail(email);
    if (!UUID.test(segmentId ?? "") || !UUID.test(topicId ?? ""))
      fail("INVALID_REQUEST");
    const result = await request("/contacts", {
      method: "POST",
      body: {
        email: normalized,
        unsubscribed: false,
        segments: [{ id: segmentId }],
        topics: [{ id: topicId, subscription: "opt_in" }],
      },
    });
    if (
      !result ||
      typeof result !== "object" ||
      result.object !== "contact" ||
      typeof result.id !== "string" ||
      !UUID.test(result.id)
    ) {
      fail("INVALID_RESPONSE");
    }
    return Object.freeze({ id: result.id });
  }

  async function addContactToSegment({ contactId, segmentId } = {}) {
    if (!UUID.test(contactId ?? "") || !UUID.test(segmentId ?? ""))
      fail("INVALID_REQUEST");
    const result = await request(
      `/contacts/${encodeURIComponent(contactId)}/segments/${encodeURIComponent(segmentId)}`,
      { method: "POST", allowConflict: true },
    );
    if (result !== null && (!result || result.id !== segmentId))
      fail("INVALID_RESPONSE");
  }

  async function optContactIntoTopic({ contactId, topicId } = {}) {
    if (!UUID.test(contactId ?? "") || !UUID.test(topicId ?? ""))
      fail("INVALID_REQUEST");
    const result = await request(
      `/contacts/${encodeURIComponent(contactId)}/topics`,
      {
        method: "PATCH",
        body: { topics: [{ id: topicId, subscription: "opt_in" }] },
      },
    );
    if (!result || typeof result.id !== "string" || !UUID.test(result.id))
      fail("INVALID_RESPONSE");
  }

  return Object.freeze({
    getContact,
    createContact,
    addContactToSegment,
    optContactIntoTopic,
  });
}
