#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MODE="${1:---plan}"

if [[ "${MODE}" != "--plan" && "${MODE}" != "--review" && "${MODE}" != "--apply" ]]; then
  echo "Usage: $0 [--plan|--review|--apply]" >&2
  exit 2
fi

: "${SAMRA_GCP_PROJECT_ID:=samra-pay-staging}"
: "${SAMRA_GCP_ORGANIZATION_ID:=614833350075}"
: "${SAMRA_GCP_REGION:=us-east4}"
: "${SAMRA_GCP_REPOSITORY:=samra-staging}"
: "${SAMRA_GCP_OPERATOR_ACCOUNT:=}"
: "${SAMRA_GCP_EXPECTED_SHA:=$(git -C "${ROOT_DIR}" rev-parse HEAD)}"
: "${SAMRA_GCP_IMAGE_BUILD_APPLY:=}"
: "${SAMRA_RELEASE_EVIDENCE_ROOT:=}"
: "${SAMRA_RELEASE_RUN_METADATA:=}"
: "${SAMRA_RELEASE_CANDIDATE_RUN_ID:=}"
: "${SAMRA_RELEASE_CANDIDATE_RUN_ATTEMPT:=}"

PROJECT_ID="${SAMRA_GCP_PROJECT_ID}"
ORGANIZATION_ID="${SAMRA_GCP_ORGANIZATION_ID}"
REGION="${SAMRA_GCP_REGION}"
REPOSITORY="${SAMRA_GCP_REPOSITORY}"
OPERATOR="${SAMRA_GCP_OPERATOR_ACCOUNT}"
EXPECTED_SHA="${SAMRA_GCP_EXPECTED_SHA}"
HUMAN_OPERATOR="me@davidhaile.com"
PUBLISHER_SERVICE_ACCOUNT="samra-github-staging@${PROJECT_ID}.iam.gserviceaccount.com"
BUILD_SERVICE_ACCOUNT="samra-cloud-build-staging@${PROJECT_ID}.iam.gserviceaccount.com"
BUILD_SERVICE_ACCOUNT_RESOURCE="projects/${PROJECT_ID}/serviceAccounts/${BUILD_SERVICE_ACCOUNT}"
PUBLISHER_CUSTOM_ROLE_ID="samraStagingImagePublisher"
PUBLISHER_CUSTOM_ROLE_PERMISSIONS="artifactregistry.dockerimages.get,artifactregistry.files.download,artifactregistry.repositories.downloadArtifacts,artifactregistry.repositories.get,artifactregistry.repositories.getIamPolicy,cloudbuild.builds.create,cloudbuild.builds.get,iam.roles.get,iam.serviceAccountKeys.list,iam.serviceAccounts.get,iam.serviceAccounts.getIamPolicy,iam.workloadIdentityPoolProviders.get,iam.workloadIdentityPools.get,resourcemanager.projects.get,resourcemanager.projects.getIamPolicy,serviceusage.services.list,serviceusage.services.use,storage.buckets.get,storage.buckets.getIamPolicy"
WORKLOAD_IDENTITY_POOL_ID="samra-github-staging"
WORKLOAD_IDENTITY_PROVIDER_ID="samra-pay-main"
WORKLOAD_IDENTITY_LOCATION="global"
WORKLOAD_IDENTITY_ATTRIBUTE_MAPPING="attribute.environment=assertion.environment,attribute.event_name=assertion.event_name,attribute.ref=assertion.ref,attribute.repository=assertion.repository,attribute.repository_id=assertion.repository_id,attribute.repository_owner_id=assertion.repository_owner_id,attribute.workflow=assertion.workflow,attribute.workflow_ref=assertion.workflow_ref,google.subject=assertion.sub"
WORKLOAD_IDENTITY_ATTRIBUTE_CONDITION="assertion.repository=='haileleuld87/Samra-Pay' && assertion.repository_id=='1335175962' && assertion.repository_owner_id=='237485986' && assertion.ref=='refs/heads/main' && assertion.event_name=='workflow_dispatch' && assertion.workflow=='Staging image publication' && assertion.workflow_ref=='haileleuld87/Samra-Pay/.github/workflows/staging-image-publication.yml@refs/heads/main' && assertion.environment=='staging-image-publication'"
REQUIRED_VERIFICATION_API="containeranalysis.googleapis.com"
SOURCE_BUCKET="${PROJECT_ID}_cloudbuild"
SOURCE_BUCKET_ROLE="roles/storage.objectViewer"
IMAGE_BASE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}"
AUTHORIZATION="AUTHORIZED_STAGING_IMAGE_PUBLICATION"
IMAGE_NAMES=(
  samra-api
  samra-customer-web
  samra-operations-web
  samra-design-system-preview
  samra-migrations
)
PUBLICATION_EVIDENCE_DIR="${ROOT_DIR}/artifacts/staging-release"
PUBLICATION_MANIFEST="${PUBLICATION_EVIDENCE_DIR}/staging-image-publication.json"
PUBLICATION_MANIFEST_HASH="${PUBLICATION_EVIDENCE_DIR}/staging-image-publication.sha256"
IMAGE_SECURITY_EVIDENCE_DIR="${PUBLICATION_EVIDENCE_DIR}/security"
TRIVY_VERSION="0.70.0"

