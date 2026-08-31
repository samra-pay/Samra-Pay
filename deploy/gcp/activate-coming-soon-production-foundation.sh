#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MODE="${1:---plan}"

if [[ "${MODE}" != "--plan" && "${MODE}" != "--review" && "${MODE}" != "--apply" ]]; then
  echo "Usage: $0 [--plan|--review|--apply]" >&2
  exit 2
fi

VALIDATED="$(
  node "${ROOT_DIR}/deploy/gcp/validate-coming-soon-production-foundation.mjs" 2>&1
)" || {
  echo "${VALIDATED}" >&2
  exit 1
}

if [[ "${MODE}" == "--plan" ]]; then
  printf '%s\n' "${VALIDATED}"
  cat <<'PLAN'
COMING-SOON PRODUCTION FOUNDATION ACTIVATION PLAN PASS
Plan cost: USD 0 per month
Cloud state read: no
Cloud or DNS state changed: no

A separately authorized human-admin recovery apply is limited to:
  1. reverify the exact production project, billing account, USD 25 project
     budget, source SHA, administrator, organization, and region;
  2. enable only the 15 reviewed foundation APIs and enforce three labels;
  3. create one empty immutable regional Docker repository;
  4. create five dedicated keyless service accounts and exact IAM bindings;
  5. create two regional database-secret metadata records with zero versions;
     and
  6. run an independent read-only post-audit against the complete state.

The controller is resumable, rejects drift before mutation, and requires the
exact AUTHORIZED_COMING_SOON_PRODUCTION_FOUNDATION sentinel after its live
review. It has no GitHub apply workflow and cannot create a project, billing
link, budget, VPC, database, secret value, Cloud Run service, public endpoint,
customer data, vendor integration, or DNS record.
PLAN COMPLETE — NO CLOUD OR DNS CHANGES
PLAN
  exit 0
fi

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
: "${SAMRA_GCP_PRODUCTION_FOUNDATION_APPLY:=}"

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

PROJECT_ID="${SAMRA_GCP_PROJECT_ID}"
REGION="${SAMRA_GCP_REGION}"
OPERATOR="${SAMRA_GCP_OPERATOR_ACCOUNT}"
EXPECTED_SHA="${SAMRA_GCP_EXPECTED_SHA}"
REPOSITORY="samra-production"
AUTHORIZATION="AUTHORIZED_COMING_SOON_PRODUCTION_FOUNDATION"
RUNTIME_SECRET="samra-production-runtime-database-url"
MIGRATION_SECRET="samra-production-migration-database-url"

ACTIVATION_INPUT="$(
  node --input-type=module -e '
    const module = await import(process.argv[1]);
    process.stdout.write(JSON.stringify(module.validateProductionFoundationActivationEnvironment(process.env)));
  ' "file://${ROOT_DIR}/deploy/gcp/validate-coming-soon-production-foundation.mjs"
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

STABLE_PROJECT_UPDATE_HELP="$(
  CLOUDSDK_CORE_DISABLE_PROMPTS=1 CLOUDSDK_PAGER="" \
    gcloud projects update --help 2>&1 || true
)"
if [[ "${STABLE_PROJECT_UPDATE_HELP}" == *"--update-labels"* ]]; then
  PROJECT_LABEL_RELEASE_TRACK="stable"
else
  ALPHA_PROJECT_UPDATE_HELP="$(
    CLOUDSDK_CORE_DISABLE_PROMPTS=1 CLOUDSDK_PAGER="" \
      gcloud alpha projects update --help 2>&1 || true
  )"
  if [[ "${ALPHA_PROJECT_UPDATE_HELP}" == *"--update-labels"* ]]; then
    PROJECT_LABEL_RELEASE_TRACK="alpha"
  else
    echo "STOP: this gcloud installation cannot update project labels; no foundation mutation was attempted" >&2
    exit 1
  fi
fi

REVIEW_STATE="$(
  node "${ROOT_DIR}/deploy/gcp/inspect-coming-soon-production-foundation.mjs" --review
)"

