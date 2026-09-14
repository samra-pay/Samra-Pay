# Synthetic Remittance Lifecycle

Status: implemented and tested with deterministic fake adapters. Crossmint is
the locked Alpha USDC wallet provider, not an approved funding or Ethiopia
payout rail. Those two rails and the remitter-of-record structure remain
unresolved. The current synthetic core does encode Rain, Caliza, and Chapa in
provider types, ports, orchestration, events, database enums, ledger selection,
and reconciliation. They are not active vendor decisions, but they do govern
the implementation today. The
[provider-portability decision](./provider-portability.md) defines the target;
the [dated code audit](../reviews/2026-09-14-provider-portability-code-audit.md)
grades the gap.

## Quote

The server calculates and stores an immutable quote snapshot containing:

- source and destination currencies;
- principal, fee and total debit in minor units;
- exact rate numerator/denominator and rounding rule;
- destination minor units;
- quote creation and expiration timestamps;
- source account, beneficiary and delivery option.

The frontend may validate form shape, but it never supplies fee, final total,
exchange rate or destination amount as truth.

PostgreSQL permits quote lifecycle changes to `state` and `accepted_at`, but a
database trigger rejects changes to the persisted quote identity, parties,
currencies, amounts, rational rate, pricing version, delivery terms, expiration
or creation timestamp. A transfer therefore continues to resolve the exact
economic snapshot it consumed.

## State dimensions

Transfer:

```text
created -> funds_reserved -> submitted -> in_transit
        -> payout_pending -> completed
```

Failure branches:

```text
submitted -> failed (movement provider rejects; reservation released)
in_transit -> refund_pending -> refunded
payout_pending -> refund_pending -> refunded
completed -> reversal_pending -> reversed
```

Funding:

```text
unreserved -> reserved -> captured
reserved -> released
captured -> refund_pending -> refunded
```

Payout:

```text
not_submitted -> submitted -> processing -> paid
submitted/processing -> failed
paid -> reversed
```

Reconciliation:

```text
not_started -> pending -> matched
pending -> exception -> resolved
matched -> exception
```

The public API maps the internal `reversal_pending` and `reversed` transfer
states to `refund_pending` and `refunded` until the public contract adds a
separate reversal vocabulary.

A timeout remains pending. It is not converted into failure.

## Deterministic scenarios

- happy path;
- movement-provider rejection;
- payout-provider failure followed by refund;
- post-completion payout reversal followed by refund;
- provider timeout followed by retry;
- duplicate provider event;
- out-of-order provider event;
- reconciliation amount mismatch;
- missing report line.

Transfer controls accept only transfer scenarios. Reconciliation controls
accept only `happy_path`, `reconciliation_amount_mismatch`, or
`missing_report_line`; the API rejects cross-domain scenario names.

Fake providers do not choose outcomes randomly. Tests or development-only
controls select a named scenario.

## Durable event rules

These are the PostgreSQL-backed target rules. The current demo has durable and
in-memory event scaffolding and ordering tests, but its core events are still
vendor-named and its replay key is not bound to the original transfer, type, and
payload digest. It therefore does not yet satisfy rules 2–3 for live ingress.
The in-memory repository also resets on process restart.

The current single-process demo also serializes state-changing commands so two
requests cannot consume one quote, reserve funds twice, or race a cancellation
against a provider event. PostgreSQL transactions and row locks remain required
before multi-process or durable operation.

1. Persist raw event before processing.
2. Deduplicate by provider and external event ID.
3. Normalize to a provider-neutral canonical event.
4. Lock the affected transfer.
5. Apply transition, ledger action, audit event and outbox event atomically.
6. Defer out-of-order events and retry later.
7. Duplicate events acknowledge successfully without a second side effect.

PostgreSQL will be the first durable inbox/outbox. Redis, Kafka and external
queues are not introduced.
