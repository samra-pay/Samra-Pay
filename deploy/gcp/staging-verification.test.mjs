import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import {
  STAGING_IMAGE_NAMES,
  buildStagingImagePublicationManifest,
} from "./record-staging-image-publication.mjs";
import {
  buildStagingImageVerificationManifest,
  writeStagingImageVerificationManifest,
} from "./record-staging-image-verification.mjs";
import {
  buildStagingRevisionProbeJUnit,
  buildStagingRevisionProbeManifest,
  writeStagingRevisionProbeManifest,
} from "./record-staging-revision-probe.mjs";
import {
  buildStagingVerificationManifest,
  validateStagingVerificationManifest,
  verifyStagingVerificationManifest,
  writeStagingVerificationManifest,
} from "./record-staging-verification.mjs";
import {
  buildStagingZeroTrafficDeploymentManifest,
  writeZeroTrafficDeploymentManifest,
} from "./record-staging-zero-traffic-deployment.mjs";
import { STAGING_VERIFICATION_CHECKS } from "./validate-staging-traffic-control.mjs";
import {
  readStagingVerificationContract,
  validateStagingVerificationContract,
} from "./validate-staging-verification.mjs";

const candidateSha = "a".repeat(40);
const controllerSha = "b".repeat(40);
const service = "samra-api";
const revision = `${service}-${candidateSha.slice(0, 12)}`;
const execFileAsync = promisify(execFile);
const digest = (name, value = "c") =>
  `us-east4-docker.pkg.dev/samra-pay-staging/samra-staging/${name}@sha256:${value.repeat(64)}`;

