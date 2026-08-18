# Qase CI reporting

GitHub Actions reports the durable backend acceptance suites to the Qase project
`SAMP`. The encrypted repository secret `QASE_API_TOKEN` is the only credential
used by the reporting job.

## Automated scope

| GitHub gate                   | Source                                                                  | Qase result source                        |
| ----------------------------- | ----------------------------------------------------------------------- | ----------------------------------------- |
| PostgreSQL persistence        | `artifacts/api-server/test/postgres.test.ts`                            | `postgres-persistence.xml`                |
| Compiled process restart      | `artifacts/api-server/test/process-startup-recovery.test.mjs`           | `postgres-process-restart.xml`            |
| Ledger journal assurance      | `artifacts/api-server/test/ledger-journal-assurance.test.ts`            | `ledger-journal-assurance.xml`            |
| Ledger account resolution     | `artifacts/api-server/test/ledger-account-resolution.test.ts`           | `ledger-account-resolution.xml`           |
| Ledger currency and precision | `artifacts/api-server/test/ledger-currency-precision.test.ts`           | `ledger-currency-precision.xml`           |
| Ledger balance computation    | `artifacts/api-server/test/ledger-balance-computation.test.ts`          | `ledger-balance-computation.xml`          |
| Ledger idempotency            | `artifacts/api-server/test/ledger-idempotency.test.ts`                  | `ledger-idempotency.xml`                  |
| Ledger holds lifecycle        | `artifacts/api-server/test/ledger-holds-lifecycle.test.ts`              | `ledger-holds-lifecycle.xml`              |
| Ledger reversals and refunds  | `artifacts/api-server/test/ledger-reversals-refunds.test.ts`            | `ledger-reversals-refunds.xml`            |
| Ledger immutability and audit | `artifacts/api-server/test/ledger-immutability-audit.test.ts`           | `ledger-immutability-audit.xml`           |
| Ledger concurrency/atomicity  | `artifacts/api-server/test/ledger-concurrency-atomicity.test.ts`        | `ledger-concurrency-atomicity.xml`        |
| Ledger performance            | `artifacts/api-server/test/ledger-performance-characterization.test.ts` | `ledger-performance-characterization.xml` |
| Materialized ledger balances  | `artifacts/api-server/test/ledger-materialized-balances.test.ts`        | `ledger-materialized-balances.xml`        |
| Global ledger sweeps          | `artifacts/api-server/test/ledger-sweeps.test.ts`                       | `ledger-sweeps.xml`                       |
| Reconciliation controls       | `artifacts/api-server/test/ledger-reconciliation-controls.test.ts`      | `ledger-reconciliation-controls.xml`      |
| HTTP-to-PostgreSQL acceptance | `artifacts/api-server/test/postgres-http.test.ts`                       | `postgres-http.xml`                       |
| Daily synthetic journeys      | `artifacts/api-server/test/daily-synthetic-journeys.test.ts`            | `daily-synthetic-journeys.xml`            |
| Weekly concurrency soak       | `artifacts/api-server/test/weekly-concurrency-soak.test.ts`             | `weekly-concurrency-soak.xml`             |
| Seeded randomized ledger      | `artifacts/api-server/test/weekly-randomized-ledger.test.ts`            | `weekly-randomized-ledger.xml`            |
| Controlled fault injection    | `artifacts/api-server/test/weekly-fault-injection.test.ts`              | `weekly-fault-injection.xml`              |
| Migration compatibility       | `artifacts/api-server/test/weekly-migration-compatibility.test.ts`      | `weekly-migration-compatibility.xml`      |

Qase identifies the automated cases by their stable Node test names in the JUnit
files. Renaming a test changes its automation identity and must be treated as a
test-case mapping change.

## Governance contract

[`qase-governance.json`](qase-governance.json) is the version-controlled map of
the Qase project, execution environments, release plans, manual catalogs, and
automated JUnit reports. The Linux quality gate validates that every required
report is generated, uploaded, documented, and included in the run-completion
condition.

Automated acceptance uses the Qase environment slug `github-ci-postgres`. It
means an isolated PostgreSQL 16 service in GitHub Actions with synthetic data;
it is not a deployment environment. `replit-development` remains limited to
manual synthetic browser validation.

The same governed CI workflow runs from `main` every day at `06:17 UTC` and
names the resulting Qase record `Samra Pay daily backend acceptance`. The
weekly ledger-performance workflow also uses `github-ci-postgres`; performance
evidence must not appear as an unclassified Qase run. The Saturday weekly
backend-resilience workflow uses the same synthetic environment and publishes
four additional JUnit payloads in one separately titled Qase run. The complete product-stack
cadence and stop conditions are defined in
[`testing-cadence.json`](testing-cadence.json) and explained in
[`testing-strategy.md`](testing-strategy.md).

The current release plans are:

