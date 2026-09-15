import { afterEach, describe, expect, it, vi } from "vitest";

import {
  checkMobileApiHealth,
  initializeMobileRuntime,
  loadMobileRuntimeConfig,
} from "./runtime-config";

const AUTH0_API_ENVIRONMENT = Object.freeze({
  EXPO_PUBLIC_SAMRA_DATA_MODE: "api",
  EXPO_PUBLIC_SAMRA_API_ORIGIN: "https://samra-api.example.test",
  EXPO_PUBLIC_SAMRA_AUTH_MODE: "auth0-native",
  EXPO_PUBLIC_AUTH0_DOMAIN: "samra-staging.us.auth0.com",
  EXPO_PUBLIC_AUTH0_CLIENT_ID: "NativeClient_12345678",
  EXPO_PUBLIC_AUTH0_AUDIENCE: "https://api.staging.samrapay.com",
});

afterEach(() => {
  initializeMobileRuntime({ EXPO_PUBLIC_SAMRA_DATA_MODE: "mock" });
  vi.unstubAllGlobals();
});

describe("mobile runtime configuration", () => {
  it("preserves mock mode as the safe default", () => {
    expect(loadMobileRuntimeConfig({})).toEqual({
      dataMode: "mock",
      apiOrigin: null,
      auth: { mode: "disabled" },
    });
  });

  it("requires an explicit API origin in API mode", () => {
    expect(() =>
      loadMobileRuntimeConfig({ EXPO_PUBLIC_SAMRA_DATA_MODE: "api" }),
    ).toThrow(/API_ORIGIN is required/);
  });

  it("normalizes one portable HTTPS API origin", () => {
    expect(
      loadMobileRuntimeConfig({
        ...AUTH0_API_ENVIRONMENT,
        EXPO_PUBLIC_SAMRA_API_ORIGIN: "https://samra-api.example.test/",
      }),
    ).toEqual({
      dataMode: "api",
      apiOrigin: "https://samra-api.example.test",
      auth: {
        mode: "auth0-native",
        domain: "samra-staging.us.auth0.com",
        clientId: "NativeClient_12345678",
        audience: "https://api.staging.samrapay.com",
        customScheme: "samrapayauth",
      },
    });
  });

  it("allows HTTP only for loopback development", () => {
    expect(
      loadMobileRuntimeConfig({
        ...AUTH0_API_ENVIRONMENT,
        EXPO_PUBLIC_SAMRA_API_ORIGIN: "http://127.0.0.1:3000",
      }).apiOrigin,
    ).toBe("http://127.0.0.1:3000");

    expect(() =>
      loadMobileRuntimeConfig({
        ...AUTH0_API_ENVIRONMENT,
        EXPO_PUBLIC_SAMRA_API_ORIGIN: "http://api.example.test",
      }),
    ).toThrow(/must use https/);
  });

  it.each([
    "ftp://api.example.test",
    "https://user:password@api.example.test",
    "https://api.example.test/v1",
    "https://api.example.test?tenant=samra",
    "https://api.example.test#fragment",
  ])("rejects an unsafe or non-origin API value: %s", (apiOrigin) => {
    expect(() =>
      loadMobileRuntimeConfig({
        ...AUTH0_API_ENVIRONMENT,
        EXPO_PUBLIC_SAMRA_API_ORIGIN: apiOrigin,
      }),
    ).toThrow();
  });

  it("rejects unknown modes instead of silently using mocks", () => {
    expect(() =>
      loadMobileRuntimeConfig({
        EXPO_PUBLIC_SAMRA_DATA_MODE: "mixed",
        EXPO_PUBLIC_SAMRA_API_ORIGIN: "https://api.example.test",
      }),
    ).toThrow(/must be \"mock\" or \"api\"/);
  });

  it("requires one complete native Auth0 contract in API mode", () => {
    expect(() =>
      loadMobileRuntimeConfig({
        EXPO_PUBLIC_SAMRA_DATA_MODE: "api",
        EXPO_PUBLIC_SAMRA_API_ORIGIN: "https://api.example.test",
      }),
    ).toThrow(/requires EXPO_PUBLIC_SAMRA_AUTH_MODE=auth0-native/);

    expect(() =>
      loadMobileRuntimeConfig({
        ...AUTH0_API_ENVIRONMENT,
        EXPO_PUBLIC_AUTH0_CLIENT_ID: "",
      }),
    ).toThrow(/AUTH0_CLIENT_ID/);
  });

  it("rejects cross-environment audiences and locks Production to the customer edge", () => {
    expect(() =>
      loadMobileRuntimeConfig({
        ...AUTH0_API_ENVIRONMENT,
        EXPO_PUBLIC_SAMRA_ENVIRONMENT: "test",
      }),
    ).toThrow(/test Samra API identifier/);

    const production = {
      ...AUTH0_API_ENVIRONMENT,
      EXPO_PUBLIC_SAMRA_ENVIRONMENT: "production",
      EXPO_PUBLIC_SAMRA_API_ORIGIN: "https://app.samrapay.com",
      EXPO_PUBLIC_AUTH0_AUDIENCE: "https://api.samrapay.com",
    };
    expect(loadMobileRuntimeConfig(production)).toMatchObject({
      dataMode: "api",
      apiOrigin: "https://app.samrapay.com",
      auth: {
        mode: "auth0-native",
        audience: "https://api.samrapay.com",
        customScheme: "samrapayprodauth",
      },
    });
    expect(() =>
      loadMobileRuntimeConfig({
        ...production,
        EXPO_PUBLIC_SAMRA_API_ORIGIN: "https://api.samrapay.com",
      }),
    ).toThrow(/through https:\/\/app\.samrapay\.com/);
  });

  it("rejects Auth0 values in synthetic mode", () => {
    expect(() =>
      loadMobileRuntimeConfig({
        EXPO_PUBLIC_AUTH0_DOMAIN: "tenant.us.auth0.com",
      }),
    ).toThrow(/require EXPO_PUBLIC_SAMRA_AUTH_MODE/);

    expect(() =>
      loadMobileRuntimeConfig({
        ...AUTH0_API_ENVIRONMENT,
        EXPO_PUBLIC_SAMRA_DATA_MODE: "mock",
      }),
    ).toThrow(/allowed only in mobile API mode/);
  });

  it.each([
    ["EXPO_PUBLIC_AUTH0_DOMAIN", "https://tenant.auth0.com/path"],
    ["EXPO_PUBLIC_AUTH0_CLIENT_ID", "client id with spaces"],
    ["EXPO_PUBLIC_AUTH0_AUDIENCE", "http://api.example.test"],
    ["EXPO_PUBLIC_AUTH0_AUDIENCE", "https://user@api.example.test"],
  ] as const)(
    "rejects unsafe Auth0 public configuration in %s",
    (key, value) => {
      expect(() =>
        loadMobileRuntimeConfig({ ...AUTH0_API_ENVIRONMENT, [key]: value }),
      ).toThrow();
    },
  );

  it("routes generated-client requests to the configured remote API", async () => {
    let requestedUrl = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        requestedUrl = typeof input === "string" ? input : input.toString();
        return new Response(JSON.stringify({ status: "ok" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );

    const config = initializeMobileRuntime(AUTH0_API_ENVIRONMENT);
    await expect(checkMobileApiHealth(config)).resolves.toEqual({
      status: "ok",
    });
    expect(requestedUrl).toBe("https://samra-api.example.test/api/healthz");
  });

  it("does not permit a health probe to masquerade as mock functionality", async () => {
    const config = initializeMobileRuntime({
      EXPO_PUBLIC_SAMRA_DATA_MODE: "mock",
    });
    await expect(checkMobileApiHealth(config)).rejects.toThrow(
      /require API mode/,
    );
  });
});
