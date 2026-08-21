#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MODE="${1:---plan}"

if [[ "${MODE}" != "--plan" && "${MODE}" != "--review" && "${MODE}" != "--apply" ]]; then
  echo "Usage: $0 [--plan|--review|--apply]" >&2
  exit 2
fi

: "${SAMRA_GCP_PROJECT_ID:=samra-pay-staging}"
: "${SAMRA_GCP_ORGANIZATION_ID:=614833350075}"
: "${SAMRA_GCP_REGION:=us-east4}"
: "${SAMRA_GCP_REPOSITORY:=samra-staging}"
: "${SAMRA_GCP_OPERATOR_ACCOUNT:=}"
: "${SAMRA_GCP_EXPECTED_SHA:=$(git -C "${ROOT_DIR}" rev-parse HEAD)}"
: "${SAMRA_GCP_IMAGE_BUILD_APPLY:=}"

PROJECT_ID="${SAMRA_GCP_PROJECT_ID}"
ORGANIZATION_ID="${SAMRA_GCP_ORGANIZATION_ID}"
REGION="${SAMRA_GCP_REGION}"
REPOSITORY="${SAMRA_GCP_REPOSITORY}"
OPERATOR="${SAMRA_GCP_OPERATOR_ACCOUNT}"
EXPECTED_SHA="${SAMRA_GCP_EXPECTED_SHA}"
BUILD_SERVICE_ACCOUNT="samra-cloud-build-staging@${PROJECT_ID}.iam.gserviceaccount.com"
BUILD_SERVICE_ACCOUNT_RESOURCE="projects/${PROJECT_ID}/serviceAccounts/${BUILD_SERVICE_ACCOUNT}"
SOURCE_BUCKET="${PROJECT_ID}_cloudbuild"
SOURCE_BUCKET_ROLE="roles/storage.objectViewer"
IMAGE_BASE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}"
AUTHORIZATION="AUTHORIZED_STAGING_IMAGE_PUBLICATION"
IMAGE_NAMES=(
  samra-api
  samra-customer-web
  samra-operations-web
  samra-design-system-preview
  samra-migrations
)

[[ "${PROJECT_ID}" == "samra-pay-staging" ]] || { echo "STOP: project must be samra-pay-staging" >&2; exit 1; }
[[ "${ORGANIZATION_ID}" == "614833350075" ]] || { echo "STOP: organization must be 614833350075" >&2; exit 1; }
[[ "${REGION}" == "us-east4" ]] || { echo "STOP: region must be us-east4" >&2; exit 1; }
[[ "${REPOSITORY}" == "samra-staging" ]] || { echo "STOP: repository must be samra-staging" >&2; exit 1; }

SAMRA_BUILD_ENVIRONMENT="staging" \
SAMRA_BUILD_EXPECTED_SERVICE_ACCOUNT="${BUILD_SERVICE_ACCOUNT}" \
SAMRA_BUILD_IMAGE_TAG="${EXPECTED_SHA}" \
SAMRA_BUILD_PROJECT_ID="${PROJECT_ID}" \
SAMRA_BUILD_REGION="${REGION}" \
SAMRA_BUILD_REPOSITORY="${REPOSITORY}" \
SAMRA_BUILD_SOURCE_SHA="${EXPECTED_SHA}" \
  node "${ROOT_DIR}/deploy/gcp/validate-build-inputs.mjs" >/dev/null

if [[ "${MODE}" == "--plan" ]]; then
  cat <<PLAN
Plan only. No Google Cloud state was read or changed.

The staging image publication review will:
  1. bind the source to one clean full Git SHA;
  2. verify the exact staging project, organization, region, billing, and labels;
  3. verify the immutable Artifact Registry repository and dedicated keyless build identity;
  4. prove the build identity has only its reviewed project, repository, source-bucket, and impersonation grants;
  5. require all five full-SHA tags to be absent before publication; and
  6. submit the already-reviewed Cloud Build definition only after an explicit apply authorization.

Apply uploads only the .gcloudignore-filtered source, creates a Cloud Build record,
stores logs and provenance, may create or reuse Google-managed source-staging
storage, publishes five immutable images, and records their digests. It cannot
deploy Cloud Run, execute a migration, route traffic, read a secret, change IAM,
expose an endpoint, enable a provider, modify Replit, or touch production.

Expected source: ${EXPECTED_SHA}
Expected registry: ${IMAGE_BASE}
Required apply authorization: ${AUTHORIZATION}
PLAN
  exit 0
fi

command -v gcloud >/dev/null 2>&1 || {
  echo "gcloud is required; run review or apply from authenticated Google Cloud Shell." >&2
  exit 1
}

