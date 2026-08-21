import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

const controller = await readFile(
  "deploy/gcp/publish-staging-images.sh",
  "utf8",
);

test("plans one bounded five-image staging publication offline", () => {
  const output = execFileSync(
    "bash",
    ["deploy/gcp/publish-staging-images.sh", "--plan"],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        SAMRA_GCP_EXPECTED_SHA: "a".repeat(40),
      },
    },
  );

  assert.match(output, /Plan only\. No Google Cloud state was read or changed/);
  assert.match(output, /publishes five immutable images/);
  assert.match(output, /cannot\s+deploy Cloud Run/);
  assert.match(output, /AUTHORIZED_STAGING_IMAGE_PUBLICATION/);
});

test("requires exact source, staging boundary, immutable registry, and keyless build identity", () => {
  for (const evidence of [
    "source commit does not match the reviewed SHA",
    "source working tree is not clean",
    "project must be samra-pay-staging",
    "organization must be 614833350075",
    "region must be us-east4",
    "repository must be samra-staging",
    "project label ${key} drifted",
    "immutable Docker repository drifted",
    "--managed-by=user",
    "build identity has a user-managed key",
    "build identity project IAM drifted",
    "build identity repository IAM drifted",
    "build identity impersonation IAM drifted",
    "immutable image tag already exists",
    "READ-ONLY STAGING IMAGE PUBLICATION REVIEW PASS",
    "REVIEW COMPLETE — NO CLOUD CHANGES",
  ]) {
    assert.ok(controller.includes(evidence), evidence);
  }
});

test("places an exact authorization after every read-only preflight", () => {
  const review = controller.indexOf(
    "READ-ONLY STAGING IMAGE PUBLICATION REVIEW PASS",
  );
  const authorization = controller.indexOf(
    '[[ "${SAMRA_GCP_IMAGE_BUILD_APPLY}" == "${AUTHORIZATION}" ]]',
  );
  const submit = controller.indexOf("gcloud builds submit");

  assert.ok(review >= 0);
  assert.ok(authorization > review);
  assert.ok(submit > authorization);
  assert.match(controller, /AUTHORIZED_STAGING_IMAGE_PUBLICATION/);
});

test("submits only the reviewed build contract and records all five digests", () => {
  for (const evidence of [
    '--config="${ROOT_DIR}/deploy/gcp/cloudbuild.yaml"',
    '--region="${REGION}"',
    '--service-account="${BUILD_SERVICE_ACCOUNT}"',
    '--ignore-file="${ROOT_DIR}/.gcloudignore"',
    "COMMIT_SHA=${EXPECTED_SHA}",
    "_ENVIRONMENT=staging",
    "_REGION=${REGION}",
    "_REPOSITORY=${REPOSITORY}",
    "_IMAGE_TAG=${EXPECTED_SHA}",
    "_BUILD_SERVICE_ACCOUNT=${BUILD_SERVICE_ACCOUNT}",
    "gcloud builds describe",
    "STAGING IMAGE PUBLICATION PASS",
    "Cloud Build staging storage, records, logs, and provenance may remain.",
    "No service was deployed and no traffic was changed.",
  ]) {
    assert.ok(controller.includes(evidence), evidence);
  }
  for (const image of [
    "samra-api",
    "samra-customer-web",
    "samra-operations-web",
    "samra-design-system-preview",
    "samra-migrations",
  ]) {
    assert.ok(controller.includes(image), image);
  }
});

test("contains no deployment, migration, secret-read, IAM-write, or Replit bypass", () => {
  assert.doesNotMatch(
    controller,
    /gcloud (?:run (?:deploy|services (?:update|replace)|jobs (?:create|update|execute|delete))|sql (?:instances|users|databases) (?:create|patch|delete)|secrets (?:create|versions add|versions access|delete)|projects add-iam-policy-binding|artifacts repositories create)/,
  );
  assert.doesNotMatch(
    controller,
    /--allow-unauthenticated|--ingress=all|postgres(?:ql)?:\/\/|worf\.replit|12345678/i,
  );
});
