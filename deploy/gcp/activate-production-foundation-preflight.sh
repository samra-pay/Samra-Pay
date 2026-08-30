#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MODE="${1:---plan}"

if [[ "${MODE}" != "--plan" && "${MODE}" != "--review" && "${MODE}" != "--apply" ]]; then
  echo "Usage: $0 [--plan|--review|--apply]" >&2
  exit 2
fi

: "${SAMRA_GCP_PROJECT_ID:=samra-pay-production}"
: "${SAMRA_GCP_PROJECT_NUMBER:=382465561715}"
: "${SAMRA_GCP_STAGING_PROJECT_ID:=samra-pay-staging}"
: "${SAMRA_GCP_ORGANIZATION_ID:=614833350075}"
: "${SAMRA_GCP_REGION:=us-east4}"
: "${SAMRA_GCP_OPERATOR_ACCOUNT:=}"
: "${SAMRA_GCP_EXPECTED_SHA:=$(git -C "${ROOT_DIR}" rev-parse HEAD)}"
: "${SAMRA_GCP_PRODUCTION_PREFLIGHT_APPLY:=}"

PROJECT_ID="${SAMRA_GCP_PROJECT_ID}"
PROJECT_NUMBER="${SAMRA_GCP_PROJECT_NUMBER}"
STAGING_PROJECT_ID="${SAMRA_GCP_STAGING_PROJECT_ID}"
STAGING_PROJECT_NUMBER="934122615631"
ORGANIZATION_ID="${SAMRA_GCP_ORGANIZATION_ID}"
REGION="${SAMRA_GCP_REGION}"
OPERATOR="${SAMRA_GCP_OPERATOR_ACCOUNT}"
EXPECTED_SHA="${SAMRA_GCP_EXPECTED_SHA}"
LOCATION="global"
POOL_ID="samra-production-review"
PROVIDER_ID="samra-foundation-preflight"
AUDITOR_ID="samra-production-auditor"
AUDITOR_SERVICE_ACCOUNT="${AUDITOR_ID}@${PROJECT_ID}.iam.gserviceaccount.com"
PRODUCTION_ROLE_ID="samraProductionBoundaryAuditor"
PRODUCTION_ROLE_NAME="projects/${PROJECT_ID}/roles/${PRODUCTION_ROLE_ID}"
STAGING_ROLE_ID="samraProductionBillingSourceReader"
STAGING_ROLE_NAME="projects/${STAGING_PROJECT_ID}/roles/${STAGING_ROLE_ID}"
PRODUCTION_ROLE_PERMISSIONS="billing.resourcebudgets.read,iam.serviceAccountKeys.list,iam.serviceAccounts.get,resourcemanager.projects.get,serviceusage.services.use"
STAGING_ROLE_PERMISSIONS="resourcemanager.projects.get"
FEDERATION_ROLE="roles/iam.workloadIdentityUser"
AUTHORIZATION="AUTHORIZED_PRODUCTION_FOUNDATION_PREFLIGHT"
REPOSITORY="haileleuld87/Samra-Pay"
REPOSITORY_ID="1335175962"
REPOSITORY_OWNER_ID="237485986"
POOL_RESOURCE="projects/${PROJECT_NUMBER}/locations/${LOCATION}/workloadIdentityPools/${POOL_ID}"
PROVIDER_RESOURCE="${POOL_RESOURCE}/providers/${PROVIDER_ID}"
FEDERATED_MEMBER="principalSet://iam.googleapis.com/${POOL_RESOURCE}/attribute.repository_id/${REPOSITORY_ID}"
ATTRIBUTE_MAPPING="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.repository_id=assertion.repository_id,attribute.repository_owner_id=assertion.repository_owner_id,attribute.ref=assertion.ref,attribute.event_name=assertion.event_name,attribute.workflow=assertion.workflow,attribute.workflow_ref=assertion.workflow_ref,attribute.environment=assertion.environment"
ATTRIBUTE_CONDITION="assertion.repository=='${REPOSITORY}' && assertion.repository_id=='${REPOSITORY_ID}' && assertion.repository_owner_id=='${REPOSITORY_OWNER_ID}' && assertion.ref=='refs/heads/main' && assertion.event_name=='workflow_dispatch' && assertion.workflow=='Production foundation preflight' && assertion.workflow_ref=='haileleuld87/Samra-Pay/.github/workflows/production-foundation-preflight.yml@refs/heads/main' && assertion.environment=='production-foundation-review'"
REQUIRED_APIS=(
  billingbudgets.googleapis.com
  cloudbilling.googleapis.com
  cloudresourcemanager.googleapis.com
  iam.googleapis.com
  iamcredentials.googleapis.com
  serviceusage.googleapis.com
  sts.googleapis.com
)
SERVICE_ACCOUNT_CREATE_MAX_ATTEMPTS=3
SERVICE_ACCOUNT_QUOTA_BACKOFF_SECONDS=65

