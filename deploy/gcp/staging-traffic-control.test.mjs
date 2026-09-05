import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  STAGING_IMAGE_NAMES,
  buildStagingImagePublicationManifest,
} from "./record-staging-image-publication.mjs";
import { buildStagingImageVerificationManifest } from "./record-staging-image-verification.mjs";
import { buildStagingRevisionProbeManifest } from "./record-staging-revision-probe.mjs";
import { buildStagingZeroTrafficDeploymentManifest } from "./record-staging-zero-traffic-deployment.mjs";
import {
  buildStagingPromotionManifest,
  buildStagingRollbackManifest,
  validateStagingPromotionManifest,
  validateStagingRollbackManifest,
  verifyPromotionManifest,
  writePromotionManifest,
} from "./record-staging-traffic-control.mjs";
import {
  buildStagingVerificationManifest,
  validateStagingVerificationManifest,
} from "./record-staging-verification.mjs";
import {
  STAGING_VERIFICATION_CHECKS,
  readStagingTrafficControl,
  validateStagingTrafficControl,
} from "./validate-staging-traffic-control.mjs";
import {
  imageSecurityGate,
  releaseCandidateLineage,
} from "./staging-release-test-fixtures.mjs";
import { validatePromotionUpstreamBinding } from "./verify-github-upstream-artifact.mjs";

const contract = readStagingTrafficControl();
const candidateSha = "a".repeat(40);
const controllerSha = "b".repeat(40);
const service = "samra-api";
const candidateRevision = `${service}-${candidateSha.slice(0, 12)}`;
const priorRevision = "samra-api-111111111111";
const hash = "c".repeat(64);
const digest = (name, value = "d") =>
  `us-east4-docker.pkg.dev/samra-pay-staging/samra-staging/${name}@sha256:${value.repeat(64)}`;

function buildPublication() {
  const gitTreeSha = "e".repeat(40);
  const imageDigests = Object.fromEntries(
    STAGING_IMAGE_NAMES.map((name) => [name, digest(name)]),
  );
  return buildStagingImagePublicationManifest({
    candidateSha,
    gitTreeSha,
    projectId: "samra-pay-staging",
    projectNumber: "934122615631",
    region: "us-east4",
    repository: "samra-staging",
    sourceRepository: "haileleuld87/Samra-Pay",
    cloudBuildId: "0ebc07c2-3e97-4d6c-8ff3-1bbf6229db00",
    publisherIdentity:
      "samra-github-staging@samra-pay-staging.iam.gserviceaccount.com",
    buildServiceAccount:
      "samra-cloud-build-staging@samra-pay-staging.iam.gserviceaccount.com",
    githubRunId: "32608456303",
    githubRunAttempt: "1",
    githubActor: "haileleuld87",
    generatedAt: "2026-08-23T00:00:00.000Z",
    imageDigests,
    securityGate: imageSecurityGate(imageDigests),
    releaseCandidate: releaseCandidateLineage(candidateSha, gitTreeSha),
  });
}

function buildZeroTrafficDeployment() {
  return buildStagingZeroTrafficDeploymentManifest({
    publication: buildPublication(),
    publicationManifestSha256: hash,
    targetService: service,
    revisionName: candidateRevision,
    imageDigest: digest(service),
    deployerIdentity:
      "samra-github-deployer-staging@samra-pay-staging.iam.gserviceaccount.com",
    configurationSha256: "f".repeat(64),
    trafficBefore: [{ revision: priorRevision, percent: 100, tag: null }],
    trafficAfter: [{ revision: priorRevision, percent: 100, tag: null }],
    githubRunId: "32611669347",
    githubRunAttempt: "1",
    githubActor: "haileleuld87",
    generatedAt: "2026-08-23T00:10:00.000Z",
  });
}

