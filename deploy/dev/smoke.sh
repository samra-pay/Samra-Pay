#!/usr/bin/env bash
set -euo pipefail
: "${SAMRA_DEV_IMAGE_TAG:?Use the exact locally built CI commit image tag}"
# Unique CI project/volume; cleanup cannot reset a developer's persistent stack.
SAMRA_DEV_SMOKE_PROJECT="samra-dev-smoke-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}"
compose=(docker compose --project-name "$SAMRA_DEV_SMOKE_PROJECT" -f deploy/dev/compose.yaml)
SAMRA_DEV_SMOKE_OUTPUT=$(mktemp -d)
cleanup() {
  local status=$?
  "${compose[@]}" down --volumes --remove-orphans >/dev/null || true
  rm -rf "$SAMRA_DEV_SMOKE_OUTPUT"
  return "$status"
}
trap cleanup EXIT
"${compose[@]}" config --quiet
"${compose[@]}" up --no-build -d --wait --wait-timeout 180 api
curl --fail --silent http://127.0.0.1:18084/api/readyz >/dev/null
curl --fail --silent http://127.0.0.1:18084/api/v1/accounts > "$SAMRA_DEV_SMOKE_OUTPUT/before.json"
"${compose[@]}" restart api
curl --fail --silent --retry 20 --retry-all-errors --retry-delay 1 http://127.0.0.1:18084/api/readyz >/dev/null
curl --fail --silent http://127.0.0.1:18084/api/v1/accounts > "$SAMRA_DEV_SMOKE_OUTPUT/after.json"
SAMRA_DEV_SMOKE_OUTPUT="$SAMRA_DEV_SMOKE_OUTPUT" node --input-type=module -e '
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const before = JSON.parse(readFileSync(process.env.SAMRA_DEV_SMOKE_OUTPUT + "/before.json", "utf8"));
const after = JSON.parse(readFileSync(process.env.SAMRA_DEV_SMOKE_OUTPUT + "/after.json", "utf8"));
assert.deepEqual(after, before, "Restart must preserve ledger-backed account state");
assert.match(JSON.stringify(before), /425000/, "Expected existing synthetic opening balance");
'
printf '%s\n' 'Local Dev backend migration, seed, readiness and restart passed.'
