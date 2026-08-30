#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MODE="${1:---plan}"
VALIDATOR_URL="file://${ROOT_DIR}/deploy/gcp/validate-coming-soon-production-project.mjs"

if [[ "${MODE}" != "--plan" && "${MODE}" != "--review" && "${MODE}" != "--apply" ]]; then
  echo "Usage: $0 [--plan|--review|--apply]" >&2
  exit 2
fi

PROJECT_ID="samra-pay-production"
PROJECT_NAME="Samra Pay Production"
ORGANIZATION_ID="614833350075"
SOURCE_BILLING_PROJECT_ID="samra-pay-staging"
PROJECT_LABELS="environment=production,application=samra-pay,data_classification=customer-pii"
BUDGET_DISPLAY_NAME="Samra Pay production monthly budget"
BUDGET_AMOUNT="25USD"
AUTHORIZATION="AUTHORIZED_COMING_SOON_PRODUCTION_PROJECT"

VALIDATED="$(
  node "${ROOT_DIR}/deploy/gcp/validate-coming-soon-production-project.mjs" 2>&1
)" || {
  echo "${VALIDATED}" >&2
  exit 1
}

if [[ "${MODE}" == "--plan" ]]; then
  printf '%s\n' "${VALIDATED}"
  cat <<'PLAN'
COMING-SOON PRODUCTION PROJECT PLAN PASS
Plan cost: USD 0 per month
Cloud state read: no
Cloud or DNS state changed: no

An authorized apply is limited to three resumable actions:
  1. create samra-pay-production under organization 614833350075 with the
     exact production/customer-pii labels and no automatic Cloud APIs;
  2. link only the open billing account already attached to
     samra-pay-staging, without moving an existing different billing link; and
  3. create one project-only USD 25 monthly budget alert with 50%, 90%, and
     100% thresholds. The budget is an alert, not a spending cap.

Review is read-only. Apply stops on project, organization, label, billing, or
budget drift and resumes only missing exact state. This controller cannot
enable an API, create infrastructure, deploy, route traffic, change DNS,
activate a vendor, store customer data, or collect a waitlist submission.

Required apply authorization: AUTHORIZED_COMING_SOON_PRODUCTION_PROJECT
PLAN COMPLETE — NO CLOUD OR DNS CHANGES
PLAN
  exit 0
fi

command -v gcloud >/dev/null 2>&1 || {
  echo "gcloud is required; run review or apply from authenticated Google Cloud Shell." >&2
  exit 1
}

: "${SAMRA_GCP_OPERATOR_ACCOUNT:=}"
: "${SAMRA_GCP_EXPECTED_SHA:=}"
: "${SAMRA_GCP_PRODUCTION_PROJECT_APPLY:=}"

export SAMRA_GCP_OPERATOR_ACCOUNT
export SAMRA_GCP_EXPECTED_SHA

ENVIRONMENT_RESULT="$(
  node --input-type=module -e '
    const module = await import(process.argv[1]);
    process.stdout.write(JSON.stringify(module.validateProductionProjectControllerEnvironment(process.env)));
  ' "${VALIDATOR_URL}"
)"

[[ "$(gcloud config get-value account 2>/dev/null)" == "${SAMRA_GCP_OPERATOR_ACCOUNT}" ]] || {
  echo "STOP: wrong Google account" >&2
  exit 1
}
[[ "$(gcloud config get-value project 2>/dev/null)" == "${SOURCE_BILLING_PROJECT_ID}" ]] || {
  echo "STOP: set the active Google Cloud project to ${SOURCE_BILLING_PROJECT_ID}" >&2
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

SOURCE_PROJECT_JSON="$(
  gcloud projects describe "${SOURCE_BILLING_PROJECT_ID}" --format=json
)"
SOURCE_PROJECT_RESULT="$(
  node --input-type=module -e '
    const module = await import(process.argv[1]);
    process.stdout.write(JSON.stringify(module.validateSourceBillingProject(JSON.parse(process.argv[2]))));
  ' "${VALIDATOR_URL}" "${SOURCE_PROJECT_JSON}"
)"
SOURCE_BILLING_JSON="$(
  gcloud billing projects describe "${SOURCE_BILLING_PROJECT_ID}" --format=json
)"
SOURCE_BILLING_ACCOUNT="$(
  node -e '
    const observed = JSON.parse(process.argv[1]);
    const name = String(observed.billingAccountName || "");
    if (!observed.billingEnabled || !/^billingAccounts\/[A-Z0-9-]+$/u.test(name)) {
      process.stderr.write("STOP: staging billing is not enabled on one concrete account\n");
      process.exit(1);
    }
    process.stdout.write(name);
  ' "${SOURCE_BILLING_JSON}"
)"
SOURCE_BILLING_ACCOUNT_ID="${SOURCE_BILLING_ACCOUNT#billingAccounts/}"
BILLING_ACCOUNT_JSON="$(
  gcloud billing accounts describe "${SOURCE_BILLING_ACCOUNT_ID}" --format=json
)"
SOURCE_BILLING_RESULT="$(
  node --input-type=module -e '
    const module = await import(process.argv[1]);
    process.stdout.write(JSON.stringify(module.validateSourceBillingAccount(JSON.parse(process.argv[2]), JSON.parse(process.argv[3]))));
  ' "${VALIDATOR_URL}" "${SOURCE_BILLING_JSON}" "${BILLING_ACCOUNT_JSON}"
)"