function buildImageVerification() {
  return buildStagingImageVerificationManifest({
    zeroTrafficDeployment: buildZeroTrafficDeployment(),
    zeroTrafficDeploymentManifestSha256: hash,
    revision: candidateRevision,
    imageDigest: digest(service),
    revisionAttestation: {
      ready: true,
      exactImageDigest: true,
      privateIngress: true,
      defaultServiceUrlDisabled: true,
      publicIamAbsent: true,
    },
    syntheticRunId: "verify-a1b2c3",
    jobExecutionId: "samra-api-verifier-a1b2c3",
    junitSha256: "2".repeat(64),
    runtimeServiceAccount:
      "samra-verifier-staging@samra-pay-staging.iam.gserviceaccount.com",
    databaseSecretVersion: "7",
    imageChecks: {
      readiness: "passed",
      restart: "passed",
      ledger: "passed",
      reconciliation: "passed",
      audit: "passed",
      failureVisibility: "passed",
    },
    generatedAt: "2026-08-23T00:20:00.000Z",
  });
}

function buildProbe() {
  const result = {
    schemaVersion: 1,
    status: "passed",
    probeId: "svp-32619000001-1",
    unauthenticatedStatus: 403,
    authenticatedHealthStatus: 200,
    authenticatedReadinessStatus: 200,
    healthResponseSha256: "3".repeat(64),
    readinessResponseSha256: "4".repeat(64),
    observedRevision: candidateRevision,
    serviceAuthenticationObserved: true,
    deployedRevisionNetworkPathObserved: true,
    tokenRecorded: false,
  };
  return buildStagingRevisionProbeManifest({
    zeroTrafficDeployment: buildZeroTrafficDeployment(),
    imageVerification: buildImageVerification(),
    zeroTrafficDeploymentManifestSha256: "5".repeat(64),
    imageVerificationManifestSha256: "6".repeat(64),
    revision: candidateRevision,
    imageDigest: digest(service),
    result,
    probeId: result.probeId,
    jobExecutionId: "samra-staging-revision-probe-a1b2c",
    runtimeServiceAccount:
      "samra-revision-probe-staging@samra-pay-staging.iam.gserviceaccount.com",
    resultSha256: "7".repeat(64),
    junitSha256: "8".repeat(64),
    routing: {
      candidateTrafficPercentBefore: 0,
      candidateTrafficPercentDuring: 0,
      candidateTrafficPercentAfter: 0,
      exactRevisionTagTemporarilyApplied: true,
      defaultServiceUrlTemporarilyEnabled: true,
      ingressChanged: false,
      publicAccessChanged: false,
      runtimeTemplateChanged: false,
      boundaryBeforeSha256: "9".repeat(64),
      boundaryAfterSha256: "9".repeat(64),
      tagRemoved: true,
      defaultServiceUrlDisabledAfter: true,
    },
    github: {
      repository: "haileleuld87/Samra-Pay",
      ref: "refs/heads/main",
      eventName: "workflow_dispatch",
      workflow: "Staging verification probe",
      workflowPath: ".github/workflows/staging-verification-probe.yml",
      protectedEnvironment: "staging-verification",
      runId: "32619000001",
      runAttempt: 1,
      runUrl:
        "https://github.com/haileleuld87/Samra-Pay/actions/runs/32619000001",
      actor: "haileleuld87",
    },
    generatedAt: "2026-08-23T00:30:00.000Z",
  });
}

function buildVerification() {
  return buildStagingVerificationManifest({
    zeroTrafficDeployment: buildZeroTrafficDeployment(),
    zeroTrafficDeploymentManifestSha256: hash,
    imageVerification: buildImageVerification(),
    imageVerificationManifestSha256: "a".repeat(64),
    probe: buildProbe(),
    probeManifestSha256: "1".repeat(64),
    controllerSha,
    qase: {
      project: "SAMP",
      environment: "google-cloud-staging",
      policy: "optional",
      reporting: {
        enabled: true,
        outcomes: {
          qase_create: "success",
          qase_upload: "success",
          qase_complete: "success",
        },
      },
      runId: "74",
      runUrl: "https://app.qase.io/run/SAMP/dashboard/74",
      imageJUnitIncluded: true,
      probeJUnitIncluded: true,
    },
    generatedAt: "2026-08-23T00:40:00.000Z",
  });
}