printf '%s\n' "${ACTIVATION_INPUT}"
printf '%s\n' "${BOUNDARY_REVIEW}"
echo "READ-ONLY COMING-SOON PRODUCTION FOUNDATION ACTIVATION REVIEW PASS"
printf 'Observed foundation state: %s\n' "${REVIEW_STATE}"
echo "Label update capability: ${PROJECT_LABEL_RELEASE_TRACK}"

if [[ "${MODE}" == "--review" ]]; then
  echo "REVIEW COMPLETE — NO CLOUD OR DNS CHANGES"
  exit 0
fi

[[ "${SAMRA_GCP_PRODUCTION_FOUNDATION_APPLY}" == "${AUTHORIZATION}" ]] || {
  echo "STOP: set SAMRA_GCP_PRODUCTION_FOUNDATION_APPLY=${AUTHORIZATION}" >&2
  exit 1
}

mapfile -t APIS < <(
  node -e '
    const foundation = require(process.argv[1]);
    process.stdout.write(foundation.samraManagedApis.join("\n"));
  ' "${ROOT_DIR}/deploy/gcp/coming-soon-production-foundation.json"
)

declare -A SERVICE_ACCOUNTS=(
  [build]="samra-cloud-build-production"
  [deployer]="samra-deployer-production"
  [api]="samra-api-production"
  [customerWeb]="samra-customer-web-production"
  [migrations]="samra-migrations-production"
)
declare -A SERVICE_ACCOUNT_DISPLAY_NAMES=(
  [build]="Samra production Cloud Build"
  [deployer]="Samra production deployer"
  [api]="Samra production API"
  [customerWeb]="Samra production customer web"
  [migrations]="Samra production migrations"
)

service_account_email() {
  printf '%s@%s.iam.gserviceaccount.com' "${SERVICE_ACCOUNTS[$1]}" "${PROJECT_ID}"
}

SERVICE_ACCOUNT_CREATE_MAX_ATTEMPTS=3
SERVICE_ACCOUNT_QUOTA_BACKOFF_SECONDS=60

create_service_account_with_retry() {
  local boundary="$1"
  local attempt=1
  local output=""
  while ((attempt <= SERVICE_ACCOUNT_CREATE_MAX_ATTEMPTS)); do
    if output="$(gcloud iam service-accounts create "${SERVICE_ACCOUNTS[$boundary]}" \
      --project="${PROJECT_ID}" \
      --display-name="${SERVICE_ACCOUNT_DISPLAY_NAMES[$boundary]}" \
      --quiet 2>&1)"; then
      printf '%s\n' "${output}"
      return 0
    fi
    printf '%s\n' "${output}" >&2
    if [[ "${output}" != *"RESOURCE_EXHAUSTED"* ||
      "${output}" != *"Service accounts created per minute per project"* ||
      "${attempt}" -ge "${SERVICE_ACCOUNT_CREATE_MAX_ATTEMPTS}" ]]; then
      return 1
    fi
    echo "Service-account creation quota reached; retrying in ${SERVICE_ACCOUNT_QUOTA_BACKOFF_SECONDS} seconds." >&2
    sleep "${SERVICE_ACCOUNT_QUOTA_BACKOFF_SECONDS}"
    attempt=$((attempt + 1))
  done
  return 1
}

gcloud services enable "${APIS[@]}" --project="${PROJECT_ID}" --quiet
if [[ "${PROJECT_LABEL_RELEASE_TRACK}" == "stable" ]]; then
  gcloud projects update "${PROJECT_ID}" \
    --update-labels=environment=production,data_classification=customer-pii,application=samra-pay \
    --quiet
else
  gcloud alpha projects update "${PROJECT_ID}" \
    --update-labels=environment=production,data_classification=customer-pii,application=samra-pay \
    --quiet
fi

if [[ "$(node -e 'const state=JSON.parse(process.argv[1]);process.stdout.write(String(state.missing.repository.length > 0));' "${REVIEW_STATE}")" == "true" ]]; then
  gcloud artifacts repositories create "${REPOSITORY}" \
    --project="${PROJECT_ID}" \
    --location="${REGION}" \
    --repository-format=docker \
    --immutable-tags \
    --description="Immutable Samra Pay production images" \
    --labels=environment=production,data_classification=customer-pii \
    --quiet
