# Runbook: database recovery

Status: production procedure incomplete. The repository rehearsal is synthetic
and cannot authorize a cloud restore, cutover, or recovery claim.

## Declare and protect the source

1. Open an incident record. Use SEV0 for suspected data loss, corruption,
   unauthorized change, or ledger-integrity breach.
2. Stop affected writes when continued mutation could increase loss or destroy
   the recovery point. Record who approved the stop.
3. Preserve the exact release, migration identity, database event timeline,
   backup metadata, audit evidence, and observed ledger/reconciliation state.
4. Do not restore over the source. Do not delete a damaged instance or backup.
   Do not place a restored database behind traffic during diagnosis.

## Select a recovery point

Record the incident time, last known valid business event, available backup or
point-in-time candidates, expected data-loss interval, and unresolved commands.
Production RPO and RTO targets are not approved, so report measured timestamps
without claiming target attainment.

A cloud restore requires explicit authority for cloud access, spend, data
handling, and an isolated destination. Verify source project, destination,
region, encryption, network isolation, identities, and deletion protection
before executing it.

## Verify the isolated restore

Before any cutover decision, independently prove:

- backup identity, recovery point, database version, and migration history;
- expected table, constraint, index, sequence, and trigger state;
- zero unbalanced posted journals and zero per-currency imbalance;
- zero materialized-balance drift;
- idempotency, inbox, outbox, audit, holds, reversals, and refunds are coherent;
- every reconciliation exception has a disposition; and
- no application or public traffic can reach the isolated clone.

The local weekly rehearsal documents useful verification patterns, but its
timings are not production recovery estimates.

## Cutover decision

The proposal must name the incident commander, database owner, financial
reviewer, exact destination, traffic plan, rollback, evidence queries, customer
impact, and residual data gap. Cutover requires written approval. Afterward,
verify revision identity, readiness, authorization, ledger/reconciliation
invariants, and a bounded synthetic journey before restoring broader traffic.

Retain metadata, hashes, query results, approvals, and timestamps. Never attach
a database dump or raw customer rows to CI, Qase, incident, or postmortem
evidence.
