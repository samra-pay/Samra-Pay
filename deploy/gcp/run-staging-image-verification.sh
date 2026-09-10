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
: "${SAMRA_GCP_IMAGE_VERIFICATION_APPLY:=}"
: "${SAMRA_STAGING_ZERO_TRAFFIC_MANIFEST:=${ROOT_DIR}/artifacts/staging-release/staging-zero-traffic-deployment.json}"
: "${SAMRA_STAGING_ZERO_TRAFFIC_HASH:=${ROOT_DIR}/artifacts/staging-release/staging-zero-traffic-deployment.sha256}"
: "${SAMRA_STAGING_DATABASE_SECRET_VERSION:=}"
: "${SAMRA_SYNTHETIC_RUN_ID:=}"

PROJECT_ID="${SAMRA_GCP_PROJECT_ID}"
PROJECT_NUMBER="${SAMRA_GCP_PROJECT_NUMBER}"
ORGANIZATION_ID="${SAMRA_GCP_ORGANIZATION_ID}"
REGION="${SAMRA_GCP_REGION}"
OPERATOR="${SAMRA_GCP_OPERATOR_ACCOUNT}"
EXPECTED_SHA="${SAMRA_GCP_EXPECTED_SHA}"
AUTHORIZATION="AUTHORIZED_STAGING_IMAGE_VERIFICATION"
CONTROLLER_SERVICE_ACCOUNT="samra-github-verifier-staging@${PROJECT_ID}.iam.gserviceaccount.com"
RUNTIME_SERVICE_ACCOUNT="samra-verifier-staging@${PROJECT_ID}.iam.gserviceaccount.com"
CLOUD_RUN_SERVICE_AGENT="service-${PROJECT_NUMBER}@serverless-robot-prod.iam.gserviceaccount.com"
SERVICE="samra-api"
JOB="samra-staging-image-verifier"
NETWORK="samra-staging-vpc"
SUBNET="samra-staging-us-east4"
DATABASE_SECRET="samra-staging-database-url"
LOG_BUCKET="_Default"
LOG_LOCATION="global"
LOG_VIEW="samra-staging-image-verifier"
ZERO_TRAFFIC_MANIFEST="${SAMRA_STAGING_ZERO_TRAFFIC_MANIFEST}"
ZERO_TRAFFIC_HASH="${SAMRA_STAGING_ZERO_TRAFFIC_HASH}"
DATABASE_SECRET_VERSION="${SAMRA_STAGING_DATABASE_SECRET_VERSION}"
SYNTHETIC_RUN_ID="${SAMRA_SYNTHETIC_RUN_ID}"
OUTPUT_DIR="${ROOT_DIR}/artifacts/staging-release"
JUNIT_OUTPUT="${OUTPUT_DIR}/staging-image-verification.junit.xml"
EVIDENCE_MANIFEST="${OUTPUT_DIR}/staging-image-verification.json"
EVIDENCE_HASH="${OUTPUT_DIR}/staging-image-verification.sha256"

VALIDATED="$(node "${ROOT_DIR}/deploy/gcp/validate-staging-image-verification.mjs" 2>&1)" || {
  echo "${VALIDATED}" >&2
  exit 1
}

if [[ "${MODE}" == "--plan" ]]; then
  printf '%s\n' "${VALIDATED}"
  cat <<PLAN
Plan only. No Google Cloud, GitHub, database, service, or evidence state was read or changed.

The verifier will consume one independently hashed API zero-traffic deployment,
attest the exact ready revision and immutable image digest, and run the same
image once as a temporary private Cloud Run job. The job uses one dedicated
keyless runtime identity, a pinned database-secret version, one task, no retry,
a unique synthetic run ID, and the reviewed private VPC path. JUnit is read
only through a log view restricted to this verifier job, hashed, and combined
with the deployment hash into non-promotable evidence. The temporary job must
be absent before execution and is deleted before success.

It cannot route traffic, invoke the deployed revision, prove service
authentication, read a secret value through the controller, mutate service
configuration or IAM, activate a vendor, use customer data, touch Replit, or
touch production. This partial evidence cannot authorize promotion.

Job: ${JOB}
Runtime identity: ${RUNTIME_SERVICE_ACCOUNT}
Required apply authorization: ${AUTHORIZATION}
PLAN
  exit 0
fi

command -v gcloud >/dev/null 2>&1 || {
  echo "gcloud is required; run review or apply from protected keyless GitHub Actions." >&2
  exit 1
}

