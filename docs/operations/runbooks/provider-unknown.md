# Runbook: provider state unknown

Status: decision procedure only. No live provider activation is implied.

## Default decision

Unknown is a failure state for new economic commands. It is not healthy and it
is not permission to retry. Keep the Samra-owned transaction, ledger, audit,
and reconciliation state authoritative while provider outcome is unresolved.

## Contain and classify

1. Open an incident record. Use SEV0 if duplicate movement, financial loss,
   credential compromise, or false ledger state is possible; otherwise use SEV1
   for a critical provider boundary.
2. Stop new affected commands and automatic retries. Preserve unrelated
   operations only when their provider and financial state are independently
   known.
3. Record the Samra command ID, durable idempotency key, provider reference,
   last authenticated response class, timestamps, and current Samra state.
   Never paste a credential or raw provider payload into incident evidence.

## Resolve the unknown

- Distinguish timeout, transport failure, authentication failure, rate limit,
  rejected request, missed webhook, invalid signature, and contradictory
  provider status.
- Use an authenticated provider status lookup only after the provider account,
  credential, endpoint, and authorization are verified.
- Treat an unauthenticated callback, dashboard screenshot, or verbal statement
  as supporting context, not settlement evidence.
- Reconcile the provider result to the Samra ledger. Never alter Samra financial
  truth merely to match an unexplained provider view.

## Retry and recovery gate

Retry only when the operation is classified as retryable, the same durable
idempotency key is preserved, backoff and retry count are bounded, `Retry-After`
is respected, and duplicate-effect tests cover the path. That policy is not
authorized by the current operational contract.

Resume new commands only after provider state is known, ledger and transaction
state agree, reconciliation has no unexplained exception, and the recovery
decision and approver are recorded.
