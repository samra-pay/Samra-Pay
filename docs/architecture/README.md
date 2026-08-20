# Samra Pay architecture foundation

The [documentation index](../README.md) owns current product and deployment
status. The [Alpha platform contract](./alpha-platform.md) owns vendor roles and
trust boundaries. This document owns the durable system shape and financial
invariants.

## Purpose and ownership

The repository proves customer onboarding, balances, holds, quotes, remittance
transitions, provider events, reversals, reconciliation, audit evidence, and
operational visibility before real funds or customer data are introduced.

```text
web / mobile / operations clients
  -> Samra API and server-side authorization
  -> customer, onboarding, wallet, and remittance services
  -> provider-neutral adapters and durable inbox / outbox
  -> Samra double-entry ledger, reconciliation, and audit
  -> PostgreSQL
```

Samra owns customer mappings, onboarding, API contracts, provider mappings,
transaction state, ledger, reconciliation, audit, operations cases, and product
data. Provider payloads and statuses never enter frontend contracts or become
balance truth.

## Runtime boundary

`SAMRA_BACKEND_MODE=demo` enables the synthetic domain. Memory persistence is
for fast tests and resets on restart. `SAMRA_PERSISTENCE_MODE=postgres` enables
durable repositories, row locks, atomic commands, leased work, inbox/outbox
recovery, audit evidence, and restart-safe retries.

Auth0 and Persona foundations are disabled by default. Crossmint remains a
documented provider boundary. No runtime mode represents a live customer,
wallet, funding rail, Ethiopia payout rail, or production deployment. Unknown
configuration values fail, and API mode never falls back to mock financial
data. The [Replit boundary](./replit-runbook.md) owns preview configuration.

## Financial invariants

1. Money uses `bigint` minor units internally and decimal strings over JSON.
2. Journals contain positive postings, one currency, and equal debits/credits.
3. Posted journals and postings are immutable; corrections use new journals.
4. Commands and provider events are idempotent and concurrency-safe.
5. Holds are single-use and cannot overspend an enforced account.
6. PostgreSQL commits state, holds, journals, audit, inbox/outbox, and
   reconciliation evidence atomically where one command owns them.
7. Reconciliation detects mismatches and never silently changes the ledger.
8. Clients, vendors, and operations users cannot supply financial truth.

Follow the domain reading paths in the [documentation index](../README.md).