[[ -n "${OPERATOR}" && "${OPERATOR}" =~ ^[^@[:space:]]+@davidhaile\.com$ ]] || {
  echo "STOP: SAMRA_GCP_OPERATOR_ACCOUNT must be a davidhaile.com administrator" >&2
  exit 1
}
[[ "$(gcloud config get-value account 2>/dev/null)" == "${OPERATOR}" ]] || { echo "STOP: wrong Google account" >&2; exit 1; }
[[ "$(gcloud config get-value project 2>/dev/null)" == "${PROJECT_ID}" ]] || { echo "STOP: wrong Google Cloud project" >&2; exit 1; }
[[ "$(gcloud projects describe "${PROJECT_ID}" --format='value(parent.type)')" == "organization" ]] || { echo "STOP: project parent is not an organization" >&2; exit 1; }
[[ "$(gcloud projects describe "${PROJECT_ID}" --format='value(parent.id)')" == "${ORGANIZATION_ID}" ]] || { echo "STOP: wrong organization" >&2; exit 1; }
[[ "$(gcloud billing projects describe "${PROJECT_ID}" --format='value(billingEnabled)')" == "True" ]] || { echo "STOP: billing is not enabled" >&2; exit 1; }
[[ "$(git -C "${ROOT_DIR}" rev-parse HEAD)" == "${EXPECTED_SHA}" ]] || { echo "STOP: source commit does not match the reviewed SHA" >&2; exit 1; }
[[ -z "$(git -C "${ROOT_DIR}" status --porcelain)" ]] || { echo "STOP: source working tree is not clean" >&2; exit 1; }

for label in environment=staging data_classification=synthetic application=samra-pay firebase=enabled; do
  key="${label%%=*}"
  expected="${label#*=}"
  actual="$(gcloud projects describe "${PROJECT_ID}" --format="value(labels.${key})")"
  [[ "${actual}" == "${expected}" ]] || { echo "STOP: project label ${key} drifted" >&2; exit 1; }
done

gcloud artifacts repositories describe "${REPOSITORY}" \
  --project="${PROJECT_ID}" --location="${REGION}" --format=json | \
  node -e '
    const fs = require("fs");
    const repository = JSON.parse(fs.readFileSync(0, "utf8"));
    if (repository.format !== "DOCKER" || repository.dockerConfig?.immutableTags !== true) {
      process.stderr.write("STOP: immutable Docker repository drifted\n");
      process.exit(1);
    }
  '

gcloud iam service-accounts describe "${BUILD_SERVICE_ACCOUNT}" \
  --project="${PROJECT_ID}" >/dev/null
USER_KEYS="$(gcloud iam service-accounts keys list \
  --iam-account="${BUILD_SERVICE_ACCOUNT}" --project="${PROJECT_ID}" \
  --managed-by=user --format='value(name)')"
[[ -z "${USER_KEYS}" ]] || { echo "STOP: build identity has a user-managed key" >&2; exit 1; }

gcloud projects get-iam-policy "${PROJECT_ID}" --format=json | \
  node -e '
    const fs = require("fs");
    const policy = JSON.parse(fs.readFileSync(0, "utf8"));
    const expectedMember = `serviceAccount:${process.argv[1]}`;
    const actual = [];
    for (const binding of policy.bindings || []) {
      if ((binding.members || []).includes(expectedMember)) actual.push(binding.role);
    }
    const expected = ["roles/logging.logWriter", "roles/serviceusage.serviceUsageConsumer"];
    if (JSON.stringify(actual.sort()) !== JSON.stringify(expected.sort())) {
      process.stderr.write("STOP: build identity project IAM drifted\n");
      process.exit(1);
    }
  ' "${BUILD_SERVICE_ACCOUNT}"

gcloud artifacts repositories get-iam-policy "${REPOSITORY}" \
  --project="${PROJECT_ID}" --location="${REGION}" --format=json | \
  node -e '
    const fs = require("fs");
    const policy = JSON.parse(fs.readFileSync(0, "utf8"));
    const expectedMember = `serviceAccount:${process.argv[1]}`;
    const actual = [];
    for (const binding of policy.bindings || []) {
      if ((binding.members || []).includes(expectedMember)) actual.push(binding.role);
    }
    if (JSON.stringify(actual.sort()) !== JSON.stringify(["roles/artifactregistry.writer"])) {
      process.stderr.write("STOP: build identity repository IAM drifted\n");
      process.exit(1);
    }
  ' "${BUILD_SERVICE_ACCOUNT}"

gcloud iam service-accounts get-iam-policy "${BUILD_SERVICE_ACCOUNT}" \
  --project="${PROJECT_ID}" --format=json | \
  node -e '
    const fs = require("fs");
    const policy = JSON.parse(fs.readFileSync(0, "utf8"));
    const expected = `user:${process.argv[1]}`;
    const members = (policy.bindings || [])
      .filter((binding) => binding.role === "roles/iam.serviceAccountUser")
      .flatMap((binding) => binding.members || [])
      .sort();
    if (JSON.stringify(members) !== JSON.stringify([expected])) {
      process.stderr.write("STOP: build identity impersonation IAM drifted\n");
      process.exit(1);
    }
  ' "${OPERATOR}"

