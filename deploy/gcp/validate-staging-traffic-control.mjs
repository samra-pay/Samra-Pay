import { readFileSync } from "node:fs";

export const STAGING_TRAFFIC_SERVICES = Object.freeze([
  "samra-api",
  "samra-customer-web",
  "samra-design-system-preview",
]);

export const STAGING_VERIFICATION_CHECKS = Object.freeze([
  "readiness",
  "restart",
  "serviceAuthentication",
  "ledger",
  "reconciliation",
  "audit",
  "failureVisibility",
]);

const CUSTOM_ROLE_PERMISSIONS = Object.freeze([
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
  "run.services.get",
  "run.services.getIamPolicy",
  "run.services.update",
  "serviceusage.services.list",
  "serviceusage.services.use",
]);

const ACTION_PINS = Object.freeze({
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

export function readStagingTrafficControl() {
  return JSON.parse(
    readFileSync(
      new URL("./staging-traffic-control.json", import.meta.url),
      "utf8",
    ),
  );
}

export function validateStagingTrafficControl(
  contract = readStagingTrafficControl(),
) {
  assert(
    contract.schemaVersion === 1 &&
      contract.status === "prepared-not-authorized" &&
      contract.environment === "staging" &&
      contract.dataClassification === "synthetic-only",
    "Traffic control must remain non-authorized synthetic staging",
  );

  const github = contract.github;
  assert(
    github.owner === "haileleuld87" &&
      github.repository === "Samra-Pay" &&
      github.repositoryId === "1335175962" &&
      github.repositoryOwnerId === "237485986" &&
      github.allowedRef === "refs/heads/main" &&
      github.allowedEvent === "workflow_dispatch" &&
      github.workflowName === "Staging traffic control" &&
      github.workflowPath === ".github/workflows/staging-traffic-control.yml" &&
      github.promotionEnvironment === "staging-traffic-promotion" &&
      github.rollbackEnvironment === "staging-traffic-rollback",
    "GitHub traffic authority drifted",
  );

  const cloud = contract.googleCloud;
  assert(
    cloud.projectId === "samra-pay-staging" &&
      cloud.projectNumber === "934122615631" &&
      cloud.organizationId === "614833350075" &&
      cloud.region === "us-east4" &&
      cloud.workloadIdentityLocation === "global" &&
      cloud.workloadIdentityPoolId === "samra-traffic-staging" &&
      cloud.promotionProviderId === "samra-pay-promotion-main" &&
      cloud.rollbackProviderId === "samra-pay-rollback-main" &&
      cloud.promoterServiceAccountId === "samra-github-promoter-staging" &&
      cloud.rollbackServiceAccountId === "samra-github-rollback-staging" &&
      cloud.trafficControllerCustomRoleId === "samraStagingTrafficController",
    "Google Cloud traffic authority drifted",
  );

  const provider = contract.provider;
  assert(
    provider.issuerUri === "https://token.actions.githubusercontent.com" &&
      provider.attributeMapping["google.subject"] === "assertion.sub" &&
      provider.attributeMapping["attribute.repository_id"] ===
        "assertion.repository_id" &&
      provider.attributeMapping["attribute.repository_owner_id"] ===
        "assertion.repository_owner_id" &&
      provider.attributeMapping["attribute.environment"] ===
        "assertion.environment" &&
      provider.commonCondition.includes(
        "assertion.repository_id=='1335175962'",
      ) &&
      provider.commonCondition.includes(
        "assertion.repository_owner_id=='237485986'",
      ) &&
      provider.commonCondition.includes(
        "assertion.workflow_ref=='haileleuld87/Samra-Pay/.github/workflows/staging-traffic-control.yml@refs/heads/main'",
      ) &&
      provider.promotionEnvironmentCondition ===
        "assertion.environment=='staging-traffic-promotion'" &&
      provider.rollbackEnvironmentCondition ===
        "assertion.environment=='staging-traffic-rollback'",
    "Workload identity condition drifted",
  );

  const iam = contract.iam;
  assert(
    JSON.stringify(iam.customRolePermissions) ===
      JSON.stringify(CUSTOM_ROLE_PERMISSIONS) &&
      iam.federationServiceAccountRole === "roles/iam.workloadIdentityUser" &&
      iam.promotionPrincipalAttribute === "attribute.environment" &&
      iam.promotionPrincipalValue === "staging-traffic-promotion" &&
      iam.rollbackPrincipalAttribute === "attribute.environment" &&
      iam.rollbackPrincipalValue === "staging-traffic-rollback" &&
      iam.isolatedWorkloadIdentityPoolRequired === true &&
      iam.exactlyTwoProvidersRequired === true,
    "Traffic-controller IAM drifted",
  );

  const traffic = contract.trafficControl;
  assert(
    traffic.oneServicePerRun === true &&
      JSON.stringify(traffic.operations) ===
        JSON.stringify(["promote", "rollback"]) &&
      JSON.stringify(traffic.deployableServices) ===
        JSON.stringify(STAGING_TRAFFIC_SERVICES) &&
      traffic.initialActivationAllowed === false &&
      traffic.firstActivationRequiresSeparateApproval === true &&
      traffic.promotionPercent === 100 &&
      traffic.partialTrafficAllowed === false &&
      traffic.latestAliasAllowed === false &&
      traffic.trafficTagsAllowed === false &&
      traffic.rebuildForRollbackAllowed === false &&
      traffic.promotionAuthorization ===
        "AUTHORIZED_STAGING_TRAFFIC_PROMOTION" &&
      traffic.rollbackAuthorization === "AUTHORIZED_STAGING_TRAFFIC_ROLLBACK" &&
      traffic.zeroTrafficManifestRequired === true &&
      traffic.prePromotionVerificationRequired === true &&
      traffic.qaseStagingRunRequired === true &&
      traffic.priorHealthyRevisionRequired === true &&
      traffic.automaticRollbackOnPromotionControlFailure === true &&
      traffic.postRollbackVerificationRequired === true &&
      traffic.retentionDays === 365,
    "Traffic promotion or rollback boundary drifted",
  );

  const verification = contract.verificationEvidence;
  assert(
    verification.status ===
      "two-plane-workflow-implemented-execution-not-authorized" &&
      verification.contract === "deploy/gcp/staging-verification.json" &&
      verification.recorder === "deploy/gcp/record-staging-verification.mjs" &&
      verification.probeContract === "deploy/gcp/staging-revision-probe.json" &&
      verification.probeRecorder ===
        "deploy/gcp/record-staging-revision-probe.mjs" &&
      verification.probeController ===
        "deploy/gcp/run-staging-revision-probe.sh" &&
      verification.probeFederationActivation ===
        "deploy/gcp/activate-staging-revision-probe-federation.sh" &&
      verification.probeFederationAudit ===
        "deploy/gcp/audit-staging-revision-probe-federation.sh" &&
      verification.probeWorkflow ===
        ".github/workflows/staging-verification-probe.yml" &&
      verification.probeProtectedEnvironment === "staging-verification" &&
      verification.probeManifest ===
        "artifacts/staging-release/staging-verification-probe.json" &&
      verification.probeManifestHash ===
        "artifacts/staging-release/staging-verification-probe.sha256" &&
      verification.manifest ===
        "artifacts/staging-release/staging-verification.json" &&
      verification.manifestHash ===
        "artifacts/staging-release/staging-verification.sha256" &&
      verification.probeImplemented === true &&
      verification.executionAuthorized === false &&
      verification.exactCandidateBindingRequired === true &&
      verification.allChecksMustUseDeployedRevision === false &&
      verification.evidenceCoverageRequired === true &&
      JSON.stringify(verification.exactImagePrivateDatabaseChecks) ===
        JSON.stringify([
          "readiness",
          "restart",
          "ledger",
          "reconciliation",
          "audit",
          "failureVisibility",
        ]) &&
      JSON.stringify(verification.exactDeployedRevisionPrivateHttpChecks) ===
        JSON.stringify([
          "serviceAuthentication",
          "deployedRevisionNetworkPath",
        ]) &&
      verification.qaseProject === "SAMP" &&
      verification.qaseEnvironment === "google-cloud-staging" &&
      JSON.stringify(verification.requiredChecks) ===
        JSON.stringify(STAGING_VERIFICATION_CHECKS),
    "Pre-promotion verification contract drifted",
  );

  assert(
    Object.entries(ACTION_PINS).every(
      ([key, value]) => contract.workflow[key] === value,
    ) &&
      JSON.stringify(contract.workflow.permissions) ===
        JSON.stringify({
          contents: "read",
          actions: "read",
          "id-token": "write",
        }) &&
      contract.workflow.automaticTriggers === false &&
      contract.workflow.environmentSeparatedIdentities === true,
    "Traffic workflow security boundary drifted",
  );

  assert(
    JSON.stringify(contract.requiredApis) ===
      JSON.stringify([
        "iamcredentials.googleapis.com",
        "run.googleapis.com",
        "sts.googleapis.com",
      ]),
    "Traffic-controller API set drifted",
  );

  for (const prohibited of [
    "service-account key",
    "stored Google credential secret",
    "non-main controller execution",
    "floating image tag",
    "latest revision alias",
    "partial traffic split",
    "traffic tag",
    "first activation without separate approval",
    "rollback by rebuild",
    "public IAM mutation",
    "runtime template or service IAM mutation",
    "vendor activation",
    "production resource",
    "real customer data",
    "Replit change",
  ]) {
    assert(
      contract.prohibited.includes(prohibited),
      `Missing traffic prohibition: ${prohibited}`,
    );
  }

  assert(
    !/postgres(?:ql)?:\/\/|worf\.replit|12345678|--allow-unauthenticated|versions\/latest|:latest/i.test(
      JSON.stringify(contract),
    ),
    "Traffic contract contains a credential, endpoint, or mutable alias",
  );

  return Object.freeze({
    schemaVersion: contract.schemaVersion,
    status: "validated",
    environment: contract.environment,
    serviceCount: STAGING_TRAFFIC_SERVICES.length,
    operationCount: traffic.operations.length,
    providerCount: 2,
    initialActivationAllowed: false,
    promotionAuthorized: false,
    vendorActivationAuthorized: false,
  });
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  try {
    process.stdout.write(
      `${JSON.stringify(validateStagingTrafficControl())}\n`,
    );
  } catch (error) {
    process.stderr.write(
      `Invalid staging traffic control: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