function buildPromotion(overrides = {}) {
  return buildStagingPromotionManifest({
    zeroTrafficDeployment: buildZeroTrafficDeployment(),
    zeroTrafficDeploymentManifestSha256: hash,
    verification: buildVerification(),
    verificationManifestSha256: "1".repeat(64),
    controllerSha,
    priorRevision,
    trafficBefore: [{ revision: priorRevision, percent: 100, tag: null }],
    trafficAfter: [{ revision: candidateRevision, percent: 100, tag: null }],
    operatorIdentity:
      "samra-github-promoter-staging@samra-pay-staging.iam.gserviceaccount.com",
    githubRunId: "32620000001",
    githubRunAttempt: "1",
    githubActor: "haileleuld87",
    generatedAt: "2026-08-23T00:30:00.000Z",
    ...overrides,
  });
}

test("validates the isolated exact-revision traffic authority", () => {
  assert.deepEqual(validateStagingTrafficControl(contract), {
    schemaVersion: 1,
    status: "validated",
    environment: "staging",
    serviceCount: 3,
    operationCount: 2,
    providerCount: 2,
    initialActivationAllowed: false,
    promotionAuthorized: false,
    vendorActivationAuthorized: false,
  });
});

test("rejects first activation, mutable aliases, split traffic, and shared identity drift", () => {
  for (const mutate of [
    (value) => (value.trafficControl.initialActivationAllowed = true),
    (value) => (value.trafficControl.latestAliasAllowed = true),
    (value) => (value.trafficControl.partialTrafficAllowed = true),
    (value) => (value.trafficControl.trafficTagsAllowed = true),
    (value) => (value.trafficControl.rebuildForRollbackAllowed = true),
    (value) => (value.trafficControl.automaticRollbackFailClosed = false),
    (value) =>
      (value.trafficControl.automaticRollbackEvidenceUploadOnFailure = false),
    (value) =>
      (value.trafficControl.automaticRollbackApplicationProbe = "passed"),
    (value) =>
      (value.trafficControl.automaticRollbackFullRecoveryClaimed = true),
    (value) =>
      (value.trafficControl.postRollbackVerificationStatus = "fully-recovered"),
    (value) => (value.trafficControl.postRollbackApplicationProbe = "passed"),
    (value) => (value.trafficControl.postRollbackFullRecoveryClaimed = true),
    (value) =>
      (value.googleCloud.rollbackServiceAccountId =
        value.googleCloud.promoterServiceAccountId),
    (value) => (value.verificationEvidence.probeImplemented = false),
    (value) =>
      (value.verificationEvidence.allChecksMustUseDeployedRevision = true),
    (value) => (value.verificationEvidence.evidenceCoverageRequired = false),
    (value) => (value.workflow.automaticTriggers = true),
  ]) {
    const changed = structuredClone(contract);
    mutate(changed);
    assert.throws(() => validateStagingTrafficControl(changed));
  }
});

test("requires every synthetic verification gate and exact Qase identity", () => {
  const verification = buildVerification();
  assert.equal(validateStagingVerificationManifest(verification), verification);
  for (const mutate of [
    (value) => (value.checks.ledger = "failed"),
    (value) => delete value.checks.restart,
    (value) => (value.qase.project = "OTHER"),
    (value) => (value.customerDataUsed = true),
    (value) => (value.secretValuesRecorded = true),
  ]) {
    const changed = structuredClone(verification);
    mutate(changed);
    assert.throws(() => validateStagingVerificationManifest(changed));
  }
});

