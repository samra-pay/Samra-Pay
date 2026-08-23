#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MODE="${1:---plan}"
cd "${ROOT_DIR}"

if [[ "${MODE}" != "--plan" && "${MODE}" != "--review" && "${MODE}" != "--apply" ]]; then
  echo "Usage: $0 [--plan|--review|--apply]" >&2
  exit 2
fi

: "${SAMRA_GCP_PROJECT_ID:=samra-pay-staging}"
: "${SAMRA_GCP_PROJECT_NUMBER:=934122615631}"
: "${SAMRA_GCP_ORGANIZATION_ID:=614833350075}"
: "${SAMRA_GCP_REGION:=us-east4}"
: "${SAMRA_GCP_OPERATOR_ACCOUNT:=}"
: "${SAMRA_GCP_CONTROLLER_SHA:=$(git -C "${ROOT_DIR}" rev-parse HEAD)}"
: "${SAMRA_STAGING_TRAFFIC_OPERATION:=promote}"
: "${SAMRA_STAGING_TARGET_SERVICE:=samra-design-system-preview}"
: "${SAMRA_STAGING_CANDIDATE_SHA:=}"
: "${SAMRA_STAGING_TRAFFIC_AUTHORIZATION:=}"
: "${SAMRA_STAGING_ROLLBACK_REASON:=}"
: "${SAMRA_STAGING_ZERO_TRAFFIC_MANIFEST:=}"
: "${SAMRA_STAGING_ZERO_TRAFFIC_HASH:=}"
: "${SAMRA_STAGING_VERIFICATION_MANIFEST:=}"
: "${SAMRA_STAGING_VERIFICATION_HASH:=}"
: "${SAMRA_STAGING_PROMOTION_MANIFEST:=}"
: "${SAMRA_STAGING_PROMOTION_HASH:=}"

PROJECT_ID="${SAMRA_GCP_PROJECT_ID}"
PROJECT_NUMBER="${SAMRA_GCP_PROJECT_NUMBER}"
ORGANIZATION_ID="${SAMRA_GCP_ORGANIZATION_ID}"
REGION="${SAMRA_GCP_REGION}"
OPERATOR="${SAMRA_GCP_OPERATOR_ACCOUNT}"
CONTROLLER_SHA="${SAMRA_GCP_CONTROLLER_SHA}"
OPERATION="${SAMRA_STAGING_TRAFFIC_OPERATION}"
TARGET_SERVICE="${SAMRA_STAGING_TARGET_SERVICE}"
CANDIDATE_SHA="${SAMRA_STAGING_CANDIDATE_SHA}"
AUTHORIZATION="${SAMRA_STAGING_TRAFFIC_AUTHORIZATION}"
ROLLBACK_REASON="${SAMRA_STAGING_ROLLBACK_REASON}"
ZERO_TRAFFIC_MANIFEST="${SAMRA_STAGING_ZERO_TRAFFIC_MANIFEST}"
ZERO_TRAFFIC_HASH="${SAMRA_STAGING_ZERO_TRAFFIC_HASH}"
VERIFICATION_MANIFEST="${SAMRA_STAGING_VERIFICATION_MANIFEST}"
VERIFICATION_HASH="${SAMRA_STAGING_VERIFICATION_HASH}"
PROMOTION_SOURCE_MANIFEST="${SAMRA_STAGING_PROMOTION_MANIFEST}"
PROMOTION_SOURCE_HASH="${SAMRA_STAGING_PROMOTION_HASH}"
PROMOTION_IDENTITY="samra-github-promoter-staging@${PROJECT_ID}.iam.gserviceaccount.com"
ROLLBACK_IDENTITY="samra-github-rollback-staging@${PROJECT_ID}.iam.gserviceaccount.com"
OUTPUT_DIR="${ROOT_DIR}/artifacts/staging-release"
TRAFFIC_BEFORE="${OUTPUT_DIR}/staging-traffic-before-${TARGET_SERVICE}.json"
TRAFFIC_AFTER="${OUTPUT_DIR}/staging-traffic-after-${TARGET_SERVICE}.json"
PROMOTION_OUTPUT="${OUTPUT_DIR}/staging-traffic-promotion.json"
PROMOTION_HASH_OUTPUT="${OUTPUT_DIR}/staging-traffic-promotion.sha256"
ROLLBACK_OUTPUT="${OUTPUT_DIR}/staging-traffic-rollback.json"
ROLLBACK_HASH_OUTPUT="${OUTPUT_DIR}/staging-traffic-rollback.sha256"

