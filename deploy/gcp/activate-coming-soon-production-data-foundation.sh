#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MODE="${1:---plan}"

if [[ "${MODE}" != "--plan" && "${MODE}" != "--review" && "${MODE}" != "--apply" ]]; then
  echo "Usage: $0 [--plan|--review|--apply]" >&2
  exit 2
fi

VALIDATED="$(
  node "${ROOT_DIR}/deploy/gcp/validate-coming-soon-production-data-foundation.mjs" 2>&1
)" || {
  echo "${VALIDATED}" >&2
  exit 1
}

if [[ "${MODE}" == "--plan" ]]; then
  printf '%s\n' "${VALIDATED}"
  cat <<'PLAN'
COMING-SOON PRODUCTION DATA FOUNDATION ACTIVATION PLAN PASS
Plan cost: USD 0 per month
Cloud state read: no
Cloud, customer data, deployment, traffic, and DNS state changed: no

Approved cost boundary:
  - USD 25 remains the early budget alert and is not a spending cap;
  - USD 100 is the apply-time monthly infrastructure hard stop;
  - reviewed base estimate: USD 68.26 per month;
  - guarded estimate with 20% contingency: USD 81.92 per month; and
  - estimate validity ends 2026-09-07 and must be refreshed after that date.

A separately reviewed and authorized apply is limited to one exact custom VPC,
one private regional subnet, one Private Services Access allocation and
connection, one private-only zonal PostgreSQL 16 instance, and one empty
samra_production database. The controller is resumable and rejects drift.

The temporary zonal posture is accepted only for the coming-soon foundation.
Regional HA remains mandatory before financial workloads. No credential,
secret version, migration, customer row, Cloud Run workload, public endpoint,
vendor integration, or Squarespace DNS record is created.

PLAN COMPLETE — NO CLOUD, CUSTOMER DATA, DEPLOYMENT, TRAFFIC, OR DNS CHANGES
PLAN
  exit 0
fi

for required_command in gcloud node git; do
  command -v "${required_command}" >/dev/null 2>&1 || {
    echo "${required_command} is required; run from authenticated Google Cloud Shell." >&2
    exit 1
  }
done

: "${SAMRA_GCP_PROJECT_ID:=samra-pay-production}"
: "${SAMRA_GCP_PROJECT_NUMBER:=382465561715}"
: "${SAMRA_GCP_ORGANIZATION_ID:=993968777863}"
: "${SAMRA_GCP_REGION:=us-east4}"
: "${SAMRA_GCP_OPERATOR_ACCOUNT:=}"
: "${SAMRA_GCP_EXPECTED_SHA:=}"
: "${SAMRA_GCP_DATA_CLASSIFICATION:=customer-pii}"
: "${SAMRA_GCP_MONTHLY_BUDGET_USD:=25}"
: "${SAMRA_GCP_MAX_MONTHLY_INFRASTRUCTURE_SPEND_USD:=100}"
: "${SAMRA_GCP_GUARDED_MONTHLY_ESTIMATE_USD:=81.92}"
: "${SAMRA_GCP_QUOTA_PROJECT_ID:=samra-pay-production}"
: "${SAMRA_PUBLIC_APEX_DOMAIN:=samrapay.com}"
: "${SAMRA_PUBLIC_CANONICAL_HOST:=www}"
: "${SAMRA_GCP_PRODUCTION_DATA_FOUNDATION_APPLY:=}"

export SAMRA_GCP_PROJECT_ID
export SAMRA_GCP_PROJECT_NUMBER
export SAMRA_GCP_ORGANIZATION_ID
export SAMRA_GCP_REGION
export SAMRA_GCP_OPERATOR_ACCOUNT
export SAMRA_GCP_EXPECTED_SHA
export SAMRA_GCP_DATA_CLASSIFICATION
export SAMRA_GCP_MONTHLY_BUDGET_USD
export SAMRA_GCP_MAX_MONTHLY_INFRASTRUCTURE_SPEND_USD
export SAMRA_GCP_GUARDED_MONTHLY_ESTIMATE_USD
export SAMRA_GCP_QUOTA_PROJECT_ID
export SAMRA_PUBLIC_APEX_DOMAIN
export SAMRA_PUBLIC_CANONICAL_HOST

