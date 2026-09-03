import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import config from "../content/public-analytics.json";

let analytics: typeof import("./public-analytics");
const key = "samra-public-analytics-consent-v1";
const state = window as unknown as Record<string, unknown>;
const disableKey = `ga-disable-${config.measurementId}`;
const commands = () =>
  (state.dataLayer as IArguments[]).map((args) => Array.from(args));

beforeEach(async () => {
  vi.resetModules();
  localStorage.clear();
  delete state.dataLayer;
  delete state.gtag;
  delete state[disableKey];
  vi.spyOn(window, "location", "get").mockReturnValue(
    new URL(
      "https://www.samrapay.com/?email=private#secret",
    ) as unknown as Location,
  );
  vi.spyOn(document, "referrer", "get").mockReturnValue(
    "https://example.com/private?email=private#secret",
  );
  vi.spyOn(document.head, "append").mockImplementation(() => {});
  analytics = await import("./public-analytics");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("public analytics consent and privacy boundary", () => {
  it("makes no tag or data queue before a saved opt-in", () => {
    expect(analytics.readAnalyticsChoice()).toBeNull();
    expect(analytics.startPublicAnalytics()).toBe(false);
    expect(document.head.append).not.toHaveBeenCalled();
    expect(state.dataLayer).toBeUndefined();
    analytics.storeAnalyticsChoice("denied");
    expect(analytics.startPublicAnalytics()).toBe(false);
    expect(document.head.append).not.toHaveBeenCalled();
  });

  it.each([
    "bad json",
    "null",
    "{}",
    '{"choice":"granted","expires":0}',
    '{"choice":"granted","expires":9999999999999}',
    '{"choice":"yes","expires":9999999999999}',
  ])("rejects malformed or expired consent: %s", (value) => {
    localStorage.setItem(key, value);
    expect(analytics.readAnalyticsChoice()).toBeNull();
    expect(analytics.startPublicAnalytics()).toBe(false);
  });

  it("expires a stored choice without refreshing its lifetime", () => {
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);
    expect(analytics.storeAnalyticsChoice("granted")).toBe(true);
    expect(analytics.readAnalyticsChoice(now + 1)).toBe("granted");
    expect(analytics.readAnalyticsChoice(now + 180 * 86_400_000)).toBeNull();
  });

  it("fails closed when browser storage is unavailable", () => {
    vi.stubGlobal("localStorage", {
      getItem() {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("blocked");
      },
    });
    expect(analytics.storeAnalyticsChoice("granted")).toBe(false);
    expect(analytics.readAnalyticsChoice()).toBeNull();
    expect(analytics.startPublicAnalytics()).toBe(false);
  });

  it.each(["globalPrivacyControl", "doNotTrack"])(
    "honors %s even with prior consent",
    (signal) => {
      analytics.storeAnalyticsChoice("granted");
      vi.stubGlobal("navigator", {
        [signal]: signal === "doNotTrack" ? "1" : true,
      });
      expect(analytics.readAnalyticsChoice()).toBe("denied");
      expect(analytics.startPublicAnalytics()).toBe(false);
    },
  );

  it("loads one async tag and one sanitized page view with advertising off", () => {
    analytics.storeAnalyticsChoice("granted");
    expect(analytics.startPublicAnalytics()).toBe(true);
    expect(analytics.startPublicAnalytics()).toBe(false);
    expect(document.head.append).toHaveBeenCalledTimes(1);
    const script = vi.mocked(document.head.append).mock
      .calls[0][0] as HTMLScriptElement;
    expect(script.src).toBe(
      "https://www.googletagmanager.com/gtag/js?id=G-T4THKMM4Y5",
    );
    expect(script.async).toBe(true);
    expect(script.referrerPolicy).toBe("no-referrer");
    const queue = commands();
    expect(queue[0]).toEqual([
      "consent",
      "default",
      expect.objectContaining({
        analytics_storage: "denied",
        ad_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied",
      }),
    ]);
    expect(queue[1]).toEqual([
      "consent",
      "update",
      { analytics_storage: "granted" },
    ]);
    expect(queue.find((args) => args[0] === "config")).toEqual([
      "config",
      config.measurementId,
      expect.objectContaining({
        send_page_view: false,
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
        cookie_domain: "none",
        cookie_prefix: "samra_public",
        cookie_expires: 60 * 86_400,
        cookie_update: false,
        page_location: "https://www.samrapay.com/",
        page_referrer: "https://example.com",
        page_title: "Samra Pay | home",
      }),
    ]);
    expect(queue.filter((args) => args[0] === "event")).toEqual([
      [
        "event",
        "page_view",
        {
          page_location: "https://www.samrapay.com/",
          page_referrer: "https://example.com",
          page_title: "Samra Pay | home",
          send_to: config.measurementId,
        },
      ],
    ]);
    expect(JSON.stringify(queue)).not.toMatch(
      /email|private|secret|user_id|form_submit/,
    );
  });

  it.each([
    "http://www.samrapay.com/",
    "https://samrapay.com/",
    "http://localhost:5173/",
    "https://samra-pay-production.web.app/",
    "https://samra-pay-previews--pr-1.web.app/",
    "https://app.samrapay.com/",
    "https://www.samrapay.com/dashboard",
    "https://www.samrapay.com/wallet",
    "https://www.samrapay.com/api/v1/users",
    "https://www.samrapay.com/unknown",
  ])("never loads on a noncanonical or private page: %s", (href) => {
    vi.spyOn(window, "location", "get").mockReturnValue(
      new URL(href) as unknown as Location,
    );
    analytics.storeAnalyticsChoice("granted");
    expect(analytics.startPublicAnalytics()).toBe(false);
    expect(document.head.append).not.toHaveBeenCalled();
  });

  it.each([
    "/",
    "/features",
    "/cards",
    "/cards/charge",
    "/cards/co-brand",
    "/values",
    "/faq",
    "/blog",
    "/privacy",
    "/terms",
  ])("sanitizes public page %s", (path) => {
    expect(
      analytics.publicPageParameters(
        `https://www.samrapay.com${path}?token=secret#email`,
        "javascript:private",
      ),
    ).toEqual(
      expect.objectContaining({
        page_location: `https://www.samrapay.com${path}`,
        page_referrer: "",
      }),
    );
  });

  it("withdraws immediately, clears queued events and only its own cookies", () => {
    analytics.storeAnalyticsChoice("granted");
    analytics.startPublicAnalytics();
    vi.spyOn(document, "cookie", "get").mockReturnValue(
      "samra_public_ga=one; samra_public_ga_ABC=two; other_cookie=keep; samra-language=am",
    );
    const cookies = vi
      .spyOn(document, "cookie", "set")
      .mockImplementation(() => {});
    expect(analytics.stopPublicAnalytics()).toBe(true);
    expect(state[disableKey]).toBe(true);
    expect(commands()).toEqual([
      [
        "consent",
        "update",
        expect.objectContaining({ analytics_storage: "denied" }),
      ],
    ]);
    expect(cookies.mock.calls).toEqual([
      ["samra_public_ga=; Max-Age=0; Path=/; SameSite=Lax; Secure"],
      ["samra_public_ga_ABC=; Max-Age=0; Path=/; SameSite=Lax; Secure"],
    ]);
    expect(analytics.startPublicAnalytics()).toBe(false);
    expect(analytics.analyticsNeedsReload()).toBe(true);
  });
});
