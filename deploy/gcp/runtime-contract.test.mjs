import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const contractPath = "deploy/gcp/staging-runtime-contract.json";
const source = await readFile(contractPath, "utf8");
const contract = JSON.parse(source);
const services = Object.entries(contract.services);

test("keeps the staging plan review-only and synthetic", () => {
  assert.equal(contract.schemaVersion, 1);
  assert.equal(contract.status, "review-only");
  assert.equal(contract.environment, "staging");
  assert.equal(contract.dataClassification, "synthetic-only");
  assert.equal(contract.deploymentAuthorized, false);
  assert.equal(contract.imageContract.tag, "FULL_GIT_SHA");
  assert.equal(contract.imageContract.immutableTagsRequired, true);
  assert.equal(contract.imageContract.digestRecordedAfterBuild, true);
  assert.deepEqual(Object.keys(contract.services), [
    "samra-api",
    "samra-customer-web",
    "samra-operations-web",
    "samra-design-system-preview",
  ]);
  for (const [name, service] of services) {
    assert.equal(service.image, `${name}:FULL_GIT_SHA`);
  }
  assert.equal(contract.migrationJob.image, "samra-migrations:FULL_GIT_SHA");
});

test("uses distinct non-default identities for every trust boundary", () => {
  const identities = Object.values(contract.identities);
  assert.equal(new Set(identities).size, identities.length);
  for (const identity of identities) {
    assert.match(
      identity,
      /^samra-[a-z-]+-staging@PROJECT_ID\.iam\.gserviceaccount\.com$/,
    );
    assert.doesNotMatch(
      identity,
      /compute@developer|cloudbuild\.gserviceaccount/,
    );
  }

  for (const [, service] of services) {
    assert.ok(contract.identities[service.serviceAccount]);
  }
  assert.ok(contract.identities[contract.migrationJob.serviceAccount]);
});

test("limits database and secret access to API and migration identities", () => {
  assert.deepEqual(contract.identityCapabilities.api, [
    "cloud-sql-client",
    "database-secret-accessor",
  ]);
  assert.deepEqual(contract.identityCapabilities.migrations, [
    "cloud-sql-client",
    "database-secret-accessor",
  ]);
  assert.deepEqual(contract.identityCapabilities.customerWeb, [
    "cloud-run-invoker:samra-api",
  ]);
  for (const name of ["operationsWeb", "designSystem"]) {
    assert.deepEqual(contract.identityCapabilities[name], []);
  }

  for (const [name, service] of services) {
    const shouldAccessDatabase = name === "samra-api";
    assert.equal(service.databaseAccess, shouldAccessDatabase);
    assert.deepEqual(
      service.secretAccess,
      shouldAccessDatabase ? ["runtime-database-url"] : [],
    );
  }
  assert.equal(contract.migrationJob.databaseAccess, true);
  assert.deepEqual(contract.migrationJob.secretAccess, [
    "migration-database-url",
  ]);
  assert.notEqual(
    contract.database.runtimeSecretReference,
    contract.database.migrationSecretReference,
  );
});

test("pins the private cost-bounded staging database substrate", () => {
  assert.deepEqual(
    {
      engine: contract.database.engine,
      network: contract.database.network,
      subnet: contract.database.subnet,
      privateServicesAccessRange: contract.database.privateServicesAccessRange,
      edition: contract.database.edition,
      tier: contract.database.tier,
      availabilityType: contract.database.availabilityType,
      diskSizeGb: contract.database.diskSizeGb,
      storageAutoResizeLimitGb: contract.database.storageAutoResizeLimitGb,
      privateIpRequired: contract.database.privateIpRequired,
      publicIpAllowed: contract.database.publicIpAllowed,
      retainedBackups: contract.database.retainedBackups,
      transactionLogRetentionDays:
        contract.database.transactionLogRetentionDays,
      deletionProtectionRequired: contract.database.deletionProtectionRequired,
    },
    {
      engine: "postgresql-16",
      network: "samra-staging-vpc",
      subnet: "samra-staging-us-east4",
      privateServicesAccessRange: "google-managed-services-samra-staging-vpc",
      edition: "enterprise",
      tier: "db-g1-small",
      availabilityType: "zonal-non-production",
      diskSizeGb: 10,
      storageAutoResizeLimitGb: 50,
      privateIpRequired: true,
      publicIpAllowed: false,
      retainedBackups: 7,
      transactionLogRetentionDays: 7,
      deletionProtectionRequired: true,
    },
  );
});

