import type { MobileAuthConfig } from "@/lib/runtime-config";

type Auth0Credentials = Readonly<{
  idToken: string;
  accessToken: string;
  tokenType: string;
  expiresAt: number;
}>;

type Auth0SdkClient = Readonly<{
  webAuth: Readonly<{
    authorize: (
      parameters: Readonly<{ audience: string; scope: string }>,
      options: Readonly<{
        customScheme: string;
        ephemeralSession: boolean;
      }>,
    ) => Promise<Auth0Credentials>;
    clearSession: (
      parameters: Readonly<{ federated: boolean }>,
      options: Readonly<{ customScheme: string }>,
    ) => Promise<void>;
  }>;
  credentialsManager: Readonly<{
    saveCredentials: (credentials: Auth0Credentials) => Promise<void>;
    getCredentials: (
      scope?: string,
      minimumTtlSeconds?: number,
    ) => Promise<Auth0Credentials>;
    hasValidCredentials: (minimumTtlSeconds?: number) => Promise<boolean>;
    clearCredentials: () => Promise<void>;
  }>;
}>;

type Auth0SdkConstructor = new (
  options: Readonly<{
    domain: string;
    clientId: string;
    useDPoP: false;
  }>,
) => Auth0SdkClient;

export type Auth0SdkModule = Readonly<{ default: Auth0SdkConstructor }>;
export type Auth0SdkLoader = () => Promise<Auth0SdkModule>;

export type NativeAuth0Session = Readonly<{
  restore: () => Promise<boolean>;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  getAccessToken: () => Promise<string>;
}>;

const MINIMUM_TOKEN_TTL_SECONDS = 60;

export async function createNativeAuth0Session(
  config: Extract<MobileAuthConfig, { mode: "auth0-native" }>,
  platform: string,
  loadSdk: Auth0SdkLoader = async () =>
    (await import("react-native-auth0")) as unknown as Auth0SdkModule,
): Promise<NativeAuth0Session> {
  if (platform !== "ios" && platform !== "android") {
    throw new Error(
      "Native Auth0 is available only in the iOS and Android application builds.",
    );
  }

  const module = await loadSdk();
  if (typeof module.default !== "function") {
    throw new Error("Native Auth0 is unavailable in this application build.");
  }

  const client = new module.default({
    domain: config.domain,
    clientId: config.clientId,
    // The generated API client currently sends Bearer tokens. DPoP requires a
    // separate per-request proof header and therefore remains explicitly off.
    useDPoP: false,
  });

  const getAccessToken = async (): Promise<string> => {
    const credentials = await client.credentialsManager.getCredentials(
      undefined,
      MINIMUM_TOKEN_TTL_SECONDS,
    );
    validateCredentials(credentials);
    return credentials.accessToken;
  };

  return Object.freeze({
    restore: async () => {
      const valid = await client.credentialsManager.hasValidCredentials(
        MINIMUM_TOKEN_TTL_SECONDS,
      );
      if (!valid) {
        await client.credentialsManager.clearCredentials();
        return false;
      }
      try {
        await getAccessToken();
        return true;
      } catch {
        await client.credentialsManager.clearCredentials();
        return false;
      }
    },
    signIn: async () => {
      const credentials = await client.webAuth.authorize(
        { audience: config.audience, scope: "openid" },
        {
          customScheme: config.customScheme,
          ephemeralSession: false,
        },
      );
      validateCredentials(credentials);
      await client.credentialsManager.saveCredentials(credentials);
    },
    signOut: async () => {
      try {
        await client.webAuth.clearSession(
          { federated: false },
          { customScheme: config.customScheme },
        );
      } finally {
        await client.credentialsManager.clearCredentials();
      }
    },
    getAccessToken,
  });
}

function validateCredentials(credentials: Auth0Credentials): void {
  if (
    credentials.tokenType !== "Bearer" ||
    !isValidToken(credentials.accessToken) ||
    !isValidToken(credentials.idToken) ||
    !Number.isSafeInteger(credentials.expiresAt) ||
    credentials.expiresAt <= 0
  ) {
    throw new Error("Auth0 returned invalid native credentials.");
  }
}

function isValidToken(value: string): boolean {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 16_384 &&
    !/[\s\u0000-\u001f\u007f]/u.test(value)
  );
}
