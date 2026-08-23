import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  STAGING_IMAGE_NAMES,
  buildStagingImagePublicationManifest,
} from "./record-staging-image-publication.mjs";
import { buildStagingZeroTrafficDeploymentManifest } from "./record-staging-zero-traffic-deployment.mjs";
import {
  buildStagingPromotionManifest,
  buildStagingRollbackManifest,
  validateStagingPromotionManifest,
  validateStagingRollbackManifest,
  validateStagingVerificationManifest,
  verifyPromotionManifest,
  writePromotionManifest,
} from "./record-staging-traffic-control.mjs";
import {
  STAGING_VERIFICATION_CHECKS,
  readStagingTrafficControl,
  validateStagingTrafficControl,
} from "./validate-staging-traffic-control.mjs";

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
  return buildStagingImagePublicationManifest({
    candidateSha,
    gitTreeSha: "e".repeat(40),
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
    imageDigests: Object.fromEntries(
      STAGING_IMAGE_NAMES.map((name) => [name, digest(name)]),
    ),
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

function buildVerification(overrides = {}) {
  return {
    schemaVersion: 1,
    status: "passed",
    environment: "staging",
    dataClassification: "synthetic-only",
    releaseId: `staging-${candidateSha.slice(0, 12)}`,
    candidateSha,
    service,
    revision: candidateRevision,
    checks: Object.fromEntries(
      STAGING_VERIFICATION_CHECKS.map((check) => [check, "passed"]),
    ),
    qase: {
      project: "SAMP",
      environment: "google-cloud-staging",
      runId: "74",
      runUrl: "https://app.qase.io/run/SAMP/dashboard/74",
    },
    customerDataUsed: false,
    secretValuesRecorded: false,
    generatedAt: "2026-08-23T00:20:00.000Z",
    ...overrides,
  };
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
    (value) =>
      (value.googleCloud.rollbackServiceAccountId =
        value.googleCloud.promoterServiceAccountId),
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
  assert.match(controller, /first activation/i);
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
