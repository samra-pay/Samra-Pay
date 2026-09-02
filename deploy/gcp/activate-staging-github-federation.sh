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
: "${SAMRA_GCP_GITHUB_FEDERATION_APPLY:=}"

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
CUSTOM_ROLE_ID="samraStagingImagePublisher"
CUSTOM_ROLE_NAME="projects/${PROJECT_ID}/roles/${CUSTOM_ROLE_ID}"
SOURCE_BUCKET_ROLE="roles/storage.objectCreator"
BUILD_SERVICE_ACCOUNT_ROLE="roles/iam.serviceAccountUser"
FEDERATION_ROLE="roles/iam.workloadIdentityUser"
AUTHORIZATION="AUTHORIZED_STAGING_GITHUB_FEDERATION"
REPOSITORY="haileleuld87/Samra-Pay"
REPOSITORY_ID="1335175962"
REPOSITORY_OWNER_ID="237485986"
POOL_RESOURCE="projects/${PROJECT_NUMBER}/locations/${LOCATION}/workloadIdentityPools/${POOL_ID}"
PROVIDER_RESOURCE="${POOL_RESOURCE}/providers/${PROVIDER_ID}"
FEDERATED_MEMBER="principalSet://iam.googleapis.com/${POOL_RESOURCE}/attribute.repository_id/${REPOSITORY_ID}"
ATTRIBUTE_MAPPING="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.repository_id=assertion.repository_id,attribute.repository_owner_id=assertion.repository_owner_id,attribute.ref=assertion.ref,attribute.event_name=assertion.event_name,attribute.workflow=assertion.workflow,attribute.workflow_ref=assertion.workflow_ref,attribute.environment=assertion.environment"
ATTRIBUTE_CONDITION="assertion.repository=='${REPOSITORY}' && assertion.repository_id=='${REPOSITORY_ID}' && assertion.repository_owner_id=='${REPOSITORY_OWNER_ID}' && assertion.ref=='refs/heads/main' && assertion.event_name=='workflow_dispatch' && assertion.workflow=='Staging image publication' && assertion.workflow_ref=='haileleuld87/Samra-Pay/.github/workflows/staging-image-publication.yml@refs/heads/main' && assertion.environment=='staging-image-publication'"
CUSTOM_ROLE_PERMISSIONS="artifactregistry.dockerimages.get,artifactregistry.files.download,artifactregistry.repositories.downloadArtifacts,artifactregistry.repositories.get,artifactregistry.repositories.getIamPolicy,cloudbuild.builds.create,cloudbuild.builds.get,iam.roles.get,iam.serviceAccountKeys.list,iam.serviceAccounts.get,iam.serviceAccounts.getIamPolicy,iam.workloadIdentityPoolProviders.get,iam.workloadIdentityPools.get,resourcemanager.projects.get,resourcemanager.projects.getIamPolicy,serviceusage.services.list,serviceusage.services.use,storage.buckets.get,storage.buckets.getIamPolicy"
REQUIRED_APIS=(iamcredentials.googleapis.com sts.googleapis.com)
SERVICE_ACCOUNT_CREATE_MAX_ATTEMPTS=3
SERVICE_ACCOUNT_QUOTA_BACKOFF_SECONDS=65

export SAMRA_GCP_PROJECT_ID
export SAMRA_GCP_PROJECT_NUMBER
export SAMRA_GCP_ORGANIZATION_ID
export SAMRA_GCP_REGION
export SAMRA_GCP_OPERATOR_ACCOUNT

VALIDATED="$(node "${ROOT_DIR}/deploy/gcp/validate-staging-github-federation.mjs" 2>&1)" || {
  echo "${VALIDATED}" >&2
  exit 1
}

if [[ "${MODE}" == "--plan" ]]; then
  printf '%s\n' "${VALIDATED}"
  cat <<PLAN
Plan only. No Google Cloud or GitHub state was read or changed.

