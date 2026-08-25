import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const EXPECTED_COMPONENTS = Object.freeze([
  "global external managed HTTPS load balancer",
  "reserved global IPv4 address",
  "Google-managed TLS certificate",
  "regional serverless NEG for samra-customer-web",
  "HTTPS redirect",
  "Cloud Armor edge policy",
]);

const EXPECTED_ALERTS = Object.freeze([
  "public-availability",
  "edge-5xx-ratio",
  "customer-web-p95-latency",
  "cloud-sql-storage-utilization",
  "cloud-sql-connection-utilization",
  "cloud-sql-backup-age",
]);

const EXPECTED_SECURITY_HEADERS = Object.freeze([
  "Referrer-Policy",
  "X-Content-Type-Options",
  "X-Frame-Options",
  "Cross-Origin-Opener-Policy",
  "Permissions-Policy",
  "X-Robots-Tag",
  "Strict-Transport-Security",
]);

const EXPECTED_TRANSFER_ACTIONS = Object.freeze([
  "verify the stable repository ID after transfer",
  "switch the active repository authority contract",
  "rebind the five Google workload-identity boundaries",
  "reaudit protected environments and branch controls",
  "reconnect the Qase GitHub application",
  "pass the read-only release workflow",
]);

const EXPECTED_ACTIVATION_ORDER = Object.freeze([
  "confirm staging customer hostname and DNS owner",
  "confirm incremental Google Cloud estimate and budget alert",
  "activate repository authority or complete Enterprise cutover",
  "create edge resources with no DNS cutover",
  "verify certificate and load-balancer configuration",
  "configure Auth0 callbacks, logout URLs, and allowed origins",
  "activate notification channels and observability policies",
  "pass synthetic public-edge, private-API, accessibility, and rollback tests",
  "approve privacy, campaign taxonomy, retention, and abuse controls",
  "authorize first public staging traffic separately",
  "perform DNS cutover and record evidence",
  "observe the rollback window before acquisition activation",
]);

function readJson(relativeUrl) {
  return JSON.parse(
    readFileSync(new URL(relativeUrl, import.meta.url), "utf8"),
  );
}

export function readStagingPublicReadiness() {
  return readJson("./staging-public-readiness.json");
}

export function readStagingGithubEnterpriseMigration() {
  return readJson("./staging-github-enterprise-migration.json");
}

