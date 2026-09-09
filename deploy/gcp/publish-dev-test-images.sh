#!/usr/bin/env bash
# Called by the native Cloud Build configuration from an exact-commit archive.
set -euo pipefail
case "${BUILD_PROJECT:-}" in
  samra-pay-dev) registry=samra-dev ;;
  samra-pay-test) registry=samra-test ;;
  *) echo 'Only isolated Dev/Test image publication is supported.' >&2; exit 64 ;;
esac
if [[ ! "${SOURCE_SHA:-}" =~ ^[a-f0-9]{40}$ ]]; then
  echo 'An exact full source commit SHA is required.' >&2
  exit 64
fi
for item in api customer-web migrate; do
  image="$item"
  extra=(--file="deploy/gcp/Dockerfile.$item")
  if [[ "$item" == customer-web ]]; then extra+=(--build-arg SAMRA_WEB_SURFACE=legacy); fi
  if [[ "$item" == migrate ]]; then image=migrations; fi
  ref="us-east4-docker.pkg.dev/$BUILD_PROJECT/$registry/samra-$image:$SOURCE_SHA"
  docker build "${extra[@]}" \
    --label="org.opencontainers.image.revision=$SOURCE_SHA" --tag="$ref" .
  docker push "$ref"
done