[[ "${PROJECT_ID}" == "samra-pay-staging" ]] || { echo "STOP: project must be samra-pay-staging" >&2; exit 1; }
[[ "${ORGANIZATION_ID}" == "614833350075" ]] || { echo "STOP: organization must be 614833350075" >&2; exit 1; }
[[ "${REGION}" == "us-east4" ]] || { echo "STOP: region must be us-east4" >&2; exit 1; }
[[ "${REPOSITORY}" == "samra-staging" ]] || { echo "STOP: repository must be samra-staging" >&2; exit 1; }

if [[ "${MODE}" == "--plan" ]]; then
  cat <<PLAN
Plan only. No Google Cloud state was read or changed.

The staging image publication review will:
  1. bind the source to one clean full Git SHA;
  2. verify one exact successful release-candidate run, evidence manifest, every
     contracted gate, and synthetic backup/restore evidence before cloud access;
  3. verify the exact staging project, organization, region, billing, and labels;
  4. verify the immutable Artifact Registry repository and dedicated keyless build identity;
  5. prove the build identity has only its reviewed project, repository, source-bucket, and impersonation grants;
  6. require Container Analysis and exact Cloud Build service-agent IAM for provenance verification;
  7. require all five full-SHA tags to be absent before publication; and
  8. submit the already-reviewed Cloud Build definition only after an explicit apply authorization; and
  9. vulnerability- and secret-scan every published registry digest before recording promotable evidence.

Apply uploads only the .gcloudignore-filtered source, creates a Cloud Build record,
stores logs and provenance, may create or reuse Google-managed source-staging
storage, publishes five immutable images, and records their digests. It cannot
deploy Cloud Run, execute a migration, route traffic, read a secret, change IAM,
expose an endpoint, enable a provider, modify Replit, or touch production.

Expected source: ${EXPECTED_SHA}
Expected registry: ${IMAGE_BASE}
Required release-candidate run ID and attempt: explicit positive integers
Required apply authorization: ${AUTHORIZATION}
PLAN
  exit 0
fi

[[ "$(git -C "${ROOT_DIR}" rev-parse HEAD)" == "${EXPECTED_SHA}" ]] || { echo "STOP: source commit does not match the reviewed SHA" >&2; exit 1; }
[[ -z "$(git -C "${ROOT_DIR}" status --porcelain)" ]] || { echo "STOP: source working tree is not clean" >&2; exit 1; }
[[ -d "${SAMRA_RELEASE_EVIDENCE_ROOT}" && -f "${SAMRA_RELEASE_RUN_METADATA}" ]] || {
  echo "STOP: exact release-candidate evidence and GitHub run metadata are required" >&2
  exit 1
}

