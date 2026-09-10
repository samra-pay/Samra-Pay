#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MODE="${1:---plan}"
if [[ "${MODE}" != "--plan" && "${MODE}" != "--review" && "${MODE}" != "--apply" ]]; then
  echo "Usage: $0 [--plan|--review|--apply]" >&2
  exit 2
fi

: "${SAMRA_GCP_PROJECT_ID:=samra-pay-staging}"
: "${SAMRA_GCP_PROJECT_NUMBER:=934122615631}"
: "${SAMRA_GCP_ORGANIZATION_ID:=993968777863}"
: "${SAMRA_GCP_REGION:=us-east4}"
: "${SAMRA_GCP_OPERATOR_ACCOUNT:=}"
: "${SAMRA_GCP_EXPECTED_SHA:=$(git -C "${ROOT_DIR}" rev-parse HEAD)}"
: "${SAMRA_GCP_TRAFFIC_FEDERATION_APPLY:=}"

PROJECT_ID="${SAMRA_GCP_PROJECT_ID}"
PROJECT_NUMBER="${SAMRA_GCP_PROJECT_NUMBER}"
ORGANIZATION_ID="${SAMRA_GCP_ORGANIZATION_ID}"
REGION="${SAMRA_GCP_REGION}"
OPERATOR="${SAMRA_GCP_OPERATOR_ACCOUNT}"
EXPECTED_SHA="${SAMRA_GCP_EXPECTED_SHA}"
POOL_ID="samra-traffic-staging"
POOL_DISPLAY_NAME="Samra staging traffic control"
LOCATION="global"
PROMOTION_PROVIDER_ID="samra-pay-promotion-main"
ROLLBACK_PROVIDER_ID="samra-pay-rollback-main"
PROMOTER_ID="samra-github-promoter-staging"
ROLLBACK_ID="samra-github-rollback-staging"
PROMOTER="${PROMOTER_ID}@${PROJECT_ID}.iam.gserviceaccount.com"
ROLLBACK_OPERATOR="${ROLLBACK_ID}@${PROJECT_ID}.iam.gserviceaccount.com"
CUSTOM_ROLE_ID="samraStagingTrafficController"
CUSTOM_ROLE_NAME="projects/${PROJECT_ID}/roles/${CUSTOM_ROLE_ID}"
FEDERATION_ROLE="roles/iam.workloadIdentityUser"
POOL_RESOURCE="projects/${PROJECT_NUMBER}/locations/${LOCATION}/workloadIdentityPools/${POOL_ID}"
PROMOTION_MEMBER="principalSet://iam.googleapis.com/${POOL_RESOURCE}/attribute.environment/staging-traffic-promotion"
ROLLBACK_MEMBER="principalSet://iam.googleapis.com/${POOL_RESOURCE}/attribute.environment/staging-traffic-rollback"
ATTRIBUTE_MAPPING="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.repository_id=assertion.repository_id,attribute.repository_owner_id=assertion.repository_owner_id,attribute.ref=assertion.ref,attribute.event_name=assertion.event_name,attribute.workflow=assertion.workflow,attribute.workflow_ref=assertion.workflow_ref,attribute.environment=assertion.environment"
COMMON_CONDITION="assertion.repository=='samra-pay/Samra-Pay' && assertion.repository_id=='1335175962' && assertion.repository_owner_id=='320532147' && assertion.ref=='refs/heads/main' && assertion.event_name=='workflow_dispatch' && assertion.workflow=='Staging traffic control' && assertion.workflow_ref=='samra-pay/Samra-Pay/.github/workflows/staging-traffic-control.yml@refs/heads/main'"
PROMOTION_CONDITION="${COMMON_CONDITION} && assertion.environment=='staging-traffic-promotion'"
ROLLBACK_CONDITION="${COMMON_CONDITION} && assertion.environment=='staging-traffic-rollback'"
CUSTOM_ROLE_PERMISSIONS="iam.roles.get,iam.serviceAccountKeys.list,iam.serviceAccounts.get,iam.serviceAccounts.getIamPolicy,iam.workloadIdentityPoolProviders.get,iam.workloadIdentityPools.get,resourcemanager.projects.get,resourcemanager.projects.getIamPolicy,run.operations.get,run.revisions.get,run.revisions.list,run.services.get,run.services.getIamPolicy,run.services.update,serviceusage.services.list,serviceusage.services.use"
AUTHORIZATION="AUTHORIZED_STAGING_TRAFFIC_FEDERATION"
REQUIRED_APIS=(iamcredentials.googleapis.com run.googleapis.com sts.googleapis.com)

VALIDATED="$(node "${ROOT_DIR}/deploy/gcp/validate-staging-traffic-control.mjs" 2>&1)" || {
  echo "${VALIDATED}" >&2
  exit 1
}

