import { useQuery } from '@tanstack/react-query';
import { IS_MOCK } from '@/lib/data-mode';
import { SYSTEM_HEALTH } from '@/lib/fixtures';
import { opsApi } from '@/lib/ops-api';
import type { SystemHealth } from '@/lib/types';
import { OpsShell } from '@/components/ops-shell';
import { HealthStatusBadge, PageHeader, TimestampDisplay, TimezoneSwitcher, useTimezonePref } from '@/components/ops-formatters';
import { ApiErrorState, MetricsSkeleton } from '@/components/ops-states';
import { Badge } from '@workspace/samra-pay-ds/components/ui/badge';

export default function SystemHealthPage() {
  const { showLocal, toggleLocal } = useTimezonePref();
  const query = useQuery<SystemHealth>({ queryKey: ['system-health', { mock: IS_MOCK }], queryFn: () => IS_MOCK ? Promise.resolve(SYSTEM_HEALTH) : opsApi.getSystemHealth(), retry: 1 });
  return <OpsShell>
    <PageHeader title="System Health" description="Supplied API, database, worker, provider, and cache signals"><TimezoneSwitcher showLocal={showLocal} onToggle={toggleLocal} /></PageHeader>
    <div className="p-6">{query.isLoading && <MetricsSkeleton />}{query.error && <ApiErrorState error={query.error} onRetry={() => query.refetch()} />}{query.data && <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between rounded-lg border border-border bg-card p-5"><div><p className="text-xs uppercase tracking-widest text-muted-foreground">Overall service signal</p><div className="mt-2"><HealthStatusBadge status={query.data.overallStatus} /></div></div><p className="text-xs text-muted-foreground">Last supplied check: <TimestampDisplay iso={query.data.checkedAt} showLocal={showLocal} /></p></div>
      <div className="grid gap-3 md:grid-cols-2">{query.data.signals.map((signal) => <article key={`${signal.category}-${signal.component}`} className="rounded-lg border border-border bg-card p-4" data-testid={`health-signal-${signal.component.toLowerCase().replaceAll(' ', '-')}`}><div className="flex items-start justify-between gap-3"><div><h2 className="text-sm font-semibold">{signal.component}</h2><Badge variant="outline" className="mt-1 text-[10px]">{signal.category}</Badge></div><HealthStatusBadge status={signal.status} /></div><dl className="mt-4 grid grid-cols-2 gap-3 text-xs"><div><dt className="text-muted-foreground">Latency</dt><dd className="font-mono">{signal.latencyMs === undefined ? '—' : `${signal.latencyMs} ms`}</dd></div><div><dt className="text-muted-foreground">Checked</dt><dd><TimestampDisplay iso={signal.lastCheckedAt} showLocal={showLocal} /></dd></div></dl>{signal.message && <p className="mt-3 rounded bg-muted/50 p-2 text-xs text-muted-foreground">{signal.message}</p>}</article>)}</div>
    </div>}</div>
  </OpsShell>;
}