The staging GitHub federation review will:
  1. bind one private repository by stable repository and owner IDs;
  2. admit only the exact workflow file on refs/heads/main using the protected staging environment;
  3. create one dedicated keyless publisher identity and no credential file;
  4. create one exact custom read-and-submit role for the existing Cloud Build controller;
  5. grant source upload only on gs://${SOURCE_BUCKET};
  6. grant service-account use only on the existing staging build identity; and
  7. grant Workload Identity User only to repository ID ${REPOSITORY_ID}.

Apply can enable only IAM Credentials and Security Token Service, create the
reviewed pool, provider, publisher identity, custom role, and exact IAM bindings.
It cannot submit a build, publish an image, deploy a service, execute a migration,
read a secret value, route traffic, create a service-account key, modify Replit,
touch production, or change any real-provider integration.

Provider resource: ${PROVIDER_RESOURCE}
Publisher identity: ${PUBLISHER_SERVICE_ACCOUNT}
Required apply authorization: ${AUTHORIZATION}
PLAN
  exit 0
fi

command -v gcloud >/dev/null 2>&1 || {
  echo "gcloud is required; run review or apply from authenticated Google Cloud Shell." >&2
  exit 1
}

[[ "$(gcloud config get-value account 2>/dev/null)" == "${OPERATOR}" ]] || { echo "STOP: wrong Google account" >&2; exit 1; }
[[ "$(gcloud config get-value project 2>/dev/null)" == "${PROJECT_ID}" ]] || { echo "STOP: wrong Google Cloud project" >&2; exit 1; }
[[ "$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')" == "${PROJECT_NUMBER}" ]] || { echo "STOP: wrong Google Cloud project number" >&2; exit 1; }
[[ "$(gcloud projects describe "${PROJECT_ID}" --format='value(parent.type)')" == "organization" ]] || { echo "STOP: project parent is not an organization" >&2; exit 1; }
[[ "$(gcloud projects describe "${PROJECT_ID}" --format='value(parent.id)')" == "${ORGANIZATION_ID}" ]] || { echo "STOP: wrong organization" >&2; exit 1; }
[[ "$(gcloud billing projects describe "${PROJECT_ID}" --format='value(billingEnabled)')" == "True" ]] || { echo "STOP: billing is not enabled" >&2; exit 1; }
[[ "$(git -C "${ROOT_DIR}" rev-parse HEAD)" == "${EXPECTED_SHA}" ]] || { echo "STOP: source commit does not match the reviewed SHA" >&2; exit 1; }
[[ -z "$(git -C "${ROOT_DIR}" status --porcelain)" ]] || { echo "STOP: source working tree is not clean" >&2; exit 1; }

for label in environment=staging data_classification=synthetic application=samra-pay firebase=enabled; do
  key="${label%%=*}"
  expected="${label#*=}"
  actual="$(gcloud projects describe "${PROJECT_ID}" --format="value(labels.${key})")"
  [[ "${actual}" == "${expected}" ]] || { echo "STOP: project label ${key} drifted" >&2; exit 1; }
done

api_state() {
  local api="$1"
  local enabled
  enabled="$(gcloud services list --enabled --project="${PROJECT_ID}" --filter="config.name=${api}" --format='value(config.name)')"
  if [[ "${enabled}" == "${api}" ]]; then printf 'ready'; else printf 'missing'; fi
}

custom_role_state() {
  if ! gcloud iam roles describe "${CUSTOM_ROLE_ID}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
    printf 'missing'
    return
  fi
  gcloud iam roles describe "${CUSTOM_ROLE_ID}" --project="${PROJECT_ID}" --format=json | node -e '
    const fs = require("fs");
    const role = JSON.parse(fs.readFileSync(0, "utf8"));
    const actual = [...(role.includedPermissions || [])].sort();
    const expected = process.argv[1].split(",").sort();
    if (role.deleted === true || role.stage !== "GA" || JSON.stringify(actual) !== JSON.stringify(expected)) {
      process.stderr.write("STOP: publisher custom role drifted\n");
      process.exit(1);
    }
    process.stdout.write("ready");
  ' "${CUSTOM_ROLE_PERMISSIONS}"
}