| Plan                             | Cases | Use                                                                        |
| -------------------------------- | ----: | -------------------------------------------------------------------------- |
| P0 — Critical Financial Controls |    22 | Any ledger, money, idempotency, refund, reversal, or reconciliation change |
| P1 — Operations Portal Smoke     |    18 | Workforce, portal, case-management, audit, or reconciliation UI changes    |
| P2 — Full Backend Regression     |    89 | Release candidate or broad platform cutover                                |

The portable-client catalog at
[`qase-portable-client-smoke.csv`](qase-portable-client-smoke.csv) contains 15
manual cases for customer web, iOS, Android, and cross-surface recovery. They are
imported as `SAMP-101` through `SAMP-115` under suite `12 Portable Client Smoke`
and belong to plan `P1 — Customer Web & Mobile Smoke`. Keep the CSV under
version control so the intended case definitions and stable Qase IDs remain
reviewable and recoverable. Future bulk updates must use **Replace matching test
cases** and must first confirm those IDs and suite IDs still match the governance
manifest.

The Claude ledger reports also preserve the exact Qase suite hierarchy in the
JUnit `testsuites` and `testsuite` names. Qase therefore links each result by its
exact case title plus suite path instead of creating a duplicate automated case.

## Claude ledger coverage activated

| Qase case | Automated invariant                                 |
| --------- | --------------------------------------------------- |
| SAMP-39   | CLAUDE-LED-050 structural journal sweep             |
| SAMP-40   | CLAUDE-LED-048 per-journal balance sweep            |
| SAMP-41   | CLAUDE-LED-049 global trial balance                 |
| SAMP-42   | CLAUDE-LED-051 hold integrity sweep                 |
| SAMP-43   | CLAUDE-LED-002 unresolvable account rollback        |
| SAMP-44   | CLAUDE-LED-006 single-leg rejection                 |
| SAMP-45   | CLAUDE-LED-003 unequal debit/credit rejection       |
| SAMP-46   | CLAUDE-LED-005 empty journal rejection              |
| SAMP-47   | CLAUDE-LED-010 mid-loop resolution rollback         |
| SAMP-48   | CLAUDE-LED-004 independent database balance guard   |
| SAMP-49   | CLAUDE-LED-001 balanced two-leg baseline            |
| SAMP-50   | CLAUDE-LED-009 contiguous multi-leg posting         |
| SAMP-51   | CLAUDE-LED-011 exact account-code resolution        |
| SAMP-52   | CLAUDE-LED-040 normal-side balance aggregation      |
| SAMP-53   | CLAUDE-LED-041 posted-only balance truth            |
| SAMP-54   | CLAUDE-LED-042 posted, held, and available balance  |
| SAMP-55   | CLAUDE-LED-020 business-event replay idempotency    |
| SAMP-56   | CLAUDE-LED-007 database zero-amount rejection       |
| SAMP-57   | CLAUDE-LED-008 database negative-amount rejection   |
| SAMP-58   | CLAUDE-LED-012 nonexistent account reference        |
| SAMP-59   | CLAUDE-LED-013 orphan posting rejection             |
| SAMP-60   | CLAUDE-LED-014 posted-account delete restriction    |
| SAMP-61   | CLAUDE-LED-015 unique account-code enforcement      |
| SAMP-62   | CLAUDE-LED-016 cross-currency journal rejection     |
| SAMP-63   | CLAUDE-LED-017 large-value precision round-trip     |
| SAMP-64   | CLAUDE-LED-018 deterministic rational FX snapshot   |
| SAMP-65   | CLAUDE-LED-019 balanced zero-fee capture            |
| SAMP-66   | CLAUDE-LED-024 distinct business events             |
| SAMP-67   | CLAUDE-LED-023 idempotent hold events               |
| SAMP-68   | CLAUDE-LED-022 committed-response-loss retry        |
| SAMP-69   | CLAUDE-LED-021 concurrent journal replay            |
| SAMP-70   | CLAUDE-LED-025 active hold and available balance    |
| SAMP-71   | CLAUDE-LED-026 capture principal and fee            |
| SAMP-72   | CLAUDE-LED-027 release without journal              |
| SAMP-73   | CLAUDE-LED-028 idempotent double capture            |
| SAMP-74   | CLAUDE-LED-030 available-balance reserve boundary   |
| SAMP-75   | CLAUDE-LED-029 released-hold capture rejection      |
| SAMP-76   | CLAUDE-LED-036 exact mirrored reversal              |
| SAMP-77   | CLAUDE-LED-038 original journal remains unchanged   |
| SAMP-78   | CLAUDE-LED-037 idempotent reversal                  |
| SAMP-79   | CLAUDE-LED-039 concurrent reversal claim            |
| SAMP-80   | CLAUDE-LED-044 posted ledger immutability           |
| SAMP-81   | CLAUDE-LED-046 audit-event immutability             |
| SAMP-82   | CLAUDE-LED-045 actor-attributed ledger mutations    |
| SAMP-83   | CLAUDE-LED-047 audit-only transfer reconstruction   |
| SAMP-84   | CLAUDE-LED-032 single locked transaction connection |
| SAMP-85   | CLAUDE-LED-031 concurrent reserve oversubscription  |
| SAMP-86   | CLAUDE-LED-033 capture/release terminal race        |
| SAMP-87   | CLAUDE-LED-034 mid-loop posting rollback            |
| SAMP-88   | CLAUDE-LED-035 pre-post connection-loss rollback    |
| SAMP-89   | CLAUDE-LED-043 balance-read scale characterization  |
| SAMP-90   | CLAUDE-LED-052 controlled reconciliation resolution |

