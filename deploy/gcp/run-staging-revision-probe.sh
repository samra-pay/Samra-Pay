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
: "${SAMRA_GCP_REVISION_PROBE_APPLY:=}"
: "${SAMRA_STAGING_ZERO_TRAFFIC_MANIFEST:=${ROOT_DIR}/artifacts/staging-release/staging-zero-traffic-deployment.json}"
: "${SAMRA_STAGING_ZERO_TRAFFIC_HASH:=${ROOT_DIR}/artifacts/staging-release/staging-zero-traffic-deployment.sha256}"
: "${SAMRA_STAGING_IMAGE_VERIFICATION_MANIFEST:=${ROOT_DIR}/artifacts/staging-release/staging-image-verification.json}"
: "${SAMRA_STAGING_IMAGE_VERIFICATION_HASH:=${ROOT_DIR}/artifacts/staging-release/staging-image-verification.sha256}"
: "${SAMRA_PROBE_ID:=}"

PROJECT_ID="${SAMRA_GCP_PROJECT_ID}"
PROJECT_NUMBER="${SAMRA_GCP_PROJECT_NUMBER}"
ORGANIZATION_ID="${SAMRA_GCP_ORGANIZATION_ID}"
REGION="${SAMRA_GCP_REGION}"
OPERATOR="${SAMRA_GCP_OPERATOR_ACCOUNT}"
EXPECTED_SHA="${SAMRA_GCP_EXPECTED_SHA}"
AUTHORIZATION="AUTHORIZED_STAGING_REVISION_PROBE"
CONTROLLER_SERVICE_ACCOUNT="samra-github-probe-staging@${PROJECT_ID}.iam.gserviceaccount.com"
RUNTIME_SERVICE_ACCOUNT="samra-revision-probe-staging@${PROJECT_ID}.iam.gserviceaccount.com"
CLOUD_RUN_SERVICE_AGENT="service-${PROJECT_NUMBER}@serverless-robot-prod.iam.gserviceaccount.com"
SERVICE="samra-api"
JOB="samra-staging-revision-probe"
NETWORK="samra-staging-vpc"
SUBNET="samra-staging-us-east4"
LOG_BUCKET="_Default"
LOG_LOCATION="global"
LOG_VIEW="samra-staging-revision-probe"
ZERO_TRAFFIC_MANIFEST="${SAMRA_STAGING_ZERO_TRAFFIC_MANIFEST}"
ZERO_TRAFFIC_HASH="${SAMRA_STAGING_ZERO_TRAFFIC_HASH}"
IMAGE_MANIFEST="${SAMRA_STAGING_IMAGE_VERIFICATION_MANIFEST}"
IMAGE_HASH="${SAMRA_STAGING_IMAGE_VERIFICATION_HASH}"
PROBE_ID="${SAMRA_PROBE_ID}"
OUTPUT_DIR="${ROOT_DIR}/artifacts/staging-release"
JUNIT_OUTPUT="${OUTPUT_DIR}/staging-revision-probe.junit.xml"
EVIDENCE_MANIFEST="${OUTPUT_DIR}/staging-verification-probe.json"
EVIDENCE_HASH="${OUTPUT_DIR}/staging-verification-probe.sha256"

VALIDATED="$(node "${ROOT_DIR}/deploy/gcp/validate-staging-revision-probe.mjs" 2>&1)" || {
  echo "${VALIDATED}" >&2
  exit 1
}

if [[ "${MODE}" == "--plan" ]]; then
  printf '%s\n' "${VALIDATED}"
  cat <<PLAN
Plan only. No Google Cloud, GitHub, service, job, traffic, database, Qase, or evidence state was read or changed.

The probe will independently verify the hashed zero-traffic deployment and
exact-image database evidence for one API candidate. It then opens a bounded
private verification window: enable the service run.app URL while preserving
private ingress and IAM, attach one zero-percent tag to the exact revision, and
run one temporary Direct VPC Cloud Run job with a dedicated keyless identity.
The job proves unauthenticated rejection, authenticated health and readiness,
and the exact revision header. Cleanup deletes the job, removes the tag,
disables the run.app URL, and requires the normalized service boundary to equal
the pre-probe boundary byte-for-byte before evidence can be written.

