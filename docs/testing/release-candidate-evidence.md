# Immutable release-candidate evidence

## Decision

A Samra Pay release candidate is an exact commit already contained in GitHub
`main`. It is not a branch, deployment, Replit preview, tag, or mutable label.
The release identifier is derived from that commit as `rc-<first 12 SHA
characters>`.

The checkout action fetches full branch history with the short-lived GitHub
token, removes stored Git credentials, and then verifies the candidate against
the fetched `origin/main` reference. No unauthenticated follow-up fetch is
required, so the control works for this private repository.

## How to run it

1. Open **Actions → Immutable release candidate → Run workflow**.
2. Paste the full 40-character GitHub `main` commit into `candidate_sha`.
3. Run the workflow from the default branch. Leave `report_to_qase` off unless
   optional external reporting is wanted.
4. Accept the candidate only when `Immutable release-candidate evidence` passes,
   and the downloaded version 2 manifest says
   `"overallStatus": "passed"`.

## Evidence produced

- exact candidate commit, tree, parents, workflow run, attempt, actor, and main
  ancestry decision;
- exact-SHA repository policy, source security, fixed critical dependency,
  committed-secret, high-risk configuration, SBOM, and dependency-license
  evidence;
- content-addressed identities plus fixed-critical vulnerability and
  high/critical secret reports for all five runtime images, built from pinned
  Dockerfile frontend and base-image digests;
- full Linux workspace test, typecheck, contract, portability, and build gates;
- isolated commercial typecheck and build;
- current migrations and repeatable synthetic seed;
- all governed PostgreSQL, ledger, HTTP, daily journey, and restart JUnit files;
- weekly concurrency, randomized-ledger, fault-injection, and migration-upgrade
  JUnit files;
- 100,000/1,000,000-posting performance JUnit and JSON evidence;
- required local Qase reporting state and actual step outcomes, with nullable
  run ID/URL; external reporting is optional and disabled by default;
- SHA-256, byte length, and path for every required evidence file;
- an independent SHA-256 record for the manifest itself.

The pinned GitHub Actions artifact action retains the bundle for 365 days. The artifact name
includes the SHA-derived release ID, workflow run ID, and run attempt, so a
rerun creates a separate evidence object rather than overwriting the first.

## Stop conditions

The candidate fails if any required gate, including any of the five parallel
runtime-image scans or the exact-SHA security aggregate, fails, is cancelled,
is skipped, or is missing; if any required evidence file is empty or absent;
if local reporting metadata is inconsistent; if the tested SHA differs from the
requested SHA; or if the commit is not contained in GitHub `main`.

Evidence is uploaded before the final stop-condition check. A failed candidate
therefore remains inspectable, but it cannot be treated as passed.

## Boundaries

This workflow uses synthetic data and five separately migrated and seeded
disposable PostgreSQL 16 databases: persistence, HTTP/restart, resilience,
recovery, and performance. A suite cannot inherit ledger or balance mutations from another
suite. The workflow does not deploy, access Replit, change cloud resources,
migrate a shared database, use real providers, read customer data, authorize
production money, or certify legal and regulatory readiness.

## Reporting policy transition

The [5 September decision](../architecture/optional-qase-reporting.md) makes
external Qase failures non-blocking for release eligibility. All ten engineering
gates and all 49 local evidence files remain mandatory. `qase-run.json` records
disabled, failed, or successful reporting and remains content-addressed.
Version 1 artifacts and prior failed runs cannot be reclassified: merge the
reviewed change, then issue fresh version 2 evidence for that exact commit.
