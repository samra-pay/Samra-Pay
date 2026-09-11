#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MODE="${1:---plan}"

if [[ "${MODE}" != "--plan" && "${MODE}" != "--review" && "${MODE}" != "--apply" ]]; then
  echo "Usage: $0 [--plan|--review|--apply]" >&2
  exit 2
fi

: "${SAMRA_GCP_PROJECT_ID:=samra-pay-staging}"
: "${SAMRA_GCP_ORGANIZATION_ID:=993968777863}"
: "${SAMRA_GCP_OPERATOR_ACCOUNT:=}"
: "${SAMRA_GCP_EXPECTED_SHA:=$(git -C "${ROOT_DIR}" rev-parse HEAD)}"
: "${SAMRA_GCP_BUILD_SOURCE_ACCESS_APPLY:=}"

PROJECT_ID="${SAMRA_GCP_PROJECT_ID}"
ORGANIZATION_ID="${SAMRA_GCP_ORGANIZATION_ID}"
OPERATOR="${SAMRA_GCP_OPERATOR_ACCOUNT}"
EXPECTED_SHA="${SAMRA_GCP_EXPECTED_SHA}"
SOURCE_BUCKET="${PROJECT_ID}_cloudbuild"
BUILD_SERVICE_ACCOUNT="samra-cloud-build-staging@${PROJECT_ID}.iam.gserviceaccount.com"
BUILD_MEMBER="serviceAccount:${BUILD_SERVICE_ACCOUNT}"
REQUIRED_ROLE="roles/storage.objectViewer"
AUTHORIZATION="AUTHORIZED_STAGING_BUILD_SOURCE_ACCESS"

[[ "${PROJECT_ID}" == "samra-pay-staging" ]] || { echo "STOP: project must be samra-pay-staging" >&2; exit 1; }
[[ "${ORGANIZATION_ID}" == "993968777863" ]] || { echo "STOP: organization must be 993968777863" >&2; exit 1; }

if [[ "${MODE}" == "--plan" ]]; then
  cat <<PLAN
Plan only. No Google Cloud state was read or changed.

The staging build-source access review will:
  1. bind the review to one clean full Git SHA and the exact staging boundary;
  2. verify the existing dedicated build identity remains keyless and has exact project IAM;
  3. verify the existing Cloud Build-created source bucket is not public;
  4. reject any existing bucket role for the build identity other than one unconditioned ${REQUIRED_ROLE} binding; and
  5. add that one bucket-level read-only binding only after explicit apply authorization.

Apply cannot create or delete a bucket, grant project-level storage access,
submit a build, publish an image, deploy a service, read a secret, alter Replit,
touch production, or remove the failed-attempt source archives.

Expected source: ${EXPECTED_SHA}
Exact bucket: gs://${SOURCE_BUCKET}
Exact member: ${BUILD_MEMBER}
Exact role: ${REQUIRED_ROLE}
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
[[ "$(git -C "${ROOT_DIR}" rev-parse HEAD)" == "${EXPECTED_SHA}" ]] || { echo "STOP: source commit does not match the authorized SHA" >&2; exit 1; }
[[ -z "$(git -C "${ROOT_DIR}" status --porcelain)" ]] || { echo "STOP: source working tree is not clean" >&2; exit 1; }

for label in environment=staging data_classification=synthetic application=samra-pay firebase=enabled; do
  key="${label%%=*}"
  expected="${label#*=}"
  actual="$(gcloud projects describe "${PROJECT_ID}" --format="value(labels.${key})")"
  [[ "${actual}" == "${expected}" ]] || { echo "STOP: project label ${key} drifted" >&2; exit 1; }
done

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

BUCKET_NAME="$(gcloud storage buckets describe "gs://${SOURCE_BUCKET}" --format='value(name)')"
[[ "${BUCKET_NAME}" == "${SOURCE_BUCKET}" || "${BUCKET_NAME}" == "projects/_/buckets/${SOURCE_BUCKET}" ]] || {
  echo "STOP: exact Cloud Build source bucket is missing" >&2
  exit 1
}

inspect_bucket_policy() {
  gcloud storage buckets get-iam-policy "gs://${SOURCE_BUCKET}" --format=json | \
    node -e '
      const fs = require("fs");
      const policy = JSON.parse(fs.readFileSync(0, "utf8"));
      const expectedMember = process.argv[1];
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
      if (actual.length === 0) {
        process.stdout.write("missing");
        process.exit(0);
      }
      const expected = [{ role: expectedRole, condition: null }];
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        process.stderr.write("STOP: build identity source-bucket IAM is broader than the reviewed binding or otherwise drifted\n");
        process.exit(1);
      }
      process.stdout.write("ready");
    ' "${BUILD_MEMBER}" "${REQUIRED_ROLE}"
}

ACCESS_STATE="$(inspect_bucket_policy)"

echo "READ-ONLY STAGING BUILD SOURCE ACCESS REVIEW PASS"
echo "Source: ${EXPECTED_SHA}"
echo "Bucket: gs://${SOURCE_BUCKET}"
echo "Member: ${BUILD_MEMBER}"
echo "Required role: ${REQUIRED_ROLE}"
echo "Current state: ${ACCESS_STATE}"

if [[ "${MODE}" == "--review" ]]; then
  echo "REVIEW COMPLETE — NO CLOUD CHANGES"
  exit 0
fi

[[ "${SAMRA_GCP_BUILD_SOURCE_ACCESS_APPLY}" == "${AUTHORIZATION}" ]] || {
  echo "STOP: set SAMRA_GCP_BUILD_SOURCE_ACCESS_APPLY=${AUTHORIZATION}" >&2
  exit 1
}

if [[ "${ACCESS_STATE}" == "missing" ]]; then
  gcloud storage buckets add-iam-policy-binding "gs://${SOURCE_BUCKET}" \
    --member="${BUILD_MEMBER}" \
    --role="${REQUIRED_ROLE}" \
    --condition=None \
    --quiet >/dev/null
fi

[[ "$(inspect_bucket_policy)" == "ready" ]] || {
  echo "STOP: exact source-bucket binding was not verified after apply" >&2
  exit 1
}

echo "STAGING BUILD SOURCE ACCESS APPLIED AND VERIFIED"
echo "Bucket: gs://${SOURCE_BUCKET}"
echo "Member: ${BUILD_MEMBER}"
echo "Role: ${REQUIRED_ROLE}"
echo "No project-level storage role, build, image, deployment, or public access was created."
