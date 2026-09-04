#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
echo "The static-only controller is superseded by the controlled public waitlist release." >&2
exec "${ROOT_DIR}/deploy/gcp/activate-public-waitlist-release.sh" "$@"
