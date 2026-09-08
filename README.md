# Samra Pay

Samra Pay is building an Alpha remittance product with a Samra-owned customer
record, PostgreSQL operating database, double-entry control ledger, audit trail,
reconciliation, customer applications, and an internal Operations Portal.

The locked Alpha vendors are:

- Auth0 for customer authentication;
- Persona for KYC evidence;
- Crossmint for an approved USDC wallet configuration;
- Google Cloud for staging runtime and data infrastructure;
- GitHub Actions and Qase for technical and governed test evidence.

Funding and Ethiopia payout providers are unresolved. Cybrid, Rain, and Bridge
are post-Alpha wallet-platform alternatives, not active integrations.

## Start here

Read the [product and engineering documentation index](docs/README.md). It is
the canonical current-state map and separates implemented, tested, deployed,
and blocked capabilities.

For implementation, read [AGENTS.md](AGENTS.md), the
[local setup and contribution guide](CONTRIBUTING.md), and
[engineering authority and decisions](docs/engineering-governance.md).

The two governing architecture documents are:

- [Alpha platform and vendor boundary](docs/architecture/alpha-platform.md)
- [Architecture and financial invariants](docs/architecture/README.md)

## Workspace map

| Area | Location |
| --- | --- |
| Customer web | `artifacts/samra-pay/` |
| Expo mobile | `artifacts/samra-pay-mobile/` |
| Operations Portal | `artifacts/samra-pay-ops/` |
| API service | `artifacts/api-server/` |
| Design system | `artifacts/samra-pay-ds/` |
| API contracts and clients | `lib/api-*` and `lib/samra-client/` |
| Persistence | `lib/db/` |
| Ledger | `lib/ledger/` |
| Remittance | `lib/remittance/` |
| Google Cloud controls | `deploy/gcp/` |
| Quality and evidence tooling | `scripts/`, `.github/workflows/`, and `docs/testing/` |

## Non-negotiable boundaries

- Samra's ledger is financial truth; clients and vendors are not.
- Vendor IDs are mappings to Samra IDs, never primary customer or transaction
  identity.
- Webhooks are authenticated, persisted, deduplicated, normalized, and applied
  under Samra transaction controls.
- Real vendor traffic, customer data, public deployment, and production claims
  require separate evidence and approval.
- GitHub Actions is the technical merge authority; Qase stores governed manual
  and automated evidence against the exact commit.

Use pnpm and the frozen lockfile. Never commit credentials, database URLs,
access tokens, customer PII, KYC evidence, or raw provider payloads.
