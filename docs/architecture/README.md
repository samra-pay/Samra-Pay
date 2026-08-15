# Samra Pay Architecture Foundation

Status: approved for synthetic-data implementation on `codex/architecture-foundation`.

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
inbox/outbox records and reconciliation in process memory. It proves the
accounting and workflow behavior without a database, but a process restart
resets the synthetic customer and all transfers.

The additive PostgreSQL schema and reviewed migrations are present but
unapplied. The PostgreSQL repository/transaction adapter is the next
persistence slice; until it is implemented and tested against an isolated
database, the inbox/outbox is not durable and restart recovery is not claimed.
No authentication, real customer data or live provider connection exists in
this foundation.

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

| Variable                      | Values             | Default    | Purpose                                 |
| ----------------------------- | ------------------ | ---------- | --------------------------------------- |
| `SAMRA_BACKEND_MODE`          | `disabled`, `demo` | `disabled` | Enables synthetic application routes    |
| `SAMRA_PROVIDER_MODE`         | `fake`             | `fake`     | Selects deterministic provider adapters |
| `SAMRA_RUN_WORKER`            | `false`, `true`    | `false`    | Runs the in-process event worker        |
| `VITE_SAMRA_DATA_MODE`        | `mock`, `api`      | `mock`     | Web data source                         |
| `EXPO_PUBLIC_SAMRA_DATA_MODE` | `mock`, `api`      | `mock`     | Mobile data source                      |
| `EXPO_PUBLIC_API_ORIGIN`      | URL                | unset      | Native mobile API origin                |

Unknown values fail clearly. API mode never silently falls back to mock data.
The current web and mobile screens remain in mock mode until each API cutover
passes its acceptance gate.

## Documents

- [Ledger model](./ledger.md)
- [Remittance lifecycle](./remittance.md)
- [Frontend cutover](./frontend-cutover.md)
- [Replit safety and release gates](./replit-runbook.md)