test("requires authenticated load-balancer ingress for every service", () => {
  for (const [name, service] of services) {
    assert.equal(
      service.ingress,
      "internal-and-cloud-load-balancing",
      `${name} ingress`,
    );
    assert.equal(service.authentication, "required", `${name} auth`);
    assert.equal(service.defaultUrlDisabled, true, `${name} default URL`);
    assert.equal(service.minInstances, 0, `${name} min instances`);
    assert.ok(service.maxInstances >= 1 && service.maxInstances <= 2);
  }
  assert.ok(
    contract.approvalGates.includes(
      "approved load balancer and identity-aware access policy",
    ),
  );
  assert.ok(
    contract.approvalGates.includes(
      "exact customer-web roles/run.invoker grant on samra-api and zero-traffic dual-token proof",
    ),
  );
});

test("locks the API to durable synthetic mode with explicit health checks", () => {
  const api = contract.services["samra-api"];
  assert.deepEqual(api.environment, {
    NODE_ENV: "production",
    SAMRA_RELEASE_PROFILE: "alpha-release-1",
    SAMRA_BACKEND_MODE: "demo",
    SAMRA_PROVIDER_MODE: "fake",
    SAMRA_PERSISTENCE_MODE: "postgres",
    SAMRA_RUN_WORKER: "false",
    SAMRA_INTERNAL_OPERATIONS_ENABLED: "false",
    SAMRA_CUSTOMER_AUTH_MODE: "auth0",
    SAMRA_CUSTOMER_IDENTITY_PROVIDER_MODE: "fake",
    SAMRA_CUSTOMER_WALLET_PROVIDER_MODE: "fake",
  });
  assert.deepEqual(api.requiredRuntimeEnvironment, [
    "AUTH0_ISSUER_BASE_URL",
    "AUTH0_AUDIENCE",
  ]);
  assert.equal(api.startupProbe, "/api/readyz");
  assert.equal(api.livenessProbe, "/api/healthz");
  assert.deepEqual(api.databasePool, {
    maxConnections: 5,
    idleTimeoutMilliseconds: 30000,
    connectionTimeoutMilliseconds: 10000,
  });
});

test("keeps Auth0 portable and Persona plus Crossmint separately gated", () => {
  const { auth0, persona, crossmint } = contract.vendorReadiness;

  assert.equal(auth0.status, "required-before-staging-deployment");
  assert.deepEqual(auth0.customerWebSecrets, []);
  assert.deepEqual(auth0.mobileRuntimeEnvironment, [
    "EXPO_PUBLIC_SAMRA_AUTH_MODE",
    "EXPO_PUBLIC_AUTH0_DOMAIN",
    "EXPO_PUBLIC_AUTH0_CLIENT_ID",
    "EXPO_PUBLIC_AUTH0_AUDIENCE",
  ]);
  assert.deepEqual(auth0.mobileSecrets, []);
  assert.equal(auth0.mobileSdk, "react-native-auth0@5.7.0");
  assert.equal(auth0.mobileApplicationId, "com.samrapay.mobile.staging");
  assert.equal(auth0.mobileCustomScheme, "samrapayauth");
  assert.equal(
    auth0.mobileTokenStorage,
    "ios-keychain-android-encrypted-storage",
  );
  assert.equal(auth0.mobileBoundaryImplemented, true);
  assert.equal(auth0.mobileClientConnected, false);
  assert.equal(auth0.expoGoPreviewPreserved, true);
  assert.equal(auth0.activationBlockedOn.length, 5);
  assert.equal(auth0.clientSecretAllowed, false);
  assert.equal(auth0.tokenAlgorithm, "RS256");
  assert.equal(auth0.tokenStorage, "memory-only");
  assert.equal(auth0.refreshTokensEnabled, false);
  assert.deepEqual(
    contract.services["samra-customer-web"].requiredRuntimeEnvironment,
    [
      "SAMRA_API_ORIGIN",
      "SAMRA_API_SERVICE_AUTH_MODE",
      "SAMRA_API_SERVICE_AUDIENCE",
      "SAMRA_PUBLIC_DATA_MODE",
      "SAMRA_PUBLIC_AUTH0_DOMAIN",
      "SAMRA_PUBLIC_AUTH0_CLIENT_ID",
      "SAMRA_PUBLIC_AUTH0_AUDIENCE",
    ],
  );
  assert.deepEqual(
    contract.services["samra-customer-web"].apiProxyAuthentication,
    {
      mode: "cloud-run-iam",
      tokenSource: "cloud-run-metadata-service-identity",
      serviceAuthorizationHeader: "X-Serverless-Authorization",
      customerAuthorizationHeader: "Authorization",
      audienceEnvironment: "SAMRA_API_SERVICE_AUDIENCE",
      inboundServiceAuthorizationStripped: true,
      credentialsStored: false,
    },
  );

  assert.equal(persona.status, "prepared-not-authorized");
  assert.equal(persona.secretAccessAuthorized, false);
  for (const mapping of Object.values(persona.secretMappings)) {
    assert.equal(mapping.version, "PINNED_INTEGER");
  }

  assert.deepEqual(
    {
      status: crossmint.status,
      mode: crossmint.mode,
      origin: crossmint.stagingApiOrigin,
      secretVersion: crossmint.serverCredential.version,
      clientCredential: crossmint.serverCredentialAllowedInClient,
      secretAccess: crossmint.secretAccessAuthorized,
      sandboxAdapter: crossmint.sandboxAdapterImplemented,
      liveAdapter: crossmint.liveAdapterImplemented,
    },
    {
      status: "sandbox-adapter-dormant-not-authorized",
      mode: "fake",
      origin: "https://staging.crossmint.com/api/2025-06-09",
      secretVersion: "PINNED_INTEGER",
      clientCredential: false,
      secretAccess: false,
      sandboxAdapter: true,
      liveAdapter: false,
    },
  );
});

