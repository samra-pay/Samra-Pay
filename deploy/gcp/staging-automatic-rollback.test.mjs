import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildStagingAutomaticRollbackManifest,
  buildStagingAutomaticRollbackVerificationManifest,
  normalizeControllerTrafficSnapshot,
  validateAutomaticRollbackVerificationAgainstEvent,
  validateStagingAutomaticRollbackManifest,
  validateStagingAutomaticRollbackVerificationManifest,
  verifyAutomaticRollbackEvidence,
  writeAutomaticRollbackManifest,
  writeAutomaticRollbackVerificationManifest,
} from "./record-staging-automatic-rollback.mjs";
import {
  STAGING_IMAGE_NAMES,
  buildStagingImagePublicationManifest,
} from "./record-staging-image-publication.mjs";
import { buildStagingImageVerificationManifest } from "./record-staging-image-verification.mjs";
import { buildStagingRevisionProbeManifest } from "./record-staging-revision-probe.mjs";
import { buildStagingVerificationManifest } from "./record-staging-verification.mjs";
import { buildStagingZeroTrafficDeploymentManifest } from "./record-staging-zero-traffic-deployment.mjs";
import {
  imageSecurityGate,
  releaseCandidateLineage,
} from "./staging-release-test-fixtures.mjs";

const candidateSha = "a".repeat(40);
const controllerSha = "b".repeat(40);
const service = "samra-api";
const candidateRevision = `${service}-${candidateSha.slice(0, 12)}`;
const priorRevision = "samra-api-111111111111";
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
    publicationManifestSha256: "c".repeat(64),
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
    zeroTrafficDeploymentManifestSha256: "1".repeat(64),
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
    zeroTrafficDeploymentManifestSha256: "a".repeat(64),
    imageVerification: buildImageVerification(),
    imageVerificationManifestSha256: "b".repeat(64),
    probe: buildProbe(),
    probeManifestSha256: "c".repeat(64),
    controllerSha,
    qase: {
      project: "SAMP",
      environment: "google-cloud-staging",
      status: "passed",
      runId: "74",
      runUrl: "https://app.qase.io/run/SAMP/dashboard/74",
      imageJUnitIncluded: true,
      probeJUnitIncluded: true,
    },
    generatedAt: "2026-08-23T00:40:00.000Z",
  });
}

function observedInfrastructure() {
  return {
    projectId: "samra-pay-staging",
    region: "us-east4",
    service,
    restoredRevision: priorRevision,
    traffic: [{ revision: priorRevision, percent: 100, tag: null }],
    revisionReady: true,
    imageDigest: digest(service, "e"),
    ingress: "internal-and-cloud-load-balancing",
    defaultServiceUrlDisabled: true,
    publicIamAbsent: true,
  };
}

function buildRollback(overrides = {}) {
  return buildStagingAutomaticRollbackManifest({
    zeroTrafficDeployment: buildZeroTrafficDeployment(),
    zeroTrafficDeploymentManifestSha256: "1".repeat(64),
    verification: buildVerification(),
    verificationManifestSha256: "2".repeat(64),
    restoredRevision: priorRevision,
    failureStage: "promotion-evidence-recording",
    trafficBeforePromotion: [
      { revision: priorRevision, percent: 100, tag: null },
    ],
    trafficAfterRollback: [
      { revision: priorRevision, percent: 100, tag: null },
    ],
    controllerSha,
    operatorIdentity:
      "samra-github-promoter-staging@samra-pay-staging.iam.gserviceaccount.com",
    githubRunId: "32620000001",
    githubRunAttempt: "1",
    githubActor: "haileleuld87",
    generatedAt: "2026-08-23T00:50:00.000Z",
    ...overrides,
  });
}

test("records failed-promotion rollback and exact private infrastructure proof", () => {
  const rollback = buildRollback();
  const verification = buildStagingAutomaticRollbackVerificationManifest({
    automaticRollback: rollback,
    automaticRollbackManifestSha256: "3".repeat(64),
    observedInfrastructure: observedInfrastructure(),
    generatedAt: "2026-08-23T00:51:00.000Z",
  });
  assert.equal(validateStagingAutomaticRollbackManifest(rollback), rollback);
  assert.equal(
    validateStagingAutomaticRollbackVerificationManifest(verification),
    verification,
  );
  assert.equal(
    validateAutomaticRollbackVerificationAgainstEvent(
      verification,
      rollback,
      "3".repeat(64),
    ),
    verification,
  );
  assert.equal(verification.infrastructure.revisionReady, true);
  assert.equal(verification.applicationVerification.status, "not-executed");
  assert.equal(verification.fullRecoveryClaimed, false);
});

test("normalizes only the exact non-floating controller traffic shape", () => {
  const snapshot = [
    { revision: priorRevision, percent: 100, tag: null, latestRevision: false },
  ];
  assert.deepEqual(normalizeControllerTrafficSnapshot(snapshot, "Traffic"), [
    { revision: priorRevision, percent: 100, tag: null },
  ]);
  for (const mutate of [
    (value) => {
      value[0].latestRevision = true;
    },
    (value) => {
      delete value[0].latestRevision;
    },
    (value) => {
      value[0].latestRevision = "false";
    },
    (value) => {
      value[0].tag = "latest";
    },
    (value) => {
      value[0].percent = 99;
    },
    (value) => {
      value[0].unexpected = true;
    },
  ]) {
    const invalid = structuredClone(snapshot);
    mutate(invalid);
    assert.throws(() => normalizeControllerTrafficSnapshot(invalid, "Traffic"));
  }
});