RELEASE_CANDIDATE_SUMMARY="$(node "${ROOT_DIR}/deploy/gcp/verify-release-candidate-evidence.mjs" \
  --evidence-root "${SAMRA_RELEASE_EVIDENCE_ROOT}" \
  --candidate-sha "${EXPECTED_SHA}" \
  --release-run-id "${SAMRA_RELEASE_CANDIDATE_RUN_ID}" \
  --release-run-attempt "${SAMRA_RELEASE_CANDIDATE_RUN_ATTEMPT}" \
  --run-metadata "${SAMRA_RELEASE_RUN_METADATA}")"
RELEASE_GIT_TREE_SHA="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).gitTreeSha)' "${RELEASE_CANDIDATE_SUMMARY}")"
RELEASE_EVIDENCE_MANIFEST_SHA256="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).evidenceManifestSha256)' "${RELEASE_CANDIDATE_SUMMARY}")"
[[ "$(git -C "${ROOT_DIR}" rev-parse "${EXPECTED_SHA}^{tree}")" == "${RELEASE_GIT_TREE_SHA}" ]] || {
  echo "STOP: release evidence Git tree does not match the publication source" >&2
  exit 1
}

SAMRA_BUILD_ENVIRONMENT="staging" \
SAMRA_BUILD_EXPECTED_SERVICE_ACCOUNT="${BUILD_SERVICE_ACCOUNT}" \
SAMRA_BUILD_IMAGE_TAG="${EXPECTED_SHA}" \
SAMRA_BUILD_PROJECT_ID="${PROJECT_ID}" \
SAMRA_BUILD_REGION="${REGION}" \
SAMRA_BUILD_REPOSITORY="${REPOSITORY}" \
SAMRA_BUILD_SOURCE_SHA="${EXPECTED_SHA}" \
SAMRA_BUILD_RELEASE_CANDIDATE_RUN_ID="${SAMRA_RELEASE_CANDIDATE_RUN_ID}" \
SAMRA_BUILD_RELEASE_CANDIDATE_RUN_ATTEMPT="${SAMRA_RELEASE_CANDIDATE_RUN_ATTEMPT}" \
SAMRA_BUILD_RELEASE_EVIDENCE_MANIFEST_SHA256="${RELEASE_EVIDENCE_MANIFEST_SHA256}" \
  node "${ROOT_DIR}/deploy/gcp/validate-build-inputs.mjs" >/dev/null

command -v gcloud >/dev/null 2>&1 || {
  echo "gcloud is required; run review or apply from authenticated Google Cloud Shell." >&2
  exit 1
}

[[ "${OPERATOR}" == "${HUMAN_OPERATOR}" || "${OPERATOR}" == "${PUBLISHER_SERVICE_ACCOUNT}" ]] || {
  echo "STOP: caller must be the reviewed human operator or keyless GitHub publisher" >&2
  exit 1
}
[[ "$(gcloud config get-value account 2>/dev/null)" == "${OPERATOR}" ]] || { echo "STOP: wrong Google account" >&2; exit 1; }
[[ "$(gcloud config get-value project 2>/dev/null)" == "${PROJECT_ID}" ]] || { echo "STOP: wrong Google Cloud project" >&2; exit 1; }
[[ "$(gcloud projects describe "${PROJECT_ID}" --format='value(parent.type)')" == "organization" ]] || { echo "STOP: project parent is not an organization" >&2; exit 1; }
[[ "$(gcloud projects describe "${PROJECT_ID}" --format='value(parent.id)')" == "${ORGANIZATION_ID}" ]] || { echo "STOP: wrong organization" >&2; exit 1; }
if [[ "${OPERATOR}" == "${HUMAN_OPERATOR}" ]]; then
  [[ "$(gcloud billing projects describe "${PROJECT_ID}" --format='value(billingEnabled)')" == "True" ]] || {
    echo "STOP: billing is not enabled" >&2
    exit 1
  }
