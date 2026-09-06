import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const activate = await readFile(
  "deploy/gcp/activate-staging-build-source-access.sh",
  "utf8",
);
const audit = await readFile(
  "deploy/gcp/audit-staging-build-source-access.sh",
  "utf8",
);
const publish = await readFile("deploy/gcp/publish-staging-images.sh", "utf8");

test("plans one exact bucket-level read-only binding without cloud access", () => {
  assert.match(activate, /MODE="\$\{1:---plan\}"/);
  assert.match(
    activate,
    /Plan only\. No Google Cloud state was read or changed\./,
  );
  assert.match(activate, /SOURCE_BUCKET="\$\{PROJECT_ID\}_cloudbuild"/);
  assert.match(activate, /samra-cloud-build-staging@\$\{PROJECT_ID\}/);
  assert.match(activate, /REQUIRED_ROLE="roles\/storage\.objectViewer"/);
  assert.match(activate, /AUTHORIZED_STAGING_BUILD_SOURCE_ACCESS/);
  assert.ok(
    activate.indexOf('if [[ "${MODE}" == "--plan" ]]') <
      activate.indexOf("command -v gcloud"),
  );
});

test("mutates only the exact source bucket after review and authorization", () => {
  const mutation = activate.indexOf(
    'gcloud storage buckets add-iam-policy-binding "gs://${SOURCE_BUCKET}"',
  );
  assert.ok(
    mutation >
      activate.indexOf("READ-ONLY STAGING BUILD SOURCE ACCESS REVIEW PASS"),
  );
  assert.ok(
    mutation > activate.indexOf("SAMRA_GCP_BUILD_SOURCE_ACCESS_APPLY}"),
  );
  assert.match(activate, /--member="\$\{BUILD_MEMBER\}"/);
  assert.match(activate, /--role="\$\{REQUIRED_ROLE\}"/);
  assert.match(activate, /--condition=None/);
  assert.match(activate, /Current state: \$\{ACCESS_STATE\}/);
});

test("rejects public, broad, conditional, project-level, and key-based access", () => {
  for (const source of [activate, audit, publish]) {
    assert.match(source, /allUsers/);
    assert.match(source, /allAuthenticatedUsers/);
    assert.match(source, /condition/);
  }
  for (const source of [activate, audit]) {
    assert.match(source, /--managed-by=user/);
    assert.doesNotMatch(source, /service-accounts keys create/);
  }
  assert.doesNotMatch(
    activate,
    /gcloud projects add-iam-policy-binding|roles\/storage\.(?:admin|objectAdmin|objectUser)|gcloud storage buckets (?:create|delete|update)|gcloud builds submit|gcloud run (?:deploy|jobs)|gcloud secrets|allow-unauthenticated|worf\.replit/i,
  );
});

test("independent audit is read-only and proves exact project and bucket IAM", () => {
  for (const required of [
    "gcloud projects get-iam-policy",
    "gcloud storage buckets describe",
    "gcloud storage buckets get-iam-policy",
    "roles/logging.logWriter",
    "roles/serviceusage.serviceUsageConsumer",
    "roles/storage.objectViewer",
    "READ-ONLY STAGING BUILD SOURCE ACCESS POST-AUDIT PASS",
  ]) {
    assert.ok(audit.includes(required), required);
  }
  assert.doesNotMatch(
    audit,
    /add-iam-policy-binding|remove-iam-policy-binding|gcloud builds submit|gcloud storage (?:cp|rm)|gcloud run deploy|gcloud secrets versions add/,
  );
});

test("image publication fails preflight before uploading when source access is not exact", () => {
  const bucketCheck = publish.indexOf(
    'gcloud storage buckets get-iam-policy "gs://${SOURCE_BUCKET}"',
  );
  const tagCheck = publish.indexOf(
    'node "${ROOT_DIR}/deploy/gcp/verify-staging-image-absence.mjs"',
  );
  const buildSubmit = publish.indexOf("gcloud builds submit");
  assert.ok(bucketCheck >= 0);
  assert.ok(bucketCheck < tagCheck);
  assert.ok(tagCheck < buildSubmit);
  assert.match(publish, /SOURCE_BUCKET_ROLE="roles\/storage\.objectViewer"/);
  assert.match(publish, /Build source access: exact bucket-level read-only/);
  assert.doesNotMatch(
    publish,
    /add-iam-policy-binding|remove-iam-policy-binding/,
  );
});
