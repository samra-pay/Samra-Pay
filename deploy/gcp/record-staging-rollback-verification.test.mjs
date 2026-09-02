import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  buildStagingRollbackVerificationManifest,
  validateRollbackVerificationAgainstRollback,
  validateStagingRollbackVerificationManifest,
  verifyExactRollbackEvidence,
  verifyRollbackVerificationManifest,
  writeRollbackVerificationManifest,
} from "./record-staging-rollback-verification.mjs";
import { writeRollbackManifest } from "./record-staging-traffic-control.mjs";

const candidateSha = "a".repeat(40);
const controllerSha = "b".repeat(40);
const rollbackManifestSha256 = "c".repeat(64);
const failedRevision = `samra-api-${candidateSha.slice(0, 12)}`;
const restoredRevision = "samra-api-111111111111";
const githubRunId = "32620000002";
const githubRunAttempt = 2;
const githubActor = "haileleuld87";
const controllerIdentity =
  "samra-github-rollback-staging@samra-pay-staging.iam.gserviceaccount.com";
const imageDigest = `us-east4-docker.pkg.dev/samra-pay-staging/samra-staging/samra-api@sha256:${"d".repeat(64)}`;

function buildRollback() {
  return {
    schemaVersion: 1,
    status: "rolled-back-pending-post-verification",
    environment: "staging",
    dataClassification: "synthetic-only",
    releaseId: `staging-${candidateSha.slice(0, 12)}`,
    candidateSha,
    controllerSha,
    sourceRepository: "haileleuld87/Samra-Pay",
    projectId: "samra-pay-staging",
    projectNumber: "934122615631",
    region: "us-east4",
    service: "samra-api",
    failedRevision,
    restoredRevision,
    promotionManifestSha256: "e".repeat(64),
    reason: "Synthetic staging reconciliation check regressed.",
    trafficBefore: [{ revision: failedRevision, percent: 100, tag: null }],
    trafficAfter: [{ revision: restoredRevision, percent: 100, tag: null }],
    github: {
      repository: "haileleuld87/Samra-Pay",
      ref: "refs/heads/main",
      eventName: "workflow_dispatch",
      workflow: "Staging traffic control",
      workflowPath: ".github/workflows/staging-traffic-control.yml",
      protectedEnvironment: "staging-traffic-rollback",
      runId: githubRunId,
      runAttempt: githubRunAttempt,
      runUrl: `https://github.com/haileleuld87/Samra-Pay/actions/runs/${githubRunId}`,
      actor: githubActor,
    },
    operatorIdentity: controllerIdentity,
    rollbackAuthorized: true,
    rebuildExecuted: false,
    postRollbackVerificationRequired: true,
    postRollbackVerificationStatus: "pending",
    vendorActivationAuthorized: false,
    generatedAt: "2026-08-23T00:40:00.000Z",
  };
}

function buildObservedInfrastructure(overrides = {}) {
  return {
    projectId: "samra-pay-staging",
    region: "us-east4",
    service: "samra-api",
    restoredRevision,
    traffic: [{ revision: restoredRevision, percent: 100, tag: null }],
    revisionReady: true,
    imageDigest,
    ingress: "internal-and-cloud-load-balancing",
    defaultServiceUrlDisabled: true,
    publicIamAbsent: true,
    ...overrides,
  };
}

function buildVerification(
  rollback = buildRollback(),
  manifestSha256 = rollbackManifestSha256,
) {
  return buildStagingRollbackVerificationManifest({
    rollback,
    rollbackManifestSha256: manifestSha256,
    observedInfrastructure: buildObservedInfrastructure(),
    controllerSha,
    controllerIdentity,
    githubRunId,
    githubRunAttempt,
    githubActor,
    generatedAt: "2026-08-23T00:41:00.000Z",
  });
}

function rollbackIdentity(manifestSha256) {
  return {
    manifestSha256,
    githubRunId,
    githubRunAttempt,
    controllerSha,
    githubActor,
  };
}

async function writeRollbackEvidence(root) {
  const manifestPath = join(root, "staging-traffic-rollback.json");
  const hashPath = join(root, "staging-traffic-rollback.sha256");
  const manifestSha256 = await writeRollbackManifest(
    buildRollback(),
    manifestPath,
    hashPath,
  );
  return { manifestPath, hashPath, manifestSha256 };
}