PROJECT_ID="${SAMRA_GCP_PROJECT_ID}"
REGION="${SAMRA_GCP_REGION}"
OPERATOR="${SAMRA_GCP_OPERATOR_ACCOUNT}"
EXPECTED_SHA="${SAMRA_GCP_EXPECTED_SHA}"
NETWORK="samra-production-vpc"
SUBNET="samra-production-us-east4"
SUBNET_CIDR="10.50.0.0/24"
PSA_RANGE="google-managed-services-samra-production-vpc"
PSA_ADDRESS="10.51.0.0"
PSA_PREFIX="24"
SERVICE="servicenetworking.googleapis.com"
INSTANCE="samra-production-postgres"
DATABASE="samra_production"
AUTHORIZATION="AUTHORIZED_COMING_SOON_PRODUCTION_DATA_FOUNDATION"

ACTIVATION_INPUT="$(
  node --input-type=module -e '
    const module = await import(process.argv[1]);
    process.stdout.write(JSON.stringify(module.validateProductionDataActivationEnvironment(process.env)));
  ' "file://${ROOT_DIR}/deploy/gcp/validate-coming-soon-production-data-foundation.mjs"
)"
COST_INPUT="$(
  node --input-type=module -e '
    const module = await import(process.argv[1]);
    process.stdout.write(JSON.stringify(module.validateProductionDataCostEstimateFreshness()));
  ' "file://${ROOT_DIR}/deploy/gcp/validate-coming-soon-production-data-foundation.mjs"
)"

[[ "$(gcloud config get-value account 2>/dev/null)" == "${OPERATOR}" ]] || {
  echo "STOP: wrong Google account" >&2
  exit 1
}
[[ "$(gcloud config get-value project 2>/dev/null)" == "${PROJECT_ID}" ]] || {
  echo "STOP: wrong Google Cloud project" >&2
  exit 1
}
[[ "$(git -C "${ROOT_DIR}" rev-parse HEAD)" == "${EXPECTED_SHA}" ]] || {
  echo "STOP: source commit does not match the reviewed SHA" >&2
  exit 1
}
[[ -z "$(git -C "${ROOT_DIR}" status --porcelain)" ]] || {
  echo "STOP: source working tree is not clean" >&2
  exit 1
}

unset SAMRA_PRODUCTION_REVIEW_EVIDENCE_PATH
BOUNDARY_REVIEW="$(
  bash "${ROOT_DIR}/deploy/gcp/review-coming-soon-production.sh" --review
)"
FOUNDATION_REVIEW="$(
  node "${ROOT_DIR}/deploy/gcp/inspect-coming-soon-production-foundation.mjs" --require-ready
)"

SQL_CREATE_HELP="$(
  CLOUDSDK_CORE_DISABLE_PROMPTS=1 CLOUDSDK_PAGER="" \
    gcloud sql instances create --help 2>&1
)"
for flag in --database-version --edition --tier --region --availability-type \
  --storage-type --storage-size --storage-auto-increase \
  --storage-auto-increase-limit --no-assign-ip --network --data-api-access \
  --backup --backup-start-time --backup-location --retained-backups-count \
  --enable-point-in-time-recovery --retained-transaction-log-days \
  --deletion-protection; do
  [[ "${SQL_CREATE_HELP}" == *"${flag}"* ]] || {
    echo "STOP: stable gcloud SQL create does not support required flag ${flag}; no mutation attempted" >&2
    exit 1
  }
done

REVIEW_STATE="$(
  node "${ROOT_DIR}/deploy/gcp/inspect-coming-soon-production-data-foundation.mjs" --review
)"

printf '%s\n' "${VALIDATED}"
printf '%s\n' "${ACTIVATION_INPUT}"
printf '%s\n' "${COST_INPUT}"
printf '%s\n' "${BOUNDARY_REVIEW}"
printf 'Verified production foundation: %s\n' "${FOUNDATION_REVIEW}"
echo "READ-ONLY COMING-SOON PRODUCTION DATA FOUNDATION REVIEW PASS"
printf 'Observed data foundation state: %s\n' "${REVIEW_STATE}"
echo "Cost guard: USD ${SAMRA_GCP_GUARDED_MONTHLY_ESTIMATE_USD} estimated; USD ${SAMRA_GCP_MAX_MONTHLY_INFRASTRUCTURE_SPEND_USD} maximum"
echo "Availability: temporary ZONAL coming-soon posture; no financial workloads"

