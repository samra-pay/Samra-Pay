import { afterEach, describe, expect, it, vi } from "vitest";
import {
  leadAttribution,
  registerVerifiedLead,
} from "./verified-marketing-leads";
afterEach(() => vi.unstubAllGlobals());
describe("verified lead acquisition", () => {
  it("keeps only approved current-page attribution with consent", () => {
    const url = new URL(
      "https://www.samrapay.com/?utm_source=instagram&utm_medium=social&utm_campaign=ask_samra&utm_content=bio&email=private@example.test",
    );
    expect(leadAttribution(url, false)).toEqual({});
    expect(leadAttribution(url, true)).toEqual({
      source: "instagram",
      medium: "social",
      campaign: "ask_samra",
      content: "bio",
    });
    url.searchParams.set("utm_source", "private@example.test");
    expect(leadAttribution(url, true)).toEqual({});
  });
  it("transmits independent choices and caller-stable idempotency without claiming verification", async () => {
    const spy = vi
      .fn()
      .mockResolvedValue(Response.json({ accepted: true }, { status: 202 }));
    vi.stubGlobal("fetch", spy);
    await registerVerifiedLead({
      email: "reader@example.test",
      locale: "en",
      website: "",
      adsConsent: false,
      idempotencyKey: "stable-test-key",
      attribution: {},
    });
    expect(spy.mock.calls[0][0]).toBe("/api/v1/marketing-leads");
    const options = spy.mock.calls[0][1];
    expect(options.headers["Idempotency-Key"]).toBe("stable-test-key");
    expect(JSON.parse(options.body)).toMatchObject({
      emailConsent: true,
      adsConsent: false,
      noticeVersion: "marketing-2026-09-09",
    });
  });
});
