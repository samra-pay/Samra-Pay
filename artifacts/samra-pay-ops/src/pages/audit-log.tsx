import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { IS_MOCK } from '@/lib/data-mode';
import { AUDIT_EVENTS } from '@/lib/fixtures';
import { opsApi } from '@/lib/ops-api';
import type { AuditEvent, AuditEventCategory } from '@/lib/types';
import { OpsShell } from '@/components/ops-shell';
import { PageHeader, TimestampDisplay, TimezoneSwitcher, useTimezonePref } from '@/components/ops-formatters';
import { ApiErrorState, EmptyState, TableSkeleton } from '@/components/ops-states';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@workspace/samra-pay-ds/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@workspace/samra-pay-ds/components/ui/sheet';
import { Badge } from '@workspace/samra-pay-ds/components/ui/badge';

const CATEGORIES: AuditEventCategory[] = ['auth', 'transfer', 'customer', 'reconciliation', 'admin', 'system', 'provider'];

export default function AuditLogPage() {
  const [category, setCategory] = useState('all');
  const [selected, setSelected] = useState<AuditEvent | null>(null);
  const { showLocal, toggleLocal } = useTimezonePref();
  const query = useQuery<AuditEvent[]>({ queryKey: ['audit-events', { mock: IS_MOCK }], queryFn: () => IS_MOCK ? Promise.resolve(AUDIT_EVENTS) : opsApi.getAuditEvents(), retry: 1 });
  const events = useMemo(() => (query.data ?? []).filter((event) => category === 'all' || event.category === category), [query.data, category]);
  return <OpsShell>
    <PageHeader title="Audit Log" description="Immutable operational activity; event records cannot be edited or deleted"><TimezoneSwitcher showLocal={showLocal} onToggle={toggleLocal} /></PageHeader>
    <div className="flex justify-end px-6 py-3 border-b border-border bg-card/50"><Select value={category} onValueChange={setCategory}><SelectTrigger className="w-44 h-8 text-xs" aria-label="Filter audit event category" data-testid="filter-audit-category"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All categories</SelectItem>{CATEGORIES.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div>
    <div className="p-6">{query.isLoading && <TableSkeleton rows={10} cols={6} />}{query.error && <ApiErrorState error={query.error} onRetry={() => query.refetch()} />}{query.data && events.length === 0 && <EmptyState message="No immutable events match this filter." />}{events.length > 0 && <div className="rounded-lg border border-border overflow-hidden"><table className="w-full text-sm" aria-label="Immutable audit events"><thead><tr className="border-b border-border bg-muted/40">{['Timestamp', 'Event key', 'Actor', 'Entity', 'Correlation / reference', 'Detail'].map((header) => <th key={header} className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{header}</th>)}</tr></thead><tbody>{events.map((event) => <tr key={event.id} className="border-b border-border last:border-0 hover:bg-muted/30"><td className="px-4 py-3"><TimestampDisplay iso={event.timestamp} showLocal={showLocal} /></td><td className="px-4 py-3"><span className="font-mono text-xs">{event.action}</span><br /><Badge variant="outline" className="mt-1 text-[10px]">{event.category}</Badge></td><td className="px-4 py-3 text-xs"><span>{event.actorType}</span><br /><span className="font-mono text-[10px] text-muted-foreground">{event.actorId}</span></td><td className="px-4 py-3 text-xs"><span>{event.resourceType ?? '—'}</span><br /><span className="font-mono text-[10px] text-muted-foreground">{event.resourceId ?? ''}</span></td><td className="px-4 py-3 font-mono text-[10px] text-muted-foreground">{event.id}</td><td className="px-4 py-3"><button onClick={() => setSelected(event)} className="text-xs text-primary hover:underline focus-visible:outline-none focus-visible:underline" data-testid={`inspect-audit-${event.id}`}>View</button></td></tr>)}</tbody></table></div>}</div>
    <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}><SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto dark" aria-label="Immutable audit event detail">{selected && <><SheetHeader><SheetTitle className="font-mono text-sm">{selected.action}</SheetTitle></SheetHeader><div className="mt-6 space-y-4"><Badge variant="outline">Immutable audit record</Badge><dl className="grid grid-cols-2 gap-4 text-xs"><div><dt className="text-muted-foreground">Event key</dt><dd className="font-mono">{selected.id}</dd></div><div><dt className="text-muted-foreground">Timestamp</dt><dd><TimestampDisplay iso={selected.timestamp} showLocal={showLocal} /></dd></div><div><dt className="text-muted-foreground">Actor</dt><dd className="font-mono">{selected.actorType}: {selected.actorId}</dd></div><div><dt className="text-muted-foreground">Entity</dt><dd className="font-mono">{selected.resourceType ?? '—'} {selected.resourceId ?? ''}</dd></div></dl><pre className="overflow-x-auto rounded-md border border-border bg-muted/30 p-3 text-[10px] text-muted-foreground" aria-label="Structured audit metadata">{JSON.stringify(selected.detail, null, 2)}</pre></div></>}</SheetContent></Sheet>
  </OpsShell>;
}