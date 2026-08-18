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

`GET /api/healthz` is process liveness and never queries PostgreSQL.
`GET /api/readyz` is traffic readiness. In PostgreSQL mode it verifies database
connectivity and the minimum migrated runtime schema without writing, migrating,
or seeding. It returns only `ready` or `not_ready`; database details are not
included in the response. A platform should remove an instance from traffic
when readiness is `503` while continuing to use liveness for process restarts.

The compiled API handles `SIGTERM` and `SIGINT` by stopping the synthetic
worker, draining HTTP connections, closing the PostgreSQL pool, and exiting
successfully. A bounded forced connection close prevents indefinite shutdown.

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
and reconciliation results. Balance responses use a transactionally maintained
projection of posted ledger entries less active holds. Immutable journals,
postings, and hold state remain financial truth; the projection is never an
independent accounting source. Client state is never accepted as financial
truth.

The database updates the projection in the same transaction as journal posting
and hold transitions. Direct projection updates and deletes are rejected.
Actor-attributed drift sweeps compare every projected account with journal and
hold truth, and a reasoned, idempotent rebuild command can restore the full
projection atomically while preserving immutable audit evidence.

The persistence gate runs against an ephemeral PostgreSQL 16 service and proves
atomic rollback, cross-runtime idempotency and concurrency, restart recovery,
exact ledger balances, refund reversals, reconciliation durability, and the
absence of duplicate provider commands or reversal journals. The ledger suite
also proves projection concurrency, rollback, restart durability, drift
detection, controlled rebuild, and exact reconciliation to source truth.
The HTTP gate also launches the compiled API as a separate production-mode
process, creates a held transfer, terminates it with `SIGTERM`, starts a new
process, and proves readiness, transfer recovery, exact balances, and an
idempotent replay with the original transfer identifier.
