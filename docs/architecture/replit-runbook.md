# Replit Safety and Release Gates

## Preserved runtime contract

- API service remains on port 8080 behind `/api`.
- `GET /api/healthz` remains available without a database.
- Web remains on port 23471 behind `/`.
- Expo/mobile remains on port 21314 behind `/mobile/`.
- Existing routes, base paths and build artifacts remain unchanged.
- Migrations and seeds never run at API startup or build time.
- The background worker is explicitly enabled.

## Database controls

- Use reviewed, versioned additive migrations.
- Never use `drizzle-kit push --force`.
- Do not auto-run schema push after merge.
- Use `TEST_DATABASE_URL` for integration tests.
- Use a disposable or branch-specific database for preview.
- Seed manually and idempotently.
- Never reset, wipe or reseed at server startup.

The API can start and serve liveness without `DATABASE_URL`. With the default
`SAMRA_BACKEND_MODE=disabled`, application routes report unavailable. Explicit
`demo` mode uses the process-local synthetic ledger and does not require a
database. PostgreSQL migrations are prepared but the database repository is
not wired into the running API yet.

## Deliberate API preview mode

Use all four values together for a branch-only Replit preview:

```text
SAMRA_BACKEND_MODE=demo
SAMRA_PROVIDER_MODE=fake
SAMRA_RUN_WORKER=true
VITE_SAMRA_DATA_MODE=api
```

The worker advances deterministic happy-path provider events while the web
screen polls the server. This mode is synthetic and process-local; restarting
the API resets its data. Remove the values or set the backend/data modes back
to `disabled`/`mock` to restore the existing default experience.

## Gates

### 1. Compatibility

- branch starts at audited SHA;
- frozen install succeeds on Replit Linux;
- existing tests/typecheck/build behavior is recorded;
- no Replit port, route or deployment setting changes.

### 2. Ledger and schema

- invariant, reversal, hold, idempotency and insufficient-funds tests pass;
- before persistence cutover, apply the migration to an empty disposable
  PostgreSQL database;
- verify it applies additively to the current schema;
- run database immutability and transaction tests.

### 3. Remittance and providers

- happy, rejection, timeout, duplicate, out-of-order, reversal and refund
  scenarios pass;
- after the PostgreSQL repository is wired, restart preserves pending events;
- every terminal state has exact expected ledger balances.

### 4. Reconciliation

- matched reports close cleanly;
- mismatch creates an exception;
- reconciliation never mutates a journal or transfer automatically.

### 5. API and clients

- OpenAPI and committed generated clients agree;
- money remains string-serialized;
- web remittance passes in deliberate API mode;
- default mock mode remains unchanged;
- mobile follows only after the web contract stabilizes.

### 6. Replit preview

- the current in-memory preview is labelled as reset-on-restart;
- a future persistent preview uses an isolated database;
- migrations and any database seed are manual;
- restart/recovery passes before persistence is called complete;
- root tests, typecheck and build pass on Linux;
- API, web and mobile route matrix passes;
- final diff and results are reviewed before merge.

## Prohibited without a new approval

- merging to `main`;
- switching the current Replit project to this branch;
- deploying;
- touching a shared or production database;
- adding real provider credentials or customer data;
- enabling live provider modes.
