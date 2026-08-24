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
POOL_ID="samra-revision-probe-staging"
POOL_DISPLAY_NAME="Samra staging revision probe"
PROVIDER_ID="samra-pay-revision-probe-main"
LOCATION="global"
CONTROLLER="samra-github-probe-staging@${PROJECT_ID}.iam.gserviceaccount.com"
RUNTIME="samra-revision-probe-staging@${PROJECT_ID}.iam.gserviceaccount.com"
CLOUD_RUN_SERVICE_AGENT="service-${PROJECT_NUMBER}@serverless-robot-prod.iam.gserviceaccount.com"
CUSTOM_ROLE_ID="samraStagingRevisionProbe"
CUSTOM_ROLE="projects/${PROJECT_ID}/roles/${CUSTOM_ROLE_ID}"
CUSTOM_ROLE_PERMISSIONS="compute.networks.get,compute.subnetworks.get,iam.serviceAccountKeys.list,iam.serviceAccounts.get,logging.views.get,resourcemanager.projects.get,resourcemanager.projects.getIamPolicy,run.executions.get,run.executions.list,run.jobs.create,run.jobs.delete,run.jobs.get,run.jobs.run,run.operations.get,run.revisions.get,run.services.get,run.services.getIamPolicy,run.services.update,serviceusage.services.list,serviceusage.services.use"
ARTIFACT_REPOSITORY="samra-staging"
SERVICE="samra-api"
JOB="samra-staging-revision-probe"
LOG_BUCKET="_Default"
LOG_LOCATION="global"
LOG_VIEW="samra-staging-revision-probe"
REPOSITORY_ID="1335175962"
POOL_RESOURCE="projects/${PROJECT_NUMBER}/locations/${LOCATION}/workloadIdentityPools/${POOL_ID}"
PROVIDER_RESOURCE="${POOL_RESOURCE}/providers/${PROVIDER_ID}"
FEDERATED_MEMBER="principalSet://iam.googleapis.com/${POOL_RESOURCE}/attribute.repository_id/${REPOSITORY_ID}"
ATTRIBUTE_CONDITION="assertion.repository=='haileleuld87/Samra-Pay' && assertion.repository_id=='1335175962' && assertion.repository_owner_id=='237485986' && assertion.ref=='refs/heads/main' && assertion.event_name=='workflow_dispatch' && assertion.workflow=='Staging verification probe' && assertion.workflow_ref=='haileleuld87/Samra-Pay/.github/workflows/staging-verification-probe.yml@refs/heads/main' && assertion.environment=='staging-verification'"

export SAMRA_GCP_PROJECT_ID SAMRA_GCP_PROJECT_NUMBER SAMRA_GCP_ORGANIZATION_ID
export SAMRA_GCP_REGION SAMRA_GCP_OPERATOR_ACCOUNT
node "${ROOT_DIR}/deploy/gcp/validate-staging-revision-probe.mjs" >/dev/null

command -v gcloud >/dev/null 2>&1 || { echo "gcloud is required" >&2; exit 1; }
[[ "${OPERATOR}" =~ ^[^@[:space:]]+@davidhaile\.com$ ]] || { echo "STOP: audit requires a davidhaile.com administrator" >&2; exit 1; }
[[ "$(gcloud config get-value account 2>/dev/null)" == "${OPERATOR}" ]] || { echo "STOP: wrong Google account" >&2; exit 1; }
[[ "$(gcloud config get-value project 2>/dev/null)" == "${PROJECT_ID}" ]] || { echo "STOP: wrong Google Cloud project" >&2; exit 1; }
[[ "$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')" == "${PROJECT_NUMBER}" ]] || { echo "STOP: wrong project number" >&2; exit 1; }
[[ "$(gcloud projects describe "${PROJECT_ID}" --format='value(parent.id)')" == "${ORGANIZATION_ID}" ]] || { echo "STOP: wrong organization" >&2; exit 1; }
[[ "$(git -C "${ROOT_DIR}" rev-parse HEAD)" == "${EXPECTED_SHA}" ]] || { echo "STOP: source commit does not match the reviewed SHA" >&2; exit 1; }
[[ -z "$(git -C "${ROOT_DIR}" status --porcelain)" ]] || { echo "STOP: source working tree is not clean" >&2; exit 1; }

