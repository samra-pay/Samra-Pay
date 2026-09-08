import { InMemoryLedgerRepository } from "./fixtures/in-memory-ledger.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DuplicateEntityError,
  DuplicateSourceError,
  HoldStateError,
  IdempotencyConflictError,
  InsufficientAvailableBalanceError,
  InvalidLedgerInputError,
  JournalAlreadyReversedError,
  NotFoundError,
  type JournalDraft,
} from "../src/index.js";

function createFundedLedger(amountMinor = 10_000n): {
  ledger: InMemoryLedgerRepository;
  cashId: string;
  customerId: string;
  revenueId: string;
} {
  const ledger = new InMemoryLedgerRepository();
  const cash = ledger.createAccount({
    id: "cash",
    name: "Rain control cash",
    type: "asset",
    currency: "USD",
  });
  const customer = ledger.createAccount({
    id: "customer",
    name: "Customer available balance",
    type: "liability",
    currency: "USD",
    enforceAvailableBalance: true,
  });
  const revenue = ledger.createAccount({
    id: "revenue",
    name: "Fee revenue",
    type: "revenue",
    currency: "USD",
  });
  ledger.postJournal({
    source: { type: "seed", id: "opening-funds" },
    description: "Seed customer funds",
    currency: "USD",
    postings: [
      { accountId: cash.id, side: "debit", amountMinor },
      { accountId: customer.id, side: "credit", amountMinor },
    ],
  });
  return {
    ledger,
    cashId: cash.id,
    customerId: customer.id,
    revenueId: revenue.id,
  };
}

function spendDraft(
  customerId: string,
  revenueId: string,
  amountMinor: bigint,
): JournalDraft {
  return {
    source: { type: "transfer", id: `capture-${amountMinor.toString()}` },
    description: "Capture transfer funds",
    currency: "USD",
    postings: [
      { accountId: customerId, side: "debit", amountMinor },
      { accountId: revenueId, side: "credit", amountMinor },
    ],
  };
}

describe("accounts and deterministic repository behavior", () => {
  it("derives natural sides and creates deterministic identifiers and timestamps", () => {
    const first = new InMemoryLedgerRepository();
    const second = new InMemoryLedgerRepository();

    const firstAsset = first.createAccount({
      name: "Cash",
      type: "asset",
      currency: "USD",
    });
    const firstLiability = first.createAccount({
      name: "Customer funds",
      type: "liability",
      currency: "USD",
    });
    const secondAsset = second.createAccount({
      name: "Cash",
      type: "asset",
      currency: "USD",
    });

    assert.equal(firstAsset.id, "account_000001");
    assert.equal(firstLiability.id, "account_000002");
    assert.equal(firstAsset.normalSide, "debit");
    assert.equal(firstLiability.normalSide, "credit");
    assert.equal(firstAsset.createdAt, "2000-01-01T00:00:00.000Z");
    assert.deepEqual(secondAsset, firstAsset);
  });

  it("rejects invalid currencies, duplicate IDs, and missing entities", () => {
    const ledger = new InMemoryLedgerRepository();
    assert.throws(
      () =>
        ledger.createAccount({ name: "Cash", type: "asset", currency: "usd" }),
      InvalidLedgerInputError,
    );
    ledger.createAccount({
      id: "cash",
      name: "Cash",
      type: "asset",
      currency: "USD",
    });
    assert.throws(
      () =>
        ledger.createAccount({
          id: "cash",
          name: "Other",
          type: "asset",
          currency: "USD",
        }),
      DuplicateEntityError,
    );
    assert.throws(() => ledger.getAccount("missing"), NotFoundError);
  });
});

