import { parseSamraDataMode } from "@workspace/samra-client";

type PublicEnvironment = Readonly<Record<string, string | boolean | undefined>>;

type ApplicationLocation = Readonly<{
  origin: string;
  baseUrl: string;
}>;

export type WebDeploymentEnvironment =
  "dev" | "test" | "staging" | "production";

const AUTH0_AUDIENCE_BY_ENVIRONMENT = Object.freeze({
  dev: "https://api.samrapay.com/development",
  test: "https://api.samrapay.com/test",
  staging: "https://api.staging.samrapay.com",
  production: "https://api.samrapay.com",
} satisfies Record<WebDeploymentEnvironment, string>);

export type WebCustomerAuthConfig =
  | Readonly<{ mode: "mock" }>
  | Readonly<{
      mode: "auth0";
      domain: string;
      clientId: string;
      audience: string;
      applicationUri: string;
      environment: WebDeploymentEnvironment;
    }>;

export function resolveWebCustomerAuthConfig(
  environment: PublicEnvironment,
  location: ApplicationLocation,
): WebCustomerAuthConfig {
  const dataMode = parseSamraDataMode(
    stringValue(environment.VITE_SAMRA_DATA_MODE),
    "VITE_SAMRA_DATA_MODE",
  );
  const applicationUri = buildApplicationUri(location.origin, location.baseUrl);
  const environmentValue = stringValue(environment.VITE_SAMRA_ENVIRONMENT);

  if (dataMode === "mock") {
    if (
      applicationUri === "https://app.samrapay.com/" ||
      environmentValue === "production"
    ) {
      throw new Error(
        "The Production customer application cannot run in mock mode",
      );
    }
    if (environmentValue) {
      assertApplicationEnvironmentBoundary(
        parseDeploymentEnvironment(environmentValue),
        applicationUri,
      );
    }
    return Object.freeze({ mode: "mock" });
  }

  const deploymentEnvironment = parseDeploymentEnvironment(
    required(environment, "VITE_SAMRA_ENVIRONMENT"),
  );
  const audience = parseAudience(
    required(environment, "VITE_AUTH0_AUDIENCE"),
    "VITE_AUTH0_AUDIENCE",
  );
  if (audience !== AUTH0_AUDIENCE_BY_ENVIRONMENT[deploymentEnvironment]) {
    throw new Error(
      `VITE_AUTH0_AUDIENCE must match the ${deploymentEnvironment} Samra API identifier`,
    );
  }
  assertApplicationEnvironmentBoundary(deploymentEnvironment, applicationUri);

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
    audience,
    applicationUri,
    environment: deploymentEnvironment,
  });
}

function parseDeploymentEnvironment(value: string): WebDeploymentEnvironment {
  if (
    value === "dev" ||
    value === "test" ||
    value === "staging" ||
    value === "production"
  ) {
    return value;
  }
  throw new Error(
    "VITE_SAMRA_ENVIRONMENT must be dev, test, staging, or production",
  );
}

function assertApplicationEnvironmentBoundary(
  environment: WebDeploymentEnvironment,
  applicationUri: string,
): void {
  const origin = new URL(applicationUri).origin;
  if (environment === "production") {
    if (applicationUri !== "https://app.samrapay.com/") {
      throw new Error(
        "Production customer authentication is allowed only at https://app.samrapay.com/",
      );
    }
    return;
  }

  if (
    origin === "https://samrapay.com" ||
    origin === "https://www.samrapay.com" ||
    origin === "https://app.samrapay.com" ||
    origin === "https://api.samrapay.com"
  ) {
    throw new Error(
      "A non-production customer build cannot use a Samra production origin",
    );
  }
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
