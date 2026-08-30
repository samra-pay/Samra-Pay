import { readFileSync } from "node:fs";

export function readComingSoonLaunch() {
  return JSON.parse(
    readFileSync(new URL("./coming-soon-launch.json", import.meta.url), "utf8"),
  );
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function validateComingSoonLaunch(contract = readComingSoonLaunch()) {
  assert(contract.schemaVersion === 1, "Unsupported launch schema");
  assert(
    contract.status === "review-only" &&
      contract.launchPhase === "production-coming-soon" &&
      contract.deploymentAuthorized === false &&
      contract.dnsCutover.changesAuthorized === false,
    "Launch and DNS must remain review-only",
  );
  assert(
    contract.productionBoundary.projectId === "UNSET_PRODUCTION_PROJECT_ID" &&
      contract.productionBoundary.projectNumber ===
        "UNSET_PRODUCTION_PROJECT_NUMBER" &&
      contract.productionBoundary.mustNotEqualProjectId ===
        "samra-pay-staging" &&
      contract.productionBoundary.billingAndBudgetApprovalRequired === true &&
      contract.productionBoundary.customerDataAllowedBeforeApproval === false,
    "A separate approved production project is required",
  );
  assert(
    contract.source.refreshAtCutoverRequired === true &&
      contract.source.releaseSource === "FULL_GIT_SHA" &&
      /^[0-9a-f]{40}$/u.test(contract.source.snapshotCommit),
    "The Sites snapshot and release source must remain pinned",
  );
  assert(
    contract.images.tag === "FULL_GIT_SHA" &&
      contract.images.digestRequired === true &&
      contract.images.floatingTagsAllowed === false &&
      JSON.stringify(contract.images.workloads) ===
        JSON.stringify(["samra-customer-web", "samra-api", "samra-migrations"]),
    "Release images must be immutable and minimal",
  );

  const web = contract.services["samra-customer-web"];
  const api = contract.services["samra-api"];
  assert(
    web.ingress === "internal-and-cloud-load-balancing" &&
      web.publicAccess === "load-balancer-only" &&
      web.defaultUrlDisabled === true &&
      web.databaseAccess === false &&
      web.secretAccess.length === 0 &&
      web.requiredEnvironment.SAMRA_API_PROXY_POLICY === "waitlist-only" &&
      web.requiredEnvironment.SAMRA_API_SERVICE_AUTH_MODE === "cloud-run-iam" &&
      web.requiredEnvironment.SAMRA_API_ORIGIN ===
        web.requiredEnvironment.SAMRA_API_SERVICE_AUDIENCE &&
      JSON.stringify(web.publicApiRoutes) ===
        JSON.stringify(["POST /api/v1/waitlist/subscriptions"]),
    "The public edge must expose only the waitlist route",
  );
  assert(
    api.ingress === "internal-and-cloud-load-balancing" &&
      api.authentication === "required" &&
      api.defaultUrlDisabled === true &&
      JSON.stringify(api.invokers) === JSON.stringify(["dedicated-web"]) &&
      api.databaseAccess === true &&
      JSON.stringify(api.secretAccess) ===
        JSON.stringify(["pinned-production-runtime-database-url"]) &&
      api.environment.NODE_ENV === "production" &&
      api.environment.SAMRA_PERSISTENCE_MODE === "postgres" &&
      api.environment.SAMRA_CUSTOMER_AUTH_MODE === "disabled" &&
      api.environment.SAMRA_CUSTOMER_IDENTITY_PROVIDER_MODE === "fake" &&
      api.environment.SAMRA_INTERNAL_OPERATIONS_ENABLED === "false" &&
      api.environment.SAMRA_RUN_WORKER === "false",
    "The private API must remain waitlist-only at the edge with vendors dormant",
  );
  assert(
    contract.data.store === "separate-private-production-postgresql" &&
      contract.data.stagingDatabaseReuseAllowed === false &&
      contract.data.publicIpAllowed === false &&
      contract.data.automaticMigrationAllowed === false &&
      contract.data.migration ===
        "lib/db/drizzle/0016_marketing_waitlist.sql" &&
      contract.data.secretVersion === "PINNED_INTEGER" &&
      contract.data.emailSeparatedFromAcquisitionTelemetry === true &&
      contract.data.authKycWalletDataAllowed === false,
    "Waitlist data must stay in a separate private production boundary",
  );
  assert(
    contract.edge.dnsOwner === "Squarespace" &&
      contract.edge.domain === "UNSET_CUSTOM_DOMAIN" &&
      contract.edge.loadBalancer ===
        "global-external-application-load-balancer" &&
      contract.edge.tls === "google-managed-certificate" &&
      contract.edge.httpRedirectsToHttps === true &&
      contract.edge.cloudArmorRequired === true &&
      contract.edge.waitlistRateLimit.action === "throttle" &&
      contract.edge.preserveDnsRecords.includes("MX") &&
      contract.edge.preserveDnsRecords.includes("DMARC"),
    "The Google edge and Squarespace DNS safety boundary drifted",
  );
  assert(
    contract.observability.cloudLoggingRequired === true &&
      contract.observability.rawEmailInLogsAllowed === false &&
      contract.release.candidateTraffic === 0 &&
      contract.release.promotionTraffic === 100 &&
      contract.release.priorRevisionRequired === true,
    "Logging, rollback, and zero-traffic promotion gates are required",
  );
  for (const exclusion of [
    "Auth0 activation",
    "Persona activation",
    "Crossmint activation",
    "financial transaction APIs at the public edge",
    "staging database reuse",
    "Squarespace registrar transfer",
  ]) {
    assert(
      contract.excluded.includes(exclusion),
      `Missing exclusion: ${exclusion}`,
    );
  }
  assert(contract.blockedOn.length === 8, "Launch blockers changed");

  const source = JSON.stringify(contract);
  assert(
    !/postgres(?:ql)?:\/\/|password|api[_-]?key|versions\/latest/iu.test(
      source,
    ),
    "Launch contract contains a credential or unpinned secret",
  );

  return Object.freeze({
    schemaVersion: contract.schemaVersion,
    status: "validated-review-only",
    launchPhase: contract.launchPhase,
    publicRouteCount: web.publicApiRoutes.length,
    deploymentAuthorized: false,
    dnsAuthorized: false,
  });
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  try {
    process.stdout.write(`${JSON.stringify(validateComingSoonLaunch())}\n`);
  } catch (error) {
    process.stderr.write(
      `Invalid coming-soon launch contract: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