test("records promotion from one healthy revision to one verified candidate", () => {
  const promotion = buildPromotion();
  assert.equal(promotion.status, "promoted");
  assert.equal(promotion.candidateRevision, candidateRevision);
  assert.equal(promotion.rollbackTarget.revision, priorRevision);
  assert.equal(promotion.trafficBefore[0].percent, 100);
  assert.equal(promotion.trafficAfter[0].percent, 100);
  assert.equal(promotion.initialActivation, false);
  assert.equal(promotion.vendorActivationAuthorized, false);
  assert.equal(validateStagingPromotionManifest(promotion), promotion);
});

test("binds an older candidate promotion to its independently verified newer controller run", () => {
  const promotion = buildPromotion();
  const upstream = {
    kind: "staging-traffic-promotion",
    candidateSha,
    controllerSha,
    service,
    repository: promotion.github.repository,
    ref: promotion.github.ref,
    event: promotion.github.eventName,
    workflowName: promotion.github.workflow,
    workflowPath: promotion.github.workflowPath,
    runId: promotion.github.runId,
    runAttempt: promotion.github.runAttempt,
    runUrl: promotion.github.runUrl,
  };
  assert.equal(
    validatePromotionUpstreamBinding(promotion, upstream),
    promotion,
  );
  for (const mutation of [
    { candidateSha: "f".repeat(40) },
    { controllerSha: candidateSha },
    { service: "samra-customer-web" },
    { runId: "1" },
    { runAttempt: 2 },
    { workflowPath: ".github/workflows/decoy.yml" },
  ]) {
    assert.throws(
      () =>
        validatePromotionUpstreamBinding(promotion, {
          ...upstream,
          ...mutation,
        }),
      /verified GitHub upstream provenance/,
    );
  }
});

test("rejects first activation, latest aliases, tags, partial splits, and mismatched evidence", () => {
  for (const overrides of [
    { priorRevision: candidateRevision },
    { trafficBefore: [] },
    {
      trafficBefore: [
        { revision: priorRevision, percent: 50, tag: null },
        { revision: "samra-api-222222222222", percent: 50, tag: null },
      ],
    },
    {
      trafficBefore: [
        { revision: priorRevision, percent: 100, tag: "current" },
      ],
    },
    {
      trafficAfter: [
        {
          revision: candidateRevision,
          percent: 100,
          tag: null,
          latestRevision: true,
        },
      ],
    },
    { controllerSha: "not-a-sha" },
    { operatorIdentity: "shared@example.com" },
  ]) {
    assert.throws(() => buildPromotion(overrides));
  }
});

test("records rollback to the immutable prior revision without rebuilding", () => {
  const rollback = buildStagingRollbackManifest({
    promotion: buildPromotion(),
    promotionManifestSha256: "2".repeat(64),
    controllerSha,
    reason: "Synthetic staging reconciliation check regressed.",
    trafficBefore: [{ revision: candidateRevision, percent: 100, tag: null }],
    trafficAfter: [{ revision: priorRevision, percent: 100, tag: null }],
    operatorIdentity:
      "samra-github-rollback-staging@samra-pay-staging.iam.gserviceaccount.com",
    githubRunId: "32620000002",
    githubRunAttempt: "1",
    githubActor: "haileleuld87",
    generatedAt: "2026-08-23T00:40:00.000Z",
  });
  assert.equal(rollback.failedRevision, candidateRevision);
  assert.equal(rollback.restoredRevision, priorRevision);
  assert.equal(rollback.rebuildExecuted, false);
  assert.equal(rollback.postRollbackVerificationStatus, "pending");
  assert.equal(validateStagingRollbackManifest(rollback), rollback);
});

