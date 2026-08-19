#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MODE="${1:---plan}"

if [[ "${MODE}" != "--plan" && "${MODE}" != "--apply" ]]; then
  echo "Usage: $0 [--plan|--apply]" >&2
  exit 2
fi

: "${SAMRA_GCP_PROJECT_ID:=samra-pay-staging}"
: "${SAMRA_GCP_ORGANIZATION_ID:=614833350075}"
: "${SAMRA_GCP_REGION:=us-east4}"
: "${SAMRA_GCP_OPERATOR_ACCOUNT:=}"

export SAMRA_GCP_PROJECT_ID
export SAMRA_GCP_ORGANIZATION_ID
export SAMRA_GCP_REGION
export SAMRA_GCP_OPERATOR_ACCOUNT

VALIDATED="$({
  node "${ROOT_DIR}/deploy/gcp/validate-staging-foundation.mjs"
} 2>&1)" || {
  echo "${VALIDATED}" >&2
  exit 1
}

if [[ "${MODE}" == "--plan" ]]; then
  printf '%s\n' "${VALIDATED}"
  cat <<'PLAN'
Plan only. No Google Cloud resource was changed.

The apply phase will:
  1. verify the existing project, organization, billing, and active operator;
  2. enable only the reviewed Samra-managed staging APIs;
  3. label the project as synthetic staging;
  4. create one immutable Docker repository;
  5. create seven distinct keyless service accounts;
  6. grant only the reviewed project and resource-level roles; and
  7. create empty database-secret metadata without a secret version.

It will not create Cloud SQL, Cloud Run, Firebase apps, credentials, public
access, production resources, real-provider integrations, or Replit changes.

Adding Firebase is a separate console action. Firebase automatically creates
the provider-managed baseline APIs, service accounts, restricted browser API
key, and project label enumerated in staging-foundation.json. The bootstrap
does not create, expand, or grant roles to those provider-managed resources.
PLAN
  exit 0
fi

if [[ "${SAMRA_GCP_FOUNDATION_APPLY:-}" != "AUTHORIZED_STAGING_FOUNDATION" ]]; then
  echo "Refusing apply without the explicit staging authorization sentinel." >&2
  exit 1
fi
command -v gcloud >/dev/null 2>&1 || {
  echo "gcloud is required; run this only from an authenticated Google Cloud Shell." >&2
  exit 1
}

PROJECT_ID="${SAMRA_GCP_PROJECT_ID}"
ORGANIZATION_ID="${SAMRA_GCP_ORGANIZATION_ID}"
REGION="${SAMRA_GCP_REGION}"
OPERATOR="${SAMRA_GCP_OPERATOR_ACCOUNT}"
REPOSITORY="samra-staging"
SECRET_ID="samra-staging-database-url"

ACTIVE_ACCOUNT="$(gcloud config get-value account 2>/dev/null)"
if [[ "${ACTIVE_ACCOUNT}" != "${OPERATOR}" ]]; then
  echo "Active gcloud account must be ${OPERATOR}; found ${ACTIVE_ACCOUNT:-none}." >&2
  exit 1
fi

PARENT_TYPE="$(gcloud projects describe "${PROJECT_ID}" --format='value(parent.type)')"
PARENT_ID="$(gcloud projects describe "${PROJECT_ID}" --format='value(parent.id)')"
if [[ "${PARENT_TYPE}" != "organization" || "${PARENT_ID}" != "${ORGANIZATION_ID}" ]]; then
  echo "Project ${PROJECT_ID} is not attached to the reviewed organization." >&2
  exit 1
fi

BILLING_ENABLED="$(gcloud billing projects describe "${PROJECT_ID}" --format='value(billingEnabled)')"
if [[ "${BILLING_ENABLED}" != "True" ]]; then
  echo "Billing must be linked before the staging foundation can be applied." >&2
  exit 1
fi

mapfile -t APIS < <(
  node -e '
    const foundation = require(process.argv[1]);
    process.stdout.write(foundation.samraManagedApis.join("\n"));
  ' "${ROOT_DIR}/deploy/gcp/staging-foundation.json"
)

gcloud services enable "${APIS[@]}" --project="${PROJECT_ID}" --quiet
gcloud projects update "${PROJECT_ID}" \
  --update-labels=environment=staging,data_classification=synthetic,application=samra-pay \
  --quiet

if ! gcloud artifacts repositories describe "${REPOSITORY}" \
  --project="${PROJECT_ID}" --location="${REGION}" >/dev/null 2>&1; then
  gcloud artifacts repositories create "${REPOSITORY}" \
    --project="${PROJECT_ID}" \
    --location="${REGION}" \
    --repository-format=docker \
    --immutable-tags \
    --description="Immutable Samra Pay synthetic staging images" \
    --labels=environment=staging,data_classification=synthetic \
    --quiet
fi

