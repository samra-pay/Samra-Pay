import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

const REVISION_PATTERN = /^[a-z]([a-z0-9-]{0,61}[a-z0-9])?$/;
const PROBE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,47}$/;
const RUN_APP_HOST_PATTERN =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+run\.app$/;
const METADATA_IDENTITY_URL =
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity";
const NETWORK_ATTEMPTS = 7;
const MAX_RETRY_DELAY_MS = 8000;

type Fetch = typeof fetch;
type Sleep = (delayMs: number) => Promise<void>;

export interface StagingRevisionProbeConfig {
  probeUrl: string;
  serviceAudience: string;
  expectedRevision: string;
  probeId: string;
  timeoutMs: number;
}

export interface StagingRevisionProbeResult {
  schemaVersion: 1;
  status: "passed";
  probeId: string;
  unauthenticatedStatus: number;
  authenticatedHealthStatus: number;
  authenticatedReadinessStatus: number;
  healthResponseSha256: string;
  readinessResponseSha256: string;
  observedRevision: string;
  serviceAuthenticationObserved: true;
  deployedRevisionNetworkPathObserved: true;
  tokenRecorded: false;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function isRunAppOrigin(value: string | undefined): value is string {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === "https:" &&
      parsed.username === "" &&
      parsed.password === "" &&
      parsed.port === "" &&
      parsed.pathname === "/" &&
      parsed.search === "" &&
      parsed.hash === "" &&
      RUN_APP_HOST_PATTERN.test(parsed.hostname)
    );
  } catch {
    return false;
  }
}

export function readStagingRevisionProbeConfig(
  environment: NodeJS.ProcessEnv = process.env,
): StagingRevisionProbeConfig {
  const probeUrl = environment["SAMRA_PROBE_URL"]?.trim();
  const serviceAudience = environment["SAMRA_SERVICE_AUDIENCE"]?.trim();
  const expectedRevision = environment["SAMRA_EXPECTED_REVISION"]?.trim();
  const probeId = environment["SAMRA_PROBE_ID"]?.trim();
  const timeoutMs = Number(environment["SAMRA_PROBE_TIMEOUT_MS"] ?? "10000");
  assert(
    isRunAppOrigin(probeUrl),
    "SAMRA_PROBE_URL must be one HTTPS run.app origin",
  );
  assert(
    isRunAppOrigin(serviceAudience),
    "SAMRA_SERVICE_AUDIENCE must be one HTTPS run.app origin",
  );
  assert(
    expectedRevision && REVISION_PATTERN.test(expectedRevision),
    "SAMRA_EXPECTED_REVISION is invalid",
  );
  assert(
    probeId && PROBE_ID_PATTERN.test(probeId),
    "SAMRA_PROBE_ID is invalid",
  );
  assert(
    Number.isSafeInteger(timeoutMs) && timeoutMs >= 1000 && timeoutMs <= 30000,
    "SAMRA_PROBE_TIMEOUT_MS must be between 1000 and 30000",
  );
  return { probeUrl, serviceAudience, expectedRevision, probeId, timeoutMs };
}

function responseHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

const sleep: Sleep = async (delayMs) => {
  await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
};

async function retryNetworkFailure<T>(
  operation: () => Promise<T>,
  sleepImpl: Sleep,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= NETWORK_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === NETWORK_ATTEMPTS) break;
      await sleepImpl(Math.min(1000 * 2 ** (attempt - 1), MAX_RETRY_DELAY_MS));
    }
  }
  throw lastError;
}

async function request(
  fetchImpl: Fetch,
  url: URL,
  timeoutMs: number,
  sleepImpl: Sleep,
  token?: string,
): Promise<Response> {
  return retryNetworkFailure(
    () =>
      fetchImpl(url, {
        method: "GET",
        headers: token
          ? {
              Authorization: `Bearer ${token}`,
              "X-Samra-Probe": "synthetic-staging",
            }
          : { "X-Samra-Probe": "synthetic-staging" },
        redirect: "error",
        signal: AbortSignal.timeout(timeoutMs),
      }),
    sleepImpl,
  );
}

