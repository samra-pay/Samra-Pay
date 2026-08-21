#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MODE="${1:---review}"

if [[ "${MODE}" != "--review" && "${MODE}" != "--execute" ]]; then
  echo "Usage: $0 [--review|--execute]" >&2
  exit 2
fi

: "${SAMRA_GCP_PROJECT_ID:=samra-pay-staging}"
: "${SAMRA_GCP_ORGANIZATION_ID:=614833350075}"
: "${SAMRA_GCP_REGION:=us-east4}"
: "${SAMRA_GCP_OPERATOR_ACCOUNT:=}"
: "${SAMRA_GCP_EXPECTED_SHA:=}"
: "${SAMRA_GCP_MIGRATION_IMAGE:=}"

VALIDATED="$(node "${ROOT_DIR}/deploy/gcp/validate-staging-database-access.mjs" 2>&1)" || {
  echo "${VALIDATED}" >&2
  exit 1
}
command -v gcloud >/dev/null 2>&1 || { echo "gcloud is required" >&2; exit 1; }

PROJECT_ID="${SAMRA_GCP_PROJECT_ID}"
ORGANIZATION_ID="${SAMRA_GCP_ORGANIZATION_ID}"
REGION="${SAMRA_GCP_REGION}"
OPERATOR="${SAMRA_GCP_OPERATOR_ACCOUNT}"
EXPECTED_SHA="${SAMRA_GCP_EXPECTED_SHA}"
IMAGE="${SAMRA_GCP_MIGRATION_IMAGE}"
INSTANCE="samra-staging-postgres"
NETWORK="samra-staging-vpc"
SUBNET="samra-staging-us-east4"
JOB="samra-database-access-audit"
BOOTSTRAP_USER="samra_bootstrap_staging"
BOOTSTRAP_SECRET="samra-staging-bootstrap-database-url"
MIGRATION_SECRET="samra-staging-migration-database-url"
RUNTIME_SECRET="samra-staging-database-url"
MIGRATION_SERVICE_ACCOUNT="samra-migrations-staging@${PROJECT_ID}.iam.gserviceaccount.com"
API_SERVICE_ACCOUNT="samra-api-staging@${PROJECT_ID}.iam.gserviceaccount.com"
IMAGE_BASE="${REGION}-docker.pkg.dev/${PROJECT_ID}/samra-staging/samra-migrations"

[[ "$(gcloud config get-value account 2>/dev/null)" == "${OPERATOR}" ]] || { echo "STOP: wrong Google account" >&2; exit 1; }
[[ "$(gcloud config get-value project 2>/dev/null)" == "${PROJECT_ID}" ]] || { echo "STOP: wrong project" >&2; exit 1; }
[[ "$(gcloud projects describe "${PROJECT_ID}" --format='value(parent.id)')" == "${ORGANIZATION_ID}" ]] || {
  echo "STOP: wrong organization" >&2
  exit 1
}
[[ "${EXPECTED_SHA}" =~ ^[0-9a-f]{40}$ && "$(git -C "${ROOT_DIR}" rev-parse HEAD)" == "${EXPECTED_SHA}" ]] || {
  echo "STOP: fixed source SHA mismatch" >&2
  exit 1
}
[[ -z "$(git -C "${ROOT_DIR}" status --porcelain)" ]] || { echo "STOP: source is not clean" >&2; exit 1; }
IMAGE_DIGEST="${IMAGE#"${IMAGE_BASE}@"}"
[[ "${IMAGE}" == "${IMAGE_BASE}@${IMAGE_DIGEST}" && "${IMAGE_DIGEST}" =~ ^sha256:[0-9a-f]{64}$ ]] || {
  echo "STOP: immutable migration image digest is required" >&2
  exit 1
}
TAGGED_IMAGE="$(gcloud artifacts docker images describe "${IMAGE_BASE}:${EXPECTED_SHA}" \
  --project="${PROJECT_ID}" --format=json | node -e '
    const fs = require("fs");
    const image = JSON.parse(fs.readFileSync(0, "utf8"));
    const summary = image.image_summary || image.imageSummary || image;
    const digest = summary.fully_qualified_digest || summary.fullyQualifiedDigest;
    if (typeof digest === "string") process.stdout.write(digest);
  ')"
[[ "${TAGGED_IMAGE}" == "${IMAGE}" ]] || {
  echo "STOP: the authorized source tag does not resolve to the supplied image digest" >&2
  exit 1
}

if gcloud secrets describe "${BOOTSTRAP_SECRET}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
  echo "STOP: bootstrap secret remains" >&2
  exit 1
fi
if gcloud sql users describe "${BOOTSTRAP_USER}" --project="${PROJECT_ID}" --instance="${INSTANCE}" >/dev/null 2>&1; then
  echo "STOP: bootstrap database user remains" >&2
  exit 1
fi
if gcloud run jobs describe "samra-database-access-bootstrap" --project="${PROJECT_ID}" --region="${REGION}" >/dev/null 2>&1; then
  echo "STOP: bootstrap Cloud Run job remains" >&2
  exit 1
fi
if gcloud run jobs describe "${JOB}" --project="${PROJECT_ID}" --region="${REGION}" >/dev/null 2>&1; then
  echo "STOP: prior audit job remains" >&2
  exit 1
fi

