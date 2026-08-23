#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
: "${SAMRA_GCP_PROJECT_ID:=samra-pay-staging}"
: "${SAMRA_GCP_PROJECT_NUMBER:=934122615631}"
: "${SAMRA_GCP_ORGANIZATION_ID:=614833350075}"
: "${SAMRA_GCP_REGION:=us-east4}"
: "${SAMRA_GCP_OPERATOR_ACCOUNT:=}"
: "${SAMRA_GCP_EXPECTED_SHA:=$(git -C "${ROOT_DIR}" rev-parse HEAD)}"

PROJECT_ID="${SAMRA_GCP_PROJECT_ID}"
PROJECT_NUMBER="${SAMRA_GCP_PROJECT_NUMBER}"
ORGANIZATION_ID="${SAMRA_GCP_ORGANIZATION_ID}"
REGION="${SAMRA_GCP_REGION}"
OPERATOR="${SAMRA_GCP_OPERATOR_ACCOUNT}"
EXPECTED_SHA="${SAMRA_GCP_EXPECTED_SHA}"
POOL_ID="samra-zero-traffic-staging"
POOL_DISPLAY_NAME="Samra staging zero-traffic deployment"
PROVIDER_ID="samra-pay-zero-traffic-main"
PROVIDER_RESOURCE="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/providers/${PROVIDER_ID}"
POOL_RESOURCE="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}"
DEPLOYER="samra-github-deployer-staging@${PROJECT_ID}.iam.gserviceaccount.com"
CUSTOM_ROLE="projects/${PROJECT_ID}/roles/samraStagingZeroTrafficDeployer"
FEDERATED_MEMBER="principalSet://iam.googleapis.com/${POOL_RESOURCE}/attribute.repository_id/1335175962"
ATTRIBUTE_CONDITION="assertion.repository=='haileleuld87/Samra-Pay' && assertion.repository_id=='1335175962' && assertion.repository_owner_id=='237485986' && assertion.ref=='refs/heads/main' && assertion.event_name=='workflow_dispatch' && assertion.workflow=='Staging zero-traffic deployment' && assertion.workflow_ref=='haileleuld87/Samra-Pay/.github/workflows/staging-zero-traffic-deployment.yml@refs/heads/main' && assertion.environment=='staging-zero-traffic-deployment'"
CUSTOM_ROLE_PERMISSIONS="artifactregistry.dockerimages.get,artifactregistry.repositories.get,artifactregistry.repositories.getIamPolicy,compute.networks.get,compute.subnetworks.get,iam.roles.get,iam.serviceAccountKeys.list,iam.serviceAccounts.get,iam.serviceAccounts.getIamPolicy,iam.workloadIdentityPoolProviders.get,iam.workloadIdentityPools.get,resourcemanager.projects.get,resourcemanager.projects.getIamPolicy,run.operations.get,run.revisions.get,run.revisions.list,run.services.create,run.services.get,run.services.getIamPolicy,run.services.update,secretmanager.secrets.get,secretmanager.versions.get,serviceusage.services.list,serviceusage.services.use"
RUNTIMES=(
  "samra-api-staging@${PROJECT_ID}.iam.gserviceaccount.com"
  "samra-customer-web-staging@${PROJECT_ID}.iam.gserviceaccount.com"
  "samra-design-system-staging@${PROJECT_ID}.iam.gserviceaccount.com"
)
CLOUD_RUN_SERVICE_AGENT="service-${PROJECT_NUMBER}@serverless-robot-prod.iam.gserviceaccount.com"

export SAMRA_GCP_PROJECT_ID
export SAMRA_GCP_PROJECT_NUMBER
export SAMRA_GCP_ORGANIZATION_ID
export SAMRA_GCP_REGION
export SAMRA_GCP_OPERATOR_ACCOUNT
node "${ROOT_DIR}/deploy/gcp/validate-staging-zero-traffic-deployment.mjs" >/dev/null