test("writes and independently verifies tamper-evident promotion history", async () => {
  const root = await mkdtemp(join(tmpdir(), "samra-traffic-control-"));
  const manifestPath = join(root, "promotion.json");
  const hashPath = join(root, "promotion.sha256");
  const writtenHash = await writePromotionManifest(
    buildPromotion(),
    manifestPath,
    hashPath,
  );
  assert.match(writtenHash, /^[0-9a-f]{64}$/);
  assert.equal(
    (await verifyPromotionManifest(manifestPath, hashPath)).candidateRevision,
    candidateRevision,
  );
  const serialized = await readFile(manifestPath, "utf8");
  await writeFile(
    manifestPath,
    serialized.replace(candidateRevision, priorRevision),
    "utf8",
  );
  await assert.rejects(
    verifyPromotionManifest(manifestPath, hashPath),
    /hash does not match/,
  );
});

test("workflow and controllers are manual, exact, keyless, and never use latest", () => {
  for (const path of [
    ".github/workflows/staging-traffic-control.yml",
    "deploy/gcp/control-staging-traffic.sh",
    "deploy/gcp/activate-staging-traffic-federation.sh",
    "deploy/gcp/audit-staging-traffic-federation.sh",
  ]) {
    const source = readFileSync(path, "utf8");
    assert.doesNotMatch(source, /allow-unauthenticated|to-latest|:latest/);
  }
  const workflow = readFileSync(
    ".github/workflows/staging-traffic-control.yml",
    "utf8",
  );
  assert.match(workflow, /^name: Staging traffic control$/m);
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /^\s+(push|pull_request|schedule):/m);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /staging-traffic-promotion/);
  assert.match(workflow, /staging-traffic-rollback/);
  assert.match(workflow, /AUTHORIZED_STAGING_TRAFFIC_PROMOTION/);
  assert.match(workflow, /AUTHORIZED_STAGING_TRAFFIC_ROLLBACK/);
  const workflowEnvironment = workflow.slice(
    workflow.indexOf("\nenv:"),
    workflow.indexOf("\njobs:"),
  );
  assert.doesNotMatch(workflowEnvironment, /\$\{\{\s*runner\./);
  assert.match(
    workflow,
    /SAMRA_STAGING_ZERO_TRAFFIC_MANIFEST=%s\\n' "\$\{RUNNER_TEMP\}\/samra-zero-traffic\/staging-zero-traffic-deployment\.json"/,
  );
  assert.match(workflow, /\} >> "\$\{GITHUB_ENV\}"/);
  const controller = readFileSync(
    "deploy/gcp/control-staging-traffic.sh",
    "utf8",
  );
  assert.match(controller, /--to-revisions=/);
  assert.match(controller, /automatic rollback/i);
  const automaticRollbackHandler = controller.slice(
    controller.indexOf("automatic_rollback()"),
    controller.indexOf("trap automatic_rollback ERR"),
  );
  assert.doesNotMatch(automaticRollbackHandler, /\|\| true/);
  assert.match(
    automaticRollbackHandler,
    /record-staging-automatic-rollback\.mjs/,
  );
  assert.match(
    automaticRollbackHandler,
    /write_rollback_observation "\$\{PRIOR_REVISION\}"/,
  );
  assert.match(controller, /first activation/i);
  assert.match(controller, /record-staging-rollback-verification\.mjs/);
  assert.match(controller, /verifyRollbackVerificationManifest/);
  assert.match(
    controller,
    /Post-rollback application, ledger, and reconciliation verification: pending/,
  );
  assert.match(
    workflow,
    /name: Preserve immutable rollback history[\s\S]*?operation == 'rollback' && always\(\)/,
  );
  assert.match(
    workflow,
    /name: Preserve post-rollback infrastructure verification[\s\S]*?staging-rollback-verification\.json[\s\S]*?staging-rollback-verification\.sha256/,
  );
  assert.match(
    workflow,
    /name: Preserve failed-promotion automatic rollback evidence[\s\S]*?always\(\)[\s\S]*?automatic_rollback_attempted == 'true'[\s\S]*?staging-traffic-automatic-rollback\.json[\s\S]*?staging-automatic-rollback-verification\.json/,
  );
  const audit = readFileSync(
    "deploy/gcp/audit-staging-traffic-federation.sh",
    "utf8",
  );
  for (const requiredAudit of [
    "artifacts repositories get-iam-policy",
    "storage buckets get-iam-policy",
    "secrets get-iam-policy",
    "service-accounts get-iam-policy",
    "run jobs get-iam-policy",
  ]) {
    assert.match(audit, new RegExp(requiredAudit));
  }
});

