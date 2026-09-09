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
  it.each(["facebook", "instagram", "x", "youtube", "tiktok"])(
    "attributes approved %s profile traffic only after consent",
    (source) => {
      vi.spyOn(window, "location", "get").mockReturnValue(
        new URL(
          `https://www.samrapay.com/?utm_source=${source}&utm_medium=social&utm_campaign=social_profile&utm_content=bio&email=private&gclid=secret#private`,
        ) as unknown as Location,
      );
      expect(analytics.startPublicAnalytics()).toBe(false);
      expect(state.dataLayer).toBeUndefined();
      analytics.storeAnalyticsChoice("granted");
      expect(analytics.startPublicAnalytics()).toBe(true);
      expect(commands().find((args) => args[0] === "config")?.[2]).toEqual(
        expect.objectContaining({
          page_location: "https://www.samrapay.com/",
          campaign_source: source,
          campaign_medium: "social",
          campaign_name: "social_profile",
          campaign_content: "bio",
        }),
      );
      expect(JSON.stringify(commands())).not.toMatch(
        /private|secret|gclid|email|utm_/,
      );
      analytics.stopPublicAnalytics();
      expect(analytics.startPublicAnalytics()).toBe(false);
    },
  );

  it.each([
    "utm_source=someone%40example.com&utm_medium=social&utm_campaign=social_profile",
    "utm_source=instagram&utm_medium=social&utm_campaign=customer_123",
    "utm_source=instagram&utm_source=facebook&utm_medium=social&utm_campaign=social_profile",
    "utm_source=instagram&utm_campaign=social_profile",
    "utm_source=instagram&utm_medium=paid_social&utm_campaign=social_profile",
  ])("rejects unapproved or ambiguous campaign input: %s", (query) => {
    expect(
      analytics.publicCampaignParameters(
        new URL(`https://www.samrapay.com/?${query}`),
      ),
    ).toEqual({});
  });

  it("drops arbitrary content while retaining a valid approved campaign", () => {
    expect(
      analytics.publicCampaignParameters(
        new URL(
          "https://www.samrapay.com/?utm_source=youtube&utm_medium=social&utm_campaign=ask_samra&utm_content=private-person",
        ),
      ),
    ).toEqual({
      campaign_source: "youtube",
      campaign_medium: "social",
      campaign_name: "ask_samra",
    });
  });

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
