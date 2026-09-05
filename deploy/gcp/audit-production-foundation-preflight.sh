#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
: "${SAMRA_GCP_PROJECT_ID:=samra-pay-production}"
: "${SAMRA_GCP_PROJECT_NUMBER:=382465561715}"
: "${SAMRA_GCP_STAGING_PROJECT_ID:=samra-pay-staging}"
: "${SAMRA_GCP_ORGANIZATION_ID:=614833350075}"
: "${SAMRA_GCP_REGION:=us-east4}"
: "${SAMRA_GCP_OPERATOR_ACCOUNT:=}"
: "${SAMRA_GCP_EXPECTED_SHA:=$(git -C "${ROOT_DIR}" rev-parse HEAD)}"

PROJECT_ID="${SAMRA_GCP_PROJECT_ID}"
PROJECT_NUMBER="${SAMRA_GCP_PROJECT_NUMBER}"
STAGING_PROJECT_ID="${SAMRA_GCP_STAGING_PROJECT_ID}"
ORGANIZATION_ID="${SAMRA_GCP_ORGANIZATION_ID}"
OPERATOR="${SAMRA_GCP_OPERATOR_ACCOUNT}"
EXPECTED_SHA="${SAMRA_GCP_EXPECTED_SHA}"
POOL_ID="samra-production-review"
PROVIDER_ID="samra-foundation-preflight"
PROVIDER_DISPLAY_NAME="Samra production preflight"
LOCATION="global"
AUDITOR_SERVICE_ACCOUNT="samra-production-auditor@${PROJECT_ID}.iam.gserviceaccount.com"
PRODUCTION_ROLE_NAME="projects/${PROJECT_ID}/roles/samraProductionBoundaryAuditor"
STAGING_ROLE_NAME="projects/${STAGING_PROJECT_ID}/roles/samraProductionBillingSourceReader"
POOL_RESOURCE="projects/${PROJECT_NUMBER}/locations/${LOCATION}/workloadIdentityPools/${POOL_ID}"
PROVIDER_RESOURCE="${POOL_RESOURCE}/providers/${PROVIDER_ID}"
FEDERATED_MEMBER="principalSet://iam.googleapis.com/${POOL_RESOURCE}/attribute.repository_id/1335175962"
ATTRIBUTE_CONDITION="assertion.repository=='samra-pay/Samra-Pay' && assertion.repository_id=='1335175962' && assertion.repository_owner_id=='320532147' && assertion.ref=='refs/heads/main' && assertion.event_name=='workflow_dispatch' && assertion.workflow=='Production foundation preflight' && assertion.workflow_ref=='samra-pay/Samra-Pay/.github/workflows/production-foundation-preflight.yml@refs/heads/main' && assertion.environment=='production-foundation-review'"
PRODUCTION_ROLE_PERMISSIONS="billing.resourcebudgets.read,iam.serviceAccountKeys.list,iam.serviceAccounts.get,resourcemanager.projects.get,serviceusage.services.use"
STAGING_ROLE_PERMISSIONS="resourcemanager.projects.get"
REQUIRED_APIS=(
  billingbudgets.googleapis.com
  cloudbilling.googleapis.com
  cloudresourcemanager.googleapis.com
  iam.googleapis.com
  iamcredentials.googleapis.com
  serviceusage.googleapis.com
  sts.googleapis.com
)

export SAMRA_GCP_PROJECT_ID
export SAMRA_GCP_PROJECT_NUMBER
export SAMRA_GCP_STAGING_PROJECT_ID
export SAMRA_GCP_ORGANIZATION_ID
export SAMRA_GCP_REGION
export SAMRA_GCP_OPERATOR_ACCOUNT
export SAMRA_GCP_EXPECTED_SHA

node --input-type=module -e '
  const module = await import(process.argv[1]);
  module.validateProductionPreflightActivationEnvironment(process.env);
' "file://${ROOT_DIR}/deploy/gcp/validate-production-foundation-preflight.mjs"

command -v gcloud >/dev/null 2>&1 || { echo "gcloud is required" >&2; exit 1; }
[[ "$(gcloud config get-value account 2>/dev/null)" == "${OPERATOR}" ]] || { echo "STOP: wrong Google account" >&2; exit 1; }
[[ "$(gcloud config get-value project 2>/dev/null)" == "${PROJECT_ID}" ]] || { echo "STOP: wrong Google Cloud project" >&2; exit 1; }
[[ "$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')" == "${PROJECT_NUMBER}" ]] || { echo "STOP: production project number drifted" >&2; exit 1; }
[[ "$(gcloud projects describe "${PROJECT_ID}" --format='value(parent.id)')" == "${ORGANIZATION_ID}" ]] || { echo "STOP: production organization drifted" >&2; exit 1; }
[[ "$(gcloud projects describe "${STAGING_PROJECT_ID}" --format='value(projectNumber)')" == "934122615631" ]] || { echo "STOP: staging billing-source project drifted" >&2; exit 1; }
[[ "$(git -C "${ROOT_DIR}" rev-parse HEAD)" == "${EXPECTED_SHA}" ]] || { echo "STOP: source commit does not match the audited SHA" >&2; exit 1; }
[[ -z "$(git -C "${ROOT_DIR}" status --porcelain)" ]] || { echo "STOP: source working tree is not clean" >&2; exit 1; }

for api in "${REQUIRED_APIS[@]}"; do
  [[ "$(gcloud services list --enabled --project="${PROJECT_ID}" --filter="config.name=${api}" --format='value(config.name)')" == "${api}" ]] || {
    echo "STOP: ${api} is not enabled" >&2
    exit 1
  }
