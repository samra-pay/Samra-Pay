#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MODE="${1:---plan}"

if [[ "${MODE}" != "--plan" && "${MODE}" != "--review" && "${MODE}" != "--apply" ]]; then
  echo "Usage: $0 [--plan|--review|--apply]" >&2
  exit 2
fi

VALIDATED="$(
  node "${ROOT_DIR}/deploy/gcp/validate-coming-soon-static-hosting.mjs" 2>&1
)" || {
  echo "${VALIDATED}" >&2
  exit 1
}

if [[ "${MODE}" == "--plan" ]]; then
  printf '%s\n' "${VALIDATED}"
  cat <<'PLAN'
COMING-SOON STATIC INFORMATIONAL HOSTING PLAN PASS
Plan cost: USD 0 per month
Cloud or DNS state read: no
Cloud, DNS, API, database, customer-data, and vendor state changed: no

The approved release serves only the reviewed static public bundle through
Firebase Hosting. It deploys no Cloud Run workload, API, database credential,
migration, form, email collection, customer authentication, KYC,
wallet, money movement, or financial vendor integration. The September 2
amendment permits only consent-gated public website GA4 without advertising;
it does not grant standing deployment authorization.

Expected incremental hosting cost is USD 0 within the documented no-cost
storage and transfer allowances. Usage above those allowances is billable. The
existing guarded infrastructure estimate remains USD 81.92 per month and the
USD 100 total-estimate hard stop remains in force.

Apply requires the exact Git SHA, clean tree, production operator and project,
review pass, and AUTHORIZED_COMING_SOON_STATIC_HOSTING sentinel. Custom-domain
DNS is not changed by this controller.

PLAN COMPLETE — NO CLOUD, DNS, DATA, API, OR VENDOR CHANGES
PLAN
  exit 0
fi

for required_command in gcloud firebase node git pnpm curl; do
  command -v "${required_command}" >/dev/null 2>&1 || {
    echo "${required_command} is required; run from authenticated Google Cloud Shell." >&2
    exit 1
  }
done

: "${SAMRA_GCP_PROJECT_ID:=samra-pay-production}"
: "${SAMRA_GCP_PROJECT_NUMBER:=382465561715}"
: "${SAMRA_GCP_ORGANIZATION_ID:=614833350075}"
: "${SAMRA_GCP_OPERATOR_ACCOUNT:=}"
: "${SAMRA_GCP_EXPECTED_SHA:=}"
: "${SAMRA_GCP_STATIC_HOSTING_APPLY:=}"

export SAMRA_GCP_PROJECT_ID
export SAMRA_GCP_PROJECT_NUMBER
export SAMRA_GCP_ORGANIZATION_ID
export SAMRA_GCP_OPERATOR_ACCOUNT
export SAMRA_GCP_EXPECTED_SHA
export SAMRA_GCP_STATIC_HOSTING_APPLY

PROJECT_ID="${SAMRA_GCP_PROJECT_ID}"
OPERATOR="${SAMRA_GCP_OPERATOR_ACCOUNT}"
EXPECTED_SHA="${SAMRA_GCP_EXPECTED_SHA}"
SITE_ID="samra-pay-production"
PUBLIC_URL="https://${SITE_ID}.web.app"
CANONICAL_URL="https://www.samrapay.com"
AUTHORIZATION="AUTHORIZED_COMING_SOON_STATIC_HOSTING"

ACTIVATION_INPUT="$(
  node --input-type=module -e '
    const module = await import(process.argv[1]);
    process.stdout.write(JSON.stringify(module.validateStaticHostingEnvironment(process.env)));
  ' "file://${ROOT_DIR}/deploy/gcp/validate-coming-soon-static-hosting.mjs"
)"

