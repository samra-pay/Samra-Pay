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
  validateStagingImageVerificationManifest,
  verifyStagingImageVerificationManifest,
  writeStagingImageVerificationManifest,
} from "./record-staging-image-verification.mjs";
import {
  buildStagingZeroTrafficDeploymentManifest,
  writeZeroTrafficDeploymentManifest,
} from "./record-staging-zero-traffic-deployment.mjs";
import { validateStagingVerificationProbeManifest } from "./record-staging-verification.mjs";
import {
  STAGING_IMAGE_VERIFICATION_CHECKS,
  readStagingImageVerificationContract,
  validateStagingImageVerificationContract,
} from "./validate-staging-image-verification.mjs";

const candidateSha = "a".repeat(40);
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

function observation(overrides = {}) {
  return {
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
    junitSha256: "1".repeat(64),
    runtimeServiceAccount:
      "samra-verifier-staging@samra-pay-staging.iam.gserviceaccount.com",
    databaseSecretVersion: "7",
    imageChecks: Object.fromEntries(
      STAGING_IMAGE_VERIFICATION_CHECKS.map((check) => [check, "passed"]),
    ),
    generatedAt: "2026-08-23T00:20:00.000Z",
    ...overrides,
  };
}

function verification(overrides = {}) {
  return buildStagingImageVerificationManifest({
    zeroTrafficDeployment: deployment(),
    zeroTrafficDeploymentManifestSha256: "2".repeat(64),
    ...observation(),
    ...overrides,
  });
}

test("validates the exact-image runner as implemented but non-promotable", () => {
  assert.deepEqual(
    validateStagingImageVerificationContract(
      readStagingImageVerificationContract(),
    ),
    {
      schemaVersion: 1,
      status: "validated",
      environment: "staging",
      service: "samra-api",
      testCount: 9,
      imageCheckCount: 6,
      runnerImplemented: true,
      workflowImplemented: false,
      executionAuthorized: false,
      promotionEligible: false,
    },
  );
});

test("rejects contract drift that overstates execution or promotion authority", () => {
  for (const mutate of [
    (value) => (value.imageRunner.executionAuthorized = true),
    (value) => (value.workflowImplemented = true),
    (value) => (value.promotionEligible = true),
    (value) => value.imageChecks.pop(),
    (value) => value.excludedPromotionChecks.pop(),
    (value) => (value.trafficMutationAuthorized = true),
    (value) => (value.imageRunner.testCount = 8),
  ]) {
    const changed = structuredClone(readStagingImageVerificationContract());
    mutate(changed);
    assert.throws(() => validateStagingImageVerificationContract(changed));
  }
});

test("records exact-image checks separately from deployed revision checks", () => {
  const manifest = verification();
  assert.equal(manifest.status, "passed-not-promotion-eligible");
  assert.equal(manifest.candidateSha, candidateSha);
  assert.equal(manifest.revision, revision);
  assert.equal(manifest.imageDigest, digest(service));
  assert.equal(manifest.execution.testCount, 9);
  assert.equal(manifest.promotionEligible, false);
  assert.equal(manifest.allChecksUsedDeployedRevision, false);
  assert.deepEqual(manifest.excludedPromotionChecks, {
    serviceAuthentication: "not-executed",
    deployedRevisionNetworkPath: "not-executed",
  });
  assert.equal(validateStagingImageVerificationManifest(manifest), manifest);
});

test("rejects image, revision, test, identity, secret, and authority drift", () => {
  for (const overrides of [
    { imageDigest: digest(service, "9") },
    { revision: "samra-api-other" },
    {
      revisionAttestation: {
        ...observation().revisionAttestation,
        ready: false,
      },
    },
    {
      imageChecks: {
        ...observation().imageChecks,
        ledger: "failed",
      },
    },
    { syntheticRunId: "INVALID" },
    { jobExecutionId: "INVALID" },
    { databaseSecretVersion: "latest" },
    {
      runtimeServiceAccount:
        "samra-api-staging@samra-pay-staging.iam.gserviceaccount.com",
    },
  ]) {
    assert.throws(() => verification(overrides));
  }

  for (const mutate of [
    (value) =>
      (value.imageDigest = value.imageDigest.replace(
        "samra-pay-staging",
        "other-project",
      )),
    (value) => (value.promotionEligible = true),
    (value) => (value.allChecksUsedDeployedRevision = true),
    (value) => (value.deployedRevisionNetworkPathObserved = true),
    (value) => (value.serviceAuthenticationObserved = true),
    (value) => (value.trafficChanged = true),
    (value) => (value.secretValuesRecorded = true),
    (value) => (value.excludedPromotionChecks.serviceAuthentication = "passed"),
    (value) => (value.notes = "Authorization: Bearer secret"),
  ]) {
    const changed = structuredClone(verification());
    mutate(changed);
    assert.throws(() => validateStagingImageVerificationManifest(changed));
  }
});

test("cannot be passed to the promotable deployed-revision recorder", () => {
  assert.throws(
    () => validateStagingVerificationProbeManifest(verification()),
    /Verification probe identity drifted/,
  );
});

test("writes and verifies tamper-evident partial evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "samra-image-verification-"));
  const manifestPath = join(root, "staging-image-verification.json");
  const hashPath = join(root, "staging-image-verification.sha256");
  const hash = await writeStagingImageVerificationManifest(
    verification(),
    manifestPath,
    hashPath,
  );
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(
    (await verifyStagingImageVerificationManifest(manifestPath, hashPath))
      .promotionEligible,
    false,
  );
  const serialized = await readFile(manifestPath, "utf8");
  await writeFile(
    manifestPath,
    serialized.replace("verify-a1b2c3", "verify-tampered"),
    "utf8",
  );
  await assert.rejects(
    verifyStagingImageVerificationManifest(manifestPath, hashPath),
    /hash does not match/,
  );
});

test("CLI builds and independently verifies partial evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "samra-image-verification-cli-"));
  const deploymentPath = join(root, "deployment.json");
  const deploymentHashPath = join(root, "deployment.sha256");
  const observationPath = join(root, "observation.json");
  const outputPath = join(root, "verification.json");
  const outputHashPath = join(root, "verification.sha256");
  await writeZeroTrafficDeploymentManifest(
    deployment(),
    deploymentPath,
    deploymentHashPath,
  );
  await writeFile(
    observationPath,
    `${JSON.stringify(observation(), null, 2)}\n`,
    "utf8",
  );
  const built = await execFileAsync(
    process.execPath,
    [
      "deploy/gcp/record-staging-image-verification.mjs",
      "build",
      "--zero-traffic-manifest",
      deploymentPath,
      "--zero-traffic-hash",
      deploymentHashPath,
      "--observation",
      observationPath,
      "--output",
      outputPath,
      "--hash-output",
      outputHashPath,
    ],
    { cwd: process.cwd() },
  );
  assert.equal(
    JSON.parse(built.stdout).status,
    "passed-not-promotion-eligible",
  );
  const verified = await execFileAsync(
    process.execPath,
    [
      "deploy/gcp/record-staging-image-verification.mjs",
      "verify",
      "--manifest",
      outputPath,
      "--hash",
      outputHashPath,
    ],
    { cwd: process.cwd() },
  );
  assert.equal(JSON.parse(verified.stdout).promotionEligible, false);
});
