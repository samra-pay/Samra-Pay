import assert from "node:assert/strict";
import test from "node:test";
import { convert, money, multiplyByRational, rational } from "./money";
import { createQuote } from "./quote";

test("rational arithmetic stays exact and applies explicit HALF_UP rounding", () => {
  assert.equal(multiplyByRational(100n, rational(1n, 3n), "DOWN"), 33n);
  assert.equal(multiplyByRational(100n, rational(1n, 3n), "HALF_UP"), 33n);
  assert.equal(multiplyByRational(1n, rational(1n, 2n), "HALF_UP"), 1n);
  assert.deepEqual(convert(money(10_000n, "USD"), "ETB", rational(180n, 1n)), {
    amountMinor: 1_800_000n,
    currency: "ETB",
    scale: 2,
  });
});

test("quote snapshots are immutable and contain exact fee and FX results", () => {
  const quote = createQuote({
    id: "quote_1",
    actorId: "actor_1",
    sourceAccountId: "account_1",
    beneficiaryId: "beneficiary_1",
    sourceAmountMinor: 10_000n,
    fundingMethod: "samra_balance",
    deliveryMethod: "bank",
    createdAt: new Date("2026-08-15T12:00:00.000Z"),
  });

  assert.equal(quote.feeAmount.amountMinor, 300n);
  assert.equal(quote.debitAmount.amountMinor, 10_300n);
  assert.equal(quote.recipientAmount.amountMinor, 1_800_000n);
  assert.equal(quote.rate.value.numerator, 180n);
  assert.equal(quote.rate.value.denominator, 1n);
  assert.equal(quote.expiresAt, "2026-08-15T12:10:00.000Z");
  assert.equal(Object.isFrozen(quote), true);
  assert.equal(Object.isFrozen(quote.rate.value), true);
});
