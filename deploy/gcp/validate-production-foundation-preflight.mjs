import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const EXACT = Object.freeze({
  productionProjectId: "samra-pay-production",
  productionProjectNumber: "382465561715",
  stagingProjectId: "samra-pay-staging",
  stagingProjectNumber: "934122615631",
  organizationId: "614833350075",
  region: "us-east4",
  owner: "haileleuld87",
  repository: "Samra-Pay",
  repositoryId: "1335175962",
  repositoryOwnerId: "237485986",
  ref: "refs/heads/main",
  event: "workflow_dispatch",
  workflowName: "Production foundation preflight",
  workflowPath: ".github/workflows/production-foundation-preflight.yml",
  environment: "production-foundation-review",
  poolId: "samra-production-review",
  providerId: "samra-foundation-preflight",
  providerDisplayName: "Samra production preflight",
  auditorId: "samra-production-auditor",
  productionRoleId: "samraProductionBoundaryAuditor",
  stagingRoleId: "samraProductionBillingSourceReader",
});

const EXPECTED_MAPPING = Object.freeze({
  "google.subject": "assertion.sub",
  "attribute.repository": "assertion.repository",
  "attribute.repository_id": "assertion.repository_id",
  "attribute.repository_owner_id": "assertion.repository_owner_id",
  "attribute.ref": "assertion.ref",
  "attribute.event_name": "assertion.event_name",
  "attribute.workflow": "assertion.workflow",
  "attribute.workflow_ref": "assertion.workflow_ref",
  "attribute.environment": "assertion.environment",
});

