import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { IS_MOCK } from '@/lib/data-mode';
import { AGGREGATE_REPORTS } from '@/lib/fixtures';
import { opsApi } from '@/lib/ops-api';
import type { AggregateReport } from '@/lib/types';
import { OpsShell } from '@/components/ops-shell';
import { MetricCard, PageHeader, TimestampDisplay, TimezoneSwitcher, useTimezonePref } from '@/components/ops-formatters';
import { ApiErrorState, EmptyState, MetricsSkeleton } from '@/components/ops-states';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@workspace/samra-pay-ds/components/ui/select';

export default function ReportsPage() {
  const [reportId, setReportId] = useState('');
  const { showLocal, toggleLocal } = useTimezonePref();
  const query = useQuery<AggregateReport[]>({ queryKey: ['aggregate-reports', { mock: IS_MOCK }], queryFn: () => IS_MOCK ? Promise.resolve(AGGREGATE_REPORTS) : opsApi.getReports(), retry: 1 });
  const reports = query.data ?? [];
  const selected = reports.find((report) => report.id === reportId) ?? reports[0];
  return <OpsShell>
    <PageHeader title="Reports" description="Read-only supplied operational aggregates — no browser-side financial recomputation"><TimezoneSwitcher showLocal={showLocal} onToggle={toggleLocal} /></PageHeader>
    {query.isLoading && <div className="p-6"><MetricsSkeleton /></div>}
    {query.error && <div className="p-6"><ApiErrorState error={query.error} onRetry={() => query.refetch()} /></div>}
    {query.data && query.data.length === 0 && <EmptyState message="No supplied operational reports are available." />}
    {selected && <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row gap-3 md:items-end md:justify-between rounded-lg border border-border bg-card p-4"><div><p className="text-xs text-muted-foreground">Reporting period</p><h2 className="text-lg font-semibold">{selected.title}</h2><p className="font-mono text-xs text-muted-foreground mt-1">{selected.period} · generated <TimestampDisplay iso={selected.generatedAt} showLocal={showLocal} /></p></div><Select value={reportId || selected.id} onValueChange={setReportId}><SelectTrigger className="w-64 h-8 text-xs" aria-label="Select operational report" data-testid="select-report"><SelectValue /></SelectTrigger><SelectContent>{reports.map((report) => <SelectItem key={report.id} value={report.id}>{report.title}</SelectItem>)}</SelectContent></Select></div>
      {selected.sections.map((section) => <section key={section.title}><h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">{section.title}</h3><div className="grid grid-cols-2 xl:grid-cols-4 gap-4">{section.metrics.map((metric) => <MetricCard key={metric.label} metric={metric} />)}</div></section>)}
    </div>}
  </OpsShell>;
}