import { readFileSync } from "node:fs";

const IMAGE_NAMES = [
  "samra-api",
  "samra-customer-web",
  "samra-operations-web",
  "samra-design-system-preview",
  "samra-migrations",
];

const DELIVERY_STAGES = [
  "release-candidate",
  "image-publication",
  "zero-traffic-deployment",
  "staging-verification",
  "traffic-promotion",
  "rollback",
];

export function readStagingReleaseControlPlane() {
  return JSON.parse(
    readFileSync(
      new URL("./staging-release-control-plane.json", import.meta.url),
      "utf8",
    ),
  );
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function validateStagingReleaseControlPlane(
  contract = readStagingReleaseControlPlane(),
) {
  assert(contract.schemaVersion === 1, "Unsupported release-control schema");
  assert(
    contract.status === "prepared-not-authorized" &&
      contract.environment === "staging" &&
      contract.dataClassification === "synthetic-only",
    "Release control must remain non-authorized synthetic staging",
  );

  assert(
    JSON.stringify(contract.source) ===
      JSON.stringify({
        repository: "samra-pay/Samra-Pay",
        repositoryId: "1335175962",
        repositoryOwnerId: "320532147",
        branch: "main",
        exactCommitRequired: true,
        releaseCandidateEvidenceRequired: true,
      }),
    "Source authority drifted",
  );

  assert(
    JSON.stringify(contract.upstreamArtifactVerification) ===
      JSON.stringify({
        verifier: "deploy/gcp/verify-github-upstream-artifact.mjs",
        beforeCloudAuthentication: true,
        exactRepositoryAndNumericIdentityRequired: true,
        exactWorkflowPathAndRefRequired: true,
        workflowDispatchAndSuccessfulConclusionRequired: true,
        exactCandidateShaRunAndAttemptRequired: true,
        exactNonExpiredArtifactAndDigestRequired: true,
        operatorSelectedProducerAllowed: false,
        protectedConsumers: [
          ".github/workflows/staging-zero-traffic-deployment.yml",
          ".github/workflows/staging-image-verification.yml",
          ".github/workflows/staging-verification-probe.yml",
          ".github/workflows/staging-traffic-control.yml",
        ],
        apiMigrationProducerStatus:
          "implemented-execution-and-federation-not-authorized",
      }),
    "Upstream GitHub run and artifact verification boundary drifted",
  );

  const publication = contract.artifactPublication;
  assert(
    publication.workflow ===
      ".github/workflows/staging-image-publication.yml" &&
      publication.protectedEnvironment === "staging-image-publication" &&
      publication.keylessFederationRequired === true &&
      publication.manifestSchemaVersion === 3 &&
      publication.releaseCandidateWorkflow ===
        ".github/workflows/release-candidate.yml" &&
      publication.releaseCandidateRunIdRequired === true &&
      publication.releaseCandidateRunAttemptRequired === true &&
      publication.releaseCandidateEvidenceManifest ===
        "artifacts/release-candidate/release-evidence-manifest.json" &&
      JSON.stringify(publication.releaseCandidateRecoveryEvidence) ===
        JSON.stringify([
          "artifacts/api-server/test-results/weekly-backup-restore.xml",
          "artifacts/api-server/test-results/weekly-backup-restore.json",
        ]) &&
      publication.releaseEvidenceVerifiedBeforeCloudAuthentication === true &&
      publication.exactArtifactNameRequired === true &&
      publication.wildcardArtifactDownloadAllowed === false &&
      publication.cloudBuildLineageSubstitutionsRequired === true &&
      publication.fullShaTagRequired === true &&
      publication.immutableDigestRequired === true &&
      publication.publishedDigestSecurityRequired === true &&
      publication.securityGateScope === "exact-published-digests" &&
      publication.securityScannerAction ===
        "aquasecurity/setup-trivy@3fb12ec12f41e471780db15c232d5dd185dcb514" &&
      publication.securityScannerVersion === "0.70.0" &&
      JSON.stringify(publication.securityPolicies) ===
        JSON.stringify({
          vulnerabilities: {
            scanner: "vuln",
            severities: ["CRITICAL"],
            ignoreUnfixed: true,
          },
          secrets: {
            scanner: "secret",
            severities: ["HIGH", "CRITICAL"],
            ignoreUnfixed: false,
          },
        }) &&
      JSON.stringify(publication.imageNames) === JSON.stringify(IMAGE_NAMES) &&
      publication.evidenceManifest ===
        "artifacts/staging-release/staging-image-publication.json" &&
      publication.evidenceManifestHash ===
        "artifacts/staging-release/staging-image-publication.sha256" &&
      publication.retentionDays === 365,
    "Image publication evidence boundary drifted",
  );

  assert(
    JSON.stringify(contract.deliveryStages.map(({ id }) => id)) ===
      JSON.stringify(DELIVERY_STAGES),
    "Delivery stage order drifted",
  );
  assert(
    contract.deliveryStages.every(
      (stage) =>
        typeof stage.mutation === "string" &&
        stage.requiredEvidence.length >= 3,
    ),
    "Every delivery stage requires explicit mutation and evidence",
  );

  assert(
    contract.deployment.automatic === false &&
      contract.deployment.initialTrafficPercent === 0 &&
      contract.deployment.floatingImageAllowed === false &&
      contract.deployment.defaultServiceUrlAllowed === false &&
      contract.deployment.publicUnauthenticatedAllowed === false &&
      JSON.stringify(contract.deployment.deployableServices) ===
        JSON.stringify(["samra-design-system-preview"]) &&
      Object.keys(contract.deployment.blockedServices).length === 3 &&
      contract.deployment.blockedServices["samra-api"].length === 1 &&
      contract.deployment.blockedServices["samra-customer-web"].length === 1 &&
      contract.deployment.blockedServices["samra-operations-web"].length ===
        3 &&
      contract.deployment.workflow ===
        ".github/workflows/staging-zero-traffic-deployment.yml" &&
      contract.deployment.protectedEnvironment ===
        "staging-zero-traffic-deployment" &&
      contract.deployment.controller ===
        "deploy/gcp/deploy-staging-zero-traffic.sh" &&
      contract.deployment.evidenceManifest ===
        "artifacts/staging-release/staging-zero-traffic-deployment.json" &&
      contract.deployment.evidenceManifestHash ===
        "artifacts/staging-release/staging-zero-traffic-deployment.sha256" &&
      contract.deployment.status ===
        "partial-design-lane-implemented-runtime-lanes-blocked-not-authorized" &&
      contract.deployment.sameCandidatePrerequisitesRequired === true &&
      contract.deployment.dedicatedFederatedIdentityRequired === true,
    "Zero-traffic deployment boundary drifted",
  );

  assert(
    contract.verification.status ===
      "two-plane-workflow-implemented-execution-not-authorized" &&
      contract.verification.contract ===
        "deploy/gcp/staging-verification.json" &&
      contract.verification.recorder ===
        "deploy/gcp/record-staging-verification.mjs" &&
      contract.verification.imageVerificationContract ===
        "deploy/gcp/staging-image-verification.json" &&
      contract.verification.imageVerificationRecorder ===
        "deploy/gcp/record-staging-image-verification.mjs" &&
      contract.verification.imageWorkflow ===
        ".github/workflows/staging-image-verification.yml" &&
      contract.verification.imageProtectedEnvironment ===
        "staging-image-verification" &&
      contract.verification.imageController ===
        "deploy/gcp/run-staging-image-verification.sh" &&
      contract.verification.imageFederationActivation ===
        "deploy/gcp/activate-staging-image-verification-federation.sh" &&
      contract.verification.imageFederationAudit ===
        "deploy/gcp/audit-staging-image-verification-federation.sh" &&
      contract.verification.imageRunnerImplemented === true &&
      contract.verification.imageWorkflowImplemented === true &&
      contract.verification.imageDedicatedFederatedIdentityRequired === true &&
      contract.verification.imageDedicatedRuntimeIdentityRequired === true &&
      contract.verification.imageRestrictedLogViewRequired === true &&
      contract.verification.imageExecutionAuthorized === false &&
      contract.verification.imageEvidencePromotionEligible === false &&
      contract.verification.probeWorkflow ===
        ".github/workflows/staging-verification-probe.yml" &&
      contract.verification.probeProtectedEnvironment ===
        "staging-verification" &&
      contract.verification.probeContract ===
        "deploy/gcp/staging-revision-probe.json" &&
      contract.verification.probeRecorder ===
        "deploy/gcp/record-staging-revision-probe.mjs" &&
      contract.verification.probeController ===
        "deploy/gcp/run-staging-revision-probe.sh" &&
      contract.verification.probeFederationActivation ===
        "deploy/gcp/activate-staging-revision-probe-federation.sh" &&
      contract.verification.probeFederationAudit ===
        "deploy/gcp/audit-staging-revision-probe-federation.sh" &&
      contract.verification.probeImplemented === true &&
      contract.verification.executionAuthorized === false &&
      contract.verification.probeManifest ===
        "artifacts/staging-release/staging-verification-probe.json" &&
      contract.verification.probeManifestHash ===
        "artifacts/staging-release/staging-verification-probe.sha256" &&
      contract.verification.manifest ===
        "artifacts/staging-release/staging-verification.json" &&
      contract.verification.manifestHash ===
        "artifacts/staging-release/staging-verification.sha256" &&
      contract.verification.exactRevisionRequired === true &&
      contract.verification.exactCandidateBindingRequired === true &&
      contract.verification.allChecksMustUseDeployedRevision === false &&
      contract.verification.evidenceCoverageRequired === true &&
      JSON.stringify(contract.verification.exactImagePrivateDatabaseChecks) ===
        JSON.stringify([
          "readiness",
          "restart",
          "ledger",
          "reconciliation",
          "audit",
          "failureVisibility",
        ]) &&
      JSON.stringify(
        contract.verification.exactDeployedRevisionPrivateHttpChecks,
      ) ===
        JSON.stringify([
          "serviceAuthentication",
          "deployedRevisionNetworkPath",
        ]) &&
      contract.verification.qaseProject === "SAMP" &&
      contract.verification.qaseEnvironment === "google-cloud-staging",
    "Staging verification evidence boundary drifted",
  );

  assert(
    contract.promotion.automatic === false &&
      contract.promotion.status === "implemented-not-authorized" &&
      contract.promotion.workflow ===
        ".github/workflows/staging-traffic-control.yml" &&
      contract.promotion.protectedEnvironment === "staging-traffic-promotion" &&
      contract.promotion.controller ===
        "deploy/gcp/control-staging-traffic.sh" &&
      contract.promotion.evidenceManifest ===
        "artifacts/staging-release/staging-traffic-promotion.json" &&
      contract.promotion.evidenceManifestHash ===
        "artifacts/staging-release/staging-traffic-promotion.sha256" &&
      contract.promotion.exactRevisionRequired === true &&
      contract.promotion.healthAndQaseEvidenceRequired === true &&
      contract.promotion.trafficSnapshotRequired === true &&
      contract.promotion.rollbackTargetRequired === true &&
      contract.promotion.latestAliasAllowed === false &&
      contract.promotion.firstActivationAllowed === false &&
      contract.promotion.dedicatedFederatedIdentityRequired === true &&
      contract.promotion.failedPromotionAutomaticRollback === true &&
      contract.promotion.automaticRollbackStatus ===
        "implemented-not-executed" &&
      contract.promotion.automaticRollbackFailClosed === true &&
      contract.promotion.automaticRollbackRecorder ===
        "deploy/gcp/record-staging-automatic-rollback.mjs" &&
      contract.promotion.automaticRollbackEvidenceManifest ===
        "artifacts/staging-release/staging-traffic-automatic-rollback.json" &&
      contract.promotion.automaticRollbackEvidenceManifestHash ===
        "artifacts/staging-release/staging-traffic-automatic-rollback.sha256" &&
      contract.promotion.automaticRollbackVerificationManifest ===
        "artifacts/staging-release/staging-automatic-rollback-verification.json" &&
      contract.promotion.automaticRollbackVerificationManifestHash ===
        "artifacts/staging-release/staging-automatic-rollback-verification.sha256" &&
      contract.promotion.automaticRollbackEvidenceUploadOnFailure === true &&
      contract.promotion.automaticRollbackApplicationVerification ===
        "not-executed" &&
      contract.promotion.automaticRollbackLedgerVerification ===
        "not-executed" &&
      contract.promotion.automaticRollbackReconciliationVerification ===
        "not-executed" &&
      contract.promotion.automaticRollbackFullRecoveryClaimed === false,
    "Traffic promotion must remain manual and exact-revision bound",
  );
  assert(
    contract.rollback.automatic === false &&
      contract.rollback.status === "implemented-not-authorized" &&
      contract.rollback.workflow ===
        ".github/workflows/staging-traffic-control.yml" &&
      contract.rollback.protectedEnvironment === "staging-traffic-rollback" &&
      contract.rollback.controller ===
        "deploy/gcp/control-staging-traffic.sh" &&
      contract.rollback.evidenceManifest ===
        "artifacts/staging-release/staging-traffic-rollback.json" &&
      contract.rollback.evidenceManifestHash ===
        "artifacts/staging-release/staging-traffic-rollback.sha256" &&
      contract.rollback.method ===
        "route 100 percent to the recorded prior revision" &&
      contract.rollback.rebuildAllowed === false &&
      contract.rollback.floatingAliasAllowed === false &&
      contract.rollback.priorRevisionEvidenceRequired === true &&
      contract.rollback.postRollbackVerificationRequired === true &&
      contract.rollback.postRollbackVerificationStatus ===
        "infrastructure-implemented-application-pending" &&
      contract.rollback.postRollbackVerificationScope ===
        "post-rollback-infrastructure-only" &&
      contract.rollback.postRollbackVerificationRecorder ===
        "deploy/gcp/record-staging-rollback-verification.mjs" &&
      contract.rollback.postRollbackVerificationManifest ===
        "artifacts/staging-release/staging-rollback-verification.json" &&
      contract.rollback.postRollbackVerificationManifestHash ===
        "artifacts/staging-release/staging-rollback-verification.sha256" &&
      contract.rollback.postRollbackFullRecoveryClaimed === false &&
      contract.rollback.dedicatedFederatedIdentityRequired === true,
    "Rollback must reuse a recorded immutable revision",
  );

  for (const field of [
    "candidateSha",
    "controllerSha",
    "githubWorkflowRunId",
    "releaseCandidateWorkflowRunId",
    "releaseCandidateWorkflowRunAttempt",
    "releaseCandidateEvidenceManifestSha256",
    "cloudBuildId",
    "imageDigests",
    "publishedDigestSecurity",
    "cloudRunRevisionNames",
    "migrationExecutionId",
    "configurationHashes",
    "qaseRunId",
    "zeroTrafficDeploymentManifestSha256",
    "imageVerificationManifestSha256",
    "probeManifestSha256",
    "verificationManifestSha256",
    "promotionManifestSha256",
    "automaticRollbackManifestSha256",
    "automaticRollbackVerificationManifestSha256",
    "automaticRollbackFailureStage",
    "trafficBefore",
    "trafficAfter",
    "restoredRevision",
    "rollbackReason",
    "postRollbackVerificationStatus",
    "postRollbackVerificationManifestSha256",
    "operator",
    "approver",
  ]) {
    assert(
      contract.traceability.requiredFields.includes(field),
      `Missing deployment traceability field: ${field}`,
    );
  }
  assert(
    contract.traceability.secretValuesAllowed === false &&
      contract.traceability.customerDataAllowed === false &&
      contract.traceability.retentionDays === 365,
    "Deployment evidence must remain secretless and durable",
  );

  assert(
    JSON.stringify(Object.keys(contract.vendorGates)) ===
      JSON.stringify(["auth0", "persona", "crossmint"]),
    "Vendor gate set drifted",
  );
  for (const prohibited of [
    "deployment from a non-main commit",
    "service-account key",
    "floating image tag",
    "latest secret version",
    "automatic migration",
    "public unauthenticated service",
    "unrecorded traffic promotion",
    "rollback by rebuild",
    "real customer PII",
    "real wallet or funds movement",
    "Replit deployment mutation",
  ]) {
    assert(
      contract.prohibited.includes(prohibited),
      `Missing release prohibition: ${prohibited}`,
    );
  }

  const source = JSON.stringify(contract);
  assert(
    !/postgres(?:ql)?:\/\/|worf\.replit|12345678|--allow-unauthenticated|versions\/latest/i.test(
      source,
    ),
    "Release control contains a credential, endpoint, or unsafe flag",
  );

  return Object.freeze({
    schemaVersion: contract.schemaVersion,
    status: "validated",
    environment: contract.environment,
    deliveryStageCount: DELIVERY_STAGES.length,
    imageCount: IMAGE_NAMES.length,
    deployableServiceCount: contract.deployment.deployableServices.length,
    operationsPortalBlocked: true,
    deploymentAuthorized: false,
    verificationRecorderImplemented: true,
    verificationImageRunnerImplemented: true,
    verificationImageWorkflowImplemented: true,
    verificationProbeImplemented: true,
    verificationAuthorized: false,
    promotionAuthorized: false,
  });
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  try {
    process.stdout.write(
      `${JSON.stringify(validateStagingReleaseControlPlane())}\n`,
    );
  } catch (error) {
    process.stderr.write(
      `Invalid staging release control plane: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