list_production_project_inventory() {
  gcloud projects list \
    --filter="parent.type=organization AND parent.id=${ORGANIZATION_ID} AND projectId=${PROJECT_ID}" \
    --limit=2 \
    --format=json
}

classify_project_inventory() {
  node --input-type=module -e '
    const module = await import(process.argv[1]);
    process.stdout.write(JSON.stringify(module.classifyObservedProductionProjectInventory(JSON.parse(process.argv[2]))));
  ' "${VALIDATOR_URL}" "$1"
}

classify_billing() {
  node --input-type=module -e '
    const module = await import(process.argv[1]);
    process.stdout.write(JSON.stringify(module.classifyObservedProductionBilling(JSON.parse(process.argv[2]), process.argv[3])));
  ' "${VALIDATOR_URL}" "$1" "${SOURCE_BILLING_ACCOUNT}"
}

classify_budgets() {
  node --input-type=module -e '
    const module = await import(process.argv[1]);
    process.stdout.write(JSON.stringify(module.classifyObservedProductionBudgets(JSON.parse(process.argv[2]), process.argv[3])));
  ' "${VALIDATOR_URL}" "$1" "$2"
}

json_field() {
  node -e '
    const value = JSON.parse(process.argv[1]);
    const result = value[process.argv[2]];
    process.stdout.write(result === undefined ? "" : String(result));
  ' "$1" "$2"
}

PROJECT_INVENTORY_JSON="$(list_production_project_inventory)"
PROJECT_STATE_JSON="$(classify_project_inventory "${PROJECT_INVENTORY_JSON}")"
PROJECT_STATE="$(json_field "${PROJECT_STATE_JSON}" state)"
PROJECT_NUMBER="$(json_field "${PROJECT_STATE_JSON}" projectNumber)"

if [[ "${PROJECT_STATE}" == "ready" ]]; then
  PRODUCTION_BILLING_JSON="$(
    gcloud billing projects describe "${PROJECT_ID}" --format=json
  )"
  PRODUCTION_BILLING_STATE_JSON="$(classify_billing "${PRODUCTION_BILLING_JSON}")"
else
  PRODUCTION_BILLING_STATE_JSON='{"state":"missing"}'
fi
PRODUCTION_BILLING_STATE="$(json_field "${PRODUCTION_BILLING_STATE_JSON}" state)"

BUDGETS_JSON="$(
  gcloud billing budgets list \
    --billing-account="${SOURCE_BILLING_ACCOUNT_ID}" \
    --format=json
)"
BUDGET_STATE_JSON="$(classify_budgets "${BUDGETS_JSON}" "${PROJECT_NUMBER}")"
BUDGET_STATE="$(json_field "${BUDGET_STATE_JSON}" state)"

printf '%s\n' "${VALIDATED}"
cat <<REVIEW
COMING-SOON PRODUCTION PROJECT READ-ONLY REVIEW
Source: ${SAMRA_GCP_EXPECTED_SHA}
Operator: ${SAMRA_GCP_OPERATOR_ACCOUNT}
Project: ${PROJECT_ID} (${PROJECT_STATE}${PROJECT_NUMBER:+, ${PROJECT_NUMBER}})
Organization: ${ORGANIZATION_ID}
Source billing: ${SOURCE_BILLING_PROJECT_ID} -> ${SOURCE_BILLING_ACCOUNT} (open)
Production billing link: ${PRODUCTION_BILLING_STATE}
Project-scoped USD 25 monthly budget: ${BUDGET_STATE}
Budget thresholds: 50%, 90%, and 100%; this is not a spending cap
REVIEW

if [[ "${MODE}" == "--review" ]]; then
  echo "REVIEW COMPLETE — NO CLOUD OR DNS CHANGES"
  exit 0
fi

[[ "${SAMRA_GCP_PRODUCTION_PROJECT_APPLY}" == "${AUTHORIZATION}" ]] || {
  echo "STOP: set SAMRA_GCP_PRODUCTION_PROJECT_APPLY=${AUTHORIZATION}" >&2
  exit 1
}

