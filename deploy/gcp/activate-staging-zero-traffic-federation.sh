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
: "${SAMRA_GCP_ZERO_TRAFFIC_FEDERATION_APPLY:=}"

PROJECT_ID="${SAMRA_GCP_PROJECT_ID}"
PROJECT_NUMBER="${SAMRA_GCP_PROJECT_NUMBER}"
ORGANIZATION_ID="${SAMRA_GCP_ORGANIZATION_ID}"
REGION="${SAMRA_GCP_REGION}"
OPERATOR="${SAMRA_GCP_OPERATOR_ACCOUNT}"
EXPECTED_SHA="${SAMRA_GCP_EXPECTED_SHA}"
POOL_ID="samra-zero-traffic-staging"
POOL_DISPLAY_NAME="Samra staging zero-traffic deployment"
PROVIDER_ID="samra-pay-zero-traffic-main"
LOCATION="global"
DEPLOYER_ID="samra-github-deployer-staging"
DEPLOYER_SERVICE_ACCOUNT="${DEPLOYER_ID}@${PROJECT_ID}.iam.gserviceaccount.com"
CUSTOM_ROLE_ID="samraStagingZeroTrafficDeployer"
CUSTOM_ROLE_NAME="projects/${PROJECT_ID}/roles/${CUSTOM_ROLE_ID}"
ARTIFACT_REPOSITORY="samra-staging"
ARTIFACT_ROLE="roles/artifactregistry.reader"
RUNTIME_ROLE="roles/iam.serviceAccountUser"
FEDERATION_ROLE="roles/iam.workloadIdentityUser"
AUTHORIZATION="AUTHORIZED_STAGING_ZERO_TRAFFIC_FEDERATION"
REPOSITORY="haileleuld87/Samra-Pay"
REPOSITORY_ID="1335175962"
POOL_RESOURCE="projects/${PROJECT_NUMBER}/locations/${LOCATION}/workloadIdentityPools/${POOL_ID}"
PROVIDER_RESOURCE="${POOL_RESOURCE}/providers/${PROVIDER_ID}"
FEDERATED_MEMBER="principalSet://iam.googleapis.com/${POOL_RESOURCE}/attribute.repository_id/${REPOSITORY_ID}"
ATTRIBUTE_MAPPING="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.repository_id=assertion.repository_id,attribute.repository_owner_id=assertion.repository_owner_id,attribute.ref=assertion.ref,attribute.event_name=assertion.event_name,attribute.workflow=assertion.workflow,attribute.workflow_ref=assertion.workflow_ref,attribute.environment=assertion.environment"
ATTRIBUTE_CONDITION="assertion.repository=='${REPOSITORY}' && assertion.repository_id=='${REPOSITORY_ID}' && assertion.repository_owner_id=='237485986' && assertion.ref=='refs/heads/main' && assertion.event_name=='workflow_dispatch' && assertion.workflow=='Staging zero-traffic deployment' && assertion.workflow_ref=='haileleuld87/Samra-Pay/.github/workflows/staging-zero-traffic-deployment.yml@refs/heads/main' && assertion.environment=='staging-zero-traffic-deployment'"
CUSTOM_ROLE_PERMISSIONS="artifactregistry.dockerimages.get,artifactregistry.repositories.get,artifactregistry.repositories.getIamPolicy,compute.networks.get,compute.subnetworks.get,iam.roles.get,iam.serviceAccountKeys.list,iam.serviceAccounts.get,iam.serviceAccounts.getIamPolicy,iam.workloadIdentityPoolProviders.get,iam.workloadIdentityPools.get,resourcemanager.projects.get,resourcemanager.projects.getIamPolicy,run.operations.get,run.revisions.get,run.revisions.list,run.services.create,run.services.get,run.services.getIamPolicy,run.services.update,secretmanager.secrets.get,secretmanager.versions.get,serviceusage.services.list,serviceusage.services.use"
RUNTIME_SERVICE_ACCOUNTS=(
  "samra-api-staging@${PROJECT_ID}.iam.gserviceaccount.com"
  "samra-customer-web-staging@${PROJECT_ID}.iam.gserviceaccount.com"
  "samra-design-system-staging@${PROJECT_ID}.iam.gserviceaccount.com"
)
REQUIRED_APIS=(compute.googleapis.com iamcredentials.googleapis.com run.googleapis.com secretmanager.googleapis.com sts.googleapis.com)
CLOUD_RUN_SERVICE_AGENT="service-${PROJECT_NUMBER}@serverless-robot-prod.iam.gserviceaccount.com"
CLOUD_RUN_SERVICE_AGENT_ROLE="roles/run.serviceAgent"