It cannot change traffic percentages, public IAM, ingress, runtime template,
secrets, vendors, production, DNS, Replit, or customer data. It cannot promote
traffic. Apply remains separately authorized.

Service: ${SERVICE}
Temporary job: ${JOB}
Runtime identity: ${RUNTIME_SERVICE_ACCOUNT}
Required apply authorization: ${AUTHORIZATION}
PLAN
  exit 0
fi

command -v gcloud >/dev/null 2>&1 || {
  echo "gcloud is required; use the protected keyless GitHub workflow." >&2
  exit 1
}

[[ "${OPERATOR}" == "${CONTROLLER_SERVICE_ACCOUNT}" || "${OPERATOR}" =~ ^[^@[:space:]]+@davidhaile\.com$ ]] || {
  echo "STOP: revision-probe review requires its keyless controller or a davidhaile.com reviewer" >&2
  exit 1
}
[[ "$(gcloud config get-value account 2>/dev/null)" == "${OPERATOR}" ]] || { echo "STOP: wrong Google account" >&2; exit 1; }
[[ "$(gcloud config get-value project 2>/dev/null)" == "${PROJECT_ID}" ]] || { echo "STOP: wrong Google Cloud project" >&2; exit 1; }
[[ "$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')" == "${PROJECT_NUMBER}" ]] || { echo "STOP: wrong project number" >&2; exit 1; }
[[ "$(gcloud projects describe "${PROJECT_ID}" --format='value(parent.id)')" == "${ORGANIZATION_ID}" ]] || { echo "STOP: wrong organization" >&2; exit 1; }
[[ "$(git -C "${ROOT_DIR}" rev-parse HEAD)" == "${EXPECTED_SHA}" ]] || { echo "STOP: source commit does not match the reviewed SHA" >&2; exit 1; }
[[ -z "$(git -C "${ROOT_DIR}" status --porcelain)" ]] || { echo "STOP: source working tree is not clean" >&2; exit 1; }

for label in environment=staging data_classification=synthetic application=samra-pay firebase=enabled; do
  key="${label%%=*}"
  expected="${label#*=}"
  actual="$(gcloud projects describe "${PROJECT_ID}" --format="value(labels.${key})")"
  [[ "${actual}" == "${expected}" ]] || { echo "STOP: project label ${key} drifted" >&2; exit 1; }
done

for api in artifactregistry.googleapis.com compute.googleapis.com iamcredentials.googleapis.com logging.googleapis.com run.googleapis.com sts.googleapis.com; do
  [[ "$(gcloud services list --enabled --project="${PROJECT_ID}" --filter="config.name=${api}" --format='value(config.name)')" == "${api}" ]] || {
    echo "STOP: required API ${api} is not enabled" >&2
    exit 1
  }
done

[[ -f "${ZERO_TRAFFIC_MANIFEST}" && -f "${ZERO_TRAFFIC_HASH}" ]] || {
  echo "STOP: hashed zero-traffic deployment evidence is required" >&2
  exit 1
}
[[ -f "${IMAGE_MANIFEST}" && -f "${IMAGE_HASH}" ]] || {
  echo "STOP: hashed exact-image verification evidence is required" >&2
  exit 1
}

EVIDENCE_SUMMARY="$(node --input-type=module -e '
  import { verifyZeroTrafficDeploymentManifest } from "./deploy/gcp/record-staging-zero-traffic-deployment.mjs";
  import { verifyStagingImageVerificationManifest } from "./deploy/gcp/record-staging-image-verification.mjs";
  const deployment = await verifyZeroTrafficDeploymentManifest(process.argv[1], process.argv[2]);
  const image = await verifyStagingImageVerificationManifest(process.argv[3], process.argv[4]);
  if (deployment.deployment.service !== "samra-api") throw new Error("zero-traffic evidence is not for the API");
  if (deployment.candidateSha !== image.candidateSha || deployment.releaseId !== image.releaseId || deployment.deployment.revision !== image.revision || deployment.publication.imageDigest !== image.imageDigest) throw new Error("probe prerequisites do not describe one candidate");
  if (deployment.deployment.candidateTrafficPercent !== 0 || image.status !== "passed-not-promotion-eligible" || image.promotionEligible !== false) throw new Error("probe prerequisites exceeded their authority");
  process.stdout.write(JSON.stringify({ candidateSha: deployment.candidateSha, revision: deployment.deployment.revision, imageDigest: deployment.publication.imageDigest }));
