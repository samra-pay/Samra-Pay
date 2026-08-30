import { readFileSync } from "node:fs";

export function readComingSoonLaunch() {
  return JSON.parse(
    readFileSync(new URL("./coming-soon-launch.json", import.meta.url), "utf8"),
  );
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function requiredEnvironmentValue(environment, name) {
  const value = String(environment[name] ?? "").trim();
  assert(value.length > 0, `${name} is required`);
  return value;
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
      contract.productionBoundary.organizationId === "614833350075" &&
      contract.productionBoundary.mustNotEqualProjectId ===
        "samra-pay-staging" &&
      contract.productionBoundary.billingAndBudgetApprovalRequired === true &&
      contract.productionBoundary.customerDataAllowedBeforeApproval === false,
    "A separate approved production project is required",
  );
  assert(
    contract.productionReview.mode === "read-only" &&
      contract.productionReview.requiredProjectLabels.environment ===
        "production" &&
      contract.productionReview.requiredProjectLabels.application ===
        "samra-pay" &&
      JSON.stringify(contract.productionReview.forbiddenDataClassifications) ===
        JSON.stringify(["synthetic", "public"]) &&
      contract.productionReview.budget.currency === "USD" &&
      contract.productionReview.budget.approvedMonthlyAmount ===
        "UNSET_APPROVED_MONTHLY_USD" &&
      JSON.stringify(contract.productionReview.budget.thresholdPercents) ===
        JSON.stringify([0.5, 0.9, 1]) &&
      contract.productionReview.budget.budgetIsSpendingCap === false &&
      contract.productionReview.requiredInputs.length === 7 &&
      contract.productionReview.doesNotAuthorize.includes("DNS change") &&
      contract.productionReview.doesNotAuthorize.includes("public traffic"),
    "The production foundation review must remain read-only and budget-gated",
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
    productionReviewMode: contract.productionReview.mode,
    deploymentAuthorized: false,
    dnsAuthorized: false,
  });
}

export function validateComingSoonProductionReviewEnvironment(
  environment = process.env,
  contract = readComingSoonLaunch(),
) {
  validateComingSoonLaunch(contract);

  const projectId = requiredEnvironmentValue(
    environment,
    "SAMRA_GCP_PROJECT_ID",
  );
  const projectNumber = requiredEnvironmentValue(
    environment,
    "SAMRA_GCP_PROJECT_NUMBER",
  );
  const organizationId = requiredEnvironmentValue(
    environment,
    "SAMRA_GCP_ORGANIZATION_ID",
  );
  const region = requiredEnvironmentValue(environment, "SAMRA_GCP_REGION");
  const operator = requiredEnvironmentValue(
    environment,
    "SAMRA_GCP_OPERATOR_ACCOUNT",
  );
  const expectedSha = requiredEnvironmentValue(
    environment,
    "SAMRA_GCP_EXPECTED_SHA",
  );
  const dataClassification = requiredEnvironmentValue(
    environment,
    "SAMRA_GCP_DATA_CLASSIFICATION",
  );
  const budgetRaw = requiredEnvironmentValue(
    environment,
    "SAMRA_GCP_MONTHLY_BUDGET_USD",
  );
  const apexDomain = requiredEnvironmentValue(
    environment,
    "SAMRA_PUBLIC_APEX_DOMAIN",
  ).toLowerCase();
  const canonicalHost = requiredEnvironmentValue(
    environment,
    "SAMRA_PUBLIC_CANONICAL_HOST",
  ).toLowerCase();

  assert(
    /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/u.test(projectId) &&
      projectId !== contract.productionBoundary.mustNotEqualProjectId,
    "SAMRA_GCP_PROJECT_ID must be a valid non-staging Google Cloud project ID",
  );
  assert(
    /^\d{6,20}$/u.test(projectNumber),
    "SAMRA_GCP_PROJECT_NUMBER must be numeric",
  );
  assert(
    organizationId === contract.productionBoundary.organizationId,
    "SAMRA_GCP_ORGANIZATION_ID must match the reviewed organization",
  );
  assert(
    /^[a-z]+-[a-z0-9]+\d$/u.test(region),
    "SAMRA_GCP_REGION must be an explicit Google Cloud region",
  );
  assert(
    /^[^@\s]+@davidhaile\.com$/u.test(operator),
    "SAMRA_GCP_OPERATOR_ACCOUNT must be a davidhaile.com administrator",
  );
  assert(
    /^[0-9a-f]{40}$/u.test(expectedSha),
    "SAMRA_GCP_EXPECTED_SHA must be a full lowercase Git SHA",
  );
  assert(
    /^[a-z][a-z0-9_-]{1,62}$/u.test(dataClassification) &&
      !contract.productionReview.forbiddenDataClassifications.includes(
        dataClassification,
      ),
    "SAMRA_GCP_DATA_CLASSIFICATION must be an approved non-synthetic classification",
  );
  assert(
    /^[1-9]\d{0,5}$/u.test(budgetRaw),
    "SAMRA_GCP_MONTHLY_BUDGET_USD must be an approved whole-dollar amount",
  );
  assert(
    /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/u.test(
      apexDomain,
    ) && !apexDomain.startsWith("www."),
    "SAMRA_PUBLIC_APEX_DOMAIN must be a bare apex domain without a protocol",
  );
  assert(
    canonicalHost === "apex" || canonicalHost === "www",
    "SAMRA_PUBLIC_CANONICAL_HOST must be apex or www",
  );

  return Object.freeze({
    projectId,
    projectNumber,
    organizationId,
    region,
    operator,
    expectedSha,
    dataClassification,
    monthlyBudgetUsd: Number(budgetRaw),
    apexDomain,
    canonicalHost,
    canonicalDomain: canonicalHost === "www" ? `www.${apexDomain}` : apexDomain,
  });
}

