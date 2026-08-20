# Samra Pay testing strategy

GitHub Actions is the technical pass/fail and merge authority. Qase retains
governed automated, manual, and release traceability. Neither system replaces
PostgreSQL and the Samra control ledger as financial truth.

The machine-readable cadence is
[`testing-cadence.json`](testing-cadence.json). Workflow validation must fail
when implementation drifts from that contract.

## Risk tiers

| Tier | Scope                                                                             | Required treatment                                                                     |
| ---- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| P0   | Money movement, ledger balance, idempotency, authorization, audit, reconciliation | Pull request, merged `main`, daily, and exact-SHA release evidence; no manual override |
| P1   | Critical customer/workforce journeys, recovery, refunds, reversals, visibility    | Affected pull request, merged `main`, daily smoke, and release evidence                |
| P2   | Reporting, secondary flows, visual behavior, uncommon edges                       | Targeted automation plus release/manual review                                         |

## Cadence

| Cadence           | Trigger                      | Purpose                                                                | Budget |
| ----------------- | ---------------------------- | ---------------------------------------------------------------------- | -----: |
| Pull request      | Every pull request to `main` | Prevent unsafe merge                                                   | 20 min |
| Main              | Every push to `main`         | Prove the actual merge commit                                          | 20 min |
| Daily             | `06:17 UTC`                  | Detect cross-package, restart, dependency, and build regressions       | 30 min |
| Weekly ledger     | Sunday `06:17 UTC`           | Enforce 100K/1M-posting performance gates                              | 45 min |
| Weekly resilience | Saturday `07:43 UTC`         | Soak concurrency, replay sequences, inject failures, rehearse upgrades | 45 min |
| Release candidate | Manual exact-SHA dispatch    | Retest immutable `main` commit and retain evidence                     | 90 min |

Scheduled workflows run from the default branch. Feature-branch pushes do not
duplicate pull-request CI or Qase records. The merge-ref result is authoritative
before merge; the later `main` run proves the resulting commit.

## Coverage ownership

| Surface               | Continuous                                                                                         | Manual or release                                        |
| --------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| PostgreSQL and ledger | Migration, seed, double entry, precision, holds, replay, immutability, concurrency, reconciliation | Journal, audit, recovery, and candidate-SHA sampling     |
| API and remittance    | Unit, generated contract, HTTP/PostgreSQL, compiled restart                                        | Failure and recovery review                              |
| Customer web          | Unit, typecheck, build, explicit API failure, artifact budget                                      | Browser and quote-handoff smoke                          |
| Mobile                | Unit, typecheck, API configuration, recovery, production bundle, artifact budget                   | Physical iOS/Android smoke                               |
| Operations Portal     | Unit, roles, unavailable states, build, artifact budget                                            | Administrator, CS, compliance, and auditor workflows     |
| Design system         | Token drift, contrast, accessibility, typecheck, preview build                                     | Cross-surface visual review                              |
| Google Cloud          | Container and configuration contracts                                                              | Authorized deployment, migration, and rollback rehearsal |
| Vendor adapters       | Fake contracts, replay, timeout, redaction                                                         | Separate sandbox certification before credentials        |
| Commercial site       | Isolated typecheck and build                                                                       | Release visual review when in scope                      |

## Evidence contracts

- [Qase CI reporting](qase-ci.md) owns upload behavior, environments, case
  mappings, and manual-plan use.
- [Immutable release-candidate evidence](release-candidate-evidence.md) owns the
  exact-SHA workflow and its stop conditions.
- [`release-evidence-contract.json`](release-evidence-contract.json) owns
  required release files and retention.
- [`experience-budgets.json`](experience-budgets.json) owns raw and gzip limits.
- [Ledger performance baseline](ledger-performance-baseline.md) owns measured
  thresholds and materialized-balance evidence.
- The [Google Cloud runbook](../../deploy/gcp/README.md) owns portability and
  staging cutover controls.

GitHub validates every governed JUnit file before one batch upload. Release
candidates retain content hashes for each evidence file. Budget or evidence
contract changes require measured, reviewed changes; a build cannot evade a
gate by omitting or renaming its expected artifact.

Automated database acceptance uses the `github-ci-postgres` environment: a
disposable PostgreSQL 16 service with synthetic data, not a deployment target.

## Merge and release stop conditions

Stop a merge or release when:

1. a required P0 test fails, is skipped, or lacks required evidence;
2. migration, restart, atomicity, idempotency, concurrency, or recovery fails;
3. any journal is unbalanced or reconciliation has unexplained variance;
4. replay can move money twice or accept changed command evidence;
5. an outage silently exposes mock financial data;
6. the tested commit differs from the candidate;
7. Qase environment attribution or required release evidence is missing; or
8. a governed web, mobile, or operations artifact is absent, ambiguous, or over
   its approved size budget.

## Boundaries

Automated acceptance uses disposable PostgreSQL and synthetic fixtures. It does
not target Replit, production, shared databases, real providers, customer data,
or public workloads. Browser and physical-device testing remains governed
manual Qase evidence until separately approved automation exists.

Auth0, Persona, and Crossmint sandbox certification requires isolated
environments, synthetic identities, redacted credentials, bounded data, and an
exact-SHA Qase plan. Technical evidence cannot substitute for provider, privacy,
legal, corridor, or production approval.
