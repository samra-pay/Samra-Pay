#!/usr/bin/env bash

set -Eeuo pipefail

: "${SAMRA_CONTAINER_IMAGE_TAG:?SAMRA_CONTAINER_IMAGE_TAG is required}"
: "${DATABASE_URL:?DATABASE_URL is required}"

SAMRA_SMOKE_ROOT="${SAMRA_CONTAINER_SMOKE_ARTIFACTS:-artifacts/container-smoke}"
SAMRA_SMOKE_PREFIX="samra-portability-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}"
SAMRA_API_CONTAINER="${SAMRA_SMOKE_PREFIX}-api"
SAMRA_CUSTOMER_CONTAINER="${SAMRA_SMOKE_PREFIX}-customer"
SAMRA_OPERATIONS_CONTAINER="${SAMRA_SMOKE_PREFIX}-operations"
SAMRA_DESIGN_CONTAINER="${SAMRA_SMOKE_PREFIX}-design"
SAMRA_API_PORT=18080
SAMRA_CUSTOMER_PORT=18081
SAMRA_OPERATIONS_PORT=18082
SAMRA_DESIGN_PORT=18083

mkdir -p "${SAMRA_SMOKE_ROOT}"

cleanup() {
  local exit_status=$?
  local container
  for container in \
    "${SAMRA_API_CONTAINER}" \
    "${SAMRA_CUSTOMER_CONTAINER}" \
    "${SAMRA_OPERATIONS_CONTAINER}" \
    "${SAMRA_DESIGN_CONTAINER}"; do
    if docker container inspect "${container}" >/dev/null 2>&1; then
      docker logs "${container}" >"${SAMRA_SMOKE_ROOT}/${container}.log" 2>&1 || true
      docker rm --force "${container}" >/dev/null 2>&1 || true
    fi
  done

  if [[ ${exit_status} -eq 0 ]]; then
    printf '%s\n' \
      '{' \
      '  "schemaVersion": 1,' \
      '  "status": "passed",' \
      "  \"imageTag\": \"${SAMRA_CONTAINER_IMAGE_TAG}\"," \
      '  "database": "disposable-postgresql-16",' \
      '  "images": ["api", "customer-web", "operations-web", "design-system-preview", "migrations"],' \
      '  "probes": ["api-health", "api-readiness", "customer-spa", "customer-api-proxy", "operations-spa", "operations-api-proxy", "operations-api-disabled", "design-system-spa"]' \
      '}' >"${SAMRA_SMOKE_ROOT}/container-portability.json"
    printf '%s\n' \
      '<?xml version="1.0" encoding="utf-8"?>' \
      '<testsuites name="Container Portability" tests="1" failures="0" errors="0">' \
      '  <testsuite name="Google Cloud Container Portability" tests="1" failures="0" errors="0">' \
      '    <testcase classname="Google Cloud Container Portability" name="Five-image migration and runtime smoke"/>' \
      '  </testsuite>' \
      '</testsuites>' >"${SAMRA_SMOKE_ROOT}/container-portability.xml"
  else
    printf '%s\n' \
      '{' \
      '  "schemaVersion": 1,' \
      '  "status": "failed"' \
      '}' >"${SAMRA_SMOKE_ROOT}/container-portability.json"
    printf '%s\n' \
      '<?xml version="1.0" encoding="utf-8"?>' \
      '<testsuites name="Container Portability" tests="1" failures="1" errors="0">' \
      '  <testsuite name="Google Cloud Container Portability" tests="1" failures="1" errors="0">' \
      '    <testcase classname="Google Cloud Container Portability" name="Five-image migration and runtime smoke">' \
      '      <failure message="Container portability smoke failed"/>' \
      '    </testcase>' \
      '  </testsuite>' \
      '</testsuites>' >"${SAMRA_SMOKE_ROOT}/container-portability.xml"
  fi

  return "${exit_status}"
}

trap cleanup EXIT

assert_non_root_image() {
  local image=$1
  local configured_user
  configured_user="$(docker image inspect --format '{{.Config.User}}' "${image}")"
  if [[ "${configured_user}" != "node" ]]; then
    printf 'Image %s must run as the node user; found %s.\n' "${image}" "${configured_user}" >&2
    return 1
  fi
}

wait_for_url() {
  local url=$1
  local output=$2
  curl \
    --fail \
    --silent \
    --show-error \
    --retry 30 \
    --retry-all-errors \
    --retry-delay 1 \
    --output "${output}" \
    "${url}"
}

