# Ledger balance performance baseline

## Decision

The aggregate-on-read query is retained only as reconciliation truth. The
transactionally maintained materialized balance is now the application read
path and must pass a 25ms p99 gate at one million postings.

The materialized projection must never replace the immutable journals as the
accounting source of truth. It must be rebuildable, drift-detectable, and updated
inside the same database transaction as journal posting and hold transitions.

## Baseline evidence

Characterization `CLAUDE-LED-043` ran on GitHub-hosted Ubuntu with Node.js
24.19.0 and PostgreSQL 16.15. Each scale used 40 timed reads after three warmup
reads. Synthetic rows were created in one transaction and rolled back after the
measurements.

| Postings on account | p50       | p99       | Mean      | EXPLAIN execution |
| ------------------- | --------- | --------- | --------- | ----------------- |
| 100,000             | 197.681ms | 254.137ms | 199.539ms | 233.339ms         |
| 1,000,000           | 2.767s    | 3.060s    | 2.770s    | 2.999s            |

A 10x increase in posting history produced 12.041x p99 growth. This is at least
linear degradation and was slightly superlinear on the shared runner. At one
million postings, PostgreSQL reported 3,975,005 shared buffer hits and a nested
loop that performed one million primary-key journal lookups.

The full JSON execution plans and JUnit result are retained for 90 days in
[GitHub Actions run 32095865154](https://github.com/haileleuld87/Samra-Pay/actions/runs/32095865154).

## Thresholds

- Product gate: materialized balance reads must remain at or below 25ms p99 at
  one million postings on a single account.
- Projection gate: every measured account must match the journal-and-hold truth
  before and after the scale run.
- Correctness gate: every measured response must equal the journal-derived
  natural, held, and available balance at both scales.
- Cleanup gate: the characterization must leave no synthetic journal, posting,
  account, product, or hold data after completion.

## Implemented materialized-balance controls

1. Journal posting and hold transitions update the projection in the same
   database transaction.
2. Immutable journals and postings remain the accounting source of truth.
3. Direct projection edits and deletes are rejected by database triggers.
4. A controlled, actor-attributed command deterministically rebuilds every
   balance from posted journals and active holds.
5. Drift sweeps compare the projection with journal-and-hold truth and record
   immutable evidence.
6. Concurrency, rollback, hold lifecycle, restart, drift, rebuild, and audit
   behavior are enforced in PostgreSQL acceptance tests.

The first post-materialization GitHub measurement will be added here after the
new gate runs on the Linux/PostgreSQL CI environment.
