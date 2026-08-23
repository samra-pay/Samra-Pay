import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const EXACT = Object.freeze({
  projectId: "samra-pay-staging",
  projectNumber: "934122615631",
  organizationId: "614833350075",
  region: "us-east4",
  owner: "haileleuld87",
  repository: "Samra-Pay",
  repositoryId: "1335175962",
  repositoryOwnerId: "237485986",
  ref: "refs/heads/main",
  event: "workflow_dispatch",
  workflowName: "Staging zero-traffic deployment",
  workflowPath: ".github/workflows/staging-zero-traffic-deployment.yml",
  environment: "staging-zero-traffic-deployment",
  poolId: "samra-zero-traffic-staging",
  providerId: "samra-pay-zero-traffic-main",
  deployerId: "samra-github-deployer-staging",
  roleId: "samraStagingZeroTrafficDeployer",
});

const SERVICE_NAMES = Object.freeze([
  "samra-api",
  "samra-customer-web",
  "samra-design-system-preview",
]);

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

const EXPECTED_PERMISSIONS = Object.freeze([
  "artifactregistry.dockerimages.get",
  "artifactregistry.repositories.get",
  "artifactregistry.repositories.getIamPolicy",
  "compute.networks.get",
  "compute.subnetworks.get",
  "iam.roles.get",
  "iam.serviceAccountKeys.list",
  "iam.serviceAccounts.get",
  "iam.serviceAccounts.getIamPolicy",
  "iam.workloadIdentityPoolProviders.get",
  "iam.workloadIdentityPools.get",
  "resourcemanager.projects.get",
  "resourcemanager.projects.getIamPolicy",
  "run.operations.get",
  "run.revisions.get",
  "run.revisions.list",
  "run.services.create",
  "run.services.get",
  "run.services.getIamPolicy",
  "run.services.update",
  "secretmanager.secrets.get",
  "secretmanager.versions.get",
  "serviceusage.services.list",
  "serviceusage.services.use",
]);