async function getIdentityToken(
  fetchImpl: Fetch,
  audience: string,
  timeoutMs: number,
  sleepImpl: Sleep,
): Promise<string> {
  const url = new URL(METADATA_IDENTITY_URL);
  url.searchParams.set("audience", audience);
  url.searchParams.set("format", "full");
  const response = await retryNetworkFailure(
    () =>
      fetchImpl(url, {
        headers: { "Metadata-Flavor": "Google" },
        redirect: "error",
        signal: AbortSignal.timeout(timeoutMs),
      }),
    sleepImpl,
  );
  assert(response.status === 200, "Metadata identity-token request failed");
  const token = (await response.text()).trim();
  assert(
    token.split(".").length === 3 && token.length >= 100,
    "Metadata identity token is malformed",
  );
  return token;
}

async function verifyJsonResponse(
  response: Response,
  expectedStatus: string,
  expectedRevision: string,
): Promise<{ bodySha256: string; revision: string }> {
  assert(
    response.status === 200,
    `Authenticated ${expectedStatus} request failed`,
  );
  const body = await response.text();
  const parsed = JSON.parse(body) as { status?: unknown };
  assert(
    parsed.status === expectedStatus,
    `${expectedStatus} response drifted`,
  );
  const revision = response.headers.get("x-samra-cloud-run-revision") ?? "";
  assert(
    revision === expectedRevision,
    "Response did not identify the exact revision",
  );
  assert(
    response.headers.get("cache-control")?.includes("no-store") === true,
    "Probe response must not be cached",
  );
  return { bodySha256: responseHash(body), revision };
}

export async function runStagingRevisionProbe(
  config: StagingRevisionProbeConfig,
  fetchImpl: Fetch = fetch,
  sleepImpl: Sleep = sleep,
): Promise<StagingRevisionProbeResult> {
  const healthUrl = new URL("/api/healthz", config.probeUrl);
  healthUrl.searchParams.set("probe", config.probeId);
  const unauthenticated = await request(
    fetchImpl,
    healthUrl,
    config.timeoutMs,
    sleepImpl,
  );
  assert(
    unauthenticated.status === 401 || unauthenticated.status === 403,
    "Unauthenticated request was not rejected",
  );

  const token = await getIdentityToken(
    fetchImpl,
    config.serviceAudience,
    config.timeoutMs,
    sleepImpl,
  );
  const authenticatedHealth = await request(
    fetchImpl,
    healthUrl,
    config.timeoutMs,
    sleepImpl,
    token,
  );
  const health = await verifyJsonResponse(
    authenticatedHealth,
    "ok",
    config.expectedRevision,
  );

  const readinessUrl = new URL("/api/readyz", config.probeUrl);
  readinessUrl.searchParams.set("probe", config.probeId);
  const authenticatedReadiness = await request(
    fetchImpl,
    readinessUrl,
    config.timeoutMs,
    sleepImpl,
    token,
  );
  const readiness = await verifyJsonResponse(
    authenticatedReadiness,
    "ready",
    config.expectedRevision,
  );

  return {
    schemaVersion: 1,
    status: "passed",
    probeId: config.probeId,
    unauthenticatedStatus: unauthenticated.status,
    authenticatedHealthStatus: authenticatedHealth.status,
    authenticatedReadinessStatus: authenticatedReadiness.status,
    healthResponseSha256: health.bodySha256,
    readinessResponseSha256: readiness.bodySha256,
    observedRevision: health.revision,
    serviceAuthenticationObserved: true,
    deployedRevisionNetworkPathObserved: true,
    tokenRecorded: false,
  };
}

async function main(): Promise<void> {
  const result = await runStagingRevisionProbe(
    readStagingRevisionProbeConfig(),
  );
  process.stdout.write(
    `SAMRA_REVISION_PROBE_RESULT=${JSON.stringify(result)}\n`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    process.stderr.write(
      `Staging revision probe failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
