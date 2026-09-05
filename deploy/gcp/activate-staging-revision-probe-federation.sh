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
: "${SAMRA_GCP_ORGANIZATION_ID:=614833350075}"
: "${SAMRA_GCP_REGION:=us-east4}"
: "${SAMRA_GCP_OPERATOR_ACCOUNT:=}"
: "${SAMRA_GCP_EXPECTED_SHA:=$(git -C "${ROOT_DIR}" rev-parse HEAD)}"
: "${SAMRA_GCP_REVISION_PROBE_FEDERATION_APPLY:=}"

PROJECT_ID="${SAMRA_GCP_PROJECT_ID}"
PROJECT_NUMBER="${SAMRA_GCP_PROJECT_NUMBER}"
ORGANIZATION_ID="${SAMRA_GCP_ORGANIZATION_ID}"
REGION="${SAMRA_GCP_REGION}"
OPERATOR="${SAMRA_GCP_OPERATOR_ACCOUNT}"
EXPECTED_SHA="${SAMRA_GCP_EXPECTED_SHA}"
POOL_ID="samra-revision-probe-staging"
POOL_DISPLAY_NAME="Samra staging revision probe"
PROVIDER_ID="samra-pay-revision-probe-main"
LOCATION="global"
CONTROLLER_ID="samra-github-probe-staging"
CONTROLLER="${CONTROLLER_ID}@${PROJECT_ID}.iam.gserviceaccount.com"
RUNTIME_ID="samra-revision-probe-staging"
RUNTIME="${RUNTIME_ID}@${PROJECT_ID}.iam.gserviceaccount.com"
CLOUD_RUN_SERVICE_AGENT="service-${PROJECT_NUMBER}@serverless-robot-prod.iam.gserviceaccount.com"
CUSTOM_ROLE_ID="samraStagingRevisionProbe"
CUSTOM_ROLE="projects/${PROJECT_ID}/roles/${CUSTOM_ROLE_ID}"
ARTIFACT_REPOSITORY="samra-staging"
SERVICE="samra-api"
JOB="samra-staging-revision-probe"
LOG_BUCKET="_Default"
LOG_LOCATION="global"
LOG_VIEW="samra-staging-revision-probe"
LOG_FILTER='resource.type="cloud_run_job" AND resource.labels.job_name="samra-staging-revision-probe"'
AUTHORIZATION="AUTHORIZED_STAGING_REVISION_PROBE_FEDERATION"
REPOSITORY="samra-pay/Samra-Pay"
REPOSITORY_ID="1335175962"
REPOSITORY_OWNER_ID="320532147"
POOL_RESOURCE="projects/${PROJECT_NUMBER}/locations/${LOCATION}/workloadIdentityPools/${POOL_ID}"
PROVIDER_RESOURCE="${POOL_RESOURCE}/providers/${PROVIDER_ID}"
FEDERATED_MEMBER="principalSet://iam.googleapis.com/${POOL_RESOURCE}/attribute.repository_id/${REPOSITORY_ID}"
ATTRIBUTE_MAPPING="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.repository_id=assertion.repository_id,attribute.repository_owner_id=assertion.repository_owner_id,attribute.ref=assertion.ref,attribute.event_name=assertion.event_name,attribute.workflow=assertion.workflow,attribute.workflow_ref=assertion.workflow_ref,attribute.environment=assertion.environment"
ATTRIBUTE_CONDITION="assertion.repository=='${REPOSITORY}' && assertion.repository_id=='${REPOSITORY_ID}' && assertion.repository_owner_id=='${REPOSITORY_OWNER_ID}' && assertion.ref=='refs/heads/main' && assertion.event_name=='workflow_dispatch' && assertion.workflow=='Staging verification probe' && assertion.workflow_ref=='samra-pay/Samra-Pay/.github/workflows/staging-verification-probe.yml@refs/heads/main' && assertion.environment=='staging-verification'"
CUSTOM_ROLE_PERMISSIONS="compute.networks.get,compute.subnetworks.get,iam.serviceAccountKeys.list,iam.serviceAccounts.get,logging.views.get,resourcemanager.projects.get,resourcemanager.projects.getIamPolicy,run.executions.get,run.executions.list,run.jobs.create,run.jobs.delete,run.jobs.get,run.jobs.run,run.operations.get,run.revisions.get,run.services.get,run.services.getIamPolicy,run.services.update,serviceusage.services.list,serviceusage.services.use"
REQUIRED_APIS=(artifactregistry.googleapis.com compute.googleapis.com iam.googleapis.com iamcredentials.googleapis.com logging.googleapis.com run.googleapis.com serviceusage.googleapis.com sts.googleapis.com)