VALIDATED="$(node "${ROOT_DIR}/deploy/gcp/validate-staging-traffic-control.mjs" 2>&1)" || {
  echo "${VALIDATED}" >&2
  exit 1
}

if [[ "${MODE}" == "--plan" ]]; then
  printf '%s\n' "${VALIDATED}"
  cat <<PLAN
Plan only. No Google Cloud, GitHub, traffic, vendor, database, or Replit state was read or changed.

The traffic controller can promote one independently verified zero-traffic
revision to exactly 100 percent, or roll exactly 100 percent back to the prior
immutable revision recorded in a hashed promotion manifest. Promotion requires
one existing healthy 100-percent revision, a hashed zero-traffic deployment,
seven passing staging checks, and a Qase staging run. A controller failure after
traffic mutation triggers an automatic best-effort rollback to the recorded
prior revision.

First activation, partial traffic, latest aliases, traffic tags, rebuilding for
rollback, public IAM, runtime-template or service-IAM changes, vendor
activation, real customer data, production, and Replit changes are prohibited.

Operation: ${OPERATION}
Service: ${TARGET_SERVICE}
PLAN
  exit 0
fi

[[ "${OPERATION}" == "promote" || "${OPERATION}" == "rollback" ]] || {
  echo "STOP: operation must be promote or rollback" >&2
  exit 1
}
case "${TARGET_SERVICE}" in
  samra-api|samra-customer-web|samra-design-system-preview) ;;
  *) echo "STOP: target service is not allowlisted" >&2; exit 1 ;;
esac
[[ "${CONTROLLER_SHA}" =~ ^[0-9a-f]{40}$ ]] || { echo "STOP: controller SHA is invalid" >&2; exit 1; }
[[ "${CANDIDATE_SHA}" =~ ^[0-9a-f]{40}$ ]] || { echo "STOP: candidate SHA is invalid" >&2; exit 1; }

command -v gcloud >/dev/null 2>&1 || {
  echo "gcloud is required; run review or apply from protected federated GitHub Actions." >&2
  exit 1
}

[[ "$(gcloud config get-value account 2>/dev/null)" == "${OPERATOR}" ]] || { echo "STOP: wrong Google account" >&2; exit 1; }
[[ "$(gcloud config get-value project 2>/dev/null)" == "${PROJECT_ID}" ]] || { echo "STOP: wrong Google Cloud project" >&2; exit 1; }
[[ "$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')" == "${PROJECT_NUMBER}" ]] || { echo "STOP: wrong project number" >&2; exit 1; }
[[ "$(gcloud projects describe "${PROJECT_ID}" --format='value(parent.id)')" == "${ORGANIZATION_ID}" ]] || { echo "STOP: wrong organization" >&2; exit 1; }
[[ "$(git -C "${ROOT_DIR}" rev-parse HEAD)" == "${CONTROLLER_SHA}" ]] || { echo "STOP: controller source SHA changed" >&2; exit 1; }
[[ -z "$(git -C "${ROOT_DIR}" status --porcelain --untracked-files=no)" ]] || { echo "STOP: controller source working tree is not clean" >&2; exit 1; }

for label in environment=staging data_classification=synthetic application=samra-pay firebase=enabled; do
  key="${label%%=*}"
  expected="${label#*=}"
  actual="$(gcloud projects describe "${PROJECT_ID}" --format="value(labels.${key})")"
  [[ "${actual}" == "${expected}" ]] || { echo "STOP: project label ${key} drifted" >&2; exit 1; }
done

for api in iamcredentials.googleapis.com run.googleapis.com sts.googleapis.com; do
  [[ "$(gcloud services list --enabled --project="${PROJECT_ID}" --filter="config.name=${api}" --format='value(config.name)')" == "${api}" ]] || {
    echo "STOP: required API ${api} is not enabled" >&2
    exit 1
  }
