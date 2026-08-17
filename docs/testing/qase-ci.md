# Qase CI reporting

GitHub Actions reports the durable backend acceptance suites to the Qase project
`SAMP`. The encrypted repository secret `QASE_API_TOKEN` is the only credential
used by the reporting job.

## Automated scope

| GitHub gate                   | Source                                            | Qase result source         |
| ----------------------------- | ------------------------------------------------- | -------------------------- |
| PostgreSQL persistence        | `artifacts/api-server/test/postgres.test.ts`      | `postgres-persistence.xml` |
| HTTP-to-PostgreSQL acceptance | `artifacts/api-server/test/postgres-http.test.ts` | `postgres-http.xml`        |

Qase identifies the automated cases by their stable Node test names in the JUnit
files. Renaming a test changes its automation identity and must be treated as a
test-case mapping change.

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

## Manual scope

The existing manual Qase plan remains the acceptance record for operator-facing
workflow review, role-specific behavior, audit-log inspection, and visual
verification of double-entry postings. CI results supplement those cases; they do
not mark manual cases complete.

## Credential rotation

Create a replacement Qase API token, update the GitHub Actions secret named
`QASE_API_TOKEN`, verify one automated run, and then revoke the previous token.
Never store the token in source code, workflow YAML, logs, or test fixtures.
