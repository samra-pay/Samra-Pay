# Samra Pay synthetic operations control plane

## Purpose

The operations control plane gives Samra Pay staff a durable, read-only view of synthetic remittance execution without weakening ledger authority. It is designed for transaction search, customer-support troubleshooting, reconciliation review, retry visibility, audit review, and later operational reporting.

It is not production-ready authentication or authorization. It is available only when all of these conditions are explicit:

- `SAMRA_BACKEND_MODE=demo`
- `SAMRA_PROVIDER_MODE=fake`
- `SAMRA_PERSISTENCE_MODE=postgres`
- `SAMRA_INTERNAL_OPERATIONS_ENABLED=true`
- `NODE_ENV` is not `production`

The temporary synthetic operator contract requires `X-Demo-Operator-Id: demo_cs_agent_001` and `X-Demo-Operator-Role: support_readonly`. These headers are a test boundary, not an identity system. Production auth, real staff identities, PII access, retention, deployment, and security hardening remain separate work.

## Durable execution model

`samra_core.remittance_workflow_work` is the durable work queue for fake-provider transfer progression. One row is maintained per transfer.

- Workers claim eligible rows with `FOR UPDATE SKIP LOCKED`.
- A claim has an owner and lease expiry.
- Expired leases are recovered automatically.
- Attempts are persisted and bounded.
- State progress resets the attempt counter for the new transfer version.
- No progress schedules deterministic backoff.
- Retry exhaustion becomes a durable failed work item that requires operator review.
- A worker never edits ledger postings or balances directly. It invokes the existing remittance domain service, which preserves legal state transitions, idempotency, and ledger transaction boundaries.

The transactional outbox uses the same lease discipline. Publication is keyed by the immutable outbox event key, and failed publication remains visible for retry or operator review.

## Audit integrity

Audit events are append-only. PostgreSQL rejects updates and deletes at the table boundary. Worker attempts, outbox publication, reconciliation exceptions, and operator reads produce immutable audit events with actor, action, entity, correlation, metadata, and occurrence time.

Audit metadata must not become a shortcut for secrets or real customer PII. The current data set is synthetic.

## Read-only internal APIs

- `GET /api/v1/internal/operations/summary`
- `GET /api/v1/internal/operations/transfers`
- `GET /api/v1/internal/operations/transfers/{transferId}`
- `GET /api/v1/internal/operations/reconciliation/exceptions`
- `GET /api/v1/internal/operations/audit-events`

The transfer detail response combines canonical transfer state, exact money strings, workflow attempts, status history, provider references and events, outbox state, reconciliation exceptions, and audit evidence. It does not expose a balance-edit operation, database mutation endpoint, or raw ledger posting override.

## Control rules for later interventions

The support dashboard should remain read-only until controlled commands are implemented separately. A future retry, cancel, refund, reversal, or exception-resolution command must include:

1. a verified operator identity and permitted role;
2. a reason code and human note;
3. an idempotency key;
4. a legal domain transition rather than a direct database update;
5. immutable before/after audit evidence;
6. maker-checker approval for high-risk or post-settlement actions;
7. a deterministic response that is safe to replay;
8. tests proving concurrent commands cannot duplicate journals, fees, refunds, or provider commands.

Direct balance edits, direct status edits, audit mutation, deletion of financial history, and silent retry loops are prohibited.

## Dashboard sequence

The internal dashboard should be a separate client of these APIs:

1. operations health and queue summary;
2. transaction search and troubleshooting detail;
3. reconciliation exception queue;
4. audit explorer;
5. derived daily volume, completion, failure, refund, aging, and exception reports;
6. controlled intervention commands only after the authorization and approval model exists.

Reporting must derive from canonical transfers, ledger journals, workflow state, provider evidence, and reconciliation results. It must not create another financial source of truth.