publisher_state() {
  if ! gcloud iam service-accounts describe "${PUBLISHER_SERVICE_ACCOUNT}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
    printf 'missing'
    return
  fi
  local keys
  keys="$(gcloud iam service-accounts keys list --iam-account="${PUBLISHER_SERVICE_ACCOUNT}" --project="${PROJECT_ID}" --managed-by=user --format='value(name)')"
  [[ -z "${keys}" ]] || { echo "STOP: publisher identity has a user-managed key" >&2; exit 1; }
  printf 'ready'
}

pool_state() {
  if ! gcloud iam workload-identity-pools describe "${POOL_ID}" --project="${PROJECT_ID}" --location="${LOCATION}" >/dev/null 2>&1; then
    printf 'missing'
    return
  fi
  [[ "$(gcloud iam workload-identity-pools describe "${POOL_ID}" --project="${PROJECT_ID}" --location="${LOCATION}" --format='value(state)')" == "ACTIVE" ]] || {
    echo "STOP: workload identity pool is not active" >&2
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
        process.stderr.write("STOP: workload identity provider drifted\n");
        process.exit(1);
      }
      process.stdout.write("ready");
    ' "${ATTRIBUTE_MAPPING}" "${ATTRIBUTE_CONDITION}"
}

project_binding_state() {
  if [[ "$(publisher_state)" == "missing" ]]; then printf 'missing'; return; fi
  gcloud projects get-iam-policy "${PROJECT_ID}" --format=json | node -e '
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
        process.stderr.write("STOP: publisher project IAM drifted\n");
        process.exit(1);
      }
      process.stdout.write("ready");
    }
  ' "${PUBLISHER_SERVICE_ACCOUNT}" "${CUSTOM_ROLE_NAME}"
}

bucket_binding_state() {
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
    if (actual.length === 0) {
      process.stdout.write("missing");
    } else {
      const expected = [{ role: process.argv[2], condition: null }];
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        process.stderr.write("STOP: publisher source-bucket IAM drifted\n");
        process.exit(1);
      }
      process.stdout.write("ready");
    }
  ' "${PUBLISHER_SERVICE_ACCOUNT}" "${SOURCE_BUCKET_ROLE}"
}

gcloud iam service-accounts describe "${BUILD_SERVICE_ACCOUNT}" --project="${PROJECT_ID}" >/dev/null
[[ -z "$(gcloud iam service-accounts keys list --iam-account="${BUILD_SERVICE_ACCOUNT}" --project="${PROJECT_ID}" --managed-by=user --format='value(name)')" ]] || {
  echo "STOP: build identity has a user-managed key" >&2
  exit 1
}

build_impersonation_state() {
  gcloud iam service-accounts get-iam-policy "${BUILD_SERVICE_ACCOUNT}" --project="${PROJECT_ID}" --format=json | node -e '
    const fs = require("fs");
    const policy = JSON.parse(fs.readFileSync(0, "utf8"));
    const allowed = [`user:${process.argv[1]}`, `serviceAccount:${process.argv[2]}`].sort();
    const actual = (policy.bindings || [])
      .filter((binding) => binding.role === "roles/iam.serviceAccountUser")
      .flatMap((binding) => binding.members || [])
      .sort();
    if (JSON.stringify(actual) === JSON.stringify([`user:${process.argv[1]}`])) {
      process.stdout.write("missing");
    } else if (JSON.stringify(actual) !== JSON.stringify(allowed)) {
      process.stderr.write("STOP: build identity impersonation IAM drifted\n");
      process.exit(1);
    } else {
      process.stdout.write("ready");
    }
  ' "${OPERATOR}" "${PUBLISHER_SERVICE_ACCOUNT}"
}

