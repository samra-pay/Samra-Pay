import { describe, expect, it, vi } from "vitest";

import { createNativeAuth0Session, type Auth0SdkModule } from "./native-auth0";

const CONFIG = Object.freeze({
  mode: "auth0-native" as const,
  domain: "samra-staging.us.auth0.com",
  clientId: "NativeClient_12345678",
  audience: "https://api.staging.samrapay.com",
  customScheme: "samrapayauth" as const,
});

type FakeCredentials = Readonly<{
  idToken: string;
  accessToken: string;
  tokenType: string;
  expiresAt: number;
}>;

const CREDENTIALS: FakeCredentials = Object.freeze({
  idToken: "header.identity.signature",
  accessToken: "header.access.signature",
  tokenType: "Bearer",
  expiresAt: 2_000_000_000,
});

describe("native Auth0 session adapter", () => {
  it("uses Universal Login, minimal scopes, PKCE-native storage, and Bearer mode", async () => {
    const harness = createHarness();
    const session = await createNativeAuth0Session(CONFIG, "ios", harness.load);

    await session.signIn();

    expect(harness.constructorOptions).toEqual({
      domain: CONFIG.domain,
      clientId: CONFIG.clientId,
      useDPoP: false,
    });
    expect(harness.authorize).toHaveBeenCalledWith(
      { audience: CONFIG.audience, scope: "openid" },
      { customScheme: "samrapayauth", ephemeralSession: false },
    );
    expect(harness.saveCredentials).toHaveBeenCalledWith(CREDENTIALS);
    expect(JSON.stringify(harness.authorize.mock.calls)).not.toContain(
      "offline_access",
    );
  });

  it("restores only valid credentials and reads a fresh access token per request", async () => {
    const harness = createHarness();
    const session = await createNativeAuth0Session(
      CONFIG,
      "android",
      harness.load,
    );

    await expect(session.restore()).resolves.toBe(true);
    await expect(session.getAccessToken()).resolves.toBe(
      CREDENTIALS.accessToken,
    );
    expect(harness.hasValidCredentials).toHaveBeenCalledWith(60);
    expect(harness.getCredentials).toHaveBeenCalledWith(undefined, 60);
  });

  it("clears expired device credentials instead of treating them as a session", async () => {
    const harness = createHarness({ valid: false });
    const session = await createNativeAuth0Session(CONFIG, "ios", harness.load);

    await expect(session.restore()).resolves.toBe(false);
    expect(harness.clearCredentials).toHaveBeenCalledOnce();
    expect(harness.getCredentials).not.toHaveBeenCalled();
  });

  it("clears malformed restored credentials instead of retrying them on every launch", async () => {
    const harness = createHarness({
      credentials: { ...CREDENTIALS, accessToken: "token with spaces" },
    });
    const session = await createNativeAuth0Session(CONFIG, "ios", harness.load);

    await expect(session.restore()).resolves.toBe(false);
    expect(harness.getCredentials).toHaveBeenCalledWith(undefined, 60);
    expect(harness.clearCredentials).toHaveBeenCalledOnce();
  });

  it("clears device credentials even when Auth0 browser logout fails", async () => {
    const harness = createHarness({ logoutFailure: true });
    const session = await createNativeAuth0Session(
      CONFIG,
      "android",
      harness.load,
    );

    await expect(session.signOut()).rejects.toThrow("logout failed");
    expect(harness.clearSession).toHaveBeenCalledWith(
      { federated: false },
      { customScheme: "samrapayauth" },
    );
    expect(harness.clearCredentials).toHaveBeenCalledOnce();
  });

  it("rejects malformed provider credentials before secure storage", async () => {
    const harness = createHarness({
      credentials: { ...CREDENTIALS, accessToken: "token with spaces" },
    });
    const session = await createNativeAuth0Session(CONFIG, "ios", harness.load);

    await expect(session.signIn()).rejects.toThrow(
      /invalid native credentials/,
    );
    expect(harness.saveCredentials).not.toHaveBeenCalled();
  });

  it("fails closed before loading the native SDK in Expo web", async () => {
    const harness = createHarness();

    await expect(
      createNativeAuth0Session(CONFIG, "web", harness.load),
    ).rejects.toThrow(/only in the iOS and Android/);
    expect(harness.load).not.toHaveBeenCalled();
  });
});

function createHarness(
  options: Readonly<{
    valid?: boolean;
    logoutFailure?: boolean;
    credentials?: FakeCredentials;
  }> = {},
) {
  const credentials = options.credentials ?? CREDENTIALS;
  const constructorOptions: Record<string, unknown> = {};
  const authorize = vi.fn(async () => credentials);
  const clearSession = vi.fn(async () => {
    if (options.logoutFailure) throw new Error("logout failed");
  });
  const saveCredentials = vi.fn(async () => undefined);
  const getCredentials = vi.fn(async () => credentials);
  const hasValidCredentials = vi.fn(async () => options.valid ?? true);
  const clearCredentials = vi.fn(async () => undefined);

  class FakeAuth0 {
    webAuth = { authorize, clearSession };
    credentialsManager = {
      saveCredentials,
      getCredentials,
      hasValidCredentials,
      clearCredentials,
    };

    constructor(input: Record<string, unknown>) {
      Object.assign(constructorOptions, input);
    }
  }

  return {
    load: vi.fn(
      async () => ({ default: FakeAuth0 }) as unknown as Auth0SdkModule,
    ),
    constructorOptions,
    authorize,
    clearSession,
    saveCredentials,
    getCredentials,
    hasValidCredentials,
    clearCredentials,
  };
}
