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
: "${SAMRA_GCP_ZERO_TRAFFIC_APPLY:=}"
: "${SAMRA_STAGING_TARGET_SERVICE:=samra-design-system-preview}"
: "${SAMRA_STAGING_PUBLICATION_MANIFEST:=${ROOT_DIR}/artifacts/staging-release/staging-image-publication.json}"
: "${SAMRA_STAGING_PUBLICATION_HASH:=${ROOT_DIR}/artifacts/staging-release/staging-image-publication.sha256}"
: "${SAMRA_STAGING_PREREQUISITE_MANIFEST:=}"
: "${SAMRA_STAGING_PREREQUISITE_HASH:=}"

PROJECT_ID="${SAMRA_GCP_PROJECT_ID}"
PROJECT_NUMBER="${SAMRA_GCP_PROJECT_NUMBER}"
ORGANIZATION_ID="${SAMRA_GCP_ORGANIZATION_ID}"
REGION="${SAMRA_GCP_REGION}"
OPERATOR="${SAMRA_GCP_OPERATOR_ACCOUNT}"
EXPECTED_SHA="${SAMRA_GCP_EXPECTED_SHA}"
TARGET_SERVICE="${SAMRA_STAGING_TARGET_SERVICE}"
PUBLICATION_MANIFEST="${SAMRA_STAGING_PUBLICATION_MANIFEST}"
PUBLICATION_HASH="${SAMRA_STAGING_PUBLICATION_HASH}"
PREREQUISITE_MANIFEST="${SAMRA_STAGING_PREREQUISITE_MANIFEST}"
PREREQUISITE_HASH="${SAMRA_STAGING_PREREQUISITE_HASH}"
AUTHORIZATION="AUTHORIZED_STAGING_ZERO_TRAFFIC_DEPLOYMENT"
DEPLOYER_SERVICE_ACCOUNT="samra-github-deployer-staging@${PROJECT_ID}.iam.gserviceaccount.com"
CLOUD_RUN_SERVICE_AGENT="service-${PROJECT_NUMBER}@serverless-robot-prod.iam.gserviceaccount.com"
ARTIFACT_REPOSITORY="samra-staging"
NETWORK="samra-staging-vpc"
SUBNET="samra-staging-us-east4"
RUNTIME_API="samra-api-staging@${PROJECT_ID}.iam.gserviceaccount.com"
RUNTIME_CUSTOMER_WEB="samra-customer-web-staging@${PROJECT_ID}.iam.gserviceaccount.com"
RUNTIME_DESIGN="samra-design-system-staging@${PROJECT_ID}.iam.gserviceaccount.com"
OUTPUT_DIR="${ROOT_DIR}/artifacts/staging-release"
TRAFFIC_BEFORE="${OUTPUT_DIR}/staging-zero-traffic-before-${TARGET_SERVICE}.json"
TRAFFIC_AFTER="${OUTPUT_DIR}/staging-zero-traffic-after-${TARGET_SERVICE}.json"
CONFIGURATION_FILE="${OUTPUT_DIR}/staging-zero-traffic-configuration-${TARGET_SERVICE}.json"
EVIDENCE_MANIFEST="${OUTPUT_DIR}/staging-zero-traffic-deployment.json"
EVIDENCE_HASH="${OUTPUT_DIR}/staging-zero-traffic-deployment.sha256"

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
Plan only. No Google Cloud, GitHub, publication, or secret state was read or changed.

The zero-traffic controller will consume one independently hashed image
publication, deploy one allowlisted service by immutable digest, use its exact
runtime identity, preserve the existing traffic allocation byte-for-byte, keep
the default service URL disabled, reject public IAM, and retain a second hashed
deployment record. API deployment additionally requires same-release migration
evidence. Customer web additionally requires same-release API zero-traffic
evidence. The design preview has no service prerequisite.

It cannot build an image, execute a migration, read a secret payload, route
traffic, add a traffic tag, mutate IAM, activate Auth0, Persona, or Crossmint,
deploy the Operations Portal, touch Replit, or touch production.

Target service: ${TARGET_SERVICE}
Required apply authorization: ${AUTHORIZATION}
PLAN
  exit 0
fi

