#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MODE="${1:---plan}"

if [[ "${MODE}" != "--plan" && "${MODE}" != "--review" && "${MODE}" != "--apply" ]]; then
  echo "Usage: $0 [--plan|--review|--apply]" >&2
  exit 2
fi

: "${SAMRA_GCP_PROJECT_ID:=samra-pay-staging}"
: "${SAMRA_GCP_ORGANIZATION_ID:=993968777863}"
: "${SAMRA_GCP_REGION:=us-east4}"
: "${SAMRA_GCP_OPERATOR_ACCOUNT:=}"

export SAMRA_GCP_PROJECT_ID SAMRA_GCP_ORGANIZATION_ID SAMRA_GCP_REGION
export SAMRA_GCP_OPERATOR_ACCOUNT

VALIDATED="$(node "${ROOT_DIR}/deploy/gcp/validate-staging-database.mjs" 2>&1)" || {
  echo "${VALIDATED}" >&2
  exit 1
}

if [[ "${MODE}" == "--plan" ]]; then
  printf '%s\n' "${VALIDATED}"
  cat <<'PLAN'
Plan only. No Google Cloud resource was changed and no live cloud state was read.

The reviewed apply phase will create, in order:
  1. one custom-mode regional staging VPC and one /24 subnet;
  2. one separate /24 Private Services Access allocation and connection;
  3. one private-IP-only PostgreSQL 16 Cloud SQL Enterprise instance;
  4. deletion protection, seven retained backups, and seven-day PITR; and
  5. one empty samra_staging database.

The non-production instance is deliberately zonal and cost-contained. The apply
will stop on any identity, organization, billing, label, API, CIDR, resource, or
configuration drift. Existing resources are reused only when they match exactly.

This phase will not create credentials, database users, secret versions,
migrations, seed data, Cloud Run workloads, public IPs, customer data, provider
integrations, production resources, or Replit changes.

Run --review from authenticated Cloud Shell before requesting apply authorization.
Review a current Google Cloud cost estimate as part of that approval; the $50
budget alert is a notification and not a spending cap.
PLAN
  exit 0
fi

