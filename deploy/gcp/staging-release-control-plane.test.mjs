import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  STAGING_IMAGE_NAMES,
  buildStagingImageSecurityGate,
  buildStagingImagePublicationManifest,
  parseImageArguments,
  validateStagingImagePublicationManifest,
  verifyPublicationManifest,
  writePublicationManifest,
} from "./record-staging-image-publication.mjs";
import {
  readStagingReleaseControlPlane,
  validateStagingReleaseControlPlane,
} from "./validate-staging-release-control-plane.mjs";
import {
  imageSecurityGate,
  releaseCandidateLineage,
} from "./staging-release-test-fixtures.mjs";

const contract = readStagingReleaseControlPlane();
const sha = "a".repeat(40);
const tree = "b".repeat(40);
const digest = (name, value = "c") =>
  `us-east4-docker.pkg.dev/samra-pay-staging/samra-staging/${name}@sha256:${value.repeat(64)}`;
const imageDigests = Object.freeze(
  Object.fromEntries(STAGING_IMAGE_NAMES.map((name) => [name, digest(name)])),
);

function buildManifest(overrides = {}) {
  return buildStagingImagePublicationManifest({
    candidateSha: sha,
    gitTreeSha: tree,
    projectId: "samra-pay-staging",
    projectNumber: "934122615631",
    region: "us-east4",
    repository: "samra-staging",
    sourceRepository: "samra-pay/Samra-Pay",
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
    releaseCandidate: releaseCandidateLineage(sha, tree),
    ...overrides,
  });
}

test("validates the bounded staging release control plane", () => {
  assert.deepEqual(validateStagingReleaseControlPlane(contract), {
    schemaVersion: 1,
    status: "validated",
    environment: "staging",
    deliveryStageCount: 6,
    imageCount: 5,
    deployableServiceCount: 1,
    operationsPortalBlocked: true,
    deploymentAuthorized: false,
    verificationRecorderImplemented: true,
    verificationImageRunnerImplemented: true,
    verificationImageWorkflowImplemented: true,
    verificationProbeImplemented: true,
    verificationAuthorized: false,
    promotionAuthorized: false,
  });
});

test("rejects automatic, public, floating, and untracked release drift", () => {
  for (const mutate of [
    (value) => (value.deployment.automatic = true),
    (value) => (value.artifactPublication.manifestSchemaVersion = 2),
    (value) =>
      (value.artifactPublication.releaseEvidenceVerifiedBeforeCloudAuthentication = false),
    (value) =>
      (value.artifactPublication.wildcardArtifactDownloadAllowed = true),
    (value) =>
      (value.upstreamArtifactVerification.beforeCloudAuthentication = false),
    (value) =>
      (value.upstreamArtifactVerification.operatorSelectedProducerAllowed = true),
    (value) =>
      (value.upstreamArtifactVerification.apiMigrationProducerStatus =
        "implemented"),
    (value) =>
      (value.artifactPublication.publishedDigestSecurityRequired = false),
    (value) =>
      (value.artifactPublication.securityGateScope = "source-build-only"),
    (value) => (value.artifactPublication.securityScannerVersion = "latest"),
    (value) => (value.deployment.initialTrafficPercent = 100),
    (value) => (value.deployment.publicUnauthenticatedAllowed = true),
    (value) => value.deployment.deployableServices.push("samra-operations-web"),
    (value) => (value.verification.imageRunnerImplemented = false),
    (value) => (value.verification.imageWorkflowImplemented = false),
    (value) =>
      (value.verification.imageDedicatedRuntimeIdentityRequired = false),
    (value) => (value.verification.imageExecutionAuthorized = true),
    (value) => (value.verification.imageEvidencePromotionEligible = true),
    (value) => (value.verification.probeImplemented = false),
    (value) => (value.verification.executionAuthorized = true),
    (value) => (value.verification.exactRevisionRequired = false),
    (value) => (value.verification.exactCandidateBindingRequired = false),
    (value) => (value.verification.allChecksMustUseDeployedRevision = true),
    (value) => (value.verification.evidenceCoverageRequired = false),
    (value) => (value.promotion.automatic = true),
    (value) => (value.promotion.latestAliasAllowed = true),
    (value) => (value.promotion.automaticRollbackFailClosed = false),
    (value) =>
      (value.promotion.automaticRollbackEvidenceUploadOnFailure = false),
    (value) =>
      (value.promotion.automaticRollbackApplicationVerification = "passed"),
    (value) => (value.promotion.automaticRollbackFullRecoveryClaimed = true),
    (value) => (value.rollback.rebuildAllowed = true),
    (value) =>
      (value.rollback.postRollbackVerificationStatus = "fully-recovered"),
    (value) => (value.rollback.postRollbackFullRecoveryClaimed = true),
    (value) => (value.traceability.secretValuesAllowed = true),
    (value) => value.traceability.requiredFields.splice(0, 1),
  ]) {
    const changed = structuredClone(contract);
    mutate(changed);
    assert.throws(() => validateStagingReleaseControlPlane(changed));
  }
});

