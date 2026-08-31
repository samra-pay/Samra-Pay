#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MODE="${1:---plan}"

if [[ "${MODE}" != "--plan" ]]; then
  echo "Usage: $0 [--plan]" >&2
  echo "This decision-gated plan has no review or apply mode." >&2
  exit 2
fi

VALIDATED="$(
  node "${ROOT_DIR}/deploy/gcp/validate-coming-soon-production-data-foundation.mjs" 2>&1
)" || {
  echo "${VALIDATED}" >&2
  exit 1
}

printf '%s\n' "${VALIDATED}"
cat <<'PLAN'
COMING-SOON PRODUCTION DATA FOUNDATION PLAN PASS
Plan cost: USD 0 per month
Cloud state read: no
Cloud or DNS state changed: no

Verified prerequisite:
  - production project, budget, APIs, image repository, five keyless identities,
    exact IAM, and two empty secret metadata records are applied and audited;
  - foundation source: c328ba56b6e15d42e6fd80024160c4e3b7db9c42;
  - secret versions: 0; and
  - Cloud Run and private API invocation remain deferred.

Recommended coming-soon data shape for review:
  - one custom VPC with distinct 10.50.0.0/24 application and
    10.51.0.0/24 Private Services Access ranges;
  - one private-only PostgreSQL 16 Enterprise instance;
  - one dedicated db-custom-1-3840 zonal profile;
  - 10 GB SSD with bounded growth to 100 GB;
  - deletion protection, 14 retained backups, and 7-day point-in-time recovery;
  - one empty samra_production database; and
  - no database user, credential, secret version, migration, or customer row.

This is a cost-conscious coming-soon profile, not a financial-workload
availability claim. Regional HA is required before transaction workloads.

Decisions still required before a separate apply controller is built:
  1. approve a current Google Cloud estimate and a maximum monthly spend;
  2. accept the temporary zonal availability posture for the coming-soon phase;
  3. separately authorize the production data foundation apply; and
  4. approve retention, deletion, access ownership, and privacy before any
     waitlist or customer data is collected.

The USD 25 budget is an alert, not a spending cap. This plan makes no claim
that the proposed infrastructure fits inside USD 25.

PLAN COMPLETE — NO CLOUD, CUSTOMER DATA, DEPLOYMENT, TRAFFIC, OR DNS CHANGES
PLAN
