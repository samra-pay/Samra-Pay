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
        repository: "haileleuld87/Samra-Pay",
        repositoryId: "1335175962",
        repositoryOwnerId: "237485986",
        branch: "main",
        exactCommitRequired: true,
        releaseCandidateEvidenceRequired: true,
      }),
    "Source authority drifted",
  );

  const publication = contract.artifactPublication;
  assert(
    publication.workflow ===
      ".github/workflows/staging-image-publication.yml" &&
      publication.protectedEnvironment === "staging-image-publication" &&
      publication.keylessFederationRequired === true &&
      publication.fullShaTagRequired === true &&
      publication.immutableDigestRequired === true &&
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
        JSON.stringify([
          "samra-api",
          "samra-customer-web",
          "samra-design-system-preview",
        ]) &&
      Object.keys(contract.deployment.blockedServices).length === 1 &&
      contract.deployment.blockedServices["samra-operations-web"].length ===
        3 &&
      contract.deployment.dedicatedFederatedIdentityRequired === true,
    "Zero-traffic deployment boundary drifted",
  );

  assert(
    contract.promotion.automatic === false &&
      contract.promotion.exactRevisionRequired === true &&
      contract.promotion.healthAndQaseEvidenceRequired === true &&
      contract.promotion.trafficSnapshotRequired === true &&
      contract.promotion.rollbackTargetRequired === true &&
      contract.promotion.latestAliasAllowed === false,
    "Traffic promotion must remain manual and exact-revision bound",
  );
  assert(
    contract.rollback.automatic === false &&
      contract.rollback.method ===
        "route 100 percent to the recorded prior revision" &&
      contract.rollback.rebuildAllowed === false &&
      contract.rollback.floatingAliasAllowed === false &&
      contract.rollback.priorRevisionEvidenceRequired === true &&
      contract.rollback.postRollbackVerificationRequired === true,
    "Rollback must reuse a recorded immutable revision",
  );

  for (const field of [
    "candidateSha",
    "githubWorkflowRunId",
    "cloudBuildId",
    "imageDigests",
    "cloudRunRevisionNames",
    "migrationExecutionId",
    "configurationHashes",
    "qaseRunId",
    "trafficBefore",
    "trafficAfter",
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
