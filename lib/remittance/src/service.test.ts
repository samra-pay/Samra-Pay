import assert from "node:assert/strict";
import test from "node:test";
import { DomainError } from "./errors";
import { DeterministicFakeProviders, InMemoryLedgerControl } from "./providers";
import { InMemoryRemittanceRepository } from "./repository";
import { RemittanceService, type Clock, type IdGenerator } from "./service";

class FixedClock implements Clock {
  #time = Date.parse("2026-08-15T12:00:00.000Z");

  now(): Date {
    this.#time += 1_000;
    return new Date(this.#time);
  }
}

class TestIds implements IdGenerator {
  #sequence = 0;

  next(prefix: "quote" | "transfer" | "outbox"): string {
    this.#sequence += 1;
    return `${prefix}_${this.#sequence}`;
  }
}

function fixture() {
  const repository = new InMemoryRemittanceRepository();
  const providers = new DeterministicFakeProviders();
  const ledger = new InMemoryLedgerControl();
  const service = new RemittanceService({
    repository,
    providers,
    ledger,
    clock: new FixedClock(),
    ids: new TestIds(),
    fakeScenarioController: providers,
  });
  return { repository, providers, ledger, service };
}

async function createSubmittedTransfer(
  service: RemittanceService,
  idempotencyKey = "request-key-001",
) {
  const quote = await service.createQuote({
    actorId: "actor_1",
    sourceAccountId: "account_1",
    beneficiaryId: "beneficiary_1",
    sourceAmountMinor: 10_000n,
    fundingMethod: "samra_balance",
    deliveryMethod: "bank",
  });
  const transfer = await service.createTransfer({
    actorId: "actor_1",
    quoteId: quote.id,
    idempotencyKey,
  });
  return { quote, transfer };
}

test("happy fake-provider scenario reaches completed with captured funding", async () => {
  const { service, ledger, repository } = fixture();
  let { quote, transfer } = await createSubmittedTransfer(service);

  assert.equal(transfer.state, "SUBMITTED");
  assert.equal(await service.quoteStatus(quote.id), "consumed");
  assert.equal(ledger.holdState(transfer.id), "RESERVED");

  transfer = await service.selectAndAdvanceFakeScenario(
    "actor_1",
    transfer.id,
    "HAPPY_PATH",
  );
  assert.equal(transfer.state, "IN_TRANSIT");
  assert.equal(ledger.holdState(transfer.id), "CAPTURED");

  transfer = await service.selectAndAdvanceFakeScenario(
    "actor_1",
    transfer.id,
    "HAPPY_PATH",
  );
  assert.equal(transfer.state, "PAYOUT_PENDING");
  assert.equal(
    transfer.providerLinks.some((link) => link.provider === "CHAPA"),
    true,
  );

  transfer = await service.selectAndAdvanceFakeScenario(
    "actor_1",
    transfer.id,
    "HAPPY_PATH",
  );
  assert.equal(transfer.state, "COMPLETED");
  assert.equal(transfer.reconciliationState, "PENDING");
  assert.ok((await repository.listOutbox()).length >= 6);
});

test("transfer creation is idempotent and cancellation releases the hold", async () => {
  const { service, ledger } = fixture();
  const { quote, transfer } = await createSubmittedTransfer(service);
  const replay = await service.createTransfer({
    actorId: "actor_1",
    quoteId: quote.id,
    idempotencyKey: "request-key-001",
  });
  assert.equal(replay.id, transfer.id);

  const cancelled = await service.cancelTransfer({
    actorId: "actor_1",
    transferId: transfer.id,
    idempotencyKey: "cancel-key-001",
  });
  assert.equal(cancelled.state, "CANCELLED");
  assert.equal(cancelled.fundingState, "RELEASED");
  assert.equal(ledger.holdState(cancelled.id), "RELEASED");

  const cancelReplay = await service.cancelTransfer({
    actorId: "actor_1",
    transferId: transfer.id,
    idempotencyKey: "cancel-key-001",
  });
  assert.equal(cancelReplay.id, cancelled.id);
  assert.equal(cancelReplay.version, cancelled.version);

  const second = await createSubmittedTransfer(service, "request-key-002");
  await assert.rejects(
    service.cancelTransfer({
      actorId: "actor_1",
      transferId: second.transfer.id,
      idempotencyKey: "cancel-key-001",
    }),
    (error) => error instanceof DomainError && error.code === "CONFLICT",
  );
});
