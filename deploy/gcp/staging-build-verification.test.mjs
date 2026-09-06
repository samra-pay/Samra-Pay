import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

const activate = await readFile(
  "deploy/gcp/activate-staging-build-verification.sh",
  "utf8",
);
const audit = await readFile(
  "deploy/gcp/audit-staging-build-verification.sh",
  "utf8",
);
const publish = await readFile("deploy/gcp/publish-staging-images.sh", "utf8");

test("plans one API-only activation without reading cloud state", () => {
  const output = execFileSync(
    "bash",
    ["deploy/gcp/activate-staging-build-verification.sh", "--plan"],
    {
      encoding: "utf8",
      env: { ...process.env, SAMRA_GCP_EXPECTED_SHA: "a".repeat(40) },
    },
  );

  assert.match(output, /Plan only\. No Google Cloud state was read or changed/);
  assert.match(output, /containeranalysis\.googleapis\.com/);
  assert.match(output, /roles\/cloudbuild\.serviceAgent/);
  assert.match(output, /AUTHORIZED_STAGING_BUILD_VERIFICATION/);
  assert.match(output, /Apply cannot change IAM/);
});

test("enables only Container Analysis after review and authorization", () => {
  const review = activate.indexOf(
    "READ-ONLY STAGING BUILD VERIFICATION REVIEW PASS",
  );
  const authorization = activate.indexOf(
    '[[ "${SAMRA_GCP_BUILD_VERIFICATION_APPLY}" == "${AUTHORIZATION}" ]]',
  );
  const mutation = activate.indexOf('gcloud services enable "${REQUIRED_API}"');

  assert.ok(review >= 0);
  assert.ok(authorization > review);
  assert.ok(mutation > authorization);
  assert.match(activate, /REQUIRED_API="containeranalysis\.googleapis\.com"/);
  assert.match(activate, /Service agent IAM: unchanged and exact/);
  assert.doesNotMatch(
    activate,
    /add-iam-policy-binding|remove-iam-policy-binding|gcloud builds submit|gcloud run deploy|gcloud artifacts docker images delete|gcloud secrets|worf\.replit/i,
  );
});

test("requires exact unconditioned Cloud Build service-agent IAM", () => {
  for (const source of [activate, audit, publish]) {
    assert.match(source, /roles\/cloudbuild\.serviceAgent/);
    assert.match(source, /condition/);
    assert.match(source, /service-\$\{PROJECT_NUMBER\}@gcp-sa-cloudbuild/);
  }
  assert.match(activate, /service-agent IAM is missing, broader than reviewed/);
  assert.match(audit, /service-agent IAM is not exact/);
});

test("independent audit is read-only and checks API plus service agent", () => {
  for (const required of [
    "gcloud services list --enabled",
    "gcloud projects get-iam-policy",
    "containeranalysis.googleapis.com",
    "roles/cloudbuild.serviceAgent",
    "READ-ONLY STAGING BUILD VERIFICATION POST-AUDIT PASS",
  ]) {
    assert.ok(audit.includes(required), required);
  }
  assert.doesNotMatch(
    audit,
    /gcloud services enable|add-iam-policy-binding|remove-iam-policy-binding|gcloud builds submit|gcloud run deploy/,
  );
});

test("image publication fails before tag checks and upload when verification is not ready", () => {
  const apiCheck = publish.indexOf(
    'ENABLED_VERIFICATION_API="$(gcloud services list --enabled',
  );
  const agentCheck = publish.indexOf(
    '"${CLOUD_BUILD_SERVICE_AGENT}"',
    apiCheck,
  );
  const tagCheck = publish.indexOf(
    'node "${ROOT_DIR}/deploy/gcp/verify-staging-image-absence.mjs"',
  );
  const submit = publish.indexOf("gcloud builds submit");

  assert.ok(apiCheck >= 0);
  assert.ok(agentCheck > apiCheck);
  assert.ok(tagCheck > agentCheck);
  assert.ok(submit > tagCheck);
  assert.match(publish, /Container Analysis API is not enabled/);
  assert.match(
    publish,
    /Build verification: Container Analysis API and exact service-agent IAM/,
  );
});
