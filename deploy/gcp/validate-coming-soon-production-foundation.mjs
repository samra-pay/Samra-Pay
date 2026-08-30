import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  readComingSoonLaunch,
  validateComingSoonLaunch,
} from "./validate-coming-soon-launch.mjs";

const PRODUCTION_APIS = [
  "artifactregistry.googleapis.com",
  "cloudbuild.googleapis.com",
  "cloudresourcemanager.googleapis.com",
  "containeranalysis.googleapis.com",
  "compute.googleapis.com",
  "iam.googleapis.com",
  "iamcredentials.googleapis.com",
  "logging.googleapis.com",
  "monitoring.googleapis.com",
  "run.googleapis.com",
  "secretmanager.googleapis.com",
  "servicenetworking.googleapis.com",
  "serviceusage.googleapis.com",
  "sqladmin.googleapis.com",
  "sts.googleapis.com",
];

const SERVICE_ACCOUNTS = {
  build: "samra-cloud-build-production",
  deployer: "samra-deployer-production",
  api: "samra-api-production",
  customerWeb: "samra-customer-web-production",
  migrations: "samra-migrations-production",
};

const SERVICE_ACCOUNT_DISPLAY_NAMES = {
  build: "Samra production Cloud Build",
  deployer: "Samra production deployer",
  api: "Samra production API",
  customerWeb: "Samra production customer web",
  migrations: "Samra production migrations",
};