assert_non_root_image "samra-api:${SAMRA_CONTAINER_IMAGE_TAG}"
assert_non_root_image "samra-customer-web:${SAMRA_CONTAINER_IMAGE_TAG}"
assert_non_root_image "samra-operations-web:${SAMRA_CONTAINER_IMAGE_TAG}"
assert_non_root_image "samra-design-system-preview:${SAMRA_CONTAINER_IMAGE_TAG}"
assert_non_root_image "samra-migrations:${SAMRA_CONTAINER_IMAGE_TAG}"

docker run --rm --network host \
  --env DATABASE_URL="${DATABASE_URL}" \
  "samra-migrations:${SAMRA_CONTAINER_IMAGE_TAG}"

docker run --detach --name "${SAMRA_API_CONTAINER}" --network host \
  --env PORT="${SAMRA_API_PORT}" \
  --env SAMRA_BACKEND_MODE=demo \
  --env SAMRA_PROVIDER_MODE=fake \
  --env SAMRA_PERSISTENCE_MODE=postgres \
  --env SAMRA_RUN_WORKER=true \
  --env SAMRA_INTERNAL_OPERATIONS_ENABLED=false \
  --env DATABASE_URL="${DATABASE_URL}" \
  "samra-api:${SAMRA_CONTAINER_IMAGE_TAG}" >/dev/null

wait_for_url \
  "http://127.0.0.1:${SAMRA_API_PORT}/api/healthz" \
  "${SAMRA_SMOKE_ROOT}/api-health.json"
wait_for_url \
  "http://127.0.0.1:${SAMRA_API_PORT}/api/readyz" \
  "${SAMRA_SMOKE_ROOT}/api-readiness.json"

docker run --detach --name "${SAMRA_CUSTOMER_CONTAINER}" --network host \
  --env PORT="${SAMRA_CUSTOMER_PORT}" \
  --env SAMRA_API_ORIGIN="http://127.0.0.1:${SAMRA_API_PORT}" \
  "samra-customer-web:${SAMRA_CONTAINER_IMAGE_TAG}" >/dev/null

wait_for_url \
  "http://127.0.0.1:${SAMRA_CUSTOMER_PORT}/remittance" \
  "${SAMRA_SMOKE_ROOT}/customer-remittance.html"
wait_for_url \
  "http://127.0.0.1:${SAMRA_CUSTOMER_PORT}/api/readyz" \
  "${SAMRA_SMOKE_ROOT}/customer-api-readiness.json"

docker run --detach --name "${SAMRA_OPERATIONS_CONTAINER}" --network host \
  --env PORT="${SAMRA_OPERATIONS_PORT}" \
  --env SAMRA_API_ORIGIN="http://127.0.0.1:${SAMRA_API_PORT}" \
  "samra-operations-web:${SAMRA_CONTAINER_IMAGE_TAG}" >/dev/null

wait_for_url \
  "http://127.0.0.1:${SAMRA_OPERATIONS_PORT}/login" \
  "${SAMRA_SMOKE_ROOT}/operations-login.html"
wait_for_url \
  "http://127.0.0.1:${SAMRA_OPERATIONS_PORT}/api/healthz" \
  "${SAMRA_SMOKE_ROOT}/operations-api-health.json"

SAMRA_OPERATIONS_STATUS="$(curl \
  --silent \
  --show-error \
  --output "${SAMRA_SMOKE_ROOT}/operations-disabled.json" \
  --write-out '%{http_code}' \
  "http://127.0.0.1:${SAMRA_OPERATIONS_PORT}/api/v1/internal/operations/summary")"
if [[ "${SAMRA_OPERATIONS_STATUS}" != "404" ]]; then
  printf 'Production container exposed synthetic operations API with HTTP %s.\n' \
    "${SAMRA_OPERATIONS_STATUS}" >&2
  exit 1
fi

docker run --detach --name "${SAMRA_DESIGN_CONTAINER}" --network host \
  --env PORT="${SAMRA_DESIGN_PORT}" \
  "samra-design-system-preview:${SAMRA_CONTAINER_IMAGE_TAG}" >/dev/null

wait_for_url \
  "http://127.0.0.1:${SAMRA_DESIGN_PORT}/" \
  "${SAMRA_SMOKE_ROOT}/design-system.html"
