#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
terraform fmt -check -recursive "$root"
for directory in bootstrap modules/project environments/dev environments/test environments/staging environments/production; do
  terraform -chdir="$root/$directory" init -backend=false -input=false -lockfile=readonly
  terraform -chdir="$root/$directory" validate
done
terraform -chdir="$root/bootstrap" test
terraform -chdir="$root/modules/project" test