BUCKET_NAME="$(gcloud storage buckets describe "gs://${SOURCE_BUCKET}" --format='value(name)')"
[[ "${BUCKET_NAME}" == "${SOURCE_BUCKET}" || "${BUCKET_NAME}" == "projects/_/buckets/${SOURCE_BUCKET}" ]] || {
  echo "STOP: exact Cloud Build source bucket is missing" >&2
  exit 1
}

gcloud storage buckets get-iam-policy "gs://${SOURCE_BUCKET}" --format=json | \
  node -e '
    const fs = require("fs");
    const policy = JSON.parse(fs.readFileSync(0, "utf8"));
    const expectedMember = `serviceAccount:${process.argv[1]}`;
    const expectedRole = process.argv[2];
    const publicMembers = new Set(["allUsers", "allAuthenticatedUsers"]);
    const bindings = policy.bindings || [];
    if (bindings.some((binding) => (binding.members || []).some((member) => publicMembers.has(member)))) {
      process.stderr.write("STOP: Cloud Build source bucket has public IAM\n");
      process.exit(1);
    }
    const actual = bindings
      .filter((binding) => (binding.members || []).includes(expectedMember))
      .map((binding) => ({ role: binding.role, condition: binding.condition ?? null }));
    const expected = [{ role: expectedRole, condition: null }];
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      process.stderr.write("STOP: build identity source-bucket IAM is missing, broader than reviewed, or otherwise drifted\n");
      process.exit(1);
    }
  ' "${BUILD_SERVICE_ACCOUNT}" "${SOURCE_BUCKET_ROLE}"

for name in "${IMAGE_NAMES[@]}"; do
  image="${IMAGE_BASE}/${name}:${EXPECTED_SHA}"
  if gcloud artifacts docker images describe "${image}" \
    --project="${PROJECT_ID}" >/dev/null 2>&1; then
    echo "STOP: immutable image tag already exists for ${name}" >&2
    exit 1
  fi
done

echo "READ-ONLY STAGING IMAGE PUBLICATION REVIEW PASS"
echo "Source: ${EXPECTED_SHA}"
echo "Images: 5 full-SHA tags are absent"
echo "Build identity: dedicated, keyless, and exact-IAM"
echo "Build source access: exact bucket-level read-only"

if [[ "${MODE}" == "--review" ]]; then
  echo "REVIEW COMPLETE — NO CLOUD CHANGES"
  exit 0
fi

[[ "${SAMRA_GCP_IMAGE_BUILD_APPLY}" == "${AUTHORIZATION}" ]] || {
  echo "STOP: set SAMRA_GCP_IMAGE_BUILD_APPLY=${AUTHORIZATION}" >&2
  exit 1
}

BUILD_ID="$(gcloud builds submit \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --service-account="${BUILD_SERVICE_ACCOUNT_RESOURCE}" \
  --ignore-file="${ROOT_DIR}/.gcloudignore" \
  --config="${ROOT_DIR}/deploy/gcp/cloudbuild.yaml" \
  --substitutions="COMMIT_SHA=${EXPECTED_SHA},_ENVIRONMENT=staging,_REGION=${REGION},_REPOSITORY=${REPOSITORY},_IMAGE_TAG=${EXPECTED_SHA},_BUILD_SERVICE_ACCOUNT=${BUILD_SERVICE_ACCOUNT}" \
  --format='value(id)' \
  "${ROOT_DIR}")"

[[ -n "${BUILD_ID}" ]] || { echo "STOP: Cloud Build did not return a build ID" >&2; exit 1; }
[[ "$(gcloud builds describe "${BUILD_ID}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --format='value(status)')" == "SUCCESS" ]] || {
  echo "STOP: Cloud Build ${BUILD_ID} did not complete successfully" >&2
  exit 1
}

resolve_digest() {
  local name="$1"
  local image="${IMAGE_BASE}/${name}:${EXPECTED_SHA}"
  local digest
  digest="$(gcloud artifacts docker images describe "${image}" \
    --project="${PROJECT_ID}" --format=json | node -e '
      const fs = require("fs");
      const image = JSON.parse(fs.readFileSync(0, "utf8"));
      const summary = image.image_summary || image.imageSummary || image;
      const value = summary.fully_qualified_digest || summary.fullyQualifiedDigest;
      if (typeof value === "string") process.stdout.write(value);
    ')"
  [[ "${digest}" == "${IMAGE_BASE}/${name}@sha256:"* ]] || {
    echo "STOP: ${name} did not resolve to an immutable digest" >&2
    exit 1
  }
  printf '%s\n' "${digest}"
}

echo "STAGING IMAGE PUBLICATION PASS"
echo "Build ID: ${BUILD_ID}"
for name in "${IMAGE_NAMES[@]}"; do
  printf '%s: %s\n' "${name}" "$(resolve_digest "${name}")"
done
echo "Build source was filtered by .gcloudignore; Cloud Build staging storage, records, logs, and provenance may remain."
echo "No service was deployed and no traffic was changed."