done

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
  if ((policy.bindings || []).some((binding) => (binding.members || []).some((member) => publicMembers.has(member)))) throw new Error("service IAM grants public access");
'

write_traffic_snapshot() {
  local output="$1"
  mkdir -p "$(dirname "${output}")"
  gcloud run services describe "${TARGET_SERVICE}" --project="${PROJECT_ID}" --region="${REGION}" --format=json | node -e '
    const service = JSON.parse(require("fs").readFileSync(0, "utf8"));
    const traffic = (service.status?.traffic || []).map((entry) => ({
      revision: entry.revisionName,
      percent: entry.percent ?? 0,
      tag: entry.tag ?? null,
      latestRevision: entry.latestRevision === true,
    })).filter((entry) => entry.revision).sort((a, b) => a.revision.localeCompare(b.revision));
    process.stdout.write(`${JSON.stringify(traffic, null, 2)}\n`);
  ' >"${output}"
}

assert_single_revision_traffic() {
  local snapshot="$1"
  local revision="$2"
  local label="$3"
  node -e '
    const traffic = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    if (traffic.length === 0) throw new Error(`${process.argv[3]} has no active revision; first activation requires separate approval`);
    if (traffic.length !== 1 || traffic[0].revision !== process.argv[2] || traffic[0].percent !== 100 || traffic[0].tag !== null || traffic[0].latestRevision === true) {
      throw new Error(`${process.argv[3]} is not one exact untagged 100-percent revision`);
    }
  ' "${snapshot}" "${revision}" "${label}"
}

assert_revision_ready() {
  local revision="$1"
  gcloud run revisions describe "${revision}" --project="${PROJECT_ID}" --region="${REGION}" --format=json | node -e '
    const revision = JSON.parse(require("fs").readFileSync(0, "utf8"));
    const ready = (revision.status?.conditions || []).some((condition) => condition.type === "Ready" && condition.status === "True");
    if (!ready) throw new Error("target revision is not Ready");
  '
}

CANDIDATE_REVISION="${TARGET_SERVICE}-${CANDIDATE_SHA:0:12}"
PRIOR_REVISION=""

if [[ "${OPERATION}" == "promote" ]]; then
  [[ -f "${ZERO_TRAFFIC_MANIFEST}" && -f "${ZERO_TRAFFIC_HASH}" ]] || { echo "STOP: hashed zero-traffic deployment evidence is required" >&2; exit 1; }
  [[ -f "${VERIFICATION_MANIFEST}" && -f "${VERIFICATION_HASH}" ]] || { echo "STOP: hashed pre-promotion verification evidence is required" >&2; exit 1; }
  PROMOTION_INPUT="$(node --input-type=module -e '
    import { verifyZeroTrafficDeploymentManifest } from "./deploy/gcp/record-staging-zero-traffic-deployment.mjs";
    import { verifyVerificationManifest } from "./deploy/gcp/record-staging-traffic-control.mjs";
    const deployment = await verifyZeroTrafficDeploymentManifest(process.argv[1], process.argv[2]);
    const verification = await verifyVerificationManifest(process.argv[3], process.argv[4]);
    if (deployment.candidateSha !== process.argv[5] || deployment.deployment.service !== process.argv[6] || deployment.deployment.revision !== process.argv[7]) throw new Error("zero-traffic deployment does not match the requested candidate");
    if (verification.candidateSha !== process.argv[5] || verification.service !== process.argv[6] || verification.revision !== process.argv[7]) throw new Error("verification does not match the requested candidate");
    process.stdout.write(JSON.stringify({ imageDigest: deployment.publication.imageDigest }));
  ' "${ZERO_TRAFFIC_MANIFEST}" "${ZERO_TRAFFIC_HASH}" "${VERIFICATION_MANIFEST}" "${VERIFICATION_HASH}" "${CANDIDATE_SHA}" "${TARGET_SERVICE}" "${CANDIDATE_REVISION}")"
  EXPECTED_IMAGE="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).imageDigest)' "${PROMOTION_INPUT}")"
  assert_revision_ready "${CANDIDATE_REVISION}"
  [[ "$(gcloud run revisions describe "${CANDIDATE_REVISION}" --project="${PROJECT_ID}" --region="${REGION}" --format='value(spec.containers[0].image)')" == "${EXPECTED_IMAGE}" ]] || { echo "STOP: candidate image does not match zero-traffic evidence" >&2; exit 1; }
  write_traffic_snapshot "${TRAFFIC_BEFORE}"
  PRIOR_REVISION="$(node -e '
    const traffic = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    if (traffic.length === 0) throw new Error("first activation requires separate approval");
    if (traffic.length !== 1 || traffic[0].percent !== 100 || traffic[0].tag !== null || traffic[0].latestRevision === true) throw new Error("current traffic is not one exact untagged 100-percent revision");
    if (traffic[0].revision === process.argv[2]) throw new Error("candidate is already receiving 100 percent traffic");
    process.stdout.write(traffic[0].revision);
  ' "${TRAFFIC_BEFORE}" "${CANDIDATE_REVISION}")"
  assert_revision_ready "${PRIOR_REVISION}"
  EXPECTED_IDENTITY="${PROMOTION_IDENTITY}"
  REQUIRED_AUTHORIZATION="AUTHORIZED_STAGING_TRAFFIC_PROMOTION"
