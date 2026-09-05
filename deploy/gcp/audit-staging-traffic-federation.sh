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
OPERATOR="${SAMRA_GCP_OPERATOR_ACCOUNT}"
EXPECTED_SHA="${SAMRA_GCP_EXPECTED_SHA}"
POOL_ID="samra-traffic-staging"
POOL_DISPLAY_NAME="Samra staging traffic control"
PROMOTION_PROVIDER_ID="samra-pay-promotion-main"
ROLLBACK_PROVIDER_ID="samra-pay-rollback-main"
PROMOTER="samra-github-promoter-staging@${PROJECT_ID}.iam.gserviceaccount.com"
ROLLBACK_OPERATOR="samra-github-rollback-staging@${PROJECT_ID}.iam.gserviceaccount.com"
CUSTOM_ROLE="projects/${PROJECT_ID}/roles/samraStagingTrafficController"
POOL_RESOURCE="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}"
PROMOTION_MEMBER="principalSet://iam.googleapis.com/${POOL_RESOURCE}/attribute.environment/staging-traffic-promotion"
ROLLBACK_MEMBER="principalSet://iam.googleapis.com/${POOL_RESOURCE}/attribute.environment/staging-traffic-rollback"
ATTRIBUTE_MAPPING='{"google.subject":"assertion.sub","attribute.repository":"assertion.repository","attribute.repository_id":"assertion.repository_id","attribute.repository_owner_id":"assertion.repository_owner_id","attribute.ref":"assertion.ref","attribute.event_name":"assertion.event_name","attribute.workflow":"assertion.workflow","attribute.workflow_ref":"assertion.workflow_ref","attribute.environment":"assertion.environment"}'
COMMON_CONDITION="assertion.repository=='samra-pay/Samra-Pay' && assertion.repository_id=='1335175962' && assertion.repository_owner_id=='320532147' && assertion.ref=='refs/heads/main' && assertion.event_name=='workflow_dispatch' && assertion.workflow=='Staging traffic control' && assertion.workflow_ref=='samra-pay/Samra-Pay/.github/workflows/staging-traffic-control.yml@refs/heads/main'"
PROMOTION_CONDITION="${COMMON_CONDITION} && assertion.environment=='staging-traffic-promotion'"
ROLLBACK_CONDITION="${COMMON_CONDITION} && assertion.environment=='staging-traffic-rollback'"
CUSTOM_ROLE_PERMISSIONS="iam.roles.get,iam.serviceAccountKeys.list,iam.serviceAccounts.get,iam.serviceAccounts.getIamPolicy,iam.workloadIdentityPoolProviders.get,iam.workloadIdentityPools.get,resourcemanager.projects.get,resourcemanager.projects.getIamPolicy,run.operations.get,run.revisions.get,run.revisions.list,run.services.get,run.services.getIamPolicy,run.services.update,serviceusage.services.list,serviceusage.services.use"

node "${ROOT_DIR}/deploy/gcp/validate-staging-traffic-control.mjs" >/dev/null
command -v gcloud >/dev/null 2>&1 || { echo "gcloud is required" >&2; exit 1; }
[[ "$(gcloud config get-value account 2>/dev/null)" == "${OPERATOR}" ]] || { echo "STOP: wrong Google account" >&2; exit 1; }
[[ "$(gcloud config get-value project 2>/dev/null)" == "${PROJECT_ID}" ]] || { echo "STOP: wrong project" >&2; exit 1; }
[[ "$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')" == "${PROJECT_NUMBER}" ]] || { echo "STOP: wrong project number" >&2; exit 1; }
[[ "$(gcloud projects describe "${PROJECT_ID}" --format='value(parent.id)')" == "${ORGANIZATION_ID}" ]] || { echo "STOP: wrong organization" >&2; exit 1; }
[[ "$(git -C "${ROOT_DIR}" rev-parse HEAD)" == "${EXPECTED_SHA}" ]] || { echo "STOP: source SHA drifted" >&2; exit 1; }
[[ -z "$(git -C "${ROOT_DIR}" status --porcelain --untracked-files=no)" ]] || { echo "STOP: source working tree is not clean" >&2; exit 1; }

for api in iamcredentials.googleapis.com run.googleapis.com sts.googleapis.com; do
  [[ "$(gcloud services list --enabled --project="${PROJECT_ID}" --filter="config.name=${api}" --format='value(config.name)')" == "${api}" ]] || { echo "STOP: ${api} is not enabled" >&2; exit 1; }
done

