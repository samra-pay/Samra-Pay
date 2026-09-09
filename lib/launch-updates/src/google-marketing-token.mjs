import { readBoundedText } from "./marketing-http.mjs";
/** Offline access must be granted by the account owner. No OAuth consent flow runs here. */
export function createGoogleMarketingToken({
  clientId,
  clientSecret,
  refreshToken,
  fetchImpl = fetch,
  now = () => Date.now(),
}) {
  if (
    [clientId, clientSecret, refreshToken].some(
      (v) =>
        typeof v !== "string" ||
        v.length < 8 ||
        v.length > 4096 ||
        /[\r\n]/.test(v),
    )
  )
    throw new Error("GOOGLE_REFRESH_CONFIGURATION_REQUIRED");
  let cached = null,
    flight = null;
  return async () => {
    if (cached && cached.expires > now() + 60000) return cached.token;
    if (flight) return flight;
    flight = (async () => {
      try {
        const r = await fetchImpl("https://oauth2.googleapis.com/token", {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(5000),
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
            grant_type: "refresh_token",
          }).toString(),
        });
        if (!r.ok) throw new Error("REFRESH_FAILED");
        const text = await readBoundedText(r, 16384);
        if (text.length > 16384) throw new Error("REFRESH_FAILED");
        const data = JSON.parse(text);
        if (
          typeof data.access_token !== "string" ||
          !data.access_token ||
          data.token_type !== "Bearer" ||
          !Number.isFinite(data.expires_in) ||
          data.expires_in < 120 ||
          data.expires_in > 86400
        )
          throw new Error("REFRESH_FAILED");
        cached = {
          token: data.access_token,
          expires: now() + data.expires_in * 1000,
        };
        return cached.token;
      } catch {
        cached = null;
        throw new Error("GOOGLE_REFRESH_FAILED");
      }
    })();
    try {
      return await flight;
    } finally {
      flight = null;
    }
  };
}