[[ "$(gcloud config get-value account 2>/dev/null)" == "${OPERATOR}" ]] || {
  echo "STOP: wrong Google account" >&2
  exit 1
}
[[ "$(gcloud config get-value project 2>/dev/null)" == "${PROJECT_ID}" ]] || {
  echo "STOP: wrong Google Cloud project" >&2
  exit 1
}
[[ "$(git -C "${ROOT_DIR}" rev-parse HEAD)" == "${EXPECTED_SHA}" ]] || {
  echo "STOP: source commit does not match the reviewed SHA" >&2
  exit 1
}
[[ -z "$(git -C "${ROOT_DIR}" status --porcelain)" ]] || {
  echo "STOP: source working tree is not clean" >&2
  exit 1
}
[[ ! -e "${ROOT_DIR}/.firebaserc" ]] || {
  echo "STOP: project aliases are not allowed for this production release" >&2
  exit 1
}

pnpm --dir "${ROOT_DIR}" --filter @workspace/samra-pay run build
node "${ROOT_DIR}/artifacts/samra-pay/scripts/check-public-build.mjs" \
  "${ROOT_DIR}/artifacts/samra-pay/dist/public"
[[ -z "$(git -C "${ROOT_DIR}" status --porcelain)" ]] || {
  echo "STOP: public build changed tracked release source" >&2
  exit 1
}

PROJECTS_JSON="$(firebase projects:list --json --non-interactive)"
PROJECT_LINKED="$(
  printf '%s' "${PROJECTS_JSON}" | node -e '
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { input += chunk; });
    process.stdin.on("end", () => {
      const parsed = JSON.parse(input);
      const projects = Array.isArray(parsed) ? parsed : (parsed.result ?? []);
      process.stdout.write(String(projects.some((project) => project.projectId === process.argv[1])));
    });
  ' "${PROJECT_ID}"
)"

SITE_PRESENT="false"
if [[ "${PROJECT_LINKED}" == "true" ]]; then
  if SITE_REVIEW="$(firebase hosting:sites:get "${SITE_ID}" --project "${PROJECT_ID}" --json --non-interactive 2>&1)"; then
    SITE_PRESENT="true"
  elif [[ "${SITE_REVIEW}" != *"404"* && "${SITE_REVIEW}" != *"not found"* && "${SITE_REVIEW}" != *"does not exist"* ]]; then
    echo "${SITE_REVIEW}" >&2
    echo "STOP: hosting site state could not be read safely" >&2
    exit 1
  fi
fi

printf '%s\n' "${VALIDATED}"
printf '%s\n' "${ACTIVATION_INPUT}"
echo "READ-ONLY COMING-SOON STATIC HOSTING REVIEW PASS"
echo "Source: ${EXPECTED_SHA}"
echo "Project: ${PROJECT_ID} (${SAMRA_GCP_PROJECT_NUMBER})"
echo "Firebase linkage: $([[ "${PROJECT_LINKED}" == "true" ]] && echo ready || echo missing)"
echo "Hosting site: $([[ "${SITE_PRESENT}" == "true" ]] && echo ready || echo missing)"
echo "Build: public static bundle passed; form and waitlist endpoint absent"
echo "Incremental expected monthly cost: USD 0 within no-cost allowances"
echo "Existing guarded estimate: USD 81.92; total-estimate hard stop: USD 100"

if [[ "${MODE}" == "--review" ]]; then
  echo "REVIEW COMPLETE — NO CLOUD, DNS, DATA, API, OR VENDOR CHANGES"
  exit 0
fi

node --input-type=module -e '
  const module = await import(process.argv[1]);
  module.validateStaticHostingEnvironment(process.env, { requireApplyAuthorization: true });
' "file://${ROOT_DIR}/deploy/gcp/validate-coming-soon-static-hosting.mjs"
[[ "${SAMRA_GCP_STATIC_HOSTING_APPLY}" == "${AUTHORIZATION}" ]] || {
  echo "STOP: invalid static hosting authorization" >&2
  exit 1
}

count_values() {
  awk 'NF { count += 1 } END { print count + 0 }'
}

CLOUD_RUN_SERVICES_BEFORE="$(gcloud run services list --project "${PROJECT_ID}" --platform=managed --format='value(name)' | count_values)"
CLOUD_RUN_JOBS_BEFORE="$(gcloud run jobs list --project "${PROJECT_ID}" --format='value(name)' | count_values)"
SQL_INSTANCES_BEFORE="$(gcloud sql instances list --project "${PROJECT_ID}" --format='value(name)' | count_values)"
SECRETS_BEFORE="$(gcloud secrets list --project "${PROJECT_ID}" --format='value(name)' | count_values)"
BUCKETS_BEFORE="$(gcloud storage buckets list --project "${PROJECT_ID}" --format='value(name)' | count_values)"