command -v gcloud >/dev/null 2>&1 || { echo "gcloud is required" >&2; exit 1; }
[[ "$(gcloud config get-value account 2>/dev/null)" == "${OPERATOR}" ]] || { echo "STOP: wrong Google account" >&2; exit 1; }
[[ "$(gcloud config get-value project 2>/dev/null)" == "${PROJECT_ID}" ]] || { echo "STOP: wrong Google Cloud project" >&2; exit 1; }
[[ "$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')" == "${PROJECT_NUMBER}" ]] || { echo "STOP: wrong project number" >&2; exit 1; }
[[ "$(gcloud projects describe "${PROJECT_ID}" --format='value(parent.id)')" == "${ORGANIZATION_ID}" ]] || { echo "STOP: wrong organization" >&2; exit 1; }
[[ "$(git -C "${ROOT_DIR}" rev-parse HEAD)" == "${EXPECTED_SHA}" ]] || { echo "STOP: source commit does not match audited SHA" >&2; exit 1; }
[[ -z "$(git -C "${ROOT_DIR}" status --porcelain)" ]] || { echo "STOP: source working tree is not clean" >&2; exit 1; }

for api in compute.googleapis.com iamcredentials.googleapis.com run.googleapis.com secretmanager.googleapis.com sts.googleapis.com; do
  [[ "$(gcloud services list --enabled --project="${PROJECT_ID}" --filter="config.name=${api}" --format='value(config.name)')" == "${api}" ]] || {
    echo "STOP: ${api} is not enabled" >&2
    exit 1
  }
done