if [[ "${MODE}" == "--review" ]]; then
  echo "REVIEW COMPLETE — NO CLOUD, CUSTOMER DATA, DEPLOYMENT, TRAFFIC, OR DNS CHANGES"
  exit 0
fi

[[ "${SAMRA_GCP_PRODUCTION_DATA_FOUNDATION_APPLY}" == "${AUTHORIZATION}" ]] || {
  echo "STOP: set SAMRA_GCP_PRODUCTION_DATA_FOUNDATION_APPLY=${AUTHORIZATION}" >&2
  exit 1
}

state_missing() {
  local boundary="$1"
  node -e '
    const state = JSON.parse(process.argv[1]);
    process.stdout.write(String((state.missing[process.argv[2]] ?? []).length > 0));
  ' "${REVIEW_STATE}" "${boundary}"
}

if [[ "$(state_missing network)" == "true" ]]; then
  gcloud compute networks create "${NETWORK}" --project="${PROJECT_ID}" \
    --subnet-mode=custom --bgp-routing-mode=regional --quiet
fi
if [[ "$(state_missing subnet)" == "true" ]]; then
  gcloud compute networks subnets create "${SUBNET}" --project="${PROJECT_ID}" \
    --network="${NETWORK}" --region="${REGION}" --range="${SUBNET_CIDR}" \
    --enable-private-ip-google-access --quiet
fi
if [[ "$(state_missing privateServicesAccess)" == "true" ]]; then
  gcloud compute addresses create "${PSA_RANGE}" --project="${PROJECT_ID}" \
    --global --addresses="${PSA_ADDRESS}" --prefix-length="${PSA_PREFIX}" \
    --purpose=VPC_PEERING --network="${NETWORK}" --quiet
fi
if [[ "$(state_missing serviceConnection)" == "true" ]]; then
  gcloud services vpc-peerings connect --project="${PROJECT_ID}" \
    --service="${SERVICE}" --network="${NETWORK}" --ranges="${PSA_RANGE}" \
    --quiet
fi
if [[ "$(state_missing instance)" == "true" ]]; then
  gcloud sql instances create "${INSTANCE}" --project="${PROJECT_ID}" \
    --database-version=POSTGRES_16 --edition=enterprise \
    --tier=db-custom-1-3840 --region="${REGION}" --availability-type=zonal \
    --storage-type=SSD --storage-size=10 --storage-auto-increase \
    --storage-auto-increase-limit=100 --no-assign-ip \
    --data-api-access=DISALLOW_DATA_API \
    --network="projects/${PROJECT_ID}/global/networks/${NETWORK}" \
    --backup --backup-start-time=06:00 --backup-location=us \
    --retained-backups-count=14 --enable-point-in-time-recovery \
    --retained-transaction-log-days=7 --deletion-protection --quiet
fi
if [[ "$(state_missing database)" == "true" ]]; then
  gcloud sql databases create "${DATABASE}" --project="${PROJECT_ID}" \
    --instance="${INSTANCE}" --charset=UTF8 --quiet
fi

POST_STATE="$(
  node "${ROOT_DIR}/deploy/gcp/inspect-coming-soon-production-data-foundation.mjs" --require-ready
)"
AUDIT_OUTPUT="$(
  bash "${ROOT_DIR}/deploy/gcp/audit-coming-soon-production-data-foundation.sh"
)"

echo "COMING-SOON PRODUCTION DATA FOUNDATION APPLIED AND VERIFIED"
printf 'Verified data foundation state: %s\n' "${POST_STATE}"
printf '%s\n' "${AUDIT_OUTPUT}"
echo "Database users, credentials, secret versions, migrations, and customer rows created: 0"
echo "Cloud Run, public traffic, vendor, and DNS changes created: 0"