if [[ "${PROJECT_LINKED}" != "true" ]]; then
  firebase projects:addfirebase "${PROJECT_ID}" --non-interactive
fi
if [[ "${SITE_PRESENT}" != "true" ]]; then
  if ! firebase hosting:sites:get "${SITE_ID}" --project "${PROJECT_ID}" --json --non-interactive >/dev/null 2>&1; then
    firebase hosting:sites:create "${SITE_ID}" --project "${PROJECT_ID}" --non-interactive
  fi
fi

APPS_JSON="$(firebase apps:list --project "${PROJECT_ID}" --json --non-interactive)"
APP_COUNT="$(
  printf '%s' "${APPS_JSON}" | node -e '
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { input += chunk; });
    process.stdin.on("end", () => {
      const parsed = JSON.parse(input);
      const apps = Array.isArray(parsed) ? parsed : (parsed.result ?? []);
      process.stdout.write(String(apps.length));
    });
  '
)"
[[ "${APP_COUNT}" == "0" ]] || {
  echo "STOP: Firebase app registrations exist outside the static hosting boundary" >&2
  exit 1
}

firebase deploy --only hosting --project "${PROJECT_ID}" --non-interactive \
  -m "Samra Pay static informational release ${EXPECTED_SHA}"

ROUTED_HTML_CACHE_CONTROL="no-cache,no-store,must-revalidate"
IMMUTABLE_CACHE_CONTROL="public,max-age=31536000,immutable"

header_value_for() {
  local url="$1"
  local header_name="$2"
  curl --fail --silent --show-error --head --max-time 30 "${url}" |
    tr -d '\r' |
    awk -F': ' -v name="${header_name}" 'tolower($1) == tolower(name) { print $2; exit }'
}

require_cache_control() {
  local url="$1"
  local expected="$2"
  local actual
  actual="$(header_value_for "${url}" "Cache-Control")"
  [[ "${actual}" == "${expected}" ]] || {
    echo "STOP: ${url} returned Cache-Control '${actual}', expected '${expected}'" >&2
    exit 1
  }
}

sha256_file() {
  node --input-type=module -e '
    import { createHash } from "node:crypto";
    import { readFileSync } from "node:fs";
    process.stdout.write(createHash("sha256").update(readFileSync(process.argv[1])).digest("hex"));
  ' "$1"
}

sha256_url() {
  curl --fail --silent --show-error --location --max-time 30 "$1" |
    node --input-type=module -e '
      import { createHash } from "node:crypto";
      const hash = createHash("sha256");
      process.stdin.on("data", (chunk) => hash.update(chunk));
      process.stdin.on("end", () => process.stdout.write(hash.digest("hex")));
    '
}

IMMUTABLE_ASSET_NAME="$(
  node --input-type=module -e '
    import { readdirSync } from "node:fs";
    const file = readdirSync(process.argv[1])
      .sort()
      .find((name) => /\.(?:avif|webp)$/u.test(name));
    if (!file) process.exit(1);
    process.stdout.write(file);
  ' "${ROOT_DIR}/artifacts/samra-pay/dist/public/assets"
)"
IMMUTABLE_ASSET_PATH="/assets/${IMMUTABLE_ASSET_NAME}"
IMMUTABLE_ASSET_FILE="${ROOT_DIR}/artifacts/samra-pay/dist/public${IMMUTABLE_ASSET_PATH}"
IMMUTABLE_ASSET_SHA256="$(sha256_file "${IMMUTABLE_ASSET_FILE}")"
case "${IMMUTABLE_ASSET_NAME}" in
  *.avif) IMMUTABLE_ASSET_CONTENT_TYPE="image/avif" ;;
  *.webp) IMMUTABLE_ASSET_CONTENT_TYPE="image/webp" ;;
  *)
    echo "STOP: immutable verification asset is not a reviewed image type" >&2
    exit 1
    ;;