command -v gcloud >/dev/null 2>&1 || {
  echo "gcloud is required; run review or apply from federated GitHub Actions or authenticated Cloud Shell." >&2
  exit 1
}

[[ "$(gcloud config get-value account 2>/dev/null)" == "${OPERATOR}" ]] || { echo "STOP: wrong Google account" >&2; exit 1; }
[[ "$(gcloud config get-value project 2>/dev/null)" == "${PROJECT_ID}" ]] || { echo "STOP: wrong Google Cloud project" >&2; exit 1; }
[[ "$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')" == "${PROJECT_NUMBER}" ]] || { echo "STOP: wrong Google Cloud project number" >&2; exit 1; }
[[ "$(gcloud projects describe "${PROJECT_ID}" --format='value(parent.id)')" == "${ORGANIZATION_ID}" ]] || { echo "STOP: wrong Google Cloud organization" >&2; exit 1; }
[[ "$(git -C "${ROOT_DIR}" rev-parse HEAD)" == "${EXPECTED_SHA}" ]] || { echo "STOP: source commit does not match the reviewed SHA" >&2; exit 1; }
[[ -z "$(git -C "${ROOT_DIR}" status --porcelain)" ]] || { echo "STOP: source working tree is not clean" >&2; exit 1; }

for label in environment=staging data_classification=synthetic application=samra-pay firebase=enabled; do
  key="${label%%=*}"
  expected="${label#*=}"
  actual="$(gcloud projects describe "${PROJECT_ID}" --format="value(labels.${key})")"
  [[ "${actual}" == "${expected}" ]] || { echo "STOP: project label ${key} drifted" >&2; exit 1; }
done

for api in compute.googleapis.com iamcredentials.googleapis.com run.googleapis.com secretmanager.googleapis.com sts.googleapis.com; do
  [[ "$(gcloud services list --enabled --project="${PROJECT_ID}" --filter="config.name=${api}" --format='value(config.name)')" == "${api}" ]] || {
    echo "STOP: required API ${api} is not enabled" >&2
    exit 1
  }
done

gcloud compute networks describe "${NETWORK}" --project="${PROJECT_ID}" --format='value(name)' | grep -Fx "${NETWORK}" >/dev/null
gcloud compute networks subnets describe "${SUBNET}" --project="${PROJECT_ID}" --region="${REGION}" --format=json | node -e '
  const subnet = JSON.parse(require("fs").readFileSync(0, "utf8"));
  const expectedNetwork = `projects/${process.argv[1]}/global/networks/${process.argv[2]}`;
  if (subnet.name !== process.argv[3] || !subnet.network.endsWith(expectedNetwork)) throw new Error("staging subnet drifted");
' "${PROJECT_ID}" "${NETWORK}" "${SUBNET}"
gcloud projects get-iam-policy "${PROJECT_ID}" --format=json | node -e '
  const policy = JSON.parse(require("fs").readFileSync(0, "utf8"));
  const member = `serviceAccount:${process.argv[1]}`;
  const ready = (policy.bindings || []).some((binding) => binding.role === "roles/run.serviceAgent" && !binding.condition && (binding.members || []).includes(member));
  if (!ready) throw new Error("provider-managed Cloud Run service-agent authority is missing");
' "${CLOUD_RUN_SERVICE_AGENT}"

case "${TARGET_SERVICE}" in
  samra-api)
    RUNTIME_SERVICE_ACCOUNT="${RUNTIME_API}"
    MAX_INSTANCES=2
    CONCURRENCY=10
    CONFIG_ENVIRONMENT_NAMES="SAMRA_STAGING_AUTH0_ISSUER_BASE_URL,SAMRA_STAGING_AUTH0_AUDIENCE,SAMRA_STAGING_DATABASE_SECRET_VERSION"
    ;;
  samra-customer-web)
    RUNTIME_SERVICE_ACCOUNT="${RUNTIME_CUSTOMER_WEB}"
    MAX_INSTANCES=2
    CONCURRENCY=20
    CONFIG_ENVIRONMENT_NAMES="SAMRA_STAGING_API_ORIGIN,SAMRA_STAGING_API_SERVICE_AUDIENCE,SAMRA_STAGING_AUTH0_DOMAIN,SAMRA_STAGING_AUTH0_CLIENT_ID,SAMRA_STAGING_AUTH0_AUDIENCE"
    ;;
  samra-design-system-preview)
    RUNTIME_SERVICE_ACCOUNT="${RUNTIME_DESIGN}"
    MAX_INSTANCES=1
    CONCURRENCY=20
    CONFIG_ENVIRONMENT_NAMES=""
    ;;
  *)
    echo "STOP: target service is not allowlisted" >&2
    exit 1
    ;;