export function readStagingRuntimeContract() {
  return readJson("./staging-runtime-contract.json");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function same(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

export function validateStagingPublicReadiness(
  contract = readStagingPublicReadiness(),
  {
    migration = readStagingGithubEnterpriseMigration(),
    runtime = readStagingRuntimeContract(),
    root,
  } = {},
) {
  assert(contract.schemaVersion === 1, "Unsupported public-readiness schema");
  assert(
    contract.status === "prepared-not-authorized" &&
      contract.environment === "staging" &&
      contract.dataClassification === "synthetic-only" &&
      contract.activationAuthorized === false,
    "Public readiness must remain unauthorized synthetic staging",
  );
  assert(
    /^\d{4}-\d{2}-\d{2}$/u.test(contract.observedAt),
    "Public-readiness observation date is invalid",
  );

  const { portability, publicEdge, observability, acquisitionActivation } =
    contract;
  assert(
    portability.repositoryAuthorityContract ===
      "deploy/gcp/staging-github-enterprise-migration.json" &&
      portability.stableRepositoryId === migration.repository.stableId &&
      portability.workflowAuthoritySelector === "repository.activeAuthority" &&
      portability.cloudResourceNamesContainRepositoryOwner === false &&
      portability.repositoryTransferRequiresInfrastructureRebuild === false &&
      portability.replitRequired === false &&
      portability.vendorCredentialRequiredForEdge === false &&
      same(portability.transferActions, EXPECTED_TRANSFER_ACTIONS),
    "Repository-portability boundary drifted",
  );
  const serialized = JSON.stringify(contract);
  for (const authority of [
    migration.repository.activeAuthority.nameWithOwner,
    migration.repository.activeAuthority.ownerId,
    migration.repository.targetAuthority.nameWithOwner,
    migration.repository.targetAuthority.ownerId,
  ]) {
    assert(
      !serialized.includes(authority),
      "Public readiness embedded a mutable repository authority",
    );
  }

  assert(
    publicEdge.status === "architecture-prepared-not-authorized" &&
      publicEdge.projectId === "samra-pay-staging" &&
      publicEdge.region === "us-east4" &&
      publicEdge.host === "STAGING_CUSTOMER_HOST" &&
      publicEdge.dnsMutationAuthorized === false &&
      publicEdge.certificateProvisioningAuthorized === false &&
      publicEdge.trafficActivationAuthorized === false &&
      same(publicEdge.components, EXPECTED_COMPONENTS),
    "Public-edge authority or component boundary drifted",
  );

  const routing = publicEdge.routing;
  assert(
    routing.customerWeb.path === "/*" &&
      routing.customerWeb.backend === "samra-customer-web" &&
      routing.customerWeb.browserAuthentication === "public" &&
      routing.customerWeb.allowed === true &&
      routing.sameOriginApiProxy.path === "/api/*" &&
      routing.sameOriginApiProxy.backend === "samra-customer-web" &&
      routing.sameOriginApiProxy.browserAuthentication ===
        "route-specific-auth0" &&
      routing.sameOriginApiProxy.serviceAuthenticationToApi ===
        "cloud-run-iam" &&
      routing.sameOriginApiProxy.allowed === true &&
      routing.directApi.backend === "samra-api" &&
      routing.directApi.allowed === false &&
      routing.operationsPortal.backend === "samra-operations-web" &&
      routing.operationsPortal.allowed === false &&
      routing.designSystemPreview.backend === "samra-design-system-preview" &&
      routing.designSystemPreview.allowed === false,
    "Public route allowlist drifted",
  );

  const delta = publicEdge.customerWebRuntimeDelta;
  assert(
    delta.currentInvokerIamCheck === "required" &&
      delta.targetInvokerIamCheck ===
        "disabled-only-after-public-edge-activation" &&
      delta.ingress === "internal-and-cloud-load-balancing" &&
      delta.defaultServiceUrlDisabled === true &&
      delta.directRunAppAccessAllowed === false &&
      delta.apiRemainsIamAuthenticated === true &&
      delta.activationRequiresSeparateReviewedChange === true &&
      runtime.services["samra-customer-web"].authentication ===
        delta.currentInvokerIamCheck &&
      runtime.services["samra-customer-web"].ingress === delta.ingress &&
      runtime.services["samra-customer-web"].defaultUrlDisabled === true &&
      same(runtime.services["samra-customer-web"].optionalRuntimeEnvironment, [
        "SAMRA_PUBLIC_ACQUISITION_CAMPAIGNS",
        "SAMRA_PUBLIC_SEARCH_INDEXING",
        "SAMRA_PUBLIC_HTTPS_ONLY",
      ]) &&
      runtime.services["samra-api"].authentication === "required" &&
      runtime.services["samra-api"].ingress ===
        "internal-and-cloud-load-balancing",
    "Cloud Run public-edge transition boundary drifted",
  );

  assert(
    publicEdge.transport.httpAllowed === false &&
      publicEdge.transport.tlsMinimum === "1.2" &&
      publicEdge.transport.managedCertificateMustBeActiveBeforeDnsCutover ===
        true &&
      publicEdge.transport.hstsRequiredAfterTlsVerification === true &&
      publicEdge.transport.hstsIncludeSubdomains === false &&
      publicEdge.transport.hstsPreload === false &&
      publicEdge.caching.html === "no-store" &&
      publicEdge.caching.runtimeConfig === "no-store" &&
      publicEdge.caching.api === "no-store" &&
      publicEdge.caching.health === "no-store" &&
      publicEdge.caching.fingerprintedStaticAssets ===
        "public-max-age-31536000-immutable" &&
      publicEdge.security.cloudArmorRequiredBeforeTraffic === true &&
      publicEdge.security.stagingSearchIndexingAllowed === false &&
      publicEdge.security.publicAcquisitionRateLimitRequired === true &&
      publicEdge.security.requestBodyLimitRequired === true &&
      publicEdge.security.requestBodyLimitImplemented === true &&
      publicEdge.security.requestBodyLimitBytes === 1_048_576 &&
      publicEdge.security.requestBodyLimitImplementation ===
        "deploy/gcp/static-server.mjs" &&
      publicEdge.security.knownBotPolicyRequired === true &&
      publicEdge.security.apiAndOperationsOriginExposureAllowed === false &&
      same(publicEdge.security.securityHeaders, EXPECTED_SECURITY_HEADERS),
    "Edge transport, cache, or security boundary drifted",
  );

  assert(
    observability.status === "contract-prepared-not-authorized" &&
      observability.activationAuthorized === false &&
      same(observability.notificationChannelIds, []) &&
      observability.notificationChannelRequiredBeforeActivation === true &&
      observability.plaintextNotificationDestinationAllowed === false,
    "Observability activation boundary drifted",
  );
  assert(
    observability.publicProbe.host === "STAGING_CUSTOMER_HOST" &&
      observability.publicProbe.path === "/healthz" &&
      observability.publicProbe.method === "GET" &&
      observability.publicProbe.intervalSeconds === 300 &&
      observability.publicProbe.timeoutSeconds === 10 &&
      observability.publicProbe.expectedStatus === 200 &&
      same(observability.publicProbe.expectedJson, { status: "ok" }) &&
      observability.publicProbe.realProviderCallAllowed === false &&
      observability.publicProbe.customerRecordCreationAllowed === false &&
      observability.privateProbe.controller ===
        "deploy/gcp/run-staging-revision-probe.sh" &&
      observability.privateProbe.apiReadinessPath === "/api/readyz" &&
      observability.privateProbe.requiresExactRevision === true &&
      observability.privateProbe.requiresServiceIdentity === true,
    "Synthetic probe boundary drifted",
  );
  assert(
    same(
      observability.alerts.map(({ id }) => id),
      EXPECTED_ALERTS,
    ) &&
      new Set(observability.alerts.map(({ id }) => id)).size ===
        EXPECTED_ALERTS.length &&
      observability.alerts.every(
        ({ condition, threshold, windowSeconds }) =>
          ["above", "below"].includes(condition) &&
          typeof threshold === "number" &&
          threshold > 0 &&
          Number.isInteger(windowSeconds) &&
          windowSeconds >= 300,
      ),
    "Alert inventory must be complete, unique, and bounded",
  );
  assert(
    observability.structuredLogFields.includes("candidateSha") &&
      observability.structuredLogFields.includes("traceId") &&
      observability.forbiddenLogFields.includes("authorization header") &&
      observability.forbiddenLogFields.includes("customer PII") &&
      observability.forbiddenLogFields.includes("secret value") &&
      observability.logRetentionDays === 30 &&
      observability.releaseEvidenceRetentionDays === 365 &&
      observability.rollbackRunbook ===
        "docs/operations/staging-release-control-plane.md",
    "Observability evidence or privacy boundary drifted",
  );

  assert(
    acquisitionActivation.status ===
      "implemented-disabled-pending-governance" &&
      acquisitionActivation.activationAuthorized === false &&
      acquisitionActivation.vendorIndependent === true &&
      acquisitionActivation.marketingExportAuthorized === false &&
      same(acquisitionActivation.activeCampaigns, []) &&
      acquisitionActivation.campaignAllowlistEnvironment ===
        "SAMRA_PUBLIC_ACQUISITION_CAMPAIGNS" &&
      acquisitionActivation.campaignAllowlistFormat ===
        "comma-separated-lowercase-slugs" &&
      acquisitionActivation.maximumCampaignCount === 50 &&
      same(acquisitionActivation.publicEndpoints, [
        "/api/v1/acquisition/events",
        "/api/v1/acquisition/bind",
      ]) &&
      acquisitionActivation.canonicalReportEndpoint ===
        "/api/v1/internal/operations/customer-funnel" &&
      acquisitionActivation.ownedMilestone === "fifth-completed-remittance" &&
      acquisitionActivation.clientTelemetryFailOpen === true &&
      acquisitionActivation.serverMilestonesDerivedFromCanonicalRecords ===
        true &&
      acquisitionActivation.privacyGates.length === 5 &&
      acquisitionActivation.abuseGates.length === 5 &&
      acquisitionActivation.prohibitedData.length >= 12,
    "Customer-acquisition activation boundary drifted",
  );

  assert(
    contract.costBoundary.incrementalMonthlyEstimateApproved === false &&
      contract.costBoundary.minimumInstances === 0 &&
      contract.costBoundary.logRetentionDays === 30 &&
      contract.costBoundary.budgetReviewRequiredBeforeApply === true &&
      contract.costBoundary.costAlertRequiredBeforeTraffic === true &&
      same(contract.activationOrder, EXPECTED_ACTIVATION_ORDER) &&
      new Set(contract.activationOrder).size ===
        EXPECTED_ACTIVATION_ORDER.length,
    "Cost or activation order drifted",
  );
  for (const boundary of [
    "automatic DNS mutation",
    "public samra-api origin",
    "public operations portal",
    "unrestricted Cloud Run ingress",
    "production customer data",
    "stored Google service-account key",
    "Replit runtime dependency",
  ]) {
    assert(
      contract.prohibited.includes(boundary),
      `Missing prohibition: ${boundary}`,
    );
  }

  if (root) {
    for (const reference of [
      portability.repositoryAuthorityContract,
      publicEdge.security.requestBodyLimitImplementation,
      observability.privateProbe.controller,
      observability.rollbackRunbook,
    ]) {
      assert(
        existsSync(join(root, reference)),
        `Missing reference: ${reference}`,
      );
    }
  }

  return Object.freeze({
    schemaVersion: 1,
    status: "validated-prepared-not-authorized",
    stableRepositoryId: portability.stableRepositoryId,
    repositoryTransferRequiresInfrastructureRebuild: false,
    publicHost: publicEdge.host,
    directApiPublic: false,
    operationsPortalPublic: false,
    observabilityAlertCount: observability.alerts.length,
    activeCampaignCount: acquisitionActivation.activeCampaigns.length,
    activationAuthorized: false,
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    console.log(JSON.stringify(validateStagingPublicReadiness(), null, 2));
    console.log(
      "PUBLIC READINESS REVIEW PASS — NO CLOUD, DNS, OR VENDOR CHANGES",
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
