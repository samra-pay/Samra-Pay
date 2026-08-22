#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MODE="${1:---plan}"

if [[ "${MODE}" != "--plan" && "${MODE}" != "--review" && "${MODE}" != "--apply" && "${MODE}" != "--resume" ]]; then
  echo "Usage: $0 [--plan|--review|--apply|--resume]" >&2
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

if [[ "${MODE}" == "--plan" ]]; then
  printf '%s\n' "${VALIDATED}"
  cat <<'PLAN'
Plan only. No Google Cloud resource was changed and no live cloud state was read.

The reviewed activation will:
  1. require an immutable migration image digest from the exact Git commit;
  2. verify the private Cloud SQL substrate and empty credential boundary;
  3. create one temporary bootstrap user, secret, and private Cloud Run job;
  4. create separate non-superuser migration and runtime PostgreSQL identities;
  5. create one migration secret version and one runtime secret version;
  6. run forward migrations to idempotent completion with the migration identity;
  7. grant runtime SELECT, INSERT, and UPDATE without DELETE or DDL;
  8. remove every bootstrap artifact; and
  9. prove required access succeeds and forbidden access fails.

It will not deploy an application service, route traffic, create public access,
seed customer data, connect a provider, modify Replit, or touch production.
PLAN
  exit 0
fi

command -v gcloud >/dev/null 2>&1 || {
  echo "gcloud is required; run review/apply only from authenticated Google Cloud Shell." >&2
  exit 1
}
command -v openssl >/dev/null 2>&1 || {
  echo "openssl is required for cryptographically secure staging credentials." >&2
  exit 1
}

PROJECT_ID="${SAMRA_GCP_PROJECT_ID}"
ORGANIZATION_ID="${SAMRA_GCP_ORGANIZATION_ID}"
REGION="${SAMRA_GCP_REGION}"
OPERATOR="${SAMRA_GCP_OPERATOR_ACCOUNT}"
EXPECTED_SHA="${SAMRA_GCP_EXPECTED_SHA}"
IMAGE="${SAMRA_GCP_MIGRATION_IMAGE}"
INSTANCE="samra-staging-postgres"
DATABASE="samra_staging"
NETWORK="samra-staging-vpc"
SUBNET="samra-staging-us-east4"
JOB="samra-database-access-bootstrap"
BOOTSTRAP_USER="samra_bootstrap_staging"
BOOTSTRAP_SECRET="samra-staging-bootstrap-database-url"
MIGRATION_SECRET="samra-staging-migration-database-url"
RUNTIME_SECRET="samra-staging-database-url"
MIGRATION_SERVICE_ACCOUNT="samra-migrations-staging@${PROJECT_ID}.iam.gserviceaccount.com"
API_SERVICE_ACCOUNT="samra-api-staging@${PROJECT_ID}.iam.gserviceaccount.com"
IMAGE_BASE="${REGION}-docker.pkg.dev/${PROJECT_ID}/samra-staging/samra-migrations"

ACTIVE_ACCOUNT="$(gcloud config get-value account 2>/dev/null)"
ACTIVE_PROJECT="$(gcloud config get-value project 2>/dev/null)"
PARENT_TYPE="$(gcloud projects describe "${PROJECT_ID}" --format='value(parent.type)')"
PARENT_ID="$(gcloud projects describe "${PROJECT_ID}" --format='value(parent.id)')"
BILLING_ENABLED="$(gcloud billing projects describe "${PROJECT_ID}" --format='value(billingEnabled)')"

[[ "${ACTIVE_ACCOUNT}" == "${OPERATOR}" ]] || { echo "STOP: wrong Google account" >&2; exit 1; }
[[ "${ACTIVE_PROJECT}" == "${PROJECT_ID}" ]] || { echo "STOP: wrong Google Cloud project" >&2; exit 1; }
[[ "${PARENT_TYPE}" == "organization" && "${PARENT_ID}" == "${ORGANIZATION_ID}" ]] || {
  echo "STOP: wrong organization" >&2
  exit 1
}
[[ "${BILLING_ENABLED}" == "True" ]] || { echo "STOP: billing is not enabled" >&2; exit 1; }
[[ "${EXPECTED_SHA}" =~ ^[0-9a-f]{40}$ ]] || { echo "STOP: exact Git SHA is required" >&2; exit 1; }
[[ "$(git -C "${ROOT_DIR}" rev-parse HEAD)" == "${EXPECTED_SHA}" ]] || {
  echo "STOP: source commit does not match the authorized SHA" >&2
  exit 1
}
[[ -z "$(git -C "${ROOT_DIR}" status --porcelain)" ]] || {
  echo "STOP: source working tree is not clean" >&2
  exit 1
}
IMAGE_DIGEST="${IMAGE#"${IMAGE_BASE}@"}"
[[ "${IMAGE}" == "${IMAGE_BASE}@${IMAGE_DIGEST}" && "${IMAGE_DIGEST}" =~ ^sha256:[0-9a-f]{64}$ ]] || {
  echo "STOP: an immutable migration image digest is required" >&2
  exit 1
}

