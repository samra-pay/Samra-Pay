# Control Ledger v0

## Model

The ledger is double-entry, append-only and single-currency per journal.
PostgreSQL `bigint` and TypeScript `bigint` store minor units. JSON APIs
serialize those values as strings.

Accounting balances are derived from postings:

- debit-normal account: debits minus credits;
- credit-normal account: credits minus debits;
- available customer balance: natural posted balance minus active holds.

The application reads those values from a transactionally maintained materialized
projection. The projection is mutable only through database triggers attached to
journal posting, hold transitions, and controlled rebuild commands. Direct edits
and deletes are rejected. Posted journals, postings, and active holds remain the
rebuildable source of truth.

## Initial chart of accounts

| Code                                | Name                          | Type      | Normal side | Currency |
| ----------------------------------- | ----------------------------- | --------- | ----------- | -------- |
| `rain.usd.control`                  | Rain USD control asset        | asset     | debit       | USD      |
| `customer.usd.available`            | Customer available liability  | liability | credit      | USD      |
| `remittance.usd.principal_clearing` | Remittance principal clearing | liability | credit      | USD      |
| `remittance.usd.deferred_fee`       | Deferred remittance fee       | liability | credit      | USD      |
| `remittance.usd.fee_revenue`        | Remittance fee revenue        | revenue   | credit      | USD      |

Customer liability accounts are instantiated per synthetic customer. Do not
create a fictional ETB cash or custody account until written provider structure
shows that Samra owns or prefunds an ETB balance.

## Example journals

Opening USD 4,250.00:

```text
Debit   Rain USD control asset                425000
Credit  Customer available liability         425000
```

Confirm USD 100.00 plus USD 3.00:

```text
No journal.
Create active hold                           10300
Posted customer balance                     425000
Available customer balance                  414700
```

Fake Caliza accepts:

```text
Debit   Customer available liability          10300
Credit  Remittance principal clearing         10000
Credit  Deferred remittance fee                  300
```

The acceptance journal and hold capture are one operation.

Fake settlement debits the Rain source:

```text
Debit   Remittance principal clearing         10000
Credit  Rain USD control asset                 10000
```

Fake Chapa confirms payout:

```text
Debit   Deferred remittance fee                  300
Credit  Remittance fee revenue                    300
```

## Failure rules

- Caliza rejection before capture releases the hold and creates no journal.
- Failure after capture but before settlement reverses the capture journal.
- Failure after settlement moves to `refund_pending`; it does not fabricate
  restored customer funds.
- Fake refund confirmation posts provider cash restoration and customer
  restoration exactly once.
- Missing or short refund evidence creates a reconciliation exception.

## Required invariants

- at least two postings;
- positive amounts only;
- one journal currency;
- every account matches the journal currency;
- total debits equal total credits;
- logical source is unique and claimed atomically under concurrent retries;
- an exact business-event replay returns its original journal, while a changed
  command is rejected and a distinct event remains distinct;
- a journal can reverse one journal and an original can be reversed once;
- reversal lines exactly exchange debit and credit;
- holds exist only on spendable accounts;
- active holds transition once to captured, released or expired;
- each hold lifecycle event is append-only and unique per hold and event type;
- balance check and hold mutation lock the affected account in PostgreSQL;
- an enforced account cannot have negative available balance.
- overlapping journal writers acquire account locks in canonical order using a
  lock strength compatible with posting foreign-key protection;
- the materialized natural, held, available, posting-count, and hold-count
  values must match journal-and-hold truth;
- every drift sweep and rebuild records actor-attributed immutable audit
  evidence;
- a rebuild command is idempotent by command reference and rejects changed
  operator evidence.