gcloud iam roles describe samraStagingTrafficController --project="${PROJECT_ID}" --format=json | node -e '
  const role = JSON.parse(require("fs").readFileSync(0, "utf8"));
  const actual = [...(role.includedPermissions || [])].sort();
  const expected = process.argv[1].split(",").sort();
  if (role.deleted === true || role.stage !== "GA" || JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error("traffic custom role is not exact");
' "${CUSTOM_ROLE_PERMISSIONS}"

gcloud iam workload-identity-pools describe "${POOL_ID}" --project="${PROJECT_ID}" --location=global --format=json | node -e '
  const pool = JSON.parse(require("fs").readFileSync(0, "utf8"));
  if (pool.state !== "ACTIVE" || pool.displayName !== process.argv[1]) throw new Error("traffic pool is not exact");
' "${POOL_DISPLAY_NAME}"
mapfile -t PROVIDERS < <(gcloud iam workload-identity-pools providers list --project="${PROJECT_ID}" --location=global --workload-identity-pool="${POOL_ID}" --format='value(name)' | sed 's#.*/##' | sort)
[[ "${#PROVIDERS[@]}" -eq 2 && "${PROVIDERS[0]}" == "${PROMOTION_PROVIDER_ID}" && "${PROVIDERS[1]}" == "${ROLLBACK_PROVIDER_ID}" ]] || { echo "STOP: traffic pool is not isolated to two reviewed providers" >&2; exit 1; }

assert_provider() {
  local provider_id="$1"
  local condition="$2"
  gcloud iam workload-identity-pools providers describe "${provider_id}" --project="${PROJECT_ID}" --location=global --workload-identity-pool="${POOL_ID}" --format=json | node -e '
    const provider = JSON.parse(require("fs").readFileSync(0, "utf8"));
    const canonical = (value) => JSON.stringify(Object.fromEntries(Object.entries(value).sort()));
    if (provider.state !== "ACTIVE" || provider.oidc?.issuerUri !== "https://token.actions.githubusercontent.com" || canonical(provider.attributeMapping || {}) !== canonical(JSON.parse(process.argv[1])) || provider.attributeCondition !== process.argv[2]) throw new Error("traffic provider is not exact");
  ' "${ATTRIBUTE_MAPPING}" "${condition}"
}
assert_provider "${PROMOTION_PROVIDER_ID}" "${PROMOTION_CONDITION}"
assert_provider "${ROLLBACK_PROVIDER_ID}" "${ROLLBACK_CONDITION}"

assert_member_exact_role() {
  local member="$1"
  local role="$2"
  node -e '
    const policy = JSON.parse(require("fs").readFileSync(0, "utf8"));
    const actual = (policy.bindings || []).filter((binding) => (binding.members || []).includes(process.argv[1])).map((binding) => ({ role: binding.role, condition: binding.condition ?? null })).sort((a, b) => a.role.localeCompare(b.role));
    if (JSON.stringify(actual) !== JSON.stringify([{ role: process.argv[2], condition: null }])) throw new Error(`IAM is not exact for ${process.argv[1]}`);
  ' "${member}" "${role}"
}

for account in "${PROMOTER}" "${ROLLBACK_OPERATOR}"; do
  gcloud iam service-accounts describe "${account}" --project="${PROJECT_ID}" >/dev/null
  [[ -z "$(gcloud iam service-accounts keys list --iam-account="${account}" --project="${PROJECT_ID}" --managed-by=user --format='value(name)')" ]] || { echo "STOP: ${account} has a user-managed key" >&2; exit 1; }
  gcloud projects get-iam-policy "${PROJECT_ID}" --format=json | assert_member_exact_role "serviceAccount:${account}" "${CUSTOM_ROLE}"
done
gcloud iam service-accounts get-iam-policy "${PROMOTER}" --project="${PROJECT_ID}" --format=json | assert_member_exact_role "${PROMOTION_MEMBER}" "roles/iam.workloadIdentityUser"
gcloud iam service-accounts get-iam-policy "${ROLLBACK_OPERATOR}" --project="${PROJECT_ID}" --format=json | assert_member_exact_role "${ROLLBACK_MEMBER}" "roles/iam.workloadIdentityUser"

assert_member_absent() {
  local member="$1"
  node -e '
    const policy = JSON.parse(require("fs").readFileSync(0, "utf8"));
    if ((policy.bindings || []).some((binding) => (binding.members || []).includes(process.argv[1]))) throw new Error(`prohibited non-traffic IAM found for ${process.argv[1]}`);
  ' "${member}"
}

assert_resource_policies_absent() {
  local member="$1"
  local repository secret account job

  mapfile -t REPOSITORIES < <(gcloud artifacts repositories list --project="${PROJECT_ID}" --location="${SAMRA_GCP_REGION}" --format='value(name)' | sed 's#.*/##' | sort)
  for repository in "${REPOSITORIES[@]}"; do
    gcloud artifacts repositories get-iam-policy "${repository}" --project="${PROJECT_ID}" --location="${SAMRA_GCP_REGION}" --format=json | assert_member_absent "${member}"
  done

  gcloud storage buckets get-iam-policy "gs://${PROJECT_ID}_cloudbuild" --format=json | assert_member_absent "${member}"

  mapfile -t SECRETS < <(gcloud secrets list --project="${PROJECT_ID}" --format='value(name)' | sort)
  for secret in "${SECRETS[@]}"; do
    gcloud secrets get-iam-policy "${secret}" --project="${PROJECT_ID}" --format=json | assert_member_absent "${member}"
  done

  mapfile -t SERVICE_ACCOUNTS < <(gcloud iam service-accounts list --project="${PROJECT_ID}" --format='value(email)' | sort)
  for account in "${SERVICE_ACCOUNTS[@]}"; do
    gcloud iam service-accounts get-iam-policy "${account}" --project="${PROJECT_ID}" --format=json | assert_member_absent "${member}"
  done

  mapfile -t JOBS < <(gcloud run jobs list --project="${PROJECT_ID}" --region="${SAMRA_GCP_REGION}" --format='value(metadata.name)' | sort)
  for job in "${JOBS[@]}"; do
    gcloud run jobs get-iam-policy "${job}" --project="${PROJECT_ID}" --region="${SAMRA_GCP_REGION}" --format=json | assert_member_absent "${member}"
  done
}

for account in "${PROMOTER}" "${ROLLBACK_OPERATOR}"; do
  assert_resource_policies_absent "serviceAccount:${account}"
done

echo "READ-ONLY STAGING TRAFFIC FEDERATION POST-AUDIT PASS"
echo "Source: ${EXPECTED_SHA}"
echo "Pool isolation: exactly two operation-specific providers"
echo "Promotion identity: exact traffic-only IAM and no user-managed key"
echo "Rollback identity: exact traffic-only IAM and no user-managed key"
echo "Build, image, source-bucket, secret, migration, and vendor authority: absent"
echo "Traffic changed: no"
