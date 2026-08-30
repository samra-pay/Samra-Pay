# Samra Pay product and engineering documentation

This is the canonical entry point for the current Samra Pay product. It separates
what is implemented, tested, deployed, and still blocked so historical plans do
not become present-tense claims.

## Alpha north star

Samra Pay's Alpha is a synthetic-first remittance product with a Samra-owned
customer record, double-entry control ledger, audit history, reconciliation,
and PostgreSQL database.

| Capability              | Locked Alpha decision                  | Current state                                                                                                                       |
| ----------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Customer authentication | Auth0                                  | Backend and customer-web integration implemented; live tenant, public app identifiers, and native mobile client not connected       |
| Identity verification   | Persona                                | Fake and credential-gated sandbox adapters plus signed webhook boundary implemented; sandbox inventory and deployment not connected |
| Wallet                  | Crossmint-created USDC wallet          | Durable synthetic wallet, consent, mapping, state, and fake-adapter foundation implemented; live wallet creation not connected      |
| Wallet alternatives     | Cybrid, Rain, or Bridge after Alpha    | Evaluation only; no active integration or migration claim                                                                           |
| Bank funding            | Unresolved                             | Do not imply Crossmint supports Plaid or bank-funded transactions                                                                   |
| Ethiopia payout         | Unresolved                             | Synthetic payout only; no live corridor or remitter-of-record claim                                                                 |
| Financial truth         | Samra control ledger and PostgreSQL    | Durable fake-money implementation and assurance gates exist                                                                         |
| Cloud                   | Google Cloud                           | Staging foundation and private Cloud SQL exist; Cloud Run deployment is pending                                                     |
| Mobile distribution     | Firebase in the Google Cloud project   | Project linked; mobile app registration and distribution are pending                                                                |
| Quality evidence        | GitHub Actions and Qase                | GitHub is merge authority; Qase stores governed automated and manual evidence                                                       |
| Replit                  | Temporary preview and rollback surface | Not a source of financial, design, database, or deployment truth                                                                    |

Crossmint, Auth0, and Persona provide bounded capabilities. They do not own the
Samra customer, authorization decision, balance, transaction state, ledger,
audit trail, reconciliation result, or provider-migration mapping.

## Current delivery state

### Implemented and tested in the repository

- PostgreSQL repositories, migrations, readiness, graceful shutdown, and
  restart recovery;
- double-entry journals, holds, reversals, balance projections, reconciliation,
  audit events, idempotency, and concurrency controls;
- synthetic remittance state and deterministic failure scenarios;
- Auth0 token, durable identity-binding, guarded customer-web Universal Login,
  and memory-only bearer-token bridge, disabled by default;
- private Cloud Run customer-web-to-API authentication that preserves Auth0
  authorization and requires a separate Google service identity;
- durable onboarding, consent, and Persona-style identity-case boundaries;
- durable synthetic Crossmint-style wallet provisioning, immutable provider
  mapping, consent, restart, concurrency, failure, and audit boundaries;
- customer web, Expo mobile, Operations Portal, and governed design system;
- DS2 public coming-soon web, English/Amharic routes, explicit-consent
  waitlist API and PostgreSQL records, public-bundle isolation, and a
  review-only Google Cloud launch contract;
- fast, daily, weekly, performance, container, and release-candidate gates;
- Qase traceability and manual evidence contracts.

### Verified Google Cloud staging resources

- synthetic-only project boundary and least-privilege service accounts;
- immutable Artifact Registry repository;
- private VPC, subnet, Private Services Access, and PostgreSQL 16 Cloud SQL;
- empty `samra_staging` database with backups, point-in-time recovery, and
  deletion protection;
- Secret Manager metadata with no database credential version;
- Firebase project linkage without Firebase Auth, Firestore, Hosting, or a
  registered mobile app.

### Not yet connected or deployed

- Auth0 tenant applications and live access tokens;
- Persona account inventory, inquiry template, credentials, deployed signed
  webhook, PII policy, and sandbox decisions;
- Crossmint credentials, wallet creation, webhooks, or USDC movement;
- bank funding and Ethiopia payout rails;
- database user and connection secret, migrations against Cloud SQL, Cloud Run
  services, Cloud Run migration job, load balancer, or public application;
- production project, production waitlist database, public domain, managed TLS,
  Cloud Armor, DNS cutover, or public waitlist collection;
- real customer data, production security, production compliance approval, or
  production provider traffic.

## Governing documentation

### Product and platform

- [Alpha platform and vendor boundary](architecture/alpha-platform.md)
- [Architecture foundation](architecture/README.md)
- [Customer onboarding and consent](architecture/customer-onboarding.md)
- [Customer funnel and attribution](architecture/customer-funnel-attribution.md)
- [Frontend cutover](architecture/frontend-cutover.md)

### Identity and wallet

- [Auth0 customer identity](architecture/customer-identity-auth0.md)
- [Cloud Run service authentication](architecture/cloud-run-service-authentication.md)
- [Persona identity case](architecture/customer-identity-persona.md)
- [Crossmint USDC wallet boundary](architecture/customer-wallet-crossmint.md)

### Financial control

- [Backend persistence](backend-persistence.md)
- [Control ledger](architecture/ledger.md)
- [Synthetic remittance lifecycle](architecture/remittance.md)

### Operations

- [Operations control plane](architecture/operations-control-plane.md)
- [Workforce access](operations/workforce-access.md)
- [Case management](operations/case-management.md)
- [Persona sandbox activation](operations/persona-sandbox-activation.md)
- [Staging vendor runtime readiness](operations/staging-vendor-runtime-readiness.md)
- [Mobile Auth0 native activation](operations/mobile-auth0-native-activation.md)

### Cloud and delivery

- [Google Cloud foundation and cutover](../deploy/gcp/README.md)
- [Coming-soon Google Cloud launch](operations/coming-soon-cloud-launch.md)
- [Staging CI/CD, traceability, promotion, and rollback](operations/staging-release-control-plane.md)
- [Testing strategy](testing/testing-strategy.md)
- [Qase and CI reporting](testing/qase-ci.md)
- [Release-candidate evidence](testing/release-candidate-evidence.md)
- [Replit transition boundary](architecture/replit-runbook.md)

### Experience system

- [Design-system source of truth](../artifacts/samra-pay-ds/README.md)
- [Design-system current state](../artifacts/samra-pay-ds/docs/current-state-audit.md)
- [Financial UI truth](../artifacts/samra-pay-ds/docs/financial-ui-truth.md)
- [Accessibility](../artifacts/samra-pay-ds/docs/accessibility.md)

## Reading paths

**Head of Product:** this page, Alpha platform, onboarding, remittance, funnel,
financial UI truth, Operations Portal, testing strategy, and open Alpha gates.

**CTO:** this page, architecture foundation, Alpha platform, persistence,
ledger, identity, wallet, operations access, Google Cloud, testing strategy,
and release evidence.

Detailed PR history and old screenshots are evidence, not governing product
documentation. When a detailed document conflicts with this page, stop and
correct the contradiction before building or representing the capability.

## Documentation control

- This page owns present-tense product and platform status.
- Architecture documents own boundaries and invariants; runbooks own execution
  steps; test documents own evidence contracts.
- A capability is always labeled as proposed, implemented, tested, deployed, or
  production-approved. These states are not interchangeable.
- A vendor or platform decision change must update this page, the Alpha diagram,
  its adapter contract, affected hard stops, and test evidence in one pull
  request.
- Historical evidence remains immutable but must be labeled when it no longer
  describes the current architecture.