export SAMRA_GCP_PROJECT_ID
export SAMRA_GCP_PROJECT_NUMBER
export SAMRA_GCP_STAGING_PROJECT_ID
export SAMRA_GCP_ORGANIZATION_ID
export SAMRA_GCP_REGION
export SAMRA_GCP_OPERATOR_ACCOUNT
export SAMRA_GCP_EXPECTED_SHA

VALIDATED="$(node "${ROOT_DIR}/deploy/gcp/validate-production-foundation-preflight.mjs" 2>&1)" || {
  echo "${VALIDATED}" >&2
  exit 1
}

if [[ "${MODE}" == "--plan" ]]; then
  printf '%s\n' "${VALIDATED}"
  cat <<PLAN
PRODUCTION FOUNDATION PREFLIGHT AUTOMATION PLAN PASS
Plan cost: USD 0 per month
Cloud or GitHub state read: no
Cloud or GitHub state changed: no

An authorized one-time bootstrap is limited to:
  1. enable seven exact control-plane APIs on ${PROJECT_ID};
  2. create one exact GitHub OIDC pool and provider restricted to repository ID
     ${REPOSITORY_ID}, refs/heads/main, the manual workflow, and the protected
     production-foundation-review environment;
  3. create one dedicated keyless production auditor;
  4. grant five exact read/use permissions on ${PROJECT_ID};
  5. grant only resourcemanager.projects.get on ${STAGING_PROJECT_ID} so the
     production billing link can be compared to its source; and
  6. grant Workload Identity User only to the exact repository identity.

No billing-account role, service-account key, build, image, infrastructure,
database, secret, deployment, traffic, customer data, vendor, or DNS access is
created. Transferring the repository to an Enterprise organization requires an
explicit trust-condition reissue before this workflow can authenticate.

Provider: ${PROVIDER_RESOURCE}
Auditor: ${AUDITOR_SERVICE_ACCOUNT}
Required apply authorization: ${AUTHORIZATION}
PLAN COMPLETE — NO CLOUD OR GITHUB CHANGES
PLAN
  exit 0
fi

command -v gcloud >/dev/null 2>&1 || {
  echo "gcloud is required; run review or apply from authenticated Google Cloud Shell." >&2
  exit 1
}

ACTIVATION_INPUT="$(
  node --input-type=module -e '
    const module = await import(process.argv[1]);
    process.stdout.write(JSON.stringify(module.validateProductionPreflightActivationEnvironment(process.env)));
  ' "file://${ROOT_DIR}/deploy/gcp/validate-production-foundation-preflight.mjs"
)"