describe("journal invariants and balances", () => {
  it("posts a balanced journal and reports debit, natural, held, and available balances", () => {
    const { ledger, cashId, customerId } = createFundedLedger();

    assert.deepEqual(ledger.getAccountBalance(cashId), {
      accountId: cashId,
      currency: "USD",
      normalSide: "debit",
      debitPostedMinor: 10_000n,
      creditPostedMinor: 0n,
      postedBalanceMinor: 10_000n,
      naturalBalanceMinor: 10_000n,
      heldMinor: 0n,
      availableMinor: 10_000n,
    });
    assert.deepEqual(ledger.getAccountBalance(customerId), {
      accountId: customerId,
      currency: "USD",
      normalSide: "credit",
      debitPostedMinor: 0n,
      creditPostedMinor: 10_000n,
      postedBalanceMinor: -10_000n,
      naturalBalanceMinor: 10_000n,
      heldMinor: 0n,
      availableMinor: 10_000n,
    });
  });

  it("requires at least two positive postings and equal debit and credit totals", () => {
    const { ledger, cashId, customerId } = createFundedLedger();
    const base = {
      source: { type: "test", id: "bad" },
      description: "Bad journal",
      currency: "USD",
    } as const;

    assert.throws(
      () =>
        ledger.postJournal({
          ...base,
          postings: [{ accountId: cashId, side: "debit", amountMinor: 1n }],
        }),
      InvalidLedgerInputError,
    );
    assert.throws(
      () =>
        ledger.postJournal({
          ...base,
          postings: [
            { accountId: cashId, side: "debit", amountMinor: 0n },
            { accountId: customerId, side: "credit", amountMinor: 0n },
          ],
        }),
      InvalidLedgerInputError,
    );
    assert.throws(
      () =>
        ledger.postJournal({
          ...base,
          postings: [
            { accountId: cashId, side: "debit", amountMinor: 2n },
            { accountId: customerId, side: "credit", amountMinor: 1n },
          ],
        }),
      InvalidLedgerInputError,
    );
    assert.equal(ledger.listJournals().length, 1);
  });

  it("rejects accounts whose currencies do not match the journal", () => {
    const { ledger, cashId } = createFundedLedger();
    const etb = ledger.createAccount({
      name: "ETB cash",
      type: "asset",
      currency: "ETB",
    });
    assert.throws(
      () =>
        ledger.postJournal({
          source: { type: "test", id: "mixed-currency" },
          description: "Mixed currency",
          currency: "USD",
          postings: [
            { accountId: cashId, side: "debit", amountMinor: 1n },
            { accountId: etb.id, side: "credit", amountMinor: 1n },
          ],
        }),
      InvalidLedgerInputError,
    );
  });

  it("allows a negative natural balance only when enforcement is disabled", () => {
    const ledger = new InMemoryLedgerRepository();
    const asset = ledger.createAccount({
      name: "Asset",
      type: "asset",
      currency: "USD",
    });
    const revenue = ledger.createAccount({
      name: "Revenue",
      type: "revenue",
      currency: "USD",
    });
    ledger.postJournal({
      source: { type: "test", id: "negative-unenforced" },
      description: "Unenforced overdraft",
      currency: "USD",
      postings: [
        { accountId: asset.id, side: "credit", amountMinor: 50n },
        { accountId: revenue.id, side: "debit", amountMinor: 50n },
      ],
    });
    assert.equal(ledger.getAccountBalance(asset.id).availableMinor, -50n);
  });

  it("exposes runtime-frozen journal content and no mutation API", () => {
    const { ledger } = createFundedLedger();
    const journal = ledger.listJournals()[0];
    assert.ok(journal);
    assert.equal(Object.isFrozen(journal), true);
    assert.equal(Object.isFrozen(journal.postings), true);
    assert.equal(Object.isFrozen(journal.postings[0]), true);
    assert.equal(Object.isFrozen(journal.source), true);
    assert.equal(Object.isFrozen(journal.metadata), true);
    assert.throws(() => {
      (journal as { description: string }).description = "mutated";
    }, TypeError);
    assert.throws(() => {
      (journal.postings as unknown as Array<unknown>).push({});
    }, TypeError);
  });
});