fi
PROJECT_NUMBER="$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')"
[[ "${PROJECT_NUMBER}" =~ ^[0-9]+$ ]] || { echo "STOP: project number is missing" >&2; exit 1; }
CLOUD_BUILD_SERVICE_AGENT="service-${PROJECT_NUMBER}@gcp-sa-cloudbuild.iam.gserviceaccount.com"
PUBLISHER_CUSTOM_ROLE="projects/${PROJECT_ID}/roles/${PUBLISHER_CUSTOM_ROLE_ID}"
PUBLISHER_FEDERATED_MEMBER="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/${WORKLOAD_IDENTITY_LOCATION}/workloadIdentityPools/${WORKLOAD_IDENTITY_POOL_ID}/attribute.repository_id/1335175962"
for label in environment=staging data_classification=synthetic application=samra-pay firebase=enabled; do
  key="${label%%=*}"
  expected="${label#*=}"
  actual="$(gcloud projects describe "${PROJECT_ID}" --format="value(labels.${key})")"
  [[ "${actual}" == "${expected}" ]] || { echo "STOP: project label ${key} drifted" >&2; exit 1; }
done

gcloud artifacts repositories describe "${REPOSITORY}" \
  --project="${PROJECT_ID}" --location="${REGION}" --format=json | \
  node -e '
    const fs = require("fs");
    const repository = JSON.parse(fs.readFileSync(0, "utf8"));
    if (repository.format !== "DOCKER" || repository.dockerConfig?.immutableTags !== true) {
      process.stderr.write("STOP: immutable Docker repository drifted\n");
      process.exit(1);
    }
  '

gcloud iam service-accounts describe "${BUILD_SERVICE_ACCOUNT}" \
  --project="${PROJECT_ID}" >/dev/null
USER_KEYS="$(gcloud iam service-accounts keys list \
  --iam-account="${BUILD_SERVICE_ACCOUNT}" --project="${PROJECT_ID}" \
  --managed-by=user --format='value(name)')"
[[ -z "${USER_KEYS}" ]] || { echo "STOP: build identity has a user-managed key" >&2; exit 1; }

