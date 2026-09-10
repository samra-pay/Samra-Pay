#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

: "${SAMRA_GCP_PROJECT_ID:=samra-pay-staging}"
: "${SAMRA_GCP_ORGANIZATION_ID:=993968777863}"
: "${SAMRA_GCP_OPERATOR_ACCOUNT:=}"
: "${SAMRA_GCP_EXPECTED_SHA:=$(git -C "${ROOT_DIR}" rev-parse HEAD)}"

PROJECT_ID="${SAMRA_GCP_PROJECT_ID}"
ORGANIZATION_ID="${SAMRA_GCP_ORGANIZATION_ID}"
OPERATOR="${SAMRA_GCP_OPERATOR_ACCOUNT}"
EXPECTED_SHA="${SAMRA_GCP_EXPECTED_SHA}"
SOURCE_BUCKET="${PROJECT_ID}_cloudbuild"
BUILD_SERVICE_ACCOUNT="samra-cloud-build-staging@${PROJECT_ID}.iam.gserviceaccount.com"
BUILD_MEMBER="serviceAccount:${BUILD_SERVICE_ACCOUNT}"
REQUIRED_ROLE="roles/storage.objectViewer"

[[ "${PROJECT_ID}" == "samra-pay-staging" ]] || { echo "STOP: project must be samra-pay-staging" >&2; exit 1; }
[[ "${ORGANIZATION_ID}" == "993968777863" ]] || { echo "STOP: organization must be 993968777863" >&2; exit 1; }
command -v gcloud >/dev/null 2>&1 || { echo "gcloud is required" >&2; exit 1; }
[[ -n "${OPERATOR}" && "${OPERATOR}" =~ ^[^@[:space:]]+@davidhaile\.com$ ]] || { echo "STOP: invalid operator" >&2; exit 1; }
[[ "$(gcloud config get-value account 2>/dev/null)" == "${OPERATOR}" ]] || { echo "STOP: wrong Google account" >&2; exit 1; }
[[ "$(gcloud config get-value project 2>/dev/null)" == "${PROJECT_ID}" ]] || { echo "STOP: wrong Google Cloud project" >&2; exit 1; }
[[ "$(gcloud projects describe "${PROJECT_ID}" --format='value(parent.type)')" == "organization" ]] || { echo "STOP: project parent is not an organization" >&2; exit 1; }
[[ "$(gcloud projects describe "${PROJECT_ID}" --format='value(parent.id)')" == "${ORGANIZATION_ID}" ]] || { echo "STOP: wrong organization" >&2; exit 1; }
[[ "$(gcloud billing projects describe "${PROJECT_ID}" --format='value(billingEnabled)')" == "True" ]] || { echo "STOP: billing is not enabled" >&2; exit 1; }
[[ "$(git -C "${ROOT_DIR}" rev-parse HEAD)" == "${EXPECTED_SHA}" ]] || { echo "STOP: source commit does not match the audited SHA" >&2; exit 1; }
[[ -z "$(git -C "${ROOT_DIR}" status --porcelain)" ]] || { echo "STOP: source working tree is not clean" >&2; exit 1; }

for label in environment=staging data_classification=synthetic application=samra-pay firebase=enabled; do
  key="${label%%=*}"
  expected="${label#*=}"
  actual="$(gcloud projects describe "${PROJECT_ID}" --format="value(labels.${key})")"
  [[ "${actual}" == "${expected}" ]] || { echo "STOP: project label ${key} drifted" >&2; exit 1; }
done

gcloud iam service-accounts describe "${BUILD_SERVICE_ACCOUNT}" --project="${PROJECT_ID}" >/dev/null
USER_KEYS="$(gcloud iam service-accounts keys list \
  --iam-account="${BUILD_SERVICE_ACCOUNT}" --project="${PROJECT_ID}" \
  --managed-by=user --format='value(name)')"
[[ -z "${USER_KEYS}" ]] || { echo "STOP: build identity has a user-managed key" >&2; exit 1; }

gcloud projects get-iam-policy "${PROJECT_ID}" --format=json | \
  node -e '
    const fs = require("fs");
    const policy = JSON.parse(fs.readFileSync(0, "utf8"));
    const expectedMember = `serviceAccount:${process.argv[1]}`;
    const actual = (policy.bindings || [])
      .filter((binding) => (binding.members || []).includes(expectedMember))
      .map((binding) => binding.role)
      .sort();
    const expected = ["roles/logging.logWriter", "roles/serviceusage.serviceUsageConsumer"].sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      process.stderr.write("STOP: build identity project IAM drifted\n");
      process.exit(1);
    }
  ' "${BUILD_SERVICE_ACCOUNT}"

BUCKET_NAME="$(gcloud storage buckets describe "gs://${SOURCE_BUCKET}" --format='value(name)')"
[[ "${BUCKET_NAME}" == "${SOURCE_BUCKET}" || "${BUCKET_NAME}" == "projects/_/buckets/${SOURCE_BUCKET}" ]] || {
  echo "STOP: exact Cloud Build source bucket is missing" >&2
  exit 1
}

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
    const expected = [{ role: expectedRole, condition: null }];
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      process.stderr.write("STOP: source-bucket IAM is not exactly the reviewed binding\n");
      process.exit(1);
    }
  ' "${BUILD_MEMBER}" "${REQUIRED_ROLE}"

echo "READ-ONLY STAGING BUILD SOURCE ACCESS POST-AUDIT PASS"
echo "Source: ${EXPECTED_SHA}"
echo "Bucket: gs://${SOURCE_BUCKET}"
echo "Member: ${BUILD_MEMBER}"
echo "Role: ${REQUIRED_ROLE}"
echo "Build identity: keyless with exact project and bucket IAM"
