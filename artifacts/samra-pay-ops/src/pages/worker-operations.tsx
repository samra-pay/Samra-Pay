import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { IS_MOCK } from '@/lib/data-mode';
import { WORKER_JOBS } from '@/lib/fixtures';
import { opsApi } from '@/lib/ops-api';
import type { WorkerJob } from '@/lib/types';
import { OpsShell } from '@/components/ops-shell';
import { PageHeader, TimestampDisplay, TimezoneSwitcher, useTimezonePref, WorkerStatusBadge } from '@/components/ops-formatters';
import { ApiErrorState, EmptyState, ReadOnlyAction, TableSkeleton } from '@/components/ops-states';
import { Input } from '@workspace/samra-pay-ds/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@workspace/samra-pay-ds/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@workspace/samra-pay-ds/components/ui/sheet';
import { Search } from 'lucide-react';

export default function WorkerOperationsPage() {
  const [queryText, setQueryText] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedJob, setSelectedJob] = useState<WorkerJob | null>(null);
  const { showLocal, toggleLocal } = useTimezonePref();
  const query = useQuery<WorkerJob[]>({
    queryKey: ['worker-jobs', { mock: IS_MOCK }],
    queryFn: () => (IS_MOCK ? Promise.resolve(WORKER_JOBS) : opsApi.getWorkerJobs()),
    retry: 1,
  });
  const jobs = useMemo(() => (query.data ?? []).filter((job) => {
    const text = queryText.toLowerCase();
    return (statusFilter === 'all' || job.status === statusFilter) &&
      (!text || job.id.includes(text) || job.queue.toLowerCase().includes(text) || job.jobType.toLowerCase().includes(text));
  }), [query.data, queryText, statusFilter]);

  return <OpsShell>
    <PageHeader title="Worker Operations" description="Read-only queue, lease, retry, and processing visibility">
      <TimezoneSwitcher showLocal={showLocal} onToggle={toggleLocal} />
    </PageHeader>
    <div className="flex flex-col md:flex-row gap-3 px-6 py-3 border-b border-border bg-card/50">
      <div className="relative flex-1 max-w-md"><Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" aria-hidden="true" />
        <Input value={queryText} onChange={(event) => setQueryText(event.target.value)} className="h-8 pl-8 text-xs" placeholder="Job ID, queue, or type..." aria-label="Search worker jobs" data-testid="search-worker-jobs" /></div>
      <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="w-40 h-8 text-xs" aria-label="Filter worker status"><SelectValue /></SelectTrigger><SelectContent>
        <SelectItem value="all">All states</SelectItem><SelectItem value="running">Running</SelectItem><SelectItem value="queued">Queued</SelectItem><SelectItem value="retrying">Retrying</SelectItem><SelectItem value="failed">Retry exhausted</SelectItem><SelectItem value="lease_expired">Lease expired</SelectItem>
      </SelectContent></Select>
    </div>
    <div className="p-6">
      {query.isLoading && <TableSkeleton rows={8} cols={7} />}
      {query.error && <ApiErrorState error={query.error} onRetry={() => query.refetch()} />}
      {query.data && jobs.length === 0 && <EmptyState message="No worker jobs match this filter." />}
      {jobs.length > 0 && <div className="rounded-lg border border-border overflow-hidden"><table className="w-full text-sm" aria-label="Worker jobs">
        <thead><tr className="border-b border-border bg-muted/40">{['Job', 'Queue', 'State', 'Attempts', 'Lease', 'Last error', 'Detail'].map((header) => <th key={header} className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{header}</th>)}</tr></thead>
        <tbody>{jobs.map((job) => <tr key={job.id} className="border-b border-border last:border-0 hover:bg-muted/30">
          <td className="px-4 py-3"><p className="font-mono text-xs">{job.id}</p><p className="text-[10px] text-muted-foreground">{job.jobType}</p></td>
          <td className="px-4 py-3 font-mono text-xs">{job.queue}</td><td className="px-4 py-3"><WorkerStatusBadge status={job.status} /></td>
          <td className="px-4 py-3 font-mono text-xs">{job.attempt}/{job.maxAttempts}</td><td className="px-4 py-3">{job.leaseExpiresAt ? <TimestampDisplay iso={job.leaseExpiresAt} showLocal={showLocal} /> : <span className="text-xs text-muted-foreground">—</span>}</td>
          <td className="px-4 py-3 max-w-48 text-xs text-muted-foreground truncate">{job.errorMessage ?? '—'}</td><td className="px-4 py-3"><button onClick={() => setSelectedJob(job)} className="text-xs text-primary hover:underline focus-visible:outline-none focus-visible:underline" data-testid={`inspect-worker-${job.id}`}>Inspect</button></td>
        </tr>)}</tbody>
      </table></div>}
    </div>
    <Sheet open={Boolean(selectedJob)} onOpenChange={(open) => !open && setSelectedJob(null)}><SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto dark" aria-label="Worker job detail">
      {selectedJob && <><SheetHeader><SheetTitle className="font-mono text-sm">{selectedJob.id}</SheetTitle></SheetHeader><div className="mt-6 space-y-6">
        <dl className="grid grid-cols-2 gap-4 text-xs"><div><dt className="text-muted-foreground">Queue</dt><dd className="font-mono">{selectedJob.queue}</dd></div><div><dt className="text-muted-foreground">State</dt><dd className="mt-1"><WorkerStatusBadge status={selectedJob.status} /></dd></div><div><dt className="text-muted-foreground">Enqueued</dt><dd><TimestampDisplay iso={selectedJob.enqueuedAt} showLocal={showLocal} /></dd></div><div><dt className="text-muted-foreground">Next attempt</dt><dd>{selectedJob.status === 'retrying' ? 'Supplied by future API endpoint' : '—'}</dd></div></dl>
        {selectedJob.errorMessage && <div className="rounded-md border border-berbere/30 bg-berbere/5 p-3 text-xs"><p className="font-semibold mb-1">Last error</p><p className="text-muted-foreground">{selectedJob.errorMessage}</p></div>}
        <pre className="overflow-x-auto rounded-md border border-border bg-muted/30 p-3 text-[10px] text-muted-foreground" aria-label="Worker job payload">{JSON.stringify(selectedJob.payload, null, 2)}</pre>
        <ReadOnlyAction label="Requires audited operations command" />
      </div></>}
    </SheetContent></Sheet>
  </OpsShell>;
}