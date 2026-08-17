# Operations Case Management

## Scope

This slice adds durable customer-support case management to the Samra Pay Operations Portal. A case can reference a customer, a transfer, or both. It stores workflow metadata, immutable internal notes, and an append-only history.

Case actions do not mutate balances, ledger entries, transfers, refunds, reversals, reconciliation results, or provider state.

## Authorization

| Role               | Read cases | Open, note, change status | Assign, prioritize, set SLA | Audit access |
| ------------------ | ---------: | ------------------------: | --------------------------: | -----------: |
| Support            |        Yes |                       Yes |                          No |           No |
| Operations analyst |        Yes |                       Yes |                         Yes |           No |
| Compliance         |         No |                        No |                          No |          Yes |
| Administrator      |        Yes |                       Yes |                         Yes |          Yes |

Workforce sessions are server-side, revocable, and carried by an HTTP-only cookie. Client-supplied identity or role headers are never trusted.

## Workflow

Allowed transitions are:

- `open` to `in_progress`
- `in_progress` to `pending_customer` or `resolved`
- `pending_customer` to `in_progress` or `resolved`
- `resolved` to `in_progress` or `closed`
- `closed` is terminal

A resolution is required before a case can be resolved or closed. Closed cases cannot receive notes.

## Durability and concurrency

Every create, update, and note command requires an idempotency key. The key is scoped to the authenticated operator. Exact retries return the original result; reuse with different input is rejected.

Updates require the case version last read by the operator. Stale writes fail with a conflict and must be refreshed. PostgreSQL row locks serialize updates. An advisory transaction lock serializes concurrent retries arriving at different API processes.

The case change, immutable history event, audit event, version increment, and idempotency record commit in one PostgreSQL transaction. A failure rolls back all of them.

## Audit and privacy

Sensitive list and detail reads generate audit events. Mutations generate their audit event atomically with the change. Compliance users retain access to the central audit stream but not support notes, which can contain customer-service context.

## Production gates

The current implementation is synthetic and provider-free. Before production use, Samra Pay must add enterprise identity federation, formal retention and redaction rules, production secret management, alerting, backup and restore evidence, operational SLAs, and a reviewed authorization matrix. Those changes are outside this slice.
