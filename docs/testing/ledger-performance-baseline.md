# Ledger balance performance baseline

## Decision

The current aggregate-on-read query remains the correctness reference for the
synthetic and pre-production system. It is not acceptable as the production
balance-read path at scale. A transactionally maintained materialized balance
must be implemented and reconciled to journal truth before production launch or
before any account can approach 100,000 postings, whichever comes first.

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

- Product gate: materialized balances are required before production launch or
  100,000 postings on an account.
- Characterization regression warning: 3,824.921ms p99 at one million postings,
  equal to 125% of this baseline. This is an engineering drift alarm, not a
  customer-facing service-level objective.
- Correctness gate: every measured response must equal the journal-derived
  natural, held, and available balance at both scales.
- Cleanup gate: the characterization must leave no synthetic journal, posting,
  account, product, or hold data after completion.

## Required materialized-balance controls

1. Update the projection atomically with the journal state transition.
2. Preserve journals and postings as immutable accounting truth.
3. Reject negative available balances independently at the database boundary.
4. Rebuild the projection deterministically from posted journals and active
   holds.
5. Run a scheduled drift sweep that compares projection and journal truth.
6. Record every rebuild, drift finding, and correction in the immutable audit
   trail.
7. Prove concurrency, idempotency, crash rollback, restart durability, and
   reconciliation before enabling the projection as the read path.
