# `@workspace/ledger`

Pure TypeScript double-entry ledger rules for the Samra Pay logic-truth prototype.

This package deliberately has no database, HTTP, provider, or frontend dependency. It proves the accounting behavior before persistence is attached. All amounts are `bigint` minor units; a value such as `$100.00` is represented as `10000n` with currency `USD`.

## Guarantees

- Every posted journal has at least two positive lines, one currency, and equal debit and credit totals.
- Posted journal content is frozen and has no update or delete API.
- A reversal is a new journal with the exact accounts, amounts, and line order of the original and the opposite side.
- Logical source identifiers are unique. Optional idempotency keys make exact retries return the original result and reject changed payloads.
- Holds are single-use state machines: `active` becomes exactly one of `captured`, `released`, or `expired`.
- Enforced accounts cannot have a negative available balance after a post or hold.
- IDs, ordering, and the default clock are deterministic for repeatable demo scenarios.

## Balance meanings

`getAccountBalance()` returns:

- `debitPostedMinor` and `creditPostedMinor`: gross posted totals.
- `postedBalanceMinor`: debit total minus credit total, regardless of account type.
- `naturalBalanceMinor`: the balance oriented to the account's natural side. Assets and expenses are debit-normal; liabilities, equity, and revenue are credit-normal.
- `heldMinor`: the total of active holds.
- `availableMinor`: natural balance minus active holds.

An expired-by-time hold remains active until `expireHold()` is explicitly called. Persistence or a worker can drive that transition later without making wall-clock behavior implicit in the kernel.

## Local verification

```sh
pnpm --filter @workspace/ledger test
pnpm --filter @workspace/ledger typecheck
```
