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
COMING-SOON PRODUCTION FOUNDATION RECOVERY PLAN PASS
Plan cost: USD 0 per month
Cloud state read: no
Cloud or DNS state changed: no

Confirmed production boundary:
  - Project ID: samra-pay-production
  - Project number: 382465561715 (independently verified)
  - Organization: 993968777863
  - Region: us-east4
  - Data classification: customer-pii
  - Monthly budget alert: USD 25 with 50%, 90%, and 100% notifications
  - Billing account: verified exact match to samra-pay-staging
  - Budget: verified exact project-scoped USD 25 alert
  - Domain: samrapay.com with canonical www.samrapay.com

The USD 25 budget is an alert boundary, not a spending cap.

Protected preflight evidence:
  - Status: passed, read-only
  - Source: 22e7d644c25d169532018534fa25ce8b6801744a
  - GitHub run: 33334655501
  - Evidence SHA-256: 083bd82259bd54f5fab76ef08f9fab5701a45d59fcd6611d7ea5231b9a66d48b

The foundation was applied and independently verified at source
c328ba56b6e15d42e6fd80024160c4e3b7db9c42. A later, separately authorized
recovery apply would remain limited to:
  1. the approved production labels and 15 explicitly reviewed APIs;
  2. one regional immutable samra-production Docker repository;
  3. five distinct keyless build, deploy, web, API, and migration identities;
  4. the reviewed project-level and resource-level IAM boundaries; and
  5. empty runtime and migration database-secret metadata with zero versions.

This plan cannot modify the verified production project, billing, or budget.
It cannot create a VPC, database, secret value, Cloud Run workload, load
balancer, certificate, public endpoint, customer record, waitlist submission,
vendor integration, production data, or Squarespace DNS record.

The guarded activation controller and independent post-audit are implemented,
but automatic or GitHub-based apply remains disabled.

Next blocker:
  - a separately reviewed and authorized production data foundation apply.

PLAN COMPLETE — NO CLOUD OR DNS CHANGES
PLAN