export SAMRA_GCP_PROJECT_ID
export SAMRA_GCP_PROJECT_NUMBER
export SAMRA_GCP_ORGANIZATION_ID
export SAMRA_GCP_REGION
export SAMRA_GCP_OPERATOR_ACCOUNT

VALIDATED="$(node "${ROOT_DIR}/deploy/gcp/validate-staging-zero-traffic-deployment.mjs" 2>&1)" || {
  echo "${VALIDATED}" >&2
  exit 1
}

if [[ "${MODE}" == "--plan" ]]; then
  printf '%s\n' "${VALIDATED}"
  cat <<PLAN
Plan only. No Google Cloud or GitHub state was read or changed.

The activation will create a dedicated staging Workload Identity pool with one
main-only provider, one keyless deployment identity, one
exact project role, Artifact Registry read access, and service-account use on
only the three reviewed runtime identities. The provider also binds the exact
workflow name, path, manual event, protected environment, repository numeric
identity, owner numeric identity, and refs/heads/main. The isolated pool avoids
depending on GitHub's changeable subject format and prevents another staging
workflow provider from impersonating the deployment identity.

It cannot submit a build, publish an image, read a secret payload, deploy a
service, execute a migration, route traffic, mutate service IAM, activate a
vendor, create a service-account key, touch Replit, or touch production.

Provider: ${PROVIDER_RESOURCE}
Deployer: ${DEPLOYER_SERVICE_ACCOUNT}
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
  local enabled
  enabled="$(gcloud services list --enabled --project="${PROJECT_ID}" --filter="config.name=${api}" --format='value(config.name)')"
  [[ "${enabled}" == "${api}" ]] && printf ready || printf missing
}

role_state() {
  if ! gcloud iam roles describe "${CUSTOM_ROLE_ID}" --project="${PROJECT_ID}" >/dev/null 2>&1; then printf missing; return; fi
  gcloud iam roles describe "${CUSTOM_ROLE_ID}" --project="${PROJECT_ID}" --format=json | node -e '
    const role = JSON.parse(require("fs").readFileSync(0, "utf8"));
    const actual = [...(role.includedPermissions || [])].sort();
    const expected = process.argv[1].split(",").sort();
    if (role.deleted === true || role.stage !== "GA" || JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error("zero-traffic custom role drifted");
    }
    process.stdout.write("ready");
  ' "${CUSTOM_ROLE_PERMISSIONS}"
}

pool_state() {
  if ! gcloud iam workload-identity-pools describe "${POOL_ID}" --project="${PROJECT_ID}" --location="${LOCATION}" >/dev/null 2>&1; then printf missing; return; fi
  gcloud iam workload-identity-pools describe "${POOL_ID}" --project="${PROJECT_ID}" --location="${LOCATION}" --format=json | node -e '
    const pool = JSON.parse(require("fs").readFileSync(0, "utf8"));
    if (pool.state !== "ACTIVE" || pool.displayName !== process.argv[1]) throw new Error("zero-traffic workload identity pool drifted");
    process.stdout.write("ready");
  ' "${POOL_DISPLAY_NAME}"
}