for api in artifactregistry.googleapis.com compute.googleapis.com iam.googleapis.com iamcredentials.googleapis.com logging.googleapis.com run.googleapis.com serviceusage.googleapis.com sts.googleapis.com; do
  [[ "$(gcloud services list --enabled --project="${PROJECT_ID}" --filter="config.name=${api}" --format='value(config.name)')" == "${api}" ]] || { echo "STOP: required API ${api} is missing" >&2; exit 1; }
done

gcloud iam roles describe "${CUSTOM_ROLE_ID}" --project="${PROJECT_ID}" --format=json | node -e '
  const role = JSON.parse(require("fs").readFileSync(0, "utf8"));
  const actual = [...(role.includedPermissions || [])].sort();
  const expected = process.argv[1].split(",").sort();
  if (role.deleted === true || role.stage !== "GA" || JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error("revision-probe custom role is not exact");
' "${CUSTOM_ROLE_PERMISSIONS}"

for account in "${CONTROLLER}" "${RUNTIME}"; do
  gcloud iam service-accounts describe "${account}" --project="${PROJECT_ID}" >/dev/null
  [[ -z "$(gcloud iam service-accounts keys list --iam-account="${account}" --project="${PROJECT_ID}" --managed-by=user --format='value(name)')" ]] || { echo "STOP: ${account} has a user-managed key" >&2; exit 1; }
done

gcloud iam workload-identity-pools describe "${POOL_ID}" --project="${PROJECT_ID}" --location="${LOCATION}" --format=json | node -e '
  const pool = JSON.parse(require("fs").readFileSync(0, "utf8"));
  if (pool.state !== "ACTIVE" || pool.displayName !== process.argv[1]) throw new Error("revision-probe pool drifted");
' "${POOL_DISPLAY_NAME}"
mapfile -t PROVIDERS < <(gcloud iam workload-identity-pools providers list --project="${PROJECT_ID}" --location="${LOCATION}" --workload-identity-pool="${POOL_ID}" --format='value(name)' | sort)
[[ "${#PROVIDERS[@]}" -eq 1 && "${PROVIDERS[0]##*/}" == "${PROVIDER_ID}" ]] || { echo "STOP: revision-probe pool is not isolated" >&2; exit 1; }
gcloud iam workload-identity-pools providers describe "${PROVIDER_ID}" --project="${PROJECT_ID}" --location="${LOCATION}" --workload-identity-pool="${POOL_ID}" --format=json | node -e '
  const provider = JSON.parse(require("fs").readFileSync(0, "utf8"));
  const expected = {"google.subject":"assertion.sub","attribute.repository":"assertion.repository","attribute.repository_id":"assertion.repository_id","attribute.repository_owner_id":"assertion.repository_owner_id","attribute.ref":"assertion.ref","attribute.event_name":"assertion.event_name","attribute.workflow":"assertion.workflow","attribute.workflow_ref":"assertion.workflow_ref","attribute.environment":"assertion.environment"};
  const canonical = (value) => JSON.stringify(Object.fromEntries(Object.entries(value).sort()));
  if (provider.state !== "ACTIVE" || provider.oidc?.issuerUri !== "https://token.actions.githubusercontent.com" || canonical(provider.attributeMapping || {}) !== canonical(expected) || provider.attributeCondition !== process.argv[1]) throw new Error("revision-probe provider drifted");
' "${ATTRIBUTE_CONDITION}"

assert_exact_member_role() {
  local member="$1" role="$2"
  node -e '
    const policy = JSON.parse(require("fs").readFileSync(0, "utf8"));
    const actual = (policy.bindings || []).filter((binding) => (binding.members || []).includes(process.argv[1])).map((binding) => ({ role: binding.role, condition: binding.condition ?? null })).sort((a, b) => a.role.localeCompare(b.role));
    if (JSON.stringify(actual) !== JSON.stringify([{ role: process.argv[2], condition: null }])) throw new Error(`IAM is not exact for ${process.argv[1]}`);
  ' "${member}" "${role}"
}

assert_member_absent() {
  local member="$1"
  node -e '
    const policy = JSON.parse(require("fs").readFileSync(0, "utf8"));
    if ((policy.bindings || []).some((binding) => (binding.members || []).includes(process.argv[1]))) throw new Error(`Unexpected IAM for ${process.argv[1]}`);
  ' "${member}"
}

assert_member_has_role() {
  local member="$1" role="$2"
  node -e '
    const policy = JSON.parse(require("fs").readFileSync(0, "utf8"));
    if (!(policy.bindings || []).some((binding) => binding.role === process.argv[2] && !binding.condition && (binding.members || []).includes(process.argv[1]))) throw new Error(`Required IAM is missing for ${process.argv[1]}`);
  ' "${member}" "${role}"
}

gcloud projects get-iam-policy "${PROJECT_ID}" --format=json | assert_exact_member_role "serviceAccount:${CONTROLLER}" "${CUSTOM_ROLE}"
gcloud projects get-iam-policy "${PROJECT_ID}" --format=json | assert_member_absent "serviceAccount:${RUNTIME}"
gcloud projects get-iam-policy "${PROJECT_ID}" --format=json | assert_member_has_role "serviceAccount:${CLOUD_RUN_SERVICE_AGENT}" "roles/run.serviceAgent"
gcloud artifacts repositories get-iam-policy "${ARTIFACT_REPOSITORY}" --project="${PROJECT_ID}" --location="${REGION}" --format=json | assert_exact_member_role "serviceAccount:${CONTROLLER}" "roles/artifactregistry.reader"
gcloud artifacts repositories get-iam-policy "${ARTIFACT_REPOSITORY}" --project="${PROJECT_ID}" --location="${REGION}" --format=json | assert_member_absent "serviceAccount:${RUNTIME}"
gcloud iam service-accounts get-iam-policy "${RUNTIME}" --project="${PROJECT_ID}" --format=json | assert_exact_member_role "serviceAccount:${CONTROLLER}" "roles/iam.serviceAccountUser"
gcloud iam service-accounts get-iam-policy "${CONTROLLER}" --project="${PROJECT_ID}" --format=json | assert_exact_member_role "${FEDERATED_MEMBER}" "roles/iam.workloadIdentityUser"
gcloud run services get-iam-policy "${SERVICE}" --project="${PROJECT_ID}" --region="${REGION}" --format=json | assert_exact_member_role "serviceAccount:${RUNTIME}" "roles/run.invoker"

gcloud logging views describe "${LOG_VIEW}" --bucket="${LOG_BUCKET}" --location="${LOG_LOCATION}" --project="${PROJECT_ID}" --format=json | node -e '
  const view = JSON.parse(require("fs").readFileSync(0, "utf8"));
  if (view.filter !== `resource.type="cloud_run_job" AND resource.labels.job_name="${process.argv[1]}"`) throw new Error("revision-probe log view drifted");
' "${JOB}"
gcloud logging views get-iam-policy "${LOG_VIEW}" --bucket="${LOG_BUCKET}" --location="${LOG_LOCATION}" --project="${PROJECT_ID}" --format=json | assert_exact_member_role "serviceAccount:${CONTROLLER}" "roles/logging.viewAccessor"

for secret in $(gcloud secrets list --project="${PROJECT_ID}" --format='value(name)'); do
  gcloud secrets get-iam-policy "${secret}" --project="${PROJECT_ID}" --format=json | assert_member_absent "serviceAccount:${RUNTIME}"
done
if gcloud run jobs describe "${JOB}" --project="${PROJECT_ID}" --region="${REGION}" >/dev/null 2>&1; then echo "STOP: temporary revision-probe job exists" >&2; exit 1; fi

echo "READ-ONLY STAGING REVISION-PROBE FEDERATION POST-AUDIT PASS"
echo "Source: ${EXPECTED_SHA}"
echo "Provider: ${PROVIDER_RESOURCE}; isolated to one reviewed provider"
echo "Controller: ${CONTROLLER}; keyless and least privilege"
echo "Runtime: ${RUNTIME}; no project, repository, or secret access"
echo "Service invocation: samra-api only"
echo "Restricted log view: ${LOG_VIEW}"
echo "Temporary job: absent"
echo "Probe executed: no"
echo "Traffic changed: no"
