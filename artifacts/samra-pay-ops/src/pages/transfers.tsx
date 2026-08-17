import { useEffect, useState, useMemo } from 'react';
import { useSearch } from 'wouter';
import { IS_MOCK } from '@/lib/data-mode';
import { TRANSFERS } from '@/lib/fixtures';
import { opsApi } from '@/lib/ops-api';
import { useQuery } from '@tanstack/react-query';
import { OpsShell } from '@/components/ops-shell';
import { PageHeader, TransferStatusBadge, FundingStateBadge, PayoutStateBadge, ReconciliationStateBadge, MoneyDisplay, TimestampDisplay, useTimezonePref, TimezoneSwitcher, SourceChip } from '@/components/ops-formatters';
import { TableSkeleton, ApiErrorState, EmptyState, ReadOnlyAction } from '@/components/ops-states';
import { Input } from '@workspace/samra-pay-ds/components/ui/input';
import { Badge } from '@workspace/samra-pay-ds/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@workspace/samra-pay-ds/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@workspace/samra-pay-ds/components/ui/sheet';
import { Separator } from '@workspace/samra-pay-ds/components/ui/separator';
import { Search, AlertCircle } from 'lucide-react';
import type { Transfer, TimelineEvent } from '@/lib/types';
import { cn } from '@workspace/samra-pay-ds/lib/utils';
import { chronologicalTimeline, filterTransfers } from '@/lib/ops-selectors';

const TIMELINE_CATEGORY_CONFIG = {
  samra_canonical: {
    label: 'Samra Ledger',
    className: 'bg-primary text-primary-foreground',
    dotClass: 'bg-primary border-2 border-primary',
  },
  provider_evidence: {
    label: 'Provider Evidence',
    className: 'bg-muted text-muted-foreground border border-border',
    dotClass: 'bg-muted-foreground border-2 border-border',
  },
  system: {
    label: 'System',
    className: 'bg-muted text-muted-foreground border border-border',
    dotClass: 'bg-muted-foreground/60 border-2 border-border',
  },
  worker: {
    label: 'Worker',
    className: 'bg-muted text-muted-foreground border border-border',
    dotClass: 'bg-muted-foreground/60 border-2 border-border',
  },
};

function TimelineEventRow({ event, showLocal }: { event: TimelineEvent; showLocal: boolean }) {
  const cfg = TIMELINE_CATEGORY_CONFIG[event.category];
  return (
    <div className="flex gap-3" data-testid={`timeline-event-${event.id}`}>
      <div className="flex flex-col items-center">
        <div className={cn('w-3 h-3 rounded-full mt-1 shrink-0', cfg.dotClass)} aria-hidden="true" />
        <div className="w-px flex-1 bg-border mt-1" aria-hidden="true" />
      </div>
      <div className="pb-4 min-w-0 flex-1">
        <div className="flex flex-wrap gap-2 items-start mb-1">
          <Badge className={cn(cfg.className, 'text-[10px] h-5 px-1.5')}>{cfg.label}</Badge>
          <span className="text-xs font-medium text-foreground">{event.label}</span>
        </div>
        {event.detail && <p className="text-xs text-muted-foreground mb-1">{event.detail}</p>}
        <div className="flex flex-wrap gap-3 items-center">
          <TimestampDisplay iso={event.timestamp} showLocal={showLocal} className="text-muted-foreground" />
          {event.correlationRef && <span className="font-mono text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-sm">{event.correlationRef}</span>}
        </div>
        {event.category === 'provider_evidence' && <p className="text-[10px] text-muted-foreground mt-1 italic">Provider-reported evidence — does not override Samra ledger state</p>}
      </div>
    </div>
  );
}