esac

gcloud iam service-accounts describe "${RUNTIME_SERVICE_ACCOUNT}" --project="${PROJECT_ID}" >/dev/null
[[ -z "$(gcloud iam service-accounts keys list --iam-account="${RUNTIME_SERVICE_ACCOUNT}" --project="${PROJECT_ID}" --managed-by=user --format='value(name)')" ]] || {
  echo "STOP: runtime identity has a user-managed key" >&2
  exit 1
}

[[ -f "${PUBLICATION_MANIFEST}" && -f "${PUBLICATION_HASH}" ]] || {
  echo "STOP: publication manifest and SHA-256 sidecar are required" >&2
  exit 1
}

PUBLICATION_SUMMARY="$(node --input-type=module -e '
  import { verifyPublicationManifest } from "./deploy/gcp/record-staging-image-publication.mjs";
  const manifest = await verifyPublicationManifest(process.argv[1], process.argv[2]);
  const service = process.argv[3];
  const digest = manifest.imageDigests[service];
  if (!digest) throw new Error("publication does not contain target image");
  process.stdout.write(JSON.stringify({ candidateSha: manifest.candidateSha, digest }));
' "${PUBLICATION_MANIFEST}" "${PUBLICATION_HASH}" "${TARGET_SERVICE}")"
PUBLICATION_SHA="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).candidateSha)' "${PUBLICATION_SUMMARY}")"
IMAGE_DIGEST="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).digest)' "${PUBLICATION_SUMMARY}")"
[[ "${PUBLICATION_SHA}" == "${EXPECTED_SHA}" ]] || { echo "STOP: publication SHA does not match source" >&2; exit 1; }
gcloud artifacts docker images describe "${IMAGE_DIGEST}" --project="${PROJECT_ID}" --format=json >/dev/null

verify_sidecar() {
  local manifest="$1"
  local sidecar="$2"
  node -e '
    const crypto = require("crypto");
    const fs = require("fs");
    const source = fs.readFileSync(process.argv[1], "utf8");
    const expected = fs.readFileSync(process.argv[2], "utf8").trim().split(/\s+/)[0];
    const actual = crypto.createHash("sha256").update(source).digest("hex");
    if (actual !== expected) throw new Error("prerequisite evidence hash does not match");
  ' "${manifest}" "${sidecar}"
}

if [[ "${TARGET_SERVICE}" != "samra-design-system-preview" ]]; then
  [[ -f "${PREREQUISITE_MANIFEST}" && -f "${PREREQUISITE_HASH}" ]] || {
    echo "STOP: ${TARGET_SERVICE} requires its reviewed prerequisite manifest and SHA-256 sidecar" >&2
    exit 1
  }
  verify_sidecar "${PREREQUISITE_MANIFEST}" "${PREREQUISITE_HASH}"
fi

