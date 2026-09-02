import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { validateBuildInputs } from "./validate-build-inputs.mjs";

const sha = "76488316d7aa55ba73ea32edcc9d9b22568385ca";
const valid = {
  SAMRA_BUILD_ENVIRONMENT: "staging",
  SAMRA_BUILD_EXPECTED_SERVICE_ACCOUNT:
    "samra-cloud-build-staging@samra-pay-staging-123.iam.gserviceaccount.com",
  SAMRA_BUILD_IMAGE_TAG: sha,
  SAMRA_BUILD_PROJECT_ID: "samra-pay-staging-123",
  SAMRA_BUILD_REGION: "us-east1",
  SAMRA_BUILD_REPOSITORY: "samra-staging",
  SAMRA_BUILD_SOURCE_SHA: sha,
  SAMRA_BUILD_RELEASE_CANDIDATE_RUN_ID: "32608456303",
  SAMRA_BUILD_RELEASE_CANDIDATE_RUN_ATTEMPT: "2",
  SAMRA_BUILD_RELEASE_EVIDENCE_MANIFEST_SHA256: "b".repeat(64),
};

test("accepts one explicit staging build identity", () => {
  assert.deepEqual(validateBuildInputs(valid), {
    schemaVersion: 2,
    status: "validated",
    environment: "staging",
    projectId: "samra-pay-staging-123",
    region: "us-east1",
    repository: "samra-staging",
    sourceSha: sha,
    imageTag: sha,
    serviceAccount:
      "samra-cloud-build-staging@samra-pay-staging-123.iam.gserviceaccount.com",
    releaseCandidateRunId: "32608456303",
    releaseCandidateRunAttempt: 2,
    releaseEvidenceManifestSha256: "b".repeat(64),
  });
});

test("rejects defaults, floating tags, source drift, and non-staging targets", () => {
  for (const [field, value, pattern] of [
    ["SAMRA_BUILD_REGION", "unset", /required/],
    ["SAMRA_BUILD_IMAGE_TAG", "latest", /full lowercase Git SHA/],
    [
      "SAMRA_BUILD_SOURCE_SHA",
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      /exactly match/,
    ],
    ["SAMRA_BUILD_ENVIRONMENT", "production", /Only the staging/],
    ["SAMRA_BUILD_PROJECT_ID", "samra-pay-prod-123", /staging project/],
    ["SAMRA_BUILD_REPOSITORY", "samra-production", /samra-staging/],
    ["SAMRA_BUILD_REGION", "global", /regional location/],
    ["SAMRA_BUILD_RELEASE_CANDIDATE_RUN_ID", "0", /positive integer/],
    [
      "SAMRA_BUILD_RELEASE_CANDIDATE_RUN_ID",
      "9007199254740992",
      /positive integer/,
    ],
    ["SAMRA_BUILD_RELEASE_CANDIDATE_RUN_ATTEMPT", "latest", /positive integer/],
    [
      "SAMRA_BUILD_RELEASE_EVIDENCE_MANIFEST_SHA256",
      "abc",
      /lowercase SHA-256/,
    ],
  ]) {
    assert.throws(
      () => validateBuildInputs({ ...valid, [field]: value }),
      pattern,
      `${field}=${value} must fail closed`,
    );
  }
});

test("rejects default or cross-project build identities", () => {
  for (const [changes, pattern] of [
    [{ SAMRA_BUILD_EXPECTED_SERVICE_ACCOUNT: "unset" }, /required/],
    [
      {
        SAMRA_BUILD_EXPECTED_SERVICE_ACCOUNT:
          "samra-cloud-build-staging@other-staging-project.iam.gserviceaccount.com",
      },
      /dedicated service account/,
    ],
  ]) {
    assert.throws(() => validateBuildInputs({ ...valid, ...changes }), pattern);
  }
});

test("CLI exits nonzero without printing a false validation result", () => {
  const result = spawnSync(
    process.execPath,
    ["deploy/gcp/validate-build-inputs.mjs"],
    {
      encoding: "utf8",
      env: { ...valid, SAMRA_BUILD_IMAGE_TAG: "latest" },
    },
  );

  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /Cloud Build input contract rejected/);
  assert.match(result.stderr, /full lowercase Git SHA/);
});

test("places provenance and identity controls before any image build", async () => {
  const config = await readFile("deploy/gcp/cloudbuild.yaml", "utf8");
  const validationIndex = config.indexOf("id: validate-build-inputs");
  const platformIndex = config.indexOf("id: platform-contract-tests");
  const firstBuildIndex = config.indexOf("id: build-api");

  assert.ok(validationIndex >= 0);
  assert.ok(platformIndex > validationIndex);
  assert.ok(firstBuildIndex > platformIndex);
  for (const required of [
    "_BUILD_SERVICE_ACCOUNT: unset",
    "_ENVIRONMENT: unset",
    "_IMAGE_TAG: unset",
    "_REGION: unset",
    "_REPOSITORY: unset",
    "SAMRA_BUILD_SOURCE_SHA=$COMMIT_SHA",
    "SAMRA_BUILD_RELEASE_CANDIDATE_RUN_ID=${_RELEASE_CANDIDATE_RUN_ID}",
    "SAMRA_BUILD_RELEASE_CANDIDATE_RUN_ATTEMPT=${_RELEASE_CANDIDATE_RUN_ATTEMPT}",
    "SAMRA_BUILD_RELEASE_EVIDENCE_MANIFEST_SHA256=${_RELEASE_EVIDENCE_MANIFEST_SHA256}",
    "requestedVerifyOption: VERIFIED",
    "serviceAccount: projects/$PROJECT_ID/serviceAccounts/${_BUILD_SERVICE_ACCOUNT}",
  ]) {
    assert.ok(config.includes(required), `Missing build control: ${required}`);
  }
  assert.doesNotMatch(config, /gcloud\s+run\s+deploy|gcloud\s+sql|replit/i);
});
