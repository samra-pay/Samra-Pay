import { DomainError, assertDomain } from "./errors";
import {
  DomainEventInbox,
  createOutboxMessage,
  type InboxDisposition,
  type ProviderEvent,
} from "./events";
import type { RemittanceQuote, RemittanceTransfer } from "./model";
import type {
  AuditActor,
  FakeScenario,
  FakeScenarioController,
  LedgerControlPort,
  ProviderSuite,
} from "./providers";
import {
  DEFAULT_DEMO_QUOTE_POLICY,
  createQuote,
  isQuoteExpired,
  type QuotePolicy,
} from "./quote";
import {
  DirectRemittanceUnitOfWork,
  type RemittanceRepository,
  type RemittanceUnitOfWork,
} from "./repository";
import {
  appendProviderLink,
  createTransferAggregate,
  evolveTransfer,
} from "./state-machines";

export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  next(prefix: "quote" | "transfer" | "outbox"): string;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

export class SequentialIdGenerator implements IdGenerator {
  #sequence = 0;

  next(prefix: "quote" | "transfer" | "outbox"): string {
    this.#sequence += 1;
    return `${prefix}_${this.#sequence.toString().padStart(8, "0")}`;
  }
}

export type RemittanceServiceDependencies = Readonly<{
  repository: RemittanceRepository;
  providers: ProviderSuite;
  ledger: LedgerControlPort;
  clock?: Clock;
  ids?: IdGenerator;
  quotePolicy?: QuotePolicy;
  fakeScenarioController?: FakeScenarioController;
  unitOfWork?: RemittanceUnitOfWork;
}>;

type ProviderIngestionResult = Readonly<{
  disposition: InboxDisposition;
  transfer: RemittanceTransfer;
  processedEvents: readonly ProviderEvent[];
}>;

export class RemittanceService {
  readonly #repository: RemittanceRepository;
  readonly #providers: ProviderSuite;
  readonly #ledger: LedgerControlPort;
  readonly #clock: Clock;
  readonly #ids: IdGenerator;
  readonly #quotePolicy: QuotePolicy;
  readonly #scenarioController?: FakeScenarioController;
  readonly #unitOfWork: RemittanceUnitOfWork;
  readonly #holdIds = new Map<string, string>();
  #commandTail: Promise<void> = Promise.resolve();

  constructor(dependencies: RemittanceServiceDependencies) {
    this.#repository = dependencies.repository;
    this.#providers = dependencies.providers;
    this.#ledger = dependencies.ledger;
    this.#clock = dependencies.clock ?? new SystemClock();
    this.#ids = dependencies.ids ?? new SequentialIdGenerator();
    this.#quotePolicy = dependencies.quotePolicy ?? DEFAULT_DEMO_QUOTE_POLICY;
    this.#scenarioController = dependencies.fakeScenarioController;
    this.#unitOfWork =
      dependencies.unitOfWork ?? new DirectRemittanceUnitOfWork();
  }