assert_pool_isolated() {
  local provider
  while IFS= read -r provider; do
    [[ -z "${provider}" || "${provider##*/}" == "${PROVIDER_ID}" ]] || {
      echo "STOP: isolated zero-traffic pool contains an unreviewed provider" >&2
      exit 1
    }
  done < <(gcloud iam workload-identity-pools providers list \
    --project="${PROJECT_ID}" --location="${LOCATION}" \
    --workload-identity-pool="${POOL_ID}" --format='value(name)')
}

deployer_state() {
  if ! gcloud iam service-accounts describe "${DEPLOYER_SERVICE_ACCOUNT}" --project="${PROJECT_ID}" >/dev/null 2>&1; then printf missing; return; fi
  [[ -z "$(gcloud iam service-accounts keys list --iam-account="${DEPLOYER_SERVICE_ACCOUNT}" --project="${PROJECT_ID}" --managed-by=user --format='value(name)')" ]] || {
    echo "STOP: deployer identity has a user-managed key" >&2
    exit 1
  }
  printf ready
}

provider_state() {
  if ! gcloud iam workload-identity-pools providers describe "${PROVIDER_ID}" --project="${PROJECT_ID}" --location="${LOCATION}" --workload-identity-pool="${POOL_ID}" >/dev/null 2>&1; then printf missing; return; fi
  gcloud iam workload-identity-pools providers describe "${PROVIDER_ID}" --project="${PROJECT_ID}" --location="${LOCATION}" --workload-identity-pool="${POOL_ID}" --format=json | node -e '
    const provider = JSON.parse(require("fs").readFileSync(0, "utf8"));
    const expectedMapping = Object.fromEntries(process.argv[1].split(",").map((entry) => {
      const index = entry.indexOf("=");
      return [entry.slice(0, index), entry.slice(index + 1)];
    }));
    const canonical = (value) => JSON.stringify(Object.fromEntries(Object.entries(value).sort()));
    if (provider.state !== "ACTIVE" || provider.oidc?.issuerUri !== "https://token.actions.githubusercontent.com" || canonical(provider.attributeMapping || {}) !== canonical(expectedMapping) || provider.attributeCondition !== process.argv[2]) {
      throw new Error("zero-traffic provider drifted");
    }
    process.stdout.write("ready");
  ' "${ATTRIBUTE_MAPPING}" "${ATTRIBUTE_CONDITION}"
}

member_binding_state() {
  local policy_json="$1"
  local member="$2"
  local expected_role="$3"
  node -e '
    const policy = JSON.parse(process.argv[1]);
    const member = process.argv[2];
    const actual = (policy.bindings || []).filter((binding) => (binding.members || []).includes(member)).map((binding) => ({ role: binding.role, condition: binding.condition ?? null }));
    if (actual.length === 0) process.stdout.write("missing");
    else if (JSON.stringify(actual) === JSON.stringify([{ role: process.argv[3], condition: null }])) process.stdout.write("ready");
    else throw new Error(`IAM drift for ${member}`);
  ' "${policy_json}" "${member}" "${expected_role}"
}

member_has_role_state() {
  local policy_json="$1"
  local member="$2"
  local expected_role="$3"
  node -e '
    const policy = JSON.parse(process.argv[1]);
    const ready = (policy.bindings || []).some((binding) => binding.role === process.argv[3] && !binding.condition && (binding.members || []).includes(process.argv[2]));
    process.stdout.write(ready ? "ready" : "missing");
  ' "${policy_json}" "${member}" "${expected_role}"
}