fi

mapfile -t MISSING_SERVICE_ACCOUNTS < <(
  node -e '
    const state = JSON.parse(process.argv[1]);
    process.stdout.write(state.missing.serviceAccounts.join("\n"));
  ' "${REVIEW_STATE}"
)
for boundary in "${MISSING_SERVICE_ACCOUNTS[@]}"; do
  [[ -n "${boundary}" ]] && create_service_account_with_retry "${boundary}"
done

if [[ "$(node -e 'const state=JSON.parse(process.argv[1]);process.stdout.write(String(state.missing.secrets.includes("runtime")));' "${REVIEW_STATE}")" == "true" ]]; then
  gcloud secrets create "${RUNTIME_SECRET}" \
    --project="${PROJECT_ID}" \
    --replication-policy=user-managed \
    --locations="${REGION}" \
    --labels=environment=production,data_classification=customer-pii \
    --quiet
fi
if [[ "$(node -e 'const state=JSON.parse(process.argv[1]);process.stdout.write(String(state.missing.secrets.includes("migrations")));' "${REVIEW_STATE}")" == "true" ]]; then
  gcloud secrets create "${MIGRATION_SECRET}" \
    --project="${PROJECT_ID}" \
    --replication-policy=user-managed \
    --locations="${REGION}" \
    --labels=environment=production,data_classification=customer-pii \
    --quiet
fi

grant_project_role() {
  local boundary="$1"
  local role="$2"
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:$(service_account_email "${boundary}")" \
    --role="${role}" --condition=None --quiet >/dev/null
}

grant_project_role build roles/logging.logWriter
grant_project_role build roles/serviceusage.serviceUsageConsumer
grant_project_role deployer roles/run.admin
grant_project_role deployer roles/serviceusage.serviceUsageConsumer
grant_project_role api roles/cloudsql.client
grant_project_role migrations roles/cloudsql.client

gcloud artifacts repositories add-iam-policy-binding "${REPOSITORY}" \
  --project="${PROJECT_ID}" --location="${REGION}" \
  --member="serviceAccount:$(service_account_email build)" \
  --role=roles/artifactregistry.writer --condition=None --quiet >/dev/null
gcloud artifacts repositories add-iam-policy-binding "${REPOSITORY}" \
  --project="${PROJECT_ID}" --location="${REGION}" \
  --member="serviceAccount:$(service_account_email deployer)" \
  --role=roles/artifactregistry.reader --condition=None --quiet >/dev/null

for target in api customerWeb migrations; do
  gcloud iam service-accounts add-iam-policy-binding \
    "$(service_account_email "${target}")" \
    --project="${PROJECT_ID}" \
    --member="serviceAccount:$(service_account_email deployer)" \
    --role=roles/iam.serviceAccountUser --condition=None --quiet >/dev/null
done

gcloud secrets add-iam-policy-binding "${RUNTIME_SECRET}" \
  --project="${PROJECT_ID}" \
  --member="serviceAccount:$(service_account_email api)" \
  --role=roles/secretmanager.secretAccessor --condition=None --quiet >/dev/null
gcloud secrets add-iam-policy-binding "${MIGRATION_SECRET}" \
  --project="${PROJECT_ID}" \
  --member="serviceAccount:$(service_account_email migrations)" \
  --role=roles/secretmanager.secretAccessor --condition=None --quiet >/dev/null

POST_STATE="$(
  node "${ROOT_DIR}/deploy/gcp/inspect-coming-soon-production-foundation.mjs" --require-ready
)"
AUDIT_OUTPUT="$(
  bash "${ROOT_DIR}/deploy/gcp/audit-coming-soon-production-foundation.sh"
)"

echo "COMING-SOON PRODUCTION FOUNDATION APPLIED AND VERIFIED"
printf 'Verified foundation state: %s\n' "${POST_STATE}"
printf '%s\n' "${AUDIT_OUTPUT}"
echo "Secret versions created: 0"
echo "VPC, database, Cloud Run services, public traffic, customer data, vendors, and DNS changes created: 0"
