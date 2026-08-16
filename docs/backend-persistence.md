# Backend persistence operating boundary

The default runtime remains in-memory demo mode. Durable mode is explicit:

```text
SAMRA_BACKEND_MODE=demo
SAMRA_PROVIDER_MODE=fake
SAMRA_PERSISTENCE_MODE=postgres
DATABASE_URL=postgresql://...
```

Only fake providers are supported. Durable mode does not enable deployment,
shared databases, Replit changes, or real provider traffic.

## Migrations and seeds

- Application startup never runs migrations or seeds.
- CI migrations and seeds require `TEST_DATABASE_URL`; they refuse to run
  without that explicit disposable-database variable.
- Migrations are additive and forward-only. A failed release is rolled back by
  reverting application code, preserving data, and applying a reviewed
  compensating migration. Destructive down migrations are prohibited.
- The synthetic seed is idempotent and creates one demo customer, one USD
  product account, two beneficiaries, five ledger accounts, and one balanced
  425,000-minor-unit opening journal.

## Financial truth

PostgreSQL transactions own quote consumption, transfer state, holds, journals,
provider links and events, idempotency records, outbox messages, audit events,
and reconciliation results. Balance responses are derived from posted ledger
entries less active holds. Client state is never accepted as financial truth.

The persistence gate runs against an ephemeral PostgreSQL 16 service and proves
atomic rollback, cross-runtime idempotency and concurrency, restart recovery,
exact ledger balances, refund reversals, reconciliation durability, and the
absence of duplicate provider commands or reversal journals.
