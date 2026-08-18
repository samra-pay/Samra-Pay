# Qase CI reporting

GitHub Actions reports the durable backend acceptance suites to the Qase project
`SAMP`. The encrypted repository secret `QASE_API_TOKEN` is the only credential
used by the reporting job.

## Automated scope

| GitHub gate                   | Source                                                                  | Qase result source                        |
| ----------------------------- | ----------------------------------------------------------------------- | ----------------------------------------- |
| PostgreSQL persistence        | `artifacts/api-server/test/postgres.test.ts`                            | `postgres-persistence.xml`                |
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
| Global ledger sweeps          | `artifacts/api-server/test/ledger-sweeps.test.ts`                       | `ledger-sweeps.xml`                       |
| HTTP-to-PostgreSQL acceptance | `artifacts/api-server/test/postgres-http.test.ts`                       | `postgres-http.xml`                       |

Qase identifies the automated cases by their stable Node test names in the JUnit
files. Renaming a test changes its automation identity and must be treated as a
test-case mapping change.

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
  updated. A run is completed only after both result uploads succeed.
- Pull requests from forks do not receive the repository token and skip the Qase
  reporting job.
- JUnit artifacts are retained in GitHub for 14 days as independent evidence.

The ledger performance case runs in its own workflow when balance-related code
changes, on manual dispatch, and weekly. It is informational rather than a
product pass/fail threshold: the workflow records p50, p99, PostgreSQL execution
plans, observed growth, and a 25% regression-warning margin. Its JSON and JUnit
evidence are retained for 90 days. Ordinary pull requests that do not affect the
ledger balance path do not pay the one-million-posting runtime cost.
The measured baseline and resulting materialization gate are recorded in
[`ledger-performance-baseline.md`](ledger-performance-baseline.md).

## Manual scope

The existing manual Qase plan remains the acceptance record for operator-facing
workflow review, role-specific behavior, audit-log inspection, and visual
verification of double-entry postings. CI results supplement those cases; they do
not mark manual cases complete.

## Credential rotation

Create a replacement Qase API token, update the GitHub Actions secret named
`QASE_API_TOKEN`, verify one automated run, and then revoke the previous token.
Never store the token in source code, workflow YAML, logs, or test fixtures.
