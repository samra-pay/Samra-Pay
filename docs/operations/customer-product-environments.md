# Customer product environments and release sequence

Status: prepared architecture and machine-validated release boundary. This document
does not authorize cloud deployment, DNS, customer traffic, live providers,
production data, app-store distribution, or money movement.

## Decision

Samra needs one local development lane and four isolated Google Cloud
environments: Dev, Test, Staging, and Production. Production also needs a
zero-traffic release state before invited customers receive access; that is a
promotion state inside the Production project, not another cloud project.

Do not replace the public website with the authenticated product. Keep
`www.samrapay.com` as the independently deployed marketing and legal surface.
Launch the customer web application at `app.samrapay.com`, with
`api.samrapay.com` as its controlled server audience and callback edge.

The machine-readable contract is
[`deploy/gcp/customer-product-environments.json`](../../deploy/gcp/customer-product-environments.json).
Its validator cross-checks the Google Cloud projects, Auth0 audiences, native
application identifiers, Dev/Test runtime contract, Staging runtime contract,
and Production foundation.

## Required lanes

| Lane                                             | Purpose                                                         | Data and providers                                                                                       | Gate to advance                                                                                                  |
| ------------------------------------------------ | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Local                                            | Fast engineering loop on a branch from current `main`           | Fixtures and disposable PostgreSQL only; auth may be simulated                                           | Automated checks, migration proof, affected web/native smoke test                                                |
| Dev — `samra-pay-dev`                            | Shared cloud integration and failure-path work                  | Synthetic data; fake KYC, wallet, funding and payout providers                                           | Exact source/image/configuration, API/web integration, logs and failure recovery                                 |
| Test — `samra-pay-test`                          | Stable human UAT for the release candidate                      | Synthetic users and money; fake financial providers                                                      | Real Auth0 login/logout/recovery, two-account isolation, onboarding and installed iOS/Android proof              |
| Staging — `samra-pay-staging`                    | Production-like release and provider-sandbox rehearsal          | Synthetic data; sandbox providers only through separate activation gates                                 | Immutable images, governed migration, Persona/Crossmint sandbox proof, monitoring, rollback and P0/P1 acceptance |
| Production zero traffic — `samra-pay-production` | Verify the exact live configuration without customer access     | Production identities and empty/controlled production stores; no traffic or provider call                | Independent configuration, IAM, secrets, migration, monitoring, security and rollback read-back                  |
| Invited Production Alpha                         | Prove the narrow first customer outcome                         | Up to 100 invited customers; Auth0, approved Persona production KYC, approved customer-controlled wallet | One user completes login → KYC → wallet and returns to the same account and wallet                               |
| Limited money-movement pilot                     | Prove live financial operations after the identity/wallet alpha | Real funds only after separate provider, legal, risk, treasury and operating approval                    | Funding, FX, payout, limits, ledger, reconciliation, support and incident evidence                               |
| Wider Production                                 | Expand only after measured pilot acceptance                     | Controlled cohort growth                                                                                 | Service levels, compliance operations, support coverage and graduated release approval                           |

The first Production Alpha excludes funding, FX execution, transfers, payouts,
and cards. Login, Persona, and wallet success are prerequisites for money
movement, not evidence that money movement is ready.

## Environment isolation

Each cloud environment requires a separate project, database, runtime identity,
secret inventory, Auth0 application/audience, provider configuration, logs,
alerts, budget attribution, backup/restore evidence, and rollback target.

Use one reviewed source candidate through promotion. Do not create long-lived
environment branches. For Dev-to-Test promotion, follow the
[Dev/Test runbook](../../deploy/gcp/dev-test-runtime.md): after Dev acceptance
and sealing, copy the same digest-pinned API, customer-web and migration images
without rebuilding. Supply and verify the reviewed, environment-specific
customer-web/Auth0 public configuration at runtime.

Build native artifacts for their target environment and record their public
configuration, source revision and artifact digest. A Test browser result does
not certify an installed iOS or Android build.

Never copy production customer data or production provider credentials into a
lower environment. Feature flags are not an isolation boundary. Browser and
mobile bundles may contain public client identifiers, but never client secrets,
API keys, service-account credentials, provider credentials, or database values.

The native application identifiers are deliberately different so Dev, Test,
Staging, and Production can coexist on a device. Each bundle must use only its
matching Auth0 API audience. Production additionally requires API mode through
`https://app.samrapay.com`; an incomplete Production bundle fails at startup.

## Current gate

The source now has explicit environment/project/audience checks for the API,
customer web, mobile runtime, Expo build, and Staging deployment controller.
Those checks prevent a non-production audience or project from being packaged
as Production and keep Production customer APIs disabled until reviewed live
provider modes exist.

This is code and release-contract readiness only. It does not prove that a
cloud revision is deployed, an Auth0/Persona/wallet configuration is saved, a
native build is installed, a customer completed onboarding, or a financial
provider can move money. Those claims require exact-environment read-back and
customer-flow evidence.

## Next release order

1. Merge the reviewed environment contract without deploying it.
2. Complete human Test acceptance on web and installed mobile with two distinct
   accounts and synthetic data.
3. Deploy the same candidate to private Staging at zero traffic, then prove the
   Alpha Release 1 login/onboarding/wallet sequence with provider sandboxes.
4. Prepare Production at zero traffic and independently verify every production
   configuration and rollback control.
5. Authorize and prove one invited Production identity-and-wallet customer.
6. Design and authorize a separate limited money-movement pilot only after the
   identity-and-wallet alpha is stable.

See [Develop → Test → Stage → Deploy](../development-delivery.md), the
[public/product surface boundary](../architecture/public-product-surface-boundary.md),
and [Alpha Release 1](../architecture/alpha-release-1.md).
