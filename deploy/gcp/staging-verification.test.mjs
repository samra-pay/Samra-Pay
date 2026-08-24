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
  buildStagingZeroTrafficDeploymentManifest,
  writeZeroTrafficDeploymentManifest,
} from "./record-staging-zero-traffic-deployment.mjs";
import {
  buildStagingVerificationManifest,
  validateStagingVerificationManifest,
  validateStagingVerificationProbeManifest,
  verifyStagingVerificationManifest,
  writeStagingVerificationManifest,
  writeStagingVerificationProbeManifest,
} from "./record-staging-verification.mjs";
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

export function verificationProbe(overrides = {}) {
  return {
    schemaVersion: 1,
    status: "passed",
    environment: "staging",
    dataClassification: "synthetic-only",
    releaseId: `staging-${candidateSha.slice(0, 12)}`,
    candidateSha,
    sourceRepository: "haileleuld87/Samra-Pay",
    projectId: "samra-pay-staging",
    projectNumber: "934122615631",
    region: "us-east4",
    service,
    revision,
    checks: Object.fromEntries(
      STAGING_VERIFICATION_CHECKS.map((check) => [check, "passed"]),
    ),
    qase: {
      project: "SAMP",
      environment: "google-cloud-staging",
      status: "passed",
      runId: "74",
      runUrl: "https://app.qase.io/run/SAMP/dashboard/74",
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
    exactRevisionObserved: true,
    allChecksUsedDeployedRevision: true,
    trafficChanged: false,
    publicAccessChanged: false,
    runtimeConfigurationChanged: false,
    customerDataUsed: false,
    secretValuesRecorded: false,
    vendorActivationAuthorized: false,
    generatedAt: "2026-08-23T00:20:00.000Z",
    ...overrides,
  };
}

function verification(overrides = {}) {
  return buildStagingVerificationManifest({
    zeroTrafficDeployment: deployment(),
    zeroTrafficDeploymentManifestSha256: "1".repeat(64),
    probe: verificationProbe(),
    probeManifestSha256: "2".repeat(64),
    controllerSha,
    generatedAt: "2026-08-23T00:30:00.000Z",
    ...overrides,
  });
}

test("validates a recorder-only staging verification boundary", () => {
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
      probeImplemented: false,
      executionAuthorized: false,
    },
  );
});

test("rejects any contract that pretends the missing probe is implemented or authorized", () => {
  for (const mutate of [
    (value) => (value.probeAuthority.implemented = true),
    (value) => (value.probeAuthority.authorized = true),
    (value) => (value.imageVerificationFoundation.promotionEligible = true),
    (value) => (value.imageVerificationFoundation.executionAuthorized = true),
    (value) =>
      (value.imageVerificationFoundation.imageRunnerImplemented = false),
    (value) => (value.automaticTriggers = true),
    (value) => (value.trafficMutationAuthorized = true),
    (value) => (value.publicAccessMutationAuthorized = true),
    (value) => value.requiredChecks.pop(),
  ]) {
    const changed = structuredClone(readStagingVerificationContract());
    mutate(changed);
    assert.throws(() => validateStagingVerificationContract(changed));
  }
});

test("records one exact deployed revision from two independently hashed inputs", () => {
  const manifest = verification();
  assert.equal(manifest.status, "passed");
  assert.equal(manifest.candidateSha, candidateSha);
  assert.equal(manifest.service, service);
  assert.equal(manifest.revision, revision);
  assert.equal(manifest.qase.runId, "74");
  assert.equal(manifest.trafficChanged, false);
  assert.equal(manifest.trafficAuthorized, false);
  assert.equal(validateStagingVerificationManifest(manifest), manifest);
});

test("rejects partial, failed, mismatched, manually asserted, or unsafe probe evidence", () => {
  for (const mutate of [
    (value) => (value.checks.ledger = "failed"),
    (value) => delete value.checks.restart,
    (value) => (value.qase.status = "in_progress"),
    (value) => (value.qase.environment = "github-ci-postgres"),
    (value) => (value.qase.runId = 74),
    (value) => (value.github.runId = 32619000001),
    (value) => (value.github.actor = " "),
    (value) => (value.revision = "samra-api-other"),
    (value) => (value.exactRevisionObserved = false),
    (value) => (value.allChecksUsedDeployedRevision = false),
    (value) => (value.trafficChanged = true),
    (value) => (value.publicAccessChanged = true),
    (value) => (value.customerDataUsed = true),
    (value) => (value.notes = "Authorization: Bearer secret"),
  ]) {
    const changed = structuredClone(verificationProbe());
    mutate(changed);
    assert.throws(() => validateStagingVerificationProbeManifest(changed));
  }
});

test("rejects probe evidence for a different deployment candidate", () => {
  const probe = verificationProbe({
    candidateSha: "9".repeat(40),
    releaseId: `staging-${"9".repeat(12)}`,
    revision: `samra-api-${"9".repeat(12)}`,
  });
  assert.throws(
    () =>
      buildStagingVerificationManifest({
        zeroTrafficDeployment: deployment(),
        zeroTrafficDeploymentManifestSha256: "1".repeat(64),
        probe,
        probeManifestSha256: "2".repeat(64),
        controllerSha,
        generatedAt: "2026-08-23T00:30:00.000Z",
      }),
    /one exact candidate revision/,
  );
});

test("writes and independently verifies tamper-evident verification evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "samra-verification-"));
  const manifestPath = join(root, "staging-verification.json");
  const hashPath = join(root, "staging-verification.sha256");
  const hash = await writeStagingVerificationManifest(
    verification(),
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
      '"trafficChanged": false',
      '"trafficChanged": true',
    ),
    "utf8",
  );
  await assert.rejects(
    verifyStagingVerificationManifest(manifestPath, hashPath),
    /hash does not match/,
  );
});

test("builds and verifies the final evidence through the operator CLI", async () => {
  const root = await mkdtemp(join(tmpdir(), "samra-verification-cli-"));
  const zeroTrafficPath = join(root, "staging-zero-traffic-deployment.json");
  const zeroTrafficHashPath = join(
    root,
    "staging-zero-traffic-deployment.sha256",
  );
  const probePath = join(root, "staging-verification-probe.json");
  const probeHashPath = join(root, "staging-verification-probe.sha256");
  const manifestPath = join(root, "staging-verification.json");
  const hashPath = join(root, "staging-verification.sha256");
  await writeZeroTrafficDeploymentManifest(
    deployment(),
    zeroTrafficPath,
    zeroTrafficHashPath,
  );
  await writeStagingVerificationProbeManifest(
    verificationProbe(),
    probePath,
    probeHashPath,
  );
  const build = await execFileAsync(process.execPath, [
    "deploy/gcp/record-staging-verification.mjs",
    "build",
    "--zero-traffic-manifest",
    zeroTrafficPath,
    "--zero-traffic-hash",
    zeroTrafficHashPath,
    "--probe-manifest",
    probePath,
    "--probe-hash",
    probeHashPath,
    "--controller-sha",
    controllerSha,
    "--generated-at",
    "2026-08-23T00:30:00.000Z",
    "--output",
    manifestPath,
    "--hash-output",
    hashPath,
  ]);
  assert.equal(JSON.parse(build.stdout).status, "passed");
  const verify = await execFileAsync(process.execPath, [
    "deploy/gcp/record-staging-verification.mjs",
    "verify",
    "--manifest",
    manifestPath,
    "--hash",
    hashPath,
  ]);
  assert.deepEqual(JSON.parse(verify.stdout), {
    status: "passed",
    candidateSha,
    service,
    revision,
    qaseRunId: "74",
  });
});
