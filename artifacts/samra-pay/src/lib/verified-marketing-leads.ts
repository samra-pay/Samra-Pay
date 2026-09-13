import type { PublicLanguage } from "./public-i18n";
export const MARKETING_NOTICE_VERSION = "marketing-2026-09-09";
export const verifiedLeadsEnabled = () =>
  import.meta.env.VITE_SAMRA_VERIFIED_LEADS_ENABLED === "true";
/** No storage or identifier stitching. Capture only approved values on the current page after analytics consent. */
export function leadAttribution(
  url: URL,
  permitted: boolean,
): Record<string, string> {
  if (!permitted) return {};
  const allowed: Record<string, readonly string[]> = {
    source: ["facebook", "instagram", "x", "youtube", "tiktok"],
    medium: ["social"],
    campaign: ["social_profile", "ask_samra", "product_demo"],
    content: ["bio", "channel_link", "post", "video"],
  };
  const result: Record<string, string> = {};
  for (const [key, values] of Object.entries(allowed)) {
    const value = url.searchParams.get("utm_" + key);
    if (value && values.includes(value)) result[key] = value;
  }
  return result.source && result.medium && result.campaign ? result : {};
}
export async function registerVerifiedLead(input: {
  email: string;
  locale: PublicLanguage;
  website: string;
  adsConsent: boolean;
  idempotencyKey: string;
  attribution: Record<string, string>;
}) {
  const response = await fetch("/api/v1/marketing-leads", {
    method: "POST",
    credentials: "omit",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": input.idempotencyKey,
    },
    body: JSON.stringify({
      email: input.email,
      locale: input.locale,
      website: input.website,
      emailConsent: true,
      adsConsent: input.adsConsent,
      noticeVersion: MARKETING_NOTICE_VERSION,
      attribution: input.attribution,
    }),
  });
  if (!response.ok || (await response.json()).accepted !== true)
    throw new Error("MARKETING_LEAD_UNAVAILABLE");
}
