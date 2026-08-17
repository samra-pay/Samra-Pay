import { useState, useMemo } from 'react';
import { IS_MOCK } from '@/lib/data-mode';
import { MONEY_FLOWS, TRANSFERS } from '@/lib/fixtures';
import { opsApi } from '@/lib/ops-api';
import { useQuery } from '@tanstack/react-query';
import { OpsShell } from '@/components/ops-shell';
import {
  PageHeader,
  TransferStatusBadge,
  MoneyDisplay,
  TimestampDisplay,
  useTimezonePref,
  TimezoneSwitcher,
} from '@/components/ops-formatters';
import { TableSkeleton, ApiErrorState, EmptyState } from '@/components/ops-states';
import { Badge } from '@workspace/samra-pay-ds/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@workspace/samra-pay-ds/components/ui/select';
import { Input } from '@workspace/samra-pay-ds/components/ui/input';
import { Separator } from '@workspace/samra-pay-ds/components/ui/separator';
import { CheckCircle2, Circle, XCircle, Loader2, SkipForward, Search } from 'lucide-react';
import type { MoneyFlow, FlowStage, FlowStageStatus, TransferStatus } from '@/lib/types';
import { cn } from '@workspace/samra-pay-ds/lib/utils';
import { filterMoneyFlows, fixtureTransferLookup } from '@/lib/ops-selectors';

const STAGE_ICON: Record<FlowStageStatus, React.ElementType> = {
  complete: CheckCircle2,
  active: Loader2,
  failed: XCircle,
  pending: Circle,
  skipped: SkipForward,
};

const STAGE_CLASS: Record<FlowStageStatus, string> = {
  complete: 'text-eucalyptus',
  active: 'text-primary animate-spin',
  failed: 'text-destructive',
  pending: 'text-muted-foreground',
  skipped: 'text-muted-foreground opacity-50',
};

const STAGE_BAR: Record<FlowStageStatus, string> = {
  complete: 'bg-eucalyptus',
  active: 'bg-primary',
  failed: 'bg-destructive',
  pending: 'bg-muted',
  skipped: 'bg-muted opacity-40',
};

function FlowStageBar({ stage, isCurrent }: { stage: FlowStage; isCurrent: boolean }) {
  const Icon = STAGE_ICON[stage.status];
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-colors',
        isCurrent ? 'border-primary bg-accent' : 'border-border bg-card',
      )}
      data-testid={`flow-stage-${stage.stage}`}
      aria-current={isCurrent ? 'step' : undefined}
    >
      <div className={cn('flex items-center gap-2')}>
        <Icon className={cn('size-4', STAGE_CLASS[stage.status])} aria-hidden="true" />
        <span className={cn('text-xs font-semibold', stage.status === 'pending' || stage.status === 'skipped' ? 'text-muted-foreground' : 'text-foreground')}>
          {stage.label}
        </span>
      </div>
      <div className={cn('h-1 w-full rounded-full', STAGE_BAR[stage.status])} aria-hidden="true" />
      {stage.durationMs !== undefined && (
        <span className="text-xs text-muted-foreground font-mono">
          {stage.durationMs >= 60000
            ? `${Math.round(stage.durationMs / 60000)}m`
            : `${Math.round(stage.durationMs / 1000)}s`}
        </span>
      )}
      {stage.note && (
        <span className="text-[10px] text-berbere leading-tight text-center">{stage.note}</span>
      )}
      {stage.money && <MoneyDisplay money={stage.money} className="text-[10px]" />}
    </div>
  );
}