' "${ZERO_TRAFFIC_MANIFEST}" "${ZERO_TRAFFIC_HASH}" "${IMAGE_MANIFEST}" "${IMAGE_HASH}")"
CANDIDATE_SHA="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).candidateSha)' "${EVIDENCE_SUMMARY}")"
REVISION="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).revision)' "${EVIDENCE_SUMMARY}")"
IMAGE_DIGEST="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).imageDigest)' "${EVIDENCE_SUMMARY}")"
[[ "${CANDIDATE_SHA}" == "${EXPECTED_SHA}" ]] || { echo "STOP: prerequisite evidence does not match source" >&2; exit 1; }
[[ "${REVISION}" == "${SERVICE}-${EXPECTED_SHA:0:12}" ]] || { echo "STOP: candidate revision identity drifted" >&2; exit 1; }
[[ "${IMAGE_DIGEST}" =~ ^${REGION}-docker\.pkg\.dev/${PROJECT_ID}/samra-staging/${SERVICE}@sha256:[0-9a-f]{64}$ ]] || {
  echo "STOP: immutable API image digest is invalid" >&2
  exit 1
}

gcloud artifacts docker images describe "${IMAGE_DIGEST}" --project="${PROJECT_ID}" --format=json >/dev/null
gcloud compute networks describe "${NETWORK}" --project="${PROJECT_ID}" --format='value(name)' | grep -Fx "${NETWORK}" >/dev/null
gcloud compute networks subnets describe "${SUBNET}" --project="${PROJECT_ID}" --region="${REGION}" --format=json | node -e '
  const subnet = JSON.parse(require("fs").readFileSync(0, "utf8"));
  const expectedNetwork = `/projects/${process.argv[1]}/global/networks/${process.argv[2]}`;
  if (subnet.name !== process.argv[3] || !subnet.network.endsWith(expectedNetwork) || subnet.privateIpGoogleAccess !== true) throw new Error("staging probe subnet or Private Google Access drifted");
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

gcloud logging views describe "${LOG_VIEW}" --bucket="${LOG_BUCKET}" --location="${LOG_LOCATION}" --project="${PROJECT_ID}" --format=json | node -e '
  const view = JSON.parse(require("fs").readFileSync(0, "utf8"));
  const expected = `resource.type="cloud_run_job" AND resource.labels.job_name="${process.argv[1]}"`;
  if (view.filter !== expected) throw new Error("revision-probe log view drifted");
' "${JOB}"

TMP_DIR="$(mktemp -d)"
SERVICE_BEFORE="${TMP_DIR}/service-before.json"
SERVICE_AFTER="${TMP_DIR}/service-after.json"
SERVICE_DURING="${TMP_DIR}/service-during.json"
RAW_LOGS="${TMP_DIR}/probe-logs.json"
OBSERVATION="${TMP_DIR}/probe-result.json"
MANIFEST_INPUT="${TMP_DIR}/probe-manifest-input.json"
JOB_CREATED=false
TAG_APPLIED=false
DEFAULT_URL_ENABLED=false
CLOUD_RESTORED=false
TAG=""

restore_cloud_state() {
  local failed=0
  set +e
  if [[ "${JOB_CREATED}" == true ]]; then
    gcloud run jobs delete "${JOB}" --project="${PROJECT_ID}" --region="${REGION}" --quiet >/dev/null 2>&1 || failed=1
    JOB_CREATED=false
  fi
  if [[ "${TAG_APPLIED}" == true ]]; then
    gcloud run services update-traffic "${SERVICE}" --project="${PROJECT_ID}" --region="${REGION}" --remove-tags="${TAG}" --quiet >/dev/null 2>&1 || failed=1
    TAG_APPLIED=false
  fi
  if [[ "${DEFAULT_URL_ENABLED}" == true ]]; then
    gcloud run services update "${SERVICE}" --project="${PROJECT_ID}" --region="${REGION}" --no-default-url --quiet >/dev/null 2>&1 || failed=1
    DEFAULT_URL_ENABLED=false
  fi
  set -e
  [[ "${failed}" -eq 0 ]] || return 1
}