test("keeps migrations reviewed, serial, bounded, and non-retrying", () => {
  assert.deepEqual(
    {
      tasks: contract.migrationJob.tasks,
      parallelism: contract.migrationJob.parallelism,
      maxRetries: contract.migrationJob.maxRetries,
      timeoutSeconds: contract.migrationJob.timeoutSeconds,
      manualExecutionOnly: contract.migrationJob.manualExecutionOnly,
    },
    {
      tasks: 1,
      parallelism: 1,
      maxRetries: 0,
      timeoutSeconds: 600,
      manualExecutionOnly: true,
    },
  );
  assert.ok(
    contract.releaseOrder.indexOf("execute reviewed migration job once") <
      contract.releaseOrder.indexOf("deploy API revision with zero traffic"),
  );
  assert.ok(
    contract.releaseOrder.indexOf(
      "deploy authenticated customer web and design preview with zero traffic",
    ) <
      contract.releaseOrder.indexOf(
        "prove customer-web service identity can invoke API while preserving Auth0 bearer authorization",
      ),
  );
  assert.ok(
    contract.releaseOrder.indexOf(
      "prove customer-web service identity can invoke API while preserving Auth0 bearer authorization",
    ) < contract.releaseOrder.indexOf("promote customer web traffic"),
  );
});

test("keeps the operations portal blocked until staff security is real", () => {
  const operations = contract.services["samra-operations-web"];
  assert.deepEqual(operations.deploymentBlockedOn, [
    "workforce authentication and authorization",
    "staff access review and revocation process",
    "operations API production-security promotion",
  ]);
  assert.equal(
    contract.services["samra-api"].environment
      .SAMRA_INTERNAL_OPERATIONS_ENABLED,
    "false",
  );
});

test("contains references only, never credentials or live-provider values", () => {
  assert.match(
    contract.database.runtimeSecretReference,
    /^projects\/PROJECT_ID\/secrets\/samra-staging-database-url\/versions\/PINNED_INTEGER$/,
  );
  assert.match(
    contract.database.migrationSecretReference,
    /^projects\/PROJECT_ID\/secrets\/samra-staging-migration-database-url\/versions\/PINNED_INTEGER$/,
  );
  assert.doesNotMatch(
    source,
    /postgres(?:ql)?:\/\/|password|12345678|worf\.replit|rain[_-]?key|caliza[_-]?key|chapa[_-]?key/i,
  );
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
    assert.ok(contract.forbidden.includes(forbidden));
  }
});
