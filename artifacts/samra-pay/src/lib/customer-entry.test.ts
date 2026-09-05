import { describe, expect, it } from "vitest";
import {
  customerLoginOptions,
  customerSessionDestination,
  shouldLoadCustomerApp,
} from "./customer-entry";
import { publicCustomerLinks } from "./public-customer-entry";
import { resolvePublicRoute } from "./public-routes";
import { publicPageParameters } from "./public-analytics";

const app = "https://customer.example/staging/";
const audience = "https://api.example/development";

describe("customer entry routing", () => {
  it("opens Auth0 signup explicitly and returns both paths to the server access check", () => {
    expect(customerLoginOptions("signup", app, audience)).toEqual({
      appState: { returnTo: "/staging/session" },
      authorizationParams: {
        audience,
        redirect_uri: app,
        screen_hint: "signup",
      },
    });
    expect(
      customerLoginOptions("login", app, audience).authorizationParams,
    ).not.toHaveProperty("screen_hint");
  });
  it("keeps connected entry routes and root callbacks out of the static marketing loader", () => {
    for (const path of ["/login", "/signup", "/staging/signup/"]) {
      const route = resolvePublicRoute(path, "/staging/");
      expect(shouldLoadCustomerApp(route, "")).toBe(true);
    }
    expect(shouldLoadCustomerApp("home", "?state=test&code=test")).toBe(true);
    expect(
      shouldLoadCustomerApp("home", "?state=test&error=access_denied"),
    ).toBe(true);
    expect(shouldLoadCustomerApp("home", "?utm_source=mail")).toBe(false);
    expect(shouldLoadCustomerApp("home", "?code=untrusted")).toBe(false);
  });
  it("routes only server-authorized customers to the dashboard", () => {
    expect(customerSessionDestination({ id: "synthetic" }, null)).toBe(
      "/dashboard",
    );
    for (const code of [
      "CUSTOMER_IDENTITY_UNBOUND",
      "CUSTOMER_ONBOARDING_REQUIRED",
    ]) {
      expect(
        customerSessionDestination(undefined, { status: 403, data: { code } }),
      ).toBe("/onboarding");
    }
    for (const error of [
      { status: 403, data: { code: "CUSTOMER_ACCESS_RESTRICTED" } },
      { status: 401 },
      { status: 503 },
      new Error("network"),
    ]) {
      expect(customerSessionDestination({ id: "stale" }, error)).toBeNull();
    }
    expect(customerSessionDestination(undefined, null)).toBeNull();
  });
  it("does not send entry-page visits or query parameters to public analytics", () => {
    for (const path of ["/login", "/signup"]) {
      expect(
        publicPageParameters(
          `https://www.samrapay.com${path}?code=private&state=private`,
          "",
        ),
      ).toBeNull();
    }
  });
});

describe("public website account handoff", () => {
  it("is disabled unless an explicit safe customer application URL exists", () => {
    for (const url of [
      undefined,
      "",
      "javascript:alert(1)",
      "http://customer.example",
      "https://u:p@customer.example",
      "https://customer.example/?code=x",
      "https://customer.example/#token",
      "https://www.samrapay.com/",
      "https://customer.example/%2e%2e/",
      "https://customer.example/\\path",
    ]) {
      expect(publicCustomerLinks(url, "https://www.samrapay.com/")).toBeNull();
    }
  });
  it("preserves the configured application base path and sends no page query or fragment", () => {
    expect(publicCustomerLinks(app, "https://www.samrapay.com/")).toEqual({
      login: app + "login",
      signup: app + "signup",
    });
    expect(
      publicCustomerLinks(
        "https://www.samrapay.com/app",
        "https://www.samrapay.com/",
      )?.signup,
    ).toBe("https://www.samrapay.com/app/signup");
  });
});
