#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MODE="${1:---plan}"

if [[ "${MODE}" != "--plan" && "${MODE}" != "--review" ]]; then
  echo "Usage: $0 [--plan|--review]" >&2
  exit 2
fi

VALIDATED="$(node "${ROOT_DIR}/deploy/gcp/validate-staging-runtime.mjs" 2>&1)" || {
  echo "${VALIDATED}" >&2
  exit 1
}

if [[ "${MODE}" == "--plan" ]]; then
  printf '%s\n' "${VALIDATED}"
  cat <<'PLAN'
Plan only. No Google Cloud resource was changed and no live cloud state was read.

The reviewed runtime preflight will:
  1. bind review to the exact clean Git commit, project, organization, region, and operator;
  2. verify five full-SHA image tags resolve to immutable digests;
  3. verify all seven dedicated service accounts exist without user-managed keys;
  4. re-run the read-only database-access audit for split secrets and bootstrap cleanup;
  5. verify Auth0 uses public runtime identifiers while Persona and Crossmint
     remain separately gated with pinned future secret-version references;
  6. require an empty target Cloud Run service and job surface; and
  7. report the remaining load-balancer, IAP, service-authentication, observability,
     rollback-owner, and Qase release gates.

This controller cannot deploy, migrate, route traffic, expose an endpoint,
enable a provider, seed data, modify Replit, or touch production.
PLAN
  exit 0
fi

command -v gcloud >/dev/null 2>&1 || {
  echo "gcloud is required; run review only from authenticated Google Cloud Shell." >&2
  exit 1
}

: "${SAMRA_GCP_PROJECT_ID:=samra-pay-staging}"
: "${SAMRA_GCP_ORGANIZATION_ID:=993968777863}"
: "${SAMRA_GCP_REGION:=us-east4}"
: "${SAMRA_GCP_OPERATOR_ACCOUNT:=}"
: "${SAMRA_GCP_EXPECTED_SHA:=}"

PROJECT_ID="${SAMRA_GCP_PROJECT_ID}"
ORGANIZATION_ID="${SAMRA_GCP_ORGANIZATION_ID}"
REGION="${SAMRA_GCP_REGION}"
OPERATOR="${SAMRA_GCP_OPERATOR_ACCOUNT}"
EXPECTED_SHA="${SAMRA_GCP_EXPECTED_SHA}"
REPOSITORY="samra-staging"
IMAGE_BASE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}"

SAMRA_GCP_PROJECT_ID="${PROJECT_ID}" \
SAMRA_GCP_ORGANIZATION_ID="${ORGANIZATION_ID}" \
SAMRA_GCP_REGION="${REGION}" \
SAMRA_GCP_OPERATOR_ACCOUNT="${OPERATOR}" \
SAMRA_GCP_EXPECTED_SHA="${EXPECTED_SHA}" \
node --input-type=module -e '
  const { validateRuntimeReviewEnvironment } = await import(process.argv[1]);
  validateRuntimeReviewEnvironment(process.env);
' "file://${ROOT_DIR}/deploy/gcp/validate-staging-runtime.mjs"

[[ "$(gcloud config get-value account 2>/dev/null)" == "${OPERATOR}" ]] || { echo "STOP: wrong Google account" >&2; exit 1; }
[[ "$(gcloud config get-value project 2>/dev/null)" == "${PROJECT_ID}" ]] || { echo "STOP: wrong Google Cloud project" >&2; exit 1; }
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

gcloud artifacts repositories describe "${REPOSITORY}" --project="${PROJECT_ID}" --location="${REGION}" --format=json | \
  node -e '
    const fs = require("fs");
    const repository = JSON.parse(fs.readFileSync(0, "utf8"));
    if (repository.format !== "DOCKER" || repository.dockerConfig?.immutableTags !== true) {
      process.stderr.write("STOP: immutable Docker repository drifted\n");
      process.exit(1);
    }
  '