cleanup_on_exit() {
  local prior_status=$?
  trap - EXIT
  if [[ "${CLOUD_RESTORED}" != true ]]; then
    restore_cloud_state || {
      echo "STOP: emergency cleanup could not fully restore the staging service boundary" >&2
      prior_status=1
    }
  fi
  rm -f -- "${SERVICE_BEFORE}" "${SERVICE_AFTER}" "${SERVICE_DURING}" "${RAW_LOGS}" "${OBSERVATION}" "${MANIFEST_INPUT}" "${TMP_DIR}/service.json" "${TMP_DIR}/service-iam.json"
  rmdir -- "${TMP_DIR}" 2>/dev/null || true
  exit "${prior_status}"
}
trap cleanup_on_exit EXIT

write_service_boundary() {
  local output="$1"
  local require_disabled="$2"
  local service_json="${TMP_DIR}/service.json"
  local iam_json="${TMP_DIR}/service-iam.json"
  gcloud run services describe "${SERVICE}" --project="${PROJECT_ID}" --region="${REGION}" --format=json >"${service_json}"
  gcloud run services get-iam-policy "${SERVICE}" --project="${PROJECT_ID}" --region="${REGION}" --format=json >"${iam_json}"
  node -e '
    const crypto = require("crypto");
    const fs = require("fs");
    const service = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const policy = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
    const expectedRevision = process.argv[3];
    const requireDisabled = process.argv[4] === "true";
    const annotations = service.metadata?.annotations || {};
    const disabled = service.spec?.defaultUriDisabled === true || annotations["run.googleapis.com/default-url-disabled"] === "true";
    if (requireDisabled && !disabled) throw new Error("default Cloud Run URL is enabled");
    if (annotations["run.googleapis.com/ingress"] !== "internal-and-cloud-load-balancing") throw new Error("service ingress drifted");
    const publicMembers = new Set(["allUsers", "allAuthenticatedUsers"]);
    if ((policy.bindings || []).some((binding) => (binding.members || []).some((member) => publicMembers.has(member)))) throw new Error("service IAM grants public access");
    const traffic = (service.status?.traffic || []).map((entry) => ({ revision: entry.revisionName, percent: entry.percent ?? 0, tag: entry.tag ?? null })).filter((entry) => entry.revision).sort((a, b) => `${a.revision}:${a.tag || ""}`.localeCompare(`${b.revision}:${b.tag || ""}`));
    if (requireDisabled && traffic.some((entry) => entry.revision === expectedRevision && (entry.percent !== 0 || entry.tag !== null))) throw new Error("candidate revision is receiving traffic or has a tag");
    const spec = structuredClone(service.spec || {});
    delete spec.defaultUriDisabled;
    delete spec.traffic;
    const iam = (policy.bindings || []).map((binding) => ({ role: binding.role, members: [...(binding.members || [])].sort(), condition: binding.condition ?? null })).sort((a, b) => a.role.localeCompare(b.role));
    const canonical = (value) => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;
    const boundary = canonical({ defaultUrlDisabled: disabled, ingress: annotations["run.googleapis.com/ingress"], spec, traffic, iam });
    const serialized = `${JSON.stringify(boundary, null, 2)}\n`;
    fs.writeFileSync(process.argv[5], serialized);
    process.stdout.write(crypto.createHash("sha256").update(serialized).digest("hex"));
  ' "${service_json}" "${iam_json}" "${REVISION}" "${require_disabled}" "${output}"
}

BOUNDARY_BEFORE_SHA="$(write_service_boundary "${SERVICE_BEFORE}" true)"
gcloud run revisions describe "${REVISION}" --project="${PROJECT_ID}" --region="${REGION}" --format=json | node -e '
  const revision = JSON.parse(require("fs").readFileSync(0, "utf8"));
  const ready = (revision.status?.conditions || []).some((condition) => condition.type === "Ready" && condition.status === "True");
  if (!ready) throw new Error("candidate revision is not Ready");
  if (revision.spec?.containers?.[0]?.image !== process.argv[1]) throw new Error("candidate revision image digest drifted");
' "${IMAGE_DIGEST}"

if gcloud run jobs describe "${JOB}" --project="${PROJECT_ID}" --region="${REGION}" >/dev/null 2>&1; then
  echo "STOP: temporary revision-probe job already exists; audit the orphan before retrying" >&2
  exit 1
fi