  async createQuote(input: {
    actorId: string;
    sourceAccountId: string;
    beneficiaryId: string;
    sourceAmountMinor: bigint;
    fundingMethod: "samra_balance";
    deliveryMethod: "bank" | "wallet";
  }): Promise<RemittanceQuote> {
    const quote = createQuote({
      ...input,
      id: this.#ids.next("quote"),
      createdAt: this.#clock.now(),
      policy: this.#quotePolicy,
    });
    return this.#unitOfWork.run(async () => {
      await this.#repository.saveQuote(quote);
      return quote;
    });
  }

  async getQuote(quoteId: string): Promise<RemittanceQuote | undefined> {
    return this.#repository.getQuote(quoteId);
  }

  async quoteStatus(
    quoteId: string,
  ): Promise<"active" | "expired" | "consumed"> {
    const quote = await this.#requiredQuote(quoteId);
    if (await this.#repository.isQuoteConsumed(quoteId)) {
      return "consumed";
    }
    return isQuoteExpired(quote, this.#clock.now()) ? "expired" : "active";
  }

  async createTransfer(input: {
    actorId: string;
    quoteId: string;
    idempotencyKey: string;
  }): Promise<RemittanceTransfer> {
    return this.#runExclusive(() =>
      this.#unitOfWork.run(() => this.#createTransfer(input)),
    );
  }

  async #createTransfer(input: {
    actorId: string;
    quoteId: string;
    idempotencyKey: string;
  }): Promise<RemittanceTransfer> {
    const idempotent = await this.#repository.findIdempotentTransfer(
      input.actorId,
      input.idempotencyKey,
    );
    if (idempotent) {
      assertDomain(
        idempotent.quoteId === input.quoteId,
        "CONFLICT",
        "The idempotency key is already bound to a different quote.",
      );
      return idempotent.transfer;
    }

    const quote = await this.#requiredQuote(input.quoteId);
    assertDomain(
      quote.actorId === input.actorId,
      "ACTOR_NOT_ALLOWED",
      "The quote does not belong to the current demo actor.",
    );
    assertDomain(
      !isQuoteExpired(quote, this.#clock.now()),
      "QUOTE_EXPIRED",
      "The quote has expired.",
      { quoteId: quote.id },
    );
    assertDomain(
      !(await this.#repository.isQuoteConsumed(quote.id)),
      "QUOTE_ALREADY_USED",
      "The quote has already been used.",
      { quoteId: quote.id },
    );

    const now = this.#clock.now().toISOString();
    let transfer = createTransferAggregate({
      id: this.#ids.next("transfer"),
      actorId: input.actorId,
      idempotencyKey: input.idempotencyKey,
      quote,
      createdAt: now,
    });
    const createdSnapshot = transfer;

    const hold = await this.#ledger.reserve({
      transferId: transfer.id,
      accountId: quote.sourceAccountId,
      amountMinor: quote.debitAmount.amountMinor,
      principalAmountMinor: quote.sourceAmount.amountMinor,
      feeAmountMinor: quote.feeAmount.amountMinor,
      currency: "USD",
      idempotencyKey: `${input.idempotencyKey}:reserve`,
      auditActor: customerAuditActor(input.actorId),
    });
    this.#holdIds.set(transfer.id, hold.holdId);
    const rainLink = await this.#providers.rain.authorizeDebit({
      transferId: transfer.id,
      accountId: quote.sourceAccountId,
      amountMinor: quote.debitAmount.amountMinor,
      idempotencyKey: `${input.idempotencyKey}:rain-authorize`,
      occurredAt: now,
    });
    transfer = appendProviderLink(transfer, rainLink);
    transfer = evolveTransfer(transfer, {
      transferState: "FUNDS_RESERVED",
      fundingState: "RESERVED",
      reason: "FUNDS_RESERVED",
      occurredAt: now,
    });
    const reservedSnapshot = transfer;

    const calizaLink = await this.#providers.caliza.submitTransfer({
      transferId: transfer.id,
      sourceAmountMinor: quote.sourceAmount.amountMinor,
      sourceCurrency: "USD",
      destinationCurrency: "ETB",
      beneficiaryId: quote.beneficiaryId,
      idempotencyKey: `${input.idempotencyKey}:caliza-submit`,
      occurredAt: now,
    });
    transfer = appendProviderLink(transfer, calizaLink);
    transfer = evolveTransfer(transfer, {
      transferState: "SUBMITTED",
      reason: "TRANSFER_SUBMITTED",
      occurredAt: now,
    });

    await this.#repository.saveTransfer(
      transfer,
      customerAuditActor(input.actorId),
    );
    await this.#repository.markQuoteConsumed(quote.id, transfer.id);
    await this.#repository.bindIdempotencyKey(
      input.actorId,
      input.idempotencyKey,
      quote.id,
      transfer.id,
    );
    await this.#writeOutbox(createdSnapshot, "TRANSFER_CREATED", now);
    await this.#writeOutbox(reservedSnapshot, "FUNDS_RESERVED", now);
    await this.#writeOutbox(transfer, "TRANSFER_SUBMITTED", now);
    return transfer;
  }

  async getTransfer(
    actorId: string,
    transferId: string,
  ): Promise<RemittanceTransfer> {
    const transfer = await this.#repository.getTransfer(transferId);
    assertDomain(transfer, "NOT_FOUND", "The transfer was not found.", {
      transferId,
    });
    assertDomain(
      transfer.actorId === actorId,
      "NOT_FOUND",
      "The transfer was not found.",
      { transferId },
    );
    return transfer;
  }

  async listTransfers(actorId: string): Promise<readonly RemittanceTransfer[]> {
    return this.#repository.listTransfers(actorId);
  }

  async cancelTransfer(input: {
    actorId: string;
    transferId: string;
    idempotencyKey: string;
    auditActor?: AuditActor;
    auditReason?: string;
  }): Promise<RemittanceTransfer> {
    return this.#runExclusive(() =>
      this.#unitOfWork.run(() => this.#cancelTransfer(input)),
    );
  }

  async #cancelTransfer(input: {
    actorId: string;
    transferId: string;
    idempotencyKey: string;
    auditActor?: AuditActor;
    auditReason?: string;
  }): Promise<RemittanceTransfer> {
    const idempotent = await this.#repository.findIdempotentCancellation(
      input.actorId,
      input.idempotencyKey,
    );
    if (idempotent) {
      assertDomain(
        idempotent.transferId === input.transferId,
        "CONFLICT",
        "The cancellation idempotency key is already bound to another transfer.",
      );
      return idempotent.transfer;
    }

    let transfer = await this.getTransfer(input.actorId, input.transferId);
    if (transfer.state === "CANCELLED") {
      await this.#repository.bindCancellationIdempotencyKey(
        input.actorId,
        input.idempotencyKey,
        transfer.id,
      );
      return transfer;
    }
    assertDomain(
      ["CREATED", "FUNDS_RESERVED", "SUBMITTED"].includes(transfer.state),
      "CONFLICT",
      "The transfer has passed its cancellable boundary.",
      { transferId: transfer.id, state: transfer.state },
    );

    if (transfer.state === "SUBMITTED") {
      const cancelled = await this.#providers.caliza.cancelTransfer({
        transferId: transfer.id,
        idempotencyKey: `${input.idempotencyKey}:caliza-cancel`,
        occurredAt: this.#clock.now().toISOString(),
      });
      assertDomain(
        cancelled,
        "CONFLICT",
        "The provider could not cancel the transfer.",
      );
    }

    const holdId = await this.#holdIdFor(transfer.id);
    if (holdId && transfer.fundingState === "RESERVED") {
      await this.#ledger.release({
        transferId: transfer.id,
        holdId,
        idempotencyKey: `${input.idempotencyKey}:release`,
        auditActor: input.auditActor ?? customerAuditActor(input.actorId),
      });
      await this.#providers.rain.releaseAuthorization({
        transferId: transfer.id,
        idempotencyKey: `${input.idempotencyKey}:rain-release`,
        occurredAt: this.#clock.now().toISOString(),
      });
    }

    const occurredAt = this.#clock.now().toISOString();
    transfer = evolveTransfer(transfer, {
      transferState: "CANCELLED",
      fundingState:
        transfer.fundingState === "RESERVED" ? "RELEASED" : undefined,
      reason:
        input.auditActor?.actorType === "operator"
          ? "OPERATOR_CANCELLED"
          : "CUSTOMER_CANCELLED",
      occurredAt,
    });
    await this.#repository.saveTransfer(
      transfer,
      input.auditActor ?? customerAuditActor(input.actorId),
    );
    await this.#repository.bindCancellationIdempotencyKey(
      input.actorId,
      input.idempotencyKey,
      transfer.id,
    );
    await this.#writeOutbox(transfer, "TRANSFER_CANCELLED", occurredAt);
    return transfer;
  }

  async ingestProviderEvent(
    event: ProviderEvent,
  ): Promise<ProviderIngestionResult> {
    return this.#runExclusive(() =>
      this.#unitOfWork.run(() =>
        this.#ingestProviderEvent(event, {
          actorType: "provider",
          actorId: event.provider.toLowerCase(),
        }),
      ),
    );
  }

  async #ingestProviderEvent(
    event: ProviderEvent,
    auditActor: AuditActor,
  ): Promise<ProviderIngestionResult> {
    let transfer = await this.#repository.getTransfer(event.transferId);
    assertDomain(transfer, "NOT_FOUND", "The transfer was not found.", {
      transferId: event.transferId,
    });

    // Rehydrate inside the unit of work so a rollback cannot leave process
    // memory ahead of the durable provider-event record.
    const inbox = new DomainEventInbox(
      await this.#repository.listInbox(transfer.id),
    );
    const recordsBefore = inbox.records().length;
    const result = inbox.ingest(
      transfer,
      event,
      this.#clock.now().toISOString(),
    );
    const newRecords = inbox.records().slice(recordsBefore);
    await this.#repository.appendInboxRecords(newRecords);
    transfer = result.transfer;

    for (const processedEvent of result.processedEvents) {
      transfer = await this.#applyProcessedEventEffect(
        transfer,
        processedEvent,
        auditActor,
      );
    }

    if (result.processedEvents.length > 0) {
      await this.#repository.saveTransfer(transfer, auditActor);
      await this.#writeOutbox(
        transfer,
        "TRANSFER_STATE_CHANGED",
        transfer.updatedAt,
      );
    }

    return Object.freeze({
      disposition: result.disposition,
      transfer,
      processedEvents: result.processedEvents,
    });
  }

  async selectAndAdvanceFakeScenario(
    actorId: string,
    transferId: string,
    scenario: FakeScenario,
    auditActor: AuditActor = {
      actorType: "system",
      actorId: "fake-provider-worker",
    },
  ): Promise<RemittanceTransfer> {
    return this.#runExclusive(() =>
      this.#unitOfWork.run(() =>
        this.#selectAndAdvanceFakeScenario(
          actorId,
          transferId,
          scenario,
          auditActor,
        ),
      ),
    );
  }

  async #selectAndAdvanceFakeScenario(
    actorId: string,
    transferId: string,
    scenario: FakeScenario,
    auditActor: AuditActor,
  ): Promise<RemittanceTransfer> {
    if (!this.#scenarioController) {
      throw new DomainError(
        "CONFLICT",
        "Fake provider scenario controls are not available.",
      );
    }
    let transfer = await this.getTransfer(actorId, transferId);
    this.#scenarioController.setScenario(transfer.id, scenario);
    await this.#repository.saveFakeScenario(transfer.id, scenario);
    const occurredAt = this.#clock.now().toISOString();

    if (scenario === "OUT_OF_ORDER_EVENT" && transfer.state === "SUBMITTED") {
      await this.#ingestProviderEvent(
        syntheticScenarioEvent(transfer, "CHAPA_PAID", occurredAt, scenario),
        auditActor,
      );
    }

    const event = this.#scenarioController.nextEvent(transfer, occurredAt);
    if (!event) {
      return transfer;
    }
    const result = await this.#ingestProviderEvent(event, auditActor);
    transfer = result.transfer;

    if (scenario === "DUPLICATE_EVENT") {
      await this.#ingestProviderEvent(event, auditActor);
    }
    return transfer;
  }

  async setReconciliation(
    actorId: string,
    transferId: string,
    outcome: "MATCHED" | "EXCEPTION",
  ): Promise<RemittanceTransfer> {
    return this.#runExclusive(() =>
      this.#unitOfWork.run(() =>
        this.#setReconciliation(actorId, transferId, outcome),
      ),
    );
  }

  async #setReconciliation(
    actorId: string,
    transferId: string,
    outcome: "MATCHED" | "EXCEPTION",
  ): Promise<RemittanceTransfer> {
    let transfer = await this.getTransfer(actorId, transferId);
    assertDomain(
      transfer.reconciliationState === "PENDING",
      "CONFLICT",
      "Only pending transfers can be reconciled.",
      { transferId, reconciliationState: transfer.reconciliationState },
    );
    const occurredAt = this.#clock.now().toISOString();
    transfer = evolveTransfer(transfer, {
      reconciliationState: outcome,
      reason: `RECONCILIATION_${outcome}`,
      occurredAt,
    });
    await this.#repository.saveTransfer(transfer, customerAuditActor(actorId));
    await this.#writeOutbox(transfer, "RECONCILIATION_CHANGED", occurredAt);
    return transfer;
  }

  async #runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const predecessor = this.#commandTail;
    let release!: () => void;
    this.#commandTail = new Promise<void>((resolve) => {
      release = resolve;
    });

    await predecessor;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  async #requiredQuote(quoteId: string): Promise<RemittanceQuote> {
    const quote = await this.#repository.getQuote(quoteId);
    if (!quote) {
      throw new DomainError("NOT_FOUND", "The quote was not found.", {
        quoteId,
      });
    }
    return quote;
  }

  async #applyProcessedEventEffect(
    transfer: RemittanceTransfer,
    event: ProviderEvent,
    auditActor: AuditActor,
  ): Promise<RemittanceTransfer> {
    const holdId = await this.#holdIdFor(transfer.id);
    if (event.kind === "CALIZA_ACCEPTED" && holdId) {
      await this.#ledger.capture({
        transferId: transfer.id,
        holdId,
        idempotencyKey: `${event.providerEventId}:capture`,
        auditActor,
      });
    }
    if (event.kind === "CALIZA_REJECTED" && holdId) {
      await this.#ledger.release({
        transferId: transfer.id,
        holdId,
        idempotencyKey: `${event.providerEventId}:release`,
        auditActor,
      });
      await this.#providers.rain.releaseAuthorization({
        transferId: transfer.id,
        idempotencyKey: `${event.providerEventId}:rain-release`,
        occurredAt: event.occurredAt,
      });
    }
    if (event.kind === "CALIZA_DELIVERED") {
      await this.#ledger.settlePrincipal({
        transferId: transfer.id,
        amountMinor: transfer.quote.sourceAmount.amountMinor,
        currency: "USD",
        idempotencyKey: `${event.providerEventId}:settle-principal`,
        auditActor,
      });
      const link = await this.#providers.chapa.submitPayout({
        transferId: transfer.id,
        beneficiaryId: transfer.quote.beneficiaryId,
        amountMinor: transfer.quote.recipientAmount.amountMinor,
        currency: "ETB",
        idempotencyKey: `${event.providerEventId}:chapa-submit`,
        occurredAt: event.occurredAt,
      });
      transfer = appendProviderLink(transfer, link);
    }
    if (event.kind === "CHAPA_PAID") {
      await this.#ledger.recognizeFee({
        transferId: transfer.id,
        amountMinor: transfer.quote.feeAmount.amountMinor,
        currency: "USD",
        idempotencyKey: `${event.providerEventId}:recognize-fee`,
        auditActor,
      });
    }
    if (event.kind === "CHAPA_FAILED" || event.kind === "CHAPA_REVERSED") {
      const link = await this.#providers.rain.requestRefund({
        transferId: transfer.id,
        amountMinor: transfer.quote.debitAmount.amountMinor,
        idempotencyKey: `${event.providerEventId}:rain-refund`,
        occurredAt: event.occurredAt,
      });
      transfer = appendProviderLink(transfer, link);
    }
    if (event.kind === "RAIN_REFUNDED") {
      await this.#ledger.refund({
        transferId: transfer.id,
        amountMinor: transfer.quote.debitAmount.amountMinor,
        currency: "USD",
        idempotencyKey: `${event.providerEventId}:ledger-refund`,
        auditActor,
      });
    }
    return transfer;
  }

  async #writeOutbox(
    transfer: RemittanceTransfer,
    type: Parameters<typeof createOutboxMessage>[0]["type"],
    occurredAt: string,
  ): Promise<void> {
    await this.#repository.appendOutbox(
      createOutboxMessage({
        id: this.#ids.next("outbox"),
        transfer,
        type,
        occurredAt,
      }),
    );
  }

  async #holdIdFor(transferId: string): Promise<string | undefined> {
    const cached = this.#holdIds.get(transferId);
    if (cached) {
      return cached;
    }
    const durable = await this.#ledger.findHoldId(transferId);
    if (durable) {
      this.#holdIds.set(transferId, durable);
    }
    return durable;
  }
}

function customerAuditActor(actorId: string): AuditActor {
  return Object.freeze({ actorType: "customer", actorId });
}

function syntheticScenarioEvent(
  transfer: RemittanceTransfer,
  kind: ProviderEvent["kind"],
  occurredAt: string,
  scenario: FakeScenario,
): ProviderEvent {
  return Object.freeze({
    provider: kind.startsWith("CHAPA_") ? "CHAPA" : "CALIZA",
    providerEventId: `${scenario.toLowerCase()}_${kind.toLowerCase()}_${transfer.id}`,
    transferId: transfer.id,
    kind,
    occurredAt,
    payload: Object.freeze({}),
  });
}