export default function MoneyFlowPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | TransferStatus>('all');
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);
  const { showLocal, toggleLocal } = useTimezonePref();

  const flowsQuery = useQuery<MoneyFlow[]>({
    queryKey: ['money-flows', { mock: IS_MOCK }],
    queryFn: async () => {
      if (IS_MOCK) return MONEY_FLOWS;
      return opsApi.getMoneyFlows();
    },
    retry: 1,
  });

  const transfersMap = useMemo(() => {
    return fixtureTransferLookup(IS_MOCK ? 'mock' : 'api', TRANSFERS);
  }, []);

  const filtered = useMemo(() => {
    const list = flowsQuery.data ?? [];
    return filterMoneyFlows(
      IS_MOCK ? 'mock' : 'api',
      list,
      transfersMap,
      search,
      statusFilter,
    );
  }, [flowsQuery.data, search, statusFilter, transfersMap]);

  const selectedFlow = filtered.find((f) => f.transferId === selectedFlowId) ?? filtered[0] ?? null;
  const selectedTransfer = selectedFlow ? transfersMap.get(selectedFlow.transferId) : null;

  return (
    <OpsShell>
      <PageHeader
        title="Money Flow"
        description="Stage-by-stage synthetic money-flow investigation — never implies provider evidence replaces ledger"
      >
        <TimezoneSwitcher showLocal={showLocal} onToggle={toggleLocal} />
      </PageHeader>

      <div className="flex flex-col md:flex-row min-h-0 h-full">
        {/* Left panel: transfer list */}
        <div className="md:w-80 shrink-0 border-b md:border-b-0 md:border-r border-border flex flex-col">
          <div className="p-3 border-b border-border space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" aria-hidden="true" />
              <Input
                type="search"
                placeholder="Reference..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-xs"
                data-testid="search-flows"
                aria-label="Search money flows"
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={(value) => setStatusFilter(value as 'all' | TransferStatus)}
              disabled={!IS_MOCK}
            >
              <SelectTrigger className="h-8 text-xs" data-testid="filter-flow-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="timed_out">Timed out</SelectItem>
                <SelectItem value="reconciliation_exception">Recon exception</SelectItem>
              </SelectContent>
            </Select>
            {!IS_MOCK && (
              <p className="text-[10px] leading-tight text-muted-foreground">
                Transfer-status filtering requires authorized transfer data.
              </p>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {flowsQuery.isLoading && (
              <div className="p-3 space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-14 rounded bg-muted animate-pulse" />
                ))}
              </div>
            )}
            {flowsQuery.error && (
              <ApiErrorState error={flowsQuery.error} onRetry={() => flowsQuery.refetch()} compact />
            )}
            {filtered.length === 0 && flowsQuery.data && (
              <EmptyState message="No flows match." compact />
            )}
            {filtered.map((flow) => {
              const tx = transfersMap.get(flow.transferId);
              const isSelected = flow.transferId === (selectedFlow?.transferId);
              return (
                <button
                  key={flow.transferId}
                  className={cn(
                    'w-full text-left px-4 py-3 border-b border-border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                    isSelected ? 'bg-accent' : 'hover:bg-muted/30',
                  )}
                  onClick={() => setSelectedFlowId(flow.transferId)}
                  data-testid={`flow-item-${flow.transferId}`}
                >
                  <div className="font-mono text-xs text-foreground">{flow.reference}</div>
                  {tx && (
                    <div className="flex items-center gap-2 mt-1">
                      <TransferStatusBadge status={tx.status} />
                      <MoneyDisplay money={tx.sendAmount} className="text-xs" />
                    </div>
                  )}
                  {!tx && !IS_MOCK && (
                    <div className="mt-1 text-[10px] text-muted-foreground">
                      Flow evidence only
                    </div>
                  )}
                  <div className="flex gap-1 mt-1.5">
                    {flow.stages.map((s) => {
                      const Icon = STAGE_ICON[s.status];
                      return (
                        <span key={s.stage} title={s.label}>
                          <Icon className={cn('size-3', STAGE_CLASS[s.status])} aria-label={s.label} />
                        </span>
                      );
                    })}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right panel: flow detail */}
        <div className="flex-1 overflow-y-auto p-6">
          {!selectedFlow && (
            <EmptyState message="Select a transfer to view its flow." />
          )}
          {selectedFlow && (
            <div className="space-y-6">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h2 className="font-mono text-sm font-semibold text-foreground">{selectedFlow.reference}</h2>
                  {selectedTransfer && <TransferStatusBadge status={selectedTransfer.status} />}
                  {!selectedTransfer && (
                    <Badge variant="outline" className="text-[10px]">
                      Flow evidence only
                    </Badge>
                  )}
                </div>
                {selectedTransfer ? (
                  <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                    <span>{selectedTransfer.senderName} → {selectedTransfer.recipientName}</span>
                    <MoneyDisplay money={selectedTransfer.sendAmount} />
                    <span className="text-muted-foreground">→</span>
                    <MoneyDisplay money={selectedTransfer.receiveAmount} />
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Transfer presentation fields are not supplied in the authorized flow response.
                  </p>
                )}
              </div>

              <Separator />

              {/* Stage bars */}
              <section aria-label="Flow stages">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">
                  Stage Progression
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {selectedFlow.stages.map((stage) => (
                    <FlowStageBar
                      key={stage.stage}
                      stage={stage}
                      isCurrent={stage.stage === selectedFlow.currentStage}
                    />
                  ))}
                </div>
              </section>

              <Separator />

              {/* Stage detail table */}
              <section aria-label="Stage detail">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">
                  Stage Detail
                </h3>
                <div className="rounded-lg border border-border overflow-hidden">
                  <table className="w-full text-xs" aria-label="Flow stage detail">
                    <thead>
                      <tr className="border-b border-border bg-muted/40">
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Stage</th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Amount</th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden md:table-cell">Entered</th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden lg:table-cell">Evidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedFlow.stages.map((stage) => {
                        const Icon = STAGE_ICON[stage.status];
                        return (
                          <tr key={stage.stage} className="border-b border-border last:border-0">
                            <td className="px-4 py-3 font-medium text-foreground">{stage.label}</td>
                            <td className="px-4 py-3">
                              <span className={cn('flex items-center gap-1.5', STAGE_CLASS[stage.status])}>
                                <Icon className="size-3" aria-hidden="true" />
                                <span className="capitalize">{stage.status.replace('_', ' ')}</span>
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              {stage.money ? <MoneyDisplay money={stage.money} className="text-xs" /> : <span className="text-muted-foreground">—</span>}
                            </td>
                            <td className="px-4 py-3 hidden md:table-cell">
                              {stage.enteredAt ? (
                                <TimestampDisplay iso={stage.enteredAt} showLocal={showLocal} />
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 hidden lg:table-cell">
                              <span className="block text-[10px] text-muted-foreground">{stage.evidenceSource ?? '—'}</span>
                              {stage.correlationId && <span className="block font-mono text-[10px] text-muted-foreground">{stage.correlationId}</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="grid md:grid-cols-2 gap-3" aria-label="Operational stage details">
                  {selectedFlow.stages.map((stage) => (
                    <article key={stage.stage} className="rounded-md border border-border bg-card p-3 text-xs">
                      <p className="font-semibold text-foreground">{stage.label}</p>
                      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2">
                        <div><dt className="text-muted-foreground">Attempt</dt><dd className="font-mono">{stage.attempt ?? '—'}</dd></div>
                        <div><dt className="text-muted-foreground">Duration</dt><dd className="font-mono">{stage.durationMs === undefined ? '—' : `${stage.durationMs} ms`}</dd></div>
                        <div><dt className="text-muted-foreground">Next retry</dt><dd>{stage.nextRetryAt ? <TimestampDisplay iso={stage.nextRetryAt} showLocal={showLocal} /> : '—'}</dd></div>
                        <div><dt className="text-muted-foreground">Exited</dt><dd>{stage.exitedAt ? <TimestampDisplay iso={stage.exitedAt} showLocal={showLocal} /> : '—'}</dd></div>
                      </dl>
                      {stage.lastError && <p className="mt-2 rounded bg-berbere/10 p-2 text-[10px] text-berbere">{stage.lastError}</p>}
                    </article>
                  ))}
                </div>
              </section>

              {/* Canonical vs evidence note */}
              <div className="rounded-md border border-border bg-muted/30 p-4 text-xs text-muted-foreground space-y-1">
                <p className="font-semibold text-foreground">Canonical state vs provider evidence</p>
                <p>
                  Stage statuses here reflect the <strong>Samra canonical ledger state</strong> for each phase.
                  Provider evidence (delivery confirmations, settlement records) informs reconciliation but does not
                  override ledger truth. When there is a discrepancy, the ledger state prevails until an audited
                  operations command corrects it.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </OpsShell>
  );
}