gcloud iam roles describe samraStagingZeroTrafficDeployer --project="${PROJECT_ID}" --format=json | node -e '
  const role = JSON.parse(require("fs").readFileSync(0, "utf8"));
  const actual = [...(role.includedPermissions || [])].sort();
  const expected = process.argv[1].split(",").sort();
  if (role.deleted === true || role.stage !== "GA" || JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error("zero-traffic custom role is not exact");
' "${CUSTOM_ROLE_PERMISSIONS}"

gcloud iam service-accounts describe "${DEPLOYER}" --project="${PROJECT_ID}" >/dev/null
[[ -z "$(gcloud iam service-accounts keys list --iam-account="${DEPLOYER}" --project="${PROJECT_ID}" --managed-by=user --format='value(name)')" ]] || {
  echo "STOP: deployer has a user-managed key" >&2
  exit 1
}

gcloud iam workload-identity-pools describe "${POOL_ID}" --project="${PROJECT_ID}" --location=global --format=json | node -e '
  const pool = JSON.parse(require("fs").readFileSync(0, "utf8"));
  if (pool.state !== "ACTIVE" || pool.displayName !== process.argv[1]) throw new Error("zero-traffic workload identity pool is not exact");
' "${POOL_DISPLAY_NAME}"

mapfile -t PROVIDERS < <(gcloud iam workload-identity-pools providers list \
  --project="${PROJECT_ID}" --location=global --workload-identity-pool="${POOL_ID}" \
  --format='value(name)' | sort)
[[ "${#PROVIDERS[@]}" -eq 1 ]] || {
  echo "STOP: zero-traffic workload identity pool is not isolated" >&2
  exit 1
}
[[ "${PROVIDERS[0]##*/}" == "${PROVIDER_ID}" ]] || {
  echo "STOP: zero-traffic workload identity pool is not isolated" >&2
  exit 1
}

gcloud iam workload-identity-pools providers describe "${PROVIDER_ID}" --project="${PROJECT_ID}" --location=global --workload-identity-pool="${POOL_ID}" --format=json | node -e '
  const provider = JSON.parse(require("fs").readFileSync(0, "utf8"));
  const mapping = provider.attributeMapping || {};
  const expected = {"google.subject":"assertion.sub","attribute.repository":"assertion.repository","attribute.repository_id":"assertion.repository_id","attribute.repository_owner_id":"assertion.repository_owner_id","attribute.ref":"assertion.ref","attribute.event_name":"assertion.event_name","attribute.workflow":"assertion.workflow","attribute.workflow_ref":"assertion.workflow_ref","attribute.environment":"assertion.environment"};
  const canonical = (value) => JSON.stringify(Object.fromEntries(Object.entries(value).sort()));
  if (provider.state !== "ACTIVE" || provider.oidc?.issuerUri !== "https://token.actions.githubusercontent.com" || canonical(mapping) !== canonical(expected) || provider.attributeCondition !== process.argv[1]) throw new Error("zero-traffic provider is not exact");
' "${ATTRIBUTE_CONDITION}"

assert_member_role() {
  local member="$1"
  local role="$2"
  node -e '
    const policy = JSON.parse(require("fs").readFileSync(0, "utf8"));
    const actual = (policy.bindings || []).filter((binding) => (binding.members || []).includes(process.argv[1])).map((binding) => ({ role: binding.role, condition: binding.condition ?? null }));
    if (JSON.stringify(actual) !== JSON.stringify([{ role: process.argv[2], condition: null }])) throw new Error(`IAM is not exact for ${process.argv[1]}`);
  ' "${member}" "${role}"
}

assert_member_has_role() {
  local member="$1"
  local role="$2"
  node -e '
    const policy = JSON.parse(require("fs").readFileSync(0, "utf8"));
    const ready = (policy.bindings || []).some((binding) => binding.role === process.argv[2] && !binding.condition && (binding.members || []).includes(process.argv[1]));
    if (!ready) throw new Error(`required IAM role is missing for ${process.argv[1]}`);
  ' "${member}" "${role}"
}

gcloud projects get-iam-policy "${PROJECT_ID}" --format=json | assert_member_role "serviceAccount:${DEPLOYER}" "${CUSTOM_ROLE}"
gcloud projects get-iam-policy "${PROJECT_ID}" --format=json | assert_member_has_role "serviceAccount:${CLOUD_RUN_SERVICE_AGENT}" "roles/run.serviceAgent"
gcloud artifacts repositories get-iam-policy samra-staging --project="${PROJECT_ID}" --location="${REGION}" --format=json | node -e '
  const policy = JSON.parse(require("fs").readFileSync(0, "utf8"));
  const publicMembers = new Set(["allUsers", "allAuthenticatedUsers"]);
  if ((policy.bindings || []).some((binding) => (binding.members || []).some((member) => publicMembers.has(member)))) throw new Error("Artifact Registry repository is public");
  const actual = (policy.bindings || []).filter((binding) => (binding.members || []).includes(process.argv[1])).map((binding) => ({ role: binding.role, condition: binding.condition ?? null }));
  if (JSON.stringify(actual) !== JSON.stringify([{ role: "roles/artifactregistry.reader", condition: null }])) throw new Error("deployer Artifact Registry IAM is not exact");
' "serviceAccount:${DEPLOYER}"

for runtime in "${RUNTIMES[@]}"; do
  [[ -z "$(gcloud iam service-accounts keys list --iam-account="${runtime}" --project="${PROJECT_ID}" --managed-by=user --format='value(name)')" ]] || { echo "STOP: ${runtime} has a user-managed key" >&2; exit 1; }
  gcloud iam service-accounts get-iam-policy "${runtime}" --project="${PROJECT_ID}" --format=json | assert_member_role "serviceAccount:${DEPLOYER}" "roles/iam.serviceAccountUser"
done
gcloud iam service-accounts get-iam-policy "${DEPLOYER}" --project="${PROJECT_ID}" --format=json | assert_member_role "${FEDERATED_MEMBER}" "roles/iam.workloadIdentityUser"

echo "READ-ONLY STAGING ZERO-TRAFFIC FEDERATION POST-AUDIT PASS"
echo "Source: ${EXPECTED_SHA}"
echo "Provider: ${PROVIDER_RESOURCE}"
echo "Pool isolation: one reviewed provider"
echo "Deployer: ${DEPLOYER}"
echo "Cloud Run service agent: provider-managed role present"
echo "Trust: exact repository, workflow, protected environment, and main ref"
echo "User-managed keys: none"
echo "Deployment executed: no"
echo "Traffic changed: no"