if [[ "${MODE}" == "--plan" ]]; then
  printf '%s\n' "${VALIDATED}"
  cat <<PLAN
Plan only. No Google Cloud, GitHub, traffic, vendor, database, or Replit state was read or changed.

The activation will create one isolated workload identity pool with exactly two
GitHub OIDC providers and two keyless service accounts. Promotion and rollback
use different protected environments, providers, and identities. Both receive
one exact traffic-only custom role; neither receives build, image, secret,
runtime impersonation, migration, public-IAM, or vendor authority.

Required apply authorization: ${AUTHORIZATION}
PLAN
  exit 0
fi

command -v gcloud >/dev/null 2>&1 || { echo "gcloud is required" >&2; exit 1; }
[[ "$(gcloud config get-value account 2>/dev/null)" == "${OPERATOR}" ]] || { echo "STOP: wrong Google account" >&2; exit 1; }
[[ "$(gcloud config get-value project 2>/dev/null)" == "${PROJECT_ID}" ]] || { echo "STOP: wrong project" >&2; exit 1; }
[[ "$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')" == "${PROJECT_NUMBER}" ]] || { echo "STOP: wrong project number" >&2; exit 1; }
[[ "$(gcloud projects describe "${PROJECT_ID}" --format='value(parent.id)')" == "${ORGANIZATION_ID}" ]] || { echo "STOP: wrong organization" >&2; exit 1; }
[[ "$(git -C "${ROOT_DIR}" rev-parse HEAD)" == "${EXPECTED_SHA}" ]] || { echo "STOP: source commit changed" >&2; exit 1; }
[[ -z "$(git -C "${ROOT_DIR}" status --porcelain --untracked-files=no)" ]] || { echo "STOP: source working tree is not clean" >&2; exit 1; }

api_state() {
  local api="$1"
  if [[ "$(gcloud services list --enabled --project="${PROJECT_ID}" --filter="config.name=${api}" --format='value(config.name)')" == "${api}" ]]; then printf ready; else printf missing; fi
}

