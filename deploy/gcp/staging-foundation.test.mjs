import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  readStagingFoundation,
  validateFoundationEnvironment,
  validateStagingFoundation,
} from "./validate-staging-foundation.mjs";

const foundation = readStagingFoundation();
const script = await readFile(
  "deploy/gcp/bootstrap-staging-foundation.sh",
  "utf8",
);

test("locks one review-only synthetic staging identity", () => {
  assert.deepEqual(validateStagingFoundation(foundation), {
    schemaVersion: 1,
    status: "validated",
    projectId: "samra-pay-staging",
    organizationId: "614833350075",
    region: "us-east4",
    repository: "samra-staging",
    budgetAlertUsd: 50,
    samraManagedApiCount: 14,
    firebaseManagedApiCount: 15,
    samraServiceAccountCount: 7,
    firebaseManagedServiceAccountPatternCount: 2,
  });
  assert.deepEqual(
    validateFoundationEnvironment({
      SAMRA_GCP_PROJECT_ID: "samra-pay-staging",
      SAMRA_GCP_ORGANIZATION_ID: "614833350075",
      SAMRA_GCP_REGION: "us-east4",
      SAMRA_GCP_OPERATOR_ACCOUNT: "operator@davidhaile.com",
    }).operator,
    "operator@davidhaile.com",
  );
});

test("rejects project, organization, region, and operator drift", () => {
  const valid = {
    SAMRA_GCP_PROJECT_ID: "samra-pay-staging",
    SAMRA_GCP_ORGANIZATION_ID: "614833350075",
    SAMRA_GCP_REGION: "us-east4",
    SAMRA_GCP_OPERATOR_ACCOUNT: "operator@davidhaile.com",
  };
  for (const [key, value] of [
    ["SAMRA_GCP_PROJECT_ID", "samra-pay-production"],
    ["SAMRA_GCP_ORGANIZATION_ID", "123"],
    ["SAMRA_GCP_REGION", "us-west1"],
    ["SAMRA_GCP_OPERATOR_ACCOUNT", "external@example.com"],
  ]) {
    assert.throws(() =>
      validateFoundationEnvironment({ ...valid, [key]: value }),
    );
  }
});

test("keeps Firebase bounded to distribution and future app registration", () => {
  assert.equal(foundation.firebase.addToExistingProject, true);
  assert.equal(foundation.firebase.additionFullyReversible, false);
  assert.equal(foundation.firebase.googleAnalyticsEnabled, false);
  assert.equal(foundation.firebase.geminiInFirebaseEnabled, false);
  assert.equal(foundation.firebase.authenticationEnabled, false);
  assert.equal(foundation.firebase.firestoreEnabled, false);
  assert.equal(foundation.firebase.hostingEnabled, false);
  assert.equal(
    foundation.firebase.appRegistrationBlockedUntilIdentifiersAreLocked,
    true,
  );
  assert.equal(foundation.firebase.providerManagedEffects.apis.length, 15);
  assert.deepEqual(
    foundation.firebase.providerManagedEffects.serviceAccountPatterns,
    [
      "service-${PROJECT_NUMBER}@gcp-sa-firebase.iam.gserviceaccount.com",
      "firebase-adminsdk-${RANDOM5}@${PROJECT_ID}.iam.gserviceaccount.com",
    ],
  );
});

test("requires plan-first apply and verifies organization and billing", () => {
  assert.match(script, /MODE="\$\{1:---plan\}"/);
  assert.match(script, /AUTHORIZED_STAGING_FOUNDATION/);
  assert.match(script, /gcloud projects describe/);
  assert.match(script, /gcloud billing projects describe/);
  assert.match(script, /Plan only\. No Google Cloud resource was changed\./);
  assert.doesNotMatch(
    script,
    /gcloud projects create|gcloud billing projects link/,
  );
});

test("creates only reviewed keyless staging foundation resources", () => {
  for (const required of [
    "gcloud services enable",
    "--immutable-tags",
    "gcloud iam service-accounts create",
    "roles/artifactregistry.writer",
    "roles/artifactregistry.reader",
    "roles/logging.logWriter",
    "roles/serviceusage.serviceUsageConsumer",
    "roles/run.admin",
    "roles/cloudsql.client",
    "roles/secretmanager.secretAccessor",
    "--managed-by=user",
    "Secret versions created: 0",
    "Cloud SQL instances created: 0",
    "Cloud Run services created: 0",
  ]) {
    assert.ok(
      script.includes(required),
      `Missing foundation control: ${required}`,
    );
  }
  assert.doesNotMatch(
    script,
    /service-accounts keys create|secrets versions add|gcloud\s+(?:beta\s+)?sql\s+instances\s+create|gcloud\s+run\s+deploy|allow-unauthenticated|worf\.replit|postgres(?:ql)?:\/\//i,
  );
});

test("documents every intentionally deferred resource", () => {
  assert.deepEqual(foundation.foundationDoesNotCreate, [
    "Cloud SQL instance or database",
    "Cloud Run service or job",
    "load balancer or public endpoint",
    "Firebase application registration",
    "secret version or credential",
    "service-account key",
    "real provider integration",
    "Replit change",
  ]);
});
