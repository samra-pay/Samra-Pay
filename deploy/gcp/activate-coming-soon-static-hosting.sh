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
migration, form, email collection, analytics, customer authentication, KYC,
wallet, money movement, or vendor integration.

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

curl --fail --silent --show-error --location --max-time 30 "${PUBLIC_URL}/" >/dev/null
HEADERS="$(curl --fail --silent --show-error --head --max-time 30 "${PUBLIC_URL}/")"
for required_header in content-security-policy referrer-policy x-content-type-options permissions-policy; do
  printf '%s' "${HEADERS}" | tr '[:upper:]' '[:lower:]' | grep -q "^${required_header}:" || {
    echo "STOP: deployed site is missing ${required_header}" >&2
    exit 1
  }
done

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
echo "URL: ${PUBLIC_URL}"
echo "Firebase apps created: 0"
echo "Forms, email collection, API routes, database access, and vendor activations: 0"
echo "Cloud Run, Cloud SQL, secret, and customer-bucket resource counts: unchanged"
echo "Squarespace DNS changes: 0"
