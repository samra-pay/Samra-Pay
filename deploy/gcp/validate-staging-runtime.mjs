import { readFileSync } from "node:fs";

const SERVICE_NAMES = [
  "samra-api",
  "samra-customer-web",
  "samra-operations-web",
  "samra-design-system-preview",
];
const IMAGE_NAMES = [...SERVICE_NAMES, "samra-migrations"];
const IDENTITY_NAMES = [
  "build",
  "deployer",
  "api",
  "customerWeb",
  "operationsWeb",
  "designSystem",
  "migrations",
];

export function readStagingRuntime() {
  return JSON.parse(
    readFileSync(
      new URL("./staging-runtime-contract.json", import.meta.url),
      "utf8",
    ),
  );
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function validateStagingRuntime(contract = readStagingRuntime()) {
  assert(contract.schemaVersion === 1, "Unsupported staging runtime schema");
  assert(
    contract.status === "review-only" &&
      contract.environment === "staging" &&
      contract.dataClassification === "synthetic-only" &&
      contract.deploymentAuthorized === false,
    "Runtime contract must remain review-only synthetic staging",
  );

  assert(
    contract.imageContract.registry ===
      "REGION-docker.pkg.dev/PROJECT_ID/samra-staging" &&
      contract.imageContract.tag === "FULL_GIT_SHA" &&
      contract.imageContract.immutableTagsRequired === true &&
      contract.imageContract.digestRecordedAfterBuild === true,
    "Runtime images must be immutable full-SHA artifacts",
  );

  assert(
    JSON.stringify(Object.keys(contract.services)) ===
      JSON.stringify(SERVICE_NAMES),
    "The reviewed staging service set changed",
  );
  for (const name of SERVICE_NAMES) {
    const service = contract.services[name];
    assert(service.image === `${name}:FULL_GIT_SHA`, `${name} image drifted`);
    assert(
      service.ingress === "internal-and-cloud-load-balancing" &&
        service.authentication === "required" &&
        service.defaultUrlDisabled === true &&
        service.minInstances === 0 &&
        service.maxInstances >= 1 &&
        service.maxInstances <= 2,
      `${name} ingress, authentication, or scale boundary drifted`,
    );
  }
  assert(
    contract.migrationJob.image === "samra-migrations:FULL_GIT_SHA",
    "Migration image drifted",
  );

  assert(
    JSON.stringify(Object.keys(contract.identities)) ===
      JSON.stringify(IDENTITY_NAMES),
    "The reviewed identity set changed",
  );
  const identities = Object.values(contract.identities);
  assert(
    new Set(identities).size === identities.length,
    "Every trust boundary requires a distinct identity",
  );
  for (const identity of identities) {
    assert(
      /^samra-[a-z-]+-staging@PROJECT_ID\.iam\.gserviceaccount\.com$/.test(
        identity,
      ) && !/compute@developer|cloudbuild\.gserviceaccount/.test(identity),
      "Default or malformed service account found",
    );
  }
  for (const name of SERVICE_NAMES) {
    assert(
      contract.identities[contract.services[name].serviceAccount],
      `${name} references an unknown service account`,
    );
  }
  assert(
    contract.identities[contract.migrationJob.serviceAccount],
    "Migration job references an unknown service account",
  );
  assert(
    JSON.stringify(contract.identityCapabilities) ===
      JSON.stringify({
        api: ["cloud-sql-client", "database-secret-accessor"],
        migrations: ["cloud-sql-client", "database-secret-accessor"],
        customerWeb: [],
        operationsWeb: [],
        designSystem: [],
      }),
    "Identity capabilities drifted",
  );

  const api = contract.services["samra-api"];
  assert(
    JSON.stringify(api.environment) ===
      JSON.stringify({
        NODE_ENV: "production",
        SAMRA_BACKEND_MODE: "demo",
        SAMRA_PROVIDER_MODE: "fake",
        SAMRA_PERSISTENCE_MODE: "postgres",
        SAMRA_RUN_WORKER: "true",
        SAMRA_INTERNAL_OPERATIONS_ENABLED: "false",
      }),
    "API must remain durable synthetic staging with operations disabled",
  );
  assert(
    api.databaseAccess === true &&
      JSON.stringify(api.secretAccess) ===
        JSON.stringify(["runtime-database-url"]) &&
      api.databasePool.maxConnections === 5 &&
      api.startupProbe === "/api/readyz" &&
      api.livenessProbe === "/api/healthz",
    "API database or health boundary drifted",
  );
  for (const name of SERVICE_NAMES.filter((name) => name !== "samra-api")) {
    const service = contract.services[name];
    assert(
      service.databaseAccess === false && service.secretAccess.length === 0,
      `${name} must not access the database or secrets`,
    );
  }
  for (const name of ["samra-customer-web", "samra-operations-web"]) {
    assert(
      JSON.stringify(contract.services[name].requiredRuntimeEnvironment) ===
        JSON.stringify(["SAMRA_API_ORIGIN"]),
      `${name} must receive only the public API origin`,
    );
  }

  assert(
    contract.database.privateIpRequired === true &&
      contract.database.publicIpAllowed === false &&
      contract.database.automaticMigrationAllowed === false &&
      contract.database.accessContract ===
        "deploy/gcp/staging-database-access.json" &&
      contract.database.runtimeSecretReference !==
        contract.database.migrationSecretReference,
    "Private database and split-secret controls are required",
  );
  assert(
    contract.migrationJob.tasks === 1 &&
      contract.migrationJob.parallelism === 1 &&
      contract.migrationJob.maxRetries === 0 &&
      contract.migrationJob.timeoutSeconds === 600 &&
      contract.migrationJob.manualExecutionOnly === true &&
      contract.migrationJob.databaseAccess === true &&
      JSON.stringify(contract.migrationJob.secretAccess) ===
        JSON.stringify(["migration-database-url"]),
    "Migration execution must remain manual, serial, bounded, and non-retrying",
  );

  assert(
    JSON.stringify(
      contract.services["samra-operations-web"].deploymentBlockedOn,
    ) ===
      JSON.stringify([
        "workforce authentication and authorization",
        "staff access review and revocation process",
        "operations API production-security promotion",
      ]),
    "Operations Portal blockers must remain explicit",
  );
  const migrationIndex = contract.releaseOrder.indexOf(
    "execute reviewed migration job once",
  );
  const apiIndex = contract.releaseOrder.indexOf(
    "deploy API revision with zero traffic",
  );
  const trafficIndex = contract.releaseOrder.indexOf("promote API traffic");
  assert(
    migrationIndex >= 0 && migrationIndex < apiIndex && apiIndex < trafficIndex,
    "Migration, zero-traffic deployment, and traffic promotion order drifted",
  );

  for (const gate of [
    "approved load balancer and identity-aware access policy",
    "service-to-service authentication for API proxy calls",
    "logging, alerts, rollback owner, and cost budget",
    "critical Qase regression with no unresolved severity-one or severity-two defect",
  ]) {
    assert(contract.approvalGates.includes(gate), `Missing gate: ${gate}`);
  }
  for (const forbidden of [
    "plaintext secrets",
    "default service accounts",
    "floating image tags",
    "automatic migrations",
    "public unauthenticated services",
    "real providers",
    "customer data",
    "production claims",
    "Replit runtime dependency",
  ]) {
    assert(contract.forbidden.includes(forbidden), `Missing ban: ${forbidden}`);
  }

  const source = JSON.stringify(contract);
  assert(
    !/postgres(?:ql)?:\/\/|12345678|worf\.replit|--allow-unauthenticated/i.test(
      source,
    ),
    "Runtime contract contains a credential, Replit endpoint, or public access",
  );

  return Object.freeze({
    schemaVersion: contract.schemaVersion,
    status: "validated",
    environment: contract.environment,
    serviceCount: SERVICE_NAMES.length,
    imageCount: IMAGE_NAMES.length,
    identityCount: identities.length,
    operationsPortalBlocked: true,
    deploymentAuthorized: false,
  });
}

export function validateRuntimeReviewEnvironment(
  input,
  contract = readStagingRuntime(),
) {
  const validated = validateStagingRuntime(contract);
  const required = {
    SAMRA_GCP_PROJECT_ID: "samra-pay-staging",
    SAMRA_GCP_ORGANIZATION_ID: "614833350075",
    SAMRA_GCP_REGION: "us-east4",
  };
  for (const [key, expected] of Object.entries(required)) {
    assert(
      input[key]?.trim() === expected,
      `${key} must exactly match ${expected}`,
    );
  }
  const operator = input.SAMRA_GCP_OPERATOR_ACCOUNT?.trim();
  assert(
    operator && /^[^@\s]+@davidhaile\.com$/.test(operator),
    "SAMRA_GCP_OPERATOR_ACCOUNT must be a davidhaile.com administrator",
  );
  const expectedSha = input.SAMRA_GCP_EXPECTED_SHA?.trim();
  assert(
    expectedSha && /^[0-9a-f]{40}$/.test(expectedSha),
    "SAMRA_GCP_EXPECTED_SHA must be a full lowercase Git SHA",
  );
  return Object.freeze({ ...validated, ...required, operator, expectedSha });
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  try {
    process.stdout.write(`${JSON.stringify(validateStagingRuntime())}\n`);
  } catch (error) {
    process.stderr.write(
      `Invalid staging runtime contract: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