[[ "$(gcloud config get-value account 2>/dev/null)" == "${OPERATOR}" ]] || { echo "STOP: wrong Google account" >&2; exit 1; }
[[ "$(gcloud config get-value project 2>/dev/null)" == "${PROJECT_ID}" ]] || { echo "STOP: wrong Google Cloud project" >&2; exit 1; }
[[ "$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')" == "${PROJECT_NUMBER}" ]] || { echo "STOP: wrong production project number" >&2; exit 1; }
[[ "$(gcloud projects describe "${PROJECT_ID}" --format='value(parent.id)')" == "${ORGANIZATION_ID}" ]] || { echo "STOP: wrong production organization" >&2; exit 1; }
[[ "$(gcloud projects describe "${STAGING_PROJECT_ID}" --format='value(projectNumber)')" == "${STAGING_PROJECT_NUMBER}" ]] || { echo "STOP: wrong staging billing-source project" >&2; exit 1; }
[[ "$(gcloud projects describe "${STAGING_PROJECT_ID}" --format='value(parent.id)')" == "${ORGANIZATION_ID}" ]] || { echo "STOP: staging billing-source organization drifted" >&2; exit 1; }
[[ "$(gcloud billing projects describe "${PROJECT_ID}" --format='value(billingEnabled)')" == "True" ]] || { echo "STOP: production billing is not enabled" >&2; exit 1; }
[[ "$(git -C "${ROOT_DIR}" rev-parse HEAD)" == "${EXPECTED_SHA}" ]] || { echo "STOP: source commit does not match the reviewed SHA" >&2; exit 1; }
[[ -z "$(git -C "${ROOT_DIR}" status --porcelain)" ]] || { echo "STOP: source working tree is not clean" >&2; exit 1; }

for label in environment=production data_classification=customer-pii application=samra-pay; do
  key="${label%%=*}"
  expected="${label#*=}"
  actual="$(gcloud projects describe "${PROJECT_ID}" --format="value(labels.${key})")"
  [[ "${actual}" == "${expected}" ]] || { echo "STOP: production project label ${key} drifted" >&2; exit 1; }
done

api_state() {
  local api="$1"
  local enabled
  enabled="$(gcloud services list --enabled --project="${PROJECT_ID}" --filter="config.name=${api}" --format='value(config.name)')"
  if [[ "${enabled}" == "${api}" ]]; then printf 'ready'; else printf 'missing'; fi
}

custom_role_state() {
  local project_id="$1"
  local role_id="$2"
  local permissions="$3"
  if ! gcloud iam roles describe "${role_id}" --project="${project_id}" >/dev/null 2>&1; then
    printf 'missing'
    return
  fi
  gcloud iam roles describe "${role_id}" --project="${project_id}" --format=json | node -e '
    const fs = require("fs");
    const role = JSON.parse(fs.readFileSync(0, "utf8"));
    const actual = [...(role.includedPermissions || [])].sort();
    const expected = process.argv[1].split(",").sort();
    if (role.deleted === true || role.stage !== "GA" || JSON.stringify(actual) !== JSON.stringify(expected)) {
      process.stderr.write("STOP: preflight custom role drifted\n");
      process.exit(1);
    }
    process.stdout.write("ready");
  ' "${permissions}"
}

auditor_state() {
  if ! gcloud iam service-accounts describe "${AUDITOR_SERVICE_ACCOUNT}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
    printf 'missing'
    return
  fi
  [[ -z "$(gcloud iam service-accounts keys list --iam-account="${AUDITOR_SERVICE_ACCOUNT}" --project="${PROJECT_ID}" --managed-by=user --format='value(name)')" ]] || {
    echo "STOP: production auditor has a user-managed key" >&2
    exit 1
  }
  printf 'ready'
}

pool_state() {
  if ! gcloud iam workload-identity-pools describe "${POOL_ID}" --project="${PROJECT_ID}" --location="${LOCATION}" >/dev/null 2>&1; then
    printf 'missing'
    return
  fi
  [[ "$(gcloud iam workload-identity-pools describe "${POOL_ID}" --project="${PROJECT_ID}" --location="${LOCATION}" --format='value(state)')" == "ACTIVE" ]] || {
    echo "STOP: production review identity pool is not active" >&2
    exit 1
  }
  printf 'ready'
}

