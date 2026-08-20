# Samra Pay

Samra Pay is building a synthetic-first U.S.–Ethiopia remittance Alpha. Samra
owns the customer relationship, PostgreSQL data, authorization decisions,
transaction state, double-entry control ledger, reconciliation, audit history,
provider mappings, and core product IP. External providers supply bounded,
replaceable capabilities; they do not become financial or customer truth.

## Start here

Use the [product and engineering documentation index](docs/README.md) for the
current implementation and deployment state. The governing architecture is:

- [Alpha platform and vendor boundary](docs/architecture/alpha-platform.md)
- [Architecture and financial invariants](docs/architecture/README.md)

The locked Alpha vendors are Auth0 for authentication, Persona for identity
verification, and Crossmint for an approved USDC wallet configuration. Funding
and Ethiopia payout remain unresolved. No document, fixture, or preview may
represent an unresolved provider or capability as live.

## Workspace map

| Area                                 | Location                                                                          |
| ------------------------------------ | --------------------------------------------------------------------------------- |
| Customer web, mobile, and operations | `artifacts/samra-pay/`, `artifacts/samra-pay-mobile/`, `artifacts/samra-pay-ops/` |
| API and shared contracts             | `artifacts/api-server/`, `lib/api-*`, `lib/samra-client/`                         |
| Persistence, ledger, and remittance  | `lib/db/`, `lib/ledger/`, `lib/remittance/`                                       |
| Design system                        | `artifacts/samra-pay-ds/`                                                         |
| Cloud controls                       | `deploy/gcp/`                                                                     |
| Tests and evidence tooling           | `scripts/`, `.github/workflows/`, `docs/testing/`                                 |

Use pnpm with the frozen lockfile. Never commit credentials, database URLs,
tokens, customer PII, KYC evidence, or raw provider payloads. Replit is a
temporary preview surface; GitHub is source and merge authority, Qase retains
governed evidence, and Google Cloud is the target runtime and data platform.
