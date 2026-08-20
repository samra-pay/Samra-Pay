# Samra Pay Replit boundary

Replit is a temporary development, visual-preview, and manual-testing surface.
GitHub is the source of code and design truth. Google Cloud is the target
runtime and database platform. Replit never owns customer, ledger, database,
vendor, release, or production-configuration truth.

Read [the documentation index](docs/README.md) for the current Alpha stack and
[the Replit runbook](docs/architecture/replit-runbook.md) before changing a
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

Unknown values fail. API mode must show an explicit failure and must never fall
back to mock financial data.

## Workspace commands

- `pnpm install --frozen-lockfile` — install the exact lockfile;
- `pnpm run typecheck` — typecheck governed packages;
- `pnpm run test` — run the standard automated suites;
- `pnpm run build` — run tests, typecheck, and governed builds;
- `pnpm --filter @workspace/api-spec run codegen` — regenerate client and Zod
  contracts from OpenAPI;
- `pnpm run db:migrate` — apply reviewed migrations only to an explicitly
  authorized database.

Migrations and seeds never run at application startup. Do not point Replit at a
shared, staging, or production database without a separately approved phase.

## Product surfaces

- `artifacts/samra-pay` — customer web;
- `artifacts/samra-pay-mobile` — Expo iOS, Android, and web client;
- `artifacts/samra-pay-ops` — separate Operations Portal;
- `artifacts/api-server` — Samra API and synthetic worker;
- `artifacts/samra-pay-ds` — governed design-system preview.

The Alpha vendor decisions are Auth0 authentication, Persona KYC, and Crossmint
USDC wallet creation. None is connected through Replit. Funding and Ethiopia
payout remain unresolved. All preview providers are deterministic fakes.

## Durable mode

PostgreSQL mode is explicit and requires an authorized `DATABASE_URL`:

```text
SAMRA_BACKEND_MODE=demo
SAMRA_PROVIDER_MODE=fake
SAMRA_PERSISTENCE_MODE=postgres
SAMRA_RUN_WORKER=true
```

`/api/healthz` is process liveness. `/api/readyz` checks PostgreSQL connectivity
and required schema without migrating or seeding. See
[backend persistence](docs/backend-persistence.md).

## Hard boundaries

- no real customer data, PII, credentials, provider traffic, or money;
- no public Operations Portal or client-supplied employee identity;
- no shared or production database migration;
- no Replit-specific financial logic or balances;
- no Replit deployment treated as release evidence;
- no vendor name in a synthetic fixture treated as a partnership or current
  architecture decision.

GitHub Actions is the technical merge authority. Qase stores governed automated
and manual evidence. Final Google Cloud cutover requires the exact-SHA container,
database, security, and Qase gates in [the cloud runbook](deploy/gcp/README.md).