export SAMRA_GCP_PROJECT_ID SAMRA_GCP_PROJECT_NUMBER SAMRA_GCP_ORGANIZATION_ID
export SAMRA_GCP_REGION SAMRA_GCP_OPERATOR_ACCOUNT

VALIDATED="$(node "${ROOT_DIR}/deploy/gcp/validate-staging-revision-probe.mjs" 2>&1)" || {
  echo "${VALIDATED}" >&2
  exit 1
}

if [[ "${MODE}" == "--plan" ]]; then
  printf '%s\n' "${VALIDATED}"
  cat <<PLAN
Plan only. No Google Cloud, GitHub, service, job, traffic, Qase, database, or evidence state was read or changed.

Activation creates one isolated main-only Workload Identity provider, one
keyless controller, one keyless no-secret runtime identity, one exact custom
role, repository read access for the controller, invoker access for the runtime
only on samra-api, and one job-scoped logging view. It does not execute a probe,
change a service, create a job, change traffic, create public access, read a
secret, activate a vendor, or touch production.

Provider: ${PROVIDER_RESOURCE}
Controller: ${CONTROLLER}
Runtime: ${RUNTIME}
Required apply authorization: ${AUTHORIZATION}
PLAN
  exit 0
fi

command -v gcloud >/dev/null 2>&1 || { echo "gcloud is required" >&2; exit 1; }
[[ "${OPERATOR}" =~ ^[^@[:space:]]+@davidhaile\.com$ ]] || { echo "STOP: activation requires a davidhaile.com administrator" >&2; exit 1; }
[[ "$(gcloud config get-value account 2>/dev/null)" == "${OPERATOR}" ]] || { echo "STOP: wrong Google account" >&2; exit 1; }
[[ "$(gcloud config get-value project 2>/dev/null)" == "${PROJECT_ID}" ]] || { echo "STOP: wrong Google Cloud project" >&2; exit 1; }
[[ "$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')" == "${PROJECT_NUMBER}" ]] || { echo "STOP: wrong project number" >&2; exit 1; }
[[ "$(gcloud projects describe "${PROJECT_ID}" --format='value(parent.id)')" == "${ORGANIZATION_ID}" ]] || { echo "STOP: wrong organization" >&2; exit 1; }
[[ "$(git -C "${ROOT_DIR}" rev-parse HEAD)" == "${EXPECTED_SHA}" ]] || { echo "STOP: source commit does not match the reviewed SHA" >&2; exit 1; }
[[ -z "$(git -C "${ROOT_DIR}" status --porcelain)" ]] || { echo "STOP: source working tree is not clean" >&2; exit 1; }

