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
3. Run the workflow from the default branch.
4. Accept the candidate only when `Immutable release-candidate evidence` passes,
   the Qase run is complete, and the downloaded manifest says
   `"overallStatus": "passed"`.

## Evidence produced

- exact candidate commit, tree, parents, workflow run, attempt, actor, and main
  ancestry decision;
- full Linux workspace test, typecheck, contract, portability, and build gates;
- isolated commercial typecheck and build;
- current migrations and repeatable synthetic seed;
- all governed PostgreSQL, ledger, HTTP, daily journey, and restart JUnit files;
- weekly concurrency, randomized-ledger, fault-injection, and migration-upgrade
  JUnit files;
- 100,000/1,000,000-posting performance JUnit and JSON evidence;
- Qase project, environment, run ID, and run URL;
- SHA-256, byte length, and path for every required evidence file;
- an independent SHA-256 record for the manifest itself.

GitHub Actions artifact v4 retains the bundle for 365 days. The artifact name
includes the SHA-derived release ID, workflow run ID, and run attempt, so a
rerun creates a separate evidence object rather than overwriting the first.

## Stop conditions

The candidate fails if any required gate fails, is cancelled, is skipped, or is
missing; if any evidence file is empty or absent; if Qase creation, upload, or
completion fails; if the tested SHA differs from the requested SHA; or if the
commit is not contained in GitHub `main`.

Evidence is uploaded before the final stop-condition check. A failed candidate
therefore remains inspectable, but it cannot be treated as passed.

## Boundaries

This workflow uses synthetic data and its own disposable PostgreSQL 16 service.
It does not deploy, access Replit, change cloud resources, migrate a shared
database, use real providers, read customer data, authorize production money,
or certify legal and regulatory readiness.
