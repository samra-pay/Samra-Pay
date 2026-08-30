#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MODE="${1:---plan}"
VALIDATOR_URL="file://${ROOT_DIR}/deploy/gcp/validate-coming-soon-launch.mjs"

if [[ "${MODE}" != "--plan" && "${MODE}" != "--review" ]]; then
  echo "Usage: $0 [--plan|--review]" >&2
  exit 2
fi

VALIDATED="$(node "${ROOT_DIR}/deploy/gcp/validate-coming-soon-launch.mjs" 2>&1)" || {
  echo "${VALIDATED}" >&2
  exit 1
}

if [[ "${MODE}" == "--plan" ]]; then
  printf '%s\n' "${VALIDATED}"
  cat <<'PLAN'
Plan only. No Google Cloud, Squarespace DNS, deployment, or customer data state
was read or changed.

The read-only production foundation review will:
  1. bind the review to one clean full Git SHA and the active administrator;
  2. verify samra-pay-production, its assigned project number, organization,
     ACTIVE lifecycle, and exact production labels;
  3. verify billing uses the same concrete account as samra-pay-staging;
  4. require one exact project-scoped USD 25 monthly alert with 50%, 90%, and
     100% notification thresholds; the alert is not a spending cap;
  5. verify us-east4, customer-pii, samrapay.com, and canonical www; and
  6. report the remaining design, privacy, database, edge, alerting, rollback,
     deployment, public-traffic, and DNS authorization gates.

This controller is read-only. It cannot create a project or budget, attach
billing, enable an API, create infrastructure, deploy, collect an email, route
traffic, activate Auth0/Persona/Crossmint, or change DNS.
PLAN
  exit 0
fi

command -v gcloud >/dev/null 2>&1 || {
  echo "gcloud is required; run review only from authenticated Google Cloud Shell." >&2
  exit 1
}

: "${SAMRA_GCP_PROJECT_ID:=samra-pay-production}"
: "${SAMRA_GCP_PROJECT_NUMBER:=}"
: "${SAMRA_GCP_ORGANIZATION_ID:=614833350075}"
: "${SAMRA_GCP_REGION:=us-east4}"
: "${SAMRA_GCP_OPERATOR_ACCOUNT:=}"
: "${SAMRA_GCP_EXPECTED_SHA:=}"
: "${SAMRA_GCP_DATA_CLASSIFICATION:=customer-pii}"
: "${SAMRA_GCP_MONTHLY_BUDGET_USD:=25}"
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
export SAMRA_PUBLIC_APEX_DOMAIN
export SAMRA_PUBLIC_CANONICAL_HOST

REVIEW_INPUT="$(
  node --input-type=module -e '
    const { validateComingSoonProductionReviewEnvironment } = await import(process.argv[1]);
    process.stdout.write(JSON.stringify(validateComingSoonProductionReviewEnvironment(process.env)));
  ' "${VALIDATOR_URL}"
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
  echo "STOP: source commit does not match the reviewed SHA" >&2
  exit 1
}
[[ -z "$(git -C "${ROOT_DIR}" status --porcelain)" ]] || {
  echo "STOP: source working tree is not clean" >&2
  exit 1
}

SOURCE_BILLING_PROJECT_ID="samra-pay-staging"
PROJECT_JSON="$(
  gcloud projects describe "${SAMRA_GCP_PROJECT_ID}" \
    --billing-project="${SOURCE_BILLING_PROJECT_ID}" \
    --quiet \
    --format=json
)"
PROJECT_RESULT="$(
  printf '%s' "${PROJECT_JSON}" | node --input-type=module -e '
    import { readFileSync } from "node:fs";
    const module = await import(process.argv[1]);
    const observed = JSON.parse(readFileSync(0, "utf8"));
    const expected = module.validateComingSoonProductionReviewEnvironment(process.env);
    process.stdout.write(JSON.stringify(module.validateObservedProductionProject(observed, expected)));
  ' "${VALIDATOR_URL}"
)"

BILLING_JSON="$(
  gcloud billing projects describe "${SAMRA_GCP_PROJECT_ID}" \
    --billing-project="${SOURCE_BILLING_PROJECT_ID}" \
    --quiet \
    --format=json
)"
SOURCE_BILLING_JSON="$(
  gcloud billing projects describe "${SOURCE_BILLING_PROJECT_ID}" \
    --billing-project="${SOURCE_BILLING_PROJECT_ID}" \
    --quiet \
    --format=json
)"
BILLING_RESULT="$(
  node --input-type=module -e '
    const module = await import(process.argv[1]);
    const observed = JSON.parse(process.argv[2]);
    const sourceObserved = JSON.parse(process.argv[3]);
    process.stdout.write(JSON.stringify(module.validateObservedProductionBilling(observed, sourceObserved)));
  ' "${VALIDATOR_URL}" "${BILLING_JSON}" "${SOURCE_BILLING_JSON}"
)"
BILLING_ACCOUNT="$(
  node -e '
    const result = JSON.parse(process.argv[1]);
    process.stdout.write(result.billingAccount.replace(/^billingAccounts\//u, ""));
  ' "${BILLING_RESULT}"
)"

BUDGETS_JSON="$(
  gcloud billing budgets list \
    --billing-account="${BILLING_ACCOUNT}" \
    --billing-project="${SOURCE_BILLING_PROJECT_ID}" \
    --quiet \
    --format=json
)"
BUDGET_RESULT="$(
  printf '%s' "${BUDGETS_JSON}" | node --input-type=module -e '
    import { readFileSync } from "node:fs";
    const module = await import(process.argv[1]);
    const observed = JSON.parse(readFileSync(0, "utf8"));
    const expected = module.validateComingSoonProductionReviewEnvironment(process.env);
    process.stdout.write(JSON.stringify(module.validateObservedProductionBudgets(observed, expected)));
  ' "${VALIDATOR_URL}"
)"

CANONICAL_DOMAIN="$(
  node -e '
    const result = JSON.parse(process.argv[1]);
    process.stdout.write(result.canonicalDomain);
  ' "${REVIEW_INPUT}"
)"
BUDGET_NAME="$(
  node -e '
    const result = JSON.parse(process.argv[1]);
    process.stdout.write(result.displayName);
  ' "${BUDGET_RESULT}"
)"

printf '%s\n' "${VALIDATED}"
cat <<REVIEW
READ-ONLY COMING-SOON PRODUCTION FOUNDATION REVIEW PASS
Project: ${SAMRA_GCP_PROJECT_ID} (${SAMRA_GCP_PROJECT_NUMBER})
Organization: ${SAMRA_GCP_ORGANIZATION_ID}
Region: ${SAMRA_GCP_REGION}
Source: ${SAMRA_GCP_EXPECTED_SHA}
Data classification: ${SAMRA_GCP_DATA_CLASSIFICATION}
Canonical domain: ${CANONICAL_DOMAIN}
Billing account: billingAccounts/${BILLING_ACCOUNT}
Billing source project: ${SOURCE_BILLING_PROJECT_ID} (exact account match)
Monthly budget: ${BUDGET_NAME} (USD ${SAMRA_GCP_MONTHLY_BUDGET_USD})
Budget alerts: 50%, 90%, and 100%; this is not a spending cap

Production project identity, organization, labels, billing, and budget are ready
for a separately reviewed infrastructure plan. Infrastructure apply, database
creation, deployment, public traffic, waitlist collection, vendor activation,
and Squarespace DNS changes remain unauthorized.
REVIEW

printf 'Verified project state: %s\n' "${PROJECT_RESULT}"
echo "REVIEW COMPLETE — NO CLOUD OR DNS CHANGES"