provider_state() {
  if ! gcloud iam workload-identity-pools providers describe "${PROVIDER_ID}" --project="${PROJECT_ID}" --location="${LOCATION}" --workload-identity-pool="${POOL_ID}" >/dev/null 2>&1; then
    printf 'missing'
    return
  fi
  gcloud iam workload-identity-pools providers describe "${PROVIDER_ID}" \
    --project="${PROJECT_ID}" --location="${LOCATION}" \
    --workload-identity-pool="${POOL_ID}" --format=json | node -e '
      const fs = require("fs");
      const provider = JSON.parse(fs.readFileSync(0, "utf8"));
      const expectedMapping = Object.fromEntries(process.argv[1].split(",").map((entry) => {
        const index = entry.indexOf("=");
        return [entry.slice(0, index), entry.slice(index + 1)];
      }));
      const canonical = (value) => JSON.stringify(Object.fromEntries(Object.entries(value).sort()));
      if (
        provider.state !== "ACTIVE" ||
        provider.oidc?.issuerUri !== "https://token.actions.githubusercontent.com" ||
        canonical(provider.attributeMapping || {}) !== canonical(expectedMapping) ||
        provider.attributeCondition !== process.argv[2]
      ) {
        process.stderr.write("STOP: production review identity provider drifted\n");
        process.exit(1);
      }
      process.stdout.write("ready");
    ' "${ATTRIBUTE_MAPPING}" "${ATTRIBUTE_CONDITION}"
}

project_binding_state() {
  local project_id="$1"
  local expected_role="$2"
  if [[ "$(auditor_state)" == "missing" ]]; then printf 'missing'; return; fi
  gcloud projects get-iam-policy "${project_id}" --format=json | node -e '
    const fs = require("fs");
    const policy = JSON.parse(fs.readFileSync(0, "utf8"));
    const member = `serviceAccount:${process.argv[1]}`;
    const actual = (policy.bindings || [])
      .filter((binding) => (binding.members || []).includes(member))
      .map((binding) => ({ role: binding.role, condition: binding.condition ?? null }));
    if (actual.length === 0) {
      process.stdout.write("missing");
    } else {
      const expected = [{ role: process.argv[2], condition: null }];
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        process.stderr.write("STOP: production auditor project IAM drifted\n");
        process.exit(1);
      }
      process.stdout.write("ready");
    }
  ' "${AUDITOR_SERVICE_ACCOUNT}" "${expected_role}"
}

federation_binding_state() {
  if [[ "$(auditor_state)" == "missing" ]]; then printf 'missing'; return; fi
  gcloud iam service-accounts get-iam-policy "${AUDITOR_SERVICE_ACCOUNT}" --project="${PROJECT_ID}" --format=json | node -e '
    const fs = require("fs");
    const policy = JSON.parse(fs.readFileSync(0, "utf8"));
    const actual = (policy.bindings || [])
      .flatMap((binding) => (binding.members || []).map((member) => ({ role: binding.role, member, condition: binding.condition ?? null })));
    if (actual.length === 0) {
      process.stdout.write("missing");
    } else {
      const expected = [{ role: process.argv[2], member: process.argv[1], condition: null }];
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        process.stderr.write("STOP: production auditor federation IAM drifted\n");
        process.exit(1);
      }
      process.stdout.write("ready");
    }
  ' "${FEDERATED_MEMBER}" "${FEDERATION_ROLE}"
}

API_STATES=()
for api in "${REQUIRED_APIS[@]}"; do API_STATES+=("${api}:$(api_state "${api}")"); done
PRODUCTION_ROLE_STATE="$(custom_role_state "${PROJECT_ID}" "${PRODUCTION_ROLE_ID}" "${PRODUCTION_ROLE_PERMISSIONS}")"
STAGING_ROLE_STATE="$(custom_role_state "${STAGING_PROJECT_ID}" "${STAGING_ROLE_ID}" "${STAGING_ROLE_PERMISSIONS}")"
AUDITOR_STATE="$(auditor_state)"
POOL_STATE="$(pool_state)"
if [[ "${POOL_STATE}" == "ready" ]]; then PROVIDER_STATE="$(provider_state)"; else PROVIDER_STATE="missing"; fi
PRODUCTION_BINDING_STATE="$(project_binding_state "${PROJECT_ID}" "${PRODUCTION_ROLE_NAME}")"
STAGING_BINDING_STATE="$(project_binding_state "${STAGING_PROJECT_ID}" "${STAGING_ROLE_NAME}")"
FEDERATION_BINDING_STATE="$(federation_binding_state)"

