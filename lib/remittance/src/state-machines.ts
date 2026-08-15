import { DomainError } from "./errors";
import type {
  FundingState,
  PayoutState,
  ReconciliationState,
  RemittanceTransfer,
  TransferState,
} from "./model";

type TransitionMap<TState extends string> = Readonly<
  Record<TState, readonly TState[]>
>;

export const TRANSFER_TRANSITIONS: TransitionMap<TransferState> = {
  CREATED: ["FUNDS_RESERVED", "CANCELLED", "FAILED"],
  FUNDS_RESERVED: ["SUBMITTED", "CANCELLED", "FAILED"],
  SUBMITTED: ["IN_TRANSIT", "CANCELLED", "FAILED"],
  IN_TRANSIT: ["PAYOUT_PENDING", "FAILED", "REFUND_PENDING"],
  PAYOUT_PENDING: ["COMPLETED", "FAILED", "REFUND_PENDING"],
  COMPLETED: ["REVERSAL_PENDING"],
  FAILED: ["REFUND_PENDING", "REFUNDED"],
  CANCELLED: [],
  REFUND_PENDING: ["REFUNDED"],
  REFUNDED: [],
  REVERSAL_PENDING: ["REVERSED"],
  REVERSED: [],
};

export const FUNDING_TRANSITIONS: TransitionMap<FundingState> = {
  UNRESERVED: ["RESERVED"],
  RESERVED: ["CAPTURED", "RELEASED"],
  CAPTURED: ["REFUND_PENDING"],
  RELEASED: [],
  REFUND_PENDING: ["REFUNDED"],
  REFUNDED: [],
};

export const PAYOUT_TRANSITIONS: TransitionMap<PayoutState> = {
  NOT_SUBMITTED: ["SUBMITTED", "FAILED"],
  SUBMITTED: ["PROCESSING", "PAID", "FAILED"],
  PROCESSING: ["PAID", "FAILED"],
  PAID: ["REVERSED"],
  FAILED: [],
  REVERSED: [],
};

export const RECONCILIATION_TRANSITIONS: TransitionMap<ReconciliationState> = {
  NOT_STARTED: ["PENDING"],
  PENDING: ["MATCHED", "EXCEPTION"],
  MATCHED: ["EXCEPTION"],
  EXCEPTION: ["PENDING", "RESOLVED"],
  RESOLVED: [],
};

export type TransferEvolution = Readonly<{
  transferState?: TransferState;
  fundingState?: FundingState;
  payoutState?: PayoutState;
  reconciliationState?: ReconciliationState;
  reason: string;
  occurredAt: string;
}>;

export function createTransferAggregate(input: {
  id: string;
  actorId: string;
  idempotencyKey: string;
  quote: RemittanceTransfer["quote"];
  createdAt: string;
}): RemittanceTransfer {
  return Object.freeze({
    ...input,
    state: "CREATED" as const,
    fundingState: "UNRESERVED" as const,
    payoutState: "NOT_SUBMITTED" as const,
    reconciliationState: "NOT_STARTED" as const,
    providerLinks: Object.freeze([]),
    statusHistory: Object.freeze([
      Object.freeze({
        sequence: 1,
        from: null,
        to: "CREATED" as const,
        reason: "TRANSFER_CREATED",
        occurredAt: input.createdAt,
      }),
    ]),
    version: 1,
    updatedAt: input.createdAt,
  });
}

export function evolveTransfer(
  transfer: RemittanceTransfer,
  evolution: TransferEvolution,
): RemittanceTransfer {
  const nextTransferState = evolution.transferState ?? transfer.state;
  const nextFundingState = evolution.fundingState ?? transfer.fundingState;
  const nextPayoutState = evolution.payoutState ?? transfer.payoutState;
  const nextReconciliationState =
    evolution.reconciliationState ?? transfer.reconciliationState;

  assertTransition(
    "transfer",
    transfer.state,
    nextTransferState,
    TRANSFER_TRANSITIONS,
  );
  assertTransition(
    "funding",
    transfer.fundingState,
    nextFundingState,
    FUNDING_TRANSITIONS,
  );
  assertTransition(
    "payout",
    transfer.payoutState,
    nextPayoutState,
    PAYOUT_TRANSITIONS,
  );
  assertTransition(
    "reconciliation",
    transfer.reconciliationState,
    nextReconciliationState,
    RECONCILIATION_TRANSITIONS,
  );

  const transferChanged = nextTransferState !== transfer.state;
  const nextHistory = transferChanged
    ? Object.freeze([
        ...transfer.statusHistory,
        Object.freeze({
          sequence: transfer.statusHistory.length + 1,
          from: transfer.state,
          to: nextTransferState,
          reason: evolution.reason,
          occurredAt: evolution.occurredAt,
        }),
      ])
    : transfer.statusHistory;

  return Object.freeze({
    ...transfer,
    state: nextTransferState,
    fundingState: nextFundingState,
    payoutState: nextPayoutState,
    reconciliationState: nextReconciliationState,
    statusHistory: nextHistory,
    version: transfer.version + 1,
    updatedAt: evolution.occurredAt,
  });
}

export function appendProviderLink(
  transfer: RemittanceTransfer,
  link: RemittanceTransfer["providerLinks"][number],
): RemittanceTransfer {
  const duplicate = transfer.providerLinks.some(
    (existing) =>
      existing.provider === link.provider &&
      existing.providerResourceId === link.providerResourceId,
  );
  if (duplicate) {
    return transfer;
  }

  return Object.freeze({
    ...transfer,
    providerLinks: Object.freeze([
      ...transfer.providerLinks,
      Object.freeze(link),
    ]),
    version: transfer.version + 1,
    updatedAt: link.createdAt,
  });
}

function assertTransition<TState extends string>(
  machine: string,
  from: TState,
  to: TState,
  transitions: TransitionMap<TState>,
): void {
  if (from === to) {
    return;
  }

  if (!transitions[from].includes(to)) {
    throw new DomainError(
      "INVALID_TRANSITION",
      `Illegal ${machine} transition from ${from} to ${to}.`,
      { machine, from, to },
    );
  }
}
