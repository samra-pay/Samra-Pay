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
      foundation.status === "plan-only" &&
      foundation.phase === "coming-soon-production-foundation" &&
      foundation.applyAuthorized === false &&
      foundation.cloudStateReadByPlan === false,
    "The production foundation must remain a local plan only",
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
    boundary.projectId === "UNSET_PRODUCTION_PROJECT_ID" &&
      boundary.projectNumber === "UNSET_PRODUCTION_PROJECT_NUMBER" &&
      boundary.organizationId === "614833350075" &&
      boundary.region === "UNSET_APPROVED_REGION" &&
      boundary.dataClassification ===
        "UNSET_APPROVED_NON_SYNTHETIC_CLASSIFICATION" &&
      boundary.monthlyBudgetUsd === "UNSET_APPROVED_MONTHLY_USD" &&
      boundary.apexDomain === "UNSET_CUSTOM_DOMAIN" &&
      boundary.canonicalHost === "UNSET_APEX_OR_WWW" &&
      boundary.mustNotEqualProjectId === "samra-pay-staging" &&
      boundary.projectCreationAuthorized === false &&
      boundary.billingMutationAuthorized === false &&
      boundary.budgetMutationAuthorized === false,
    "Production identity, budget, region, and domain decisions remain unresolved",
  );
  assert(
    foundation.projectLabels.environment === "production" &&
      foundation.projectLabels.application === "samra-pay" &&
      foundation.projectLabels.data_classification ===
        "APPROVED_NON_SYNTHETIC_CLASSIFICATION",
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
      foundation.artifactRegistry.location === "APPROVED_PRODUCTION_REGION",
    "Production images require one regional immutable Docker repository",
  );

  assert(
    JSON.stringify(foundation.serviceAccounts) ===
      JSON.stringify(SERVICE_ACCOUNTS),
    "The five production trust boundaries changed",
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
        JSON.stringify(["api", "customerWeb", "migrations"]) &&
      resources.privateApiInvoker.principal === "customerWeb" &&
      resources.privateApiInvoker.target === "api",
    "Resource-level production trust boundaries changed",
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
    foundation.blockedOn.length === 6 &&
      foundation.blockedOn.includes(
        "separate authorization to build an apply controller",
      ),
    "The production foundation cannot be applied while decisions are unresolved",
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
    status: "validated-plan-only",
    phase: foundation.phase,
    apiCount: foundation.samraManagedApis.length,
    serviceAccountCount: accountIds.length,
    secretMetadataCount: foundation.secretMetadata.length,
    estimatedMonthlyPlanCostUsd: 0,
    cloudStateRead: false,
    cloudMutationAuthorized: false,
    dnsMutationAuthorized: false,
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