printf '%s\n' "${ACTIVATION_INPUT}"
echo "READ-ONLY PRODUCTION FOUNDATION PREFLIGHT TRUST REVIEW PASS"
echo "Source: ${EXPECTED_SHA}"
echo "Repository: ${REPOSITORY} (${REPOSITORY_ID})"
echo "Provider: ${PROVIDER_RESOURCE} (${PROVIDER_STATE})"
echo "Auditor: ${AUDITOR_SERVICE_ACCOUNT} (${AUDITOR_STATE})"
echo "Production role: ${PRODUCTION_ROLE_NAME} (${PRODUCTION_ROLE_STATE})"
echo "Staging source role: ${STAGING_ROLE_NAME} (${STAGING_ROLE_STATE})"
echo "Production IAM: ${PRODUCTION_BINDING_STATE}"
echo "Staging source IAM: ${STAGING_BINDING_STATE}"
echo "Federation IAM: ${FEDERATION_BINDING_STATE}"
printf 'API: %s\n' "${API_STATES[@]}"

if [[ "${MODE}" == "--review" ]]; then
  echo "REVIEW COMPLETE — NO CLOUD OR GITHUB CHANGES"
  exit 0
fi

[[ "${SAMRA_GCP_PRODUCTION_PREFLIGHT_APPLY}" == "${AUTHORIZATION}" ]] || {
  echo "STOP: set SAMRA_GCP_PRODUCTION_PREFLIGHT_APPLY=${AUTHORIZATION}" >&2
  exit 1
}

gcloud services enable "${REQUIRED_APIS[@]}" --project="${PROJECT_ID}" --quiet

if [[ "${PRODUCTION_ROLE_STATE}" == "missing" ]]; then
  gcloud iam roles create "${PRODUCTION_ROLE_ID}" --project="${PROJECT_ID}" \
    --title="Samra production boundary auditor" \
    --description="Exact project and single-project budget reads for the keyless production preflight" \
    --stage=GA --permissions="${PRODUCTION_ROLE_PERMISSIONS}" --quiet
fi
if [[ "${STAGING_ROLE_STATE}" == "missing" ]]; then
  gcloud iam roles create "${STAGING_ROLE_ID}" --project="${STAGING_PROJECT_ID}" \
    --title="Samra production billing-source reader" \
    --description="Exact staging project read used only to compare the production billing link" \
    --stage=GA --permissions="${STAGING_ROLE_PERMISSIONS}" --quiet
fi

if [[ "${AUDITOR_STATE}" == "missing" ]]; then
  attempt=1
  while ((attempt <= SERVICE_ACCOUNT_CREATE_MAX_ATTEMPTS)); do
    if output="$(gcloud iam service-accounts create "${AUDITOR_ID}" --project="${PROJECT_ID}" --display-name="Samra keyless production boundary auditor" --quiet 2>&1)"; then
      printf '%s\n' "${output}"
      break
    fi
    printf '%s\n' "${output}" >&2
    if [[ "${output}" != *"RESOURCE_EXHAUSTED"* || "${output}" != *"Service accounts created per minute per project"* || "${attempt}" -ge "${SERVICE_ACCOUNT_CREATE_MAX_ATTEMPTS}" ]]; then
      exit 1
    fi
    echo "Service-account creation quota reached; retrying in ${SERVICE_ACCOUNT_QUOTA_BACKOFF_SECONDS} seconds." >&2
    sleep "${SERVICE_ACCOUNT_QUOTA_BACKOFF_SECONDS}"
    attempt=$((attempt + 1))
  done
