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

Blocked decisions:
  - production project ID and number;
  - production region and non-synthetic data classification;
  - monthly budget and billing owner;
  - public apex domain and canonical apex-or-www choice; and
  - separate authorization to build an apply controller.

PLAN COMPLETE — NO CLOUD OR DNS CHANGES
PLAN
