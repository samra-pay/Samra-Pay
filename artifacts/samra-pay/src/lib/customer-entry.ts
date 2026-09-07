import type { RedirectLoginOptions } from "@auth0/auth0-spa-js";
import { withApplicationPath } from "./auth0-config";

export type CustomerEntryIntent = "login" | "signup" | "recovery";

export function customerLoginOptions(
  intent: CustomerEntryIntent,
  applicationUri: string,
  audience: string,
): RedirectLoginOptions {
  return {
    appState: { returnTo: withApplicationPath(applicationUri, "/session") },
    authorizationParams: {
      audience,
      redirect_uri: applicationUri,
      ...(intent === "signup" ? { screen_hint: "signup" } : {}),
      // A UI hint to show Universal Login's managed "Forgot password?" flow.
      // This is not proof of reauthentication or authorization for recovery.
      ...(intent === "recovery" ? { prompt: "login" } : {}),
    },
  };
}

export function hasAuth0RedirectParameters(search: string): boolean {
  const parameters = new URLSearchParams(search);
  return (
    parameters.has("state") &&
    (parameters.has("code") || parameters.has("error"))
  );
}

// Only a fresh server response chooses the destination; a token or wallet is
// not evidence that Samra has granted customer access.
export function customerSessionDestination(customer: unknown, error: unknown) {
  if (error) {
    const problem = error as { status?: unknown; data?: { code?: unknown } };
    if (
      problem.status === 403 &&
      (problem.data?.code === "CUSTOMER_IDENTITY_UNBOUND" ||
        problem.data?.code === "CUSTOMER_ONBOARDING_REQUIRED")
    )
      return "/onboarding";
    return null;
  }
  return customer ? "/dashboard" : null;
}

export function shouldLoadCustomerApp(route: string | null, search: string) {
  return (
    route === "login" ||
    route === "signup" ||
    hasAuth0RedirectParameters(search)
  );
}