else
  [[ -f "${PROMOTION_SOURCE_MANIFEST}" && -f "${PROMOTION_SOURCE_HASH}" ]] || { echo "STOP: hashed promotion evidence is required" >&2; exit 1; }
  ROLLBACK_INPUT="$(node --input-type=module -e '
    import { verifyPromotionManifest } from "./deploy/gcp/record-staging-traffic-control.mjs";
    const promotion = await verifyPromotionManifest(process.argv[1], process.argv[2]);
    if (promotion.candidateSha !== process.argv[3] || promotion.service !== process.argv[4]) throw new Error("promotion evidence does not match the requested rollback");
    process.stdout.write(JSON.stringify({ candidateRevision: promotion.candidateRevision, priorRevision: promotion.rollbackTarget.revision }));
  ' "${PROMOTION_SOURCE_MANIFEST}" "${PROMOTION_SOURCE_HASH}" "${CANDIDATE_SHA}" "${TARGET_SERVICE}")"
  CANDIDATE_REVISION="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).candidateRevision)' "${ROLLBACK_INPUT}")"
  PRIOR_REVISION="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).priorRevision)' "${ROLLBACK_INPUT}")"
  [[ "${#ROLLBACK_REASON}" -ge 12 && "${#ROLLBACK_REASON}" -le 500 ]] || { echo "STOP: a 12-to-500-character rollback reason is required" >&2; exit 1; }
  assert_revision_ready "${PRIOR_REVISION}"
  write_traffic_snapshot "${TRAFFIC_BEFORE}"
  assert_single_revision_traffic "${TRAFFIC_BEFORE}" "${CANDIDATE_REVISION}" "Traffic before rollback"
  EXPECTED_IDENTITY="${ROLLBACK_IDENTITY}"
  REQUIRED_AUTHORIZATION="AUTHORIZED_STAGING_TRAFFIC_ROLLBACK"
fi

echo "READ-ONLY STAGING TRAFFIC CONTROL REVIEW PASS"
echo "Controller source: ${CONTROLLER_SHA}"
echo "Candidate source: ${CANDIDATE_SHA}"
echo "Operation: ${OPERATION}"
echo "Service: ${TARGET_SERVICE}"
echo "Candidate revision: ${CANDIDATE_REVISION}"
echo "Recorded rollback target: ${PRIOR_REVISION}"
echo "First activation: prohibited"
echo "Traffic mutation: none"

if [[ "${MODE}" == "--review" ]]; then
  echo "REVIEW COMPLETE — NO CLOUD OR GITHUB CHANGES"
  exit 0
fi

[[ "${OPERATOR}" == "${EXPECTED_IDENTITY}" ]] || { echo "STOP: apply requires the operation-specific keyless identity" >&2; exit 1; }
[[ "${AUTHORIZATION}" == "${REQUIRED_AUTHORIZATION}" ]] || { echo "STOP: exact traffic authorization is missing" >&2; exit 1; }