federation_binding_state() {
  if [[ "$(publisher_state)" == "missing" ]]; then printf 'missing'; return; fi
  gcloud iam service-accounts get-iam-policy "${PUBLISHER_SERVICE_ACCOUNT}" --project="${PROJECT_ID}" --format=json | node -e '
    const fs = require("fs");
    const policy = JSON.parse(fs.readFileSync(0, "utf8"));
    const actual = (policy.bindings || [])
      .flatMap((binding) => (binding.members || []).map((member) => ({ role: binding.role, member, condition: binding.condition ?? null })));
    if (actual.length === 0) {
      process.stdout.write("missing");
    } else {
      const expected = [{ role: process.argv[2], member: process.argv[1], condition: null }];
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        process.stderr.write("STOP: publisher federation IAM drifted\n");
        process.exit(1);
      }
      process.stdout.write("ready");
    }
  ' "${FEDERATED_MEMBER}" "${FEDERATION_ROLE}"
}

API_STATES=()
for api in "${REQUIRED_APIS[@]}"; do API_STATES+=("${api}:$(api_state "${api}")"); done
ROLE_STATE="$(custom_role_state)"
PUBLISHER_STATE="$(publisher_state)"
POOL_STATE="$(pool_state)"
if [[ "${POOL_STATE}" == "ready" ]]; then PROVIDER_STATE="$(provider_state)"; else PROVIDER_STATE="missing"; fi
PROJECT_BINDING_STATE="$(project_binding_state)"
BUCKET_BINDING_STATE="$(bucket_binding_state)"
BUILD_IMPERSONATION_STATE="$(build_impersonation_state)"
FEDERATION_BINDING_STATE="$(federation_binding_state)"

echo "READ-ONLY STAGING GITHUB FEDERATION REVIEW PASS"
echo "Source: ${EXPECTED_SHA}"
echo "Repository: ${REPOSITORY} (${REPOSITORY_ID})"
echo "Provider: ${PROVIDER_RESOURCE} (${PROVIDER_STATE})"
echo "Publisher: ${PUBLISHER_SERVICE_ACCOUNT} (${PUBLISHER_STATE})"
echo "Custom role: ${CUSTOM_ROLE_NAME} (${ROLE_STATE})"
echo "Project IAM: ${PROJECT_BINDING_STATE}"
echo "Source-bucket IAM: ${BUCKET_BINDING_STATE}"
echo "Build impersonation IAM: ${BUILD_IMPERSONATION_STATE}"
echo "Federation IAM: ${FEDERATION_BINDING_STATE}"
printf 'API: %s\n' "${API_STATES[@]}"

if [[ "${MODE}" == "--review" ]]; then
  echo "REVIEW COMPLETE — NO CLOUD OR GITHUB CHANGES"
  exit 0
fi

[[ "${SAMRA_GCP_GITHUB_FEDERATION_APPLY}" == "${AUTHORIZATION}" ]] || {
  echo "STOP: set SAMRA_GCP_GITHUB_FEDERATION_APPLY=${AUTHORIZATION}" >&2
  exit 1
}

gcloud services enable "${REQUIRED_APIS[@]}" --project="${PROJECT_ID}" --quiet

if [[ "${ROLE_STATE}" == "missing" ]]; then
  gcloud iam roles create "${CUSTOM_ROLE_ID}" --project="${PROJECT_ID}" \
    --title="Samra staging image publisher" \
    --description="Exact read and Cloud Build submission permissions for the keyless staging publisher" \
    --stage=GA --permissions="${CUSTOM_ROLE_PERMISSIONS}" --quiet
fi

if [[ "${PUBLISHER_STATE}" == "missing" ]]; then
  attempt=1
  while ((attempt <= SERVICE_ACCOUNT_CREATE_MAX_ATTEMPTS)); do
    if output="$(gcloud iam service-accounts create "samra-github-staging" \
      --project="${PROJECT_ID}" \
      --display-name="Samra keyless GitHub staging publisher" --quiet 2>&1)"; then
      printf '%s\n' "${output}"
      break
    fi
    printf '%s\n' "${output}" >&2
    if [[ "${output}" != *"RESOURCE_EXHAUSTED"* ||
      "${output}" != *"Service accounts created per minute per project"* ||
      "${attempt}" -ge "${SERVICE_ACCOUNT_CREATE_MAX_ATTEMPTS}" ]]; then
      exit 1
    fi
    echo "Service-account creation quota reached; retrying in ${SERVICE_ACCOUNT_QUOTA_BACKOFF_SECONDS} seconds." >&2
    sleep "${SERVICE_ACCOUNT_QUOTA_BACKOFF_SECONDS}"
    attempt=$((attempt + 1))
  done
