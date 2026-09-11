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
REQUIRED_API="containeranalysis.googleapis.com"
REQUIRED_ROLE="roles/cloudbuild.serviceAgent"

[[ "${PROJECT_ID}" == "samra-pay-staging" ]] || { echo "STOP: project must be samra-pay-staging" >&2; exit 1; }
[[ "${ORGANIZATION_ID}" == "993968777863" ]] || { echo "STOP: organization must be 993968777863" >&2; exit 1; }
command -v gcloud >/dev/null 2>&1 || { echo "gcloud is required" >&2; exit 1; }
[[ -n "${OPERATOR}" && "${OPERATOR}" =~ ^[^@[:space:]]+@davidhaile\.com$ ]] || { echo "STOP: invalid operator" >&2; exit 1; }
[[ "$(gcloud config get-value account 2>/dev/null)" == "${OPERATOR}" ]] || { echo "STOP: wrong Google account" >&2; exit 1; }
[[ "$(gcloud config get-value project 2>/dev/null)" == "${PROJECT_ID}" ]] || { echo "STOP: wrong Google Cloud project" >&2; exit 1; }
[[ "$(gcloud projects describe "${PROJECT_ID}" --format='value(parent.type)')" == "organization" ]] || { echo "STOP: project parent is not an organization" >&2; exit 1; }
[[ "$(gcloud projects describe "${PROJECT_ID}" --format='value(parent.id)')" == "${ORGANIZATION_ID}" ]] || { echo "STOP: wrong organization" >&2; exit 1; }
[[ "$(git -C "${ROOT_DIR}" rev-parse HEAD)" == "${EXPECTED_SHA}" ]] || { echo "STOP: source commit does not match the audited SHA" >&2; exit 1; }
[[ -z "$(git -C "${ROOT_DIR}" status --porcelain)" ]] || { echo "STOP: source working tree is not clean" >&2; exit 1; }

PROJECT_NUMBER="$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')"
[[ "${PROJECT_NUMBER}" =~ ^[0-9]+$ ]] || { echo "STOP: project number is missing" >&2; exit 1; }
CLOUD_BUILD_SERVICE_AGENT="service-${PROJECT_NUMBER}@gcp-sa-cloudbuild.iam.gserviceaccount.com"

ENABLED_API="$(gcloud services list --enabled \
  --project="${PROJECT_ID}" \
  --filter="config.name=${REQUIRED_API}" \
  --format='value(config.name)')"
[[ "${ENABLED_API}" == "${REQUIRED_API}" ]] || {
  echo "STOP: Container Analysis API is not enabled" >&2
  exit 1
}

gcloud projects get-iam-policy "${PROJECT_ID}" --format=json | \
  node -e '
    const fs = require("fs");
    const policy = JSON.parse(fs.readFileSync(0, "utf8"));
    const expectedMember = `serviceAccount:${process.argv[1]}`;
    const expectedRole = process.argv[2];
    const actual = (policy.bindings || [])
      .filter((binding) => (binding.members || []).includes(expectedMember))
      .map((binding) => ({ role: binding.role, condition: binding.condition ?? null }));
    const expected = [{ role: expectedRole, condition: null }];
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      process.stderr.write("STOP: Cloud Build service-agent IAM is not exact\n");
      process.exit(1);
    }
  ' "${CLOUD_BUILD_SERVICE_AGENT}" "${REQUIRED_ROLE}"

echo "READ-ONLY STAGING BUILD VERIFICATION POST-AUDIT PASS"
echo "Source: ${EXPECTED_SHA}"
echo "API: ${REQUIRED_API}"
echo "Service agent: ${CLOUD_BUILD_SERVICE_AGENT}"
echo "Role: ${REQUIRED_ROLE}"