ROLE_STATE="$(role_state)"
POOL_STATE="$(pool_state)"
if [[ "${POOL_STATE}" == ready ]]; then assert_pool_isolated; fi
DEPLOYER_STATE="$(deployer_state)"
PROVIDER_STATE="$(provider_state)"
RUN_SERVICE_AGENT_STATE="$(member_has_role_state "$(gcloud projects get-iam-policy "${PROJECT_ID}" --format=json)" "serviceAccount:${CLOUD_RUN_SERVICE_AGENT}" "${CLOUD_RUN_SERVICE_AGENT_ROLE}")"
if [[ "${DEPLOYER_STATE}" == ready ]]; then
  PROJECT_STATE="$(member_binding_state "$(gcloud projects get-iam-policy "${PROJECT_ID}" --format=json)" "serviceAccount:${DEPLOYER_SERVICE_ACCOUNT}" "${CUSTOM_ROLE_NAME}")"
  REPOSITORY_STATE="$(member_binding_state "$(gcloud artifacts repositories get-iam-policy "${ARTIFACT_REPOSITORY}" --project="${PROJECT_ID}" --location="${REGION}" --format=json)" "serviceAccount:${DEPLOYER_SERVICE_ACCOUNT}" "${ARTIFACT_ROLE}")"
  FEDERATION_STATE="$(member_binding_state "$(gcloud iam service-accounts get-iam-policy "${DEPLOYER_SERVICE_ACCOUNT}" --project="${PROJECT_ID}" --format=json)" "${FEDERATED_MEMBER}" "${FEDERATION_ROLE}")"
else
  PROJECT_STATE=missing
  REPOSITORY_STATE=missing
  FEDERATION_STATE=missing
fi

RUNTIME_STATES=()
for runtime in "${RUNTIME_SERVICE_ACCOUNTS[@]}"; do
  gcloud iam service-accounts describe "${runtime}" --project="${PROJECT_ID}" >/dev/null
  [[ -z "$(gcloud iam service-accounts keys list --iam-account="${runtime}" --project="${PROJECT_ID}" --managed-by=user --format='value(name)')" ]] || { echo "STOP: runtime identity has a user-managed key" >&2; exit 1; }
  if [[ "${DEPLOYER_STATE}" == ready ]]; then
    state="$(member_binding_state "$(gcloud iam service-accounts get-iam-policy "${runtime}" --project="${PROJECT_ID}" --format=json)" "serviceAccount:${DEPLOYER_SERVICE_ACCOUNT}" "${RUNTIME_ROLE}")"
  else
    state=missing
  fi
  RUNTIME_STATES+=("${runtime}:${state}")
done

API_STATES=()
for api in "${REQUIRED_APIS[@]}"; do API_STATES+=("${api}:$(api_state "${api}")"); done

echo "READ-ONLY STAGING ZERO-TRAFFIC FEDERATION REVIEW PASS"
echo "Source: ${EXPECTED_SHA}"
echo "Provider: ${PROVIDER_RESOURCE} (${PROVIDER_STATE})"
echo "Isolated pool: ${POOL_RESOURCE} (${POOL_STATE})"
echo "Deployer: ${DEPLOYER_SERVICE_ACCOUNT} (${DEPLOYER_STATE})"
echo "Cloud Run service agent: ${CLOUD_RUN_SERVICE_AGENT} (${RUN_SERVICE_AGENT_STATE})"
echo "Custom role: ${CUSTOM_ROLE_NAME} (${ROLE_STATE})"
echo "Project IAM: ${PROJECT_STATE}"
echo "Artifact repository IAM: ${REPOSITORY_STATE}"
echo "Federation IAM: ${FEDERATION_STATE}"
printf 'Runtime IAM: %s\n' "${RUNTIME_STATES[@]}"
printf 'API: %s\n' "${API_STATES[@]}"

if [[ "${MODE}" == "--review" ]]; then
  echo "REVIEW COMPLETE — NO CLOUD OR GITHUB CHANGES"
  exit 0
fi

[[ "${SAMRA_GCP_ZERO_TRAFFIC_FEDERATION_APPLY}" == "${AUTHORIZATION}" ]] || {
  echo "STOP: set SAMRA_GCP_ZERO_TRAFFIC_FEDERATION_APPLY=${AUTHORIZATION}" >&2
  exit 1
}

gcloud services enable "${REQUIRED_APIS[@]}" --project="${PROJECT_ID}" --quiet

if [[ "${POOL_STATE}" == missing ]]; then
  gcloud iam workload-identity-pools create "${POOL_ID}" \
    --project="${PROJECT_ID}" --location="${LOCATION}" \
    --display-name="${POOL_DISPLAY_NAME}" --quiet