fi

if [[ "${POOL_STATE}" == "missing" ]]; then
  gcloud iam workload-identity-pools create "${POOL_ID}" --project="${PROJECT_ID}" \
    --location="${LOCATION}" --display-name="Samra GitHub staging" --quiet
fi

if [[ "${PROVIDER_STATE}" == "missing" ]]; then
  gcloud iam workload-identity-pools providers create-oidc "${PROVIDER_ID}" \
    --project="${PROJECT_ID}" --location="${LOCATION}" \
    --workload-identity-pool="${POOL_ID}" \
    --display-name="Samra Pay main publication" \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="${ATTRIBUTE_MAPPING}" \
    --attribute-condition="${ATTRIBUTE_CONDITION}" --quiet
fi

if [[ "${PROJECT_BINDING_STATE}" == "missing" ]]; then
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:${PUBLISHER_SERVICE_ACCOUNT}" \
    --role="${CUSTOM_ROLE_NAME}" --condition=None --quiet >/dev/null
fi
if [[ "${BUCKET_BINDING_STATE}" == "missing" ]]; then
  gcloud storage buckets add-iam-policy-binding "gs://${SOURCE_BUCKET}" \
    --member="serviceAccount:${PUBLISHER_SERVICE_ACCOUNT}" \
    --role="${SOURCE_BUCKET_ROLE}" --condition=None --quiet >/dev/null
fi
if [[ "${BUILD_IMPERSONATION_STATE}" == "missing" ]]; then
  gcloud iam service-accounts add-iam-policy-binding "${BUILD_SERVICE_ACCOUNT}" \
    --project="${PROJECT_ID}" --member="serviceAccount:${PUBLISHER_SERVICE_ACCOUNT}" \
    --role="${BUILD_SERVICE_ACCOUNT_ROLE}" --condition=None --quiet >/dev/null
fi
if [[ "${FEDERATION_BINDING_STATE}" == "missing" ]]; then
  gcloud iam service-accounts add-iam-policy-binding "${PUBLISHER_SERVICE_ACCOUNT}" \
    --project="${PROJECT_ID}" --member="${FEDERATED_MEMBER}" \
    --role="${FEDERATION_ROLE}" --condition=None --quiet >/dev/null
fi

[[ "$(custom_role_state)" == "ready" ]] || { echo "STOP: publisher custom role was not verified" >&2; exit 1; }
[[ "$(publisher_state)" == "ready" ]] || { echo "STOP: publisher identity was not verified" >&2; exit 1; }
[[ "$(pool_state)" == "ready" ]] || { echo "STOP: workload identity pool was not verified" >&2; exit 1; }
[[ "$(provider_state)" == "ready" ]] || { echo "STOP: workload identity provider was not verified" >&2; exit 1; }
[[ "$(project_binding_state)" == "ready" ]] || { echo "STOP: publisher project IAM was not verified" >&2; exit 1; }
[[ "$(bucket_binding_state)" == "ready" ]] || { echo "STOP: publisher source-bucket IAM was not verified" >&2; exit 1; }
[[ "$(build_impersonation_state)" == "ready" ]] || { echo "STOP: build impersonation IAM was not verified" >&2; exit 1; }
[[ "$(federation_binding_state)" == "ready" ]] || { echo "STOP: federation IAM was not verified" >&2; exit 1; }
for api in "${REQUIRED_APIS[@]}"; do [[ "$(api_state "${api}")" == "ready" ]] || { echo "STOP: ${api} was not verified" >&2; exit 1; }; done

echo "STAGING GITHUB FEDERATION APPLIED AND VERIFIED"
echo "Provider: ${PROVIDER_RESOURCE}"
echo "Publisher: ${PUBLISHER_SERVICE_ACCOUNT}"
echo "No service-account key, build, image, deployment, traffic, migration, secret access, Replit change, or production resource was created."