printf '%s\n' "${VALIDATED}"
cat <<REVIEW
READ-ONLY STAGING REVISION PROBE REVIEW PASS
Source: ${EXPECTED_SHA}
Revision: ${REVISION} (Ready, private, untagged, zero traffic)
Image: exact deployment and image-verification digest verified
Runtime identity: dedicated and keyless; no secret access
Private path: Direct VPC all traffic with Private Google Access
Temporary job: absent
Service boundary: normalized and hashed
REVIEW

if [[ "${MODE}" == "--review" ]]; then
  echo "REVIEW COMPLETE — NO CLOUD, SERVICE, JOB, QASE, OR EVIDENCE CHANGES"
  CLOUD_RESTORED=true
  exit 0
fi

[[ "${OPERATOR}" == "${CONTROLLER_SERVICE_ACCOUNT}" ]] || { echo "STOP: apply requires the keyless revision-probe controller" >&2; exit 1; }
[[ "${SAMRA_GCP_REVISION_PROBE_APPLY}" == "${AUTHORIZATION}" ]] || {
  echo "STOP: apply requires the exact staging revision-probe authorization" >&2
  exit 1
}
[[ "${PROBE_ID}" =~ ^[a-z0-9][a-z0-9-]{0,47}$ ]] || { echo "STOP: unique probe ID is invalid" >&2; exit 1; }
TAG="verify-${PROBE_ID}"
[[ "${TAG}" =~ ^[a-z][a-z0-9-]{0,62}$ ]] || { echo "STOP: temporary revision tag is invalid" >&2; exit 1; }

gcloud run services update "${SERVICE}" --project="${PROJECT_ID}" --region="${REGION}" --default-url --quiet >/dev/null
DEFAULT_URL_ENABLED=true
gcloud run services update-traffic "${SERVICE}" --project="${PROJECT_ID}" --region="${REGION}" --update-tags="${TAG}=${REVISION}" --quiet >/dev/null
TAG_APPLIED=true