export function validateObservedProductionProject(
  observed,
  expected,
  contract = readComingSoonLaunch(),
) {
  const labels = observed?.labels ?? {};
  assert(
    observed?.projectId === expected.projectId &&
      String(observed?.projectNumber ?? "") === expected.projectNumber &&
      observed?.lifecycleState === "ACTIVE" &&
      observed?.parent?.type === "organization" &&
      String(observed?.parent?.id ?? "") === expected.organizationId &&
      labels.environment ===
        contract.productionReview.requiredProjectLabels.environment &&
      labels.application ===
        contract.productionReview.requiredProjectLabels.application &&
      labels.data_classification === expected.dataClassification,
    "Production project identity, organization, lifecycle, or labels drifted",
  );

  return Object.freeze({
    projectId: observed.projectId,
    projectNumber: String(observed.projectNumber),
    organizationId: String(observed.parent.id),
    dataClassification: labels.data_classification,
  });
}

export function validateObservedProductionBilling(observed) {
  const billingAccount = String(observed?.billingAccountName ?? "");
  assert(
    observed?.billingEnabled === true &&
      /^billingAccounts\/[A-Z0-9-]+$/u.test(billingAccount),
    "Production billing is not enabled on a concrete billing account",
  );
  return Object.freeze({ billingAccount });
}

export function validateObservedProductionBudgets(
  observed,
  expected,
  contract = readComingSoonLaunch(),
) {
  assert(
    Array.isArray(observed),
    "Production budget observation must be a list",
  );
  const projectResource = `projects/${expected.projectNumber}`;
  const requiredThresholds = contract.productionReview.budget.thresholdPercents;

  const match = observed.find((budget) => {
    const filter = budget?.budgetFilter ?? budget?.filter ?? {};
    const projects = filter.projects ?? [];
    const amount = budget?.amount?.specifiedAmount ?? {};
    const thresholds = (budget?.thresholdRules ?? [])
      .map((rule) => Number(rule.thresholdPercent))
      .filter(Number.isFinite);
    return (
      projects.length === 1 &&
      projects[0] === projectResource &&
      amount.currencyCode === contract.productionReview.budget.currency &&
      Number(amount.units ?? 0) === expected.monthlyBudgetUsd &&
      Number(amount.nanos ?? 0) === 0 &&
      requiredThresholds.every((threshold) => thresholds.includes(threshold))
    );
  });

  assert(
    match &&
      typeof match.displayName === "string" &&
      match.displayName.length > 0,
    "No exact project-scoped approved production budget was found",
  );
  return Object.freeze({
    displayName: match.displayName,
    monthlyBudgetUsd: expected.monthlyBudgetUsd,
    projectResource,
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
