import { healthCheck, setBaseUrl } from "@workspace/api-client-react";
import nativeEnvironments from "../native-environments.json";

export type MobileDataMode = "mock" | "api";

export type MobileAuthMode = "disabled" | "auth0-native";

export const MOBILE_AUTH0_CUSTOM_SCHEME = "samrapayauth";

export type MobileAuthConfig =
  | Readonly<{ mode: "disabled" }>
  | Readonly<{
      mode: "auth0-native";
      domain: string;
      clientId: string;
      audience: string;
      customScheme: string;
    }>;

export type MobilePublicEnvironment = Readonly<{
  EXPO_PUBLIC_SAMRA_ENVIRONMENT?: string;
  EXPO_PUBLIC_SAMRA_DATA_MODE?: string;
  EXPO_PUBLIC_SAMRA_API_ORIGIN?: string;
  EXPO_PUBLIC_SAMRA_AUTH_MODE?: string;
  EXPO_PUBLIC_AUTH0_DOMAIN?: string;
  EXPO_PUBLIC_AUTH0_CLIENT_ID?: string;
  EXPO_PUBLIC_AUTH0_AUDIENCE?: string;
}>;

export type MobileRuntimeConfig = Readonly<{
  dataMode: MobileDataMode;
  apiOrigin: string | null;
  auth: MobileAuthConfig;
}>;

function readPublicEnvironment(): MobilePublicEnvironment {
  // Expo replaces direct EXPO_PUBLIC_* references when it creates the bundle.
  // Keep these as dot-property reads rather than dynamic process.env lookups.
  return {
    EXPO_PUBLIC_SAMRA_ENVIRONMENT: process.env.EXPO_PUBLIC_SAMRA_ENVIRONMENT,
    EXPO_PUBLIC_SAMRA_DATA_MODE: process.env.EXPO_PUBLIC_SAMRA_DATA_MODE,
    EXPO_PUBLIC_SAMRA_API_ORIGIN: process.env.EXPO_PUBLIC_SAMRA_API_ORIGIN,
    EXPO_PUBLIC_SAMRA_AUTH_MODE: process.env.EXPO_PUBLIC_SAMRA_AUTH_MODE,
    EXPO_PUBLIC_AUTH0_DOMAIN: process.env.EXPO_PUBLIC_AUTH0_DOMAIN,
    EXPO_PUBLIC_AUTH0_CLIENT_ID: process.env.EXPO_PUBLIC_AUTH0_CLIENT_ID,
    EXPO_PUBLIC_AUTH0_AUDIENCE: process.env.EXPO_PUBLIC_AUTH0_AUDIENCE,
  };
}

function parseDataMode(value: string | undefined): MobileDataMode {
  if (value === undefined || value === "") return "mock";
  if (value === "mock" || value === "api") return value;

  throw new Error(
    'EXPO_PUBLIC_SAMRA_DATA_MODE must be "mock" or "api"; ' +
      `received ${JSON.stringify(value)}.`,
  );
}

function isLoopback(hostname: string): boolean {
  return (
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]"
  );
}

function parseApiOrigin(value: string | undefined): string | null {
  if (value === undefined || value.trim() === "") return null;

  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(
      "EXPO_PUBLIC_SAMRA_API_ORIGIN must be an absolute http or https origin.",
    );
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("EXPO_PUBLIC_SAMRA_API_ORIGIN must use http or https.");
  }
  if (url.protocol === "http:" && !isLoopback(url.hostname)) {
    throw new Error(
      "EXPO_PUBLIC_SAMRA_API_ORIGIN must use https except for loopback development.",
    );
  }
  if (url.username || url.password) {
    throw new Error(
      "EXPO_PUBLIC_SAMRA_API_ORIGIN must not contain credentials.",
    );
  }
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error(
      "EXPO_PUBLIC_SAMRA_API_ORIGIN must contain only an origin, without a path, query, or fragment.",
    );
  }

  return url.origin;
}

function parseAuthMode(value: string | undefined): MobileAuthMode {
  if (value === undefined || value === "") return "disabled";
  if (value === "disabled" || value === "auth0-native") return value;

  throw new Error(
    'EXPO_PUBLIC_SAMRA_AUTH_MODE must be "disabled" or "auth0-native"; ' +
      `received ${JSON.stringify(value)}.`,
  );
}

function parseAuth0Domain(value: string | undefined): string {
  const domain = value?.trim().toLowerCase() ?? "";
  if (
    domain.length < 3 ||
    domain.length > 253 ||
    !domain.includes(".") ||
    !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/u.test(domain) ||
    domain.includes("..")
  ) {
    throw new Error(
      "EXPO_PUBLIC_AUTH0_DOMAIN must be a hostname only, without a scheme, path, port, or credentials.",
    );
  }
  return domain;
}