enabled_versions() {
  gcloud secrets versions list "$1" --project="${PROJECT_ID}" \
    --format=json | node -e '
      const fs = require("fs");
      const versions = JSON.parse(fs.readFileSync(0, "utf8"));
      if (!Array.isArray(versions)) {
        process.stderr.write("STOP: secret version inventory is invalid\n");
        process.exit(1);
      }
      process.stdout.write(String(
        versions.filter((version) => version.state === "ENABLED").length,
      ));
    '
}
[[ "$(enabled_versions "${RUNTIME_SECRET}")" == "1" ]] || { echo "STOP: runtime secret version drift" >&2; exit 1; }
[[ "$(enabled_versions "${MIGRATION_SECRET}")" == "1" ]] || { echo "STOP: migration secret version drift" >&2; exit 1; }

assert_secret_metadata() {
  local secret="$1"
  gcloud secrets describe "${secret}" --project="${PROJECT_ID}" --format=json | \
    node -e '
      const fs = require("fs");
      const secret = JSON.parse(fs.readFileSync(0, "utf8"));
      const locations = (secret.replication?.userManaged?.replicas || [])
        .map((replica) => replica.location)
        .sort();
      if (
        locations.length !== 1 ||
        locations[0] !== process.argv[1] ||
        secret.labels?.environment !== "staging" ||
        secret.labels?.data_classification !== "synthetic"
      ) {
        process.stderr.write("STOP: secret metadata or regional replication drift\n");
        process.exit(1);
      }
    ' "${REGION}"
}
assert_secret_metadata "${RUNTIME_SECRET}"
assert_secret_metadata "${MIGRATION_SECRET}"

PROJECT_SECRET_ACCESSORS="$(gcloud projects get-iam-policy "${PROJECT_ID}" --format=json | \
  node -e '
    const fs = require("fs");
    const policy = JSON.parse(fs.readFileSync(0, "utf8"));
    const members = (policy.bindings || [])
      .filter((binding) => binding.role === "roles/secretmanager.secretAccessor")
      .flatMap((binding) => binding.members || [])
      .sort();
    process.stdout.write(members.join("\n"));
  ')"
[[ -z "${PROJECT_SECRET_ACCESSORS}" ]] || {
  echo "STOP: project-level Secret Manager accessor grant bypasses resource IAM" >&2
  exit 1
}

assert_secret_accessor() {
  local secret="$1"
  local expected_member="$2"
  local members
  members="$(gcloud secrets get-iam-policy "${secret}" --project="${PROJECT_ID}" --format=json | \
    node -e '
      const fs = require("fs");
      const policy = JSON.parse(fs.readFileSync(0, "utf8"));
      const members = (policy.bindings || [])
        .filter((binding) => binding.role === "roles/secretmanager.secretAccessor")
        .flatMap((binding) => binding.members || [])
        .sort();
      process.stdout.write(members.join("\n"));
    ')"
  [[ "${members}" == "serviceAccount:${expected_member}" ]] || {
    echo "STOP: ${secret} accessor IAM drift" >&2
    exit 1
  }
}
assert_secret_accessor "${RUNTIME_SECRET}" "${API_SERVICE_ACCOUNT}"
assert_secret_accessor "${MIGRATION_SECRET}" "${MIGRATION_SERVICE_ACCOUNT}"

printf '%s\n' "${VALIDATED}"
cat <<REVIEW
READ-ONLY DATABASE ACCESS POST-AUDIT PASS
Project: ${PROJECT_ID}
Migration image: exact source tag and immutable digest verified
Runtime/migration secret versions: 1/1
Runtime/migration secret metadata: regional synthetic staging
Runtime/migration secret consumers: exact
Project-level Secret Manager accessors: none
Bootstrap user/secret/job: absent
Audit job: absent
REVIEW

if [[ "${MODE}" == "--review" ]]; then
  echo "POST-AUDIT REVIEW COMPLETE — NO CLOUD CHANGES"
  exit 0
fi

[[ "${SAMRA_GCP_DATABASE_ACCESS_AUDIT:-}" == "AUTHORIZED_STAGING_DATABASE_ACCESS_AUDIT" ]] || {
  echo "Refusing executable audit without the explicit authorization sentinel." >&2
  exit 1
}

job_exists=false
cleanup_job() {
  if [[ "${job_exists}" == true ]]; then
    gcloud run jobs delete "${JOB}" --project="${PROJECT_ID}" --region="${REGION}" --quiet >/dev/null 2>&1 || true
    job_exists=false
  fi
}
trap cleanup_job EXIT

run_audit_job() {
  local service_account="$1"
  local secret="$2"
  local action="$3"
  cleanup_job
  gcloud run jobs create "${JOB}" --project="${PROJECT_ID}" --region="${REGION}" \
    --image="${IMAGE}" --service-account="${service_account}" \
    --network="${NETWORK}" --subnet="${SUBNET}" --vpc-egress=private-ranges-only \
    --tasks=1 --parallelism=1 --max-retries=0 --task-timeout=10m \
    --set-secrets="DATABASE_URL=${secret}:latest" \
    --command=pnpm --args=--filter,@workspace/db,run,staging:access,--,"${action}" \
    --labels=environment=staging,data_classification=synthetic,application=samra-pay,git-sha="${EXPECTED_SHA}" \
    --quiet >/dev/null
  job_exists=true
  gcloud run jobs execute "${JOB}" --project="${PROJECT_ID}" --region="${REGION}" --wait --quiet >/dev/null
}

run_audit_job "${MIGRATION_SERVICE_ACCOUNT}" "${MIGRATION_SECRET}" audit-migration
run_audit_job "${API_SERVICE_ACCOUNT}" "${RUNTIME_SECRET}" audit-runtime
cleanup_job

echo "STAGING DATABASE ACCESS INDEPENDENT AUDIT PASS"
