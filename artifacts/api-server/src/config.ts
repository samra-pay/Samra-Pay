export type BackendMode = "disabled" | "demo";
export type ProviderMode = "fake";

export type ApiRuntimeConfig = Readonly<{
  backendMode: BackendMode;
  providerMode: ProviderMode;
  devControlsEnabled: boolean;
  runWorker: boolean;
  workerIntervalMilliseconds: number;
}>;

export function loadApiRuntimeConfig(
  environment: NodeJS.ProcessEnv = process.env,
): ApiRuntimeConfig {
  const backendMode = parseBackendMode(environment["SAMRA_BACKEND_MODE"]);
  const providerMode = parseProviderMode(environment["SAMRA_PROVIDER_MODE"]);
  return Object.freeze({
    backendMode,
    providerMode,
    devControlsEnabled:
      backendMode === "demo" &&
      providerMode === "fake" &&
      environment["NODE_ENV"] !== "production",
    runWorker: parseBoolean(environment["SAMRA_RUN_WORKER"], false),
    workerIntervalMilliseconds: 1_000,
  });
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