const PRODUCTION_PERMISSIONS = Object.freeze([
  "billing.resourcebudgets.read",
  "iam.serviceAccountKeys.list",
  "iam.serviceAccounts.get",
  "resourcemanager.projects.get",
  "serviceusage.services.use",
]);
const STAGING_PERMISSIONS = Object.freeze(["resourcemanager.projects.get"]);
const REQUIRED_APIS = Object.freeze([
  "billingbudgets.googleapis.com",
  "cloudbilling.googleapis.com",
  "cloudresourcemanager.googleapis.com",
  "iam.googleapis.com",
  "iamcredentials.googleapis.com",
  "serviceusage.googleapis.com",
  "sts.googleapis.com",
]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function readProductionFoundationPreflight() {
  return JSON.parse(
    readFileSync(
      new URL("./production-foundation-preflight.json", import.meta.url),
      "utf8",
    ),
  );
}

export function validateProductionFoundationPreflight(
  contract = readProductionFoundationPreflight(),
) {
  assert(
    contract.schemaVersion === 1 &&
      contract.status === "prepared-not-applied" &&
      contract.phase === "production-foundation-preflight-automation" &&
      contract.environment === "production" &&
      contract.dataClassification === "configuration-metadata-only" &&
      contract.applyAuthorized === false,
    "Production preflight must remain prepared, unapplied, and metadata-only",
  );

  const { github, googleCloud, provider, iam, workflow, bootstrap } = contract;
  for (const [actual, expected, label] of [
    [github.owner, EXACT.owner, "GitHub owner"],
    [github.repository, EXACT.repository, "GitHub repository"],
    [github.repositoryId, EXACT.repositoryId, "GitHub repository ID"],
    [github.repositoryOwnerId, EXACT.repositoryOwnerId, "GitHub owner ID"],
    [github.defaultBranch, "main", "default branch"],
    [github.allowedRef, EXACT.ref, "allowed ref"],
    [github.allowedEvent, EXACT.event, "allowed event"],
    [github.workflowName, EXACT.workflowName, "workflow name"],
    [github.workflowPath, EXACT.workflowPath, "workflow path"],
    [github.protectedEnvironment, EXACT.environment, "protected environment"],
    [
      googleCloud.productionProjectId,
      EXACT.productionProjectId,
      "production project",
    ],
    [
      googleCloud.productionProjectNumber,
      EXACT.productionProjectNumber,
      "production project number",
    ],
    [googleCloud.stagingProjectId, EXACT.stagingProjectId, "staging project"],
    [
      googleCloud.stagingProjectNumber,
      EXACT.stagingProjectNumber,
      "staging project number",
    ],
    [googleCloud.organizationId, EXACT.organizationId, "organization"],
    [googleCloud.region, EXACT.region, "region"],
    [googleCloud.workloadIdentityLocation, "global", "trust location"],
    [googleCloud.workloadIdentityPoolId, EXACT.poolId, "identity pool"],
    [
      googleCloud.workloadIdentityProviderId,
      EXACT.providerId,
      "identity provider",
    ],
    [googleCloud.auditorServiceAccountId, EXACT.auditorId, "auditor"],
    [
      googleCloud.productionCustomRoleId,
      EXACT.productionRoleId,
      "production role",
    ],
    [googleCloud.stagingCustomRoleId, EXACT.stagingRoleId, "staging role"],
  ]) {
    assert(actual === expected, `${label} drifted`);
  }
  assert(
    github.enterpriseTransferRequiresTrustReissue === true,
    "Repository transfer must require an explicit trust reissue",
  );

  const expectedCondition =
    "assertion.repository=='haileleuld87/Samra-Pay' && " +
    "assertion.repository_id=='1335175962' && " +
    "assertion.repository_owner_id=='237485986' && " +
    "assertion.ref=='refs/heads/main' && " +
    "assertion.event_name=='workflow_dispatch' && " +
    "assertion.workflow=='Production foundation preflight' && " +
    "assertion.workflow_ref=='haileleuld87/Samra-Pay/.github/workflows/production-foundation-preflight.yml@refs/heads/main' && " +
    "assertion.environment=='production-foundation-review'";
  assert(
    provider.displayName === EXACT.providerDisplayName &&
      provider.displayName.length <= 32 &&
      provider.issuerUri === "https://token.actions.githubusercontent.com" &&
      JSON.stringify(provider.attributeMapping) ===
        JSON.stringify(EXPECTED_MAPPING) &&
      provider.attributeCondition === expectedCondition,
    "Production GitHub OIDC boundary or display-name limit drifted",
  );

  assert(
    JSON.stringify(iam.productionCustomRolePermissions) ===
      JSON.stringify(PRODUCTION_PERMISSIONS) &&
      JSON.stringify(iam.stagingCustomRolePermissions) ===
        JSON.stringify(STAGING_PERMISSIONS) &&
      iam.federationServiceAccountRole === "roles/iam.workloadIdentityUser" &&
      iam.billingAccountRole === null,
    "Production preflight IAM boundary drifted",
  );

  assert(
    workflow.checkoutAction ===
      "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1" &&
      workflow.authenticationAction ===
        "google-github-actions/auth@7c6bc770dae815cd3e89ee6cdf493a5fab2cc093" &&
      workflow.cloudSdkAction ===
        "google-github-actions/setup-gcloud@aa5489c8933f4cc7a4f7d45035b3b1440c9c10db" &&
      workflow.artifactAction ===
        "actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a" &&
      JSON.stringify(workflow.permissions) ===
        JSON.stringify({ contents: "read", "id-token": "write" }) &&
      workflow.automaticTriggers === false &&
      workflow.readOnly === true &&
      workflow.cloudMutation === false &&
      workflow.serviceDeployment === false &&
      workflow.trafficChange === false &&
      workflow.dnsChange === false,
    "Production preflight workflow boundary drifted",
  );

  assert(
    bootstrap.authorizationEnvironment ===
      "SAMRA_GCP_PRODUCTION_PREFLIGHT_APPLY" &&
      bootstrap.authorizationValue ===
        "AUTHORIZED_PRODUCTION_FOUNDATION_PREFLIGHT" &&
      bootstrap.estimatedBaseMonthlyCostUsd === 0 &&
      JSON.stringify(bootstrap.requiredProductionApis) ===
        JSON.stringify(REQUIRED_APIS) &&
      bootstrap.createsOnly.length === 6,
    "Production preflight bootstrap boundary drifted",
  );

  for (const prohibition of [
    "billing-account-level IAM role",
    "service-account key",
    "build or image publication",
    "Cloud SQL or database mutation",
    "Cloud Run deployment or traffic change",
    "Squarespace DNS or registrar change",
    "waitlist or customer data access",
  ]) {
    assert(
      contract.prohibited.includes(prohibition),
      `Missing: ${prohibition}`,
    );
  }

  return Object.freeze({
    schemaVersion: 1,
    status: "validated-prepared-not-applied",
    productionProjectId: googleCloud.productionProjectId,
    productionProjectNumber: googleCloud.productionProjectNumber,
    stagingProjectId: googleCloud.stagingProjectId,
    repository: `${github.owner}/${github.repository}`,
    repositoryId: github.repositoryId,
    workflowPath: github.workflowPath,
    protectedEnvironment: github.protectedEnvironment,
    poolId: googleCloud.workloadIdentityPoolId,
    providerId: googleCloud.workloadIdentityProviderId,
    auditorServiceAccount: `${googleCloud.auditorServiceAccountId}@${googleCloud.productionProjectId}.iam.gserviceaccount.com`,
    productionPermissionCount: iam.productionCustomRolePermissions.length,
    stagingPermissionCount: iam.stagingCustomRolePermissions.length,
    requiredApiCount: bootstrap.requiredProductionApis.length,
    estimatedBaseMonthlyCostUsd: 0,
  });
}

export function validateProductionPreflightActivationEnvironment(
  environment = process.env,
  contract = readProductionFoundationPreflight(),
) {
  const validated = validateProductionFoundationPreflight(contract);
  const required = {
    SAMRA_GCP_PROJECT_ID: validated.productionProjectId,
    SAMRA_GCP_PROJECT_NUMBER: validated.productionProjectNumber,
    SAMRA_GCP_STAGING_PROJECT_ID: validated.stagingProjectId,
    SAMRA_GCP_ORGANIZATION_ID: EXACT.organizationId,
    SAMRA_GCP_REGION: EXACT.region,
  };
  for (const [key, expected] of Object.entries(required)) {
    assert(
      String(environment[key] ?? "").trim() === expected,
      `${key} must exactly match ${expected}`,
    );
  }
  const operator = String(environment.SAMRA_GCP_OPERATOR_ACCOUNT ?? "").trim();
  const expectedSha = String(environment.SAMRA_GCP_EXPECTED_SHA ?? "").trim();
  assert(
    /^[^@\s]+@davidhaile\.com$/u.test(operator),
    "SAMRA_GCP_OPERATOR_ACCOUNT must be a davidhaile.com administrator",
  );
  assert(
    /^[0-9a-f]{40}$/u.test(expectedSha),
    "SAMRA_GCP_EXPECTED_SHA must be a full lowercase Git SHA",
  );
  return Object.freeze({ ...validated, operator, expectedSha });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    process.stdout.write(
      `${JSON.stringify(validateProductionFoundationPreflight())}\n`,
    );
  } catch (error) {
    process.stderr.write(
      `Production foundation preflight rejected: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