const EXPECTED_ACTIONS = Object.freeze({
  checkoutAction: "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",
  downloadArtifactAction:
    "actions/download-artifact@70fc10c6e5e1ce46ad2ea6f2b72d43f7d47b13c3",
  authenticationAction:
    "google-github-actions/auth@7c6bc770dae815cd3e89ee6cdf493a5fab2cc093",
  cloudSdkAction:
    "google-github-actions/setup-gcloud@aa5489c8933f4cc7a4f7d45035b3b1440c9c10db",
  uploadArtifactAction:
    "actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a",
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function readStagingZeroTrafficDeployment() {
  return JSON.parse(
    readFileSync(
      new URL("./staging-zero-traffic-deployment.json", import.meta.url),
      "utf8",
    ),
  );
}

export function validateStagingZeroTrafficDeployment(
  contract = readStagingZeroTrafficDeployment(),
) {
  assert(
    contract.schemaVersion === 1 &&
      contract.status === "prepared-not-authorized" &&
      contract.environment === "staging" &&
      contract.dataClassification === "synthetic-only",
    "Zero-traffic deployment must remain unapproved synthetic staging",
  );

  const { github, googleCloud, provider, iam, artifactInput, deployment } =
    contract;
  for (const [actual, expected, label] of [
    [github.owner, EXACT.owner, "GitHub owner"],
    [github.repository, EXACT.repository, "GitHub repository"],
    [github.repositoryId, EXACT.repositoryId, "GitHub repository ID"],
    [github.repositoryOwnerId, EXACT.repositoryOwnerId, "GitHub owner ID"],
    [github.allowedRef, EXACT.ref, "GitHub ref"],
    [github.allowedEvent, EXACT.event, "GitHub event"],
    [github.workflowName, EXACT.workflowName, "workflow name"],
    [github.workflowPath, EXACT.workflowPath, "workflow path"],
    [github.protectedEnvironment, EXACT.environment, "environment"],
    [googleCloud.projectId, EXACT.projectId, "project"],
    [googleCloud.projectNumber, EXACT.projectNumber, "project number"],
    [googleCloud.organizationId, EXACT.organizationId, "organization"],
    [googleCloud.region, EXACT.region, "region"],
    [googleCloud.artifactRepository, "samra-staging", "repository"],
    [googleCloud.workloadIdentityLocation, "global", "identity location"],
    [googleCloud.workloadIdentityPoolId, EXACT.poolId, "identity pool"],
    [googleCloud.workloadIdentityProviderId, EXACT.providerId, "provider"],
    [googleCloud.deployerServiceAccountId, EXACT.deployerId, "deployer"],
    [googleCloud.deployerCustomRoleId, EXACT.roleId, "custom role"],
    [
      googleCloud.cloudRunServiceAgent,
      "service-934122615631@serverless-robot-prod.iam.gserviceaccount.com",
      "Cloud Run service agent",
    ],
  ]) {
    assert(actual === expected, `${label} drifted`);
  }

  const expectedCondition =
    "assertion.repository=='haileleuld87/Samra-Pay' && " +
    "assertion.repository_id=='1335175962' && " +
    "assertion.repository_owner_id=='237485986' && " +
    "assertion.ref=='refs/heads/main' && " +
    "assertion.event_name=='workflow_dispatch' && " +
    "assertion.workflow=='Staging zero-traffic deployment' && " +
    "assertion.workflow_ref=='haileleuld87/Samra-Pay/.github/workflows/staging-zero-traffic-deployment.yml@refs/heads/main' && " +
    "assertion.environment=='staging-zero-traffic-deployment'";
  assert(
    provider.issuerUri === "https://token.actions.githubusercontent.com" &&
      JSON.stringify(provider.attributeMapping) ===
        JSON.stringify(EXPECTED_MAPPING) &&
      provider.attributeCondition === expectedCondition,
    "Zero-traffic OIDC provider boundary drifted",
  );

  assert(
    JSON.stringify(iam.deployerCustomRolePermissions) ===
      JSON.stringify(EXPECTED_PERMISSIONS) &&
      iam.artifactRepositoryRole === "roles/artifactregistry.reader" &&
      iam.runtimeServiceAccountRole === "roles/iam.serviceAccountUser" &&
      iam.federationServiceAccountRole === "roles/iam.workloadIdentityUser" &&
      iam.cloudRunServiceAgentRole === "roles/run.serviceAgent" &&
      iam.federatedPrincipalSetAttribute === "attribute.repository_id" &&
      iam.federatedPrincipalSetValue === EXACT.repositoryId &&
      iam.isolatedWorkloadIdentityPoolRequired === true &&
      JSON.stringify(iam.runtimeServiceAccountIds) ===
        JSON.stringify([
          "samra-api-staging",
          "samra-customer-web-staging",
          "samra-design-system-staging",
        ]),
    "Zero-traffic IAM boundary drifted",
  );
  assert(
    !iam.deployerCustomRolePermissions.includes("run.services.setIamPolicy") &&
      !iam.deployerCustomRolePermissions.some((permission) =>
        /cloudbuild\.builds\.create|artifactregistry\.repositories\.uploadArtifacts|secretmanager\.versions\.access|run\.jobs\.run/.test(
          permission,
        ),
      ),
    "Deployer can publish, read secrets, mutate IAM, or execute jobs",
  );

  assert(
    artifactInput.publicationWorkflow ===
      ".github/workflows/staging-image-publication.yml" &&
      artifactInput.publicationManifest ===
        "artifacts/staging-release/staging-image-publication.json" &&
      artifactInput.publicationManifestHash ===
        "artifacts/staging-release/staging-image-publication.sha256" &&
      artifactInput.sameCommitRequired === true &&
      artifactInput.exactDigestRequired === true &&
      artifactInput.crossRunDownloadRequiresActionsRead === true,
    "Publication evidence input drifted",
  );

  assert(
    deployment.oneServicePerRun === true &&
      deployment.initialTrafficPercent === 0 &&
      deployment.trafficMustRemainUnchanged === true &&
      deployment.revisionTagAllowed === false &&
      deployment.defaultServiceUrlAllowed === false &&
      deployment.publicUnauthenticatedAllowed === false &&
      deployment.directVpcEgress === "private-ranges-only" &&
      deployment.network === "samra-staging-vpc" &&
      deployment.subnet === "samra-staging-us-east4" &&
      deployment.authorization ===
        "AUTHORIZED_STAGING_ZERO_TRAFFIC_DEPLOYMENT" &&
      deployment.retentionDays === 365,
    "Zero-traffic deployment safety boundary drifted",
  );

  assert(
    JSON.stringify(Object.keys(contract.services)) ===
      JSON.stringify(SERVICE_NAMES),
    "Deployable service allowlist drifted",
  );
  for (const [name, service] of Object.entries(contract.services)) {
    assert(
      service.imageName === name &&
        service.ingress === "internal-and-cloud-load-balancing" &&
        service.defaultUrlDisabled === true &&
        service.minInstances === 0 &&
        service.maxInstances >= 1 &&
        service.maxInstances <= 2 &&
        Number.isInteger(service.concurrency) &&
        service.concurrency >= 1,
      `${name} service boundary drifted`,
    );
    assert(
      iam.runtimeServiceAccountIds.includes(service.serviceAccountId),
      `${name} references an unreviewed runtime identity`,
    );
    assert(
      Array.isArray(service.requiredRuntimeEnvironment) &&
        Array.isArray(service.prerequisiteEvidence) &&
        !service.requiredRuntimeEnvironment.some(
          (value) =>
            /PASSWORD|API_KEY|CLIENT_SECRET|WEBHOOK_SECRET/.test(value) ||
            (/SECRET/.test(value) && !/_SECRET_VERSION$/.test(value)),
        ),
      `${name} exposes secret configuration as plain environment`,
    );
  }
  assert(
    contract.services["samra-api"].directVpcEgressRequired === true &&
      contract.services["samra-customer-web"].directVpcEgressRequired ===
        false &&
      contract.services["samra-design-system-preview"]
        .directVpcEgressRequired === false &&
      contract.services["samra-api"].secretMappings.DATABASE_URL
        .pinnedIntegerRequired === true &&
      contract.services["samra-api"].prerequisiteEvidence.length === 1 &&
      contract.services["samra-customer-web"].prerequisiteEvidence.length ===
        1 &&
      contract.services["samra-design-system-preview"].prerequisiteEvidence
        .length === 0,
    "Private database or VPC boundary drifted",
  );

  assert(
    JSON.stringify(contract.workflow.permissions) ===
      JSON.stringify({
        contents: "read",
        actions: "read",
        "id-token": "write",
      }) &&
      Object.entries(EXPECTED_ACTIONS).every(
        ([key, value]) => contract.workflow[key] === value,
      ) &&
      contract.workflow.automaticTriggers === false &&
      contract.workflow.trafficMutation === false &&
      contract.workflow.migrationExecution === false &&
      contract.workflow.vendorActivation === false,
    "Workflow supply-chain or permission boundary drifted",
  );

  assert(
    JSON.stringify(contract.requiredApis) ===
      JSON.stringify([
        "compute.googleapis.com",
        "iamcredentials.googleapis.com",
        "run.googleapis.com",
        "secretmanager.googleapis.com",
        "sts.googleapis.com",
      ]) &&
      [
        "service-account key",
        "floating image tag",
        "latest secret version",
        "traffic mutation",
        "public unauthenticated access",
        "image publication",
        "secret payload read",
        "operations portal deployment",
        "vendor activation",
        "production resource",
        "Replit change",
      ].every((value) => contract.prohibited.includes(value)),
    "Zero-traffic API allowlist or prohibitions drifted",
  );

  return Object.freeze({
    schemaVersion: 1,
    status: "validated",
    projectId: googleCloud.projectId,
    projectNumber: googleCloud.projectNumber,
    poolId: googleCloud.workloadIdentityPoolId,
    providerId: googleCloud.workloadIdentityProviderId,
    deployerServiceAccount: `${googleCloud.deployerServiceAccountId}@${googleCloud.projectId}.iam.gserviceaccount.com`,
    serviceNames: SERVICE_NAMES,
    permissionCount: iam.deployerCustomRolePermissions.length,
    deploymentAuthorized: false,
    trafficAuthorized: false,
  });
}

export function validateZeroTrafficEnvironment(
  input,
  contract = readStagingZeroTrafficDeployment(),
) {
  const validated = validateStagingZeroTrafficDeployment(contract);
  for (const [key, expected] of Object.entries({
    SAMRA_GCP_PROJECT_ID: EXACT.projectId,
    SAMRA_GCP_PROJECT_NUMBER: EXACT.projectNumber,
    SAMRA_GCP_ORGANIZATION_ID: EXACT.organizationId,
    SAMRA_GCP_REGION: EXACT.region,
  })) {
    assert(
      input[key]?.trim() === expected,
      `${key} must exactly match ${expected}`,
    );
  }
  const operator = input.SAMRA_GCP_OPERATOR_ACCOUNT?.trim();
  assert(
    operator === validated.deployerServiceAccount ||
      /^[^@\s]+@davidhaile\.com$/.test(operator ?? ""),
    "Operator must be the keyless deployer or a davidhaile.com reviewer",
  );
  return Object.freeze({ ...validated, operator });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    console.log(JSON.stringify(validateZeroTrafficEnvironment(process.env)));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Staging zero-traffic deployment rejected: ${message}`);
    process.exitCode = 1;
  }
}
