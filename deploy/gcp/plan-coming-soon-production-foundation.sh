#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MODE="${1:---plan}"

if [[ "${MODE}" != "--plan" ]]; then
  echo "Usage: $0 [--plan]" >&2
  echo "This controller has no review or apply mode." >&2
  exit 2
fi

VALIDATED="$(
  node "${ROOT_DIR}/deploy/gcp/validate-coming-soon-production-foundation.mjs" 2>&1
)" || {
  echo "${VALIDATED}" >&2
  exit 1
}

printf '%s\n' "${VALIDATED}"
cat <<'PLAN'
COMING-SOON PRODUCTION FOUNDATION PLAN PASS
Plan cost: USD 0 per month
Cloud state read: no
Cloud or DNS state changed: no

Confirmed production boundary:
  - Project ID: samra-pay-production
  - Project number: unassigned until project creation
  - Organization: 614833350075
  - Region: us-east4
  - Data classification: customer-pii
  - Monthly budget alert: USD 25 with 50%, 90%, and 100% notifications
  - Billing account: exact account currently attached to samra-pay-staging
  - Domain: samrapay.com with canonical www.samrapay.com

The USD 25 budget is an alert boundary, not a spending cap.

A later, separately authorized foundation apply would be limited to:
  1. the approved production labels and 15 explicitly reviewed APIs;
  2. one regional immutable samra-production Docker repository;
  3. five distinct keyless build, deploy, web, API, and migration identities;
  4. the reviewed project-level and resource-level IAM boundaries; and
  5. empty runtime and migration database-secret metadata with zero versions.

This plan cannot create or attach the production project, billing, or budget.
It cannot create a VPC, database, secret value, Cloud Run workload, load
balancer, certificate, public endpoint, customer record, waitlist submission,
vendor integration, production data, or Squarespace DNS record.

Remaining blockers:
  - production project creation and assigned project number;
  - same billing account as staging and project-scoped USD 25 budget
    verification; and
  - separate authorization to build an apply controller.

PLAN COMPLETE — NO CLOUD OR DNS CHANGES
PLAN
