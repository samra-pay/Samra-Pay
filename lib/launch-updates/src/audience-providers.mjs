import { createHash } from "node:crypto";
const digest = (s) => createHash("sha256").update(s).digest("hex");
const numeric = (s) => typeof s === "string" && /^\d{5,30}$/.test(s);
export function audienceEmailHash(email, provider) {
  let value = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || value.length > 254)
    throw new Error("INVALID_EMAIL");
  // Google's Customer Match normalization removes Gmail local-part periods, not plus tags.
  if (provider === "google") {
    const [local, domain] = value.split("@");
    if (domain === "gmail.com" || domain === "googlemail.com")
      value = local.replaceAll(".", "") + "@" + domain;
  }
  return digest(value);
}
async function call(fetchImpl, url, token, body, method = "POST") {
  if (typeof token !== "string" || token.length < 10 || /[\s\r\n]/.test(token))
    throw new Error("INVALID_PROVIDER_TOKEN");
  try {
    const r = await fetchImpl(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw new Error("PROVIDER_REJECTED");
    // Bound provider response data. Never log raw payloads/errors.
    const reader = r.body.getReader();
    let size = 0;
    const chunks = [];
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 65536) throw new Error("PROVIDER_RESPONSE_TOO_LARGE");
        chunks.push(value);
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
    return JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    throw new Error("AUDIENCE_PROVIDER_UNCERTAIN");
  }
}
export function createGoogleAudienceAdapter({
  accountId,
  audienceId,
  termsAccepted,
  accessToken,
  fetchImpl = fetch,
}) {
  if (
    !numeric(accountId) ||
    !numeric(audienceId) ||
    termsAccepted !== true ||
    typeof accessToken !== "function"
  )
    throw new Error("GOOGLE_AUDIENCE_CONFIGURATION_REQUIRED");
  const destination = {
    reference: "samra",
    operatingAccount: { accountType: "GOOGLE_ADS", accountId },
    productDestinationId: audienceId,
  };
  return Object.freeze({
    async submit({ email, member }) {
      const body = {
        destinations: [destination],
        audienceMembers: [
          {
            destinationReferences: ["samra"],
            userData: {
              userIdentifiers: [
                { emailAddress: audienceEmailHash(email, "google") },
              ],
            },
          },
        ],
        encoding: "HEX",
        ...(member
          ? {
              consent: {
                adUserData: "CONSENT_GRANTED",
                adPersonalization: "CONSENT_GRANTED",
              },
              termsOfService: { customerMatchTermsOfServiceStatus: "ACCEPTED" },
            }
          : {}),
      };
      const r = await call(
        fetchImpl,
        `https://datamanager.googleapis.com/v1/audienceMembers:${member ? "ingest" : "remove"}`,
        await accessToken(),
        body,
      );
      if (
        typeof r.requestId !== "string" ||
        !r.requestId ||
        r.requestId.length > 256 ||
        r.fieldWarnings?.length
      )
        throw new Error("GOOGLE_RECEIPT_UNCERTAIN");
      return { state: "pending", requestId: r.requestId };
    },
    async status(requestId) {
      if (typeof requestId !== "string" || !requestId || requestId.length > 256)
        throw new Error("INVALID_RECEIPT");
      const r = await call(
        fetchImpl,
        `https://datamanager.googleapis.com/v1/requestStatus:retrieve?requestId=${encodeURIComponent(requestId)}`,
        await accessToken(),
        null,
        "GET",
      );
      const rows = r.requestStatusPerDestination;
      if (!Array.isArray(rows) || rows.length !== 1)
        throw new Error("GOOGLE_STATUS_UNCERTAIN");
      const s = rows[0];
      if (
        s.destination?.productDestinationId !== audienceId ||
        s.destination?.operatingAccount?.accountId !== accountId
      )
        throw new Error("GOOGLE_DESTINATION_MISMATCH");
      if (
        s.requestStatus === "SUCCESS" &&
        !s.errorInfo &&
        !s.warningInfo?.warningCounts?.length
      )
        return "accepted";
      if (
        ["FAILED", "PARTIAL_SUCCESS"].includes(s.requestStatus) ||
        s.warningInfo?.warningCounts?.length
      )
        return "blocked";
      return "pending";
    },
  });
}
export function createMetaAudienceAdapter({
  audienceId,
  apiVersion,
  termsAccepted,
  accessToken,
  fetchImpl = fetch,
}) {
  if (
    !numeric(audienceId) ||
    !/^v\d{2}\.0$/.test(apiVersion) ||
    termsAccepted !== true ||
    typeof accessToken !== "function"
  )
    throw new Error("META_AUDIENCE_CONFIGURATION_REQUIRED");
  return Object.freeze({
    async submit({ email, member }) {
      const body = {
        payload: {
          schema: ["EMAIL"],
          data: [[audienceEmailHash(email, "meta")]],
        },
      };
      const r = await call(
        fetchImpl,
        `https://graph.facebook.com/${apiVersion}/${audienceId}/users`,
        await accessToken(),
        body,
        member ? "POST" : "DELETE",
      );
      if (
        String(r.audience_id) !== audienceId ||
        r.num_received !== 1 ||
        r.num_invalid_entries !== 0
      )
        throw new Error("META_RECEIPT_UNCERTAIN");
      // Acknowledged upload, never a claim of a matched person or ad delivery.
      return {
        state: "accepted",
        requestId: String(r.session_id ?? "accepted"),
      };
    },
    async status() {
      throw new Error("META_MATCH_STATUS_UNAVAILABLE");
    },
  });
}
