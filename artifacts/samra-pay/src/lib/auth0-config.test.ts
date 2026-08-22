import { describe, expect, it } from "vitest";

import {
  resolveAuth0ReturnTo,
  resolveWebCustomerAuthConfig,
  withApplicationPath,
} from "./auth0-config";

const validEnvironment = Object.freeze({
  VITE_SAMRA_DATA_MODE: "api",
  VITE_AUTH0_DOMAIN: "login.staging.samrapay.com",
  VITE_AUTH0_CLIENT_ID: "public-client-id",
  VITE_AUTH0_AUDIENCE: "https://api.staging.samrapay.com",
});

describe("web Auth0 configuration", () => {
  it("keeps the synthetic experience independent of vendor configuration", () => {
    expect(
      resolveWebCustomerAuthConfig(
        { VITE_SAMRA_DATA_MODE: "mock" },
        { origin: "http://localhost:3000", baseUrl: "/" },
      ),
    ).toEqual({ mode: "mock" });
  });

  it("accepts exact public Auth0 identifiers for HTTPS staging", () => {
    expect(
      resolveWebCustomerAuthConfig(validEnvironment, {
        origin: "https://staging.samrapay.com",
        baseUrl: "/",
      }),
    ).toEqual({
      mode: "auth0",
      domain: "login.staging.samrapay.com",
      clientId: "public-client-id",
      audience: "https://api.staging.samrapay.com",
      applicationUri: "https://staging.samrapay.com/",
    });
  });

  it("requires every Auth0 public identifier in API mode", () => {
    for (const name of [
      "VITE_AUTH0_DOMAIN",
      "VITE_AUTH0_CLIENT_ID",
      "VITE_AUTH0_AUDIENCE",
    ] as const) {
      const environment = { ...validEnvironment, [name]: "" };
      expect(() =>
        resolveWebCustomerAuthConfig(environment, {
          origin: "https://staging.samrapay.com",
          baseUrl: "/",
        }),
      ).toThrow(`${name} is required`);
    }
  });

  it("rejects ambiguous domains, audiences, and insecure non-local origins", () => {
    expect(() =>
      resolveWebCustomerAuthConfig(
        { ...validEnvironment, VITE_AUTH0_DOMAIN: "https://tenant.auth0.com" },
        { origin: "https://staging.samrapay.com", baseUrl: "/" },
      ),
    ).toThrow("hostname only");

    expect(() =>
      resolveWebCustomerAuthConfig(
        { ...validEnvironment, VITE_AUTH0_AUDIENCE: "http://api.example.com" },
        { origin: "https://staging.samrapay.com", baseUrl: "/" },
      ),
    ).toThrow("absolute HTTPS API identifier");

    expect(() =>
      resolveWebCustomerAuthConfig(validEnvironment, {
        origin: "http://staging.samrapay.com",
        baseUrl: "/",
      }),
    ).toThrow("requires HTTPS");

    expect(() =>
      resolveWebCustomerAuthConfig(validEnvironment, {
        origin: "https://staging.samrapay.com",
        baseUrl: "/preview/../admin/",
      }),
    ).toThrow("invalid application path");
  });

  it("preserves a base path and rejects an external or cross-base return path", () => {
    const applicationUri = "https://preview.example.com/samra-pay/";
    expect(withApplicationPath(applicationUri, "/onboarding")).toBe(
      "/samra-pay/onboarding",
    );
    expect(resolveAuth0ReturnTo("/samra-pay/onboarding", applicationUri)).toBe(
      "/samra-pay/onboarding",
    );
    expect(resolveAuth0ReturnTo("https://evil.example/", applicationUri)).toBe(
      "/samra-pay/",
    );
    expect(resolveAuth0ReturnTo("/admin", applicationUri)).toBe("/samra-pay/");
  });
});