if [[ "${OPERATOR}" == "${PUBLISHER_SERVICE_ACCOUNT}" ]]; then
  gcloud iam service-accounts describe "${PUBLISHER_SERVICE_ACCOUNT}" \
    --project="${PROJECT_ID}" >/dev/null
  PUBLISHER_USER_KEYS="$(gcloud iam service-accounts keys list \
    --iam-account="${PUBLISHER_SERVICE_ACCOUNT}" --project="${PROJECT_ID}" \
    --managed-by=user --format='value(name)')"
  [[ -z "${PUBLISHER_USER_KEYS}" ]] || { echo "STOP: publisher identity has a user-managed key" >&2; exit 1; }

  gcloud iam roles describe "${PUBLISHER_CUSTOM_ROLE_ID}" \
    --project="${PROJECT_ID}" --format=json | node -e '
      const fs = require("fs");
      const role = JSON.parse(fs.readFileSync(0, "utf8"));
      const actual = [...(role.includedPermissions || [])].sort();
      const expected = process.argv[1].split(",").sort();
      if (role.deleted === true || role.stage !== "GA" || JSON.stringify(actual) !== JSON.stringify(expected)) {
        process.stderr.write("STOP: publisher custom role drifted\n");
        process.exit(1);
      }
    ' "${PUBLISHER_CUSTOM_ROLE_PERMISSIONS}"

  gcloud iam workload-identity-pools describe "${WORKLOAD_IDENTITY_POOL_ID}" \
    --project="${PROJECT_ID}" --location="${WORKLOAD_IDENTITY_LOCATION}" \
    --format=json | node -e '
      const fs = require("fs");
      const pool = JSON.parse(fs.readFileSync(0, "utf8"));
      if (pool.state !== "ACTIVE") {
        process.stderr.write("STOP: workload identity pool is not active\n");
        process.exit(1);
      }
    '

  gcloud iam workload-identity-pools providers describe "${WORKLOAD_IDENTITY_PROVIDER_ID}" \
    --project="${PROJECT_ID}" --location="${WORKLOAD_IDENTITY_LOCATION}" \
    --workload-identity-pool="${WORKLOAD_IDENTITY_POOL_ID}" --format=json | node -e '
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
    ' "${WORKLOAD_IDENTITY_ATTRIBUTE_MAPPING}" "${WORKLOAD_IDENTITY_ATTRIBUTE_CONDITION}"

  gcloud projects get-iam-policy "${PROJECT_ID}" --format=json | \
    node -e '
      const fs = require("fs");
      const policy = JSON.parse(fs.readFileSync(0, "utf8"));
      const member = `serviceAccount:${process.argv[1]}`;
      const actual = (policy.bindings || [])
        .filter((binding) => (binding.members || []).includes(member))
        .map((binding) => ({ role: binding.role, condition: binding.condition ?? null }));
      const expected = [{ role: process.argv[2], condition: null }];
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        process.stderr.write("STOP: publisher project IAM drifted\n");
        process.exit(1);
      }
    ' "${PUBLISHER_SERVICE_ACCOUNT}" "${PUBLISHER_CUSTOM_ROLE}"

  gcloud iam service-accounts get-iam-policy "${PUBLISHER_SERVICE_ACCOUNT}" \
    --project="${PROJECT_ID}" --format=json | node -e '
      const fs = require("fs");
      const policy = JSON.parse(fs.readFileSync(0, "utf8"));
      const actual = (policy.bindings || [])
        .flatMap((binding) => (binding.members || []).map((member) => ({ role: binding.role, member, condition: binding.condition ?? null })));
      const expected = [{ role: "roles/iam.workloadIdentityUser", member: process.argv[1], condition: null }];
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        process.stderr.write("STOP: publisher federation IAM drifted\n");
        process.exit(1);
      }
    ' "${PUBLISHER_FEDERATED_MEMBER}"
fi

gcloud projects get-iam-policy "${PROJECT_ID}" --format=json | \
  node -e '
    const fs = require("fs");
    const policy = JSON.parse(fs.readFileSync(0, "utf8"));
    const expectedMember = `serviceAccount:${process.argv[1]}`;
    const actual = [];
    for (const binding of policy.bindings || []) {
      if ((binding.members || []).includes(expectedMember)) actual.push(binding.role);
    }
    const expected = ["roles/logging.logWriter", "roles/serviceusage.serviceUsageConsumer"];
    if (JSON.stringify(actual.sort()) !== JSON.stringify(expected.sort())) {
      process.stderr.write("STOP: build identity project IAM drifted\n");
      process.exit(1);
    }
  ' "${BUILD_SERVICE_ACCOUNT}"

gcloud artifacts repositories get-iam-policy "${REPOSITORY}" \
  --project="${PROJECT_ID}" --location="${REGION}" --format=json | \
  node -e '
    const fs = require("fs");
    const policy = JSON.parse(fs.readFileSync(0, "utf8"));
    const expectedMember = `serviceAccount:${process.argv[1]}`;
    const actual = [];
    for (const binding of policy.bindings || []) {
      if ((binding.members || []).includes(expectedMember)) actual.push(binding.role);
    }
    if (JSON.stringify(actual.sort()) !== JSON.stringify(["roles/artifactregistry.writer"])) {
      process.stderr.write("STOP: build identity repository IAM drifted\n");
      process.exit(1);
    }
  ' "${BUILD_SERVICE_ACCOUNT}"