for label in environment=staging data_classification=synthetic application=samra-pay firebase=enabled; do
  key="${label%%=*}"
  expected="${label#*=}"
  actual="$(gcloud projects describe "${PROJECT_ID}" --format="value(labels.${key})")"
  [[ "${actual}" == "${expected}" ]] || { echo "STOP: project label ${key} drifted" >&2; exit 1; }
done

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

PRIVATE_IP="$(gcloud sql instances describe "${INSTANCE}" --project="${PROJECT_ID}" \
  --format=json | node -e '
    const fs = require("fs");
    const instance = JSON.parse(fs.readFileSync(0, "utf8"));
    const addresses = Array.isArray(instance.ipAddresses)
      ? instance.ipAddresses
      : [];
    const address = addresses.find((candidate) => candidate.type === "PRIVATE");
    if (typeof address?.ipAddress === "string") {
      process.stdout.write(address.ipAddress);
    }
  ')"
[[ "${PRIVATE_IP}" =~ ^10\.41\.[0-9]{1,3}\.[0-9]{1,3}$ ]] || {
  echo "STOP: reviewed private database address was not found" >&2
  exit 1
}

secret_exists() {
  gcloud secrets describe "$1" --project="${PROJECT_ID}" >/dev/null 2>&1
}

secret_version_count() {
  if ! secret_exists "$1"; then
    echo 0
    return
  fi
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

RUNTIME_VERSION_COUNT="$(secret_version_count "${RUNTIME_SECRET}")"
MIGRATION_VERSION_COUNT="$(secret_version_count "${MIGRATION_SECRET}")"
BOOTSTRAP_VERSION_COUNT="$(secret_version_count "${BOOTSTRAP_SECRET}")"
BOOTSTRAP_USER_EXISTS=false
if gcloud sql users describe "${BOOTSTRAP_USER}" --project="${PROJECT_ID}" --instance="${INSTANCE}" >/dev/null 2>&1; then
  BOOTSTRAP_USER_EXISTS=true
fi

for count in "${RUNTIME_VERSION_COUNT}" "${MIGRATION_VERSION_COUNT}" "${BOOTSTRAP_VERSION_COUNT}"; do
  [[ "${count}" == "0" || "${count}" == "1" ]] || {
    echo "STOP: credential secret contains multiple enabled versions" >&2
    exit 1
  }
done
[[ "${RUNTIME_VERSION_COUNT}" == "${MIGRATION_VERSION_COUNT}" ]] || {
  echo "STOP: runtime and migration credentials are in different activation states" >&2
  exit 1
}

if [[ "${RUNTIME_VERSION_COUNT}" == "0" && "${BOOTSTRAP_VERSION_COUNT}" == "0" && "${BOOTSTRAP_USER_EXISTS}" == false ]]; then
  SAMRA_GCP_PROJECT_ID="${PROJECT_ID}" \
  SAMRA_GCP_ORGANIZATION_ID="${ORGANIZATION_ID}" \
  SAMRA_GCP_REGION="${REGION}" \
  SAMRA_GCP_OPERATOR_ACCOUNT="${OPERATOR}" \
    bash "${ROOT_DIR}/deploy/gcp/audit-staging-database.sh" >/dev/null
else
  gcloud sql instances describe "${INSTANCE}" --project="${PROJECT_ID}" --format=json | \
    node --input-type=module -e '
      const input = await new Promise((resolve) => { let value = ""; process.stdin.setEncoding("utf8"); process.stdin.on("data", (chunk) => value += chunk); process.stdin.on("end", () => resolve(value)); });
      const { validateObservedSqlInstance } = await import(process.argv[1]);
      validateObservedSqlInstance(JSON.parse(input));
    ' "file://${ROOT_DIR}/deploy/gcp/validate-staging-database.mjs"
  DATABASE_NAMES="$(gcloud sql databases list --project="${PROJECT_ID}" --instance="${INSTANCE}" --format='value(name)')"
  [[ $'\n'"${DATABASE_NAMES}"$'\n' == *$'\n'"${DATABASE}"$'\n'* ]] || {
    echo "STOP: staging database is missing" >&2
    exit 1
  }
fi

if gcloud run jobs describe "${JOB}" --project="${PROJECT_ID}" --region="${REGION}" >/dev/null 2>&1; then
  echo "STOP: temporary database-access job already exists; inspect partial state before retrying" >&2
  exit 1
fi

printf '%s\n' "${VALIDATED}"
cat <<REVIEW
READ-ONLY DATABASE ACCESS REVIEW PASS
Project: ${PROJECT_ID}
Region: ${REGION}
Cloud SQL: ${INSTANCE} (${PRIVATE_IP})
Migration image: exact source tag and immutable digest verified
Runtime/migration secret versions: ${RUNTIME_VERSION_COUNT}/${MIGRATION_VERSION_COUNT}
Bootstrap secret versions: ${BOOTSTRAP_VERSION_COUNT}
Bootstrap database user: ${BOOTSTRAP_USER_EXISTS}
Temporary Cloud Run job: absent
REVIEW

if [[ "${MODE}" == "--review" ]]; then
  echo "REVIEW COMPLETE — NO CLOUD CHANGES"
  exit 0
fi

[[ "${SAMRA_GCP_DATABASE_ACCESS_APPLY:-}" == "AUTHORIZED_STAGING_DATABASE_ACCESS" ]] || {
  echo "Refusing apply without the explicit staging database-access authorization sentinel." >&2
  exit 1
}
if [[ "${MODE}" == "--apply" && !( "${RUNTIME_VERSION_COUNT}" == "0" && "${MIGRATION_VERSION_COUNT}" == "0" && "${BOOTSTRAP_VERSION_COUNT}" == "0" && "${BOOTSTRAP_USER_EXISTS}" == false ) ]]; then
  echo "STOP: apply requires a fresh zero-version credential boundary" >&2
  exit 1
fi
if [[ "${MODE}" == "--resume" && "${BOOTSTRAP_VERSION_COUNT}" == "0" && "${RUNTIME_VERSION_COUNT}" == "1" ]]; then
  [[ "${BOOTSTRAP_USER_EXISTS}" == false ]] || {
    echo "STOP: bootstrap user remains without its recovery secret" >&2
    exit 1
  }
fi

job_exists=false
cleanup_job() {
  if [[ "${job_exists}" == true ]]; then
    gcloud run jobs delete "${JOB}" --project="${PROJECT_ID}" --region="${REGION}" --quiet >/dev/null 2>&1 || true
    job_exists=false
  fi
}
trap cleanup_job EXIT

create_secret_metadata() {
  local secret="$1"
  if ! secret_exists "${secret}"; then
    gcloud secrets create "${secret}" --project="${PROJECT_ID}" \
      --replication-policy=user-managed --locations="${REGION}" \
      --labels=environment=staging,data_classification=synthetic --quiet >/dev/null
  fi
}

grant_secret_access() {
  local secret="$1"
  local service_account="$2"
  gcloud secrets add-iam-policy-binding "${secret}" --project="${PROJECT_ID}" \
    --member="serviceAccount:${service_account}" \
    --role=roles/secretmanager.secretAccessor --condition=None --quiet >/dev/null
}

run_access_job() {
  local service_account="$1"
  local secret="$2"
  local environment_name="$3"
  local action="$4"

  cleanup_job
  gcloud run jobs create "${JOB}" --project="${PROJECT_ID}" --region="${REGION}" \
    --image="${IMAGE}" --service-account="${service_account}" \
    --network="${NETWORK}" --subnet="${SUBNET}" --vpc-egress=private-ranges-only \
    --tasks=1 --parallelism=1 --max-retries=0 --task-timeout=10m \
    --set-secrets="${environment_name}=${secret}:latest" \
    --command=pnpm \
    --args=--filter,@workspace/db,run,staging:access,"${action}" \
    --labels=environment=staging,data_classification=synthetic,application=samra-pay,git-sha="${EXPECTED_SHA}" \
    --quiet >/dev/null
  job_exists=true
  gcloud run jobs execute "${JOB}" --project="${PROJECT_ID}" --region="${REGION}" --wait --quiet >/dev/null
}

run_migration_job() {
  cleanup_job
  gcloud run jobs create "${JOB}" --project="${PROJECT_ID}" --region="${REGION}" \
    --image="${IMAGE}" --service-account="${MIGRATION_SERVICE_ACCOUNT}" \
    --network="${NETWORK}" --subnet="${SUBNET}" --vpc-egress=private-ranges-only \
    --tasks=1 --parallelism=1 --max-retries=0 --task-timeout=10m \
    --set-secrets="DATABASE_URL=${MIGRATION_SECRET}:latest" \
    --command=pnpm --args=db:migrate \
    --labels=environment=staging,data_classification=synthetic,application=samra-pay,git-sha="${EXPECTED_SHA}" \
    --quiet >/dev/null
  job_exists=true
  gcloud run jobs execute "${JOB}" --project="${PROJECT_ID}" --region="${REGION}" --wait --quiet >/dev/null
}

BOOTSTRAP_PASSWORD=""
MIGRATION_PASSWORD=""
RUNTIME_PASSWORD=""
BOOTSTRAP_URL=""
MIGRATION_URL=""
RUNTIME_URL=""

if [[ "${BOOTSTRAP_VERSION_COUNT}" == "0" && "${RUNTIME_VERSION_COUNT}" == "0" ]]; then
  if [[ "${BOOTSTRAP_USER_EXISTS}" == true ]]; then
    gcloud sql users delete "${BOOTSTRAP_USER}" --project="${PROJECT_ID}" --instance="${INSTANCE}" --quiet >/dev/null
  fi
  if secret_exists "${BOOTSTRAP_SECRET}"; then
    gcloud secrets delete "${BOOTSTRAP_SECRET}" --project="${PROJECT_ID}" --quiet >/dev/null
  fi

  BOOTSTRAP_PASSWORD="$(openssl rand -hex 32)"
  MIGRATION_PASSWORD="$(openssl rand -hex 32)"
  RUNTIME_PASSWORD="$(openssl rand -hex 32)"
  BOOTSTRAP_URL="postgresql://${BOOTSTRAP_USER}:${BOOTSTRAP_PASSWORD}@${PRIVATE_IP}:5432/${DATABASE}?sslmode=require&uselibpqcompat=true"
  MIGRATION_URL="postgresql://samra_migrations_staging:${MIGRATION_PASSWORD}@${PRIVATE_IP}:5432/${DATABASE}?sslmode=require&uselibpqcompat=true"
  RUNTIME_URL="postgresql://samra_runtime_staging:${RUNTIME_PASSWORD}@${PRIVATE_IP}:5432/${DATABASE}?sslmode=require&uselibpqcompat=true"

  gcloud sql users create "${BOOTSTRAP_USER}" --project="${PROJECT_ID}" --instance="${INSTANCE}" \
    --password="${BOOTSTRAP_PASSWORD}" --database-roles=cloudsqlsuperuser --quiet >/dev/null
  BOOTSTRAP_USER_EXISTS=true
  create_secret_metadata "${BOOTSTRAP_SECRET}"
  printf '{"bootstrapDatabaseUrl":"%s","migrationDatabaseUrl":"%s","runtimeDatabaseUrl":"%s"}' \
    "${BOOTSTRAP_URL}" "${MIGRATION_URL}" "${RUNTIME_URL}" | \
    gcloud secrets versions add "${BOOTSTRAP_SECRET}" --project="${PROJECT_ID}" --data-file=- >/dev/null
elif [[ "${BOOTSTRAP_VERSION_COUNT}" == "1" ]]; then
  BOOTSTRAP_PAYLOAD="$(gcloud secrets versions access latest --secret="${BOOTSTRAP_SECRET}" --project="${PROJECT_ID}")"
  BOOTSTRAP_PAYLOAD="$(printf '%s' "${BOOTSTRAP_PAYLOAD}" | node -e '
    const fs = require("fs");
    const value = JSON.parse(fs.readFileSync(0, "utf8"));
    for (const key of ["bootstrapDatabaseUrl", "migrationDatabaseUrl", "runtimeDatabaseUrl"]) {
      const url = new URL(value[key]);
      const compatibility = url.searchParams.get("uselibpqcompat");
      if (url.searchParams.get("sslmode") !== "require" || (compatibility !== null && compatibility !== "true")) {
        process.stderr.write("STOP: recoverable bootstrap URL has an invalid TLS policy\n");
        process.exit(1);
      }
      url.searchParams.set("uselibpqcompat", "true");
      value[key] = url.toString();
    }
    process.stdout.write(JSON.stringify(value));
  ')"
  BOOTSTRAP_URL="$(printf '%s' "${BOOTSTRAP_PAYLOAD}" | node -e 'const value = JSON.parse(require("fs").readFileSync(0, "utf8")); process.stdout.write(value.bootstrapDatabaseUrl);')"
  MIGRATION_URL="$(printf '%s' "${BOOTSTRAP_PAYLOAD}" | node -e 'const value = JSON.parse(require("fs").readFileSync(0, "utf8")); process.stdout.write(value.migrationDatabaseUrl);')"
  RUNTIME_URL="$(printf '%s' "${BOOTSTRAP_PAYLOAD}" | node -e 'const value = JSON.parse(require("fs").readFileSync(0, "utf8")); process.stdout.write(value.runtimeDatabaseUrl);')"
  BOOTSTRAP_PASSWORD="$(printf '%s' "${BOOTSTRAP_URL}" | node -e 'process.stdout.write(decodeURIComponent(new URL(require("fs").readFileSync(0, "utf8")).password))')"
  if [[ "${BOOTSTRAP_USER_EXISTS}" == false ]]; then
    gcloud sql users create "${BOOTSTRAP_USER}" --project="${PROJECT_ID}" --instance="${INSTANCE}" \
      --password="${BOOTSTRAP_PASSWORD}" --database-roles=cloudsqlsuperuser --quiet >/dev/null
    BOOTSTRAP_USER_EXISTS=true
  fi
fi

if [[ "${BOOTSTRAP_VERSION_COUNT}" == "1" || "${RUNTIME_VERSION_COUNT}" == "0" ]]; then
  grant_secret_access "${BOOTSTRAP_SECRET}" "${MIGRATION_SERVICE_ACCOUNT}"
  run_access_job "${MIGRATION_SERVICE_ACCOUNT}" "${BOOTSTRAP_SECRET}" \
    SAMRA_DATABASE_ACCESS_BOOTSTRAP_JSON bootstrap
fi

if [[ "${RUNTIME_VERSION_COUNT}" == "0" ]]; then
  create_secret_metadata "${MIGRATION_SECRET}"
  printf '%s' "${MIGRATION_URL}" | \
    gcloud secrets versions add "${MIGRATION_SECRET}" --project="${PROJECT_ID}" --data-file=- >/dev/null
  printf '%s' "${RUNTIME_URL}" | \
    gcloud secrets versions add "${RUNTIME_SECRET}" --project="${PROJECT_ID}" --data-file=- >/dev/null
else
  if [[ "${BOOTSTRAP_VERSION_COUNT}" == "1" ]]; then
    [[ "$(gcloud secrets versions access latest --secret="${MIGRATION_SECRET}" --project="${PROJECT_ID}")" == "${MIGRATION_URL}" ]] || {
      echo "STOP: migration secret does not match the recoverable bootstrap payload" >&2
      exit 1
    }
    [[ "$(gcloud secrets versions access latest --secret="${RUNTIME_SECRET}" --project="${PROJECT_ID}")" == "${RUNTIME_URL}" ]] || {
      echo "STOP: runtime secret does not match the recoverable bootstrap payload" >&2
      exit 1
    }
  fi
fi
grant_secret_access "${MIGRATION_SECRET}" "${MIGRATION_SERVICE_ACCOUNT}"

run_migration_job
run_access_job "${MIGRATION_SERVICE_ACCOUNT}" "${MIGRATION_SECRET}" DATABASE_URL finalize

cleanup_job
if [[ "${BOOTSTRAP_USER_EXISTS}" == true ]]; then
  gcloud sql users delete "${BOOTSTRAP_USER}" --project="${PROJECT_ID}" --instance="${INSTANCE}" --quiet >/dev/null
fi
if secret_exists "${BOOTSTRAP_SECRET}"; then
  gcloud secrets delete "${BOOTSTRAP_SECRET}" --project="${PROJECT_ID}" --quiet >/dev/null
fi

run_access_job "${MIGRATION_SERVICE_ACCOUNT}" "${MIGRATION_SECRET}" DATABASE_URL audit-migration
run_access_job "${API_SERVICE_ACCOUNT}" "${RUNTIME_SECRET}" DATABASE_URL audit-runtime
cleanup_job

BOOTSTRAP_PASSWORD=""
MIGRATION_PASSWORD=""
RUNTIME_PASSWORD=""
BOOTSTRAP_URL=""
MIGRATION_URL=""
RUNTIME_URL=""

echo "STAGING DATABASE ACCESS APPLY PASS — INDEPENDENT POST-AUDIT REQUIRED"