fi

if [[ "${POOL_STATE}" == "missing" ]]; then
  gcloud iam workload-identity-pools create "${POOL_ID}" --project="${PROJECT_ID}" \
    --location="${LOCATION}" --display-name="Samra production review" --quiet
fi
if [[ "${PROVIDER_STATE}" == "missing" ]]; then
  gcloud iam workload-identity-pools providers create-oidc "${PROVIDER_ID}" \
    --project="${PROJECT_ID}" --location="${LOCATION}" \
    --workload-identity-pool="${POOL_ID}" \
    --display-name="Samra production foundation preflight" \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="${ATTRIBUTE_MAPPING}" \
    --attribute-condition="${ATTRIBUTE_CONDITION}" --quiet
fi
if [[ "${PRODUCTION_BINDING_STATE}" == "missing" ]]; then
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:${AUDITOR_SERVICE_ACCOUNT}" \
    --role="${PRODUCTION_ROLE_NAME}" --condition=None --quiet >/dev/null
fi
if [[ "${STAGING_BINDING_STATE}" == "missing" ]]; then
  gcloud projects add-iam-policy-binding "${STAGING_PROJECT_ID}" \
    --member="serviceAccount:${AUDITOR_SERVICE_ACCOUNT}" \
    --role="${STAGING_ROLE_NAME}" --condition=None --quiet >/dev/null
fi
if [[ "${FEDERATION_BINDING_STATE}" == "missing" ]]; then
  gcloud iam service-accounts add-iam-policy-binding "${AUDITOR_SERVICE_ACCOUNT}" \
    --project="${PROJECT_ID}" --member="${FEDERATED_MEMBER}" \
    --role="${FEDERATION_ROLE}" --condition=None --quiet >/dev/null
fi

for api in "${REQUIRED_APIS[@]}"; do [[ "$(api_state "${api}")" == "ready" ]] || { echo "STOP: ${api} was not verified" >&2; exit 1; }; done
[[ "$(custom_role_state "${PROJECT_ID}" "${PRODUCTION_ROLE_ID}" "${PRODUCTION_ROLE_PERMISSIONS}")" == "ready" ]] || { echo "STOP: production preflight role was not verified" >&2; exit 1; }
[[ "$(custom_role_state "${STAGING_PROJECT_ID}" "${STAGING_ROLE_ID}" "${STAGING_ROLE_PERMISSIONS}")" == "ready" ]] || { echo "STOP: staging source role was not verified" >&2; exit 1; }
[[ "$(auditor_state)" == "ready" ]] || { echo "STOP: production auditor was not verified" >&2; exit 1; }
[[ "$(pool_state)" == "ready" ]] || { echo "STOP: production review pool was not verified" >&2; exit 1; }
[[ "$(provider_state)" == "ready" ]] || { echo "STOP: production review provider was not verified" >&2; exit 1; }
[[ "$(project_binding_state "${PROJECT_ID}" "${PRODUCTION_ROLE_NAME}")" == "ready" ]] || { echo "STOP: production auditor IAM was not verified" >&2; exit 1; }
[[ "$(project_binding_state "${STAGING_PROJECT_ID}" "${STAGING_ROLE_NAME}")" == "ready" ]] || { echo "STOP: staging source IAM was not verified" >&2; exit 1; }
[[ "$(federation_binding_state)" == "ready" ]] || { echo "STOP: production auditor federation was not verified" >&2; exit 1; }

echo "PRODUCTION FOUNDATION PREFLIGHT TRUST APPLIED AND VERIFIED"
echo "Provider: ${PROVIDER_RESOURCE}"
echo "Auditor: ${AUDITOR_SERVICE_ACCOUNT}"
echo "No billing-account role, service-account key, build, image, infrastructure, database, secret, deployment, traffic, customer data, vendor, or DNS change was created."
