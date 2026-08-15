/**
 * Tests for the public-quote → login → dashboard handoff.
 *
 * All helpers tested here are the REAL functions used by the three pages:
 *   storeQuoteAndRedirect  (called by /remittance before navigating to /login)
 *   consumePostLoginRedirect (called by /login after sign-in)
 *   popRestoredQuote       (called by /dashboard/remittance on mount)
 *
 * Changing the sessionStorage key names, the fallback path, the quote
 * validation rules, or the one-shot removal semantics in remittance-handoff.ts
 * will break these tests — exactly the regressions they are here to catch.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  REMITTANCE_QUOTE_KEY,
  POST_LOGIN_REDIRECT_KEY,
  storeQuoteAndRedirect,
  consumePostLoginRedirect,
  popRestoredQuote,
  type StoredQuote,
} from "./remittance-handoff";

const SAMPLE_QUOTE: StoredQuote = {
  usdAmount: "1000",
  deliveryMethod: "bank",
  paymentMethod: "plaid",
  plaidLinked: false,
};

beforeEach(() => {
  sessionStorage.clear();
});

// ─── storeQuoteAndRedirect ────────────────────────────────────────────────────

describe("storeQuoteAndRedirect", () => {
  it("returns '/login' so the caller navigates to the login page", () => {
    const dest = storeQuoteAndRedirect(SAMPLE_QUOTE);
    expect(dest).toBe("/login");
  });

  it("writes the quote JSON to the correct sessionStorage key", () => {
    storeQuoteAndRedirect(SAMPLE_QUOTE);
    const raw = sessionStorage.getItem(REMITTANCE_QUOTE_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!)).toEqual(SAMPLE_QUOTE);
  });

  it("sets the post-login redirect to /dashboard/remittance", () => {
    storeQuoteAndRedirect(SAMPLE_QUOTE);
    expect(sessionStorage.getItem(POST_LOGIN_REDIRECT_KEY)).toBe("/dashboard/remittance");
  });

  it("round-trips all quote fields faithfully", () => {
    const quote: StoredQuote = {
      usdAmount: "2500",
      deliveryMethod: "wallet",
      paymentMethod: "card",
      plaidLinked: true,
    };
    storeQuoteAndRedirect(quote);
    const restored = JSON.parse(sessionStorage.getItem(REMITTANCE_QUOTE_KEY)!);
    expect(restored.usdAmount).toBe("2500");
    expect(restored.deliveryMethod).toBe("wallet");
    expect(restored.paymentMethod).toBe("card");
    expect(restored.plaidLinked).toBe(true);
  });
});

// ─── consumePostLoginRedirect ─────────────────────────────────────────────────

describe("consumePostLoginRedirect", () => {
  it("returns /dashboard/remittance when a remittance quote stored the redirect", () => {
    storeQuoteAndRedirect(SAMPLE_QUOTE);
    expect(consumePostLoginRedirect()).toBe("/dashboard/remittance");
  });

  it("falls back to /dashboard when no redirect key is present", () => {
    expect(consumePostLoginRedirect()).toBe("/dashboard");
  });

  it("removes the redirect key so it cannot be replayed (one-shot)", () => {
    storeQuoteAndRedirect(SAMPLE_QUOTE);
    consumePostLoginRedirect();
    expect(sessionStorage.getItem(POST_LOGIN_REDIRECT_KEY)).toBeNull();
  });

  it("does not disturb the quote key when consuming the redirect", () => {
    storeQuoteAndRedirect(SAMPLE_QUOTE);
    consumePostLoginRedirect();
    // quote must still be present for the dashboard to restore it
    expect(sessionStorage.getItem(REMITTANCE_QUOTE_KEY)).not.toBeNull();
  });
});

// ─── popRestoredQuote ─────────────────────────────────────────────────────────

describe("popRestoredQuote", () => {
  it("returns null when no quote is stored", () => {
    expect(popRestoredQuote()).toBeNull();
  });

  it("returns the full quote when a valid quote is stored", () => {
    storeQuoteAndRedirect(SAMPLE_QUOTE);
    consumePostLoginRedirect(); // simulate login step
    const restored = popRestoredQuote();
    expect(restored).toEqual(SAMPLE_QUOTE);
  });

  it("removes the quote key after reading (one-shot restore)", () => {
    storeQuoteAndRedirect(SAMPLE_QUOTE);
    popRestoredQuote();
    expect(sessionStorage.getItem(REMITTANCE_QUOTE_KEY)).toBeNull();
  });

  it("returns null and cleans up after a second call (idempotent)", () => {
    storeQuoteAndRedirect(SAMPLE_QUOTE);
    popRestoredQuote(); // first call consumes it
    expect(popRestoredQuote()).toBeNull(); // second call finds nothing
  });

  it("returns null for malformed JSON and cleans up the key", () => {
    sessionStorage.setItem(REMITTANCE_QUOTE_KEY, "{ bad json }}}");
    expect(popRestoredQuote()).toBeNull();
    // key should have been removed regardless
    expect(sessionStorage.getItem(REMITTANCE_QUOTE_KEY)).toBeNull();
  });

  it("returns null when usdAmount is missing from stored JSON", () => {
    sessionStorage.setItem(
      REMITTANCE_QUOTE_KEY,
      JSON.stringify({ deliveryMethod: "bank", paymentMethod: "balance", plaidLinked: false }),
    );
    expect(popRestoredQuote()).toBeNull();
  });

  it("returns null when deliveryMethod is missing from stored JSON", () => {
    sessionStorage.setItem(
      REMITTANCE_QUOTE_KEY,
      JSON.stringify({ usdAmount: "500", paymentMethod: "balance", plaidLinked: false }),
    );
    expect(popRestoredQuote()).toBeNull();
  });

  it("returns null when paymentMethod is missing from stored JSON", () => {
    sessionStorage.setItem(
      REMITTANCE_QUOTE_KEY,
      JSON.stringify({ usdAmount: "500", deliveryMethod: "bank", plaidLinked: false }),
    );
    expect(popRestoredQuote()).toBeNull();
  });

  it("coerces a missing plaidLinked to false (valid false value)", () => {
    sessionStorage.setItem(
      REMITTANCE_QUOTE_KEY,
      JSON.stringify({ usdAmount: "300", deliveryMethod: "wallet", paymentMethod: "card" }),
    );
    const q = popRestoredQuote();
    expect(q).not.toBeNull();
    expect(q!.plaidLinked).toBe(false);
  });

  it("coerces a truthy plaidLinked correctly", () => {
    sessionStorage.setItem(
      REMITTANCE_QUOTE_KEY,
      JSON.stringify({ usdAmount: "300", deliveryMethod: "bank", paymentMethod: "plaid", plaidLinked: true }),
    );
    const q = popRestoredQuote();
    expect(q!.plaidLinked).toBe(true);
  });
});

// ─── Full handoff flow ────────────────────────────────────────────────────────

describe("end-to-end handoff: /remittance → /login → /dashboard/remittance", () => {
  it("passes the quote through the full three-step flow with no data loss", () => {
    const original: StoredQuote = {
      usdAmount: "750",
      deliveryMethod: "bank",
      paymentMethod: "plaid",
      plaidLinked: true,
    };

    // Step 1: public remittance page stores quote and returns login path
    const loginPath = storeQuoteAndRedirect(original);
    expect(loginPath).toBe("/login");

    // Step 2: login page reads and removes redirect, navigates to dashboard
    const dashPath = consumePostLoginRedirect();
    expect(dashPath).toBe("/dashboard/remittance");
    expect(sessionStorage.getItem(POST_LOGIN_REDIRECT_KEY)).toBeNull();

    // Step 3: dashboard remittance reads and removes the quote
    const restored = popRestoredQuote();
    expect(restored).toEqual(original);
    expect(sessionStorage.getItem(REMITTANCE_QUOTE_KEY)).toBeNull();
  });

  it("leaves no sessionStorage residue after the full flow", () => {
    storeQuoteAndRedirect(SAMPLE_QUOTE);
    consumePostLoginRedirect();
    popRestoredQuote();
    expect(sessionStorage.getItem(REMITTANCE_QUOTE_KEY)).toBeNull();
    expect(sessionStorage.getItem(POST_LOGIN_REDIRECT_KEY)).toBeNull();
  });
});