command -v gcloud >/dev/null 2>&1 || {
  echo "gcloud is required; run review/apply only from authenticated Google Cloud Shell." >&2
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

for api in compute.googleapis.com servicenetworking.googleapis.com sqladmin.googleapis.com secretmanager.googleapis.com; do
  enabled="$(gcloud services list --enabled --project="${PROJECT_ID}" \
    --filter="config.name=${api}" --format='value(config.name)')"
  [[ "${enabled}" == "${api}" ]] || { echo "STOP: required API ${api} is not enabled" >&2; exit 1; }
done

SECRET_VERSION_COUNT="$(gcloud secrets versions list "${SECRET}" \
  --project="${PROJECT_ID}" --format='value(name)' | wc -l | tr -d ' ')"
[[ "${SECRET_VERSION_COUNT}" == "0" ]] || {
  echo "STOP: database secret version exists before the credential phase" >&2
  exit 1
}

SQL_CREATE_HELP="$(CLOUDSDK_CORE_DISABLE_PROMPTS=1 CLOUDSDK_PAGER="" gcloud sql instances create --help 2>&1)"
for flag in --database-version --edition --tier --region --availability-type --storage-type \
  --storage-size --storage-auto-increase --storage-auto-increase-limit --no-assign-ip \
  --network --data-api-access --backup --backup-start-time --backup-location --retained-backups-count \
  --enable-point-in-time-recovery --retained-transaction-log-days --deletion-protection; do
  [[ "${SQL_CREATE_HELP}" == *"${flag}"* ]] || {
    echo "STOP: stable gcloud SQL create does not support required flag ${flag}; no mutation attempted" >&2
    exit 1
  }
done

NETWORK_EXISTS=false
SUBNET_EXISTS=false
PSA_EXISTS=false
PEERING_EXISTS=false
INSTANCE_EXISTS=false
DATABASE_EXISTS=false

if gcloud compute networks describe "${NETWORK}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
  NETWORK_EXISTS=true
  values="$(gcloud compute networks describe "${NETWORK}" --project="${PROJECT_ID}" \
    --format='value(autoCreateSubnetworks,routingConfig.routingMode)')"
  [[ "${values}" == $'False\tREGIONAL' ]] || { echo "STOP: existing VPC does not match" >&2; exit 1; }
fi

if gcloud compute networks subnets describe "${SUBNET}" --project="${PROJECT_ID}" --region="${REGION}" >/dev/null 2>&1; then
  SUBNET_EXISTS=true
  values="$(gcloud compute networks subnets describe "${SUBNET}" --project="${PROJECT_ID}" --region="${REGION}" \
    --format='value(ipCidrRange,privateIpGoogleAccess,network.basename())')"
  [[ "${values}" == "${SUBNET_CIDR}"$'\tTrue\t'"${NETWORK}" ]] || { echo "STOP: existing subnet does not match" >&2; exit 1; }
else
  gcloud compute networks subnets list --project="${PROJECT_ID}" --format=json | \
    node -e '
      const desired = process.argv[1];
      const network = process.argv[2];
      const rows = JSON.parse(require("fs").readFileSync(0, "utf8")).filter((row) => String(row.network ?? "").endsWith(`/${network}`));
      const bounds = (cidr) => { const [ip, p] = cidr.split("/"); const n = ip.split(".").reduce((a,x)=>a*256+Number(x),0); const size=2**(32-Number(p)); return [n,n+size-1]; };
      const [a,b] = bounds(desired);
      const overlap = rows.find((row) => { const [c,d]=bounds(row.ipCidrRange); return a<=d && c<=b; });
      if (overlap) { console.error(`STOP: subnet CIDR overlaps ${overlap.name}`); process.exit(1); }
    ' "${SUBNET_CIDR}" "${NETWORK}"
fi

gcloud compute addresses list --project="${PROJECT_ID}" --global --format=json | \
  node -e '
    const desired = process.argv[1];
    const network = process.argv[2];
    const rows = JSON.parse(require("fs").readFileSync(0, "utf8")).filter((row) => row.address && row.prefixLength && String(row.network ?? "").endsWith(`/${network}`));
    const bounds = (cidr) => { const [ip,p]=cidr.split("/"); const n=ip.split(".").reduce((a,x)=>a*256+Number(x),0); const size=2**(32-Number(p)); return [n,n+size-1]; };
    const [a,b] = bounds(desired);
    const overlap = rows.find((row) => { const [c,d]=bounds(`${row.address}/${row.prefixLength}`); return a<=d && c<=b; });
    if (overlap) { console.error(`STOP: subnet CIDR overlaps allocated range ${overlap.name}`); process.exit(1); }
  ' "${SUBNET_CIDR}" "${NETWORK}"

if gcloud compute addresses describe "${PSA_RANGE}" --project="${PROJECT_ID}" --global >/dev/null 2>&1; then
  PSA_EXISTS=true
  values="$(gcloud compute addresses describe "${PSA_RANGE}" --project="${PROJECT_ID}" --global \
    --format='value(address,prefixLength,purpose,addressType,network.basename())')"
  [[ "${values}" == "${PSA_ADDRESS}"$'\t'"${PSA_PREFIX}"$'\tVPC_PEERING\tINTERNAL\t'"${NETWORK}" ]] || {
    echo "STOP: existing private services allocation does not match" >&2
    exit 1
  }
else
  gcloud compute addresses list --project="${PROJECT_ID}" --global --format=json | \
    node -e '
      const desired = `${process.argv[1]}/${process.argv[2]}`;
      const network = process.argv[3];
      const rows = JSON.parse(require("fs").readFileSync(0, "utf8")).filter((row) => row.address && row.prefixLength && String(row.network ?? "").endsWith(`/${network}`));
      const bounds = (cidr) => { const [ip,p]=cidr.split("/"); const n=ip.split(".").reduce((a,x)=>a*256+Number(x),0); const size=2**(32-Number(p)); return [n,n+size-1]; };
      const [a,b] = bounds(desired);
      const overlap = rows.find((row) => { const [c,d]=bounds(`${row.address}/${row.prefixLength}`); return a<=d && c<=b; });
      if (overlap) { console.error(`STOP: private services CIDR overlaps ${overlap.name}`); process.exit(1); }
    ' "${PSA_ADDRESS}" "${PSA_PREFIX}" "${NETWORK}"
fi

gcloud compute networks subnets list --project="${PROJECT_ID}" --format=json | \
  node -e '
    const desired = `${process.argv[1]}/${process.argv[2]}`;
    const network = process.argv[3];
    const rows = JSON.parse(require("fs").readFileSync(0, "utf8")).filter((row) => String(row.network ?? "").endsWith(`/${network}`));
    const bounds = (cidr) => { const [ip,p]=cidr.split("/"); const n=ip.split(".").reduce((a,x)=>a*256+Number(x),0); const size=2**(32-Number(p)); return [n,n+size-1]; };
    const [a,b] = bounds(desired);
    const overlap = rows.find((row) => { const [c,d]=bounds(row.ipCidrRange); return a<=d && c<=b; });
    if (overlap) { console.error(`STOP: private services CIDR overlaps subnet ${overlap.name}`); process.exit(1); }
  ' "${PSA_ADDRESS}" "${PSA_PREFIX}" "${NETWORK}"

peering_ranges="$(gcloud services vpc-peerings list --project="${PROJECT_ID}" \
  --network="${NETWORK}" --service="${SERVICE}" --format='value(reservedPeeringRanges)' 2>/dev/null || true)"
if [[ -n "${peering_ranges}" ]]; then
  [[ "${peering_ranges}" == *"${PSA_RANGE}"* ]] || { echo "STOP: existing service connection uses an unreviewed range" >&2; exit 1; }
  PEERING_EXISTS=true
fi

if gcloud sql instances describe "${INSTANCE}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
  INSTANCE_EXISTS=true
  gcloud sql instances describe "${INSTANCE}" --project="${PROJECT_ID}" --format=json | \
    node --input-type=module -e '
      const input = await new Promise((resolve) => { let value=""; process.stdin.setEncoding("utf8"); process.stdin.on("data", c => value += c); process.stdin.on("end", () => resolve(value)); });
      const { validateObservedSqlInstance } = await import(process.argv[1]);
      validateObservedSqlInstance(JSON.parse(input));
    ' "file://${ROOT_DIR}/deploy/gcp/validate-staging-database.mjs"
  database_names="$(gcloud sql databases list --project="${PROJECT_ID}" --instance="${INSTANCE}" --format='value(name)')"
  if [[ $'\n'"${database_names}"$'\n' == *$'\n'"${DATABASE}"$'\n'* ]]; then DATABASE_EXISTS=true; fi
fi

printf '%s\n' "${VALIDATED}"
cat <<REVIEW
READ-ONLY DATABASE REVIEW PASS
Network: ${NETWORK} (exists=${NETWORK_EXISTS})
Subnet: ${SUBNET} ${SUBNET_CIDR} (exists=${SUBNET_EXISTS})
Private services allocation: ${PSA_ADDRESS}/${PSA_PREFIX} (exists=${PSA_EXISTS})
Private services connection: exists=${PEERING_EXISTS}
Cloud SQL instance: ${INSTANCE} (exists=${INSTANCE_EXISTS})
Database: ${DATABASE} (exists=${DATABASE_EXISTS})
Secret versions: 0
REVIEW

if [[ "${MODE}" == "--review" ]]; then
  echo "REVIEW COMPLETE — NO CLOUD CHANGES"
  exit 0
fi

if [[ "${SAMRA_GCP_DATABASE_APPLY:-}" != "AUTHORIZED_STAGING_DATABASE" ]]; then
  echo "Refusing apply without the explicit staging database authorization sentinel." >&2
  exit 1
fi

if [[ "${NETWORK_EXISTS}" == false ]]; then
  gcloud compute networks create "${NETWORK}" --project="${PROJECT_ID}" \
    --subnet-mode=custom --bgp-routing-mode=regional --quiet
fi
if [[ "${SUBNET_EXISTS}" == false ]]; then
  gcloud compute networks subnets create "${SUBNET}" --project="${PROJECT_ID}" \
    --network="${NETWORK}" --region="${REGION}" --range="${SUBNET_CIDR}" \
    --enable-private-ip-google-access --quiet
fi
if [[ "${PSA_EXISTS}" == false ]]; then
  gcloud compute addresses create "${PSA_RANGE}" --project="${PROJECT_ID}" --global \
    --addresses="${PSA_ADDRESS}" --prefix-length="${PSA_PREFIX}" \
    --purpose=VPC_PEERING --network="${NETWORK}" --quiet
fi
if [[ "${PEERING_EXISTS}" == false ]]; then
  gcloud services vpc-peerings connect --project="${PROJECT_ID}" \
    --service="${SERVICE}" --network="${NETWORK}" --ranges="${PSA_RANGE}" --quiet
fi
if [[ "${INSTANCE_EXISTS}" == false ]]; then
  gcloud sql instances create "${INSTANCE}" --project="${PROJECT_ID}" \
    --database-version=POSTGRES_16 --edition=enterprise --tier=db-g1-small \
    --region="${REGION}" --availability-type=zonal \
    --storage-type=SSD --storage-size=10 --storage-auto-increase \
    --storage-auto-increase-limit=50 --no-assign-ip \
    --data-api-access=DISALLOW_DATA_API \
    --network="projects/${PROJECT_ID}/global/networks/${NETWORK}" \
    --backup --backup-start-time=07:00 --backup-location=us --retained-backups-count=7 \
    --enable-point-in-time-recovery --retained-transaction-log-days=7 \
    --deletion-protection --quiet
fi
if [[ "${DATABASE_EXISTS}" == false ]]; then
  gcloud sql databases create "${DATABASE}" --project="${PROJECT_ID}" \
    --instance="${INSTANCE}" --charset=UTF8 --quiet
fi

SAMRA_GCP_PROJECT_ID="${PROJECT_ID}" \
SAMRA_GCP_ORGANIZATION_ID="${ORGANIZATION_ID}" \
SAMRA_GCP_REGION="${REGION}" \
SAMRA_GCP_OPERATOR_ACCOUNT="${OPERATOR}" \
  bash "${ROOT_DIR}/deploy/gcp/audit-staging-database.sh"

echo "STAGING DATABASE APPLY COMPLETED — INDEPENDENT POST-AUDIT REQUIRED"