api_state() {
  local api="$1"
  [[ "$(gcloud services list --enabled --project="${PROJECT_ID}" --filter="config.name=${api}" --format='value(config.name)')" == "${api}" ]] && printf ready || printf missing
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

role_state() {
  if ! gcloud iam roles describe "${CUSTOM_ROLE_ID}" --project="${PROJECT_ID}" >/dev/null 2>&1; then printf missing; return; fi
  gcloud iam roles describe "${CUSTOM_ROLE_ID}" --project="${PROJECT_ID}" --format=json | node -e '
    const role = JSON.parse(require("fs").readFileSync(0, "utf8"));
    const actual = [...(role.includedPermissions || [])].sort();
    const expected = process.argv[1].split(",").sort();
    if (role.deleted === true || role.stage !== "GA" || JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error("revision-probe custom role drifted");
    process.stdout.write("ready");
  ' "${CUSTOM_ROLE_PERMISSIONS}"
}

pool_state() {
  if ! gcloud iam workload-identity-pools describe "${POOL_ID}" --project="${PROJECT_ID}" --location="${LOCATION}" >/dev/null 2>&1; then printf missing; return; fi
  gcloud iam workload-identity-pools describe "${POOL_ID}" --project="${PROJECT_ID}" --location="${LOCATION}" --format=json | node -e '
    const pool = JSON.parse(require("fs").readFileSync(0, "utf8"));
    if (pool.state !== "ACTIVE" || pool.displayName !== process.argv[1]) throw new Error("revision-probe pool drifted");
    process.stdout.write("ready");
  ' "${POOL_DISPLAY_NAME}"
}

assert_pool_isolated() {
  local provider
  while IFS= read -r provider; do
    [[ -z "${provider}" || "${provider##*/}" == "${PROVIDER_ID}" ]] || { echo "STOP: revision-probe pool contains an unreviewed provider" >&2; exit 1; }
  done < <(gcloud iam workload-identity-pools providers list --project="${PROJECT_ID}" --location="${LOCATION}" --workload-identity-pool="${POOL_ID}" --format='value(name)')
}

provider_state() {
  if ! gcloud iam workload-identity-pools providers describe "${PROVIDER_ID}" --project="${PROJECT_ID}" --location="${LOCATION}" --workload-identity-pool="${POOL_ID}" >/dev/null 2>&1; then printf missing; return; fi
  gcloud iam workload-identity-pools providers describe "${PROVIDER_ID}" --project="${PROJECT_ID}" --location="${LOCATION}" --workload-identity-pool="${POOL_ID}" --format=json | node -e '
    const provider = JSON.parse(require("fs").readFileSync(0, "utf8"));
    const mapping = Object.fromEntries(process.argv[1].split(",").map((entry) => { const split = entry.indexOf("="); return [entry.slice(0, split), entry.slice(split + 1)]; }));
    const canonical = (value) => JSON.stringify(Object.fromEntries(Object.entries(value).sort()));
    if (provider.state !== "ACTIVE" || provider.oidc?.issuerUri !== "https://token.actions.githubusercontent.com" || canonical(provider.attributeMapping || {}) !== canonical(mapping) || provider.attributeCondition !== process.argv[2]) throw new Error("revision-probe provider drifted");
    process.stdout.write("ready");
  ' "${ATTRIBUTE_MAPPING}" "${ATTRIBUTE_CONDITION}"
}

member_state() {
  local policy_json="$1" member="$2" role="$3"
  node -e '
    const policy = JSON.parse(process.argv[1]);
    const actual = (policy.bindings || []).filter((binding) => (binding.members || []).includes(process.argv[2])).map((binding) => ({ role: binding.role, condition: binding.condition ?? null })).sort((a, b) => a.role.localeCompare(b.role));
    if (actual.length === 0) process.stdout.write("missing");
    else if (JSON.stringify(actual) === JSON.stringify([{ role: process.argv[3], condition: null }])) process.stdout.write("ready");
    else throw new Error(`IAM drift for ${process.argv[2]}`);
  ' "${policy_json}" "${member}" "${role}"
}

member_absent_state() {
  local policy_json="$1" member="$2"
  node -e '
    const policy = JSON.parse(process.argv[1]);
    const actual = (policy.bindings || []).filter((binding) => (binding.members || []).includes(process.argv[2]));
    if (actual.length === 0) process.stdout.write("ready"); else throw new Error(`Unexpected IAM for ${process.argv[2]}`);
  ' "${policy_json}" "${member}"
}

member_has_role_state() {
  local policy_json="$1" member="$2" role="$3"
  node -e '
    const policy = JSON.parse(process.argv[1]);
    const found = (policy.bindings || []).some((binding) => binding.role === process.argv[3] && !binding.condition && (binding.members || []).includes(process.argv[2]));
    process.stdout.write(found ? "ready" : "missing");
  ' "${policy_json}" "${member}" "${role}"
}

log_view_state() {
  if ! gcloud logging views describe "${LOG_VIEW}" --bucket="${LOG_BUCKET}" --location="${LOG_LOCATION}" --project="${PROJECT_ID}" >/dev/null 2>&1; then printf missing; return; fi
  gcloud logging views describe "${LOG_VIEW}" --bucket="${LOG_BUCKET}" --location="${LOG_LOCATION}" --project="${PROJECT_ID}" --format=json | node -e '
    const view = JSON.parse(require("fs").readFileSync(0, "utf8"));
    if (view.filter !== process.argv[1]) throw new Error("revision-probe log view drifted");
    process.stdout.write("ready");
  ' "${LOG_FILTER}"
}

API_STATES=()
for api in "${REQUIRED_APIS[@]}"; do API_STATES+=("${api}:$(api_state "${api}")"); done
ROLE_STATE="$(role_state)"
POOL_STATE="$(pool_state)"
if [[ "${POOL_STATE}" == ready ]]; then assert_pool_isolated; fi
PROVIDER_STATE="$(provider_state)"
CONTROLLER_STATE="$(service_account_state "${CONTROLLER}")"
RUNTIME_STATE="$(service_account_state "${RUNTIME}")"
LOG_VIEW_STATE="$(log_view_state)"
PROJECT_POLICY="$(gcloud projects get-iam-policy "${PROJECT_ID}" --format=json)"
SERVICE_POLICY="$(gcloud run services get-iam-policy "${SERVICE}" --project="${PROJECT_ID}" --region="${REGION}" --format=json)"
SERVICE_AGENT_STATE="$(member_has_role_state "${PROJECT_POLICY}" "serviceAccount:${CLOUD_RUN_SERVICE_AGENT}" "roles/run.serviceAgent")"
RUNTIME_PROJECT_STATE="$(member_absent_state "${PROJECT_POLICY}" "serviceAccount:${RUNTIME}")"
RUNTIME_SERVICE_STATE="$(member_state "${SERVICE_POLICY}" "serviceAccount:${RUNTIME}" "roles/run.invoker")"

if [[ "${CONTROLLER_STATE}" == ready ]]; then
  PROJECT_STATE="$(member_state "${PROJECT_POLICY}" "serviceAccount:${CONTROLLER}" "${CUSTOM_ROLE}")"
  REPOSITORY_POLICY="$(gcloud artifacts repositories get-iam-policy "${ARTIFACT_REPOSITORY}" --project="${PROJECT_ID}" --location="${REGION}" --format=json)"
  REPOSITORY_STATE="$(member_state "${REPOSITORY_POLICY}" "serviceAccount:${CONTROLLER}" "roles/artifactregistry.reader")"
  FEDERATION_STATE="$(member_state "$(gcloud iam service-accounts get-iam-policy "${CONTROLLER}" --project="${PROJECT_ID}" --format=json)" "${FEDERATED_MEMBER}" "roles/iam.workloadIdentityUser")"
else
  PROJECT_STATE=missing; REPOSITORY_STATE=missing; FEDERATION_STATE=missing
fi
if [[ "${CONTROLLER_STATE}" == ready && "${RUNTIME_STATE}" == ready ]]; then
  RUNTIME_USE_STATE="$(member_state "$(gcloud iam service-accounts get-iam-policy "${RUNTIME}" --project="${PROJECT_ID}" --format=json)" "serviceAccount:${CONTROLLER}" "roles/iam.serviceAccountUser")"
else
  RUNTIME_USE_STATE=missing
fi
if [[ "${CONTROLLER_STATE}" == ready && "${LOG_VIEW_STATE}" == ready ]]; then
  LOG_IAM_STATE="$(member_state "$(gcloud logging views get-iam-policy "${LOG_VIEW}" --bucket="${LOG_BUCKET}" --location="${LOG_LOCATION}" --project="${PROJECT_ID}" --format=json)" "serviceAccount:${CONTROLLER}" "roles/logging.viewAccessor")"
else
  LOG_IAM_STATE=missing
fi

echo "READ-ONLY STAGING REVISION-PROBE FEDERATION REVIEW PASS"
echo "Source: ${EXPECTED_SHA}"
echo "Provider: ${PROVIDER_RESOURCE} (${PROVIDER_STATE}); isolated pool ${POOL_STATE}"
echo "Controller: ${CONTROLLER} (${CONTROLLER_STATE}); project ${PROJECT_STATE}; repository ${REPOSITORY_STATE}"
echo "Runtime: ${RUNTIME} (${RUNTIME_STATE}); project IAM ${RUNTIME_PROJECT_STATE}; service invoker ${RUNTIME_SERVICE_STATE}"
echo "Runtime use: ${RUNTIME_USE_STATE}; log view ${LOG_VIEW_STATE}; log IAM ${LOG_IAM_STATE}"
echo "Cloud Run service agent: ${SERVICE_AGENT_STATE}; federation IAM ${FEDERATION_STATE}"
printf 'API: %s\n' "${API_STATES[@]}"

if [[ "${MODE}" == "--review" ]]; then
  echo "REVIEW COMPLETE — NO CLOUD, GITHUB, SERVICE, JOB, TRAFFIC, OR QASE CHANGES"
  exit 0
fi

[[ "${SAMRA_GCP_REVISION_PROBE_FEDERATION_APPLY}" == "${AUTHORIZATION}" ]] || { echo "STOP: set SAMRA_GCP_REVISION_PROBE_FEDERATION_APPLY=${AUTHORIZATION}" >&2; exit 1; }
[[ "${SERVICE_AGENT_STATE}" == ready ]] || { echo "STOP: provider-managed Cloud Run service-agent authority is missing" >&2; exit 1; }

gcloud services enable "${REQUIRED_APIS[@]}" --project="${PROJECT_ID}" --quiet
if [[ "${POOL_STATE}" == missing ]]; then gcloud iam workload-identity-pools create "${POOL_ID}" --project="${PROJECT_ID}" --location="${LOCATION}" --display-name="${POOL_DISPLAY_NAME}" --quiet; fi
[[ "$(pool_state)" == ready ]] || { echo "STOP: revision-probe pool is not ready" >&2; exit 1; }
assert_pool_isolated
if [[ "${ROLE_STATE}" == missing ]]; then
  gcloud iam roles create "${CUSTOM_ROLE_ID}" --project="${PROJECT_ID}" --title="Samra staging revision probe" --description="Bounded private exact-revision probe controller" --stage=GA --permissions="${CUSTOM_ROLE_PERMISSIONS}" --quiet
fi
if [[ "${CONTROLLER_STATE}" == missing ]]; then gcloud iam service-accounts create "${CONTROLLER_ID}" --project="${PROJECT_ID}" --display-name="Samra keyless staging revision-probe controller" --quiet; fi
if [[ "${RUNTIME_STATE}" == missing ]]; then gcloud iam service-accounts create "${RUNTIME_ID}" --project="${PROJECT_ID}" --display-name="Samra staging no-secret revision-probe runtime" --quiet; fi
if [[ "${PROVIDER_STATE}" == missing ]]; then
  gcloud iam workload-identity-pools providers create-oidc "${PROVIDER_ID}" --project="${PROJECT_ID}" --location="${LOCATION}" --workload-identity-pool="${POOL_ID}" --display-name="Samra Pay main revision probe" --issuer-uri="https://token.actions.githubusercontent.com" --attribute-mapping="${ATTRIBUTE_MAPPING}" --attribute-condition="${ATTRIBUTE_CONDITION}" --quiet
fi
if [[ "${LOG_VIEW_STATE}" == missing ]]; then
  gcloud logging views create "${LOG_VIEW}" --bucket="${LOG_BUCKET}" --location="${LOG_LOCATION}" --project="${PROJECT_ID}" --description="Synthetic stdout for the temporary Samra staging revision probe only" --log-filter="${LOG_FILTER}" --quiet
fi
if [[ "${PROJECT_STATE}" == missing ]]; then gcloud projects add-iam-policy-binding "${PROJECT_ID}" --member="serviceAccount:${CONTROLLER}" --role="${CUSTOM_ROLE}" --quiet; fi
if [[ "${REPOSITORY_STATE}" == missing ]]; then gcloud artifacts repositories add-iam-policy-binding "${ARTIFACT_REPOSITORY}" --project="${PROJECT_ID}" --location="${REGION}" --member="serviceAccount:${CONTROLLER}" --role="roles/artifactregistry.reader" --quiet; fi
if [[ "${RUNTIME_USE_STATE}" == missing ]]; then gcloud iam service-accounts add-iam-policy-binding "${RUNTIME}" --project="${PROJECT_ID}" --member="serviceAccount:${CONTROLLER}" --role="roles/iam.serviceAccountUser" --quiet; fi
if [[ "${RUNTIME_SERVICE_STATE}" == missing ]]; then gcloud run services add-iam-policy-binding "${SERVICE}" --project="${PROJECT_ID}" --region="${REGION}" --member="serviceAccount:${RUNTIME}" --role="roles/run.invoker" --quiet; fi
if [[ "${LOG_IAM_STATE}" == missing ]]; then gcloud logging views add-iam-policy-binding "${LOG_VIEW}" --bucket="${LOG_BUCKET}" --location="${LOG_LOCATION}" --project="${PROJECT_ID}" --member="serviceAccount:${CONTROLLER}" --role="roles/logging.viewAccessor" --quiet; fi
if [[ "${FEDERATION_STATE}" == missing ]]; then gcloud iam service-accounts add-iam-policy-binding "${CONTROLLER}" --project="${PROJECT_ID}" --member="${FEDERATED_MEMBER}" --role="roles/iam.workloadIdentityUser" --quiet; fi

SAMRA_GCP_OPERATOR_ACCOUNT="${OPERATOR}" SAMRA_GCP_EXPECTED_SHA="${EXPECTED_SHA}" bash "${ROOT_DIR}/deploy/gcp/audit-staging-revision-probe-federation.sh"
echo "STAGING REVISION-PROBE FEDERATION APPLIED AND VERIFIED"
echo "Stored Google credential created: no"
echo "Probe executed: no"
echo "Traffic changed: no"
