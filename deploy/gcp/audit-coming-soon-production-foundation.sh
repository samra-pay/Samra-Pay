#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

for required_command in gcloud node curl; do
  command -v "${required_command}" >/dev/null 2>&1 || {
    echo "${required_command} is required; run from authenticated Google Cloud Shell." >&2
    exit 1
  }
done

: "${SAMRA_GCP_PROJECT_ID:=samra-pay-production}"
: "${SAMRA_GCP_PROJECT_NUMBER:=382465561715}"
: "${SAMRA_GCP_ORGANIZATION_ID:=614833350075}"
: "${SAMRA_GCP_REGION:=us-east4}"
: "${SAMRA_GCP_OPERATOR_ACCOUNT:=}"
: "${SAMRA_GCP_EXPECTED_SHA:=}"
: "${SAMRA_GCP_DATA_CLASSIFICATION:=customer-pii}"
: "${SAMRA_GCP_MONTHLY_BUDGET_USD:=25}"
: "${SAMRA_GCP_QUOTA_PROJECT_ID:=samra-pay-production}"
: "${SAMRA_PUBLIC_APEX_DOMAIN:=samrapay.com}"
: "${SAMRA_PUBLIC_CANONICAL_HOST:=www}"

export SAMRA_GCP_PROJECT_ID
export SAMRA_GCP_PROJECT_NUMBER
export SAMRA_GCP_ORGANIZATION_ID
export SAMRA_GCP_REGION
export SAMRA_GCP_OPERATOR_ACCOUNT
export SAMRA_GCP_EXPECTED_SHA
export SAMRA_GCP_DATA_CLASSIFICATION
export SAMRA_GCP_MONTHLY_BUDGET_USD
export SAMRA_GCP_QUOTA_PROJECT_ID
export SAMRA_PUBLIC_APEX_DOMAIN
export SAMRA_PUBLIC_CANONICAL_HOST

VALIDATED="$(
  node "${ROOT_DIR}/deploy/gcp/validate-coming-soon-production-foundation.mjs" 2>&1
)" || {
  echo "${VALIDATED}" >&2
  exit 1
}
AUDIT_INPUT="$(
  node --input-type=module -e '
    const module = await import(process.argv[1]);
    process.stdout.write(JSON.stringify(module.validateProductionFoundationActivationEnvironment(process.env)));
  ' "file://${ROOT_DIR}/deploy/gcp/validate-coming-soon-production-foundation.mjs"
)"

[[ "$(gcloud config get-value account 2>/dev/null)" == "${SAMRA_GCP_OPERATOR_ACCOUNT}" ]] || {
  echo "STOP: wrong Google account" >&2
  exit 1
}
[[ "$(gcloud config get-value project 2>/dev/null)" == "${SAMRA_GCP_PROJECT_ID}" ]] || {
  echo "STOP: wrong Google Cloud project" >&2
  exit 1
}
[[ "$(git -C "${ROOT_DIR}" rev-parse HEAD)" == "${SAMRA_GCP_EXPECTED_SHA}" ]] || {
  echo "STOP: audit source commit does not match the reviewed SHA" >&2
  exit 1
}
[[ -z "$(git -C "${ROOT_DIR}" status --porcelain)" ]] || {
  echo "STOP: audit source working tree is not clean" >&2
  exit 1
}

unset SAMRA_PRODUCTION_REVIEW_EVIDENCE_PATH
BOUNDARY_AUDIT="$(
  bash "${ROOT_DIR}/deploy/gcp/review-coming-soon-production.sh" --review
)"
FOUNDATION_AUDIT="$(
  node "${ROOT_DIR}/deploy/gcp/inspect-coming-soon-production-foundation.mjs" --require-ready
)"

printf '%s\n' "${VALIDATED}"
printf '%s\n' "${AUDIT_INPUT}"
printf '%s\n' "${BOUNDARY_AUDIT}"
echo "READ-ONLY COMING-SOON PRODUCTION FOUNDATION POST-AUDIT PASS"
printf 'Foundation: %s\n' "${FOUNDATION_AUDIT}"
echo "Verified: 15 APIs, three labels, one immutable repository, five keyless identities, exact IAM, two regional secret metadata records, and zero secret versions"
echo "Deferred: private API service invocation IAM until the API service exists"
echo "AUDIT COMPLETE — NO CLOUD OR DNS CHANGES"
