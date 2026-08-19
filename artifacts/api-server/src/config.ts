export type BackendMode = "disabled" | "demo";
export type ProviderMode = "fake";
export type PersistenceMode = "memory" | "postgres";
export type CustomerAuthConfig =
  | Readonly<{ mode: "disabled" }>
  | Readonly<{
      mode: "auth0";
      issuerBaseUrl: string;
      audience: string;
      tokenSigningAlgorithm: "RS256";
    }>;

export type ApiRuntimeConfig = Readonly<{
  backendMode: BackendMode;
  providerMode: ProviderMode;
  persistenceMode?: PersistenceMode;
  devControlsEnabled: boolean;
  runWorker: boolean;
  workerIntervalMilliseconds: number;
  internalOperationsEnabled?: boolean;
  customerAuth: CustomerAuthConfig;
}>;

export function loadApiRuntimeConfig(
  environment: NodeJS.ProcessEnv = process.env,
): ApiRuntimeConfig {
  const backendMode = parseBackendMode(environment["SAMRA_BACKEND_MODE"]);
  const providerMode = parseProviderMode(environment["SAMRA_PROVIDER_MODE"]);
  const persistenceMode = parsePersistenceMode(
    environment["SAMRA_PERSISTENCE_MODE"],
  );
  const devControlsEnabled =
    backendMode === "demo" &&
    providerMode === "fake" &&
    environment["NODE_ENV"] !== "production";
  const operationsRequested = parseBoolean(
    environment["SAMRA_INTERNAL_OPERATIONS_ENABLED"],
    false,
  );
  if (
    operationsRequested &&
    (!devControlsEnabled || persistenceMode !== "postgres")
  ) {
    throw new Error(
      "SAMRA_INTERNAL_OPERATIONS_ENABLED requires non-production demo/fake mode with PostgreSQL persistence.",
    );
  }
  const customerAuth = parseCustomerAuth(
    environment,
    backendMode,
    persistenceMode,
  );
  return Object.freeze({
    backendMode,
    providerMode,
    persistenceMode,
    devControlsEnabled,
    runWorker: parseBoolean(environment["SAMRA_RUN_WORKER"], false),
    workerIntervalMilliseconds: 1_000,
    internalOperationsEnabled: operationsRequested,
    customerAuth,
  });
}

function parseCustomerAuth(
  environment: NodeJS.ProcessEnv,
  backendMode: BackendMode,
  persistenceMode: PersistenceMode,
): CustomerAuthConfig {
  const mode = environment["SAMRA_CUSTOMER_AUTH_MODE"];
  if (mode === undefined || mode === "disabled") {
    return Object.freeze({ mode: "disabled" });
  }
  if (mode !== "auth0") {
    throw new Error(
      `SAMRA_CUSTOMER_AUTH_MODE must be "disabled" or "auth0"; received "${mode}".`,
    );
  }
  if (backendMode !== "demo" || persistenceMode !== "postgres") {
    throw new Error(
      "SAMRA_CUSTOMER_AUTH_MODE=auth0 requires demo backend mode with PostgreSQL persistence until the production runtime is authorized.",
    );
  }

  const issuerBaseUrl = normalizeAuth0Issuer(
    requireEnvironmentValue(environment, "AUTH0_ISSUER_BASE_URL"),
  );
  const audience = requireEnvironmentValue(environment, "AUTH0_AUDIENCE");
  if (audience.length > 512 || /\s/.test(audience)) {
    throw new Error(
      "AUTH0_AUDIENCE must be a non-empty exact API identifier without whitespace and no more than 512 characters.",
    );
  }
  return Object.freeze({
    mode: "auth0",
    issuerBaseUrl,
    audience,
    tokenSigningAlgorithm: "RS256",
  });
}

function requireEnvironmentValue(
  environment: NodeJS.ProcessEnv,
  name: string,
): string {
  const value = environment[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required when customer Auth0 mode is enabled.`);
  }
  return value;
}

function normalizeAuth0Issuer(value: string): string {
  let issuer: URL;
  try {
    issuer = new URL(value);
  } catch {
    throw new Error("AUTH0_ISSUER_BASE_URL must be a valid HTTPS URL.");
  }
  if (
    issuer.protocol !== "https:" ||
    issuer.username ||
    issuer.password ||
    issuer.search ||
    issuer.hash ||
    (issuer.pathname !== "/" && issuer.pathname !== "")
  ) {
    throw new Error(
      "AUTH0_ISSUER_BASE_URL must be an HTTPS origin without credentials, a path, query, or fragment.",
    );
  }
  return `${issuer.origin}/`;
}

function parsePersistenceMode(value: string | undefined): PersistenceMode {
  if (value === undefined || value === "memory") return "memory";
  if (value === "postgres") return "postgres";
  throw new Error(
    `SAMRA_PERSISTENCE_MODE must be "memory" or "postgres"; received "${value}".`,
  );
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  throw new Error(`Expected "true" or "false"; received "${value}".`);
}

function parseBackendMode(value: string | undefined): BackendMode {
  if (value === undefined || value === "disabled") {
    return "disabled";
  }
  if (value === "demo") {
    return value;
  }
  throw new Error(
    `SAMRA_BACKEND_MODE must be "disabled" or "demo"; received "${value}".`,
  );
}

function parseProviderMode(value: string | undefined): ProviderMode {
  if (value === undefined || value === "fake") {
    return "fake";
  }
  throw new Error(
    `SAMRA_PROVIDER_MODE only supports "fake" in this architecture foundation; received "${value}".`,
  );
}