describe("logical source uniqueness and idempotency", () => {
  it("returns the original journal for an exact retry", () => {
    const { ledger, customerId, revenueId } = createFundedLedger();
    const command = {
      ...spendDraft(customerId, revenueId, 100n),
      idempotencyKey: "post-transfer-1",
    };
    const first = ledger.postJournal(command);
    const retry = ledger.postJournal(command);

    assert.strictEqual(retry, first);
    assert.equal(ledger.listJournals().length, 2);
  });

  it("rejects an idempotency key reused with changed content", () => {
    const { ledger, customerId, revenueId } = createFundedLedger();
    ledger.postJournal({
      ...spendDraft(customerId, revenueId, 100n),
      idempotencyKey: "same-key",
    });
    assert.throws(
      () =>
        ledger.postJournal({
          ...spendDraft(customerId, revenueId, 200n),
          idempotencyKey: "same-key",
        }),
      IdempotencyConflictError,
    );
  });

  it("rejects a duplicate logical source even under a new idempotency key", () => {
    const { ledger, customerId, revenueId } = createFundedLedger();
    const draft = spendDraft(customerId, revenueId, 100n);
    ledger.postJournal({ ...draft, idempotencyKey: "first-request" });
    assert.throws(
      () => ledger.postJournal({ ...draft, idempotencyKey: "second-request" }),
      DuplicateSourceError,
    );
  });
});

describe("hold lifecycle and available-balance enforcement", () => {
  it("reserves and releases funds once", () => {
    const { ledger, customerId } = createFundedLedger();
    const hold = ledger.createHold({
      accountId: customerId,
      amountMinor: 3_000n,
      source: { type: "transfer", id: "reserve-1" },
    });
    assert.equal(hold.status, "active");
    assert.equal(ledger.getAccountBalance(customerId).heldMinor, 3_000n);
    assert.equal(ledger.getAccountBalance(customerId).availableMinor, 7_000n);

    const released = ledger.releaseHold(hold.id, "customer cancelled");
    assert.equal(released.status, "released");
    assert.equal(released.resolutionReason, "customer cancelled");
    assert.equal(ledger.getAccountBalance(customerId).heldMinor, 0n);
    assert.equal(ledger.getAccountBalance(customerId).availableMinor, 10_000n);
    assert.throws(() => ledger.releaseHold(hold.id), HoldStateError);
    assert.throws(
      () =>
        ledger.captureHold({
          holdId: hold.id,
          journal: spendDraft(customerId, "revenue", 3_000n),
        }),
      HoldStateError,
    );
  });

  it("rejects holds and ordinary journals that would spend reserved funds", () => {
    const { ledger, customerId, revenueId } = createFundedLedger();
    ledger.createHold({
      accountId: customerId,
      amountMinor: 8_000n,
      source: { type: "transfer", id: "reserve-most" },
    });
    assert.throws(
      () =>
        ledger.createHold({
          accountId: customerId,
          amountMinor: 3_000n,
          source: { type: "transfer", id: "reserve-too-much" },
        }),
      InsufficientAvailableBalanceError,
    );
    assert.throws(
      () => ledger.postJournal(spendDraft(customerId, revenueId, 3_000n)),
      InsufficientAvailableBalanceError,
    );
    assert.equal(ledger.listJournals().length, 1);
    assert.equal(ledger.listHolds().length, 1);
  });

  it("captures a hold atomically for its exact amount and supports exact retries", () => {
    const { ledger, customerId, revenueId } = createFundedLedger();
    const hold = ledger.createHold({
      accountId: customerId,
      amountMinor: 3_000n,
      source: { type: "transfer", id: "reserve-capture" },
      idempotencyKey: "reserve-capture-request",
    });
    const command = {
      holdId: hold.id,
      journal: spendDraft(customerId, revenueId, 3_000n),
      idempotencyKey: "capture-request",
    } as const;
    const result = ledger.captureHold(command);
    const retry = ledger.captureHold(command);

    assert.strictEqual(retry, result);
    assert.equal(result.hold.status, "captured");
    assert.equal(result.hold.capturedByJournalId, result.journal.id);
    assert.equal(
      ledger.getAccountBalance(customerId).naturalBalanceMinor,
      7_000n,
    );
    assert.equal(ledger.getAccountBalance(customerId).heldMinor, 0n);
    assert.equal(ledger.getAccountBalance(customerId).availableMinor, 7_000n);
    assert.equal(ledger.listJournals().length, 2);
  });

  it("keeps an active hold and journal set unchanged when capture amount is not exact", () => {
    const { ledger, customerId, revenueId } = createFundedLedger();
    const hold = ledger.createHold({
      accountId: customerId,
      amountMinor: 3_000n,
      source: { type: "transfer", id: "reserve-wrong-capture" },
    });
    assert.throws(
      () =>
        ledger.captureHold({
          holdId: hold.id,
          journal: spendDraft(customerId, revenueId, 2_999n),
        }),
      InvalidLedgerInputError,
    );
    assert.equal(ledger.getHold(hold.id).status, "active");
    assert.equal(ledger.listJournals().length, 1);
  });

  it("expires only due holds and makes expiration a terminal state", () => {
    const { ledger, customerId } = createFundedLedger();
    const hold = ledger.createHold({
      accountId: customerId,
      amountMinor: 1_000n,
      source: { type: "transfer", id: "expiring" },
      expiresAt: "2000-01-02T00:00:00.000Z",
    });
    assert.throws(
      () => ledger.expireHold(hold.id, "2000-01-01T23:59:59.999Z"),
      InvalidLedgerInputError,
    );
    const expired = ledger.expireHold(hold.id, "2000-01-02T00:00:00.000Z");
    assert.equal(expired.status, "expired");
    assert.equal(ledger.getAccountBalance(customerId).availableMinor, 10_000n);
    assert.throws(() => ledger.releaseHold(hold.id), HoldStateError);
  });

  it("deduplicates hold creation and rejects duplicate hold sources", () => {
    const { ledger, customerId } = createFundedLedger();
    const command = {
      accountId: customerId,
      amountMinor: 1_000n,
      source: { type: "transfer", id: "hold-idempotent" },
      idempotencyKey: "create-hold-request",
    } as const;
    const first = ledger.createHold(command);
    assert.strictEqual(ledger.createHold(command), first);
    assert.throws(
      () => ledger.createHold({ ...command, idempotencyKey: "new-key" }),
      DuplicateSourceError,
    );
    assert.equal(ledger.listHolds().length, 1);
  });
});

