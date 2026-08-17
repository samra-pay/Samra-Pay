import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { IS_MOCK } from '@/lib/data-mode';
import { RECONCILIATION_RUNS } from '@/lib/fixtures';
import { opsApi } from '@/lib/ops-api';
import type { ReconciliationException, ReconciliationRun } from '@/lib/types';
import { OpsShell } from '@/components/ops-shell';
import {
  MoneyDisplay,
  PageHeader,
  TimestampDisplay,
  TimezoneSwitcher,
  useTimezonePref,
} from '@/components/ops-formatters';
import { ApiErrorState, EmptyState, ReadOnlyAction, TableSkeleton } from '@/components/ops-states';
import { Badge } from '@workspace/samra-pay-ds/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@workspace/samra-pay-ds/components/ui/select';
import { Separator } from '@workspace/samra-pay-ds/components/ui/separator';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@workspace/samra-pay-ds/components/ui/sheet';
import { AlertTriangle, CheckCircle2, Eye } from 'lucide-react';

const RUN_STYLES: Record<ReconciliationRun['status'], string> = {
  completed: 'bg-eucalyptus text-eucalyptus-foreground',
  failed: 'bg-destructive text-destructive-foreground',
  running: 'bg-injera text-injera-foreground',
  partial: 'bg-berbere text-berbere-foreground',
};

function ExceptionRow({
  exception,
  showLocal,
}: {
  exception: ReconciliationException;
  showLocal: boolean;
}) {
  return (
    <div className="rounded-md border border-berbere/30 bg-berbere/5 p-3 space-y-2" data-testid={`recon-exception-${exception.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="size-3.5 text-berbere" aria-hidden="true" />
          <span className="font-mono text-xs font-semibold text-foreground">{exception.exceptionType.replaceAll('_', ' ')}</span>
        </div>
        <TimestampDisplay iso={exception.raisedAt} showLocal={showLocal} />
      </div>
      <p className="text-xs text-muted-foreground">{exception.notes}</p>
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <p className="text-muted-foreground">Samra canonical value</p>
          {exception.samraValue ? <MoneyDisplay money={exception.samraValue} /> : <span>—</span>}
        </div>
        <div>
          <p className="text-muted-foreground">Provider evidence</p>
          {exception.providerValue ? <MoneyDisplay money={exception.providerValue} /> : <span>Missing provider record</span>}
        </div>
      </div>
      {exception.transferRef && <p className="font-mono text-[10px] text-muted-foreground">{exception.transferRef}</p>}
    </div>
  );
}

export default function ReconciliationPage() {
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedRun, setSelectedRun] = useState<ReconciliationRun | null>(null);
  const { showLocal, toggleLocal } = useTimezonePref();
  const query = useQuery<ReconciliationRun[]>({
    queryKey: ['reconciliation-runs', { mock: IS_MOCK }],
    queryFn: () => (IS_MOCK ? Promise.resolve(RECONCILIATION_RUNS) : opsApi.getReconciliationRuns()),
    retry: 1,
  });
  const runs = useMemo(
    () => (query.data ?? []).filter((run) => statusFilter === 'all' || run.status === statusFilter),
    [query.data, statusFilter],
  );

  return (
    <OpsShell>
      <PageHeader title="Reconciliation" description="Read-only matching runs and exception evidence">
        <TimezoneSwitcher showLocal={showLocal} onToggle={toggleLocal} />
      </PageHeader>
      <div className="flex items-center justify-between gap-3 px-6 py-3 border-b border-border bg-card/50">
        <p className="text-xs text-muted-foreground">Provider evidence is investigated against Samra canonical records.</p>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36 h-8 text-xs" aria-label="Filter reconciliation runs" data-testid="filter-reconciliation-status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All runs</SelectItem>
            <SelectItem value="running">Running</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="partial">Partial</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="p-6">
        {query.isLoading && <TableSkeleton rows={5} cols={6} />}
        {query.error && <ApiErrorState error={query.error} onRetry={() => query.refetch()} />}
        {query.data && runs.length === 0 && <EmptyState message="No reconciliation runs match this filter." />}
        {runs.length > 0 && (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm" aria-label="Reconciliation runs">
              <thead><tr className="border-b border-border bg-muted/40">
                {['Run', 'Provider', 'State', 'Records', 'Matched', 'Exceptions', 'Detail'].map((header) => (
                  <th key={header} className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{header}</th>
                ))}
              </tr></thead>
              <tbody>{runs.map((run) => (
                <tr key={run.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3"><span className="font-mono text-xs">{run.reference}</span><br /><TimestampDisplay iso={run.startedAt} showLocal={showLocal} /></td>
                  <td className="px-4 py-3 text-xs">{run.provider}</td>
                  <td className="px-4 py-3"><Badge className={RUN_STYLES[run.status]}>{run.status}</Badge></td>
                  <td className="px-4 py-3 font-mono text-xs">{run.totalRecords}</td>
                  <td className="px-4 py-3"><span className="flex items-center gap-1 text-xs"><CheckCircle2 className="size-3 text-eucalyptus" aria-hidden="true" />{run.matchedRecords}</span></td>
                  <td className="px-4 py-3"><span className="font-mono text-xs">{run.exceptionCount}</span></td>
                  <td className="px-4 py-3"><button className="text-xs text-primary hover:underline focus-visible:outline-none focus-visible:underline" onClick={() => setSelectedRun(run)} data-testid={`investigate-recon-${run.id}`}>Inspect</button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
      <Sheet open={Boolean(selectedRun)} onOpenChange={(open) => !open && setSelectedRun(null)}>
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto dark" aria-label="Reconciliation run detail">
          {selectedRun && <><SheetHeader><SheetTitle className="font-mono text-sm">{selectedRun.reference}</SheetTitle></SheetHeader>
            <div className="mt-6 space-y-6">
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div><p className="text-muted-foreground">Records</p><p className="font-mono text-base">{selectedRun.totalRecords}</p></div>
                <div><p className="text-muted-foreground">Matched</p><p className="font-mono text-base">{selectedRun.matchedRecords}</p></div>
                <div><p className="text-muted-foreground">Exceptions</p><p className="font-mono text-base">{selectedRun.exceptionCount}</p></div>
              </div>
              <Separator />
              <section><h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">Exceptions</h3>
                {selectedRun.exceptions.length ? <div className="space-y-3">{selectedRun.exceptions.map((exception) => <ExceptionRow key={exception.id} exception={exception} showLocal={showLocal} />)}</div> : <EmptyState compact message="No exceptions in this run." />}
              </section>
              <ReadOnlyAction label="Requires audited operations command" />
            </div>
          </>}
        </SheetContent>
      </Sheet>
    </OpsShell>
  );
}