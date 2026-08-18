# Samra Pay testing strategy

## Decision

Samra Pay uses risk-based test cadence instead of running every test at every
moment. GitHub Actions is the technical merge authority. Qase is the durable
traceability, manual-execution, and release-evidence system. PostgreSQL and the
Samra control ledger remain the financial source of truth.

The machine-readable contract is
[`testing-cadence.json`](testing-cadence.json). The Linux quality gate validates
that the workflows still implement that contract.

## Risk tiers

| Tier | Scope                                                                                              | Required treatment                                                           |
| ---- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| P0   | Money movement, ledger balance, idempotency, authorization, audit integrity, and reconciliation    | Pull request, merged `main`, daily, and release evidence; no manual override |
| P1   | Critical customer and workforce journeys, recovery, refunds, reversals, and operational visibility | Affected pull request, merged `main`, daily smoke, and release evidence      |
| P2   | Reporting, secondary workflows, visual behavior, and uncommon edge cases                           | Release evidence plus targeted manual or scheduled review                    |

## Active automated cadences

| Cadence           | Trigger                      | Purpose                                                                                                    | Target runtime |
| ----------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------: |
| Pull request      | Every pull request to `main` | Prevent an unsafe change from entering `main`                                                              |     20 minutes |
| Main              | Every push to `main`         | Prove the actual merge commit                                                                              |     20 minutes |
| Daily             | `06:17 UTC` every day        | Detect time-dependent, dependency, build, restart, and cross-package regressions                           |     30 minutes |
| Weekly ledger     | `06:17 UTC` every Sunday     | Enforce the 100,000/1,000,000-posting materialized-balance performance gate                                |     45 minutes |
| Weekly resilience | `07:43 UTC` every Saturday   | Soak concurrency, replay seeded ledger sequences, inject controlled failures, and rehearse schema upgrades |     45 minutes |
| Release candidate | Manual exact-SHA dispatch    | Retest one immutable `main` commit, report Qase gates, and retain a content-addressed evidence manifest    |     90 minutes |

The schedules deliberately avoid the start of the hour, when hosted workflow
queues are more likely to be delayed. Scheduled runs execute only from the
default branch. A workflow change is therefore not active until it is merged.

## Product-stack coverage

| Surface               | Continuous evidence                                                                                                 | Daily evidence                                             | Manual/release evidence                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------ |
| PostgreSQL and ledger | Migrations, repeatable seed, double entry, precision, holds, idempotency, immutability, concurrency, reconciliation | Full repeat on a fresh disposable database plus restart    | Exact journal and audit sampling                                   |
| API and remittance    | Unit, contract, HTTP-to-PostgreSQL, and compiled-process restart                                                    | Full repeat against synthetic PostgreSQL                   | Candidate-SHA failure and recovery review                          |
| Customer web          | Unit/component tests, typecheck, production build, explicit API failure behavior                                    | Full repeat through workspace CI                           | Browser and quote-handoff smoke in Qase                            |
| Mobile                | Unit/model tests, typecheck, portable API configuration, recovery, production bundle                                | Full repeat through workspace CI                           | iOS and Android device smoke in Qase                               |
| Operations portal     | Unit/model tests, role restrictions, explicit unavailable states, production build                                  | Full repeat through workspace CI                           | Administrator, CS, compliance, and auditor workflows in Qase       |
| Design system         | Source boundary, token drift, contrast/accessibility tests, typecheck, preview build                                | Workspace build repeat                                     | Visual review across product surfaces                              |
| GCP portability       | Docker and configuration contract tests                                                                             | Portability contract repeat                                | Deployment, migration, and rollback rehearsal only when authorized |
| Commercial site       | Isolated typecheck and production build                                                                             | Separate daily job so it cannot weaken the financial gates | Visual review when included in a release                           |

## Qase execution policy

- Automated runs use `github-ci-postgres`, which means disposable PostgreSQL 16
  and synthetic data. It is not a deployment environment.
- Replit remains a manual synthetic preview environment. GitHub automation must
  not depend on it.
- Run titles identify cadence, branch, and exact commit.
- Release candidates are identified as `rc-<first 12 SHA characters>` and can
  only be dispatched with a full commit already contained in GitHub `main`.
- A Qase run is completed only after every governed JUnit upload succeeds.
- Manual plans never override a failed automated P0 control.
- Scheduled manual runs require a named owner. A schedule that only creates an
  unowned run should be reduced or removed.

## Merge and release stop conditions

Stop the merge or release when any of the following is true:

1. A required P0 test fails or is skipped without explicit release evidence.
2. Migration, seed idempotency, restart, atomicity, or concurrency fails.
3. A journal is unbalanced or reconciliation has an unexplained variance.
4. A duplicate command can move money twice or changed replay evidence is
   accepted.
5. An API outage silently exposes mock financial data.
6. The tested commit differs from the candidate commit.
7. Qase environment attribution or required evidence is missing.

## Controlled boundaries

- Use only disposable databases and synthetic fixtures.
- Do not automate against Replit, production, real providers, shared databases,
  or real customer data.
- Browser and physical-device execution remains governed manual Qase evidence
  until a separate automation phase is approved.
- This cadence phase does not authorize GCP deployment, production identity,
  secrets infrastructure, live payments, or provider connectivity.

## Immutable release-candidate evidence

[`release-evidence-contract.json`](release-evidence-contract.json) defines the
required gates, files, retention, Qase attribution, and controlled boundaries.
The manual workflow checks out the exact 40-character candidate SHA with no
persisted Git credentials, verifies it is contained in GitHub `main`, and runs
quality, commercial, migration, PostgreSQL, HTTP/restart, resilience, and
million-posting performance gates against one disposable PostgreSQL 16 service.

Every required JUnit and performance result is SHA-256 hashed into
`release-evidence-manifest.json`. GitHub retains the manifest, its independent
hash record, Qase run identity, and raw evidence for 365 days. The workflow
uploads evidence before enforcing stop conditions, so a failed candidate leaves
an auditable failed record and cannot be converted into a pass by omission.

## Next testing slices

The daily PostgreSQL job now publishes nine separately identifiable synthetic
journeys for completion, provider rejection, timeout retry, cancellation,
payout-failure refund, settlement reversal, restart/idempotency,
reconciliation resolution, and cross-journey ledger/audit sweeps. Each result
is independently visible in GitHub artifacts and Qase. The weekly resilience
lane adds six stable controls without sending traffic to any deployed surface:
one concurrency soak, one reproducible model-based sequence, three controlled
fault boundaries, and one upgrade from migration `0007` to the current schema.

1. Decide separately whether browser and device automation provides enough
   value to introduce and maintain it.
