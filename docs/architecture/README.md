# Samra Pay architecture foundation

The [documentation index](../README.md) is the current product status. The
[Alpha platform contract](./alpha-platform.md) governs vendor roles and trust
boundaries. The [provider-portability decision](./provider-portability.md)
governs Samra control-plane ownership, capability adapters, migrations, and
provider-exit acceptance.

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
  -> Samra-owned capability boundaries with provider-specific adapters
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
Auth0 web/mobile and Persona sandbox foundations are disabled by default. The
older server/external-signer Crossmint adapter remains dormant. A separate
customer-controlled, creation-only adapter is selectable through the guarded
`SAMRA_CUSTOMER_WALLET_PROVIDER_MODE=crossmint-sandbox-customer` staging lane.
It requires Auth0, PostgreSQL, one allowlisted customer, explicit consent,
and disabled workers/operations. See the
[wallet boundary](customer-wallet-crossmint.md). Code support and the recorded
console/provider lookup do not prove a deployed Samra wallet connection.
Funding, Ethiopia payout, and production financial capability remain blocked.

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

| Variable                                | Values                                 | Default    | Purpose                                                                  |
| --------------------------------------- | -------------------------------------- | ---------- | ------------------------------------------------------------------------ |
| `SAMRA_BACKEND_MODE`                    | `disabled`, `demo`                     | `disabled` | Enables synthetic application routes                                     |
| `SAMRA_PROVIDER_MODE`                   | `fake`                                 | `fake`     | Uses deterministic provider adapters                                     |
| `SAMRA_CUSTOMER_WALLET_PROVIDER_MODE` | `fake`, `crossmint-sandbox-customer` | `fake` | Separate guarded customer wallet adapter; generic provider mode alone does not disable it |
| `SAMRA_PERSISTENCE_MODE`                | `memory`, `postgres`                   | `memory`   | Selects persistence                                                      |
| `SAMRA_RUN_WORKER`                      | `false`, `true`                        | `false`    | Runs synthetic workflow and outbox work                                  |
| `SAMRA_INTERNAL_OPERATIONS_ENABLED`     | `false`, `true`                        | `false`    | Enables controlled operations APIs                                       |
| `SAMRA_CUSTOMER_AUTH_MODE`              | `disabled`, `auth0`                    | `disabled` | Enables exact-issuer Auth0 access tokens                                 |
| `SAMRA_CUSTOMER_IDENTITY_PROVIDER_MODE` | `fake`, `persona-sandbox`              | `fake`     | Selects the credential-gated KYC adapter                                 |
| `VITE_SAMRA_DATA_MODE`                  | `mock`, `api`                          | `mock`     | Selects customer-web data source                                         |
| `VITE_AUTH0_DOMAIN`                     | Auth0 tenant or custom-domain hostname | none       | Required with customer-web API mode; hostname only                       |
| `VITE_AUTH0_CLIENT_ID`                  | Public Auth0 SPA client ID             | none       | Required with customer-web API mode; never a client secret               |
| `VITE_AUTH0_AUDIENCE`                   | Exact HTTPS Samra API identifier       | none       | Required with customer-web API mode and must match the API audience      |
| `SAMRA_PUBLIC_AUTH0_DOMAIN`             | Auth0 tenant or custom-domain hostname | none       | Cloud Run public runtime mapping to `VITE_AUTH0_DOMAIN`                  |
| `SAMRA_PUBLIC_AUTH0_CLIENT_ID`          | Public Auth0 SPA client ID             | none       | Cloud Run public runtime mapping; never a client secret                  |
| `SAMRA_PUBLIC_AUTH0_AUDIENCE`           | Exact HTTPS Samra API identifier       | none       | Cloud Run public runtime mapping to the same API audience                |
| `SAMRA_API_ORIGIN`                      | Exact HTTPS Cloud Run API origin       | none       | Customer-web same-origin proxy target; loopback HTTP only in development |
| `SAMRA_API_SERVICE_AUTH_MODE`           | `disabled`, `cloud-run-iam`            | local only | Requires Cloud Run service identity for every non-loopback API target    |
| `SAMRA_API_SERVICE_AUDIENCE`            | Exact HTTPS Cloud Run API origin       | none       | Audience for the customer-web service identity token                     |
| `VITE_SAMRA_OPS_DATA_MODE`              | `mock`, `api`                          | `mock`     | Selects Operations Portal data source                                    |
| `EXPO_PUBLIC_SAMRA_DATA_MODE`           | `mock`, `api`                          | `mock`     | Selects mobile data source                                               |
| `EXPO_PUBLIC_SAMRA_API_ORIGIN`          | Exact HTTPS API origin                 | none       | Required with mobile API mode; origin only                               |
| `EXPO_PUBLIC_SAMRA_AUTH_MODE`           | `disabled`, `auth0-native`             | `disabled` | Enables the native Auth0 boundary only in mobile API mode                |
| `EXPO_PUBLIC_AUTH0_DOMAIN`              | Auth0 tenant/custom-domain hostname    | none       | Required for native Auth0; hostname only                                 |
| `EXPO_PUBLIC_AUTH0_CLIENT_ID`           | Public Auth0 Native Application ID     | none       | Required for native Auth0; never a client secret                         |
| `EXPO_PUBLIC_AUTH0_AUDIENCE`            | Exact HTTPS Samra API identifier       | none       | Required for native Auth0 and must match the API audience                |

Unknown values fail clearly. API mode never silently falls back to mock
financial data.

## Domain documents

- [Public and product surface boundary](./public-product-surface-boundary.md)
- [Alpha platform and vendor boundary](./alpha-platform.md)
- [Provider portability and Samra control-plane ownership](./provider-portability.md)
- [Ledger](./ledger.md)
- [Remittance](./remittance.md)
- [Auth0 identity](./customer-identity-auth0.md)
- [Cloud Run service authentication](./cloud-run-service-authentication.md)
- [Customer onboarding](./customer-onboarding.md)
- [Persona identity case](./customer-identity-persona.md)
- [Crossmint wallet](./customer-wallet-crossmint.md)
- [Customer funnel attribution](./customer-funnel-attribution.md)
- [Frontend cutover](./frontend-cutover.md)
- [Operations control plane](./operations-control-plane.md)
- [Backend persistence](../backend-persistence.md)
- [Testing strategy](../testing/testing-strategy.md)
- [Google Cloud foundation](../../deploy/gcp/README.md)
- [Staging release control plane](../operations/staging-release-control-plane.md)
