import type { ProviderName, RemittanceTransfer, TransferState } from "./model";
import { evolveTransfer } from "./state-machines";

export type ProviderEventKind =
  | "CALIZA_ACCEPTED"
  | "CALIZA_DELIVERED"
  | "CALIZA_REJECTED"
  | "CHAPA_PROCESSING"
  | "CHAPA_PAID"
  | "CHAPA_FAILED"
  | "CHAPA_REVERSED"
  | "RAIN_REFUNDED";

export type ProviderEvent = Readonly<{
  provider: ProviderName;
  providerEventId: string;
  transferId: string;
  kind: ProviderEventKind;
  occurredAt: string;
  payload: Readonly<Record<string, string>>;
}>;

export type InboxDisposition =
  "PROCESSED" | "DUPLICATE" | "DEFERRED" | "IGNORED";

export type InboxRecord = Readonly<{
  key: string;
  event: ProviderEvent;
  disposition: InboxDisposition;
  recordedAt: string;
}>;

export type OutboxEventType =
  | "TRANSFER_CREATED"
  | "FUNDS_RESERVED"
  | "TRANSFER_SUBMITTED"
  | "TRANSFER_STATE_CHANGED"
  | "TRANSFER_CANCELLED"
  | "RECONCILIATION_CHANGED";

export type OutboxMessage = Readonly<{
  id: string;
  aggregateType: "REMITTANCE_TRANSFER";
  aggregateId: string;
  type: OutboxEventType;
  occurredAt: string;
  payload: Readonly<Record<string, string>>;
}>;

export type EventApplication = Readonly<{
  disposition: Exclude<InboxDisposition, "DUPLICATE">;
  transfer: RemittanceTransfer;
}>;

type EventRule = Readonly<{
  provider: ProviderName;
  expected: readonly TransferState[];
  alreadyApplied: readonly TransferState[];
  evolution: Parameters<typeof evolveTransfer>[1];
}>;

export function applyProviderEvent(
  transfer: RemittanceTransfer,
  event: ProviderEvent,
): EventApplication {
  if (event.transferId !== transfer.id) {
    return Object.freeze({ disposition: "IGNORED", transfer });
  }

  const rule = eventRule(event);
  if (event.provider !== rule.provider) {
    return Object.freeze({ disposition: "IGNORED", transfer });
  }

  if (rule.alreadyApplied.includes(transfer.state)) {
    return Object.freeze({ disposition: "IGNORED", transfer });
  }

  if (!rule.expected.includes(transfer.state)) {
    return Object.freeze({ disposition: "DEFERRED", transfer });
  }

  return Object.freeze({
    disposition: "PROCESSED",
    transfer: evolveTransfer(transfer, {
      ...rule.evolution,
      occurredAt: event.occurredAt,
    }),
  });
}

export class DomainEventInbox {
  readonly #seen = new Set<string>();
  readonly #deferred = new Map<string, ProviderEvent>();
  readonly #records: InboxRecord[] = [];

  constructor(records: readonly InboxRecord[] = []) {
    for (const record of records) {
      this.#records.push(record);
      if (record.disposition === "DEFERRED") {
        this.#deferred.set(record.key, record.event);
      } else if (
        record.disposition === "PROCESSED" ||
        record.disposition === "IGNORED"
      ) {
        this.#deferred.delete(record.key);
        this.#seen.add(record.key);
      }
    }
  }

  ingest(
    transfer: RemittanceTransfer,
    event: ProviderEvent,
    recordedAt = event.occurredAt,
  ): Readonly<{
    disposition: InboxDisposition;
    transfer: RemittanceTransfer;
    processedEvents: readonly ProviderEvent[];
  }> {
    const key = providerEventKey(event);
    if (this.#seen.has(key) || this.#deferred.has(key)) {
      this.#records.push(
        Object.freeze({ key, event, disposition: "DUPLICATE", recordedAt }),
      );
      return Object.freeze({
        disposition: "DUPLICATE" as const,
        transfer,
        processedEvents: Object.freeze([]),
      });
    }

    const first = applyProviderEvent(transfer, event);
    this.#records.push(
      Object.freeze({ key, event, disposition: first.disposition, recordedAt }),
    );

    if (first.disposition === "DEFERRED") {
      this.#deferred.set(key, event);
      return Object.freeze({
        disposition: "DEFERRED" as const,
        transfer,
        processedEvents: Object.freeze([]),
      });
    }

    this.#seen.add(key);
    if (first.disposition === "IGNORED") {
      return Object.freeze({
        disposition: "IGNORED" as const,
        transfer,
        processedEvents: Object.freeze([]),
      });
    }

    const drained = this.#drainDeferred(first.transfer);
    return Object.freeze({
      disposition: "PROCESSED" as const,
      transfer: drained.transfer,
      processedEvents: Object.freeze([event, ...drained.processedEvents]),
    });
  }

  records(): readonly InboxRecord[] {
    return Object.freeze([...this.#records]);
  }

  deferredEvents(): readonly ProviderEvent[] {
    return Object.freeze([...this.#deferred.values()]);
  }

  #drainDeferred(transfer: RemittanceTransfer): Readonly<{
    transfer: RemittanceTransfer;
    processedEvents: readonly ProviderEvent[];
  }> {
    let current = transfer;
    const processed: ProviderEvent[] = [];
    let madeProgress = true;

    while (madeProgress) {
      madeProgress = false;
      const candidates = [...this.#deferred.entries()].sort((left, right) => {
        const byTime = left[1].occurredAt.localeCompare(right[1].occurredAt);
        return byTime === 0 ? left[0].localeCompare(right[0]) : byTime;
      });

      for (const [key, pending] of candidates) {
        const result = applyProviderEvent(current, pending);
        if (result.disposition === "PROCESSED") {
          this.#deferred.delete(key);
          this.#seen.add(key);
          current = result.transfer;
          processed.push(pending);
          this.#records.push(
            Object.freeze({
              key,
              event: pending,
              disposition: "PROCESSED" as const,
              recordedAt: pending.occurredAt,
            }),
          );
          madeProgress = true;
          break;
        }
        if (result.disposition === "IGNORED") {
          this.#deferred.delete(key);
          this.#seen.add(key);
        }
      }
    }

    return Object.freeze({ transfer: current, processedEvents: processed });
  }
}