SERVICE_AUDIENCE=""
PROBE_URL=""
for _ in $(seq 1 30); do
  URLS="$(gcloud run services describe "${SERVICE}" --project="${PROJECT_ID}" --region="${REGION}" --format=json | node -e '
    const service = JSON.parse(require("fs").readFileSync(0, "utf8"));
    const tag = process.argv[1];
    const baseUrl = service.status?.url || "";
    const probeUrl = (service.status?.traffic || []).find((entry) => entry.tag === tag)?.url || "";
    process.stdout.write(JSON.stringify({ baseUrl, probeUrl }));
  ' "${TAG}")"
  SERVICE_AUDIENCE="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).baseUrl)' "${URLS}")"
  PROBE_URL="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).probeUrl)' "${URLS}")"
  if [[ "${SERVICE_AUDIENCE}" =~ ^https://.+\.run\.app$ && "${PROBE_URL}" =~ ^https://.+\.run\.app$ ]]; then
    break
  fi
  sleep 2
done
[[ "${SERVICE_AUDIENCE}" =~ ^https://.+\.run\.app$ && "${PROBE_URL}" =~ ^https://.+\.run\.app$ ]] || {
  echo "STOP: exact revision or base service URL was not available" >&2
  exit 1
}

write_service_boundary "${SERVICE_DURING}" false >/dev/null
node -e '
  const fs = require("fs");
  const before = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const during = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  const revision = process.argv[3];
  const tag = process.argv[4];
  if (during.defaultUrlDisabled) throw new Error("temporary service URL was not enabled");
  if (JSON.stringify(before.spec) !== JSON.stringify(during.spec) || before.ingress !== during.ingress || JSON.stringify(before.iam) !== JSON.stringify(during.iam)) throw new Error("temporary routing changed runtime, ingress, or IAM");
  const allocation = (entries) => Object.fromEntries([...entries.reduce((map, entry) => map.set(entry.revision, (map.get(entry.revision) || 0) + entry.percent), new Map())].sort());
  if (JSON.stringify(allocation(before.traffic)) !== JSON.stringify(allocation(during.traffic))) throw new Error("temporary routing changed a traffic percentage");
  const expectedTags = [...before.traffic.filter((entry) => entry.tag).map((entry) => entry.tag), tag].sort();
  const actualTags = during.traffic.filter((entry) => entry.tag).map((entry) => entry.tag).sort();
  if (JSON.stringify(actualTags) !== JSON.stringify(expectedTags)) throw new Error("temporary routing tag boundary drifted");
  const candidate = during.traffic.filter((entry) => entry.revision === revision);
  if (!candidate.some((entry) => entry.tag === tag) || candidate.some((entry) => entry.percent !== 0)) throw new Error("candidate tag is absent or receiving traffic");
' "${SERVICE_BEFORE}" "${SERVICE_DURING}" "${REVISION}" "${TAG}"

gcloud run jobs create "${JOB}" --project="${PROJECT_ID}" --region="${REGION}" \
  --image="${IMAGE_DIGEST}" --service-account="${RUNTIME_SERVICE_ACCOUNT}" \
  --network="${NETWORK}" --subnet="${SUBNET}" --vpc-egress=all-traffic \
  --tasks=1 --parallelism=1 --max-retries=0 --task-timeout=5m \
  --set-env-vars="SAMRA_PROBE_URL=${PROBE_URL},SAMRA_SERVICE_AUDIENCE=${SERVICE_AUDIENCE},SAMRA_EXPECTED_REVISION=${REVISION},SAMRA_PROBE_ID=${PROBE_ID},SAMRA_PROBE_TIMEOUT_MS=10000" \
  --command=node --args=./dist/staging-revision-probe.mjs \
  --labels="environment=staging,data_classification=synthetic,application=samra-pay,managed_by=staging-revision-probe,git_sha=${EXPECTED_SHA}" \
  --quiet >/dev/null
JOB_CREATED=true

gcloud run jobs execute "${JOB}" --project="${PROJECT_ID}" --region="${REGION}" --wait --quiet >/dev/null
EXECUTION_NAME="$(gcloud run jobs describe "${JOB}" --project="${PROJECT_ID}" --region="${REGION}" --format='value(status.latestCreatedExecution.name)')"
[[ "${EXECUTION_NAME}" =~ ^[a-z][a-z0-9-]{0,62}$ ]] || { echo "STOP: revision-probe execution identity is invalid" >&2; exit 1; }
gcloud run jobs executions describe "${EXECUTION_NAME}" --project="${PROJECT_ID}" --region="${REGION}" --format=json | node -e '
  const execution = JSON.parse(require("fs").readFileSync(0, "utf8"));
  const completed = (execution.status?.conditions || execution.conditions || []).some((condition) => condition.type === "Completed" && condition.status === "True");
  const succeeded = Number(execution.status?.succeededCount ?? execution.succeededCount ?? 0);
  const failed = Number(execution.status?.failedCount ?? execution.failedCount ?? 0);
  if (!completed || succeeded !== 1 || failed !== 0) throw new Error("revision probe did not complete exactly once");
'

LOG_FILTER="resource.type=\"cloud_run_job\" AND resource.labels.job_name=\"${JOB}\" AND labels.execution_name=\"${EXECUTION_NAME}\" AND logName=\"projects/${PROJECT_ID}/logs/run.googleapis.com%2Fstdout\""
RESULT_SUMMARY=""
for _ in $(seq 1 30); do
  gcloud logging read "${LOG_FILTER}" --bucket="${LOG_BUCKET}" --location="${LOG_LOCATION}" --view="${LOG_VIEW}" --freshness=1h --order=asc --limit=100 --format=json >"${RAW_LOGS}"
  if RESULT_SUMMARY="$(node "${ROOT_DIR}/deploy/gcp/record-staging-revision-probe.mjs" extract-result \
    --logs "${RAW_LOGS}" --execution "${EXECUTION_NAME}" --expected-revision "${REVISION}" --probe-id "${PROBE_ID}" \
    --observation "${OBSERVATION}" --junit "${JUNIT_OUTPUT}" 2>/dev/null)"; then
    break
  fi
  sleep 2
done
[[ -n "${RESULT_SUMMARY}" ]] || { echo "STOP: exact probe result was not available through the restricted log view" >&2; exit 1; }
RESULT_SHA256="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).resultSha256)' "${RESULT_SUMMARY}")"
JUNIT_SHA256="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).junitSha256)' "${RESULT_SUMMARY}")"

restore_cloud_state || {
  echo "STOP: staging service cleanup failed" >&2
  exit 1
}
if gcloud run jobs describe "${JOB}" --project="${PROJECT_ID}" --region="${REGION}" >/dev/null 2>&1; then
  echo "STOP: temporary revision-probe job remains after cleanup" >&2
  exit 1
fi
BOUNDARY_AFTER_SHA="$(write_service_boundary "${SERVICE_AFTER}" true)"
cmp --silent "${SERVICE_BEFORE}" "${SERVICE_AFTER}" || {
  echo "STOP: staging API service boundary was not exactly restored" >&2
  exit 1
}
CLOUD_RESTORED=true

ZERO_TRAFFIC_SHA256="$(cut -d ' ' -f 1 "${ZERO_TRAFFIC_HASH}" | tr '[:upper:]' '[:lower:]')"
IMAGE_VERIFICATION_SHA256="$(cut -d ' ' -f 1 "${IMAGE_HASH}" | tr '[:upper:]' '[:lower:]')"
node -e '
  const fs = require("fs");
  const result = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const input = {
    revision: process.argv[2],
    imageDigest: process.argv[3],
    result,
    probeId: process.argv[4],
    jobExecutionId: process.argv[5],
    runtimeServiceAccount: process.argv[6],
    resultSha256: process.argv[7],
    junitSha256: process.argv[8],
    zeroTrafficDeploymentManifestSha256: process.argv[9],
    imageVerificationManifestSha256: process.argv[10],
    routing: {
      candidateTrafficPercentBefore: 0,
      candidateTrafficPercentDuring: 0,
      candidateTrafficPercentAfter: 0,
      exactRevisionTagTemporarilyApplied: true,
      defaultServiceUrlTemporarilyEnabled: true,
      ingressChanged: false,
      publicAccessChanged: false,
      runtimeTemplateChanged: false,
      boundaryBeforeSha256: process.argv[11],
      boundaryAfterSha256: process.argv[12],
      tagRemoved: true,
      defaultServiceUrlDisabledAfter: true,
    },
    github: {
      repository: process.env.GITHUB_REPOSITORY,
      ref: process.env.GITHUB_REF,
      eventName: process.env.GITHUB_EVENT_NAME,
      workflow: process.env.GITHUB_WORKFLOW,
      workflowPath: ".github/workflows/staging-verification-probe.yml",
      protectedEnvironment: "staging-verification",
      runId: process.env.GITHUB_RUN_ID,
      runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT),
      runUrl: `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`,
      actor: process.env.GITHUB_ACTOR,
    },
    generatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(process.argv[13], `${JSON.stringify(input, null, 2)}\n`);
' "${OBSERVATION}" "${REVISION}" "${IMAGE_DIGEST}" "${PROBE_ID}" "${EXECUTION_NAME}" "${RUNTIME_SERVICE_ACCOUNT}" "${RESULT_SHA256}" "${JUNIT_SHA256}" "${ZERO_TRAFFIC_SHA256}" "${IMAGE_VERIFICATION_SHA256}" "${BOUNDARY_BEFORE_SHA}" "${BOUNDARY_AFTER_SHA}" "${MANIFEST_INPUT}"

node "${ROOT_DIR}/deploy/gcp/record-staging-revision-probe.mjs" build \
  --zero-traffic-manifest "${ZERO_TRAFFIC_MANIFEST}" --zero-traffic-hash "${ZERO_TRAFFIC_HASH}" \
  --image-manifest "${IMAGE_MANIFEST}" --image-hash "${IMAGE_HASH}" \
  --input "${MANIFEST_INPUT}" --output "${EVIDENCE_MANIFEST}" --hash-output "${EVIDENCE_HASH}" >/dev/null
node "${ROOT_DIR}/deploy/gcp/record-staging-revision-probe.mjs" verify \
  --manifest "${EVIDENCE_MANIFEST}" --hash "${EVIDENCE_HASH}" >/dev/null

echo "STAGING REVISION PROBE APPLIED AND VERIFIED"
echo "Source: ${EXPECTED_SHA}"
echo "Revision: ${REVISION}"
echo "Execution: ${EXECUTION_NAME}"
echo "Service authentication: passed"
echo "Exact deployed network path: passed"
echo "Temporary job deleted: yes"
echo "Temporary tag removed: yes"
echo "Default service URL disabled: yes"
echo "Traffic percentages changed: no"
echo "Service boundary restored: yes"