test("builds a full GitHub-to-Cloud-Build-to-digest publication record", () => {
  const manifest = buildManifest();
  assert.equal(manifest.schemaVersion, 3);
  assert.equal(manifest.releaseId, `staging-${sha.slice(0, 12)}`);
  assert.equal(manifest.releaseCandidate.workflowRunId, "32600000001");
  assert.equal(manifest.github.runId, "32608456303");
  assert.equal(manifest.github.runAttempt, 1);
  assert.equal(manifest.deploymentAuthorized, false);
  assert.deepEqual(Object.keys(manifest.imageDigests), STAGING_IMAGE_NAMES);
  assert.equal(manifest.securityGate.status, "passed");
  assert.equal(manifest.securityGate.scope, "exact-published-digests");
  assert.equal(validateStagingImagePublicationManifest(manifest), manifest);
});

test("hashes passing reports that name every exact published digest", async () => {
  const root = await mkdtemp(join(tmpdir(), "samra-published-security-"));
  for (const name of STAGING_IMAGE_NAMES) {
    for (const kind of ["vulnerabilities", "secrets"]) {
      await writeFile(
        join(root, `${name}-${kind}.json`),
        `${JSON.stringify({
          SchemaVersion: 2,
          ArtifactName: imageDigests[name],
          ArtifactType: "container_image",
          Results: [{}],
        })}\n`,
        "utf8",
      );
    }
  }
  const gate = await buildStagingImageSecurityGate(imageDigests, root);
  assert.equal(gate.status, "passed");
  assert.equal(gate.images["samra-api"].imageDigest, imageDigests["samra-api"]);
  assert.match(
    gate.images["samra-api"].vulnerabilities.reportSha256,
    /^[0-9a-f]{64}$/,
  );

  await writeFile(
    join(root, "samra-api-secrets.json"),
    `${JSON.stringify({
      SchemaVersion: 2,
      ArtifactName: digest("samra-api", "f"),
      ArtifactType: "container_image",
      Results: [{}],
    })}\n`,
    "utf8",
  );
  await assert.rejects(
    buildStagingImageSecurityGate(imageDigests, root),
    /not bound to the exact published digest/,
  );
});

test("rejects missing, failed, and cross-digest published-image security evidence", () => {
  for (const mutate of [
    (value) => delete value.securityGate,
    (value) => (value.securityGate.status = "pending"),
    (value) =>
      (value.securityGate.images["samra-api"].imageDigest = digest(
        "samra-api",
        "f",
      )),
    (value) =>
      (value.securityGate.images["samra-api"].secrets.reportSha256 = "bad"),
    (value) =>
      (value.securityGate.policies.vulnerabilities.ignoreUnfixed = false),
  ]) {
    const changed = structuredClone(buildManifest());
    mutate(changed);
    assert.throws(() => validateStagingImagePublicationManifest(changed));
  }
});

