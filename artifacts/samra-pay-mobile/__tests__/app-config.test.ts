import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const dynamicConfig = require("../app.config.cjs") as (() => Record<
  string,
  unknown
>) &
  Readonly<{
    AUTH0_CUSTOM_SCHEME: string;
    NATIVE_APPLICATION_ID: string;
    resolveExpoConfig: (environment: Record<string, string>) => {
      ios: Record<string, unknown>;
      android: Record<string, unknown>;
      plugins: unknown[];
    };
  }>;
const { AUTH0_CUSTOM_SCHEME, NATIVE_APPLICATION_ID, resolveExpoConfig } =
  dynamicConfig;

const NATIVE_ENVIRONMENT = Object.freeze({
  EXPO_PUBLIC_SAMRA_AUTH_MODE: "auth0-native",
  EXPO_PUBLIC_AUTH0_DOMAIN: "samra-staging.us.auth0.com",
  EXPO_PUBLIC_AUTH0_CLIENT_ID: "NativeClient_12345678",
  EXPO_PUBLIC_AUTH0_AUDIENCE: "https://api.staging.samrapay.com",
});

describe("mobile Expo Auth0 build boundary", () => {
  it("keeps the default Expo Go-compatible build free of native Auth0", () => {
    const config = resolveExpoConfig({});
    expect(config.plugins).not.toContainEqual(
      expect.arrayContaining(["react-native-auth0"]),
    );
    expect(config.ios).not.toHaveProperty("bundleIdentifier");
    expect(config.android).not.toHaveProperty("package");
    expect(dynamicConfig()).not.toHaveProperty("expo");
  });

  it("adds one exact native plugin only for a complete Auth0 build", () => {
    const config = resolveExpoConfig(NATIVE_ENVIRONMENT);
    expect(AUTH0_CUSTOM_SCHEME).toBe("samrapayauth");
    expect(NATIVE_APPLICATION_ID).toBe("com.samrapay.mobile.staging");
    expect(config.ios.bundleIdentifier).toBe(NATIVE_APPLICATION_ID);
    expect(config.android.package).toBe(NATIVE_APPLICATION_ID);
    expect(config.plugins).toContainEqual([
      "react-native-auth0",
      {
        domain: "samra-staging.us.auth0.com",
        customScheme: "samrapayauth",
      },
    ]);
  });

  it("fails a partial or unsafe native build before Expo prebuild", () => {
    expect(() =>
      resolveExpoConfig({ EXPO_PUBLIC_SAMRA_AUTH_MODE: "auth0-native" }),
    ).toThrow(/AUTH0_DOMAIN/);
    expect(() =>
      resolveExpoConfig({
        ...NATIVE_ENVIRONMENT,
        EXPO_PUBLIC_AUTH0_DOMAIN: "https://tenant.auth0.com",
      }),
    ).toThrow(/hostname only/);
    expect(() =>
      resolveExpoConfig({
        ...NATIVE_ENVIRONMENT,
        EXPO_PUBLIC_AUTH0_AUDIENCE: "http://api.example.test",
      }),
    ).toThrow(/exact HTTPS/);
  });
});
