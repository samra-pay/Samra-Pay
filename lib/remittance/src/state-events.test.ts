import assert from "node:assert/strict";
import test from "node:test";
import { DomainError } from "./errors";
import { DomainEventInbox, type ProviderEvent } from "./events";
import { createQuote } from "./quote";
import { createTransferAggregate, evolveTransfer } from "./state-machines";

const occurredAt = "2026-08-15T12:00:00.000Z";

function submittedTransfer() {
  const quote = createQuote({
    id: "quote_1",
    actorId: "actor_1",
    sourceAccountId: "account_1",
    beneficiaryId: "beneficiary_1",
    sourceAmountMinor: 10_000n,
    deliveryMethod: "bank",
    createdAt: new Date(occurredAt),
  });
  let transfer = createTransferAggregate({
    id: "transfer_1",
    actorId: "actor_1",
    idempotencyKey: "idempotency_1",
    quote,
    createdAt: occurredAt,
  });
  transfer = evolveTransfer(transfer, {
    transferState: "FUNDS_RESERVED",
    fundingState: "RESERVED",
    reason: "FUNDS_RESERVED",
    occurredAt,
  });
  return evolveTransfer(transfer, {
    transferState: "SUBMITTED",
    reason: "TRANSFER_SUBMITTED",
    occurredAt,
  });
}

function providerEvent(
  provider: ProviderEvent["provider"],
  providerEventId: string,
  kind: ProviderEvent["kind"],
): ProviderEvent {
  return Object.freeze({
    provider,
    providerEventId,
    transferId: "transfer_1",
    kind,
    occurredAt,
    payload: Object.freeze({}),
  });
}

test("state machines reject illegal skips", () => {
  assert.throws(
    () =>
      evolveTransfer(submittedTransfer(), {
        transferState: "COMPLETED",
        reason: "ILLEGAL_SKIP",
        occurredAt,
      }),
    (error) =>
      error instanceof DomainError && error.code === "INVALID_TRANSITION",
  );
});

test("provider inbox deduplicates and drains out-of-order events", () => {
  const inbox = new DomainEventInbox();
  let transfer = submittedTransfer();
  const paid = providerEvent("CHAPA", "chapa_paid_1", "CHAPA_PAID");
  const accepted = providerEvent(
    "CALIZA",
    "caliza_accepted_1",
    "CALIZA_ACCEPTED",
  );
  const delivered = providerEvent(
    "CALIZA",
    "caliza_delivered_1",
    "CALIZA_DELIVERED",
  );

  const deferred = inbox.ingest(transfer, paid);
  assert.equal(deferred.disposition, "DEFERRED");
  assert.equal(inbox.deferredEvents().length, 1);

  transfer = inbox.ingest(transfer, accepted).transfer;
  assert.equal(transfer.state, "IN_TRANSIT");

  const drained = inbox.ingest(transfer, delivered);
  assert.equal(drained.transfer.state, "COMPLETED");
  assert.deepEqual(
    drained.processedEvents.map((event) => event.kind),
    ["CALIZA_DELIVERED", "CHAPA_PAID"],
  );
  assert.equal(inbox.deferredEvents().length, 0);

  const duplicate = inbox.ingest(drained.transfer, paid);
  assert.equal(duplicate.disposition, "DUPLICATE");
  assert.equal(duplicate.transfer.version, drained.transfer.version);
});
