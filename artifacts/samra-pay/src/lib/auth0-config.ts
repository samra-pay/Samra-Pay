import { parseSamraDataMode } from "@workspace/samra-client";

type PublicEnvironment = Readonly<Record<string, string | boolean | undefined>>;

type ApplicationLocation = Readonly<{
  origin: string;
  baseUrl: string;
}>;

export type WebCustomerAuthConfig =
  | Readonly<{ mode: "mock" }>
  | Readonly<{
      mode: "auth0";
      domain: string;
      clientId: string;
      audience: string;
      applicationUri: string;
    }>;

export function resolveWebCustomerAuthConfig(
  environment: PublicEnvironment,
  location: ApplicationLocation,
): WebCustomerAuthConfig {
  const dataMode = parseSamraDataMode(
    stringValue(environment.VITE_SAMRA_DATA_MODE),
    "VITE_SAMRA_DATA_MODE",
  );

  if (dataMode === "mock") return Object.freeze({ mode: "mock" });

  return Object.freeze({
    mode: "auth0",
    domain: parseDomain(
      required(environment, "VITE_AUTH0_DOMAIN"),
      "VITE_AUTH0_DOMAIN",
    ),
    clientId: parseOpaquePublicValue(
      required(environment, "VITE_AUTH0_CLIENT_ID"),
      "VITE_AUTH0_CLIENT_ID",
    ),
    audience: parseAudience(
      required(environment, "VITE_AUTH0_AUDIENCE"),
      "VITE_AUTH0_AUDIENCE",
    ),
    applicationUri: buildApplicationUri(location.origin, location.baseUrl),
  });
}

export function withApplicationPath(
  applicationUri: string,
  route: string,
): string {
  if (!route.startsWith("/") || route.startsWith("//")) {
    throw new Error("Customer authentication routes must be root-relative");
  }

  const application = new URL(applicationUri);
  const basePath = application.pathname.replace(/\/$/, "");
  return `${basePath}${route}` || "/";
}

export function resolveAuth0ReturnTo(
  candidate: unknown,
  applicationUri: string,
): string {
  const application = new URL(applicationUri);
  const fallback = application.pathname || "/";
  if (typeof candidate !== "string" || candidate.length > 2_048) {
    return fallback;
  }

  let destination: URL;
  try {
    destination = new URL(candidate, application);
  } catch {
    return fallback;
  }

  if (destination.origin !== application.origin) return fallback;

  const basePath = application.pathname.replace(/\/$/, "");
  if (
    basePath &&
    destination.pathname !== basePath &&
    !destination.pathname.startsWith(`${basePath}/`)
  ) {
    return fallback;
  }

  return `${destination.pathname}${destination.search}${destination.hash}`;
}

function required(environment: PublicEnvironment, name: string): string {
  const value = stringValue(environment[name])?.trim();
  if (!value) throw new Error(`${name} is required in Samra API mode`);
  return value;
}

function stringValue(value: string | boolean | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function parseDomain(value: string, variableName: string): string {
  if (
    value.includes("://") ||
    value.includes("/") ||
    value.includes("?") ||
    value.includes("#") ||
    value.includes("@") ||
    value.includes(":")
  ) {
    throw new Error(`${variableName} must be an HTTPS hostname only`);
  }

  let url: URL;
  try {
    url = new URL(`https://${value}`);
  } catch {
    throw new Error(`${variableName} must be a valid HTTPS hostname`);
  }

  const labels = url.hostname.split(".");
  if (
    url.hostname !== value.toLowerCase() ||
    url.hostname.length > 253 ||
    labels.length < 2 ||
    labels.some(
      (label) =>
        label.length === 0 ||
        label.length > 63 ||
        !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u.test(label),
    )
  ) {
    throw new Error(`${variableName} must be a valid HTTPS hostname`);
  }

  return url.hostname;
}

function parseOpaquePublicValue(value: string, variableName: string): string {
  if (value.length > 512 || /[\s\u0000-\u001f\u007f]/u.test(value)) {
    throw new Error(`${variableName} contains an invalid public identifier`);
  }
  return value;
}

function parseAudience(value: string, variableName: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${variableName} must be an absolute HTTPS API identifier`);
  }

  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(`${variableName} must be an absolute HTTPS API identifier`);
  }

  return value;
}

function buildApplicationUri(origin: string, baseUrl: string): string {
  let parsedOrigin: URL;
  try {
    parsedOrigin = new URL(origin);
  } catch {
    throw new Error("The customer web application origin is invalid");
  }

  const isLoopback =
    parsedOrigin.hostname === "localhost" ||
    parsedOrigin.hostname === "127.0.0.1" ||
    parsedOrigin.hostname === "[::1]";
  if (
    parsedOrigin.protocol !== "https:" &&
    !(isLoopback && parsedOrigin.protocol === "http:")
  ) {
    throw new Error(
      "Customer authentication requires HTTPS outside local development",
    );
  }

  if (
    parsedOrigin.username ||
    parsedOrigin.password ||
    parsedOrigin.pathname !== "/" ||
    parsedOrigin.search ||
    parsedOrigin.hash
  ) {
    throw new Error("The customer web application origin must be origin-only");
  }

  if (!baseUrl.startsWith("/") || baseUrl.startsWith("//")) {
    throw new Error("BASE_URL must be a root-relative application path");
  }

  if (
    baseUrl.includes("\\") ||
    baseUrl.includes("?") ||
    baseUrl.includes("#") ||
    baseUrl.split("/").some((segment) => segment === "." || segment === "..")
  ) {
    throw new Error("BASE_URL contains an invalid application path");
  }

  const normalizedBase = `${baseUrl.replace(/^\/+|\/+$/g, "")}/`;
  return new URL(normalizedBase, parsedOrigin).toString();
}
