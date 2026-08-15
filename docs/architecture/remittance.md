# Synthetic Remittance Lifecycle

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

## State dimensions

Transfer:

```text
created -> funds_reserved -> submitted -> in_transit
        -> payout_pending -> completed
```

Failure branches:

```text
submitted -> failed (Caliza rejects; reservation released)
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
- Caliza rejection;
- Chapa payout failure followed by refund;
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

These are the PostgreSQL-backed target rules. The current demo applies the
same deduplication and ordering behavior through an in-memory repository, so
it resets on process restart.

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
