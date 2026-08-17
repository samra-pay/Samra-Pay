export type BackendMode = "disabled" | "demo";
export type ProviderMode = "fake";
export type PersistenceMode = "memory" | "postgres";

export type ApiRuntimeConfig = Readonly<{
  backendMode: BackendMode;
  providerMode: ProviderMode;
  persistenceMode?: PersistenceMode;
  devControlsEnabled: boolean;
  runWorker: boolean;
  workerIntervalMilliseconds: number;
  internalOperationsEnabled?: boolean;
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
  return Object.freeze({
    backendMode,
    providerMode,
    persistenceMode,
    devControlsEnabled,
    runWorker: parseBoolean(environment["SAMRA_RUN_WORKER"], false),
    workerIntervalMilliseconds: 1_000,
    internalOperationsEnabled: operationsRequested,
  });
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
