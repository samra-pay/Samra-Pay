import { afterEach, describe, expect, it, vi } from "vitest";
import {
  COMING_SOON_CONSENT_VERSION,
  subscribePublicWaitlist,
} from "./public-waitlist";

afterEach(() => vi.unstubAllGlobals());

describe("public waitlist", () => {
  it("sends explicit versioned consent without acquisition or device data", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          accepted: true,
          acceptedAt: "2026-08-30T13:00:00.000Z",
        }),
        { status: 202, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await subscribePublicWaitlist({
      email: "founder@example.test",
      locale: "en",
      idempotencyKey: "waitlist-test-001",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/v1/waitlist/subscriptions");
    expect(init.headers).toEqual({
      "Content-Type": "application/json",
      "Idempotency-Key": "waitlist-test-001",
    });
    expect(JSON.parse(String(init.body))).toEqual({
      email: "founder@example.test",
      consent: true,
      consentVersion: COMING_SOON_CONSENT_VERSION,
      locale: "en",
      website: "",
    });
    expect(String(init.body)).not.toMatch(/campaign|device|referrer|url/i);
  });

  it("fails honestly when the subscription service is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 503 })));
    await expect(
      subscribePublicWaitlist({
        email: "founder@example.test",
        locale: "en",
        idempotencyKey: "waitlist-test-002",
      }),
    ).rejects.toThrow("WAITLIST_UNAVAILABLE");
  });
});