test("post-mutation snapshot and assertion failures invoke automatic rollback", async () => {
  const controller = readFileSync(
    "deploy/gcp/control-staging-traffic.sh",
    "utf8",
  );
  const snapshotAndAssertionFunctions = controller.slice(
    controller.indexOf("write_traffic_snapshot() {"),
    controller.indexOf("assert_revision_ready() {"),
  );
  const promotionPhase = controller.slice(
    controller.indexOf("MUTATION_STARTED=true\n"),
    controller.indexOf("\nelse\n  gcloud run services update-traffic"),
  );
  assert.ok(snapshotAndAssertionFunctions && promotionPhase);
  const directory = await mkdtemp(
    join(tmpdir(), "samra-traffic-failure-test-"),
  );
  for (const failureStage of [
    "post-promotion-snapshot",
    "post-promotion-assertion",
  ]) {
    const result = spawnSync(
      "bash",
      [
        "-c",
        `
      set -euo pipefail
      OPERATION=promote
      TARGET_SERVICE=samra-api
      PROJECT_ID=samra-pay-staging
      REGION=us-east4
      CANDIDATE_REVISION=samra-api-aaaaaaaaaaaa
      automatic_rollback() {
        printf 'ROLLBACK:%s\\n' "$PROMOTION_FAILURE_STAGE"
        exit 71
      }
      gcloud() {
        if [[ "$*" == *update-traffic* ]]; then return 0; fi
        if [[ "$SAMRA_TEST_FAILURE_STAGE" == post-promotion-snapshot ]]; then return 23; fi
        printf '%s\\n' '{"status":{"traffic":[{"revisionName":"samra-api-bbbbbbbbbbbb","percent":100}]}}'
      }
      ${snapshotAndAssertionFunctions}
      trap automatic_rollback ERR
      ${promotionPhase}
      fi
    `,
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          SAMRA_TEST_FAILURE_STAGE: failureStage,
          TRAFFIC_AFTER: join(directory, `${failureStage}.json`),
        },
      },
    );
    assert.equal(result.status, 71, result.stderr);
    assert.equal(result.stdout.trim(), `ROLLBACK:${failureStage}`);
  }
});

test("preserves optional reporting through promotion without relaxing checks or rollback evidence", () => {
  const verification = structuredClone(buildVerification());
  verification.qase = {
    project: "SAMP",
    environment: "google-cloud-staging",
    policy: "optional",
    reporting: {
      enabled: false,
      outcomes: {
        qase_create: "skipped",
        qase_upload: "skipped",
        qase_complete: "skipped",
      },
    },
    runId: null,
    runUrl: null,
    imageJUnitIncluded: false,
    probeJUnitIncluded: false,
  };
  const promotion = buildPromotion({ verification });
  assert.equal(promotion.verification.qaseRunId, null);
  assert.equal(validateStagingPromotionManifest(promotion), promotion);
  const changed = structuredClone(promotion);
  changed.verification.checks.ledger = "failed";
  assert.throws(() => validateStagingPromotionManifest(changed));
  const legacy = structuredClone(buildPromotion());
  delete legacy.verification.qaseReporting;
  assert.equal(validateStagingPromotionManifest(legacy), legacy);
  legacy.verification.qaseRunId = null;
  assert.throws(
    () => validateStagingPromotionManifest(legacy),
    /Legacy promotion Qase identity/,
  );
});