gcloud iam service-accounts get-iam-policy "${BUILD_SERVICE_ACCOUNT}" \
  --project="${PROJECT_ID}" --format=json | \
  node -e '
    const fs = require("fs");
    const policy = JSON.parse(fs.readFileSync(0, "utf8"));
    const members = (policy.bindings || [])
      .filter((binding) => binding.role === "roles/iam.serviceAccountUser")
      .flatMap((binding) => binding.members || [])
      .sort();
    const expected = [
      `user:${process.argv[1]}`,
      `serviceAccount:${process.argv[2]}`,
    ].sort();
    if (JSON.stringify(members) !== JSON.stringify(expected)) {
      process.stderr.write("STOP: build identity impersonation IAM drifted\n");
      process.exit(1);
    }
  ' "${HUMAN_OPERATOR}" "${PUBLISHER_SERVICE_ACCOUNT}"

BUCKET_NAME="$(gcloud storage buckets describe "gs://${SOURCE_BUCKET}" --format='value(name)')"
[[ "${BUCKET_NAME}" == "${SOURCE_BUCKET}" || "${BUCKET_NAME}" == "projects/_/buckets/${SOURCE_BUCKET}" ]] || {
  echo "STOP: exact Cloud Build source bucket is missing" >&2
  exit 1
}

if [[ "${OPERATOR}" == "${PUBLISHER_SERVICE_ACCOUNT}" ]]; then
  gcloud storage buckets get-iam-policy "gs://${SOURCE_BUCKET}" --format=json | \
    node -e '
      const fs = require("fs");
      const policy = JSON.parse(fs.readFileSync(0, "utf8"));
      const member = `serviceAccount:${process.argv[1]}`;
      const actual = (policy.bindings || [])
        .filter((binding) => (binding.members || []).includes(member))
        .map((binding) => ({ role: binding.role, condition: binding.condition ?? null }));
      const expected = [{ role: "roles/storage.objectCreator", condition: null }];
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        process.stderr.write("STOP: publisher source-bucket IAM drifted\n");
        process.exit(1);
      }
    ' "${PUBLISHER_SERVICE_ACCOUNT}"
fi

gcloud storage buckets get-iam-policy "gs://${SOURCE_BUCKET}" --format=json | \
  node -e '
    const fs = require("fs");
    const policy = JSON.parse(fs.readFileSync(0, "utf8"));
    const expectedMember = `serviceAccount:${process.argv[1]}`;
    const expectedRole = process.argv[2];
    const publicMembers = new Set(["allUsers", "allAuthenticatedUsers"]);
    const bindings = policy.bindings || [];
    if (bindings.some((binding) => (binding.members || []).some((member) => publicMembers.has(member)))) {
      process.stderr.write("STOP: Cloud Build source bucket has public IAM\n");
      process.exit(1);
    }
    const actual = bindings
      .filter((binding) => (binding.members || []).includes(expectedMember))
      .map((binding) => ({ role: binding.role, condition: binding.condition ?? null }));
    const expected = [{ role: expectedRole, condition: null }];
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      process.stderr.write("STOP: build identity source-bucket IAM is missing, broader than reviewed, or otherwise drifted\n");
      process.exit(1);
    }
  ' "${BUILD_SERVICE_ACCOUNT}" "${SOURCE_BUCKET_ROLE}"

ENABLED_VERIFICATION_API="$(gcloud services list --enabled \
  --project="${PROJECT_ID}" \
  --filter="config.name=${REQUIRED_VERIFICATION_API}" \
  --format='value(config.name)')"
[[ "${ENABLED_VERIFICATION_API}" == "${REQUIRED_VERIFICATION_API}" ]] || {
  echo "STOP: Container Analysis API is not enabled for verified build provenance" >&2
  exit 1
}

