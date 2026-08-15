#!/bin/bash
set -e
pnpm install --frozen-lockfile || pnpm install --no-frozen-lockfile
echo "Database migrations were not run. Review them, then run: pnpm --filter @workspace/db run migrate"