export function providerEventKey(event: ProviderEvent): string {
  return `${event.provider}:${event.providerEventId}`;
}

export function createOutboxMessage(input: {
  id: string;
  transfer: RemittanceTransfer;
  type: OutboxEventType;
  occurredAt: string;
  payload?: Readonly<Record<string, string>>;
}): OutboxMessage {
  return Object.freeze({
    id: input.id,
    aggregateType: "REMITTANCE_TRANSFER" as const,
    aggregateId: input.transfer.id,
    type: input.type,
    occurredAt: input.occurredAt,
    payload: Object.freeze({
      transferId: input.transfer.id,
      state: input.transfer.state,
      ...(input.payload ?? {}),
    }),
  });
}

function eventRule(event: ProviderEvent): EventRule {
  switch (event.kind) {
    case "CALIZA_ACCEPTED":
      return {
        provider: "CALIZA",
        expected: ["SUBMITTED"],
        alreadyApplied: [
          "IN_TRANSIT",
          "PAYOUT_PENDING",
          "COMPLETED",
          "REFUND_PENDING",
          "REFUNDED",
          "REVERSAL_PENDING",
          "REVERSED",
        ],
        evolution: {
          transferState: "IN_TRANSIT",
          fundingState: "CAPTURED",
          reason: event.kind,
          occurredAt: event.occurredAt,
        },
      };
    case "CALIZA_DELIVERED":
      return {
        provider: "CALIZA",
        expected: ["IN_TRANSIT"],
        alreadyApplied: [
          "PAYOUT_PENDING",
          "COMPLETED",
          "REFUND_PENDING",
          "REFUNDED",
          "REVERSAL_PENDING",
          "REVERSED",
        ],
        evolution: {
          transferState: "PAYOUT_PENDING",
          payoutState: "SUBMITTED",
          reason: event.kind,
          occurredAt: event.occurredAt,
        },
      };
    case "CALIZA_REJECTED":
      return {
        provider: "CALIZA",
        expected: ["SUBMITTED"],
        alreadyApplied: ["FAILED", "CANCELLED", "REFUNDED"],
        evolution: {
          transferState: "FAILED",
          fundingState: "RELEASED",
          reason: event.kind,
          occurredAt: event.occurredAt,
        },
      };
    case "CHAPA_PROCESSING":
      return {
        provider: "CHAPA",
        expected: ["PAYOUT_PENDING"],
        alreadyApplied: [
          "COMPLETED",
          "REFUND_PENDING",
          "REFUNDED",
          "REVERSAL_PENDING",
          "REVERSED",
        ],
        evolution: {
          payoutState: "PROCESSING",
          reason: event.kind,
          occurredAt: event.occurredAt,
        },
      };
    case "CHAPA_PAID":
      return {
        provider: "CHAPA",
        expected: ["PAYOUT_PENDING"],
        alreadyApplied: ["COMPLETED", "REVERSAL_PENDING", "REVERSED"],
        evolution: {
          transferState: "COMPLETED",
          payoutState: "PAID",
          reconciliationState: "PENDING",
          reason: event.kind,
          occurredAt: event.occurredAt,
        },
      };
    case "CHAPA_FAILED":
      return {
        provider: "CHAPA",
        expected: ["PAYOUT_PENDING"],
        alreadyApplied: ["REFUND_PENDING", "REFUNDED"],
        evolution: {
          transferState: "REFUND_PENDING",
          fundingState: "REFUND_PENDING",
          payoutState: "FAILED",
          reason: event.kind,
          occurredAt: event.occurredAt,
        },
      };
    case "CHAPA_REVERSED":
      return {
        provider: "CHAPA",
        expected: ["COMPLETED"],
        alreadyApplied: ["REVERSAL_PENDING", "REVERSED"],
        evolution: {
          transferState: "REVERSAL_PENDING",
          fundingState: "REFUND_PENDING",
          payoutState: "REVERSED",
          reconciliationState: "EXCEPTION",
          reason: event.kind,
          occurredAt: event.occurredAt,
        },
      };
    case "RAIN_REFUNDED": {
      const reversal = event.payload["reason"] === "PAYOUT_REVERSED";
      return {
        provider: "RAIN",
        expected: reversal ? ["REVERSAL_PENDING"] : ["REFUND_PENDING"],
        alreadyApplied: ["REFUNDED", "REVERSED"],
        evolution: {
          transferState: reversal ? "REVERSED" : "REFUNDED",
          fundingState: "REFUNDED",
          reason: event.kind,
          occurredAt: event.occurredAt,
        },
      };
    }
  }
}
