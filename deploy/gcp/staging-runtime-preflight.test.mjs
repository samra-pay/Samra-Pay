import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  readStagingRuntime,
  validateRuntimeReviewEnvironment,
  validateStagingRuntime,
} from "./validate-staging-runtime.mjs";

const contract = readStagingRuntime();
const review = await readFile("deploy/gcp/review-staging-runtime.sh", "utf8");

const mutate = (operation) => {
  const copy = structuredClone(contract);
  operation(copy);
  return copy;
};

test("validates the bounded review-only staging runtime", () => {
  assert.deepEqual(validateStagingRuntime(contract), {
    schemaVersion: 1,
    status: "validated",
    environment: "staging",
    serviceCount: 4,
    imageCount: 5,
    identityCount: 7,
    operationsPortalBlocked: true,
    deploymentAuthorized: false,
  });
});

test("requires the exact staging review environment and full SHA", () => {
  const environment = {
    SAMRA_GCP_PROJECT_ID: "samra-pay-staging",
    SAMRA_GCP_ORGANIZATION_ID: "614833350075",
    SAMRA_GCP_REGION: "us-east4",
    SAMRA_GCP_OPERATOR_ACCOUNT: "me@davidhaile.com",
    SAMRA_GCP_EXPECTED_SHA: "a".repeat(40),
  };
  assert.equal(
    validateRuntimeReviewEnvironment(environment).expectedSha,
    "a".repeat(40),
  );
  assert.throws(
    () =>
      validateRuntimeReviewEnvironment({
        ...environment,
        SAMRA_GCP_PROJECT_ID: "regal-bonito-506011-u1",
      }),
    /must exactly match samra-pay-staging/,
  );
  assert.throws(
    () =>
      validateRuntimeReviewEnvironment({
        ...environment,
        SAMRA_GCP_OPERATOR_ACCOUNT: "person@gmail.com",
      }),
    /davidhaile\.com administrator/,
  );
  assert.throws(
    () =>
      validateRuntimeReviewEnvironment({
        ...environment,
        SAMRA_GCP_EXPECTED_SHA: "abc123",
      }),
    /full lowercase Git SHA/,
  );
});

test("rejects public, mutable, elevated, and automatic runtime drift", () => {
  assert.throws(() =>
    validateStagingRuntime(
      mutate((value) => {
        value.services["samra-api"].authentication = "public";
      }),
    ),
  );
  assert.throws(() =>
    validateStagingRuntime(
      mutate((value) => {
        value.imageContract.tag = "latest";
      }),
    ),
  );
  assert.throws(() =>
    validateStagingRuntime(
      mutate((value) => {
        value.identities.api =
          "934122615631-compute@developer.gserviceaccount.com";
      }),
    ),
  );
  assert.throws(() =>
    validateStagingRuntime(
      mutate((value) => {
        value.migrationJob.maxRetries = 3;
      }),
    ),
  );
  assert.throws(() =>
    validateStagingRuntime(
      mutate((value) => {
        value.services["samra-api"].environment.SAMRA_PROVIDER_MODE = "live";
      }),
    ),
  );
});

test("plans locally without reading or changing Google Cloud", () => {
  const output = execFileSync(
    "bash",
    ["deploy/gcp/review-staging-runtime.sh", "--plan"],
    { encoding: "utf8" },
  );
  assert.match(output, /Plan only\. No Google Cloud resource was changed/);
  assert.match(output, /cannot deploy, migrate, route traffic/);
});

test("reviews immutable images, keyless identities, database access, and an empty target", () => {
  for (const evidence of [
    "source commit does not match the reviewed SHA",
    "source working tree is not clean",
    "immutable Docker repository drifted",
    "full-SHA tag does not resolve to an immutable digest",
    "--managed-by=user",
    "has a user-managed key",
    "Samra project IAM drifted",
    "Samra Artifact Registry IAM drifted",
    "service-account impersonation IAM drifted",
    'audit-staging-database-access.sh" --review',
    "target service ${target} already exists",
    "target or temporary job ${target} already exists",
    "READ-ONLY STAGING RUNTIME PREFLIGHT PASS",
    "Deployment remains unauthorized",
    "The Operations Portal remains blocked",
    "REVIEW COMPLETE — NO CLOUD CHANGES",
  ]) {
    assert.ok(review.includes(evidence), evidence);
  }
});

test("contains no cloud mutation or deployment bypass", () => {
  assert.doesNotMatch(
    review,
    /gcloud (?:run (?:deploy|services (?:update|replace)|jobs (?:create|update|execute|delete))|sql (?:instances|users|databases) (?:create|patch|delete)|secrets (?:create|versions add|delete)|projects add-iam-policy-binding|artifacts repositories create)/,
  );
  assert.doesNotMatch(
    review,
    /--allow-unauthenticated|--ingress=all|--set-env-vars|--set-secrets|versions access|postgres(?:ql)?:\/\/|worf\.replit|12345678/i,
  );
});
