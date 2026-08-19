#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

: "${SAMRA_GCP_PROJECT_ID:=samra-pay-staging}"
: "${SAMRA_GCP_ORGANIZATION_ID:=614833350075}"
: "${SAMRA_GCP_REGION:=us-east4}"
: "${SAMRA_GCP_OPERATOR_ACCOUNT:=}"

export SAMRA_GCP_PROJECT_ID SAMRA_GCP_ORGANIZATION_ID SAMRA_GCP_REGION
export SAMRA_GCP_OPERATOR_ACCOUNT

VALIDATED="$(node "${ROOT_DIR}/deploy/gcp/validate-staging-database.mjs" 2>&1)" || {
  echo "${VALIDATED}" >&2
  exit 1
}

command -v gcloud >/dev/null 2>&1 || {
  echo "gcloud is required; run this audit from an authenticated Google Cloud Shell." >&2
  exit 1
}

PROJECT_ID="${SAMRA_GCP_PROJECT_ID}"
ORGANIZATION_ID="${SAMRA_GCP_ORGANIZATION_ID}"
REGION="${SAMRA_GCP_REGION}"
OPERATOR="${SAMRA_GCP_OPERATOR_ACCOUNT}"
NETWORK="samra-staging-vpc"
SUBNET="samra-staging-us-east4"
SUBNET_CIDR="10.40.0.0/24"
PSA_RANGE="google-managed-services-samra-staging-vpc"
PSA_ADDRESS="10.41.0.0"
PSA_PREFIX="24"
SERVICE="servicenetworking.googleapis.com"
INSTANCE="samra-staging-postgres"
DATABASE="samra_staging"
SECRET="samra-staging-database-url"

ACTIVE_ACCOUNT="$(gcloud config get-value account 2>/dev/null)"
ACTIVE_PROJECT="$(gcloud config get-value project 2>/dev/null)"
PARENT_TYPE="$(gcloud projects describe "${PROJECT_ID}" --format='value(parent.type)')"
PARENT_ID="$(gcloud projects describe "${PROJECT_ID}" --format='value(parent.id)')"
BILLING_ENABLED="$(gcloud billing projects describe "${PROJECT_ID}" --format='value(billingEnabled)')"

[[ "${ACTIVE_ACCOUNT}" == "${OPERATOR}" ]] || { echo "STOP: wrong Google account" >&2; exit 1; }
[[ "${ACTIVE_PROJECT}" == "${PROJECT_ID}" ]] || { echo "STOP: wrong active project" >&2; exit 1; }
[[ "${PARENT_TYPE}" == "organization" && "${PARENT_ID}" == "${ORGANIZATION_ID}" ]] || {
  echo "STOP: wrong organization" >&2
  exit 1
}
[[ "${BILLING_ENABLED}" == "True" ]] || { echo "STOP: billing is not enabled" >&2; exit 1; }

for label in environment=staging data_classification=synthetic application=samra-pay firebase=enabled; do
  key="${label%%=*}"
  expected="${label#*=}"
  actual="$(gcloud projects describe "${PROJECT_ID}" --format="value(labels.${key})")"
  [[ "${actual}" == "${expected}" ]] || { echo "STOP: project label ${key} drifted" >&2; exit 1; }
done

NETWORK_VALUES="$(gcloud compute networks describe "${NETWORK}" \
  --project="${PROJECT_ID}" --format='value(autoCreateSubnetworks,routingConfig.routingMode)')"
[[ "${NETWORK_VALUES}" == $'False\tREGIONAL' ]] || { echo "STOP: VPC drift detected" >&2; exit 1; }

SUBNET_VALUES="$(gcloud compute networks subnets describe "${SUBNET}" \
  --project="${PROJECT_ID}" --region="${REGION}" \
  --format='value(ipCidrRange,privateIpGoogleAccess,network.basename())')"
[[ "${SUBNET_VALUES}" == "${SUBNET_CIDR}"$'\tTrue\t'"${NETWORK}" ]] || {
  echo "STOP: subnet drift detected" >&2
  exit 1
}

PSA_VALUES="$(gcloud compute addresses describe "${PSA_RANGE}" \
  --project="${PROJECT_ID}" --global \
  --format='value(address,prefixLength,purpose,addressType,network.basename())')"
[[ "${PSA_VALUES}" == "${PSA_ADDRESS}"$'\t'"${PSA_PREFIX}"$'\tVPC_PEERING\tINTERNAL\t'"${NETWORK}" ]] || {
  echo "STOP: private services allocation drift detected" >&2
  exit 1
}

PEERING_RANGES="$(gcloud services vpc-peerings list \
  --project="${PROJECT_ID}" --network="${NETWORK}" --service="${SERVICE}" \
  --format='value(reservedPeeringRanges)')"
[[ "${PEERING_RANGES}" == *"${PSA_RANGE}"* ]] || {
  echo "STOP: private services connection is missing the reviewed allocation" >&2
  exit 1
}

gcloud sql instances describe "${INSTANCE}" --project="${PROJECT_ID}" --format=json | \
  node --input-type=module -e '
    const input = await new Promise((resolve) => {
      let value = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (chunk) => (value += chunk));
      process.stdin.on("end", () => resolve(value));
    });
    const { validateObservedSqlInstance } = await import(process.argv[1]);
    validateObservedSqlInstance(JSON.parse(input));
    console.log("CLOUD SQL INSTANCE PASS");
  ' "file://${ROOT_DIR}/deploy/gcp/validate-staging-database.mjs"

DATABASE_NAMES="$(gcloud sql databases list --project="${PROJECT_ID}" --instance="${INSTANCE}" --format='value(name)')"
[[ $'\n'"${DATABASE_NAMES}"$'\n' == *$'\n'"${DATABASE}"$'\n'* ]] || {
  echo "STOP: staging database is missing" >&2
  exit 1
}

SECRET_VERSION_COUNT="$(gcloud secrets versions list "${SECRET}" \
  --project="${PROJECT_ID}" --format='value(name)' | wc -l | tr -d ' ')"
[[ "${SECRET_VERSION_COUNT}" == "0" ]] || {
  echo "STOP: database secret version was created outside this phase" >&2
  exit 1
}

RUN_SERVICE_COUNT="$(gcloud run services list --project="${PROJECT_ID}" --region="${REGION}" --format='value(metadata.name)' | wc -l | tr -d ' ')"
RUN_JOB_COUNT="$(gcloud run jobs list --project="${PROJECT_ID}" --region="${REGION}" --format='value(metadata.name)' | wc -l | tr -d ' ')"
[[ "${RUN_SERVICE_COUNT}" == "0" && "${RUN_JOB_COUNT}" == "0" ]] || {
  echo "STOP: Cloud Run changed before its approved phase" >&2
  exit 1
}

printf '%s\n' "${VALIDATED}"
cat <<AUDIT
STAGING DATABASE AUDIT PASS
Project: ${PROJECT_ID}
Region: ${REGION}
Network: ${NETWORK} (${SUBNET_CIDR})
Private services allocation: ${PSA_ADDRESS}/${PSA_PREFIX}
Cloud SQL: ${INSTANCE} (PostgreSQL 16, private IP only)
Database: ${DATABASE}
Secret versions: 0
Cloud Run services/jobs: 0/0
AUDIT
