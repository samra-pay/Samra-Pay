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
  workflowName: "Staging image publication",
  workflowPath: ".github/workflows/staging-image-publication.yml",
  environment: "staging-image-publication",
  poolId: "samra-github-staging",
  providerId: "samra-pay-main",
  publisherId: "samra-github-staging",
  buildId: "samra-cloud-build-staging",
  sourceBucket: "samra-pay-staging_cloudbuild",
  roleId: "samraStagingImagePublisher",
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

const EXPECTED_PERMISSIONS = Object.freeze([
  "artifactregistry.dockerimages.get",
  "artifactregistry.repositories.get",
  "artifactregistry.repositories.getIamPolicy",
  "billing.resourceAssociations.list",
  "cloudbuild.builds.create",
  "cloudbuild.builds.get",
  "iam.roles.get",
  "iam.serviceAccountKeys.list",
  "iam.serviceAccounts.get",
  "iam.serviceAccounts.getIamPolicy",
  "iam.workloadIdentityPoolProviders.get",
  "iam.workloadIdentityPools.get",
  "resourcemanager.projects.get",
  "resourcemanager.projects.getIamPolicy",
  "serviceusage.services.list",
  "serviceusage.services.use",
  "storage.buckets.get",
  "storage.buckets.getIamPolicy",
]);

export function readStagingGithubFederation() {
  return JSON.parse(
    readFileSync(
      new URL("./staging-github-federation.json", import.meta.url),
      "utf8",
    ),
  );
}

export function validateStagingGithubFederation(
  contract = readStagingGithubFederation(),
) {
  if (
    contract.schemaVersion !== 1 ||
    contract.status !== "review-only" ||
    contract.environment !== "staging" ||
    contract.dataClassification !== "synthetic-only"
  ) {
    throw new Error("Federation must remain review-only synthetic staging");
  }

  const { github, googleCloud, provider, iam, workflow } = contract;
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
    [googleCloud.projectId, EXACT.projectId, "project"],
    [googleCloud.projectNumber, EXACT.projectNumber, "project number"],
    [googleCloud.organizationId, EXACT.organizationId, "organization"],
    [googleCloud.region, EXACT.region, "region"],
    [googleCloud.workloadIdentityLocation, "global", "federation location"],
    [googleCloud.workloadIdentityPoolId, EXACT.poolId, "pool"],
    [googleCloud.workloadIdentityProviderId, EXACT.providerId, "provider"],
    [
      googleCloud.publisherServiceAccountId,
      EXACT.publisherId,
      "publisher identity",
    ],
    [googleCloud.buildServiceAccountId, EXACT.buildId, "build identity"],
    [googleCloud.sourceBucket, EXACT.sourceBucket, "source bucket"],
    [googleCloud.publisherCustomRoleId, EXACT.roleId, "publisher role"],
  ]) {
    if (actual !== expected) throw new Error(`${label} drifted`);
  }

  const expectedCondition =
    "assertion.repository=='haileleuld87/Samra-Pay' && " +
    "assertion.repository_id=='1335175962' && " +
    "assertion.repository_owner_id=='237485986' && " +
    "assertion.ref=='refs/heads/main' && " +
    "assertion.event_name=='workflow_dispatch' && " +
    "assertion.workflow=='Staging image publication' && " +
    "assertion.workflow_ref=='haileleuld87/Samra-Pay/.github/workflows/staging-image-publication.yml@refs/heads/main' && " +
    "assertion.environment=='staging-image-publication'";
  if (
    provider.issuerUri !== "https://token.actions.githubusercontent.com" ||
    JSON.stringify(provider.attributeMapping) !==
      JSON.stringify(EXPECTED_MAPPING) ||
    provider.attributeCondition !== expectedCondition
  ) {
    throw new Error("GitHub OIDC provider boundary drifted");
  }

  if (
    JSON.stringify(iam.publisherCustomRolePermissions) !==
      JSON.stringify(EXPECTED_PERMISSIONS) ||
    iam.publisherSourceBucketRole !== "roles/storage.objectCreator" ||
    iam.publisherBuildServiceAccountRole !== "roles/iam.serviceAccountUser" ||
    iam.federationServiceAccountRole !== "roles/iam.workloadIdentityUser"
  ) {
    throw new Error("Publisher IAM boundary drifted");
  }

  if (
    workflow.checkoutAction !==
      "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1" ||
    workflow.authenticationAction !==
      "google-github-actions/auth@7c6bc770dae815cd3e89ee6cdf493a5fab2cc093" ||
    workflow.cloudSdkAction !==
      "google-github-actions/setup-gcloud@aa5489c8933f4cc7a4f7d45035b3b1440c9c10db" ||
    JSON.stringify(workflow.permissions) !==
      JSON.stringify({ contents: "read", "id-token": "write" }) ||
    workflow.publicationAuthorization !==
      "AUTHORIZED_STAGING_IMAGE_PUBLICATION" ||
    workflow.automaticTriggers !== false ||
    workflow.serviceDeployment !== false ||
    workflow.trafficChange !== false
  ) {
    throw new Error("GitHub workflow boundary drifted");
  }

  if (
    JSON.stringify(contract.requiredApis) !==
      JSON.stringify(["iamcredentials.googleapis.com", "sts.googleapis.com"]) ||
    !Array.isArray(contract.prohibited) ||
    !contract.prohibited.includes("service-account key") ||
    !contract.prohibited.includes("stored Google credential secret") ||
    !contract.prohibited.includes("Cloud Run deployment") ||
    !contract.prohibited.includes("production resource") ||
    !contract.prohibited.includes("Replit change")
  ) {
    throw new Error("Federation prohibitions or API allowlist drifted");
  }

  return Object.freeze({
    schemaVersion: 1,
    status: "validated",
    projectId: googleCloud.projectId,
    projectNumber: googleCloud.projectNumber,
    repository: `${github.owner}/${github.repository}`,
    repositoryId: github.repositoryId,
    allowedRef: github.allowedRef,
    workflowPath: github.workflowPath,
    poolId: googleCloud.workloadIdentityPoolId,
    providerId: googleCloud.workloadIdentityProviderId,
    publisherServiceAccount: `${googleCloud.publisherServiceAccountId}@${googleCloud.projectId}.iam.gserviceaccount.com`,
    permissionCount: iam.publisherCustomRolePermissions.length,
  });
}

export function validateFederationEnvironment(
  input,
  contract = readStagingGithubFederation(),
) {
  const validated = validateStagingGithubFederation(contract);
  const required = {
    SAMRA_GCP_PROJECT_ID: validated.projectId,
    SAMRA_GCP_PROJECT_NUMBER: validated.projectNumber,
    SAMRA_GCP_ORGANIZATION_ID: EXACT.organizationId,
    SAMRA_GCP_REGION: EXACT.region,
  };
  for (const [key, expected] of Object.entries(required)) {
    if (input[key]?.trim() !== expected) {
      throw new Error(`${key} must exactly match ${expected}`);
    }
  }
  const operator = input.SAMRA_GCP_OPERATOR_ACCOUNT?.trim();
  if (!operator || !/^[^@\s]+@davidhaile\.com$/.test(operator)) {
    throw new Error(
      "SAMRA_GCP_OPERATOR_ACCOUNT must be a davidhaile.com administrator",
    );
  }
  return Object.freeze({ ...validated, operator });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    console.log(JSON.stringify(validateFederationEnvironment(process.env)));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Staging GitHub federation rejected: ${message}`);
    process.exitCode = 1;
  }
}
