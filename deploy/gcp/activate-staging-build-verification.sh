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
: "${SAMRA_GCP_BUILD_VERIFICATION_APPLY:=}"

PROJECT_ID="${SAMRA_GCP_PROJECT_ID}"
ORGANIZATION_ID="${SAMRA_GCP_ORGANIZATION_ID}"
OPERATOR="${SAMRA_GCP_OPERATOR_ACCOUNT}"
EXPECTED_SHA="${SAMRA_GCP_EXPECTED_SHA}"
REQUIRED_API="containeranalysis.googleapis.com"
REQUIRED_SERVICE_AGENT_ROLE="roles/cloudbuild.serviceAgent"
AUTHORIZATION="AUTHORIZED_STAGING_BUILD_VERIFICATION"

[[ "${PROJECT_ID}" == "samra-pay-staging" ]] || { echo "STOP: project must be samra-pay-staging" >&2; exit 1; }
[[ "${ORGANIZATION_ID}" == "993968777863" ]] || { echo "STOP: organization must be 993968777863" >&2; exit 1; }

if [[ "${MODE}" == "--plan" ]]; then
  cat <<PLAN
Plan only. No Google Cloud state was read or changed.

The staging build-verification review will:
  1. bind the review to one clean full Git SHA and the exact staging project;
  2. verify the Cloud Build service agent has only its unconditioned service-agent role;
  3. report whether ${REQUIRED_API} is missing or ready; and
  4. enable only that API after explicit apply authorization.

Apply cannot change IAM, submit or retry a build, publish or delete an image,
deploy a service, route traffic, read a secret, create public access, alter
Replit, touch production, or remove prior build records and source archives.

Expected source: ${EXPECTED_SHA}
Required API: ${REQUIRED_API}
Required service-agent role: ${REQUIRED_SERVICE_AGENT_ROLE}
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

PROJECT_NUMBER="$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')"
[[ "${PROJECT_NUMBER}" =~ ^[0-9]+$ ]] || { echo "STOP: project number is missing" >&2; exit 1; }
CLOUD_BUILD_SERVICE_AGENT="service-${PROJECT_NUMBER}@gcp-sa-cloudbuild.iam.gserviceaccount.com"
SERVICE_AGENT_MEMBER="serviceAccount:${CLOUD_BUILD_SERVICE_AGENT}"

verify_service_agent_role() {
  gcloud projects get-iam-policy "${PROJECT_ID}" --format=json | \
    node -e '
      const fs = require("fs");
      const policy = JSON.parse(fs.readFileSync(0, "utf8"));
      const expectedMember = process.argv[1];
      const expectedRole = process.argv[2];
      const actual = (policy.bindings || [])
        .filter((binding) => (binding.members || []).includes(expectedMember))
        .map((binding) => ({ role: binding.role, condition: binding.condition ?? null }));
      const expected = [{ role: expectedRole, condition: null }];
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        process.stderr.write("STOP: Cloud Build service-agent IAM is missing, broader than reviewed, conditional, or otherwise drifted\n");
        process.exit(1);
      }
    ' "${SERVICE_AGENT_MEMBER}" "${REQUIRED_SERVICE_AGENT_ROLE}"
}

api_state() {
  local enabled
  enabled="$(gcloud services list --enabled \
    --project="${PROJECT_ID}" \
    --filter="config.name=${REQUIRED_API}" \
    --format='value(config.name)')"
  if [[ "${enabled}" == "${REQUIRED_API}" ]]; then
    printf '%s' ready
  else
    printf '%s' missing
  fi
}

verify_service_agent_role
API_STATE="$(api_state)"

echo "READ-ONLY STAGING BUILD VERIFICATION REVIEW PASS"
echo "Source: ${EXPECTED_SHA}"
echo "API: ${REQUIRED_API}"
echo "Service agent: ${CLOUD_BUILD_SERVICE_AGENT}"
echo "Required role: ${REQUIRED_SERVICE_AGENT_ROLE}"
echo "Current state: ${API_STATE}"

if [[ "${MODE}" == "--review" ]]; then
  echo "REVIEW COMPLETE — NO CLOUD CHANGES"
  exit 0
fi

[[ "${SAMRA_GCP_BUILD_VERIFICATION_APPLY}" == "${AUTHORIZATION}" ]] || {
  echo "STOP: set SAMRA_GCP_BUILD_VERIFICATION_APPLY=${AUTHORIZATION}" >&2
  exit 1
}

if [[ "${API_STATE}" == "missing" ]]; then
  gcloud services enable "${REQUIRED_API}" --project="${PROJECT_ID}" --quiet
fi

[[ "$(api_state)" == "ready" ]] || {
  echo "STOP: Container Analysis API was not verified after apply" >&2
  exit 1
}
verify_service_agent_role

echo "STAGING BUILD VERIFICATION APPLIED AND VERIFIED"
echo "API: ${REQUIRED_API}"
echo "Service agent IAM: unchanged and exact"
echo "No IAM binding, build, image, deployment, traffic, public access, or Replit change was created."
