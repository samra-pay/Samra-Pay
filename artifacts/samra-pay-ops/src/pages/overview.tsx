import { useState, useMemo } from 'react';
import { IS_MOCK } from '@/lib/data-mode';
import { OVERVIEW_METRICS, TRANSFERS } from '@/lib/fixtures';
import { opsApi } from '@/lib/ops-api';
import { useQuery } from '@tanstack/react-query';
import { OpsShell } from '@/components/ops-shell';
import { PageHeader, MetricCard, TransferStatusBadge, MoneyDisplay, TimestampDisplay, useTimezonePref, TimezoneSwitcher } from '@/components/ops-formatters';
import { MetricsSkeleton, TableSkeleton, ApiErrorState } from '@/components/ops-states';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@workspace/samra-pay-ds/components/ui/select';
import { Badge } from '@workspace/samra-pay-ds/components/ui/badge';
import { Separator } from '@workspace/samra-pay-ds/components/ui/separator';
import { Link } from 'wouter';
import type { OpsMetric, Transfer } from '@/lib/types';

export default function OverviewPage() {
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('today');
  const { showLocal, toggleLocal } = useTimezonePref();

  const metricsQuery = useQuery<OpsMetric[]>({
    queryKey: ['overview-metrics', { mock: IS_MOCK }],
    queryFn: async () => {
      if (IS_MOCK) return OVERVIEW_METRICS;
      return opsApi.getOverviewMetrics();
    },
    retry: 1,
  });

  const transfersQuery = useQuery<Transfer[]>({
    queryKey: ['transfers', { mock: IS_MOCK }],
    queryFn: async () => {
      if (IS_MOCK) return TRANSFERS;
      return opsApi.getTransfers();
    },
    retry: 1,
  });

  const filteredTransfers = useMemo(() => {
    const txns = transfersQuery.data ?? [];
    return statusFilter === 'all'
      ? txns
      : txns.filter((t) => t.status === statusFilter);
  }, [transfersQuery.data, statusFilter]);

  return (
    <OpsShell>
      <PageHeader
        title="Overview"
        description="Read-only operational overview — all values from ledger or provider source"
      >
        <TimezoneSwitcher showLocal={showLocal} onToggle={toggleLocal} />
        <Select value={dateFilter} onValueChange={setDateFilter}>
          <SelectTrigger className="w-32 h-8 text-xs" data-testid="date-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
          </SelectContent>
        </Select>
      </PageHeader>

      <div className="p-6 space-y-8">
        {/* Metrics grid */}
        <section aria-label="Operational metrics">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">
            Metrics
          </h2>
          {metricsQuery.isLoading && <MetricsSkeleton />}
          {metricsQuery.error && (
            <ApiErrorState
              error={metricsQuery.error}
              onRetry={() => metricsQuery.refetch()}
            />
          )}
          {metricsQuery.data && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {metricsQuery.data.map((m) => (
                <MetricCard key={m.label} metric={m} />
              ))}
            </div>
          )}
        </section>

        <Separator />

        {/* Recent transfers */}
        <section aria-label="Recent transfers">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
              Recent Transfers
            </h2>
            <div className="flex items-center gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40 h-7 text-xs" data-testid="status-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="timed_out">Timed out</SelectItem>
                  <SelectItem value="reconciliation_exception">Recon exception</SelectItem>
                </SelectContent>
              </Select>
              <Link
                href="/transfers"
                className="text-xs text-primary hover:underline focus-visible:outline-none focus-visible:underline"
                data-testid="link-all-transfers"
              >
                View all
              </Link>
            </div>
          </div>

          {transfersQuery.isLoading && <TableSkeleton rows={5} cols={6} />}
          {transfersQuery.error && (
            <ApiErrorState
              error={transfersQuery.error}
              onRetry={() => transfersQuery.refetch()}
              compact
            />
          )}
          {transfersQuery.data && (
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm" aria-label="Recent transfers table">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Reference</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Sender</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Amount</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Status</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden md:table-cell">Created</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTransfers.map((txn) => (
                    <tr
                      key={txn.id}
                      className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                      data-testid={`row-transfer-${txn.id}`}
                    >
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-foreground">{txn.reference}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-foreground">{txn.senderName}</span>
                      </td>
                      <td className="px-4 py-3">
                        <MoneyDisplay money={txn.sendAmount} />
                      </td>
                      <td className="px-4 py-3">
                        <TransferStatusBadge status={txn.status} />
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <TimestampDisplay iso={txn.createdAt} showLocal={showLocal} />
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/transfers?id=${txn.id}`}
                          className="text-xs text-primary hover:underline focus-visible:outline-none focus-visible:underline"
                          data-testid={`link-transfer-${txn.id}`}
                        >
                          Investigate
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredTransfers.length === 0 && (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  No transfers match the current filter.
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </OpsShell>
  );
}