gcloud projects get-iam-policy "${PROJECT_ID}" --format=json | \
  node -e '
    const fs = require("fs");
    const policy = JSON.parse(fs.readFileSync(0, "utf8"));
    const expectedMember = `serviceAccount:${process.argv[1]}`;
    const actual = (policy.bindings || [])
      .filter((binding) => (binding.members || []).includes(expectedMember))
      .map((binding) => ({ role: binding.role, condition: binding.condition ?? null }));
    const expected = [{ role: "roles/cloudbuild.serviceAgent", condition: null }];
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      process.stderr.write("STOP: Cloud Build service-agent IAM drifted\n");
      process.exit(1);
    }
  ' "${CLOUD_BUILD_SERVICE_AGENT}"

for name in "${IMAGE_NAMES[@]}"; do
  image="${IMAGE_BASE}/${name}:${EXPECTED_SHA}"
  if gcloud artifacts docker images describe "${image}" \
    --project="${PROJECT_ID}" >/dev/null 2>&1; then
    echo "STOP: immutable image tag already exists for ${name}" >&2
    exit 1
  fi
done

echo "READ-ONLY STAGING IMAGE PUBLICATION REVIEW PASS"
echo "Source: ${EXPECTED_SHA}"
echo "Caller: ${OPERATOR}"
echo "Images: 5 full-SHA tags are absent"
echo "Build identity: dedicated, keyless, and exact-IAM"
echo "Build source access: exact bucket-level read-only"
echo "Build verification: Container Analysis API and exact service-agent IAM"

if [[ "${MODE}" == "--review" ]]; then
  echo "REVIEW COMPLETE — NO CLOUD CHANGES"
  exit 0
fi

[[ "${SAMRA_GCP_IMAGE_BUILD_APPLY}" == "${AUTHORIZATION}" ]] || {
  echo "STOP: set SAMRA_GCP_IMAGE_BUILD_APPLY=${AUTHORIZATION}" >&2
  exit 1
}

command -v trivy >/dev/null 2>&1 || {
  echo "STOP: Trivy ${TRIVY_VERSION} is required before creating immutable staging images" >&2
  exit 1
}
ACTUAL_TRIVY_VERSION="$(trivy --version | awk '/^Version:/ { print $2; exit }')"
[[ "${ACTUAL_TRIVY_VERSION}" == "${TRIVY_VERSION}" ]] || {
  echo "STOP: Trivy version must be exactly ${TRIVY_VERSION}" >&2
  exit 1
}

BUILD_ID="$(gcloud builds submit \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --service-account="${BUILD_SERVICE_ACCOUNT_RESOURCE}" \
  --ignore-file="${ROOT_DIR}/.gcloudignore" \
  --config="${ROOT_DIR}/deploy/gcp/cloudbuild.yaml" \
  --substitutions="COMMIT_SHA=${EXPECTED_SHA},_ENVIRONMENT=staging,_REGION=${REGION},_REPOSITORY=${REPOSITORY},_IMAGE_TAG=${EXPECTED_SHA},_BUILD_SERVICE_ACCOUNT=${BUILD_SERVICE_ACCOUNT},_RELEASE_CANDIDATE_RUN_ID=${SAMRA_RELEASE_CANDIDATE_RUN_ID},_RELEASE_CANDIDATE_RUN_ATTEMPT=${SAMRA_RELEASE_CANDIDATE_RUN_ATTEMPT},_RELEASE_EVIDENCE_MANIFEST_SHA256=${RELEASE_EVIDENCE_MANIFEST_SHA256}" \
  --format='value(id)' \
  "${ROOT_DIR}")"

[[ -n "${BUILD_ID}" ]] || { echo "STOP: Cloud Build did not return a build ID" >&2; exit 1; }
[[ "$(gcloud builds describe "${BUILD_ID}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --format='value(status)')" == "SUCCESS" ]] || {
  echo "STOP: Cloud Build ${BUILD_ID} did not complete successfully" >&2
  exit 1
}

