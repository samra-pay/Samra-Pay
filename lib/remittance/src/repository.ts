import { DomainError } from "./errors";
import type { InboxRecord, OutboxMessage } from "./events";
import type { RemittanceQuote, RemittanceTransfer } from "./model";

export interface RemittanceRepository {
  saveQuote(quote: RemittanceQuote): Promise<void>;
  getQuote(quoteId: string): Promise<RemittanceQuote | undefined>;
  isQuoteConsumed(quoteId: string): Promise<boolean>;
  markQuoteConsumed(quoteId: string, transferId: string): Promise<void>;
  saveTransfer(transfer: RemittanceTransfer): Promise<void>;
  getTransfer(transferId: string): Promise<RemittanceTransfer | undefined>;
  listTransfers(actorId: string): Promise<readonly RemittanceTransfer[]>;
  findIdempotentTransfer(
    actorId: string,
    idempotencyKey: string,
  ): Promise<
    Readonly<{ quoteId: string; transfer: RemittanceTransfer }> | undefined
  >;
  bindIdempotencyKey(
    actorId: string,
    idempotencyKey: string,
    quoteId: string,
    transferId: string,
  ): Promise<void>;
  findIdempotentCancellation(
    actorId: string,
    idempotencyKey: string,
  ): Promise<
    Readonly<{ transferId: string; transfer: RemittanceTransfer }> | undefined
  >;
  bindCancellationIdempotencyKey(
    actorId: string,
    idempotencyKey: string,
    transferId: string,
  ): Promise<void>;
  appendOutbox(message: OutboxMessage): Promise<void>;
  listOutbox(): Promise<readonly OutboxMessage[]>;
  appendInboxRecords(records: readonly InboxRecord[]): Promise<void>;
  listInbox(): Promise<readonly InboxRecord[]>;
}

export class InMemoryRemittanceRepository implements RemittanceRepository {
  readonly #quotes = new Map<string, RemittanceQuote>();
  readonly #quoteConsumption = new Map<string, string>();
  readonly #transfers = new Map<string, RemittanceTransfer>();
  readonly #idempotency = new Map<
    string,
    Readonly<{ quoteId: string; transferId: string }>
  >();
  readonly #cancellationIdempotency = new Map<string, string>();
  readonly #outbox: OutboxMessage[] = [];
  readonly #inbox: InboxRecord[] = [];

  async saveQuote(quote: RemittanceQuote): Promise<void> {
    this.#quotes.set(quote.id, quote);
  }

  async getQuote(quoteId: string): Promise<RemittanceQuote | undefined> {
    return this.#quotes.get(quoteId);
  }

  async isQuoteConsumed(quoteId: string): Promise<boolean> {
    return this.#quoteConsumption.has(quoteId);
  }

  async markQuoteConsumed(quoteId: string, transferId: string): Promise<void> {
    const existing = this.#quoteConsumption.get(quoteId);
    if (existing && existing !== transferId) {
      throw new DomainError(
        "QUOTE_ALREADY_USED",
        "The quote has already been consumed by another transfer.",
        { quoteId },
      );
    }
    this.#quoteConsumption.set(quoteId, transferId);
  }

  async saveTransfer(transfer: RemittanceTransfer): Promise<void> {
    const existing = this.#transfers.get(transfer.id);
    if (existing && transfer.version < existing.version) {
      throw new DomainError(
        "CONFLICT",
        "A stale transfer version cannot replace a newer version.",
        { transferId: transfer.id },
      );
    }
    this.#transfers.set(transfer.id, transfer);
  }

  async getTransfer(
    transferId: string,
  ): Promise<RemittanceTransfer | undefined> {
    return this.#transfers.get(transferId);
  }

  async listTransfers(actorId: string): Promise<readonly RemittanceTransfer[]> {
    return Object.freeze(
      [...this.#transfers.values()]
        .filter((transfer) => transfer.actorId === actorId)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    );
  }

  async findIdempotentTransfer(
    actorId: string,
    idempotencyKey: string,
  ): Promise<
    Readonly<{ quoteId: string; transfer: RemittanceTransfer }> | undefined
  > {
    const binding = this.#idempotency.get(
      idempotencyStorageKey(actorId, idempotencyKey),
    );
    if (!binding) {
      return undefined;
    }
    const transfer = this.#transfers.get(binding.transferId);
    return transfer
      ? Object.freeze({ quoteId: binding.quoteId, transfer })
      : undefined;
  }

  async bindIdempotencyKey(
    actorId: string,
    idempotencyKey: string,
    quoteId: string,
    transferId: string,
  ): Promise<void> {
    const key = idempotencyStorageKey(actorId, idempotencyKey);
    const existing = this.#idempotency.get(key);
    if (
      existing &&
      (existing.quoteId !== quoteId || existing.transferId !== transferId)
    ) {
      throw new DomainError(
        "CONFLICT",
        "The idempotency key is already bound to another request.",
      );
    }
    this.#idempotency.set(key, Object.freeze({ quoteId, transferId }));
  }

  async findIdempotentCancellation(
    actorId: string,
    idempotencyKey: string,
  ): Promise<
    Readonly<{ transferId: string; transfer: RemittanceTransfer }> | undefined
  > {
    const transferId = this.#cancellationIdempotency.get(
      cancellationIdempotencyStorageKey(actorId, idempotencyKey),
    );
    if (!transferId) {
      return undefined;
    }
    const transfer = this.#transfers.get(transferId);
    return transfer ? Object.freeze({ transferId, transfer }) : undefined;
  }

  async bindCancellationIdempotencyKey(
    actorId: string,
    idempotencyKey: string,
    transferId: string,
  ): Promise<void> {
    const key = cancellationIdempotencyStorageKey(actorId, idempotencyKey);
    const existing = this.#cancellationIdempotency.get(key);
    if (existing && existing !== transferId) {
      throw new DomainError(
        "CONFLICT",
        "The cancellation idempotency key is already bound to another transfer.",
      );
    }
    this.#cancellationIdempotency.set(key, transferId);
  }

  async appendOutbox(message: OutboxMessage): Promise<void> {
    if (!this.#outbox.some((existing) => existing.id === message.id)) {
      this.#outbox.push(message);
    }
  }

  async listOutbox(): Promise<readonly OutboxMessage[]> {
    return Object.freeze([...this.#outbox]);
  }

  async appendInboxRecords(records: readonly InboxRecord[]): Promise<void> {
    this.#inbox.push(...records);
  }

  async listInbox(): Promise<readonly InboxRecord[]> {
    return Object.freeze([...this.#inbox]);
  }
}

function idempotencyStorageKey(
  actorId: string,
  idempotencyKey: string,
): string {
  return `${actorId}:${idempotencyKey}`;
}

function cancellationIdempotencyStorageKey(
  actorId: string,
  idempotencyKey: string,
): string {
  return `${actorId}:cancel:${idempotencyKey}`;
}