esac

verify_public_host() {
  local base_url="$1"
  local headers
  local asset_url
  local content_type
  local remote_sha256

  curl --fail --silent --show-error --location --max-time 30 \
    "${base_url}/?release=${EXPECTED_SHA}" >/dev/null
  headers="$(curl --fail --silent --show-error --head --max-time 30 \
    "${base_url}/?release=${EXPECTED_SHA}")"
  for required_header in content-security-policy referrer-policy x-content-type-options permissions-policy; do
    printf '%s' "${headers}" | tr '[:upper:]' '[:lower:]' | grep -q "^${required_header}:" || {
      echo "STOP: ${base_url} is missing ${required_header}" >&2
      exit 1
    }
  done

  for route in / /features /cards /cards/charge /cards/co-brand /values /faq /blog /privacy /terms; do
    require_cache_control \
      "${base_url}${route}?release=${EXPECTED_SHA}" \
      "${ROUTED_HTML_CACHE_CONTROL}"
  done
  require_cache_control \
    "${base_url}/index.html?release=${EXPECTED_SHA}" \
    "${ROUTED_HTML_CACHE_CONTROL}"

  asset_url="${base_url}${IMMUTABLE_ASSET_PATH}?release=${EXPECTED_SHA}"
  require_cache_control "${asset_url}" "${IMMUTABLE_CACHE_CONTROL}"
  content_type="$(header_value_for "${asset_url}" "Content-Type")"
  [[ "${content_type}" == "${IMMUTABLE_ASSET_CONTENT_TYPE}" ]] || {
    echo "STOP: ${asset_url} returned Content-Type '${content_type}', expected '${IMMUTABLE_ASSET_CONTENT_TYPE}'" >&2
    exit 1
  }
  remote_sha256="$(sha256_url "${asset_url}")"
  [[ "${remote_sha256}" == "${IMMUTABLE_ASSET_SHA256}" ]] || {
    echo "STOP: ${asset_url} does not match the exact deployed asset bytes" >&2
    exit 1
  }
}

verify_public_host "${PUBLIC_URL}"
verify_public_host "${CANONICAL_URL}"

CLOUD_RUN_SERVICES_AFTER="$(gcloud run services list --project "${PROJECT_ID}" --platform=managed --format='value(name)' | count_values)"
CLOUD_RUN_JOBS_AFTER="$(gcloud run jobs list --project "${PROJECT_ID}" --format='value(name)' | count_values)"
SQL_INSTANCES_AFTER="$(gcloud sql instances list --project "${PROJECT_ID}" --format='value(name)' | count_values)"
SECRETS_AFTER="$(gcloud secrets list --project "${PROJECT_ID}" --format='value(name)' | count_values)"
BUCKETS_AFTER="$(gcloud storage buckets list --project "${PROJECT_ID}" --format='value(name)' | count_values)"

[[ "${CLOUD_RUN_SERVICES_AFTER}" == "${CLOUD_RUN_SERVICES_BEFORE}" &&
   "${CLOUD_RUN_JOBS_AFTER}" == "${CLOUD_RUN_JOBS_BEFORE}" &&
   "${SQL_INSTANCES_AFTER}" == "${SQL_INSTANCES_BEFORE}" &&
   "${SECRETS_AFTER}" == "${SECRETS_BEFORE}" &&
   "${BUCKETS_AFTER}" == "${BUCKETS_BEFORE}" ]] || {
  echo "STOP: a non-hosting production resource count changed" >&2
  exit 1
}

echo "COMING-SOON STATIC INFORMATIONAL HOSTING APPLIED AND VERIFIED"
echo "Source: ${EXPECTED_SHA}"
echo "URLs: ${PUBLIC_URL}, ${CANONICAL_URL}"
echo "Firebase apps created: 0"
echo "Route HTML cache: no-store; exact hashed asset bytes: immutable"
echo "Forms, email collection, API routes, database access, and vendor activations: 0"
echo "Cloud Run, Cloud SQL, secret, and customer-bucket resource counts: unchanged"
echo "Squarespace DNS changes: 0"
