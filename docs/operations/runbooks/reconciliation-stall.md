# Runbook: reconciliation stall

Status: decision procedure only. No provider escalation route is active.

## Trigger and classify

Invoke this runbook when reconciliation stops advancing, the oldest unresolved
exception grows unexpectedly, an expected source is absent, or repeated runs
produce the same unexplained variance.

Record the exact reconciliation run, cutoff, source, currency, account or
corridor scope, exception count, oldest exception time, and last known clean
checkpoint. These are facts. Provider availability and root cause remain
hypotheses until verified.

## Contain

1. Assign SEV0 if ledger integrity or loss is suspected. Otherwise use SEV1 for
   a material blocked process and SEV2 only when exposure is bounded with a safe
   workaround.
2. Stop only new commands that would expand unmeasured or unmatched exposure.
3. Preserve source hashes, import identifiers, ledger checkpoints, exception
   records, and retry history.
4. Do not mark exceptions resolved to reduce the queue. Do not substitute stale
   or manually edited source data.

## Diagnose

- Prove whether ingestion, normalization, matching, ledger lookup, exception
  persistence, or operator resolution is stalled.
- Check cutoff and timezone logic before assuming a missing transaction.
- Separate duplicate delivery from duplicate financial effect.
- Confirm every reprocessing attempt uses the same durable identity and cannot
  post twice.

## Recover and close

Record the proposed replay or correction range before execution. Require a
bounded batch, dry-run counts where available, durable idempotency, and an
independent post-run ledger sweep. Provider contact, live data retrieval, or
economic retry requires separate authority.

Close only when the queue advances, every pre-cutoff item has a disposition,
ledger invariants pass, the next scheduled run succeeds, and residual exposure
has a named owner. No freshness SLO is claimed until a target and measurement
source are approved.