function parseAuth0ClientId(value: string | undefined): string {
  const clientId = value?.trim() ?? "";
  if (
    clientId.length < 8 ||
    clientId.length > 256 ||
    !/^[A-Za-z0-9_-]+$/u.test(clientId)
  ) {
    throw new Error(
      "EXPO_PUBLIC_AUTH0_CLIENT_ID must be a non-secret Auth0 native application client ID.",
    );
  }
  return clientId;
}

function parseAuth0Audience(value: string | undefined): string {
  const audience = value?.trim() ?? "";
  let url: URL;
  try {
    url = new URL(audience);
  } catch {
    throw new Error(
      "EXPO_PUBLIC_AUTH0_AUDIENCE must be the exact HTTPS Samra API identifier.",
    );
  }
  if (
    url.protocol !== "https:" ||
    !url.hostname ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    audience.length > 512
  ) {
    throw new Error(
      "EXPO_PUBLIC_AUTH0_AUDIENCE must be the exact HTTPS Samra API identifier without credentials, query, or fragment.",
    );
  }
  return audience;
}

function resolveMobileAuthConfig(
  environment: MobilePublicEnvironment,
  dataMode: MobileDataMode,
): MobileAuthConfig {
  const mode = parseAuthMode(environment.EXPO_PUBLIC_SAMRA_AUTH_MODE);
  const target = environment.EXPO_PUBLIC_SAMRA_ENVIRONMENT || "staging";
  if (!Object.hasOwn(nativeEnvironments, target)) {
    throw new Error(
      `EXPO_PUBLIC_SAMRA_ENVIRONMENT must be ${Object.keys(nativeEnvironments).join(", ")}.`,
    );
  }
  const native = nativeEnvironments[target as keyof typeof nativeEnvironments];
  const auth0Values = [
    environment.EXPO_PUBLIC_AUTH0_DOMAIN,
    environment.EXPO_PUBLIC_AUTH0_CLIENT_ID,
    environment.EXPO_PUBLIC_AUTH0_AUDIENCE,
  ];

  if (mode === "disabled") {
    if (
      auth0Values.some((value) => value !== undefined && value.trim() !== "")
    ) {
      throw new Error(
        "Auth0 public values require EXPO_PUBLIC_SAMRA_AUTH_MODE=auth0-native.",
      );
    }
    if (dataMode === "api") {
      throw new Error(
        "Mobile API mode requires EXPO_PUBLIC_SAMRA_AUTH_MODE=auth0-native.",
      );
    }
    return Object.freeze({ mode: "disabled" });
  }

  if (dataMode !== "api") {
    throw new Error("Native Auth0 is allowed only in mobile API mode.");
  }

  const audience = parseAuth0Audience(environment.EXPO_PUBLIC_AUTH0_AUDIENCE);
  if (audience !== native.apiAudience) {
    throw new Error(
      `EXPO_PUBLIC_AUTH0_AUDIENCE must match the ${target} Samra API identifier.`,
    );
  }

  return Object.freeze({
    mode,
    domain: parseAuth0Domain(environment.EXPO_PUBLIC_AUTH0_DOMAIN),
    clientId: parseAuth0ClientId(environment.EXPO_PUBLIC_AUTH0_CLIENT_ID),
    audience,
    customScheme: native.customScheme,
  });
}

export function loadMobileRuntimeConfig(
  environment: MobilePublicEnvironment = readPublicEnvironment(),
): MobileRuntimeConfig {
  const dataMode = parseDataMode(environment.EXPO_PUBLIC_SAMRA_DATA_MODE);
  const apiOrigin = parseApiOrigin(environment.EXPO_PUBLIC_SAMRA_API_ORIGIN);
  const target = environment.EXPO_PUBLIC_SAMRA_ENVIRONMENT || "staging";

  if (dataMode === "api" && apiOrigin === null) {
    throw new Error(
      "EXPO_PUBLIC_SAMRA_API_ORIGIN is required when mobile API mode is enabled.",
    );
  }

  if (
    target === "production" &&
    (dataMode !== "api" ||
      apiOrigin !== nativeEnvironments.production.customerWebOrigin)
  ) {
    throw new Error(
      `Production mobile runtime requires API mode through ${nativeEnvironments.production.customerWebOrigin}.`,
    );
  }

  const auth = resolveMobileAuthConfig(environment, dataMode);
  return Object.freeze({ dataMode, apiOrigin, auth });
}

export function configureMobileApiClient(config: MobileRuntimeConfig): void {
  // Mock mode clears prior hot-reload/test state. API mode never falls back to
  // a relative URL that could accidentally target the Expo host.
  setBaseUrl(config.dataMode === "api" ? config.apiOrigin : null);
}

export function initializeMobileRuntime(
  environment?: MobilePublicEnvironment,
): MobileRuntimeConfig {
  const config = loadMobileRuntimeConfig(environment);
  configureMobileApiClient(config);
  return config;
}

export async function checkMobileApiHealth(
  config: MobileRuntimeConfig,
): Promise<Readonly<{ status: string }>> {
  if (config.dataMode !== "api") {
    throw new Error("Mobile API health checks require API mode.");
  }
  return healthCheck();
}
