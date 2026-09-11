#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
: "${SAMRA_GCP_PROJECT_ID:=samra-pay-staging}"
: "${SAMRA_GCP_PROJECT_NUMBER:=934122615631}"
: "${SAMRA_GCP_ORGANIZATION_ID:=993968777863}"
: "${SAMRA_GCP_REGION:=us-east4}"
: "${SAMRA_GCP_OPERATOR_ACCOUNT:=}"
: "${SAMRA_GCP_EXPECTED_SHA:=$(git -C "${ROOT_DIR}" rev-parse HEAD)}"

PROJECT_ID="${SAMRA_GCP_PROJECT_ID}"
PROJECT_NUMBER="${SAMRA_GCP_PROJECT_NUMBER}"
ORGANIZATION_ID="${SAMRA_GCP_ORGANIZATION_ID}"
REGION="${SAMRA_GCP_REGION}"
OPERATOR="${SAMRA_GCP_OPERATOR_ACCOUNT}"
EXPECTED_SHA="${SAMRA_GCP_EXPECTED_SHA}"
POOL_ID="samra-github-staging"
PROVIDER_ID="samra-pay-main"
LOCATION="global"
PUBLISHER_SERVICE_ACCOUNT="samra-github-staging@${PROJECT_ID}.iam.gserviceaccount.com"
BUILD_SERVICE_ACCOUNT="samra-cloud-build-staging@${PROJECT_ID}.iam.gserviceaccount.com"
SOURCE_BUCKET="${PROJECT_ID}_cloudbuild"
CUSTOM_ROLE_NAME="projects/${PROJECT_ID}/roles/samraStagingImagePublisher"
POOL_RESOURCE="projects/${PROJECT_NUMBER}/locations/${LOCATION}/workloadIdentityPools/${POOL_ID}"
PROVIDER_RESOURCE="${POOL_RESOURCE}/providers/${PROVIDER_ID}"
FEDERATED_MEMBER="principalSet://iam.googleapis.com/${POOL_RESOURCE}/attribute.repository_id/1335175962"
ATTRIBUTE_CONDITION="assertion.repository=='samra-pay/Samra-Pay' && assertion.repository_id=='1335175962' && assertion.repository_owner_id=='320532147' && assertion.ref=='refs/heads/main' && assertion.event_name=='workflow_dispatch' && assertion.workflow=='Staging image publication' && assertion.workflow_ref=='samra-pay/Samra-Pay/.github/workflows/staging-image-publication.yml@refs/heads/main' && assertion.environment=='staging-image-publication'"
CUSTOM_ROLE_PERMISSIONS="artifactregistry.dockerimages.get,artifactregistry.files.download,artifactregistry.repositories.downloadArtifacts,artifactregistry.repositories.get,artifactregistry.repositories.getIamPolicy,cloudbuild.builds.create,cloudbuild.builds.get,iam.roles.get,iam.serviceAccountKeys.list,iam.serviceAccounts.get,iam.serviceAccounts.getIamPolicy,iam.workloadIdentityPoolProviders.get,iam.workloadIdentityPools.get,resourcemanager.projects.get,resourcemanager.projects.getIamPolicy,serviceusage.services.list,serviceusage.services.use,storage.buckets.get,storage.buckets.getIamPolicy"

export SAMRA_GCP_PROJECT_ID
export SAMRA_GCP_PROJECT_NUMBER
export SAMRA_GCP_ORGANIZATION_ID
export SAMRA_GCP_REGION
export SAMRA_GCP_OPERATOR_ACCOUNT
node "${ROOT_DIR}/deploy/gcp/validate-staging-github-federation.mjs" >/dev/null

