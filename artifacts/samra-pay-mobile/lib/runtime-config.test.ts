import { afterEach, describe, expect, it, vi } from "vitest";

import {
  checkMobileApiHealth,
  initializeMobileRuntime,
  loadMobileRuntimeConfig,
} from "./runtime-config";

afterEach(() => {
  initializeMobileRuntime({ EXPO_PUBLIC_SAMRA_DATA_MODE: "mock" });
  vi.unstubAllGlobals();
});

describe("mobile runtime configuration", () => {
  it("preserves mock mode as the safe default", () => {
    expect(loadMobileRuntimeConfig({})).toEqual({
      dataMode: "mock",
      apiOrigin: null,
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
        EXPO_PUBLIC_SAMRA_DATA_MODE: "api",
        EXPO_PUBLIC_SAMRA_API_ORIGIN: "https://samra-api.example.test/",
      }),
    ).toEqual({
      dataMode: "api",
      apiOrigin: "https://samra-api.example.test",
    });
  });

  it("allows HTTP only for loopback development", () => {
    expect(
      loadMobileRuntimeConfig({
        EXPO_PUBLIC_SAMRA_DATA_MODE: "api",
        EXPO_PUBLIC_SAMRA_API_ORIGIN: "http://127.0.0.1:3000",
      }).apiOrigin,
    ).toBe("http://127.0.0.1:3000");

    expect(() =>
      loadMobileRuntimeConfig({
        EXPO_PUBLIC_SAMRA_DATA_MODE: "api",
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
        EXPO_PUBLIC_SAMRA_DATA_MODE: "api",
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

    const config = initializeMobileRuntime({
      EXPO_PUBLIC_SAMRA_DATA_MODE: "api",
      EXPO_PUBLIC_SAMRA_API_ORIGIN: "https://samra-api.example.test",
    });
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