test("rejects legacy publication records without verified release-candidate lineage", () => {
  const legacy = structuredClone(buildManifest());
  legacy.schemaVersion = 2;
  delete legacy.releaseCandidate;
  assert.throws(
    () => validateStagingImagePublicationManifest(legacy),
    /Publication manifest identity drifted/,
  );
});

test("rejects unsafe release-candidate run identifiers in stored lineage", () => {
  const unsafe = structuredClone(buildManifest());
  unsafe.releaseCandidate.workflowRunId = "9007199254740992";
  unsafe.releaseCandidate.workflowRunUrl =
    "https://github.com/samra-pay/Samra-Pay/actions/runs/9007199254740992";
  unsafe.releaseCandidate.artifactName = `samra-rc-${sha.slice(0, 12)}-run-9007199254740992-attempt-1`;

  assert.throws(
    () => validateStagingImagePublicationManifest(unsafe),
    /Release-candidate lineage drifted/,
  );
});

test("supports reviewed human publication without inventing a GitHub run", () => {
  const manifest = buildManifest({
    publisherIdentity: "me@davidhaile.com",
    githubRunId: "",
    githubRunAttempt: "",
    githubActor: "",
  });
  assert.equal(manifest.github, null);
});

test("rejects incomplete, duplicate, misplaced, and mutable image evidence", () => {
  assert.throws(
    () =>
      parseImageArguments(
        STAGING_IMAGE_NAMES.slice(0, 4).map(
          (name) => `${name}=${digest(name)}`,
        ),
      ),
    /All five staging images/,
  );
  assert.throws(
    () =>
      parseImageArguments([
        ...STAGING_IMAGE_NAMES.map((name) => `${name}=${digest(name)}`),
        `samra-api=${digest("samra-api")}`,
      ]),
    /Duplicate staging image/,
  );
  assert.throws(() =>
    buildManifest({
      imageDigests: {
        ...imageDigests,
        "samra-api":
          "us-east4-docker.pkg.dev/other-project/repository/samra-api@sha256:" +
          "c".repeat(64),
      },
    }),
  );
  assert.throws(() =>
    buildManifest({
      imageDigests: {
        ...imageDigests,
        "samra-api":
          "us-east4-docker.pkg.dev/samra-pay-staging/samra-staging/samra-api:latest",
      },
    }),
  );
});

test("rejects source, build, publisher, and workflow provenance drift", () => {
  for (const overrides of [
    { candidateSha: "abc" },
    { projectId: "samra-pay-production" },
    { sourceRepository: "other/repository" },
    { cloudBuildId: "build-1" },
    { publisherIdentity: "owner@example.com" },
    { githubRunAttempt: "0" },
    { githubActor: "" },
  ]) {
    assert.throws(() => buildManifest(overrides));
  }
});

test("writes and independently verifies a tamper-evident publication record", async () => {
  const root = await mkdtemp(join(tmpdir(), "samra-staging-publication-"));
  const manifestPath = join(root, "staging-image-publication.json");
  const hashPath = join(root, "staging-image-publication.sha256");
  const hash = await writePublicationManifest(
    buildManifest(),
    manifestPath,
    hashPath,
  );
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.match(
    await readFile(hashPath, "utf8"),
    new RegExp(`^${hash}  staging-image-publication\\.json\\n$`),
  );
  assert.equal(
    (await verifyPublicationManifest(manifestPath, hashPath)).candidateSha,
    sha,
  );
  const serialized = await readFile(manifestPath, "utf8");
  await import("node:fs/promises").then(({ writeFile }) =>
    writeFile(manifestPath, serialized.replace(sha, "d".repeat(40)), "utf8"),
  );
  await assert.rejects(
    verifyPublicationManifest(manifestPath, hashPath),
    /hash does not match/,
  );
});