describe("exact reversals", () => {
  it("creates an immutable inverse journal and restores both natural balances", () => {
    const { ledger, cashId, customerId } = createFundedLedger();
    const original = ledger.listJournals()[0];
    assert.ok(original);
    const reversal = ledger.reverseJournal({
      journalId: original.id,
      source: { type: "operator", id: "reverse-opening" },
      idempotencyKey: "reverse-request",
    });

    assert.equal(reversal.reversalOfJournalId, original.id);
    assert.deepEqual(
      reversal.postings.map(({ accountId, side, amountMinor }) => ({
        accountId,
        side,
        amountMinor,
      })),
      original.postings.map(({ accountId, side, amountMinor }) => ({
        accountId,
        side: side === "debit" ? "credit" : "debit",
        amountMinor,
      })),
    );
    assert.strictEqual(ledger.getReversalForJournal(original.id), reversal);
    assert.equal(ledger.getAccountBalance(cashId).naturalBalanceMinor, 0n);
    assert.equal(ledger.getAccountBalance(customerId).naturalBalanceMinor, 0n);
    assert.strictEqual(
      ledger.reverseJournal({
        journalId: original.id,
        source: { type: "operator", id: "reverse-opening" },
        idempotencyKey: "reverse-request",
      }),
      reversal,
    );
  });

  it("rejects a second reversal with a different request", () => {
    const { ledger } = createFundedLedger();
    const original = ledger.listJournals()[0];
    assert.ok(original);
    ledger.reverseJournal({
      journalId: original.id,
      source: { type: "operator", id: "first-reversal" },
    });
    assert.throws(
      () =>
        ledger.reverseJournal({
          journalId: original.id,
          source: { type: "operator", id: "second-reversal" },
        }),
      JournalAlreadyReversedError,
    );
    assert.equal(ledger.listJournals().length, 2);
  });
});
