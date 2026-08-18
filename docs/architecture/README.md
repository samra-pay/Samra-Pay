# Samra Pay Architecture Foundation

Status: synthetic-data backend implementation. Production rails, authentication,
security hardening, and deployment remain out of scope.

This foundation creates **functioning logic truth**, not financial truth. It is a
deterministic product-development environment for proving balances, holds,
quotes, remittance state transitions, provider events, reversals and
reconciliation before any live provider is connected.

## Boundaries

```text
web/mobile clients
  -> /api/v1 Samra contract
  -> application/domain services
  -> Samra control ledger
  -> fake provider ports (Rain, Caliza, Chapa)
  -> inbox/outbox event boundary
  -> reconciliation and exceptions
```

Samra owns the customer/application model, API contract, control ledger,
provider-resource mapping, reconciliation record and product data. Fake Rain is
the domestic USD account/card boundary. Fake Caliza is used only for remittance
movement. Fake Chapa is used only for Ethiopian payout.

Provider-specific payloads and statuses must not appear in frontend contracts.
The control ledger is authoritative only inside the synthetic prototype. It
does not assert custody, settlement finality, regulatory approval or live
provider capability.

## Current execution state

`SAMRA_BACKEND_MODE=demo` runs the domain services, ledger, fake providers,
inbox/outbox records, reconciliation, and optional worker. Memory persistence
remains useful for fast unit testing and resets on restart.

`SAMRA_PERSISTENCE_MODE=postgres` uses the durable PostgreSQL repositories and
transaction boundaries. Transfer progression is claimed through leased work
items, retry state survives restart, expired leases recover, outbox publication
is claimed idempotently, and retry exhaustion is visible to operations. No
authentication, real customer data, live provider connection, or production
deployment exists.

## First vertical slice

- Corridor: synthetic USD source to synthetic ETB payout.
- Default customer display balance: USD 4,250.00, created by a balanced opening
  journal.
- Test transfer: USD 100.00 principal plus USD 3.00 fee.
- Test quote rate: 180.0000 ETB per USD.
- Destination amount: ETB 18,000.00.
- No real customer data, bank details, PAN, CVC, credentials or provider keys.

## Invariants that are part of logic

Security hardening is deferred, but these controls are not security extras:

1. Money uses `bigint` minor units internally and decimal strings over JSON.
2. Every journal has positive postings, one currency and equal debits/credits.
3. Posted journals and postings are immutable.
4. Corrections use reversals or new adjusting journals.
5. Commands and provider events are idempotent.
6. Holds are single-use and cannot overspend an enforced account.
7. State, holds, journals, audit records and outbox records commit atomically
   when backed by PostgreSQL.
8. Reconciliation detects mismatches but never silently changes the ledger.

## Runtime modes

| Variable                            | Values               | Default    | Purpose                                           |
| ----------------------------------- | -------------------- | ---------- | ------------------------------------------------- |
| `SAMRA_BACKEND_MODE`                | `disabled`, `demo`   | `disabled` | Enables synthetic application routes              |
| `SAMRA_PROVIDER_MODE`               | `fake`               | `fake`     | Selects deterministic provider adapters           |
| `SAMRA_PERSISTENCE_MODE`            | `memory`, `postgres` | `memory`   | Selects process-local or durable persistence      |
| `SAMRA_RUN_WORKER`                  | `false`, `true`      | `false`    | Runs fake-provider workflow and outbox processing |
| `SAMRA_INTERNAL_OPERATIONS_ENABLED` | `false`, `true`      | `false`    | Enables demo/PostgreSQL read-only operations APIs |
| `VITE_SAMRA_DATA_MODE`              | `mock`, `api`        | `mock`     | Web data source                                   |
| `VITE_SAMRA_OPERATIONS_ENABLED`     | `false`, `true`      | `false`    | Explicitly enables the private operations portal  |
| `VITE_SAMRA_OPS_DATA_MODE`          | `mock`, `api`        | `mock`     | Selects fixture or durable operations data        |
| `VITE_SAMRA_API_ORIGIN`             | URL                  | unset      | Operations portal API origin                      |
| `EXPO_PUBLIC_SAMRA_DATA_MODE`       | `mock`, `api`        | `mock`     | Mobile data source                                |
| `EXPO_PUBLIC_SAMRA_API_ORIGIN`      | HTTPS origin         | unset      | Portable native and Expo web API origin           |

Unknown values fail clearly. API mode never silently falls back to mock data.
The current web and mobile screens remain in mock mode until each API cutover
passes its acceptance gate.

## Documents

- [Ledger model](./ledger.md)
- [Remittance lifecycle](./remittance.md)
- [Frontend cutover](./frontend-cutover.md)
- [Operations control plane](./operations-control-plane.md)
- [Replit safety and release gates](./replit-runbook.md)
- [Backend assurance release readiness](../testing/backend-assurance-release-readiness.md)
