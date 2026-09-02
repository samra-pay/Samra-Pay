# Runbook: ledger integrity breach

Status: decision procedure only. A suspected breach is SEV0.

## Trigger

Invoke this runbook for an unbalanced posted journal, cross-currency imbalance,
materialized-balance drift, duplicate economic effect, missing immutable audit
record, unexplained reconciliation variance, or evidence that the database and
customer-visible balance disagree.

## Contain

1. Open an incident record and identify the incident commander, technical lead,
   operations lead, and scribe.
2. Stop affected new economic commands. Preserve read access only when it cannot
   expose a balance known to be false or misleading.
3. Preserve the exact release identity, ledger rows, audit rows, reconciliation
   records, provider references, and relevant logs. Export identifiers and
   hashes, not secrets or raw provider payloads.
4. Do not edit or delete journal or posting rows. Do not repair history with an
   ad hoc SQL update. Do not silently replay a provider event.

## Establish financial truth

- Bound the earliest and latest affected business events.
- Recompute journal debit/credit totals per currency.
- Compare materialized balances with the ledger-derived truth view.
- Check idempotency keys, provider-event inbox state, holds, reversals, refunds,
  outbox records, and reconciliation exceptions.
- Separate a display defect from a persisted-ledger defect. The control ledger
  and executed audit evidence govern, not a screen or provider dashboard alone.

## Recovery gate

A recovery proposal must state the affected records, invariant being restored,
mechanism, reviewer, rollback, and proof query. Use append-only compensating
entries through an approved domain path when correction is required. A database
restore is a separate decision and follows the database-recovery runbook.

Resume commands only after an independent reviewer confirms zero unbalanced
journals, zero currency imbalance, zero balance-projection drift, resolved or
explicitly owned reconciliation exceptions, correct idempotency behavior, and
an auditable correction chain.

Record financial exposure separately from customer impact. Close only after
every affected event has a disposition and a postmortem owner.
