# Samra Pay Replit boundary

Replit is a temporary development, visual-preview, and manual-testing surface.
It is not source, release, database, customer, ledger, vendor, design, or
production-configuration authority. Read the [documentation index](docs/README.md)
and [Replit runbook](docs/architecture/replit-runbook.md) before changing a
preview branch or runtime mode.

## Safe defaults

```text
SAMRA_BACKEND_MODE=disabled
SAMRA_PROVIDER_MODE=fake
SAMRA_PERSISTENCE_MODE=memory
SAMRA_RUN_WORKER=false
SAMRA_CUSTOMER_AUTH_MODE=disabled
SAMRA_INTERNAL_OPERATIONS_ENABLED=false
VITE_SAMRA_DATA_MODE=mock
VITE_SAMRA_OPS_DATA_MODE=mock
EXPO_PUBLIC_SAMRA_DATA_MODE=mock
```

Unknown values fail. API mode must show an explicit failure and never fall back
to mock financial data.

## Workspace commands

- `pnpm install --frozen-lockfile` — install the exact dependency set;
- `pnpm run typecheck` — typecheck governed packages;
- `pnpm run test` — run the standard automated suites;
- `pnpm run build` — run tests, typecheck, and governed builds;
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API clients;
- `pnpm run db:migrate` — migrate only an explicitly authorized database.

Durable synthetic mode requires an authorized `DATABASE_URL` and explicit
`demo`, `fake`, `postgres`, and worker settings. `/api/healthz` checks process
liveness; `/api/readyz` checks connectivity and schema without migrating or
seeding. Migrations and seeds never run at application startup.

No Replit session may use real customer data, live provider traffic, shared or
production databases, public workforce access, or Replit-specific financial
logic. The [Google Cloud runbook](deploy/gcp/README.md) owns cutover gates.
