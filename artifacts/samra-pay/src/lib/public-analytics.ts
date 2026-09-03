import config from "../content/public-analytics.json";
import { normalizePublicPath, resolvePublicRoute } from "./public-routes";

export const CONSENT_KEY = "samra-public-analytics-consent-v1";
export const PREFERENCES_EVENT = "samra-analytics-preferences";
export type AnalyticsChoice = "granted" | "denied";
const day = 86_400_000;
const disableKey = `ga-disable-${config.measurementId}` as const;
type AnalyticsWindow = Window & {
  dataLayer?: IArguments[];
  gtag?: (...args: unknown[]) => void;
  [key: `ga-disable-${string}`]: boolean;
};
const analyticsWindow = window as unknown as AnalyticsWindow;
let started = false;
let withdrawn = false;

export function privacySignalEnabled() {
  return (
    (navigator as Navigator & { globalPrivacyControl?: boolean })
      .globalPrivacyControl === true || navigator.doNotTrack === "1"
  );
}

export function readAnalyticsChoice(now = Date.now()): AnalyticsChoice | null {
  if (privacySignalEnabled()) return "denied";
  try {
    const stored = JSON.parse(localStorage.getItem(CONSENT_KEY) ?? "null");
    if (
      stored &&
      ["granted", "denied"].includes(stored.choice) &&
      Number.isFinite(stored.expires) &&
      stored.expires > now &&
      stored.expires <= now + config.consentDays * day
    )
      return stored.choice;
  } catch {
    /* Unavailable or malformed storage never grants consent. */
  }
  return null;
}

export function storeAnalyticsChoice(choice: AnalyticsChoice) {
  try {
    localStorage.setItem(
      CONSENT_KEY,
      JSON.stringify({
        choice,
        expires: Date.now() + config.consentDays * day,
      }),
    );
    return true;
  } catch {
    return false;
  }
}

export function publicPageParameters(href: string, referrer: string) {
  const url = new URL(href);
  const route = resolvePublicRoute(url.pathname);
  if (url.origin !== config.origin || !route) return null;
  let referralOrigin = "";
  try {
    const referral = new URL(referrer);
    if (["https:", "http:"].includes(referral.protocol))
      referralOrigin = referral.origin;
  } catch {
    /* Direct visits have no referrer. */
  }
  return {
    page_location: config.origin + normalizePublicPath(url.pathname),
    page_title: `Samra Pay | ${route}`,
    page_referrer: referralOrigin,
  };
}

export function startPublicAnalytics() {
  const page = publicPageParameters(window.location.href, document.referrer);
  if (!page || started || withdrawn || readAnalyticsChoice() !== "granted")
    return false;
  // Basic consent mode: even the Google script is absent before opt-in.
  started = true;
  analyticsWindow[disableKey] = false;
  analyticsWindow.dataLayer ??= [];
  function gtag(..._args: unknown[]) {
    analyticsWindow.dataLayer!.push(arguments);
  }
  analyticsWindow.gtag = gtag;
  gtag("consent", "default", {
    analytics_storage: "denied",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    personalization_storage: "denied",
  });
  gtag("consent", "update", { analytics_storage: "granted" });
  const settings = {
    ...page,
    send_page_view: false,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    ads_data_redaction: true,
    url_passthrough: false,
    cookie_domain: "none",
    cookie_prefix: config.cookiePrefix,
    cookie_expires: config.cookieDays * 86_400,
    cookie_update: false,
  };
  // Override URL/title/referrer globally as well as per property so automatic
  // session and engagement events cannot inherit query strings or fragments.
  gtag("set", settings);
  gtag("js", new Date());
  gtag("config", config.measurementId, settings);
  gtag("event", "page_view", { ...page, send_to: config.measurementId });
  const script = document.createElement("script");
  script.id = "samra-public-analytics";
  script.async = true;
  script.referrerPolicy = "no-referrer";
  script.src = `https://www.googletagmanager.com/gtag/js?id=${config.measurementId}`;
  document.head.append(script);
  return true;
}

export function analyticsNeedsReload() {
  return (
    withdrawn &&
    publicPageParameters(window.location.href, document.referrer) !== null
  );
}

export function stopPublicAnalytics() {
  analyticsWindow[disableKey] = true;
  // Discard an unprocessed grant/config queue if withdrawal races script load.
  if (analyticsWindow.dataLayer) analyticsWindow.dataLayer.length = 0;
  analyticsWindow.gtag?.("consent", "update", {
    analytics_storage: "denied",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });
  document.getElementById("samra-public-analytics")?.remove();
  for (const cookie of document.cookie.split(";")) {
    const name = cookie.trim().split("=")[0];
    if (name.startsWith(`${config.cookiePrefix}_`)) {
      document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax; Secure`;
    }
  }
  withdrawn ||= started;
  return started;
}