command -v gcloud >/dev/null 2>&1 || { echo "gcloud is required" >&2; exit 1; }
[[ "$(gcloud config get-value account 2>/dev/null)" == "${OPERATOR}" ]] || { echo "STOP: wrong Google account" >&2; exit 1; }
[[ "$(gcloud config get-value project 2>/dev/null)" == "${PROJECT_ID}" ]] || { echo "STOP: wrong Google Cloud project" >&2; exit 1; }
[[ "$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')" == "${PROJECT_NUMBER}" ]] || { echo "STOP: wrong Google Cloud project number" >&2; exit 1; }
[[ "$(gcloud projects describe "${PROJECT_ID}" --format='value(parent.id)')" == "${ORGANIZATION_ID}" ]] || { echo "STOP: wrong organization" >&2; exit 1; }
[[ "$(git -C "${ROOT_DIR}" rev-parse HEAD)" == "${EXPECTED_SHA}" ]] || { echo "STOP: source commit does not match the audited SHA" >&2; exit 1; }
[[ -z "$(git -C "${ROOT_DIR}" status --porcelain)" ]] || { echo "STOP: source working tree is not clean" >&2; exit 1; }

for api in iamcredentials.googleapis.com sts.googleapis.com; do
  [[ "$(gcloud services list --enabled --project="${PROJECT_ID}" --filter="config.name=${api}" --format='value(config.name)')" == "${api}" ]] || {
    echo "STOP: ${api} is not enabled" >&2
    exit 1
  }
done

gcloud iam roles describe samraStagingImagePublisher --project="${PROJECT_ID}" --format=json | node -e '
  const fs = require("fs");
  const role = JSON.parse(fs.readFileSync(0, "utf8"));
  const actual = [...(role.includedPermissions || [])].sort();
  const expected = process.argv[1].split(",").sort();
  if (role.deleted === true || role.stage !== "GA" || JSON.stringify(actual) !== JSON.stringify(expected)) {
    process.stderr.write("STOP: publisher custom role drifted\n");
    process.exit(1);
  }
' "${CUSTOM_ROLE_PERMISSIONS}"

gcloud iam service-accounts describe "${PUBLISHER_SERVICE_ACCOUNT}" --project="${PROJECT_ID}" >/dev/null
[[ -z "$(gcloud iam service-accounts keys list --iam-account="${PUBLISHER_SERVICE_ACCOUNT}" --project="${PROJECT_ID}" --managed-by=user --format='value(name)')" ]] || {
  echo "STOP: publisher identity has a user-managed key" >&2
  exit 1
}
gcloud iam service-accounts describe "${BUILD_SERVICE_ACCOUNT}" --project="${PROJECT_ID}" >/dev/null
[[ -z "$(gcloud iam service-accounts keys list --iam-account="${BUILD_SERVICE_ACCOUNT}" --project="${PROJECT_ID}" --managed-by=user --format='value(name)')" ]] || {
  echo "STOP: build identity has a user-managed key" >&2
  exit 1
}

gcloud iam workload-identity-pools describe "${POOL_ID}" --project="${PROJECT_ID}" --location="${LOCATION}" --format=json | node -e '
  const fs = require("fs");
  const pool = JSON.parse(fs.readFileSync(0, "utf8"));
  if (pool.state !== "ACTIVE") {
    process.stderr.write("STOP: workload identity pool is not active\n");
    process.exit(1);
  }
'

gcloud iam workload-identity-pools providers describe "${PROVIDER_ID}" \
  --project="${PROJECT_ID}" --location="${LOCATION}" \
  --workload-identity-pool="${POOL_ID}" --format=json | node -e '
    const fs = require("fs");
    const provider = JSON.parse(fs.readFileSync(0, "utf8"));
    const requiredMapping = {
      "google.subject": "assertion.sub",
      "attribute.repository": "assertion.repository",
      "attribute.repository_id": "assertion.repository_id",
      "attribute.repository_owner_id": "assertion.repository_owner_id",
      "attribute.ref": "assertion.ref",
      "attribute.event_name": "assertion.event_name",
      "attribute.workflow": "assertion.workflow",
      "attribute.workflow_ref": "assertion.workflow_ref",
      "attribute.environment": "assertion.environment",
    };
    const canonical = (value) => JSON.stringify(Object.fromEntries(Object.entries(value).sort()));
    if (
      provider.state !== "ACTIVE" ||
      provider.oidc?.issuerUri !== "https://token.actions.githubusercontent.com" ||
      canonical(provider.attributeMapping || {}) !== canonical(requiredMapping) ||
      provider.attributeCondition !== process.argv[1]
    ) {
      process.stderr.write("STOP: workload identity provider drifted\n");
      process.exit(1);
    }
  ' "${ATTRIBUTE_CONDITION}"

