/**
 * Shared sessionStorage contract for the public-quote → login → dashboard handoff.
 *
 * Flow:
 *  1. Public /remittance page: user fills form and clicks Continue
 *       → calls storeQuoteAndRedirect({ usdAmount, deliveryMethod, paymentMethod, plaidLinked })
 *       → saves quote to sessionStorage and returns the login path to navigate to
 *
 *  2. /login page: after successful sign-in
 *       → calls consumePostLoginRedirect()
 *       → reads and removes the redirect key; falls back to "/dashboard"
 *
 *  3. /dashboard/remittance: on mount
 *       → calls popRestoredQuote()
 *       → reads and removes the quote; returns null if none or if JSON is malformed
 */

import type { DeliveryMethod, PaymentMethod } from "./remittance";

export const REMITTANCE_QUOTE_KEY  = "samra_remittance_quote";
export const POST_LOGIN_REDIRECT_KEY = "samra_post_login_redirect";

export interface StoredQuote {
  usdAmount: string;
  deliveryMethod: DeliveryMethod;
  paymentMethod: PaymentMethod;
  plaidLinked: boolean;
}

/**
 * Persist the quote to sessionStorage and prepare the post-login redirect.
 * Call on the public /remittance page before navigating to login.
 * Returns the path the caller should navigate to ("/login").
 */
export function storeQuoteAndRedirect(quote: StoredQuote): "/login" {
  try {
    sessionStorage.setItem(REMITTANCE_QUOTE_KEY, JSON.stringify(quote));
    sessionStorage.setItem(POST_LOGIN_REDIRECT_KEY, "/dashboard/remittance");
  } catch {
    // sessionStorage unavailable (e.g. private-browsing with storage disabled)
  }
  return "/login";
}

/**
 * Consume and return the post-login redirect path.
 * Call on /login after a successful sign-in.
 * Removes the key so it cannot be replayed; falls back to "/dashboard".
 */
export function consumePostLoginRedirect(): string {
  try {
    const redirect = sessionStorage.getItem(POST_LOGIN_REDIRECT_KEY) ?? "/dashboard";
    sessionStorage.removeItem(POST_LOGIN_REDIRECT_KEY);
    return redirect;
  } catch {
    return "/dashboard";
  }
}

/**
 * Consume and return the stored quote for restoration.
 * Call on /dashboard/remittance in a useEffect on mount.
 * Removes the key so it is applied exactly once.
 * Returns null if no quote is stored or if the stored JSON is malformed.
 */
export function popRestoredQuote(): StoredQuote | null {
  try {
    const raw = sessionStorage.getItem(REMITTANCE_QUOTE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(REMITTANCE_QUOTE_KEY);
    const parsed = JSON.parse(raw) as Partial<StoredQuote>;
    // Validate required string fields; reject if core fields are missing
    if (!parsed.usdAmount || !parsed.deliveryMethod || !parsed.paymentMethod) return null;
    return {
      usdAmount: parsed.usdAmount,
      deliveryMethod: parsed.deliveryMethod,
      paymentMethod: parsed.paymentMethod,
      plaidLinked: parsed.plaidLinked === true,
    };
  } catch {
    return null;
  }
}
