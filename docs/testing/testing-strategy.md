# Samra Pay testing strategy

Status: GitHub Actions and Qase are the locked Alpha quality system. GitHub is
the technical merge authority; Qase is the durable traceability, manual-test,
and release-evidence record.

## Decision

Samra Pay uses risk-based test cadence instead of running every test at every
moment. GitHub Actions is the technical merge authority. Qase is the durable
traceability, manual-execution, and release-evidence system. PostgreSQL and the
Samra control ledger remain the financial source of truth.

The machine-readable contract is
[`testing-cadence.json`](testing-cadence.json). The Linux quality gate validates
that the workflows still implement that contract.

[`repository-controls.json`](repository-controls.json) fixes the stable
`Required CI` and `Required security` check names and their fail-closed job
dependencies. The workflows support pull requests, merge queue groups, and
merged `main` commits. GitHub-side ruleset enforcement remains a separate,
independently verified control.

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
Feature-branch pushes do not create a second full CI or Qase run. The
pull-request merge ref is the authoritative pre-merge result, and the later
`main` push independently proves the actual merged commit.

## Product-stack coverage

| Surface               | Continuous evidence                                                                                                 | Daily evidence                                             | Manual/release evidence                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------ |
| PostgreSQL and ledger | Migrations, repeatable seed, double entry, precision, holds, idempotency, immutability, concurrency, reconciliation | Full repeat on a fresh disposable database plus restart    | Exact journal and audit sampling                                   |
| API and remittance    | Unit, contract, HTTP-to-PostgreSQL, and compiled-process restart                                                    | Full repeat against synthetic PostgreSQL                   | Candidate-SHA failure and recovery review                          |
| Customer web          | Unit/component tests, typecheck, production build, explicit API failure behavior, raw/gzip artifact budgets         | Full repeat through workspace CI                           | Browser and quote-handoff smoke in Qase                            |
| Mobile                | Unit/model tests, typecheck, portable API configuration, recovery, production bundle, raw/gzip artifact budgets     | Full repeat through workspace CI                           | iOS and Android device smoke in Qase                               |
| Operations portal     | Unit/model tests, role restrictions, explicit unavailable states, production build, raw/gzip entry budget           | Full repeat through workspace CI                           | Administrator, CS, compliance, and auditor workflows in Qase       |
| Design system         | Source boundary, token drift, contrast/accessibility tests, typecheck, preview build                                | Workspace build repeat                                     | Visual review across product surfaces                              |
| GCP portability       | Docker and configuration contract tests                                                                             | Portability contract repeat                                | Deployment, migration, and rollback rehearsal only when authorized |
| Vendor adapters       | Fake Auth0, Persona, Crossmint, funding, and payout contracts; replay, timeout, and redaction controls              | Synthetic onboarding and recovery repeat                   | Separate sandbox certification before any live credential          |
| Commercial site       | Isolated typecheck and production build                                                                             | Separate daily job so it cannot weaken the financial gates | Visual review when included in a release                           |

## Qase execution policy

- Automated runs use `github-ci-postgres`, which means disposable PostgreSQL 16
  and synthetic data. It is not a deployment environment.
- Replit remains a manual synthetic preview environment. GitHub automation must
  not depend on it.
- Run titles identify cadence, branch, and exact commit.
- Release candidates are identified as `rc-<first 12 SHA characters>` and can
  only be dispatched with a full commit already contained in GitHub `main`.
- GitHub validates every governed JUnit file and sends them to Qase in one
  directory upload. A Qase run is completed only after that batch succeeds.
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
8. A governed customer, mobile, or operations artifact is missing, ambiguous,
   or exceeds its approved raw or gzip budget.

## Controlled boundaries

- Use only disposable databases and synthetic fixtures.
- Do not automate against Replit, production, real providers, shared databases,
  or real customer data.
- Auth0, Persona, and Crossmint sandbox certification must use separate
  environments, synthetic identities, credential redaction, bounded test data,
  and an exact-SHA Qase plan; it does not replace provider or legal approval.
- Browser and physical-device execution remains governed manual Qase evidence
  until a separate automation phase is approved.
- This cadence phase does not authorize GCP deployment, production identity,
  secrets infrastructure, live payments, or provider connectivity.

[`experience-budgets.json`](experience-budgets.json) defines fail-closed raw
and gzip ceilings for the customer web entry, isolated onboarding chunk, web
styles, Operations Portal entry, and both mobile production bundles. The Linux
quality gate writes a retained JSON result after the build. Release candidates
include that report in the immutable SHA-256 evidence manifest. Budget changes
require their own measured and reviewed pull request; a build cannot evade a
limit by omitting or duplicating the expected artifact.

## Immutable release-candidate evidence

[`release-evidence-contract.json`](release-evidence-contract.json) defines the
required gates, files, retention, Qase attribution, and controlled boundaries.
The manual workflow checks out the exact 40-character candidate SHA with no
persisted Git credentials, verifies it is contained in GitHub `main`, and runs
quality, commercial, migration, PostgreSQL, HTTP/restart, resilience, and
million-posting performance gates. The candidate also reruns repository policy,
repository-owned Semgrep rules, fixed-critical dependency checks, committed-
secret and high-risk configuration checks, SBOM generation, and the dependency-
license policy against that same SHA. It also builds all five runtime images
from digest-pinned Dockerfile frontends and base images, records each local
content identity, and retains separate fixed-critical vulnerability and
high/critical secret reports. Persistence, HTTP/restart, resilience, and
performance each use a separately migrated and seeded disposable PostgreSQL 16
database so one suite cannot change another suite's financial baseline.

Every required JUnit and performance result is SHA-256 hashed into
`release-evidence-manifest.json`. GitHub retains the manifest, its independent
hash record, Qase run identity, and raw evidence for 365 days. The workflow
uploads evidence before enforcing stop conditions, so a failed candidate leaves
an auditable failed record and cannot be converted into a pass by omission.

## Container portability cadence

The `Container portability` workflow builds the five Google Cloud-targeted
images without publishing or deploying them. It runs on relevant pull requests
and `main` changes, weekly for base-image drift, and by manual dispatch. Against
disposable PostgreSQL 16 it executes the migration image, API health/readiness,
customer and Operations Portal SPA/API proxy routes, the production operations-
API denial, and the design-system review surface. Logs and probe responses are
retained with JSON/JUnit summaries for 30 days. This proves container runtime
portability; it does not prove Google Cloud provisioning, IAM, networking,
deployment, or production security.

The review-only staging runtime contract is part of the same platform suite. It
fails if service exposure becomes unauthenticated, browser workloads gain
database or secret access, identities collapse onto defaults, migration
execution becomes concurrent or retrying, image identity floats, or the
Operations Portal is promoted before its workforce-security blockers close.

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