if [[ "${TARGET_SERVICE}" == "samra-api" ]]; then
  # A JSON status string is insufficient: the migration prerequisite must match
  # its governed GitHub run, publication digest, complete journal and cleanup.
  SAMRA_GCP_EXPECTED_SHA="${EXPECTED_SHA}" \
    SAMRA_STAGING_PUBLICATION_MANIFEST="${PUBLICATION_MANIFEST}" \
    SAMRA_STAGING_PUBLICATION_HASH="${PUBLICATION_HASH}" \
    SAMRA_STAGING_PREREQUISITE_MANIFEST="${PREREQUISITE_MANIFEST}" \
    SAMRA_STAGING_PREREQUISITE_HASH="${PREREQUISITE_HASH}" \
    node "${ROOT_DIR}/deploy/gcp/verify-staging-migration-prerequisite.mjs" || {
      echo "STOP: migration prerequisite does not match" >&2
      exit 1
    }
  [[ "${SAMRA_STAGING_DATABASE_SECRET_VERSION:-}" =~ ^[1-9][0-9]*$ ]] || { echo "STOP: pinned database secret version is required" >&2; exit 1; }
  [[ "${SAMRA_STAGING_AUTH0_ISSUER_BASE_URL:-}" =~ ^https://[^/]+/?$ ]] || { echo "STOP: approved HTTPS Auth0 issuer is required" >&2; exit 1; }
  [[ "${SAMRA_STAGING_AUTH0_AUDIENCE:-}" =~ ^https:// ]] || { echo "STOP: approved HTTPS Auth0 audience is required" >&2; exit 1; }
  [[ "$(gcloud secrets versions describe "${SAMRA_STAGING_DATABASE_SECRET_VERSION}" --secret=samra-staging-database-url --project="${PROJECT_ID}" --format='value(state)')" == "ENABLED" ]] || {
    echo "STOP: pinned database secret version is not enabled" >&2
    exit 1
  }
elif [[ "${TARGET_SERVICE}" == "samra-customer-web" ]]; then
  node --input-type=module -e '
    import { verifyZeroTrafficDeploymentManifest } from "./deploy/gcp/record-staging-zero-traffic-deployment.mjs";
    const evidence = await verifyZeroTrafficDeploymentManifest(process.argv[1], process.argv[2]);
    if (evidence.candidateSha !== process.argv[3] || evidence.deployment.service !== "samra-api") {
      throw new Error("API prerequisite does not match this staging candidate");
    }
  ' "${PREREQUISITE_MANIFEST}" "${PREREQUISITE_HASH}" "${EXPECTED_SHA}"
  [[ "${SAMRA_STAGING_API_ORIGIN:-}" =~ ^https:// ]] || { echo "STOP: approved HTTPS API origin is required" >&2; exit 1; }
  [[ "${SAMRA_STAGING_API_SERVICE_AUDIENCE:-}" == "${SAMRA_STAGING_API_ORIGIN}" ]] || { echo "STOP: API service audience must equal API origin" >&2; exit 1; }
  [[ "${SAMRA_STAGING_AUTH0_DOMAIN:-}" =~ ^[a-zA-Z0-9.-]+$ ]] || { echo "STOP: approved Auth0 domain is required without a URL scheme" >&2; exit 1; }
  [[ -n "${SAMRA_STAGING_AUTH0_CLIENT_ID:-}" ]] || { echo "STOP: approved Auth0 public client ID is required" >&2; exit 1; }
  [[ "${SAMRA_STAGING_AUTH0_AUDIENCE:-}" =~ ^https:// ]] || { echo "STOP: approved HTTPS Auth0 audience is required" >&2; exit 1; }
fi

service_exists() {
  gcloud run services describe "${TARGET_SERVICE}" --project="${PROJECT_ID}" --region="${REGION}" >/dev/null 2>&1
}

assert_private_service() {
  if ! service_exists; then return; fi
  gcloud run services describe "${TARGET_SERVICE}" --project="${PROJECT_ID}" --region="${REGION}" --format=json | node -e '
    const service = JSON.parse(require("fs").readFileSync(0, "utf8"));
    const annotations = service.metadata?.annotations || {};
    const disabled = service.spec?.defaultUriDisabled === true || annotations["run.googleapis.com/default-url-disabled"] === "true";
    if (!disabled) throw new Error("default Cloud Run URL is enabled");
    if (annotations["run.googleapis.com/ingress"] !== "internal-and-cloud-load-balancing") throw new Error("service ingress drifted");
  '
  gcloud run services get-iam-policy "${TARGET_SERVICE}" --project="${PROJECT_ID}" --region="${REGION}" --format=json | node -e '
    const policy = JSON.parse(require("fs").readFileSync(0, "utf8"));
    const publicMembers = new Set(["allUsers", "allAuthenticatedUsers"]);
    if ((policy.bindings || []).some((binding) => (binding.members || []).some((member) => publicMembers.has(member)))) {
      throw new Error("service IAM grants public access");
    }
  '
}

write_traffic_snapshot() {
  local output="$1"
  mkdir -p "$(dirname "${output}")"
  if ! service_exists; then
    printf '[]\n' >"${output}"
    return
  fi
  gcloud run services describe "${TARGET_SERVICE}" --project="${PROJECT_ID}" --region="${REGION}" --format=json | node -e '
    const service = JSON.parse(require("fs").readFileSync(0, "utf8"));
    const traffic = (service.status?.traffic || []).map((entry) => ({
      revision: entry.revisionName,
      percent: entry.percent || 0,
      tag: entry.tag || null,
    })).filter((entry) => entry.revision).sort((a, b) => `${a.revision}:${a.tag || ""}`.localeCompare(`${b.revision}:${b.tag || ""}`));
    process.stdout.write(`${JSON.stringify(traffic, null, 2)}\n`);
  ' >"${output}"
}

assert_private_service
write_traffic_snapshot "${TRAFFIC_BEFORE}"
REVISION_NAME="${TARGET_SERVICE}-${EXPECTED_SHA:0:12}"

echo "READ-ONLY STAGING ZERO-TRAFFIC DEPLOYMENT REVIEW PASS"
echo "Source: ${EXPECTED_SHA}"
echo "Service: ${TARGET_SERVICE}"
echo "Revision: ${REVISION_NAME}"
echo "Image: ${IMAGE_DIGEST}"
echo "Traffic: unchanged required"
echo "Default URL: disabled required"
echo "Public IAM: prohibited"

if [[ "${MODE}" == "--review" ]]; then
  echo "REVIEW COMPLETE — NO CLOUD OR GITHUB CHANGES"
  exit 0
fi

[[ "${OPERATOR}" == "${DEPLOYER_SERVICE_ACCOUNT}" ]] || { echo "STOP: apply requires the keyless deployment identity" >&2; exit 1; }
[[ "${SAMRA_GCP_ZERO_TRAFFIC_APPLY}" == "${AUTHORIZATION}" ]] || {
  echo "STOP: set SAMRA_GCP_ZERO_TRAFFIC_APPLY=${AUTHORIZATION}" >&2
  exit 1
}

COMMON_ARGS=(
  "${TARGET_SERVICE}"
  --project="${PROJECT_ID}"
  --region="${REGION}"
  --platform=managed
  --image="${IMAGE_DIGEST}"
  --revision-suffix="${EXPECTED_SHA:0:12}"
  --service-account="${RUNTIME_SERVICE_ACCOUNT}"
  --ingress=internal-and-cloud-load-balancing
  --no-default-url
  --no-traffic
  --min=0
  --max="${MAX_INSTANCES}"
  --concurrency="${CONCURRENCY}"
  --port=8080
  --quiet
)

case "${TARGET_SERVICE}" in
  samra-api)
    gcloud run deploy "${COMMON_ARGS[@]}" \
      --network="${NETWORK}" --subnet="${SUBNET}" --vpc-egress=private-ranges-only \
      --set-env-vars="NODE_ENV=production,SAMRA_RELEASE_PROFILE=alpha-release-1,SAMRA_BACKEND_MODE=demo,SAMRA_PROVIDER_MODE=fake,SAMRA_PERSISTENCE_MODE=postgres,SAMRA_RUN_WORKER=false,SAMRA_INTERNAL_OPERATIONS_ENABLED=false,SAMRA_CUSTOMER_AUTH_MODE=auth0,SAMRA_CUSTOMER_IDENTITY_PROVIDER_MODE=fake,SAMRA_CUSTOMER_WALLET_PROVIDER_MODE=fake,AUTH0_ISSUER_BASE_URL=${SAMRA_STAGING_AUTH0_ISSUER_BASE_URL},AUTH0_AUDIENCE=${SAMRA_STAGING_AUTH0_AUDIENCE}" \
      --set-secrets="DATABASE_URL=samra-staging-database-url:${SAMRA_STAGING_DATABASE_SECRET_VERSION}"
    ;;
  samra-customer-web)
    gcloud run deploy "${COMMON_ARGS[@]}" \
      --set-env-vars="NODE_ENV=production,SAMRA_API_ORIGIN=${SAMRA_STAGING_API_ORIGIN},SAMRA_API_SERVICE_AUTH_MODE=cloud-run-iam,SAMRA_API_SERVICE_AUDIENCE=${SAMRA_STAGING_API_SERVICE_AUDIENCE},SAMRA_PUBLIC_DATA_MODE=api,SAMRA_PUBLIC_AUTH0_DOMAIN=${SAMRA_STAGING_AUTH0_DOMAIN},SAMRA_PUBLIC_AUTH0_CLIENT_ID=${SAMRA_STAGING_AUTH0_CLIENT_ID},SAMRA_PUBLIC_AUTH0_AUDIENCE=${SAMRA_STAGING_AUTH0_AUDIENCE}"
    ;;
  samra-design-system-preview)
    gcloud run deploy "${COMMON_ARGS[@]}" --set-env-vars="NODE_ENV=production"
    ;;
esac

assert_private_service
write_traffic_snapshot "${TRAFFIC_AFTER}"
cmp --silent "${TRAFFIC_BEFORE}" "${TRAFFIC_AFTER}" || {
  echo "STOP: deployment changed the existing traffic allocation" >&2
  exit 1
}
[[ "$(gcloud run revisions describe "${REVISION_NAME}" --project="${PROJECT_ID}" --region="${REGION}" --format='value(spec.containers[0].image)')" == "${IMAGE_DIGEST}" ]] || {
  echo "STOP: deployed revision image does not match the publication digest" >&2
  exit 1
}

mkdir -p "${OUTPUT_DIR}"
node -e '
  const crypto = require("crypto");
  const fs = require("fs");
  const names = (process.argv[4] || "").split(",").filter(Boolean).sort();
  const valueHashes = Object.fromEntries(names.map((name) => [name, crypto.createHash("sha256").update(process.env[name] || "").digest("hex")]));
  const descriptor = {
    schemaVersion: 1,
    environment: "staging",
    dataClassification: "synthetic-only",
    candidateSha: process.argv[1],
    service: process.argv[2],
    imageDigest: process.argv[3],
    environmentValueHashes: valueHashes,
    secretValuesRecorded: false,
    trafficAuthorized: false,
    vendorActivationAuthorized: false,
  };
  fs.writeFileSync(process.argv[5], `${JSON.stringify(descriptor, null, 2)}\n`);
' "${EXPECTED_SHA}" "${TARGET_SERVICE}" "${IMAGE_DIGEST}" "${CONFIG_ENVIRONMENT_NAMES}" "${CONFIGURATION_FILE}"
CONFIGURATION_SHA256="$(node -e 'const fs=require("fs"),crypto=require("crypto"); process.stdout.write(crypto.createHash("sha256").update(fs.readFileSync(process.argv[1])).digest("hex"))' "${CONFIGURATION_FILE}")"

node "${ROOT_DIR}/deploy/gcp/record-staging-zero-traffic-deployment.mjs" \
  --publication-manifest "${PUBLICATION_MANIFEST}" \
  --publication-hash "${PUBLICATION_HASH}" \
  --target-service "${TARGET_SERVICE}" \
  --revision-name "${REVISION_NAME}" \
  --image-digest "${IMAGE_DIGEST}" \
  --deployer-identity "${OPERATOR}" \
  --configuration-sha256 "${CONFIGURATION_SHA256}" \
  --traffic-before "${TRAFFIC_BEFORE}" \
  --traffic-after "${TRAFFIC_AFTER}" \
  --github-run-id "${GITHUB_RUN_ID:?GitHub run ID is required}" \
  --github-run-attempt "${GITHUB_RUN_ATTEMPT:?GitHub run attempt is required}" \
  --github-actor "${GITHUB_ACTOR:?GitHub actor is required}" \
  --output "${EVIDENCE_MANIFEST}" \
  --hash-output "${EVIDENCE_HASH}"

echo "STAGING ZERO-TRAFFIC DEPLOYMENT APPLIED AND VERIFIED"
echo "Service: ${TARGET_SERVICE}"
echo "Revision: ${REVISION_NAME}"
echo "Traffic changed: no"
echo "Public access created: no"
echo "Migration executed: no"
echo "Vendor activated: no"