Two post-import automated controls extend the original 52-case Claude ledger
set. Qase links them by their stable case titles and suite path:

- Materialized ledger balances remain journal-derived under concurrency,
  rollback, restart, drift, and rebuild.
- Materialized balance sweep matches journal and active-hold truth.

The LED-020 implementation also rejects reuse of the same business-event identity
with changed description, metadata, account, side, ordering, or amount. An
idempotent replay can return the original journal only when the complete journal
command is identical.

Journal creation uses the business-event unique index as an atomic claim. A
concurrent losing caller waits for the winning transaction, validates the full
persisted command and returns the winning journal instead of surfacing a raw
unique-constraint error. Hold-event replay uses an atomic conflict-safe insert
for the same reason.

## Run behavior

- Pull requests and pushes create a Qase automated run after both PostgreSQL jobs
  finish.
- A run started from Qase supplies its run ID through `workflow_dispatch`; the
  workflow links to and updates that run instead of creating another one.
- The two GitHub test jobs remain authoritative for pass or fail. A Qase API
  outage is non-blocking for ordinary GitHub-triggered CI, but Qase-triggered runs
  fail if their reporting contract fails.
- JUnit payloads must contain a non-empty standard test suite before a Qase run is
  updated. A run is completed only after all 16 required result uploads succeed.
- Pull requests from forks do not receive the repository token and skip the Qase
  reporting job.
- JUnit artifacts are retained in GitHub for 14 days as independent evidence.

The ledger performance case runs in its own workflow when balance-related code
changes, on manual dispatch, and weekly. It is a required product gate: the
materialized read path must remain at or below 25ms p99 with one million
postings on the account. The workflow also records p50, PostgreSQL execution
plans, and observed growth. Its JSON and JUnit evidence are retained for 90
days. Ordinary pull requests that do not affect the ledger balance path do not
pay the one-million-posting runtime cost.
The measured baseline and resulting materialization gate are recorded in
[`ledger-performance-baseline.md`](ledger-performance-baseline.md).

The weekly backend-resilience gate is intentionally separate from the fast CI
lane. It runs at `07:43 UTC` every Saturday and on manual dispatch. Its default
inputs are 24 concurrency rounds, 96 deterministic ledger steps using seed
`23063`, and eight controlled fault rounds. The migration test creates and
drops its own database inside the disposable PostgreSQL service, upgrades a
seeded migration-`0007` snapshot to current, and proves current migration and
seed replay are idempotent. The four JUnit files are retained for 90 days.

## Release-candidate reporting

The manual `Immutable release candidate` workflow creates one Qase run for the
exact candidate SHA and uploads `release-gates.xml`. Its stable cases summarize
candidate identity, full workspace quality, commercial isolation, migrations,
PostgreSQL/ledger controls, HTTP and restart behavior, weekly resilience, and
the million-posting performance gate. The detailed JUnit files remain in the
same GitHub release artifact and are individually SHA-256 hashed by the release
manifest. Persistence, HTTP/restart, resilience, and performance run against
four independent disposable PostgreSQL databases to prevent cross-suite state
from changing later test baselines.

Qase creation, upload, and completion are required release gates. An ordinary
Qase outage remains non-blocking for pull-request CI, but it blocks release-
candidate certification because the required traceability record is missing.
The candidate artifact is still uploaded first and records the failed Qase gate.
Qase run creation starts only after the stable gate payload exists. Once a run
is created, the workflow closes it even when result upload fails, preventing an
orphaned in-progress run while preserving the failed upload gate.
The full contract is [`release-evidence-contract.json`](release-evidence-contract.json).

## Manual scope

Use P0 for financial-control changes, P1 Operations Portal Smoke for workforce
and operations changes, and P1 Customer Web & Mobile Smoke for portable-client
changes. Use P2 Full Backend Regression before a release candidate or broad
platform cutover. Manual runs remain the acceptance record for visual,
role-specific, and cross-surface behavior. CI results supplement those cases;
they do not mark manual cases complete.

## Credential rotation

Create a replacement Qase API token, update the GitHub Actions secret named
`QASE_API_TOKEN`, verify one automated run, and then revoke the previous token.
Never store the token in source code, workflow YAML, logs, or test fixtures.
