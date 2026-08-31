import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  readComingSoonProductionFoundation,
  validateComingSoonProductionFoundation,
} from "./validate-coming-soon-production-foundation.mjs";

const planScript = await readFile(
  "deploy/gcp/plan-coming-soon-production-foundation.sh",
  "utf8",
);

test("validates one applied and independently verified production foundation", () => {
  assert.deepEqual(validateComingSoonProductionFoundation(), {
    schemaVersion: 1,
    status: "validated-applied-verified",
    phase: "coming-soon-production-foundation",
    boundaryStatus: "foundation-applied-verified",
    projectId: "samra-pay-production",
    monthlyBudgetUsd: 25,
    canonicalDomain: "www.samrapay.com",
    apiCount: 15,
    serviceAccountCount: 5,
    secretMetadataCount: 2,
    preflightEvidenceStatus: "passed",
    activationEvidenceStatus: "passed-independent-post-audit",
    activationController:
      "deploy/gcp/activate-coming-soon-production-foundation.sh",
    estimatedMonthlyPlanCostUsd: 0,
    cloudStateRead: false,
    cloudMutationAuthorized: false,
    dnsMutationAuthorized: false,
  });
});

test("rejects confirmed boundary drift and an apply authorization", () => {
  for (const mutate of [
    (value) =>
      (value.productionBoundary.projectId = "samra-pay-production-alt"),
    (value) => (value.productionBoundary.projectId = "samra-pay-staging"),
    (value) => (value.productionBoundary.projectNumber = "1"),
    (value) => (value.productionBoundary.region = "us-west1"),
    (value) => (value.productionBoundary.dataClassification = "synthetic"),
    (value) => (value.productionBoundary.monthlyBudgetUsd = 26),
    (value) => (value.productionBoundary.apexDomain = "example.com"),
    (value) => (value.productionBoundary.canonicalHost = "apex"),
    (value) =>
      (value.productionBoundary.billingAccountSourceProjectId =
        "another-project"),
    (value) => (value.preflightEvidence.workflowRunId = "1"),
    (value) => (value.activationEvidence.sourceSha = "a".repeat(40)),
    (value) => (value.activationEvidence.secretVersionCount = 1),
    (value) => (value.activation.automaticApply = true),
    (value) => (value.applyAuthorized = true),
  ]) {
    const foundation = structuredClone(readComingSoonProductionFoundation());
    mutate(foundation);
    assert.throws(() => validateComingSoonProductionFoundation(foundation));
  }
});

test("locks the API allowlist and keeps Firebase and vendor identity outside", () => {
  const foundation = readComingSoonProductionFoundation();
  assert.deepEqual(foundation.samraManagedApis, [
    "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "containeranalysis.googleapis.com",
    "compute.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "logging.googleapis.com",
    "monitoring.googleapis.com",
    "run.googleapis.com",
    "secretmanager.googleapis.com",
    "servicenetworking.googleapis.com",
    "serviceusage.googleapis.com",
    "sqladmin.googleapis.com",
    "sts.googleapis.com",
  ]);
  assert.doesNotMatch(
    JSON.stringify(foundation.samraManagedApis),
    /firebase|identitytoolkit|securetoken|auth0|persona|crossmint/iu,
  );

  const drift = structuredClone(foundation);
  drift.samraManagedApis.push("firebase.googleapis.com");
  assert.throws(
    () => validateComingSoonProductionFoundation(drift),
    /API allowlist/,
  );
});

test("separates keyless identities and runtime from migration secret metadata", () => {
  const foundation = readComingSoonProductionFoundation();
  assert.equal(
    new Set(Object.values(foundation.serviceAccounts)).size,
    Object.values(foundation.serviceAccounts).length,
  );
  assert.deepEqual(
    foundation.resourceRoleBindings.runtimeDatabaseSecretAccessors,
    ["api"],
  );
  assert.deepEqual(
    foundation.resourceRoleBindings.migrationDatabaseSecretAccessors,
    ["migrations"],
  );
  assert.ok(
    foundation.secretMetadata.every((secret) => secret.createVersion === false),
  );

  const sharedIdentity = structuredClone(foundation);
  sharedIdentity.serviceAccounts.migrations =
    sharedIdentity.serviceAccounts.api;
  assert.throws(
    () => validateComingSoonProductionFoundation(sharedIdentity),
    /trust boundaries/,
  );

  const secretValue = structuredClone(foundation);
  secretValue.secretMetadata[0].createVersion = true;
  assert.throws(
    () => validateComingSoonProductionFoundation(secretValue),
    /secret metadata/,
  );
});

test("rejects over-broad project IAM", () => {
  const foundation = structuredClone(readComingSoonProductionFoundation());
  foundation.projectRoleBindings.deployer.push("roles/owner");
  assert.throws(
    () => validateComingSoonProductionFoundation(foundation),
    /Over-broad/,
  );
});

test("runs only a local zero-cost plan and exposes no apply mode", () => {
  const output = execFileSync(
    "bash",
    ["deploy/gcp/plan-coming-soon-production-foundation.sh", "--plan"],
    { encoding: "utf8" },
  );
  assert.match(output, /COMING-SOON PRODUCTION FOUNDATION RECOVERY PLAN PASS/);
  assert.match(output, /Plan cost: USD 0 per month/);
  assert.match(output, /Cloud state read: no/);
  assert.match(output, /Project ID: samra-pay-production/);
  assert.match(output, /Region: us-east4/);
  assert.match(output, /Data classification: customer-pii/);
  assert.match(output, /Monthly budget alert: USD 25/);
  assert.match(output, /verified exact match to samra-pay-staging/);
  assert.match(output, /canonical www\.samrapay\.com/);
  assert.match(output, /alert boundary, not a spending cap/);
  assert.match(output, /Protected preflight evidence:/);
  assert.match(output, /GitHub run: 33334655501/);
  assert.match(output, /five distinct keyless/);
  assert.match(output, /zero versions/);
  assert.match(output, /automatic or GitHub-based apply remains disabled/);
  assert.match(output, /separately reviewed and authorized production/);
  assert.match(output, /PLAN COMPLETE — NO CLOUD OR DNS CHANGES/);

  const rejectedApply = spawnSync(
    "bash",
    ["deploy/gcp/plan-coming-soon-production-foundation.sh", "--apply"],
    { encoding: "utf8" },
  );
  assert.equal(rejectedApply.status, 2);
  assert.match(rejectedApply.stderr, /has no review or apply mode/);

  assert.doesNotMatch(
    planScript,
    /gcloud|gh |curl|terraform|pulumi|kubectl|--allow-unauthenticated/iu,
  );
  assert.doesNotMatch(
    planScript,
    /projects create|billing projects link|services enable|artifacts repositories create|secrets create|run deploy|dns record-sets transaction/iu,
  );
});