gcloud projects get-iam-policy "${PROJECT_ID}" --format=json | node -e '
  const fs = require("fs");
  const policy = JSON.parse(fs.readFileSync(0, "utf8"));
  const member = `serviceAccount:${process.argv[1]}`;
  const actual = (policy.bindings || [])
    .filter((binding) => (binding.members || []).includes(member))
    .map((binding) => ({ role: binding.role, condition: binding.condition ?? null }));
  const expected = [{ role: process.argv[2], condition: null }];
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    process.stderr.write("STOP: publisher project IAM is not exact\n");
    process.exit(1);
  }
' "${PUBLISHER_SERVICE_ACCOUNT}" "${CUSTOM_ROLE_NAME}"

gcloud storage buckets get-iam-policy "gs://${SOURCE_BUCKET}" --format=json | node -e '
  const fs = require("fs");
  const policy = JSON.parse(fs.readFileSync(0, "utf8"));
  const member = `serviceAccount:${process.argv[1]}`;
  const publicMembers = new Set(["allUsers", "allAuthenticatedUsers"]);
  if ((policy.bindings || []).some((binding) => (binding.members || []).some((value) => publicMembers.has(value)))) {
    process.stderr.write("STOP: source bucket is public\n");
    process.exit(1);
  }
  const actual = (policy.bindings || [])
    .filter((binding) => (binding.members || []).includes(member))
    .map((binding) => ({ role: binding.role, condition: binding.condition ?? null }));
  const expected = [{ role: "roles/storage.objectCreator", condition: null }];
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    process.stderr.write("STOP: publisher source-bucket IAM is not exact\n");
    process.exit(1);
  }
' "${PUBLISHER_SERVICE_ACCOUNT}"

gcloud iam service-accounts get-iam-policy "${BUILD_SERVICE_ACCOUNT}" --project="${PROJECT_ID}" --format=json | node -e '
  const fs = require("fs");
  const policy = JSON.parse(fs.readFileSync(0, "utf8"));
  const actual = (policy.bindings || [])
    .filter((binding) => binding.role === "roles/iam.serviceAccountUser")
    .flatMap((binding) => binding.members || [])
    .sort();
  const expected = [`user:${process.argv[1]}`, `serviceAccount:${process.argv[2]}`].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    process.stderr.write("STOP: build identity impersonation IAM is not exact\n");
    process.exit(1);
  }
' "${OPERATOR}" "${PUBLISHER_SERVICE_ACCOUNT}"

gcloud iam service-accounts get-iam-policy "${PUBLISHER_SERVICE_ACCOUNT}" --project="${PROJECT_ID}" --format=json | node -e '
  const fs = require("fs");
  const policy = JSON.parse(fs.readFileSync(0, "utf8"));
  const actual = (policy.bindings || [])
    .flatMap((binding) => (binding.members || []).map((member) => ({ role: binding.role, member, condition: binding.condition ?? null })));
  const expected = [{ role: "roles/iam.workloadIdentityUser", member: process.argv[1], condition: null }];
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    process.stderr.write("STOP: publisher federation IAM is not exact\n");
    process.exit(1);
  }
' "${FEDERATED_MEMBER}"

echo "READ-ONLY STAGING GITHUB FEDERATION POST-AUDIT PASS"
echo "Source: ${EXPECTED_SHA}"
echo "Provider: ${PROVIDER_RESOURCE}"
echo "Publisher: ${PUBLISHER_SERVICE_ACCOUNT}"
echo "Repository: samra-pay/Samra-Pay (1335175962)"
echo "Trust: manual main-branch workflow only; short-lived tokens; no user-managed key"