function publication() {
  return buildStagingImagePublicationManifest({
    candidateSha,
    gitTreeSha: "d".repeat(40),
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

function deployment() {
  return buildStagingZeroTrafficDeploymentManifest({
    publication: publication(),
    publicationManifestSha256: "e".repeat(64),
    targetService: service,
    revisionName: revision,
    imageDigest: digest(service),
    deployerIdentity:
      "samra-github-deployer-staging@samra-pay-staging.iam.gserviceaccount.com",
    configurationSha256: "f".repeat(64),
    trafficBefore: [],
    trafficAfter: [],
    githubRunId: "32611669347",
    githubRunAttempt: "1",
    githubActor: "haileleuld87",
    generatedAt: "2026-08-23T00:10:00.000Z",
  });
}

function imageVerification() {
  return buildStagingImageVerificationManifest({
    zeroTrafficDeployment: deployment(),
    zeroTrafficDeploymentManifestSha256: "1".repeat(64),
    revision,
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

function probeResult(overrides = {}) {
  return {
    schemaVersion: 1,
    status: "passed",
    probeId: "svp-32619000001-1",
    unauthenticatedStatus: 403,
    authenticatedHealthStatus: 200,
    authenticatedReadinessStatus: 200,
    healthResponseSha256: "3".repeat(64),
    readinessResponseSha256: "4".repeat(64),
    observedRevision: revision,
    serviceAuthenticationObserved: true,
    deployedRevisionNetworkPathObserved: true,
    tokenRecorded: false,
    ...overrides,
  };
}

function probe(overrides = {}) {
  const result = probeResult(overrides.result);
  return buildStagingRevisionProbeManifest({
    zeroTrafficDeployment: deployment(),
    imageVerification: imageVerification(),
    zeroTrafficDeploymentManifestSha256: "5".repeat(64),
    imageVerificationManifestSha256: "6".repeat(64),
    revision,
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
    ...overrides,
    result,
  });
}

function combined(overrides = {}) {
  return buildStagingVerificationManifest({
    zeroTrafficDeployment: deployment(),
    zeroTrafficDeploymentManifestSha256: "a".repeat(64),
    imageVerification: imageVerification(),
    imageVerificationManifestSha256: "b".repeat(64),
    probe: probe(),
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
    ...overrides,
  });
}

test("validates the complete but dormant two-plane staging verification", () => {
  assert.deepEqual(
    validateStagingVerificationContract(readStagingVerificationContract()),
    {
      schemaVersion: 1,
      status: "validated",
      environment: "staging",
      serviceCount: 3,
      checkCount: 7,
      recorderImplemented: true,
      imageRunnerImplemented: true,
      probeImplemented: true,
      executionAuthorized: false,
    },
  );
});

test("records one candidate across exact-image and exact-revision evidence", () => {
  const manifest = combined();
  assert.equal(manifest.status, "passed");
  assert.equal(manifest.candidateSha, candidateSha);
  assert.equal(manifest.revision, revision);
  assert.equal(manifest.imageDigest, digest(service));
  assert.equal(manifest.allChecksUsedDeployedRevision, false);
  assert.deepEqual(Object.keys(manifest.checks), STAGING_VERIFICATION_CHECKS);
  assert.deepEqual(manifest.evidenceCoverage, {
    exactImagePrivateDatabaseJob: [
      "readiness",
      "restart",
      "ledger",
      "reconciliation",
      "audit",
      "failureVisibility",
    ],
    exactDeployedRevisionPrivateHttpProbe: [
      "serviceAuthentication",
      "deployedRevisionNetworkPath",
    ],
  });
  assert.equal(validateStagingVerificationManifest(manifest), manifest);
});

test("rejects mismatched, incomplete, unsafe, or overstated combined evidence", () => {
  for (const mutate of [
    (value) => (value.checks.ledger = "failed"),
    (value) => delete value.checks.audit,
    (value) => (value.qase.status = "in_progress"),
    (value) => (value.qase.environment = "github-ci-postgres"),
    (value) => (value.qase.imageJUnitIncluded = false),
    (value) => (value.probeGitHub.runId = 32619000001),
    (value) => (value.allChecksUsedDeployedRevision = true),
    (value) => (value.trafficPercentageChanged = true),
    (value) => (value.temporaryRoutingRestored = false),
    (value) => (value.customerDataUsed = true),
    (value) => (value.notes = "Authorization: Bearer secret"),
  ]) {
    const changed = structuredClone(combined());
    mutate(changed);
    assert.throws(() => validateStagingVerificationManifest(changed));
  }
});

test("rejects a probe for a different candidate revision", () => {
  const changedProbe = structuredClone(probe());
  changedProbe.candidateSha = "d".repeat(40);
  changedProbe.releaseId = `staging-${"d".repeat(12)}`;
  changedProbe.revision = `samra-api-${"d".repeat(12)}`;
  assert.throws(() =>
    buildStagingVerificationManifest({
      zeroTrafficDeployment: deployment(),
      zeroTrafficDeploymentManifestSha256: "a".repeat(64),
      imageVerification: imageVerification(),
      imageVerificationManifestSha256: "b".repeat(64),
      probe: changedProbe,
      probeManifestSha256: "c".repeat(64),
      controllerSha,
      qase: combined().qase,
      generatedAt: "2026-08-23T00:40:00.000Z",
    }),
  );
});

test("writes and independently detects tampering in final evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "samra-verification-"));
  const manifestPath = join(root, "staging-verification.json");
  const hashPath = join(root, "staging-verification.sha256");
  const hash = await writeStagingVerificationManifest(
    combined(),
    manifestPath,
    hashPath,
  );
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(
    (await verifyStagingVerificationManifest(manifestPath, hashPath)).revision,
    revision,
  );
  await writeFile(
    manifestPath,
    (await readFile(manifestPath, "utf8")).replace(
      '"temporaryRoutingRestored": true',
      '"temporaryRoutingRestored": false',
    ),
    "utf8",
  );
  await assert.rejects(
    verifyStagingVerificationManifest(manifestPath, hashPath),
    /hash does not match/,
  );
});

test("builds and verifies the final manifest through the operator CLI", async () => {
  const root = await mkdtemp(join(tmpdir(), "samra-verification-cli-"));
  const zeroManifest = join(root, "zero.json");
  const zeroHash = join(root, "zero.sha256");
  const imageManifest = join(root, "image.json");
  const imageHash = join(root, "image.sha256");
  const probeManifest = join(root, "probe.json");
  const probeHash = join(root, "probe.sha256");
  const finalManifest = join(root, "final.json");
  const finalHash = join(root, "final.sha256");
  await writeZeroTrafficDeploymentManifest(
    deployment(),
    zeroManifest,
    zeroHash,
  );
  await writeStagingImageVerificationManifest(
    imageVerification(),
    imageManifest,
    imageHash,
  );
  await writeStagingRevisionProbeManifest(probe(), probeManifest, probeHash);
  const build = await execFileAsync(process.execPath, [
    "deploy/gcp/record-staging-verification.mjs",
    "build",
    "--zero-traffic-manifest",
    zeroManifest,
    "--zero-traffic-hash",
    zeroHash,
    "--image-manifest",
    imageManifest,
    "--image-hash",
    imageHash,
    "--probe-manifest",
    probeManifest,
    "--probe-hash",
    probeHash,
    "--controller-sha",
    controllerSha,
    "--qase-run-id",
    "74",
    "--qase-run-url",
    "https://app.qase.io/run/SAMP/dashboard/74",
    "--generated-at",
    "2026-08-23T00:40:00.000Z",
    "--output",
    finalManifest,
    "--hash-output",
    finalHash,
  ]);
  assert.equal(JSON.parse(build.stdout).status, "passed");
  const verify = await execFileAsync(process.execPath, [
    "deploy/gcp/record-staging-verification.mjs",
    "verify",
    "--manifest",
    finalManifest,
    "--hash",
    finalHash,
  ]);
  assert.deepEqual(JSON.parse(verify.stdout), {
    status: "passed",
    candidateSha,
    service,
    revision,
    qaseRunId: "74",
  });
});

test("generates two passing deployed-revision JUnit cases", () => {
  const junit = buildStagingRevisionProbeJUnit(probeResult());
  assert.match(junit, /tests="2" failures="0"/);
  assert.match(junit, /STAGING-REVISION-001/);
  assert.match(junit, /STAGING-REVISION-002/);
});
