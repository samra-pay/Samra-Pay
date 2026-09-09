import { createHmac, timingSafeEqual } from "node:crypto";
const idPattern = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
/** Purpose-limited bearer capability: can withdraw, never read identity or grant consent. */
export function createPreferenceTokens({
  keys,
  activeVersion,
  now = () => Date.now(),
}) {
  if (
    !keys ||
    !Buffer.isBuffer(keys[activeVersion]) ||
    Object.entries(keys).some(
      ([v, k]) =>
        !/^[a-z0-9_-]{1,32}$/.test(v) || !Buffer.isBuffer(k) || k.length < 32,
    )
  )
    throw new Error("INVALID_PREFERENCE_KEYS");
  const pinned = Object.fromEntries(
    Object.entries(keys).map(([v, k]) => [v, Buffer.from(k)]),
  );
  const sign = (body, key) =>
    createHmac("sha256", key).update(`samra:withdraw:v1:${body}`).digest();
  return Object.freeze({
    issue(contactId) {
      if (!idPattern.test(contactId)) throw new Error("INVALID_CONTACT");
      const body = Buffer.from(
        JSON.stringify([
          contactId,
          Math.floor(now() / 1000) + 180 * 86400,
          activeVersion,
        ]),
      ).toString("base64url");
      return `${body}.${sign(body, pinned[activeVersion]).toString("base64url")}`;
    },
    verify(token) {
      try {
        if (
          typeof token !== "string" ||
          token.length > 512 ||
          !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token)
        )
          return null;
        const [body, signature] = token.split(".");
        const parsed = JSON.parse(Buffer.from(body, "base64url").toString());
        if (!Array.isArray(parsed) || parsed.length !== 3) return null;
        const [id, expires, version] = parsed;
        const key = pinned[version];
        if (
          !idPattern.test(id) ||
          !Number.isSafeInteger(expires) ||
          expires <= now() / 1000 ||
          expires > now() / 1000 + 180 * 86400 ||
          !key
        )
          return null;
        if (
          !timingSafeEqual(Buffer.from(signature, "base64url"), sign(body, key))
        )
          return null;
        return id;
      } catch {
        return null;
      }
    },
  });
}