const PERMITTED_PROJECT_ROLES = new Set([
  "roles/logging.logWriter",
  "roles/serviceusage.serviceUsageConsumer",
  "roles/run.admin",
  "roles/cloudsql.client",
]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function readComingSoonProductionFoundation() {
  return JSON.parse(
    readFileSync(
      new URL("./coming-soon-production-foundation.json", import.meta.url),
      "utf8",
    ),
  );
}

export function validateComingSoonProductionFoundation(
  foundation = readComingSoonProductionFoundation(),
  launch = readComingSoonLaunch(),
) {
  const validatedLaunch = validateComingSoonLaunch(launch);
  assert(
    foundation.schemaVersion === 1 &&
      foundation.status === "prepared-not-applied" &&
      foundation.phase === "coming-soon-production-foundation" &&
      foundation.decisionStatus ===
        "preflight-verified-foundation-not-applied" &&
      foundation.applyAuthorized === false &&
      foundation.cloudStateReadByPlan === false,
    "The production foundation must remain prepared but unapplied",
  );
  assert(
    foundation.linkedLaunchContract === "deploy/gcp/coming-soon-launch.json" &&
      validatedLaunch.launchPhase === "production-coming-soon" &&
      validatedLaunch.deploymentAuthorized === false &&
      validatedLaunch.dnsAuthorized === false,
    "The foundation must remain linked to the review-only launch contract",
  );

  const boundary = foundation.productionBoundary;
  assert(
    boundary.projectId === "samra-pay-production" &&
      boundary.projectNumber === "382465561715" &&
      boundary.organizationId === "614833350075" &&
      boundary.region === "us-east4" &&
      boundary.dataClassification === "customer-pii" &&
      boundary.monthlyBudgetUsd === 25 &&
      boundary.apexDomain === "samrapay.com" &&
      boundary.canonicalHost === "www" &&
      boundary.billingAccountSourceProjectId === "samra-pay-staging" &&
      boundary.mustNotEqualProjectId === "samra-pay-staging" &&
      boundary.projectCreationAuthorized === false &&
      boundary.billingMutationAuthorized === false &&
      boundary.budgetMutationAuthorized === false &&
      boundary.projectStateVerified === true &&
      boundary.billingMatchVerified === true &&
      boundary.budgetVerified === true &&
      boundary.verificationSourceSha ===
        "7a28fb4df556a4a32f882544b9446275817b1c4f",
    "The confirmed production identity, budget, region, and domain boundary drifted",
  );
  assert(
    boundary.projectId === launch.productionBoundary.projectId &&
      boundary.projectNumber === launch.productionBoundary.projectNumber &&
      boundary.organizationId === launch.productionBoundary.organizationId &&
      boundary.region === launch.productionBoundary.region &&
      boundary.dataClassification ===
        launch.productionBoundary.dataClassification &&
      boundary.monthlyBudgetUsd ===
        launch.productionReview.budget.approvedMonthlyAmount &&
      boundary.apexDomain === launch.edge.domain &&
      boundary.canonicalHost === launch.edge.canonicalHost &&
      boundary.billingAccountSourceProjectId ===
        launch.productionBoundary.billingAccountSourceProjectId,
    "The production foundation and launch contract decisions must match",
  );
  const preflight = foundation.preflightEvidence;
  assert(
    preflight.status === "passed" &&
      preflight.mode === "read-only" &&
      preflight.sourceSha === "22e7d644c25d169532018534fa25ce8b6801744a" &&
      preflight.workflowRunId === "33334655501" &&
      preflight.workflowRunUrl ===
        "https://github.com/haileleuld87/Samra-Pay/actions/runs/33334655501" &&
      preflight.artifactName ===
        "production-foundation-preflight-22e7d644c25d169532018534fa25ce8b6801744a-run-33334655501-attempt-1" &&
      preflight.sha256 ===
        "083bd82259bd54f5fab76ef08f9fab5701a45d59fcd6611d7ea5231b9a66d48b" &&
      preflight.operator ===
        "samra-production-auditor@samra-pay-production.iam.gserviceaccount.com" &&
      preflight.cloudMutation === false,
    "The protected keyless production preflight evidence drifted",
  );
  assert(
    foundation.projectLabels.environment === "production" &&
      foundation.projectLabels.application === "samra-pay" &&
      foundation.projectLabels.data_classification === "customer-pii",
    "Production labels must remain explicit and non-synthetic",
  );

  assert(
    JSON.stringify(foundation.samraManagedApis) ===
      JSON.stringify(PRODUCTION_APIS),
    "The production API allowlist changed",
  );
  assert(
    !foundation.samraManagedApis.some((api) =>
      /firebase|identitytoolkit|securetoken/iu.test(api),
    ),
    "Firebase and customer identity APIs are outside this foundation",
  );
  assert(
    foundation.artifactRegistry.repository === "samra-production" &&
      foundation.artifactRegistry.format === "docker" &&
      foundation.artifactRegistry.immutableTags === true &&
      foundation.artifactRegistry.location === "us-east4",
    "Production images require one regional immutable Docker repository",
  );

  assert(
    JSON.stringify(foundation.serviceAccounts) ===
      JSON.stringify(SERVICE_ACCOUNTS),
    "The five production trust boundaries changed",
  );
  assert(
    JSON.stringify(foundation.serviceAccountDisplayNames) ===
      JSON.stringify(SERVICE_ACCOUNT_DISPLAY_NAMES),
    "The production service-account display names changed",
  );
  const accountIds = Object.values(foundation.serviceAccounts);
  assert(
    new Set(accountIds).size === accountIds.length &&
      accountIds.every((account) =>
        /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/u.test(account),
      ),
    "Every production trust boundary requires one valid distinct keyless identity",
  );

  for (const [boundaryName, roles] of Object.entries(
    foundation.projectRoleBindings,
  )) {
    assert(
      foundation.serviceAccounts[boundaryName] &&
        Array.isArray(roles) &&
        roles.length > 0 &&
        roles.every((role) => PERMITTED_PROJECT_ROLES.has(role)),
      `Over-broad or unknown project role binding for ${boundaryName}`,
    );
  }
  assert(
    JSON.stringify(foundation.projectRoleBindings) ===
      JSON.stringify({
        build: [
          "roles/logging.logWriter",
          "roles/serviceusage.serviceUsageConsumer",
        ],
        deployer: [
          "roles/run.admin",
          "roles/serviceusage.serviceUsageConsumer",
        ],
        api: ["roles/cloudsql.client"],
        migrations: ["roles/cloudsql.client"],
      }),
    "The project-level IAM plan changed",
  );

  const resources = foundation.resourceRoleBindings;
  assert(
    resources.artifactRegistryWriter === "build" &&
      JSON.stringify(resources.artifactRegistryReaders) ===
        JSON.stringify(["deployer"]) &&
      JSON.stringify(resources.runtimeDatabaseSecretAccessors) ===
        JSON.stringify(["api"]) &&
      JSON.stringify(resources.migrationDatabaseSecretAccessors) ===
        JSON.stringify(["migrations"]) &&
      resources.runtimeServiceAccountUser.principal === "deployer" &&
      JSON.stringify(resources.runtimeServiceAccountUser.targets) ===
        JSON.stringify(["api", "customerWeb", "migrations"]),
    "Resource-level production trust boundaries changed",
  );
  assert(
    foundation.deferredRoleBindings.privateApiInvoker.principal ===
      "customerWeb" &&
      foundation.deferredRoleBindings.privateApiInvoker.target === "api" &&
      foundation.deferredRoleBindings.privateApiInvoker.applyPhase ===
        "api-service-deployment" &&
      foundation.deferredRoleBindings.privateApiInvoker.reason ===
        "Cloud Run service IAM cannot exist before the private API service",
    "Private API invocation must remain deferred until service deployment",
  );

  assert(
    JSON.stringify(foundation.secretMetadata) ===
      JSON.stringify([
        {
          id: "samra-production-runtime-database-url",
          purpose: "least-privilege application database connection",
          replication: "regional",
          createVersion: false,
        },
        {
          id: "samra-production-migration-database-url",
          purpose: "separate migration database connection",
          replication: "regional",
          createVersion: false,
        },
      ]),
    "The foundation may plan two secret metadata records but no values",
  );

  assert(
    foundation.plannedFoundationCreates.length === 6 &&
      foundation.plannedFoundationCreates.includes(
        "five dedicated keyless service accounts",
      ) &&
      foundation.foundationDoesNotCreate.includes(
        "Google Cloud project, billing link, or budget",
      ) &&
      foundation.foundationDoesNotCreate.includes(
        "Cloud Run service, job, revision, or traffic",
      ) &&
      foundation.foundationDoesNotCreate.includes(
        "Squarespace DNS record or registrar change",
      ) &&
      foundation.foundationDoesNotCreate.includes(
        "customer record, waitlist submission, or production data",
      ),
    "The plan boundary between foundation and launch resources changed",
  );

  const costs = foundation.costBoundary;
  assert(
    costs.budgetApprovalRequiredBeforeAnyApply === true &&
      costs.budgetIsSpendingCap === false &&
      costs.planEstimatedMonthlyCostUsd === 0 &&
      costs.foundationCostRisksAfterSeparateApply.length === 3 &&
      costs.excludedCostRisksUntilLaterAuthorization.length === 4,
    "Production cost gates must remain explicit",
  );
  assert(
    foundation.activation.controller ===
      "deploy/gcp/activate-coming-soon-production-foundation.sh" &&
      foundation.activation.inspector ===
        "deploy/gcp/inspect-coming-soon-production-foundation.mjs" &&
      foundation.activation.postAudit ===
        "deploy/gcp/audit-coming-soon-production-foundation.sh" &&
      foundation.activation.operator === "me@davidhaile.com" &&
      foundation.activation.authorizationEnvironment ===
        "SAMRA_GCP_PRODUCTION_FOUNDATION_APPLY" &&
      foundation.activation.authorizationValue ===
        "AUTHORIZED_COMING_SOON_PRODUCTION_FOUNDATION" &&
      foundation.activation.reviewBeforeApply === true &&
      foundation.activation.postAuditRequired === true &&
      foundation.activation.resumable === true &&
      foundation.activation.automaticApply === false &&
      foundation.activation.githubWorkflowAuthorized === false,
    "The guarded production foundation activation boundary changed",
  );
  assert(
    foundation.blockedOn.length === 1 &&
      foundation.blockedOn.includes(
        "separately reviewed and authorized production infrastructure foundation apply",
      ),
    "The production foundation blockers changed",
  );

  const source = JSON.stringify(foundation);
  assert(
    !/postgres(?:ql)?:\/\/|BEGIN (?:RSA|OPENSSH) PRIVATE KEY|api[_-]?key|password|versions\/latest/iu.test(
      source,
    ),
    "The production foundation contains a credential or unpinned secret",
  );

  return Object.freeze({
    schemaVersion: foundation.schemaVersion,
    status: "validated-prepared-not-applied",
    phase: foundation.phase,
    boundaryStatus: foundation.decisionStatus,
    projectId: boundary.projectId,
    monthlyBudgetUsd: boundary.monthlyBudgetUsd,
    canonicalDomain:
      boundary.canonicalHost === "www"
        ? `www.${boundary.apexDomain}`
        : boundary.apexDomain,
    apiCount: foundation.samraManagedApis.length,
    serviceAccountCount: accountIds.length,
    secretMetadataCount: foundation.secretMetadata.length,
    preflightEvidenceStatus: preflight.status,
    activationController: foundation.activation.controller,
    estimatedMonthlyPlanCostUsd: 0,
    cloudStateRead: false,
    cloudMutationAuthorized: false,
    dnsMutationAuthorized: false,
  });
}

export function validateProductionFoundationActivationEnvironment(
  environment = process.env,
) {
  const expected = {
    projectId: "samra-pay-production",
    projectNumber: "382465561715",
    organizationId: "614833350075",
    region: "us-east4",
    operator: "me@davidhaile.com",
    dataClassification: "customer-pii",
    monthlyBudgetUsd: "25",
  };
  assert(
    environment.SAMRA_GCP_PROJECT_ID === expected.projectId &&
      environment.SAMRA_GCP_PROJECT_NUMBER === expected.projectNumber &&
      environment.SAMRA_GCP_ORGANIZATION_ID === expected.organizationId &&
      environment.SAMRA_GCP_REGION === expected.region &&
      environment.SAMRA_GCP_OPERATOR_ACCOUNT === expected.operator &&
      environment.SAMRA_GCP_DATA_CLASSIFICATION ===
        expected.dataClassification &&
      environment.SAMRA_GCP_MONTHLY_BUDGET_USD === expected.monthlyBudgetUsd &&
      /^[0-9a-f]{40}$/u.test(environment.SAMRA_GCP_EXPECTED_SHA ?? ""),
    "The production foundation activation environment drifted",
  );
  return Object.freeze({
    ...expected,
    expectedSha: environment.SAMRA_GCP_EXPECTED_SHA,
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    process.stdout.write(
      `${JSON.stringify(validateComingSoonProductionFoundation())}\n`,
    );
  } catch (error) {
    process.stderr.write(
      `Production foundation plan rejected: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
