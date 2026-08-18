import type { MoneyFlow, TimelineEvent, Transfer, TransferStatus } from './types';
import type { DataMode } from './data-mode';

export type ProviderRecoveryGuidance = Readonly<{
  state: 'in_progress' | 'completed' | 'review_required';
  title: string;
  detail: string;
}>;

export function filterTransfers(
  transfers: Transfer[],
  search: string,
  status: 'all' | TransferStatus,
): Transfer[] {
  const normalizedSearch = search.trim().toLowerCase();
  return transfers.filter((transfer) => {
    const statusMatches = status === 'all' || transfer.status === status;
    const searchMatches =
      !normalizedSearch ||
      transfer.reference.toLowerCase().includes(normalizedSearch) ||
      transfer.senderName.toLowerCase().includes(normalizedSearch) ||
      transfer.recipientName.toLowerCase().includes(normalizedSearch) ||
      transfer.senderId.toLowerCase().includes(normalizedSearch) ||
      (transfer.providerRef?.toLowerCase().includes(normalizedSearch) ?? false);
    return statusMatches && searchMatches;
  });
}

export function chronologicalTimeline(events: TimelineEvent[]): TimelineEvent[] {
  return [...events].sort(
    (left, right) =>
      new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime(),
  );
}

export function isProviderEvidence(event: TimelineEvent): boolean {
  return event.category === 'provider_evidence';
}

export function providerRecoveryGuidance(
  transfer: Transfer,
): ProviderRecoveryGuidance | null {
  if (transfer.payoutState !== 'failed') return null;

  if (transfer.status === 'refunded' && transfer.fundingState === 'refunded') {
    return {
      state: 'completed',
      title: 'Automatic refund completed',
      detail:
        'The payout failed and the original debit was refunded. Do not retry this transfer; a new payout attempt could duplicate financial effects.',
    };
  }

  if (transfer.status === 'pending') {
    return {
      state: 'in_progress',
      title: 'Automatic refund in progress',
      detail:
        'The payout failed. Samra Pay is recovering the original debit through the controlled refund path. Manual payout retry is disabled while recovery is active.',
    };
  }

  return {
    state: 'review_required',
    title: 'Provider failure requires review',
    detail:
      'The payout failed without a confirmed refund outcome. Review the immutable timeline and reconciliation evidence; do not initiate another payout from this portal.',
  };
}

export function relatedFixtureTransfers(
  mode: DataMode,
  transfers: Transfer[],
  customerId: string,
): Transfer[] {
  return mode === 'mock'
    ? transfers.filter((transfer) => transfer.senderId === customerId)
    : [];
}

export function fixtureTransferLookup(
  mode: DataMode,
  transfers: Transfer[],
): Map<string, Transfer> {
  return mode === 'mock'
    ? new Map(transfers.map((transfer) => [transfer.id, transfer]))
    : new Map();
}

export function filterMoneyFlows(
  mode: DataMode,
  flows: MoneyFlow[],
  transferLookup: Map<string, Transfer>,
  search: string,
  status: 'all' | TransferStatus,
): MoneyFlow[] {
  const normalizedSearch = search.trim().toLowerCase();

  return flows.filter((flow) => {
    const searchMatches =
      !normalizedSearch ||
      flow.reference.toLowerCase().includes(normalizedSearch) ||
      flow.transferId.toLowerCase().includes(normalizedSearch);

    // API-mode flow payloads contain only flow evidence; transfer status is
    // intentionally not inferred from fixtures or stages.
    const statusMatches =
      mode === 'api' ||
      status === 'all' ||
      transferLookup.get(flow.transferId)?.status === status;

    return searchMatches && statusMatches;
  });
}