export default function TransfersPage() {
  const searchStr = useSearch();
  const params = new URLSearchParams(searchStr);
  const initialId = params.get('id') ?? '';
  const initialSender = params.get('sender') ?? '';

  const [search, setSearch] = useState(initialSender);
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedTransferSummary, setSelectedTransfer] = useState<Transfer | null>(null);
  const { showLocal, toggleLocal } = useTimezonePref();

  const transfersQuery = useQuery<Transfer[]>({
    queryKey: ['transfers', { mock: IS_MOCK }],
    queryFn: async () => {
      if (IS_MOCK) return TRANSFERS;
      return opsApi.getTransfers();
    },
    retry: 1,
  });

  const transferDetailQuery = useQuery<Transfer>({
    queryKey: ['transfer-detail', selectedTransferSummary?.id],
    queryFn: () => opsApi.getTransfer(selectedTransferSummary!.id),
    enabled: !IS_MOCK && selectedTransferSummary !== null,
    retry: 1,
  });

  const selectedTransfer = IS_MOCK ? selectedTransferSummary : (transferDetailQuery.data ?? selectedTransferSummary);

  // Auto-open from URL param
  useEffect(() => {
    if (initialId && transfersQuery.data) {
      const found = transfersQuery.data.find((t) => t.id === initialId);
      if (found) setSelectedTransfer(found);
    }
  }, [initialId, transfersQuery.data]);

  const filtered = useMemo(() => filterTransfers(transfersQuery.data ?? [], search, statusFilter as 'all' | Transfer['status']), [transfersQuery.data, search, statusFilter]);

  return (
    <OpsShell>
      <PageHeader title="Transfers" description="Transfer queue and detail investigation — Samra canonical state is authoritative">
        <TimezoneSwitcher showLocal={showLocal} onToggle={toggleLocal} />
      </PageHeader>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3 px-6 py-3 border-b border-border bg-card/50">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" aria-hidden="true" />
          <Input type="search" placeholder="Reference, name, provider ref..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-8 text-sm" data-testid="search-transfers" aria-label="Search transfers" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48 h-8 text-xs" data-testid="filter-transfer-status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="refunded">Refunded</SelectItem>
            <SelectItem value="reversed">Reversed</SelectItem>
            <SelectItem value="timed_out">Timed out</SelectItem>
            <SelectItem value="reconciliation_exception">Recon exception</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="p-6">
        {transfersQuery.isLoading && <TableSkeleton rows={8} cols={6} />}
        {transfersQuery.error && <ApiErrorState error={transfersQuery.error} onRetry={() => transfersQuery.refetch()} />}
        {transfersQuery.data && filtered.length === 0 && <EmptyState message="No transfers match your filters." />}
        {transfersQuery.data && filtered.length > 0 && (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm" aria-label="Transfers table">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Reference</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden lg:table-cell">Sender</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Send</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden md:table-cell">Receive</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Status</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden xl:table-cell">Created</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Detail</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((txn) => (
                  <tr key={txn.id} className={cn('border-b border-border last:border-0 transition-colors', selectedTransfer?.id === txn.id ? 'bg-accent' : 'hover:bg-muted/30')} data-testid={`row-transfer-${txn.id}`}>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-foreground">{txn.reference}</span>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className="text-xs">{txn.senderName}</span>
                    </td>
                    <td className="px-4 py-3">
                      <MoneyDisplay money={txn.sendAmount} />
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <MoneyDisplay money={txn.receiveAmount} />
                    </td>
                    <td className="px-4 py-3">
                      <TransferStatusBadge status={txn.status} />
                    </td>
                    <td className="px-4 py-3 hidden xl:table-cell">
                      <TimestampDisplay iso={txn.createdAt} showLocal={showLocal} />
                    </td>
                    <td className="px-4 py-3">
                      <button
                        className="text-xs text-primary hover:underline focus-visible:outline-none focus-visible:underline"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedTransfer(txn);
                        }}
                        data-testid={`btn-investigate-transfer-${txn.id}`}
                      >
                        Investigate
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Transfer detail drawer */}
      <Sheet open={!!selectedTransfer} onOpenChange={(o) => !o && setSelectedTransfer(null)}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto dark" data-testid="transfer-drawer" aria-label="Transfer investigation">
          {selectedTransfer && (
            <>
              <SheetHeader>
                <SheetTitle className="font-mono text-sm">{selectedTransfer.reference}</SheetTitle>
                <div className="flex flex-wrap gap-2 items-center">
                  <TransferStatusBadge status={selectedTransfer.status} />
                  <span className="text-xs text-muted-foreground">ID: {selectedTransfer.id}</span>
                </div>
              </SheetHeader>

              {!IS_MOCK && transferDetailQuery.error && (
                <div className="mt-4">
                  <ApiErrorState error={transferDetailQuery.error} onRetry={() => transferDetailQuery.refetch()} compact />
                </div>
              )}

              <div className="mt-6 space-y-6">
                {/* Key financials */}
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Financials</h3>
                    <SourceChip source="ledger" />
                  </div>
                  <dl className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <div className="col-span-2 md:col-span-1">
                      <dt className="text-xs text-muted-foreground">Send Amount</dt>
                      <dd>
                        <MoneyDisplay money={selectedTransfer.sendAmount} large />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Receive Amount</dt>
                      <dd>
                        <MoneyDisplay money={selectedTransfer.receiveAmount} large />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Fee</dt>
                      <dd>
                        <MoneyDisplay money={selectedTransfer.fee} />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Exchange Rate</dt>
                      <dd className="font-mono text-sm tabular-nums">{selectedTransfer.exchangeRate}</dd>
                    </div>
                  </dl>
                </section>

                <Separator />

                {/* Parties */}
                <section>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">Parties</h3>
                  <dl className="grid grid-cols-2 gap-3">
                    <div>
                      <dt className="text-xs text-muted-foreground">Sender</dt>
                      <dd className="text-xs text-foreground">{selectedTransfer.senderName}</dd>
                      <dd className="font-mono text-xs text-muted-foreground">{selectedTransfer.senderId}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Recipient</dt>
                      <dd className="text-xs text-foreground">{selectedTransfer.recipientName}</dd>
                    </div>
                  </dl>
                </section>

                <Separator />

                {/* States */}
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">States</h3>
                    <AlertCircle className="size-3 text-muted-foreground" aria-hidden="true" />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Funding</div>
                      <FundingStateBadge state={selectedTransfer.fundingState} />
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Payout</div>
                      <PayoutStateBadge state={selectedTransfer.payoutState} />
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Reconciliation</div>
                      <ReconciliationStateBadge state={selectedTransfer.reconciliationState} />
                    </div>
                  </div>
                </section>

                {/* Provider refs */}
                {(selectedTransfer.providerRef || selectedTransfer.providerCorrelationRef) && (
                  <>
                    <Separator />
                    <section>
                      <div className="flex items-center gap-2 mb-3">
                        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Provider References</h3>
                        <SourceChip source="provider" />
                      </div>
                      <p className="text-[10px] text-muted-foreground mb-2 italic">Provider references are evidence only — Samra ledger state is authoritative.</p>
                      <dl className="space-y-1">
                        {selectedTransfer.providerRef && (
                          <div>
                            <dt className="text-xs text-muted-foreground">Provider Ref</dt>
                            <dd className="font-mono text-xs text-foreground">{selectedTransfer.providerRef}</dd>
                          </div>
                        )}
                        {selectedTransfer.providerCorrelationRef && (
                          <div>
                            <dt className="text-xs text-muted-foreground">Correlation Ref</dt>
                            <dd className="font-mono text-xs text-foreground">{selectedTransfer.providerCorrelationRef}</dd>
                          </div>
                        )}
                      </dl>
                    </section>
                  </>
                )}

                <Separator />

                {/* Timestamps */}
                <section>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">Timestamps</h3>
                  <dl className="space-y-1">
                    <div className="flex justify-between">
                      <dt className="text-xs text-muted-foreground">Created</dt>
                      <dd>
                        <TimestampDisplay iso={selectedTransfer.createdAt} showLocal={showLocal} />
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-xs text-muted-foreground">Updated</dt>
                      <dd>
                        <TimestampDisplay iso={selectedTransfer.updatedAt} showLocal={showLocal} />
                      </dd>
                    </div>
                    {selectedTransfer.completedAt && (
                      <div className="flex justify-between">
                        <dt className="text-xs text-muted-foreground">Completed</dt>
                        <dd>
                          <TimestampDisplay iso={selectedTransfer.completedAt} showLocal={showLocal} />
                        </dd>
                      </div>
                    )}
                  </dl>
                </section>

                <Separator />

                {/* Timeline */}
                <section>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-4">Chronological Timeline</h3>
                  <div className="space-y-0" aria-label="Transfer timeline">
                    {chronologicalTimeline(selectedTransfer.timeline).map((event) => (
                      <TimelineEventRow key={event.id} event={event} showLocal={showLocal} />
                    ))}
                  </div>
                </section>

                <Separator />

                <div>
                  <ReadOnlyAction label="Requires audited operations command" />
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </OpsShell>
  );
}