[[ "${OPERATOR}" == "${CONTROLLER_SERVICE_ACCOUNT}" || "${OPERATOR}" =~ ^[^@[:space:]]+@davidhaile\.com$ ]] || {
  echo "STOP: image verification requires the keyless controller or a davidhaile.com reviewer" >&2
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

for api in artifactregistry.googleapis.com compute.googleapis.com iamcredentials.googleapis.com logging.googleapis.com run.googleapis.com secretmanager.googleapis.com sts.googleapis.com; do
  [[ "$(gcloud services list --enabled --project="${PROJECT_ID}" --filter="config.name=${api}" --format='value(config.name)')" == "${api}" ]] || {
    echo "STOP: required API ${api} is not enabled" >&2
    exit 1
  }
done

[[ -f "${ZERO_TRAFFIC_MANIFEST}" && -f "${ZERO_TRAFFIC_HASH}" ]] || {
  echo "STOP: zero-traffic deployment manifest and SHA-256 sidecar are required" >&2
  exit 1
}
DEPLOYMENT_SUMMARY="$(node --input-type=module -e '
  import { verifyZeroTrafficDeploymentManifest } from "./deploy/gcp/record-staging-zero-traffic-deployment.mjs";
  const manifest = await verifyZeroTrafficDeploymentManifest(process.argv[1], process.argv[2]);
  if (manifest.deployment.service !== "samra-api") throw new Error("zero-traffic evidence is not for the API");
  process.stdout.write(JSON.stringify({
    candidateSha: manifest.candidateSha,
    revision: manifest.deployment.revision,
    imageDigest: manifest.publication.imageDigest,
    candidateTrafficPercent: manifest.deployment.candidateTrafficPercent,
  }));
' "${ZERO_TRAFFIC_MANIFEST}" "${ZERO_TRAFFIC_HASH}")"
CANDIDATE_SHA="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).candidateSha)' "${DEPLOYMENT_SUMMARY}")"
REVISION="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).revision)' "${DEPLOYMENT_SUMMARY}")"
IMAGE_DIGEST="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).imageDigest)' "${DEPLOYMENT_SUMMARY}")"
CANDIDATE_TRAFFIC="$(node -e 'process.stdout.write(String(JSON.parse(process.argv[1]).candidateTrafficPercent))' "${DEPLOYMENT_SUMMARY}")"
[[ "${CANDIDATE_SHA}" == "${EXPECTED_SHA}" ]] || { echo "STOP: deployment evidence does not match source" >&2; exit 1; }
[[ "${CANDIDATE_TRAFFIC}" == "0" ]] || { echo "STOP: deployment evidence is not zero traffic" >&2; exit 1; }
[[ "${REVISION}" == "${SERVICE}-${EXPECTED_SHA:0:12}" ]] || { echo "STOP: revision identity drifted" >&2; exit 1; }
[[ "${IMAGE_DIGEST}" =~ ^${REGION}-docker\.pkg\.dev/${PROJECT_ID}/samra-staging/${SERVICE}@sha256:[0-9a-f]{64}$ ]] || {
  echo "STOP: immutable API image digest is invalid" >&2
  exit 1
}

gcloud artifacts docker images describe "${IMAGE_DIGEST}" --project="${PROJECT_ID}" --format=json >/dev/null
gcloud compute networks describe "${NETWORK}" --project="${PROJECT_ID}" --format='value(name)' | grep -Fx "${NETWORK}" >/dev/null
gcloud compute networks subnets describe "${SUBNET}" --project="${PROJECT_ID}" --region="${REGION}" --format=json | node -e '
  const subnet = JSON.parse(require("fs").readFileSync(0, "utf8"));
  const expected = `projects/${process.argv[1]}/global/networks/${process.argv[2]}`;
  if (subnet.name !== process.argv[3] || !subnet.network.endsWith(expected)) throw new Error("staging subnet drifted");
' "${PROJECT_ID}" "${NETWORK}" "${SUBNET}"
gcloud projects get-iam-policy "${PROJECT_ID}" --format=json | node -e '
  const policy = JSON.parse(require("fs").readFileSync(0, "utf8"));
  const member = `serviceAccount:${process.argv[1]}`;
  const ready = (policy.bindings || []).some((binding) => binding.role === "roles/run.serviceAgent" && !binding.condition && (binding.members || []).includes(member));
  if (!ready) throw new Error("provider-managed Cloud Run service-agent authority is missing");
' "${CLOUD_RUN_SERVICE_AGENT}"

for service_account in "${CONTROLLER_SERVICE_ACCOUNT}" "${RUNTIME_SERVICE_ACCOUNT}"; do
  gcloud iam service-accounts describe "${service_account}" --project="${PROJECT_ID}" >/dev/null
  [[ -z "$(gcloud iam service-accounts keys list --iam-account="${service_account}" --project="${PROJECT_ID}" --managed-by=user --format='value(name)')" ]] || {
    echo "STOP: ${service_account} has a user-managed key" >&2
    exit 1
  }
done

[[ "${DATABASE_SECRET_VERSION}" =~ ^[1-9][0-9]*$ ]] || { echo "STOP: pinned database secret version is required" >&2; exit 1; }
[[ "$(gcloud secrets versions describe "${DATABASE_SECRET_VERSION}" --secret="${DATABASE_SECRET}" --project="${PROJECT_ID}" --format='value(state)')" == "ENABLED" ]] || {
  echo "STOP: pinned database secret version is not enabled" >&2
  exit 1
}
gcloud secrets get-iam-policy "${DATABASE_SECRET}" --project="${PROJECT_ID}" --format=json | node -e '
  const policy = JSON.parse(require("fs").readFileSync(0, "utf8"));
  const member = `serviceAccount:${process.argv[1]}`;
  const ready = (policy.bindings || []).some((binding) => binding.role === "roles/secretmanager.secretAccessor" && !binding.condition && (binding.members || []).includes(member));
  if (!ready) throw new Error("verifier runtime cannot access the database secret");
' "${RUNTIME_SERVICE_ACCOUNT}"

gcloud logging views describe "${LOG_VIEW}" --bucket="${LOG_BUCKET}" --location="${LOG_LOCATION}" --project="${PROJECT_ID}" --format=json | node -e '
  const view = JSON.parse(require("fs").readFileSync(0, "utf8"));
  const expected = `resource.type="cloud_run_job" AND resource.labels.job_name="${process.argv[1]}"`;
  if (view.filter !== expected) throw new Error("verifier log view drifted");
' "${JOB}"

TMP_DIR="$(mktemp -d)"
SERVICE_BEFORE="${TMP_DIR}/service-before.json"
SERVICE_AFTER="${TMP_DIR}/service-after.json"
RAW_LOGS="${TMP_DIR}/verifier-logs.json"
OBSERVATION="${TMP_DIR}/observation.json"
JOB_CREATED=false

cleanup_local() {
  if [[ "${JOB_CREATED}" == true ]]; then
    gcloud run jobs delete "${JOB}" --project="${PROJECT_ID}" --region="${REGION}" --quiet >/dev/null 2>&1 || true
  fi
  rm -f -- \
    "${SERVICE_BEFORE}" "${SERVICE_AFTER}" "${RAW_LOGS}" "${OBSERVATION}" \
    "${TMP_DIR}/service.json" "${TMP_DIR}/service-iam.json"
  rmdir -- "${TMP_DIR}" 2>/dev/null || true
}
trap cleanup_local EXIT

write_service_boundary() {
  local output="$1"
  local service_json="${TMP_DIR}/service.json"
  local iam_json="${TMP_DIR}/service-iam.json"
  gcloud run services describe "${SERVICE}" --project="${PROJECT_ID}" --region="${REGION}" --format=json >"${service_json}"
  gcloud run services get-iam-policy "${SERVICE}" --project="${PROJECT_ID}" --region="${REGION}" --format=json >"${iam_json}"
  node -e '
    const fs = require("fs");
    const service = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const policy = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
    const revision = process.argv[3];
    const annotations = service.metadata?.annotations || {};
    const disabled = service.spec?.defaultUriDisabled === true || annotations["run.googleapis.com/default-url-disabled"] === "true";
    if (!disabled) throw new Error("default Cloud Run URL is enabled");
    if (annotations["run.googleapis.com/ingress"] !== "internal-and-cloud-load-balancing") throw new Error("service ingress drifted");
    const publicMembers = new Set(["allUsers", "allAuthenticatedUsers"]);
    if ((policy.bindings || []).some((binding) => (binding.members || []).some((member) => publicMembers.has(member)))) throw new Error("service IAM grants public access");
    const traffic = (service.status?.traffic || []).map((entry) => ({ revision: entry.revisionName, percent: entry.percent || 0, tag: entry.tag || null })).filter((entry) => entry.revision).sort((a, b) => `${a.revision}:${a.tag || ""}`.localeCompare(`${b.revision}:${b.tag || ""}`));
    if (traffic.some((entry) => entry.revision === revision && (entry.percent !== 0 || entry.tag !== null))) throw new Error("candidate revision is receiving traffic or has a tag");
    fs.writeFileSync(process.argv[4], `${JSON.stringify({ defaultUrlDisabled: true, ingress: "internal-and-cloud-load-balancing", publicIamAbsent: true, traffic }, null, 2)}\n`);
  ' "${service_json}" "${iam_json}" "${REVISION}" "${output}"
}

write_service_boundary "${SERVICE_BEFORE}"
gcloud run revisions describe "${REVISION}" --project="${PROJECT_ID}" --region="${REGION}" --format=json | node -e '
  const revision = JSON.parse(require("fs").readFileSync(0, "utf8"));
  const ready = (revision.status?.conditions || []).some((condition) => condition.type === "Ready" && condition.status === "True");
  if (!ready) throw new Error("candidate revision is not Ready");
  if (revision.spec?.containers?.[0]?.image !== process.argv[1]) throw new Error("candidate revision image digest drifted");
' "${IMAGE_DIGEST}"

if gcloud run jobs describe "${JOB}" --project="${PROJECT_ID}" --region="${REGION}" >/dev/null 2>&1; then
  echo "STOP: temporary verifier job already exists; audit the orphan before retrying" >&2
  exit 1
fi

printf '%s\n' "${VALIDATED}"
cat <<REVIEW
READ-ONLY STAGING IMAGE VERIFICATION REVIEW PASS
Source: ${EXPECTED_SHA}
Revision: ${REVISION} (Ready, private, untagged, zero traffic)
Image: immutable API digest verified
Runtime identity: dedicated and keyless
Database secret: pinned enabled version metadata verified
Log access: restricted verifier-job view
Temporary job: absent
REVIEW

if [[ "${MODE}" == "--review" ]]; then
  echo "REVIEW COMPLETE — NO CLOUD OR DATABASE CHANGES"
  exit 0
fi

[[ "${OPERATOR}" == "${CONTROLLER_SERVICE_ACCOUNT}" ]] || { echo "STOP: apply requires the keyless verifier controller" >&2; exit 1; }
[[ "${SAMRA_GCP_IMAGE_VERIFICATION_APPLY}" == "${AUTHORIZATION}" ]] || {
  echo "Refusing apply without the exact staging image-verification authorization." >&2
  exit 1
}
[[ "${SYNTHETIC_RUN_ID}" =~ ^[a-z0-9][a-z0-9-]{0,47}$ ]] || { echo "STOP: unique synthetic run ID is invalid" >&2; exit 1; }

gcloud run jobs create "${JOB}" --project="${PROJECT_ID}" --region="${REGION}" \
  --image="${IMAGE_DIGEST}" --service-account="${RUNTIME_SERVICE_ACCOUNT}" \
  --network="${NETWORK}" --subnet="${SUBNET}" --vpc-egress=private-ranges-only \
  --tasks=1 --parallelism=1 --max-retries=0 --task-timeout=15m \
  --set-secrets="TEST_DATABASE_URL=${DATABASE_SECRET}:${DATABASE_SECRET_VERSION}" \
  --set-env-vars="SAMRA_SYNTHETIC_RUN_ID=${SYNTHETIC_RUN_ID}" \
  --command=node --args=--test,--test-reporter=junit,./dist/staging-verification.mjs \
  --labels="environment=staging,data_classification=synthetic,application=samra-pay,managed_by=staging-image-verification,git_sha=${EXPECTED_SHA}" \
  --quiet >/dev/null
JOB_CREATED=true

gcloud run jobs execute "${JOB}" --project="${PROJECT_ID}" --region="${REGION}" --wait --quiet >/dev/null
EXECUTION_NAME="$(gcloud run jobs describe "${JOB}" --project="${PROJECT_ID}" --region="${REGION}" --format='value(status.latestCreatedExecution.name)')"
[[ "${EXECUTION_NAME}" =~ ^[a-z][a-z0-9-]{0,62}$ ]] || { echo "STOP: verifier execution identity is invalid" >&2; exit 1; }
gcloud run jobs executions describe "${EXECUTION_NAME}" --project="${PROJECT_ID}" --region="${REGION}" --format=json | node -e '
  const execution = JSON.parse(require("fs").readFileSync(0, "utf8"));
  const completed = (execution.status?.conditions || execution.conditions || []).some((condition) => condition.type === "Completed" && condition.status === "True");
  const succeeded = Number(execution.status?.succeededCount ?? execution.succeededCount ?? 0);
  const failed = Number(execution.status?.failedCount ?? execution.failedCount ?? 0);
  if (!completed || succeeded !== 1 || failed !== 0) throw new Error("verifier execution did not complete exactly once");
'

LOG_FILTER="resource.type=\"cloud_run_job\" AND resource.labels.job_name=\"${JOB}\" AND labels.execution_name=\"${EXECUTION_NAME}\" AND logName=\"projects/${PROJECT_ID}/logs/run.googleapis.com%2Fstdout\""
JUNIT_SUMMARY=""
for _ in $(seq 1 30); do
  gcloud logging read "${LOG_FILTER}" --bucket="${LOG_BUCKET}" --location="${LOG_LOCATION}" --view="${LOG_VIEW}" --freshness=1h --order=asc --limit=1000 --format=json >"${RAW_LOGS}"
  if JUNIT_SUMMARY="$(node "${ROOT_DIR}/deploy/gcp/record-staging-image-verification.mjs" extract-junit --logs "${RAW_LOGS}" --execution "${EXECUTION_NAME}" --output "${JUNIT_OUTPUT}" 2>/dev/null)"; then
    break
  fi
  sleep 2
done
[[ -n "${JUNIT_SUMMARY}" ]] || { echo "STOP: complete verifier JUnit was not available in the restricted log view" >&2; exit 1; }
JUNIT_SHA256="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).junitSha256)' "${JUNIT_SUMMARY}")"

node -e '
  const fs = require("fs");
  const checks = JSON.parse(process.argv[8]).imageChecks;
  const observation = {
    imageDigest: process.argv[1],
    revision: process.argv[2],
    revisionAttestation: { ready: true, exactImageDigest: true, privateIngress: true, defaultServiceUrlDisabled: true, publicIamAbsent: true },
    syntheticRunId: process.argv[3],
    jobExecutionId: process.argv[4],
    junitSha256: process.argv[5],
    runtimeServiceAccount: process.argv[6],
    databaseSecretVersion: process.argv[7],
    imageChecks: checks,
    generatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(process.argv[9], `${JSON.stringify(observation, null, 2)}\n`);
' "${IMAGE_DIGEST}" "${REVISION}" "${SYNTHETIC_RUN_ID}" "${EXECUTION_NAME}" "${JUNIT_SHA256}" "${RUNTIME_SERVICE_ACCOUNT}" "${DATABASE_SECRET_VERSION}" "${JUNIT_SUMMARY}" "${OBSERVATION}"

node "${ROOT_DIR}/deploy/gcp/record-staging-image-verification.mjs" build \
  --zero-traffic-manifest "${ZERO_TRAFFIC_MANIFEST}" \
  --zero-traffic-hash "${ZERO_TRAFFIC_HASH}" \
  --observation "${OBSERVATION}" \
  --output "${EVIDENCE_MANIFEST}" \
  --hash-output "${EVIDENCE_HASH}" >/dev/null
node "${ROOT_DIR}/deploy/gcp/record-staging-image-verification.mjs" verify \
  --manifest "${EVIDENCE_MANIFEST}" --hash "${EVIDENCE_HASH}" >/dev/null

gcloud run jobs delete "${JOB}" --project="${PROJECT_ID}" --region="${REGION}" --quiet >/dev/null
JOB_CREATED=false
if gcloud run jobs describe "${JOB}" --project="${PROJECT_ID}" --region="${REGION}" >/dev/null 2>&1; then
  echo "STOP: temporary verifier job remains after cleanup" >&2
  exit 1
fi
write_service_boundary "${SERVICE_AFTER}"
cmp --silent "${SERVICE_BEFORE}" "${SERVICE_AFTER}" || {
  echo "STOP: API service boundary changed during image verification" >&2
  exit 1
}

echo "STAGING IMAGE VERIFICATION APPLIED AND VERIFIED"
echo "Source: ${EXPECTED_SHA}"
echo "Execution: ${EXECUTION_NAME}"
echo "Synthetic tests: 9 passed"
echo "Temporary job deleted: yes"
echo "Traffic changed: no"
echo "Deployed revision path tested: no"
echo "Service authentication tested: no"
echo "Promotion eligible: no"