MUTATION_STARTED=false
PROMOTION_RECORDED=false
automatic_rollback() {
  local exit_code=$?
  if [[ "${OPERATION}" == "promote" && "${MUTATION_STARTED}" == true && "${PROMOTION_RECORDED}" == false && -n "${PRIOR_REVISION}" ]]; then
    echo "Promotion control failed after traffic mutation; starting automatic rollback to ${PRIOR_REVISION}." >&2
    gcloud run services update-traffic "${TARGET_SERVICE}" --project="${PROJECT_ID}" --region="${REGION}" --to-revisions="${PRIOR_REVISION}=100" --clear-tags --quiet || true
    write_traffic_snapshot "${TRAFFIC_AFTER}" || true
  fi
  exit "${exit_code}"
}
trap automatic_rollback ERR

MUTATION_STARTED=true
if [[ "${OPERATION}" == "promote" ]]; then
  gcloud run services update-traffic "${TARGET_SERVICE}" --project="${PROJECT_ID}" --region="${REGION}" --to-revisions="${CANDIDATE_REVISION}=100" --clear-tags --quiet
  write_traffic_snapshot "${TRAFFIC_AFTER}"
  assert_single_revision_traffic "${TRAFFIC_AFTER}" "${CANDIDATE_REVISION}" "Traffic after promotion"
  node "${ROOT_DIR}/deploy/gcp/record-staging-traffic-control.mjs" promote \
    --zero-traffic-manifest "${ZERO_TRAFFIC_MANIFEST}" \
    --zero-traffic-hash "${ZERO_TRAFFIC_HASH}" \
    --verification-manifest "${VERIFICATION_MANIFEST}" \
    --verification-hash "${VERIFICATION_HASH}" \
    --controller-sha "${CONTROLLER_SHA}" \
    --prior-revision "${PRIOR_REVISION}" \
    --traffic-before "${TRAFFIC_BEFORE}" \
    --traffic-after "${TRAFFIC_AFTER}" \
    --operator-identity "${OPERATOR}" \
    --github-run-id "${GITHUB_RUN_ID:?GitHub run ID is required}" \
    --github-run-attempt "${GITHUB_RUN_ATTEMPT:?GitHub run attempt is required}" \
    --github-actor "${GITHUB_ACTOR:?GitHub actor is required}" \
    --output "${PROMOTION_OUTPUT}" \
    --hash-output "${PROMOTION_HASH_OUTPUT}"
  PROMOTION_RECORDED=true
  echo "STAGING TRAFFIC PROMOTION APPLIED AND RECORDED"
  echo "Rollback target: ${PRIOR_REVISION}"
else
  gcloud run services update-traffic "${TARGET_SERVICE}" --project="${PROJECT_ID}" --region="${REGION}" --to-revisions="${PRIOR_REVISION}=100" --clear-tags --quiet
  write_traffic_snapshot "${TRAFFIC_AFTER}"
  assert_single_revision_traffic "${TRAFFIC_AFTER}" "${PRIOR_REVISION}" "Traffic after rollback"
  node "${ROOT_DIR}/deploy/gcp/record-staging-traffic-control.mjs" rollback \
    --promotion-manifest "${PROMOTION_SOURCE_MANIFEST}" \
    --promotion-hash "${PROMOTION_SOURCE_HASH}" \
    --controller-sha "${CONTROLLER_SHA}" \
    --reason "${ROLLBACK_REASON}" \
    --traffic-before "${TRAFFIC_BEFORE}" \
    --traffic-after "${TRAFFIC_AFTER}" \
    --operator-identity "${OPERATOR}" \
    --github-run-id "${GITHUB_RUN_ID:?GitHub run ID is required}" \
    --github-run-attempt "${GITHUB_RUN_ATTEMPT:?GitHub run attempt is required}" \
    --github-actor "${GITHUB_ACTOR:?GitHub actor is required}" \
    --output "${ROLLBACK_OUTPUT}" \
    --hash-output "${ROLLBACK_HASH_OUTPUT}"
  echo "STAGING TRAFFIC ROLLBACK APPLIED AND RECORDED"
  echo "Post-rollback verification: required and pending"
fi

trap - ERR
echo "Public access changed: no"
echo "Runtime template or service IAM changed: no"
echo "Vendor activated: no"
echo "Rebuild executed: no"
