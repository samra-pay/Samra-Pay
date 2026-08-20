# Samra Pay architecture foundation

The [documentation index](../README.md) is the current product status. The
[Alpha platform contract](./alpha-platform.md) governs vendor roles and trust
boundaries.

## Purpose

The repository is a deterministic product-development environment for proving
customer onboarding, balances, holds, quotes, remittance transitions, provider
events, reversals, reconciliation, audit evidence, and operational visibility
before real funds or customer data are introduced.

The Alpha north star uses Auth0 authentication, Persona KYC, and a
Crossmint-created USDC wallet. Funding and Ethiopia payout rails remain
unresolved. Legacy Rain, Caliza, and Chapa identifiers in synthetic fixtures or
account codes are implementation history, not active vendor decisions.

## Ownership boundary

```text
web / mobile / operations clients
  -> Auth0 access-token boundary where enabled
  -> /api/v1 Samra contract
  -> customer, onboarding, wallet, and remittance services
  -> provider-neutral Auth0, Persona, Crossmint, funding, and payout adapters
  -> inbox / outbox and idempotency
  -> Samra double-entry ledger
  -> reconciliation, audit, and operations evidence
  -> PostgreSQL
```

Samra owns customer identity mapping, authorization, onboarding, provider
resource mappings, API contracts, transaction state, financial ledger,
reconciliation, audit, operations cases, and product data. Provider-specific
payloads and statuses do not enter frontend contracts or become balance truth.

## Current runtime

`SAMRA_BACKEND_MODE=demo` runs the synthetic domain. Memory persistence is for
fast tests and resets on restart. `SAMRA_PERSISTENCE_MODE=postgres` uses durable
repositories, row locks, atomic transaction boundaries, leased work, inbox and
outbox recovery, audit evidence, and restart-safe retry state.

The Auth0, Persona, and Crossmint decisions do not mean live connections exist.
Auth0 and Persona foundations are disabled by default; Crossmint remains a
documented provider boundary. No real customer, live wallet, funding rail,
Ethiopia payout rail, or production deployment is represented.

## Financial invariants

1. Money uses `bigint` minor units internally and decimal strings over JSON.
2. Journals contain positive postings, one currency, and equal debits/credits.
3. Posted journals and postings are immutable; corrections use new journals.
4. Commands and provider events are idempotent and safe under concurrency.
5. Holds are single-use and cannot overspend an enforced account.
6. PostgreSQL commits state, holds, journals, audit, inbox/outbox, and
   reconciliation evidence atomically where one command owns them.
7. Reconciliation detects mismatches and never silently changes the ledger.
8. Web, mobile, vendors, and operations users cannot supply financial truth.

## Runtime modes

| Variable | Values | Default | Purpose |
| --- | --- | --- | --- |
| `SAMRA_BACKEND_MODE` | `disabled`, `demo` | `disabled` | Enables synthetic application routes |
| `SAMRA_PROVIDER_MODE` | `fake` | `fake` | Uses deterministic provider adapters |
| `SAMRA_PERSISTENCE_MODE` | `memory`, `postgres` | `memory` | Selects persistence |
| `SAMRA_RUN_WORKER` | `false`, `true` | `false` | Runs synthetic workflow and outbox work |
| `SAMRA_INTERNAL_OPERATIONS_ENABLED` | `false`, `true` | `false` | Enables controlled operations APIs |
| `SAMRA_CUSTOMER_AUTH_MODE` | `disabled`, `auth0` | `disabled` | Enables exact-issuer Auth0 access tokens |
| `VITE_SAMRA_DATA_MODE` | `mock`, `api` | `mock` | Selects customer-web data source |
| `VITE_SAMRA_OPS_DATA_MODE` | `mock`, `api` | `mock` | Selects Operations Portal data source |
| `EXPO_PUBLIC_SAMRA_DATA_MODE` | `mock`, `api` | `mock` | Selects mobile data source |

Unknown values fail clearly. API mode never silently falls back to mock
financial data.

## Domain documents

- [Alpha platform and vendor boundary](./alpha-platform.md)
- [Ledger](./ledger.md)
- [Remittance](./remittance.md)
- [Auth0 identity](./customer-identity-auth0.md)
- [Customer onboarding](./customer-onboarding.md)
- [Persona identity case](./customer-identity-persona.md)
- [Crossmint wallet](./customer-wallet-crossmint.md)
- [Customer funnel attribution](./customer-funnel-attribution.md)
- [Frontend cutover](./frontend-cutover.md)
- [Operations control plane](./operations-control-plane.md)
- [Replit transition](./replit-runbook.md)
- [Backend persistence](../backend-persistence.md)
- [Testing strategy](../testing/testing-strategy.md)
- [Google Cloud foundation](../../deploy/gcp/README.md)