resolve_image() {
  local name="$1"
  local image="${IMAGE_BASE}/${name}:${EXPECTED_SHA}"
  local digest
  digest="$(gcloud artifacts docker images describe "${image}" --project="${PROJECT_ID}" --format=json | node -e '
    const fs = require("fs");
    const image = JSON.parse(fs.readFileSync(0, "utf8"));
    const summary = image.image_summary || image.imageSummary || image;
    const value = summary.fully_qualified_digest || summary.fullyQualifiedDigest;
    if (typeof value === "string") process.stdout.write(value);
  ')"
  [[ "${digest}" == "${IMAGE_BASE}/${name}@sha256:"* && "${#digest}" -eq $((${#IMAGE_BASE} + ${#name} + 73)) ]] || {
    echo "STOP: ${name} full-SHA tag does not resolve to an immutable digest" >&2
    exit 1
  }
  printf '%s\n' "${digest}"
}

API_IMAGE="$(resolve_image samra-api)"
CUSTOMER_WEB_IMAGE="$(resolve_image samra-customer-web)"
OPERATIONS_WEB_IMAGE="$(resolve_image samra-operations-web)"
DESIGN_SYSTEM_IMAGE="$(resolve_image samra-design-system-preview)"
MIGRATION_IMAGE="$(resolve_image samra-migrations)"

for account in \
  samra-cloud-build-staging \
  samra-deployer-staging \
  samra-api-staging \
  samra-customer-web-staging \
  samra-operations-web-staging \
  samra-design-system-staging \
  samra-migrations-staging
do
  email="${account}@${PROJECT_ID}.iam.gserviceaccount.com"
  gcloud iam service-accounts describe "${email}" --project="${PROJECT_ID}" >/dev/null
  keys="$(gcloud iam service-accounts keys list --iam-account="${email}" --project="${PROJECT_ID}" --managed-by=user --format='value(name)')"
  [[ -z "${keys}" ]] || { echo "STOP: ${email} has a user-managed key" >&2; exit 1; }
done

gcloud projects get-iam-policy "${PROJECT_ID}" --format=json | \
  node -e '
    const fs = require("fs");
    const policy = JSON.parse(fs.readFileSync(0, "utf8"));
    const project = process.argv[1];
    const expected = {
      [`samra-cloud-build-staging@${project}.iam.gserviceaccount.com`]: [
        "roles/logging.logWriter",
        "roles/serviceusage.serviceUsageConsumer",
      ],
      [`samra-deployer-staging@${project}.iam.gserviceaccount.com`]: [
        "roles/run.admin",
        "roles/serviceusage.serviceUsageConsumer",
      ],
      [`samra-api-staging@${project}.iam.gserviceaccount.com`]: [
        "roles/cloudsql.client",
      ],
      [`samra-migrations-staging@${project}.iam.gserviceaccount.com`]: [
        "roles/cloudsql.client",
      ],
    };
    const actual = {};
    for (const binding of policy.bindings || []) {
      for (const member of binding.members || []) {
        const match = member.match(/^serviceAccount:(samra-[a-z-]+-staging@.+)$/);
        if (!match) continue;
        (actual[match[1]] ||= []).push(binding.role);
      }
    }
    const normalize = (value) => Object.entries(value)
      .map(([member, roles]) => [member, [...roles].sort()])
      .sort(([left], [right]) => left.localeCompare(right));
    if (JSON.stringify(normalize(actual)) !== JSON.stringify(normalize(expected))) {
      process.stderr.write("STOP: Samra project IAM drifted\n");
      process.exit(1);
    }
  ' "${PROJECT_ID}"

gcloud artifacts repositories get-iam-policy "${REPOSITORY}" \
  --project="${PROJECT_ID}" --location="${REGION}" --format=json | \
  node -e '
    const fs = require("fs");
    const policy = JSON.parse(fs.readFileSync(0, "utf8"));
    const project = process.argv[1];
    const expected = {
      "roles/artifactregistry.reader": `serviceAccount:samra-deployer-staging@${project}.iam.gserviceaccount.com`,
      "roles/artifactregistry.writer": `serviceAccount:samra-cloud-build-staging@${project}.iam.gserviceaccount.com`,
    };
    const actual = {};
    for (const binding of policy.bindings || []) {
      const members = (binding.members || []).filter((member) => member.includes("samra-"));
      if (members.length > 0) actual[binding.role] = members.sort().join(",");
    }
    const normalize = (value) => Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right));
    if (JSON.stringify(normalize(actual)) !== JSON.stringify(normalize(expected))) {
      process.stderr.write("STOP: Samra Artifact Registry IAM drifted\n");
      process.exit(1);
    }
  ' "${PROJECT_ID}"

assert_service_account_user() {
  local account="$1"
  local expected_member="$2"
  gcloud iam service-accounts get-iam-policy \
    "${account}@${PROJECT_ID}.iam.gserviceaccount.com" \
    --project="${PROJECT_ID}" --format=json | \
    node -e '
      const fs = require("fs");
      const policy = JSON.parse(fs.readFileSync(0, "utf8"));
      const expected = process.argv[1];
      const members = (policy.bindings || [])
        .filter((binding) => binding.role === "roles/iam.serviceAccountUser")
        .flatMap((binding) => binding.members || [])
        .sort();
      if (JSON.stringify(members) !== JSON.stringify([expected])) {
        process.stderr.write("STOP: service-account impersonation IAM drifted\n");
        process.exit(1);
      }
    ' "${expected_member}"
}

assert_service_account_user samra-cloud-build-staging "user:${OPERATOR}"
assert_service_account_user samra-deployer-staging "user:${OPERATOR}"
for account in \
  samra-api-staging \
  samra-customer-web-staging \
  samra-operations-web-staging \
  samra-design-system-staging \
  samra-migrations-staging
do
  assert_service_account_user "${account}" \
    "serviceAccount:samra-deployer-staging@${PROJECT_ID}.iam.gserviceaccount.com"
done

SAMRA_GCP_PROJECT_ID="${PROJECT_ID}" \
SAMRA_GCP_ORGANIZATION_ID="${ORGANIZATION_ID}" \
SAMRA_GCP_REGION="${REGION}" \
SAMRA_GCP_OPERATOR_ACCOUNT="${OPERATOR}" \
SAMRA_GCP_EXPECTED_SHA="${EXPECTED_SHA}" \
SAMRA_GCP_MIGRATION_IMAGE="${MIGRATION_IMAGE}" \
  bash "${ROOT_DIR}/deploy/gcp/audit-staging-database-access.sh" --review >/dev/null

TARGETS=$'samra-api\nsamra-customer-web\nsamra-operations-web\nsamra-design-system-preview'
EXISTING_SERVICES="$(gcloud run services list --project="${PROJECT_ID}" --region="${REGION}" --format='value(metadata.name)')"
while IFS= read -r target; do
  [[ $'\n'"${EXISTING_SERVICES}"$'\n' != *$'\n'"${target}"$'\n'* ]] || { echo "STOP: target service ${target} already exists" >&2; exit 1; }
done <<< "${TARGETS}"

EXISTING_JOBS="$(gcloud run jobs list --project="${PROJECT_ID}" --region="${REGION}" --format='value(metadata.name)')"
for target in samra-migrations samra-database-access-bootstrap samra-database-access-audit; do
  [[ $'\n'"${EXISTING_JOBS}"$'\n' != *$'\n'"${target}"$'\n'* ]] || { echo "STOP: target or temporary job ${target} already exists" >&2; exit 1; }
done

printf '%s\n' "${VALIDATED}"
cat <<REVIEW
READ-ONLY STAGING RUNTIME PREFLIGHT PASS
Project: ${PROJECT_ID}
Region: ${REGION}
Source: ${EXPECTED_SHA}
Images: 5 exact SHA tags resolved to immutable digests
Identities: 7 dedicated service accounts, zero user-managed keys, exact project/resource IAM
Database access: split-secret metadata and bootstrap cleanup review passed
Target Cloud Run services/jobs: absent

Deployment remains unauthorized. Before an apply controller can exist, approve
the load balancer and IAP policy, service-to-service authentication, logging and
alerts, rollback owner, cost boundary, executable database-access audit, and
critical Qase release evidence. The Operations Portal remains blocked.
REVIEW

printf 'API image: %s\n' "${API_IMAGE}"
printf 'Customer web image: %s\n' "${CUSTOMER_WEB_IMAGE}"
printf 'Operations web image: %s\n' "${OPERATIONS_WEB_IMAGE}"
printf 'Design system image: %s\n' "${DESIGN_SYSTEM_IMAGE}"
printf 'Migration image: %s\n' "${MIGRATION_IMAGE}"
echo "REVIEW COMPLETE — NO CLOUD CHANGES"
