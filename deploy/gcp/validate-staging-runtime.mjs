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
        customerWeb: ["cloud-run-invoker:samra-api"],
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
        SAMRA_CUSTOMER_AUTH_MODE: "auth0",
        SAMRA_CUSTOMER_IDENTITY_PROVIDER_MODE: "fake",
      }),
    "API must remain durable synthetic staging with Auth0 and vendor activation disabled",
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
  assert(
    JSON.stringify(api.requiredRuntimeEnvironment) ===
      JSON.stringify(["AUTH0_ISSUER_BASE_URL", "AUTH0_AUDIENCE"]),
    "API must receive only the required non-secret Auth0 identifiers",
  );
  for (const name of SERVICE_NAMES.filter((name) => name !== "samra-api")) {
    const service = contract.services[name];
    assert(
      service.databaseAccess === false && service.secretAccess.length === 0,
      `${name} must not access the database or secrets`,
    );
  }
  assert(
    JSON.stringify(
      contract.services["samra-customer-web"].requiredRuntimeEnvironment,
    ) ===
      JSON.stringify([
        "SAMRA_API_ORIGIN",
        "SAMRA_API_SERVICE_AUTH_MODE",
        "SAMRA_API_SERVICE_AUDIENCE",
        "SAMRA_PUBLIC_DATA_MODE",
        "SAMRA_PUBLIC_AUTH0_DOMAIN",
        "SAMRA_PUBLIC_AUTH0_CLIENT_ID",
        "SAMRA_PUBLIC_AUTH0_AUDIENCE",
      ]),
    "Customer web must receive only the API origin and public runtime identifiers",
  );
  assert(
    JSON.stringify(
      contract.services["samra-customer-web"].apiProxyAuthentication,
    ) ===
      JSON.stringify({
        mode: "cloud-run-iam",
        tokenSource: "cloud-run-metadata-service-identity",
        serviceAuthorizationHeader: "X-Serverless-Authorization",
        customerAuthorizationHeader: "Authorization",
        audienceEnvironment: "SAMRA_API_SERVICE_AUDIENCE",
        inboundServiceAuthorizationStripped: true,
        credentialsStored: false,
      }),
    "Customer web must preserve Auth0 authorization behind exact Cloud Run service identity",
  );
  assert(
    JSON.stringify(
      contract.services["samra-operations-web"].requiredRuntimeEnvironment,
    ) === JSON.stringify(["SAMRA_API_ORIGIN"]),
    "Operations web must receive only the public API origin",
  );

  validateVendorReadiness(contract);

  assert(
    contract.database.privateIpRequired === true &&
      contract.database.publicIpAllowed === false &&
      contract.database.automaticMigrationAllowed === false &&
      contract.database.accessContract ===
        "deploy/gcp/staging-database-access.json" &&
      contract.database.runtimeSecretReference ===
        "projects/PROJECT_ID/secrets/samra-staging-database-url/versions/PINNED_INTEGER" &&
      contract.database.migrationSecretReference ===
        "projects/PROJECT_ID/secrets/samra-staging-migration-database-url/versions/PINNED_INTEGER" &&
      contract.database.runtimeSecretReference !==
        contract.database.migrationSecretReference,
    "Private database, split-secret, and pinned-version controls are required",
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
  const customerDeployIndex = contract.releaseOrder.indexOf(
    "deploy authenticated customer web and design preview with zero traffic",
  );
  const serviceAuthProofIndex = contract.releaseOrder.indexOf(
    "prove customer-web service identity can invoke API while preserving Auth0 bearer authorization",
  );
  const customerTrafficIndex = contract.releaseOrder.indexOf(
    "promote customer web traffic",
  );
  assert(
    migrationIndex >= 0 &&
      migrationIndex < apiIndex &&
      apiIndex < trafficIndex &&
      trafficIndex < customerDeployIndex &&
      customerDeployIndex < serviceAuthProofIndex &&
      serviceAuthProofIndex < customerTrafficIndex,
    "Migration, zero-traffic deployment, service-auth proof, and traffic promotion order drifted",
  );

  for (const gate of [
    "approved load balancer and identity-aware access policy",
    "exact customer-web roles/run.invoker grant on samra-api and zero-traffic dual-token proof",
    "approved Auth0 tenant, API audience, callback, logout, and allowed-origin inventory",
    "separate Persona and Crossmint activation reviews with pinned secret versions",
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
    "real KYC or wallet providers without a separate activation gate",
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

function validateVendorReadiness(contract) {
  const readiness = contract.vendorReadiness;
  assert(
    JSON.stringify(Object.keys(readiness)) ===
      JSON.stringify(["auth0", "persona", "crossmint"]),
    "The reviewed vendor-readiness set changed",
  );

  const auth0 = readiness.auth0;
  assert(
    auth0.status === "required-before-staging-deployment" &&
      auth0.apiMode === "auth0" &&
      JSON.stringify(auth0.apiRuntimeEnvironment) ===
        JSON.stringify(["AUTH0_ISSUER_BASE_URL", "AUTH0_AUDIENCE"]) &&
      JSON.stringify(auth0.customerWebRuntimeEnvironment) ===
        JSON.stringify([
          "SAMRA_PUBLIC_AUTH0_DOMAIN",
          "SAMRA_PUBLIC_AUTH0_CLIENT_ID",
          "SAMRA_PUBLIC_AUTH0_AUDIENCE",
        ]) &&
      auth0.customerWebSecrets.length === 0 &&
      JSON.stringify(auth0.mobileRuntimeEnvironment) ===
        JSON.stringify([
          "EXPO_PUBLIC_SAMRA_AUTH_MODE",
          "EXPO_PUBLIC_AUTH0_DOMAIN",
          "EXPO_PUBLIC_AUTH0_CLIENT_ID",
          "EXPO_PUBLIC_AUTH0_AUDIENCE",
        ]) &&
      auth0.mobileSecrets.length === 0 &&
      auth0.mobileSdk === "react-native-auth0@5.7.0" &&
      auth0.mobileApplicationId === "com.samrapay.mobile.staging" &&
      auth0.mobileCustomScheme === "samrapayauth" &&
      auth0.mobileTokenStorage === "ios-keychain-android-encrypted-storage" &&
      auth0.mobileBoundaryImplemented === true &&
      auth0.mobileClientConnected === false &&
      auth0.expoGoPreviewPreserved === true &&
      auth0.tokenAlgorithm === "RS256" &&
      auth0.tokenStorage === "memory-only" &&
      auth0.refreshTokensEnabled === false &&
      auth0.clientSecretAllowed === false &&
      auth0.activationBlockedOn.length === 5,
    "Auth0 must remain secretless, disconnected, fail-closed, and Expo Go compatible",
  );

  const persona = readiness.persona;
  assert(
    persona.status === "prepared-not-authorized" &&
      persona.mode === "persona-sandbox" &&
      persona.serviceAccount === "api" &&
      JSON.stringify(persona.nonSecretRuntimeEnvironment) ===
        JSON.stringify([
          "PERSONA_INQUIRY_TEMPLATE_ID",
          "PERSONA_ENVIRONMENT_ID",
        ]) &&
      persona.secretAccessAuthorized === false,
    "Persona must remain sandbox-only and unauthorized",
  );
  assertSecretMappings(persona.secretMappings, {
    PERSONA_API_KEY: ["samra-staging-persona-api-key", true, false],
    PERSONA_WEBHOOK_SECRET: [
      "samra-staging-persona-webhook-secret",
      true,
      false,
    ],
    PERSONA_WEBHOOK_SECRET_PREVIOUS: [
      "samra-staging-persona-webhook-secret-previous",
      false,
      true,
    ],
  });
  assert(
    persona.activationBlockedOn.length === 5,
    "Persona activation blockers drifted",
  );

  const crossmint = readiness.crossmint;
  assert(
    crossmint.status === "sandbox-adapter-dormant-not-authorized" &&
      crossmint.mode === "fake" &&
      crossmint.serviceAccount === "api" &&
      crossmint.stagingApiOrigin ===
        "https://staging.crossmint.com/api/2025-06-09" &&
      JSON.stringify(crossmint.serverCredential) ===
        JSON.stringify({
          environment: "CROSSMINT_SERVER_API_KEY",
          secret: "samra-staging-crossmint-server-api-key",
          version: "PINNED_INTEGER",
        }) &&
      crossmint.serverCredentialAllowedInClient === false &&
      crossmint.secretAccessAuthorized === false &&
      crossmint.sandboxAdapterImplemented === true &&
      crossmint.liveAdapterImplemented === false &&
      crossmint.activationBlockedOn.length === 5,
    "Crossmint must remain a dormant server-only staging contract",
  );

  const vendorSource = JSON.stringify(readiness);
  assert(
    !/versions\/latest|worf\.replit|postgres(?:ql)?:\/\//i.test(vendorSource),
    "Vendor readiness contains an unpinned secret, Replit endpoint, or database value",
  );
}

function assertSecretMappings(actual, expected) {
  assert(
    JSON.stringify(Object.keys(actual)) ===
      JSON.stringify(Object.keys(expected)),
    "Persona secret mapping set drifted",
  );
  for (const [environment, [secret, required, rotationOnly]] of Object.entries(
    expected,
  )) {
    const mapping = actual[environment];
    assert(
      mapping.secret === secret &&
        mapping.version === "PINNED_INTEGER" &&
        mapping.required === required &&
        Boolean(mapping.rotationOnly) === rotationOnly,
      `${environment} secret mapping drifted`,
    );
  }
}

export function validateRuntimeReviewEnvironment(
  input,
  contract = readStagingRuntime(),
) {
  const validated = validateStagingRuntime(contract);
  const required = {
    SAMRA_GCP_PROJECT_ID: "samra-pay-staging",
    SAMRA_GCP_ORGANIZATION_ID: "993968777863",
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