test("CLI records the actual four-field traffic snapshots emitted by the controller", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "samra-auto-rollback-cli-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const writePair = async (name, value) => {
    const manifestPath = join(root, `${name}.json`);
    const hashPath = join(root, `${name}.sha256`);
    const serialized = `${JSON.stringify(value, null, 2)}\n`;
    const hash = createHash("sha256").update(serialized).digest("hex");
    await writeFile(manifestPath, serialized);
    await writeFile(hashPath, `${hash}  ${basename(manifestPath)}\n`);
    return [manifestPath, hashPath];
  };
  const [deploymentPath, deploymentHashPath] = await writePair(
    "deployment",
    buildZeroTrafficDeployment(),
  );
  const [verificationPath, verificationHashPath] = await writePair(
    "source-verification",
    buildVerification(),
  );
  const trafficPath = join(root, "traffic.json");
  const observedPath = join(root, "observed.json");
  await writeFile(
    trafficPath,
    JSON.stringify([
      {
        revision: priorRevision,
        percent: 100,
        tag: null,
        latestRevision: false,
      },
    ]),
  );
  await writeFile(observedPath, JSON.stringify(observedInfrastructure()));
  const rollbackPath = join(root, "rollback.json");
  const rollbackHashPath = join(root, "rollback.sha256");
  const postVerificationPath = join(root, "verification.json");
  const postVerificationHashPath = join(root, "verification.sha256");
  const result = spawnSync(
    process.execPath,
    [
      fileURLToPath(
        new URL("./record-staging-automatic-rollback.mjs", import.meta.url),
      ),
      "--zero-traffic-manifest",
      deploymentPath,
      "--zero-traffic-hash",
      deploymentHashPath,
      "--verification-manifest",
      verificationPath,
      "--verification-hash",
      verificationHashPath,
      "--restored-revision",
      priorRevision,
      "--failure-stage",
      "post-promotion-assertion",
      "--traffic-before",
      trafficPath,
      "--traffic-after",
      trafficPath,
      "--observed-infrastructure",
      observedPath,
      "--controller-sha",
      controllerSha,
      "--operator-identity",
      "samra-github-promoter-staging@samra-pay-staging.iam.gserviceaccount.com",
      "--github-run-id",
      "32620000001",
      "--github-run-attempt",
      "1",
      "--github-actor",
      "haileleuld87",
      "--rollback-output",
      rollbackPath,
      "--rollback-hash-output",
      rollbackHashPath,
      "--verification-output",
      postVerificationPath,
      "--verification-hash-output",
      postVerificationHashPath,
    ],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  const verified = await verifyAutomaticRollbackEvidence(
    rollbackPath,
    rollbackHashPath,
    postVerificationPath,
    postVerificationHashPath,
  );
  assert.deepEqual(verified.rollback.trafficAfterRollback, [
    { revision: priorRevision, percent: 100, tag: null },
  ]);
  assert.equal(
    verified.verification.status,
    "infrastructure-verified-application-pending",
  );
});

test("rejects unsafe rollback targets, mutable images, and recovery overclaims", () => {
  assert.throws(() => buildRollback({ restoredRevision: candidateRevision }));
  assert.throws(() => buildRollback({ failureStage: "unknown" }));
  const rollback = buildRollback();
  for (const mutate of [
    (value) => (value.infrastructure.traffic[0].percent = 99),
    (value) => (value.infrastructure.imageDigest = `${digest(service)}:latest`),
    (value) => (value.infrastructure.publicIamAbsent = false),
    (value) => (value.applicationVerification.status = "passed"),
    (value) => (value.fullRecoveryClaimed = true),
  ]) {
    const verification = structuredClone(
      buildStagingAutomaticRollbackVerificationManifest({
        automaticRollback: rollback,
        automaticRollbackManifestSha256: "3".repeat(64),
        observedInfrastructure: observedInfrastructure(),
        generatedAt: "2026-08-23T00:51:00.000Z",
      }),
    );
    mutate(verification);
    assert.throws(() =>
      validateStagingAutomaticRollbackVerificationManifest(verification),
    );
  }
});

test("writes append-only, tamper-evident automatic rollback evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "samra-auto-rollback-"));
  const rollback = buildRollback();
  const rollbackPath = join(root, "automatic-rollback.json");
  const rollbackHashPath = join(root, "automatic-rollback.sha256");
  const rollbackHash = await writeAutomaticRollbackManifest(
    rollback,
    rollbackPath,
    rollbackHashPath,
  );
  const verification = buildStagingAutomaticRollbackVerificationManifest({
    automaticRollback: rollback,
    automaticRollbackManifestSha256: rollbackHash,
    observedInfrastructure: observedInfrastructure(),
    generatedAt: "2026-08-23T00:51:00.000Z",
  });
  await writeAutomaticRollbackVerificationManifest(
    verification,
    join(root, "verification.json"),
    join(root, "verification.sha256"),
  );
  const verified = await verifyAutomaticRollbackEvidence(
    rollbackPath,
    rollbackHashPath,
    join(root, "verification.json"),
    join(root, "verification.sha256"),
  );
  assert.equal(verified.rollbackManifestSha256, rollbackHash);
  await assert.rejects(
    writeAutomaticRollbackManifest(rollback, rollbackPath, rollbackHashPath),
  );
  await writeFile(
    rollbackPath,
    (await readFile(rollbackPath, "utf8")).replace(
      priorRevision,
      "samra-api-222222222222",
    ),
    "utf8",
  );
  assert.notEqual(
    createHash("sha256")
      .update(await readFile(rollbackPath))
      .digest("hex"),
    rollbackHash,
  );
  await assert.rejects(
    verifyAutomaticRollbackEvidence(
      rollbackPath,
      rollbackHashPath,
      join(root, "verification.json"),
      join(root, "verification.sha256"),
    ),
    /sidecar does not match/,
  );
});