fi
[[ "$(pool_state)" == ready ]] || { echo "STOP: zero-traffic workload identity pool is not ready" >&2; exit 1; }
assert_pool_isolated

RUN_SERVICE_AGENT_STATE="$(member_has_role_state "$(gcloud projects get-iam-policy "${PROJECT_ID}" --format=json)" "serviceAccount:${CLOUD_RUN_SERVICE_AGENT}" "${CLOUD_RUN_SERVICE_AGENT_ROLE}")"
[[ "${RUN_SERVICE_AGENT_STATE}" == ready ]] || {
  echo "STOP: provider-managed Cloud Run service-agent network authority is missing" >&2
  exit 1
}

if [[ "${ROLE_STATE}" == missing ]]; then
  gcloud iam roles create "${CUSTOM_ROLE_ID}" --project="${PROJECT_ID}" \
    --title="Samra staging zero-traffic deployer" \
    --description="Exact read and private zero-traffic Cloud Run revision permissions" \
    --stage=GA --permissions="${CUSTOM_ROLE_PERMISSIONS}" --quiet
fi
if [[ "${DEPLOYER_STATE}" == missing ]]; then
  gcloud iam service-accounts create "${DEPLOYER_ID}" --project="${PROJECT_ID}" \
    --display-name="Samra keyless staging zero-traffic deployer" --quiet
fi
if [[ "${PROVIDER_STATE}" == missing ]]; then
  gcloud iam workload-identity-pools providers create-oidc "${PROVIDER_ID}" \
    --project="${PROJECT_ID}" --location="${LOCATION}" \
    --workload-identity-pool="${POOL_ID}" \
    --display-name="Samra Pay main zero-traffic deployment" \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="${ATTRIBUTE_MAPPING}" \
    --attribute-condition="${ATTRIBUTE_CONDITION}" --quiet
fi
if [[ "${PROJECT_STATE}" == missing ]]; then
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:${DEPLOYER_SERVICE_ACCOUNT}" --role="${CUSTOM_ROLE_NAME}" --quiet
fi
if [[ "${REPOSITORY_STATE}" == missing ]]; then
  gcloud artifacts repositories add-iam-policy-binding "${ARTIFACT_REPOSITORY}" \
    --project="${PROJECT_ID}" --location="${REGION}" \
    --member="serviceAccount:${DEPLOYER_SERVICE_ACCOUNT}" --role="${ARTIFACT_ROLE}" --quiet
fi
for index in "${!RUNTIME_SERVICE_ACCOUNTS[@]}"; do
  if [[ "${RUNTIME_STATES[${index}]}" == *:missing ]]; then
    gcloud iam service-accounts add-iam-policy-binding "${RUNTIME_SERVICE_ACCOUNTS[${index}]}" \
      --project="${PROJECT_ID}" --member="serviceAccount:${DEPLOYER_SERVICE_ACCOUNT}" \
      --role="${RUNTIME_ROLE}" --quiet
  fi
done
if [[ "${FEDERATION_STATE}" == missing ]]; then
  gcloud iam service-accounts add-iam-policy-binding "${DEPLOYER_SERVICE_ACCOUNT}" \
    --project="${PROJECT_ID}" --member="${FEDERATED_MEMBER}" --role="${FEDERATION_ROLE}" --quiet
fi

SAMRA_GCP_OPERATOR_ACCOUNT="${OPERATOR}" \
SAMRA_GCP_EXPECTED_SHA="${EXPECTED_SHA}" \
  bash "${ROOT_DIR}/deploy/gcp/audit-staging-zero-traffic-federation.sh"
echo "STAGING ZERO-TRAFFIC FEDERATION APPLIED AND VERIFIED"
echo "Provider: ${PROVIDER_RESOURCE}"
echo "Deployer: ${DEPLOYER_SERVICE_ACCOUNT}"
echo "Stored Google credential created: no"
echo "Service deployed: no"
echo "Traffic changed: no"