resolve_digest() {
  local name="$1"
  local image="${IMAGE_BASE}/${name}:${EXPECTED_SHA}"
  local digest
  digest="$(gcloud artifacts docker images describe "${image}" \
    --project="${PROJECT_ID}" --format=json | node -e '
      const fs = require("fs");
      const image = JSON.parse(fs.readFileSync(0, "utf8"));
      const summary = image.image_summary || image.imageSummary || image;
      const value = summary.fully_qualified_digest || summary.fullyQualifiedDigest;
      if (typeof value === "string") process.stdout.write(value);
    ')"
  [[ "${digest}" == "${IMAGE_BASE}/${name}@sha256:"* ]] || {
    echo "STOP: ${name} did not resolve to an immutable digest" >&2
    exit 1
  }
  printf '%s\n' "${digest}"
}

echo "STAGING IMAGE PUBLICATION PASS"
echo "Build ID: ${BUILD_ID}"
PUBLICATION_IMAGE_ARGUMENTS=()
mkdir -p "${IMAGE_SECURITY_EVIDENCE_DIR}"
for name in "${IMAGE_NAMES[@]}"; do
  digest="$(resolve_digest "${name}")"
  PUBLICATION_IMAGE_ARGUMENTS+=(--image "${name}=${digest}")
  printf '%s: %s\n' "${name}" "${digest}"
  trivy image \
    --scanners vuln \
    --severity CRITICAL \
    --ignore-unfixed \
    --format json \
    --output "${IMAGE_SECURITY_EVIDENCE_DIR}/${name}-vulnerabilities.json" \
    --exit-code 1 \
    "${digest}"
  trivy image \
    --scanners secret \
    --severity HIGH,CRITICAL \
    --format json \
    --output "${IMAGE_SECURITY_EVIDENCE_DIR}/${name}-secrets.json" \
    --exit-code 1 \
    "${digest}"
done

node "${ROOT_DIR}/deploy/gcp/record-staging-image-publication.mjs" \
  --candidate-sha "${EXPECTED_SHA}" \
  --git-tree-sha "$(git -C "${ROOT_DIR}" rev-parse "${EXPECTED_SHA}^{tree}")" \
  --project-id "${PROJECT_ID}" \
  --project-number "${PROJECT_NUMBER}" \
  --region "${REGION}" \
  --repository "${REPOSITORY}" \
  --source-repository "haileleuld87/Samra-Pay" \
  --cloud-build-id "${BUILD_ID}" \
  --publisher-identity "${OPERATOR}" \
  --build-service-account "${BUILD_SERVICE_ACCOUNT}" \
  --github-run-id "${GITHUB_RUN_ID:-}" \
  --github-run-attempt "${GITHUB_RUN_ATTEMPT:-}" \
  --github-actor "${GITHUB_ACTOR:-}" \
  --release-evidence-root "${SAMRA_RELEASE_EVIDENCE_ROOT}" \
  --release-run-metadata "${SAMRA_RELEASE_RUN_METADATA}" \
  --release-candidate-run-id "${SAMRA_RELEASE_CANDIDATE_RUN_ID}" \
  --release-candidate-run-attempt "${SAMRA_RELEASE_CANDIDATE_RUN_ATTEMPT}" \
  --security-evidence-root "${IMAGE_SECURITY_EVIDENCE_DIR}" \
  --output "${PUBLICATION_MANIFEST}" \
  --hash-output "${PUBLICATION_MANIFEST_HASH}" \
  "${PUBLICATION_IMAGE_ARGUMENTS[@]}"

echo "Publication manifest: ${PUBLICATION_MANIFEST}"
echo "Publication manifest hash: ${PUBLICATION_MANIFEST_HASH}"
echo "Exact-digest security gate: passed for all five published images"
echo "Build source was filtered by .gcloudignore; Cloud Build staging storage, records, logs, and provenance may remain."
echo "No service was deployed, no traffic was changed, and no vendor was activated."
