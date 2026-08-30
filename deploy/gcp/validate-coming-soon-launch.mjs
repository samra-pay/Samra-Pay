import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

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
    contract.productionBoundary.decisionStatus ===
      "project-verified-foundation-not-applied" &&
      contract.productionBoundary.projectId === "samra-pay-production" &&
      contract.productionBoundary.projectNumber === "382465561715" &&
      contract.productionBoundary.organizationId === "614833350075" &&
      contract.productionBoundary.region === "us-east4" &&
      contract.productionBoundary.dataClassification === "customer-pii" &&
      contract.productionBoundary.billingAccountSourceProjectId ===
        "samra-pay-staging" &&
      contract.productionBoundary.mustNotEqualProjectId ===
        "samra-pay-staging" &&
      contract.productionBoundary.billingAndBudgetApprovalRequired === true &&
      contract.productionBoundary.billingAndBudgetVerified === true &&
      contract.productionBoundary.customerDataAllowedBeforeApproval === false,
    "The verified project boundary or separate infrastructure gate drifted",
  );
  assert(
    contract.productionReview.mode === "read-only" &&
      contract.productionReview.requiredProjectLabels.environment ===
        "production" &&
      contract.productionReview.requiredProjectLabels.application ===
        "samra-pay" &&
      contract.productionReview.requiredProjectLabels.data_classification ===
        "customer-pii" &&
      JSON.stringify(contract.productionReview.forbiddenDataClassifications) ===
        JSON.stringify(["synthetic", "public"]) &&
      contract.productionReview.budget.currency === "USD" &&
      contract.productionReview.budget.approvedMonthlyAmount === 25 &&
      JSON.stringify(contract.productionReview.budget.thresholdPercents) ===
        JSON.stringify([0.5, 0.9, 1]) &&
      contract.productionReview.budget.budgetIsSpendingCap === false &&
      contract.productionReview.requiredInputs.length === 7 &&
      contract.productionReview.doesNotAuthorize.includes("DNS change") &&
      contract.productionReview.doesNotAuthorize.includes("public traffic"),
    "The production foundation review must remain read-only and budget-gated",
  );
  const verification = contract.productionReview.latestVerifiedBoundary;
  assert(
    verification.status === "passed-read-only" &&
      verification.sourceSha === "7a28fb4df556a4a32f882544b9446275817b1c4f" &&
      verification.verifiedOn === "2026-08-30" &&
      verification.projectNumber ===
        contract.productionBoundary.projectNumber &&
      verification.billingAccountMatchesSourceProject === true &&
      verification.monthlyBudgetUsd ===
        contract.productionReview.budget.approvedMonthlyAmount &&
      JSON.stringify(verification.thresholdPercents) ===
        JSON.stringify(contract.productionReview.budget.thresholdPercents) &&
      verification.cloudOrDnsChangesMadeByReview === false,
    "The independent production boundary evidence drifted",
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
      contract.edge.domain === "samrapay.com" &&
      contract.edge.canonicalHost === "www" &&
      contract.edge.canonicalDomain === "www.samrapay.com" &&
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
  assert(
    contract.blockedOn.length === 7 &&
      contract.blockedOn.includes(
        "keyless production preflight trust and protected GitHub environment",
      ) &&
      !contract.blockedOn.some((blocker) =>
        /project creation|billing account as staging/iu.test(blocker),
      ),
    "Launch blockers changed",
  );

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
    boundaryStatus: contract.productionBoundary.decisionStatus,
    projectId: contract.productionBoundary.projectId,
    canonicalDomain: contract.edge.canonicalDomain,
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
      projectId === contract.productionBoundary.projectId &&
      projectId !== contract.productionBoundary.mustNotEqualProjectId,
    "SAMRA_GCP_PROJECT_ID must exactly match the confirmed production project ID",
  );
  assert(
    /^\d{6,20}$/u.test(projectNumber) &&
      projectNumber === contract.productionBoundary.projectNumber,
    "SAMRA_GCP_PROJECT_NUMBER must exactly match the verified production project number",
  );
  assert(
    organizationId === contract.productionBoundary.organizationId,
    "SAMRA_GCP_ORGANIZATION_ID must match the reviewed organization",
  );
  assert(
    region === contract.productionBoundary.region,
    "SAMRA_GCP_REGION must exactly match the confirmed production region",
  );
  assert(
    /^[^@\s]+@davidhaile\.com$/u.test(operator) ||
      operator ===
        "samra-production-auditor@samra-pay-production.iam.gserviceaccount.com",
    "SAMRA_GCP_OPERATOR_ACCOUNT must be the reviewed administrator or keyless production auditor",
  );
  assert(
    /^[0-9a-f]{40}$/u.test(expectedSha),
    "SAMRA_GCP_EXPECTED_SHA must be a full lowercase Git SHA",
  );
  assert(
    dataClassification === contract.productionBoundary.dataClassification &&
      !contract.productionReview.forbiddenDataClassifications.includes(
        dataClassification,
      ),
    "SAMRA_GCP_DATA_CLASSIFICATION must exactly match the confirmed classification",
  );
  assert(
    /^[1-9]\d{0,5}$/u.test(budgetRaw) &&
      Number(budgetRaw) ===
        contract.productionReview.budget.approvedMonthlyAmount,
    "SAMRA_GCP_MONTHLY_BUDGET_USD must exactly match the confirmed monthly alert",
  );
  assert(
    /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/u.test(
      apexDomain,
    ) &&
      !apexDomain.startsWith("www.") &&
      apexDomain === contract.edge.domain,
    "SAMRA_PUBLIC_APEX_DOMAIN must exactly match the confirmed apex domain",
  );
  assert(
    canonicalHost === contract.edge.canonicalHost,
    "SAMRA_PUBLIC_CANONICAL_HOST must exactly match the confirmed canonical host",
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

export function validateObservedProductionBilling(
  observed,
  sourceObserved,
  contract = readComingSoonLaunch(),
) {
  const billingAccount = String(observed?.billingAccountName ?? "");
  const sourceBillingAccount = String(sourceObserved?.billingAccountName ?? "");
  assert(
    observed?.billingEnabled === true &&
      sourceObserved?.billingEnabled === true &&
      /^billingAccounts\/[A-Z0-9-]+$/u.test(billingAccount) &&
      billingAccount === sourceBillingAccount,
    `Production billing must use the exact account attached to ${contract.productionBoundary.billingAccountSourceProjectId}`,
  );
  return Object.freeze({
    billingAccount,
    sourceProjectId: contract.productionBoundary.billingAccountSourceProjectId,
  });
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
  const acceptedProjectResources = new Set([
    `projects/${expected.projectId}`,
    `projects/${expected.projectNumber}`,
  ]);
  const requiredThresholds = contract.productionReview.budget.thresholdPercents;
  const candidates = observed.filter((budget) => {
    const filter = budget?.budgetFilter ?? budget?.filter ?? {};
    const projects = filter.projects ?? [];
    return projects.some((project) => acceptedProjectResources.has(project));
  });
  assert(
    candidates.length === 1,
    candidates.length === 0
      ? "No exact project-scoped approved production budget was found"
      : "Multiple budgets target the production project",
  );

  const match = candidates[0];
  const filter = match?.budgetFilter ?? match?.filter ?? {};
  const projects = filter.projects ?? [];
  const amount = match?.amount?.specifiedAmount ?? {};
  const thresholdRules = match?.thresholdRules ?? [];
  const thresholds = thresholdRules
    .map((rule) => Number(rule.thresholdPercent))
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
  assert(
    projects.length === 1 &&
      acceptedProjectResources.has(projects[0]) &&
      match.displayName === "Samra Pay production monthly budget" &&
      amount.currencyCode === contract.productionReview.budget.currency &&
      Number(amount.units ?? 0) === expected.monthlyBudgetUsd &&
      Number(amount.nanos ?? 0) === 0 &&
      (filter.calendarPeriod === undefined ||
        filter.calendarPeriod === "MONTH") &&
      thresholdRules.length === requiredThresholds.length &&
      thresholdRules.every(
        (rule) =>
          rule?.spendBasis === undefined || rule.spendBasis === "CURRENT_SPEND",
      ) &&
      JSON.stringify(thresholds) === JSON.stringify(requiredThresholds),
    "No exact project-scoped approved production budget was found",
  );
  return Object.freeze({
    displayName: match.displayName,
    monthlyBudgetUsd: expected.monthlyBudgetUsd,
    projectResource: projects[0],
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    process.stdout.write(`${JSON.stringify(validateComingSoonLaunch())}\n`);
  } catch (error) {
    process.stderr.write(
      `Invalid coming-soon launch contract: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