if [[ "${PROJECT_STATE}" == "missing" ]]; then
  gcloud projects create "${PROJECT_ID}" \
    --organization="${ORGANIZATION_ID}" \
    --name="${PROJECT_NAME}" \
    --labels="${PROJECT_LABELS}" \
    --no-enable-cloud-apis \
    --quiet

  PROJECT_STATE="missing"
  for attempt in {1..12}; do
    PROJECT_INVENTORY_JSON="$(list_production_project_inventory)"
    PROJECT_STATE_JSON="$(classify_project_inventory "${PROJECT_INVENTORY_JSON}")"
    PROJECT_STATE="$(json_field "${PROJECT_STATE_JSON}" state)"
    PROJECT_NUMBER="$(json_field "${PROJECT_STATE_JSON}" projectNumber)"
    if [[ "${PROJECT_STATE}" == "ready" ]]; then
      break
    fi
    sleep 5
  done
  [[ "${PROJECT_STATE}" == "ready" ]] || {
    echo "STOP: created project did not become readable within 60 seconds" >&2
    exit 1
  }
fi
[[ "${PROJECT_STATE}" == "ready" ]] || {
  echo "STOP: production project did not reach the exact ready state" >&2
  exit 1
}

PRODUCTION_BILLING_JSON="$(
  gcloud billing projects describe "${PROJECT_ID}" --format=json
)"
PRODUCTION_BILLING_STATE_JSON="$(classify_billing "${PRODUCTION_BILLING_JSON}")"
PRODUCTION_BILLING_STATE="$(json_field "${PRODUCTION_BILLING_STATE_JSON}" state)"
if [[ "${PRODUCTION_BILLING_STATE}" == "missing" ]]; then
  gcloud billing projects link "${PROJECT_ID}" \
    --billing-account="${SOURCE_BILLING_ACCOUNT_ID}" \
    --quiet
  PRODUCTION_BILLING_JSON="$(
    gcloud billing projects describe "${PROJECT_ID}" --format=json
  )"
  PRODUCTION_BILLING_STATE_JSON="$(classify_billing "${PRODUCTION_BILLING_JSON}")"
  PRODUCTION_BILLING_STATE="$(json_field "${PRODUCTION_BILLING_STATE_JSON}" state)"
fi
[[ "${PRODUCTION_BILLING_STATE}" == "ready" ]] || {
  echo "STOP: production billing did not reach the exact ready state" >&2
  exit 1
}

BUDGETS_JSON="$(
  gcloud billing budgets list \
    --billing-account="${SOURCE_BILLING_ACCOUNT_ID}" \
    --format=json
)"
BUDGET_STATE_JSON="$(classify_budgets "${BUDGETS_JSON}" "${PROJECT_NUMBER}")"
BUDGET_STATE="$(json_field "${BUDGET_STATE_JSON}" state)"
if [[ "${BUDGET_STATE}" == "missing" ]]; then
  gcloud billing budgets create \
    --billing-account="${SOURCE_BILLING_ACCOUNT_ID}" \
    --display-name="${BUDGET_DISPLAY_NAME}" \
    --budget-amount="${BUDGET_AMOUNT}" \
    --calendar-period=month \
    --filter-projects="projects/${PROJECT_ID}" \
    --threshold-rule=percent=0.50 \
    --threshold-rule=percent=0.90 \
    --threshold-rule=percent=1.00 \
    --quiet
  BUDGETS_JSON="$(
    gcloud billing budgets list \
      --billing-account="${SOURCE_BILLING_ACCOUNT_ID}" \
      --format=json
  )"
  BUDGET_STATE_JSON="$(classify_budgets "${BUDGETS_JSON}" "${PROJECT_NUMBER}")"
  BUDGET_STATE="$(json_field "${BUDGET_STATE_JSON}" state)"
fi
[[ "${BUDGET_STATE}" == "ready" ]] || {
  echo "STOP: production budget did not reach the exact ready state" >&2
  exit 1
}

cat <<APPLY
COMING-SOON PRODUCTION PROJECT APPLY PASS
Project: ${PROJECT_ID} (${PROJECT_NUMBER})
Organization: ${ORGANIZATION_ID}
Billing account: ${SOURCE_BILLING_ACCOUNT} (exact staging account match)
Monthly budget: ${BUDGET_DISPLAY_NAME} (USD 25)
Budget alerts: 50%, 90%, and 100%; this is not a spending cap

No API, infrastructure, database, deployment, traffic, public endpoint, vendor,
customer data, waitlist submission, or Squarespace DNS change was created.
Independent production foundation review is required before the next apply.
APPLY COMPLETE — POST-AUDIT REQUIRED
APPLY
