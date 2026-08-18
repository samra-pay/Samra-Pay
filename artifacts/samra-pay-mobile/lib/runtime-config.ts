import { healthCheck, setBaseUrl } from "@workspace/api-client-react";

export type MobileDataMode = "mock" | "api";

export type MobilePublicEnvironment = Readonly<{
  EXPO_PUBLIC_SAMRA_DATA_MODE?: string;
  EXPO_PUBLIC_SAMRA_API_ORIGIN?: string;
}>;

export type MobileRuntimeConfig = Readonly<{
  dataMode: MobileDataMode;
  apiOrigin: string | null;
}>;

function readPublicEnvironment(): MobilePublicEnvironment {
  // Expo replaces direct EXPO_PUBLIC_* references when it creates the bundle.
  // Keep these as dot-property reads rather than dynamic process.env lookups.
  return {
    EXPO_PUBLIC_SAMRA_DATA_MODE: process.env.EXPO_PUBLIC_SAMRA_DATA_MODE,
    EXPO_PUBLIC_SAMRA_API_ORIGIN: process.env.EXPO_PUBLIC_SAMRA_API_ORIGIN,
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

export function loadMobileRuntimeConfig(
  environment: MobilePublicEnvironment = readPublicEnvironment(),
): MobileRuntimeConfig {
  const dataMode = parseDataMode(environment.EXPO_PUBLIC_SAMRA_DATA_MODE);
  const apiOrigin = parseApiOrigin(environment.EXPO_PUBLIC_SAMRA_API_ORIGIN);

  if (dataMode === "api" && apiOrigin === null) {
    throw new Error(
      "EXPO_PUBLIC_SAMRA_API_ORIGIN is required when mobile API mode is enabled.",
    );
  }

  return Object.freeze({ dataMode, apiOrigin });
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