done

verify_role() {
  local project_id="$1"
  local role_id="$2"
  local permissions="$3"
  gcloud iam roles describe "${role_id}" --project="${project_id}" --format=json | node -e '
    const fs = require("fs");
    const role = JSON.parse(fs.readFileSync(0, "utf8"));
    const actual = [...(role.includedPermissions || [])].sort();
    const expected = process.argv[1].split(",").sort();
    if (role.deleted === true || role.stage !== "GA" || JSON.stringify(actual) !== JSON.stringify(expected)) {
      process.stderr.write("STOP: preflight custom role drifted\n");
      process.exit(1);
    }
  ' "${permissions}"
}
verify_role "${PROJECT_ID}" samraProductionBoundaryAuditor "${PRODUCTION_ROLE_PERMISSIONS}"
verify_role "${STAGING_PROJECT_ID}" samraProductionBillingSourceReader "${STAGING_ROLE_PERMISSIONS}"

gcloud iam service-accounts describe "${AUDITOR_SERVICE_ACCOUNT}" --project="${PROJECT_ID}" >/dev/null
[[ -z "$(gcloud iam service-accounts keys list --iam-account="${AUDITOR_SERVICE_ACCOUNT}" --project="${PROJECT_ID}" --managed-by=user --format='value(name)')" ]] || {
  echo "STOP: production auditor has a user-managed key" >&2
  exit 1
}

gcloud iam workload-identity-pools describe "${POOL_ID}" --project="${PROJECT_ID}" --location="${LOCATION}" --format=json | node -e '
  const fs = require("fs");
  const pool = JSON.parse(fs.readFileSync(0, "utf8"));
  if (pool.state !== "ACTIVE") {
    process.stderr.write("STOP: production review identity pool is not active\n");
    process.exit(1);
  }
'

gcloud iam workload-identity-pools providers describe "${PROVIDER_ID}" \
  --project="${PROJECT_ID}" --location="${LOCATION}" \
  --workload-identity-pool="${POOL_ID}" --format=json | node -e '
    const fs = require("fs");
    const provider = JSON.parse(fs.readFileSync(0, "utf8"));
    if (
      provider.state !== "ACTIVE" ||
      provider.displayName !== process.argv[2] ||
      provider.oidc?.issuerUri !== "https://token.actions.githubusercontent.com" ||
      provider.attributeCondition !== process.argv[1]
    ) {
      process.stderr.write("STOP: production review identity provider drifted\n");
      process.exit(1);
    }
    const requiredKeys = [
      "google.subject",
      "attribute.repository",
      "attribute.repository_id",
      "attribute.repository_owner_id",
      "attribute.ref",
      "attribute.event_name",
      "attribute.workflow",
      "attribute.workflow_ref",
      "attribute.environment",
    ];
    if (JSON.stringify(Object.keys(provider.attributeMapping || {}).sort()) !== JSON.stringify(requiredKeys.sort())) {
      process.stderr.write("STOP: production review identity mapping drifted\n");
      process.exit(1);
    }
  ' "${ATTRIBUTE_CONDITION}" "${PROVIDER_DISPLAY_NAME}"

verify_project_binding() {
  local project_id="$1"
  local expected_role="$2"
  gcloud projects get-iam-policy "${project_id}" --format=json | node -e '
    const fs = require("fs");
    const policy = JSON.parse(fs.readFileSync(0, "utf8"));
    const member = `serviceAccount:${process.argv[1]}`;
    const actual = (policy.bindings || [])
      .filter((binding) => (binding.members || []).includes(member))
      .map((binding) => ({ role: binding.role, condition: binding.condition ?? null }));
    const expected = [{ role: process.argv[2], condition: null }];
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      process.stderr.write("STOP: production auditor project IAM is not exact\n");
      process.exit(1);
    }
  ' "${AUDITOR_SERVICE_ACCOUNT}" "${expected_role}"
}
verify_project_binding "${PROJECT_ID}" "${PRODUCTION_ROLE_NAME}"
verify_project_binding "${STAGING_PROJECT_ID}" "${STAGING_ROLE_NAME}"

gcloud iam service-accounts get-iam-policy "${AUDITOR_SERVICE_ACCOUNT}" --project="${PROJECT_ID}" --format=json | node -e '
  const fs = require("fs");
  const policy = JSON.parse(fs.readFileSync(0, "utf8"));
  const actual = (policy.bindings || [])
    .flatMap((binding) => (binding.members || []).map((member) => ({ role: binding.role, member, condition: binding.condition ?? null })));
  const expected = [{ role: "roles/iam.workloadIdentityUser", member: process.argv[1], condition: null }];
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    process.stderr.write("STOP: production auditor federation IAM is not exact\n");
    process.exit(1);
  }
' "${FEDERATED_MEMBER}"

echo "READ-ONLY PRODUCTION FOUNDATION PREFLIGHT TRUST POST-AUDIT PASS"
echo "Source: ${EXPECTED_SHA}"
echo "Provider: ${PROVIDER_RESOURCE}"
echo "Auditor: ${AUDITOR_SERVICE_ACCOUNT}"
echo "Repository: samra-pay/Samra-Pay (1335175962)"
echo "Trust: manual main-branch review only; short-lived tokens; no user-managed key"
echo "Permissions: project metadata, exact billing-link comparison, and single-project budget read only"
