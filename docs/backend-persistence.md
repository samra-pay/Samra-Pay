# Backend persistence operating boundary

> **Status:** Implemented and tested in synthetic modes. PostgreSQL is Samra's
> financial and operational source of truth; vendor systems are integrations,
> not ledgers. The Google Cloud staging database foundation is separate from
> application deployment and real-provider activation. See the
> [documentation index](README.md) and
> [Alpha platform architecture](architecture/alpha-platform.md).

The default backend is disabled and exposes health endpoints without a database.
Every enabled demo runtime requires PostgreSQL; `memory` or omitted persistence
fails before the configured runtime is created. Enable synthetic durable mode
explicitly:

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

## Test fixture boundary

The package `@workspace/ledger` exports errors and types only. Its synchronous
in-memory repository lives at `lib/ledger/test/fixtures/in-memory-ledger.ts` and
is imported explicitly by tests, including the API test composition fixture.
`DemoLedgerAdapter` requires a repository, and `DemoRuntime` requires an explicit
ledger. The configured runtime retains the existing `PostgresLedgerControl`
composition; the router cannot recreate a missing runtime. No startup path seeds
an in-memory ledger or silently substitutes it for PostgreSQL. The separate
remittance `InMemoryLedgerControl` test double remains unchanged.

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