role_state() {
  if ! gcloud iam roles describe "${CUSTOM_ROLE_ID}" --project="${PROJECT_ID}" >/dev/null 2>&1; then printf missing; return; fi
  gcloud iam roles describe "${CUSTOM_ROLE_ID}" --project="${PROJECT_ID}" --format=json | node -e '
    const role = JSON.parse(require("fs").readFileSync(0, "utf8"));
    const actual = [...(role.includedPermissions || [])].sort();
    const expected = process.argv[1].split(",").sort();
    if (role.deleted === true || role.stage !== "GA" || JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error("traffic custom role drifted");
    process.stdout.write("ready");
  ' "${CUSTOM_ROLE_PERMISSIONS}"
}

pool_state() {
  if ! gcloud iam workload-identity-pools describe "${POOL_ID}" --project="${PROJECT_ID}" --location="${LOCATION}" >/dev/null 2>&1; then printf missing; return; fi
  gcloud iam workload-identity-pools describe "${POOL_ID}" --project="${PROJECT_ID}" --location="${LOCATION}" --format=json | node -e '
    const pool = JSON.parse(require("fs").readFileSync(0, "utf8"));
    if (pool.state !== "ACTIVE" || pool.displayName !== process.argv[1]) throw new Error("traffic workload identity pool drifted");
    process.stdout.write("ready");
  ' "${POOL_DISPLAY_NAME}"
}

service_account_state() {
  local account="$1"
  if ! gcloud iam service-accounts describe "${account}" --project="${PROJECT_ID}" >/dev/null 2>&1; then printf missing; return; fi
  [[ -z "$(gcloud iam service-accounts keys list --iam-account="${account}" --project="${PROJECT_ID}" --managed-by=user --format='value(name)')" ]] || {
    echo "STOP: ${account} has a user-managed key" >&2
    exit 1
  }
  printf ready
}

provider_state() {
  local provider_id="$1"
  local expected_condition="$2"
  if ! gcloud iam workload-identity-pools providers describe "${provider_id}" --project="${PROJECT_ID}" --location="${LOCATION}" --workload-identity-pool="${POOL_ID}" >/dev/null 2>&1; then printf missing; return; fi
  gcloud iam workload-identity-pools providers describe "${provider_id}" --project="${PROJECT_ID}" --location="${LOCATION}" --workload-identity-pool="${POOL_ID}" --format=json | node -e '
    const provider = JSON.parse(require("fs").readFileSync(0, "utf8"));
    const expectedMapping = Object.fromEntries(process.argv[1].split(",").map((entry) => { const index = entry.indexOf("="); return [entry.slice(0, index), entry.slice(index + 1)]; }));
    const canonical = (value) => JSON.stringify(Object.fromEntries(Object.entries(value).sort()));
    if (provider.state !== "ACTIVE" || provider.oidc?.issuerUri !== "https://token.actions.githubusercontent.com" || canonical(provider.attributeMapping || {}) !== canonical(expectedMapping) || provider.attributeCondition !== process.argv[2]) throw new Error("traffic provider drifted");
    process.stdout.write("ready");
  ' "${ATTRIBUTE_MAPPING}" "${expected_condition}"
}

assert_pool_contains_no_unreviewed_provider() {
  mapfile -t providers < <(gcloud iam workload-identity-pools providers list --project="${PROJECT_ID}" --location="${LOCATION}" --workload-identity-pool="${POOL_ID}" --format='value(name)' | sed 's#.*/##' | sort)
  for provider in "${providers[@]}"; do
    [[ "${provider}" == "${PROMOTION_PROVIDER_ID}" || "${provider}" == "${ROLLBACK_PROVIDER_ID}" ]] || {
      echo "STOP: isolated traffic pool contains an unreviewed provider" >&2
      exit 1
    }
  done
}

member_binding_state() {
  local policy_json="$1"
  local member="$2"
  local expected_role="$3"
  node -e '
    const policy = JSON.parse(process.argv[1]);
    const actual = (policy.bindings || []).filter((binding) => (binding.members || []).includes(process.argv[2])).map((binding) => ({ role: binding.role, condition: binding.condition ?? null })).sort((a, b) => a.role.localeCompare(b.role));
    if (actual.length === 0) process.stdout.write("missing");
    else if (JSON.stringify(actual) === JSON.stringify([{ role: process.argv[3], condition: null }])) process.stdout.write("ready");
    else throw new Error(`IAM drift for ${process.argv[2]}`);
  ' "${policy_json}" "${member}" "${expected_role}"
}

ROLE_STATE="$(role_state)"
POOL_STATE="$(pool_state)"
PROMOTER_STATE="$(service_account_state "${PROMOTER}")"
ROLLBACK_STATE="$(service_account_state "${ROLLBACK_OPERATOR}")"
if [[ "${POOL_STATE}" == ready ]]; then
  assert_pool_contains_no_unreviewed_provider
  PROMOTION_PROVIDER_STATE="$(provider_state "${PROMOTION_PROVIDER_ID}" "${PROMOTION_CONDITION}")"
  ROLLBACK_PROVIDER_STATE="$(provider_state "${ROLLBACK_PROVIDER_ID}" "${ROLLBACK_CONDITION}")"
else
  PROMOTION_PROVIDER_STATE=missing
  ROLLBACK_PROVIDER_STATE=missing
fi
PROJECT_POLICY="$(gcloud projects get-iam-policy "${PROJECT_ID}" --format=json)"
if [[ "${PROMOTER_STATE}" == ready ]]; then
  PROMOTER_PROJECT_STATE="$(member_binding_state "${PROJECT_POLICY}" "serviceAccount:${PROMOTER}" "${CUSTOM_ROLE_NAME}")"
  PROMOTION_FEDERATION_STATE="$(member_binding_state "$(gcloud iam service-accounts get-iam-policy "${PROMOTER}" --project="${PROJECT_ID}" --format=json)" "${PROMOTION_MEMBER}" "${FEDERATION_ROLE}")"
else
  PROMOTER_PROJECT_STATE=missing
  PROMOTION_FEDERATION_STATE=missing
fi
if [[ "${ROLLBACK_STATE}" == ready ]]; then
  ROLLBACK_PROJECT_STATE="$(member_binding_state "${PROJECT_POLICY}" "serviceAccount:${ROLLBACK_OPERATOR}" "${CUSTOM_ROLE_NAME}")"
  ROLLBACK_FEDERATION_STATE="$(member_binding_state "$(gcloud iam service-accounts get-iam-policy "${ROLLBACK_OPERATOR}" --project="${PROJECT_ID}" --format=json)" "${ROLLBACK_MEMBER}" "${FEDERATION_ROLE}")"
else
  ROLLBACK_PROJECT_STATE=missing
  ROLLBACK_FEDERATION_STATE=missing
fi

echo "READ-ONLY STAGING TRAFFIC FEDERATION REVIEW PASS"
echo "Source: ${EXPECTED_SHA}"
echo "Pool: ${POOL_RESOURCE} (${POOL_STATE})"
echo "Promotion provider: ${PROMOTION_PROVIDER_ID} (${PROMOTION_PROVIDER_STATE})"
echo "Rollback provider: ${ROLLBACK_PROVIDER_ID} (${ROLLBACK_PROVIDER_STATE})"
echo "Promoter: ${PROMOTER} (${PROMOTER_STATE})"
echo "Rollback operator: ${ROLLBACK_OPERATOR} (${ROLLBACK_STATE})"
echo "Custom role: ${CUSTOM_ROLE_NAME} (${ROLE_STATE})"
echo "Promotion project IAM: ${PROMOTER_PROJECT_STATE}"
echo "Rollback project IAM: ${ROLLBACK_PROJECT_STATE}"
echo "Promotion federation IAM: ${PROMOTION_FEDERATION_STATE}"
echo "Rollback federation IAM: ${ROLLBACK_FEDERATION_STATE}"
for api in "${REQUIRED_APIS[@]}"; do echo "API: ${api}:$(api_state "${api}")"; done

if [[ "${MODE}" == "--review" ]]; then
  echo "REVIEW COMPLETE — NO CLOUD OR GITHUB CHANGES"
  exit 0
fi

[[ "${SAMRA_GCP_TRAFFIC_FEDERATION_APPLY}" == "${AUTHORIZATION}" ]] || { echo "STOP: exact federation authorization is missing" >&2; exit 1; }
gcloud services enable "${REQUIRED_APIS[@]}" --project="${PROJECT_ID}" --quiet
if [[ "${POOL_STATE}" == missing ]]; then
  gcloud iam workload-identity-pools create "${POOL_ID}" --project="${PROJECT_ID}" --location="${LOCATION}" --display-name="${POOL_DISPLAY_NAME}" --quiet
fi
if [[ "${ROLE_STATE}" == missing ]]; then
  gcloud iam roles create "${CUSTOM_ROLE_ID}" --project="${PROJECT_ID}" --title="Samra staging traffic controller" --description="Exact read and revision traffic reassignment only" --stage=GA --permissions="${CUSTOM_ROLE_PERMISSIONS}" --quiet
fi
if [[ "${PROMOTER_STATE}" == missing ]]; then
  gcloud iam service-accounts create "${PROMOTER_ID}" --project="${PROJECT_ID}" --display-name="Samra keyless staging traffic promoter" --quiet
fi
if [[ "${ROLLBACK_STATE}" == missing ]]; then
  gcloud iam service-accounts create "${ROLLBACK_ID}" --project="${PROJECT_ID}" --display-name="Samra keyless staging rollback operator" --quiet
fi
if [[ "${PROMOTION_PROVIDER_STATE}" == missing ]]; then
  gcloud iam workload-identity-pools providers create-oidc "${PROMOTION_PROVIDER_ID}" --project="${PROJECT_ID}" --location="${LOCATION}" --workload-identity-pool="${POOL_ID}" --display-name="Samra Pay main staging promotion" --issuer-uri="https://token.actions.githubusercontent.com" --attribute-mapping="${ATTRIBUTE_MAPPING}" --attribute-condition="${PROMOTION_CONDITION}" --quiet
fi
if [[ "${ROLLBACK_PROVIDER_STATE}" == missing ]]; then
  gcloud iam workload-identity-pools providers create-oidc "${ROLLBACK_PROVIDER_ID}" --project="${PROJECT_ID}" --location="${LOCATION}" --workload-identity-pool="${POOL_ID}" --display-name="Samra Pay main staging rollback" --issuer-uri="https://token.actions.githubusercontent.com" --attribute-mapping="${ATTRIBUTE_MAPPING}" --attribute-condition="${ROLLBACK_CONDITION}" --quiet
fi
if [[ "${PROMOTER_PROJECT_STATE}" == missing ]]; then
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" --member="serviceAccount:${PROMOTER}" --role="${CUSTOM_ROLE_NAME}" --quiet
fi
if [[ "${ROLLBACK_PROJECT_STATE}" == missing ]]; then
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" --member="serviceAccount:${ROLLBACK_OPERATOR}" --role="${CUSTOM_ROLE_NAME}" --quiet
fi
if [[ "${PROMOTION_FEDERATION_STATE}" == missing ]]; then
  gcloud iam service-accounts add-iam-policy-binding "${PROMOTER}" --project="${PROJECT_ID}" --member="${PROMOTION_MEMBER}" --role="${FEDERATION_ROLE}" --quiet
fi
if [[ "${ROLLBACK_FEDERATION_STATE}" == missing ]]; then
  gcloud iam service-accounts add-iam-policy-binding "${ROLLBACK_OPERATOR}" --project="${PROJECT_ID}" --member="${ROLLBACK_MEMBER}" --role="${FEDERATION_ROLE}" --quiet
fi

SAMRA_GCP_OPERATOR_ACCOUNT="${OPERATOR}" SAMRA_GCP_EXPECTED_SHA="${EXPECTED_SHA}" bash "${ROOT_DIR}/deploy/gcp/audit-staging-traffic-federation.sh"
echo "STAGING TRAFFIC FEDERATION APPLIED AND VERIFIED"
echo "Stored Google credential created: no"
echo "Traffic changed: no"
echo "Vendor activated: no"
