export type BackendMode = "disabled" | "demo";
export type ProviderMode = "fake";
export type PersistenceMode = "memory" | "postgres";
export type CustomerWalletProviderConfig =
  | Readonly<{ mode: "fake" }>
  | Readonly<{
      mode: "crossmint-sandbox-customer";
      apiKey: string;
      allowedCustomerId: string;
      recoveryEmail: string;
    }>;
export type CustomerAuthConfig =
  | Readonly<{ mode: "disabled" }>
  | Readonly<{
      mode: "auth0";
      issuerBaseUrl: string;
      audience: string;
      tokenSigningAlgorithm: "RS256";
    }>;
export type CustomerIdentityProviderConfig =
  | Readonly<{ mode: "fake" }>
  | Readonly<{
      mode: "persona-sandbox";
      apiKey: string;
      inquiryTemplateId: string;
      environmentId: string;
      webhookSecrets: readonly string[];
      apiVersion: "2025-10-27";
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
  customerIdentityProvider?: CustomerIdentityProviderConfig;
  customerWalletProvider?: CustomerWalletProviderConfig;
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
    environment["SAMRA_CUSTOMER_WALLET_PROVIDER_MODE"] !==
      "crossmint-sandbox-customer" &&
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
  const customerIdentityProvider = parseCustomerIdentityProvider(
    environment,
    customerAuth,
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
    customerIdentityProvider,
    customerWalletProvider: parseCustomerWalletProvider(
      environment,
      customerAuth,
      persistenceMode,
    ),
  });
}

function parseCustomerWalletProvider(
  environment: NodeJS.ProcessEnv,
  customerAuth: CustomerAuthConfig,
  persistenceMode: PersistenceMode,
): CustomerWalletProviderConfig {
  const mode = environment["SAMRA_CUSTOMER_WALLET_PROVIDER_MODE"];
  if (mode === undefined || mode === "fake")
    return Object.freeze({ mode: "fake" });
  if (mode !== "crossmint-sandbox-customer") {
    throw new Error(
      "SAMRA_CUSTOMER_WALLET_PROVIDER_MODE supports only fake or crossmint-sandbox-customer.",
    );
  }
  if (
    environment["SAMRA_DEPLOYMENT_ENVIRONMENT"] !== "staging" ||
    customerAuth.mode !== "auth0" ||
    persistenceMode !== "postgres" ||
    environment["SAMRA_INTERNAL_OPERATIONS_ENABLED"] === "true" ||
    environment["SAMRA_RUN_WORKER"] === "true"
  ) {
    throw new Error(
      "Customer-controlled sandbox wallets require staging, Auth0, PostgreSQL, and disabled workers and operations controls.",
    );
  }
  const apiKey = requireEnvironmentValue(
    environment,
    "CROSSMINT_SERVER_API_KEY",
  );
  const allowedCustomerId = requireEnvironmentValue(
    environment,
    "CROSSMINT_SANDBOX_CUSTOMER_ID",
  );
  const recoveryEmail = requireEnvironmentValue(
    environment,
    "CROSSMINT_SANDBOX_RECOVERY_EMAIL",
  );
  if (!/^sk_staging_[A-Za-z0-9]{16,480}$/u.test(apiKey)) {
    throw new Error("CROSSMINT_SERVER_API_KEY must be a staging server key.");
  }
  if (!/^customer_[0-9a-f]{32}$/u.test(allowedCustomerId)) {
    throw new Error(
      "CROSSMINT_SANDBOX_CUSTOMER_ID must be one opaque Samra customer ID.",
    );
  }
  if (
    recoveryEmail.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(recoveryEmail)
  ) {
    throw new Error("CROSSMINT_SANDBOX_RECOVERY_EMAIL is invalid.");
  }
  return Object.freeze({ mode, apiKey, allowedCustomerId, recoveryEmail });
}

function parseCustomerIdentityProvider(
  environment: NodeJS.ProcessEnv,
  customerAuth: CustomerAuthConfig,
  persistenceMode: PersistenceMode,
): CustomerIdentityProviderConfig {
  const mode = environment["SAMRA_CUSTOMER_IDENTITY_PROVIDER_MODE"];
  if (mode === undefined || mode === "fake") {
    return Object.freeze({ mode: "fake" });
  }
  if (mode !== "persona-sandbox") {
    throw new Error(
      `SAMRA_CUSTOMER_IDENTITY_PROVIDER_MODE must be "fake" or "persona-sandbox"; received "${mode}". Persona production mode is not implemented.`,
    );
  }
  if (customerAuth.mode !== "auth0" || persistenceMode !== "postgres") {
    throw new Error(
      "SAMRA_CUSTOMER_IDENTITY_PROVIDER_MODE=persona-sandbox requires Auth0 customer mode with PostgreSQL persistence.",
    );
  }

  const apiKey = requireEnvironmentValue(environment, "PERSONA_API_KEY");
  if (!/^persona_sandbox_[A-Za-z0-9_-]{12,}$/u.test(apiKey)) {
    throw new Error(
      "PERSONA_API_KEY must be a Persona sandbox key. Production keys are prohibited in this runtime.",
    );
  }
  const inquiryTemplateId = requireEnvironmentValue(
    environment,
    "PERSONA_INQUIRY_TEMPLATE_ID",
  );
  if (!/^itmpl_[A-Za-z0-9]{8,}$/u.test(inquiryTemplateId)) {
    throw new Error(
      "PERSONA_INQUIRY_TEMPLATE_ID must be an opaque Persona template ID beginning with itmpl_.",
    );
  }
  const environmentId = requireEnvironmentValue(
    environment,
    "PERSONA_ENVIRONMENT_ID",
  );
  if (!/^env_[A-Za-z0-9]{8,}$/u.test(environmentId)) {
    throw new Error(
      "PERSONA_ENVIRONMENT_ID must be an opaque Persona environment ID beginning with env_.",
    );
  }
  const currentWebhookSecret = validatePersonaWebhookSecret(
    requireEnvironmentValue(environment, "PERSONA_WEBHOOK_SECRET"),
    "PERSONA_WEBHOOK_SECRET",
  );
  const previousWebhookSecret =
    environment["PERSONA_WEBHOOK_SECRET_PREVIOUS"]?.trim();
  const webhookSecrets = previousWebhookSecret
    ? Object.freeze([
        currentWebhookSecret,
        validatePersonaWebhookSecret(
          previousWebhookSecret,
          "PERSONA_WEBHOOK_SECRET_PREVIOUS",
        ),
      ])
    : Object.freeze([currentWebhookSecret]);
  if (new Set(webhookSecrets).size !== webhookSecrets.length) {
    throw new Error(
      "Persona current and previous webhook secrets must be different during rotation.",
    );
  }

  return Object.freeze({
    mode: "persona-sandbox",
    apiKey,
    inquiryTemplateId,
    environmentId,
    webhookSecrets,
    apiVersion: "2025-10-27",
  });
}

function validatePersonaWebhookSecret(value: string, name: string): string {
  if (
    value.length < 16 ||
    value.length > 512 ||
    /\s/u.test(value) ||
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw new Error(
      `${name} must be 16 to 512 non-whitespace visible characters.`,
    );
  }
  return value;
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
    throw new Error(`${name} is required by the selected runtime mode.`);
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