declare -A SERVICE_ACCOUNTS=(
  [build]="samra-cloud-build-staging"
  [deployer]="samra-deployer-staging"
  [api]="samra-api-staging"
  [customerWeb]="samra-customer-web-staging"
  [operationsWeb]="samra-operations-web-staging"
  [designSystem]="samra-design-system-staging"
  [migrations]="samra-migrations-staging"
)

ensure_service_account() {
  local id="$1"
  local display_name="$2"
  local email="${id}@${PROJECT_ID}.iam.gserviceaccount.com"
  if ! gcloud iam service-accounts describe "${email}" \
    --project="${PROJECT_ID}" >/dev/null 2>&1; then
    gcloud iam service-accounts create "${id}" \
      --project="${PROJECT_ID}" \
      --display-name="${display_name}" \
      --quiet
  fi
}

ensure_service_account "${SERVICE_ACCOUNTS[build]}" "Samra staging Cloud Build"
ensure_service_account "${SERVICE_ACCOUNTS[deployer]}" "Samra staging deployer"
ensure_service_account "${SERVICE_ACCOUNTS[api]}" "Samra staging API"
ensure_service_account "${SERVICE_ACCOUNTS[customerWeb]}" "Samra staging customer web"
ensure_service_account "${SERVICE_ACCOUNTS[operationsWeb]}" "Samra staging operations web"
ensure_service_account "${SERVICE_ACCOUNTS[designSystem]}" "Samra staging design system"
ensure_service_account "${SERVICE_ACCOUNTS[migrations]}" "Samra staging migrations"

service_account_email() {
  printf '%s@%s.iam.gserviceaccount.com' "${SERVICE_ACCOUNTS[$1]}" "${PROJECT_ID}"
}

grant_project_role() {
  local boundary="$1"
  local role="$2"
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:$(service_account_email "${boundary}")" \
    --role="${role}" \
    --condition=None \
    --quiet >/dev/null
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
  --role=roles/artifactregistry.writer \
  --condition=None --quiet >/dev/null
gcloud artifacts repositories add-iam-policy-binding "${REPOSITORY}" \
  --project="${PROJECT_ID}" --location="${REGION}" \
  --member="serviceAccount:$(service_account_email deployer)" \
  --role=roles/artifactregistry.reader \
  --condition=None --quiet >/dev/null

for boundary in build deployer; do
  gcloud iam service-accounts add-iam-policy-binding \
    "$(service_account_email "${boundary}")" \
    --project="${PROJECT_ID}" \
    --member="user:${OPERATOR}" \
    --role=roles/iam.serviceAccountUser \
    --condition=None --quiet >/dev/null
done

for boundary in api customerWeb operationsWeb designSystem migrations; do
  gcloud iam service-accounts add-iam-policy-binding \
    "$(service_account_email "${boundary}")" \
    --project="${PROJECT_ID}" \
    --member="serviceAccount:$(service_account_email deployer)" \
    --role=roles/iam.serviceAccountUser \
    --condition=None --quiet >/dev/null
done

if ! gcloud secrets describe "${SECRET_ID}" \
  --project="${PROJECT_ID}" >/dev/null 2>&1; then
  gcloud secrets create "${SECRET_ID}" \
    --project="${PROJECT_ID}" \
    --replication-policy=user-managed \
    --locations="${REGION}" \
    --labels=environment=staging,data_classification=synthetic \
    --quiet
fi

for boundary in api migrations; do
  gcloud secrets add-iam-policy-binding "${SECRET_ID}" \
    --project="${PROJECT_ID}" \
    --member="serviceAccount:$(service_account_email "${boundary}")" \
    --role=roles/secretmanager.secretAccessor \
    --condition=None --quiet >/dev/null
done

IMMUTABLE_TAGS="$(gcloud artifacts repositories describe "${REPOSITORY}" \
  --project="${PROJECT_ID}" --location="${REGION}" \
  --format='value(dockerConfig.immutableTags)')"
if [[ "${IMMUTABLE_TAGS}" != "True" ]]; then
  echo "Artifact Registry immutable tags are not enabled." >&2
  exit 1
fi

for boundary in "${!SERVICE_ACCOUNTS[@]}"; do
  USER_MANAGED_KEYS="$(gcloud iam service-accounts keys list \
    --iam-account="$(service_account_email "${boundary}")" \
    --project="${PROJECT_ID}" \
    --managed-by=user --format='value(name)' | wc -l | tr -d ' ')"
  if [[ "${USER_MANAGED_KEYS}" != "0" ]]; then
    echo "User-managed key detected for ${boundary}; foundation rejected." >&2
    exit 1
  fi
done

cat <<EOF
Staging foundation applied and verified.
Project: ${PROJECT_ID}
Organization: ${ORGANIZATION_ID}
Region: ${REGION}
Repository: ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}
Secret versions created: 0
Cloud SQL instances created: 0
Cloud Run services created: 0
EOF