test("records only immutable private infrastructure restoration facts", () => {
  const manifest = buildVerification();
  assert.equal(manifest.status, "infrastructure-verified-application-pending");
  assert.equal(manifest.scope, "post-rollback-infrastructure-only");
  assert.equal(manifest.infrastructure.restoredRevision, restoredRevision);
  assert.equal(manifest.infrastructure.traffic[0].percent, 100);
  assert.equal(manifest.infrastructure.imageDigest, imageDigest);
  assert.equal(manifest.verificationMode, "read-only");
  assert.deepEqual(
    new Set(Object.values(manifest.mutations)),
    new Set(["not-executed"]),
  );
  assert.deepEqual(
    new Set(Object.values(manifest.applicationVerification)),
    new Set(["not-executed"]),
  );
  assert.equal(manifest.fullRecoveryClaimed, false);
  assert.equal(validateStagingRollbackVerificationManifest(manifest), manifest);
  assert.equal(
    validateRollbackVerificationAgainstRollback(
      manifest,
      buildRollback(),
      rollbackManifestSha256,
    ),
    manifest,
  );
});

test("cryptographically binds the exact rollback bytes, sidecar filename, and controller run", async () => {
  const root = await mkdtemp(join(tmpdir(), "samra-rollback-input-"));
  const evidence = await writeRollbackEvidence(root);
  const expected = rollbackIdentity(evidence.manifestSha256);
  const verified = await verifyExactRollbackEvidence(
    evidence.manifestPath,
    evidence.hashPath,
    expected,
  );
  assert.equal(verified.manifest.restoredRevision, restoredRevision);
  assert.equal(verified.manifestSha256, evidence.manifestSha256);

  const validSidecar = await readFile(evidence.hashPath, "utf8");
  await writeFile(
    evidence.hashPath,
    validSidecar.replace("staging-traffic-rollback.json", "other.json"),
    "utf8",
  );
  await assert.rejects(
    verifyExactRollbackEvidence(
      evidence.manifestPath,
      evidence.hashPath,
      expected,
    ),
    /exact manifest bytes and filename/,
  );

  await writeFile(evidence.hashPath, validSidecar, "utf8");
  const validManifest = await readFile(evidence.manifestPath, "utf8");
  await writeFile(evidence.manifestPath, `${validManifest}\n`, "utf8");
  await assert.rejects(
    verifyExactRollbackEvidence(
      evidence.manifestPath,
      evidence.hashPath,
      expected,
    ),
    /exact manifest bytes and filename/,
  );
});

test("rejects altered hashes and cross-run rollback identities", async () => {
  const root = await mkdtemp(join(tmpdir(), "samra-rollback-identity-"));
  const evidence = await writeRollbackEvidence(root);
  const expected = rollbackIdentity(evidence.manifestSha256);
  for (const mutate of [
    (value) => (value.manifestSha256 = "f".repeat(64)),
    (value) => (value.githubRunId = "32620000999"),
    (value) => (value.githubRunAttempt = 3),
    (value) => (value.controllerSha = "f".repeat(40)),
    (value) => (value.githubActor = "different-actor"),
  ]) {
    const changed = structuredClone(expected);
    mutate(changed);
    await assert.rejects(
      verifyExactRollbackEvidence(
        evidence.manifestPath,
        evidence.hashPath,
        changed,
      ),
    );
  }
});

test("writes append-only verification evidence and verifies the complete hash chain", async () => {
  const root = await mkdtemp(join(tmpdir(), "samra-rollback-output-"));
  const rollback = await writeRollbackEvidence(root);
  const exactRollback = await verifyExactRollbackEvidence(
    rollback.manifestPath,
    rollback.hashPath,
    rollbackIdentity(rollback.manifestSha256),
  );
  const manifest = buildVerification(
    exactRollback.manifest,
    exactRollback.manifestSha256,
  );
  const manifestPath = join(root, "staging-rollback-verification.json");
  const hashPath = join(root, "staging-rollback-verification.sha256");
  const writtenHash = await writeRollbackVerificationManifest(
    manifest,
    manifestPath,
    hashPath,
  );
  assert.match(writtenHash, /^[0-9a-f]{64}$/);
  const verified = await verifyRollbackVerificationManifest(
    manifestPath,
    hashPath,
    rollback.manifestPath,
    rollback.hashPath,
    rollbackIdentity(rollback.manifestSha256),
  );
  assert.equal(
    verified.manifest.status,
    "infrastructure-verified-application-pending",
  );
  await assert.rejects(
    writeRollbackVerificationManifest(manifest, manifestPath, hashPath),
    (error) => error?.code === "EEXIST",
  );

  const serialized = await readFile(manifestPath, "utf8");
  await writeFile(
    manifestPath,
    serialized.replace("read-only", "write-enabled"),
    "utf8",
  );
  await assert.rejects(
    verifyRollbackVerificationManifest(
      manifestPath,
      hashPath,
      rollback.manifestPath,
      rollback.hashPath,
      rollbackIdentity(rollback.manifestSha256),
    ),
    /exact manifest bytes and filename/,
  );
});

test("mutation tests reject mutable, public, mutating, unsafe, or overclaiming evidence", () => {
  const rollback = buildRollback();
  const valid = buildVerification(rollback);
  for (const mutate of [
    (value) => (value.status = "recovery-verified"),
    (value) => (value.scope = "full-application-recovery"),
    (value) => (value.appendOnly = false),
    (value) => (value.environment = "production"),
    (value) => (value.projectId = "other-project"),
    (value) => (value.restoredRevision = "samra-api-222222222222"),
    (value) => (value.rollbackEvidence.manifestSha256 = "f".repeat(64)),
    (value) => (value.rollbackEvidence.githubRunId = "32620000999"),
    (value) => (value.rollbackEvidence.githubRunAttempt = 3),
    (value) => (value.rollbackEvidence.controllerSha = "f".repeat(40)),
    (value) => (value.infrastructure.traffic[0].percent = 99),
    (value) => (value.infrastructure.traffic[0].tag = "latest"),
    (value) =>
      value.infrastructure.traffic.push({
        revision: failedRevision,
        percent: 1,
        tag: null,
      }),
    (value) => (value.infrastructure.revisionReady = false),
    (value) =>
      (value.infrastructure.imageDigest =
        "us-east4-docker.pkg.dev/samra-pay-staging/samra-staging/samra-api:latest"),
    (value) =>
      (value.infrastructure.imageDigest = `us-east4-docker.pkg.dev/samra-pay-staging/samra-staging/samra-customer-web@sha256:${"d".repeat(64)}`),
    (value) => (value.infrastructure.ingress = "all"),
    (value) => (value.infrastructure.defaultServiceUrlDisabled = false),
    (value) => (value.infrastructure.publicIamAbsent = false),
    (value) => (value.applicationVerification.status = "passed"),
    (value) => (value.applicationVerification.applicationProbe = "passed"),
    (value) => (value.applicationVerification.ledgerInvariantCheck = "passed"),
    (value) => (value.applicationVerification.reconciliationCheck = "passed"),
    (value) => (value.github.workflowPath = ".github/workflows/other.yml"),
    (value) => (value.github.runAttempt = 3),
    (value) => (value.controllerSha = "f".repeat(40)),
    (value) => (value.controllerIdentity = "shared@example.com"),
    (value) => (value.verificationMode = "read-write"),
    (value) => (value.mutations.rebuild = "executed"),
    (value) => (value.mutations.deployment = "executed"),
    (value) => (value.mutations.traffic = "executed"),
    (value) => (value.mutations.configuration = "executed"),
    (value) => (value.fullRecoveryClaimed = true),
    (value) => (value.generatedAt = "2026-08-23T00:39:00.000Z"),
    (value) => (value.github.actor = "Authorization: Bearer secret"),
    (value) => (value.unreviewedClaim = true),
    (value) => (value.infrastructure.latestRevision = true),
  ]) {
    const changed = structuredClone(valid);
    mutate(changed);
    assert.throws(() =>
      validateRollbackVerificationAgainstRollback(
        changed,
        rollback,
        rollbackManifestSha256,
      ),
    );
  }
});

test("builder rejects unsafe observations and mismatched controller context", () => {
  const base = {
    rollback: buildRollback(),
    rollbackManifestSha256,
    observedInfrastructure: buildObservedInfrastructure(),
    controllerSha,
    controllerIdentity,
    githubRunId,
    githubRunAttempt,
    githubActor,
    generatedAt: "2026-08-23T00:41:00.000Z",
  };
  for (const mutate of [
    (value) => (value.githubRunId = "32620000999"),
    (value) => (value.githubRunAttempt = 3),
    (value) => (value.controllerSha = "f".repeat(40)),
    (value) => (value.controllerIdentity = "shared@example.com"),
    (value) => (value.githubActor = "different-actor"),
    (value) =>
      (value.observedInfrastructure.imageDigest =
        "us-east4-docker.pkg.dev/samra-pay-staging/samra-staging/samra-api:latest"),
    (value) => (value.observedInfrastructure.publicIamAbsent = false),
    (value) => (value.observedInfrastructure.secret = "password=unsafe"),
  ]) {
    const changed = structuredClone(base);
    mutate(changed);
    assert.throws(() => buildStagingRollbackVerificationManifest(changed));
  }
});
