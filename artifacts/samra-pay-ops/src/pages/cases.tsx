import { type FormEvent, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  OperationsCase,
  OperationsCaseDetail,
  OperationsCaseStatus,
} from '@workspace/api-client-react';
import { OpsShell } from '@/components/ops-shell';
import { PageHeader, TimestampDisplay } from '@/components/ops-formatters';
import {
  ApiErrorState,
  EmptyState,
  TableSkeleton,
} from '@/components/ops-states';
import { IS_MOCK } from '@/lib/data-mode';
import { opsApi } from '@/lib/ops-api';
import { Badge } from '@workspace/samra-pay-ds/components/ui/badge';
import { Button } from '@workspace/samra-pay-ds/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@workspace/samra-pay-ds/components/ui/dialog';
import { Input } from '@workspace/samra-pay-ds/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@workspace/samra-pay-ds/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@workspace/samra-pay-ds/components/ui/sheet';
import { Textarea } from '@workspace/samra-pay-ds/components/ui/textarea';
import { AlertTriangle, Plus, Search } from 'lucide-react';
import { cn } from '@workspace/samra-pay-ds/lib/utils';

const STATUS_OPTIONS: OperationsCaseStatus[] = [
  'open',
  'in_progress',
  'pending_customer',
  'resolved',
  'closed',
];

export default function CasesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [selected, setSelected] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const casesQuery = useQuery<OperationsCase[]>({
    queryKey: ['operations-cases', { mock: IS_MOCK }],
    queryFn: () => (IS_MOCK ? Promise.resolve([]) : opsApi.getCases()),
    retry: 1,
  });
  const detailQuery = useQuery<OperationsCaseDetail>({
    queryKey: ['operations-case', selected],
    queryFn: () => opsApi.getCase(selected!),
    enabled: !IS_MOCK && selected !== null,
    retry: 1,
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (casesQuery.data ?? []).filter(
      (record) =>
        (status === 'all' || record.status === status) &&
        (!term ||
          record.id.toLowerCase().includes(term) ||
          record.title.toLowerCase().includes(term) ||
          record.customerId?.toLowerCase().includes(term) ||
          record.transferId?.toLowerCase().includes(term)),
    );
  }, [casesQuery.data, search, status]);

  async function refresh(detail?: OperationsCaseDetail) {
    if (detail)
      queryClient.setQueryData(['operations-case', detail.case.id], detail);
    await queryClient.invalidateQueries({ queryKey: ['operations-cases'] });
  }

  return (
    <OpsShell>
      <PageHeader
        title="Support cases"
        description="Durable customer-support workflow. Case actions never mutate balances, transfers, refunds, or ledger state."
      >
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm" disabled={IS_MOCK}>
              <Plus className="mr-2 size-4" /> Open case
            </Button>
          </DialogTrigger>
          <CreateCaseDialog
            onCreated={(detail) => {
              setCreateOpen(false);
              setSelected(detail.case.id);
              void refresh(detail);
            }}
          />
        </Dialog>
      </PageHeader>

      <div className="flex flex-col gap-3 border-b border-border bg-card/50 px-6 py-3 md:flex-row">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search support cases"
            className="h-8 pl-8 text-sm"
            placeholder="Case, customer, transfer, title..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger
            className="h-8 w-48 text-xs"
            aria-label="Filter case status"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUS_OPTIONS.map((value) => (
              <SelectItem key={value} value={value}>
                {label(value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="p-6">
        {IS_MOCK && (
          <div className="mb-4 flex gap-2 rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
            <AlertTriangle className="size-4 shrink-0" /> Case writes require
            authenticated API mode and are disabled in fixture mode.
          </div>
        )}
        {casesQuery.isLoading && <TableSkeleton rows={7} cols={6} />}
        {casesQuery.error && (
          <ApiErrorState
            error={casesQuery.error}
            onRetry={() => casesQuery.refetch()}
          />
        )}
        {casesQuery.data && filtered.length === 0 && (
          <EmptyState message="No support cases match these filters." />
        )}
        {filtered.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm" aria-label="Support cases">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <Header>Case</Header>
                  <Header>Subject</Header>
                  <Header>Priority</Header>
                  <Header>Status</Header>
                  <Header>Owner</Header>
                  <Header>Updated</Header>
                </tr>
              </thead>
              <tbody>
                {filtered.map((record) => (
                  <tr
                    key={record.id}
                    className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/30"
                    onClick={() => setSelected(record.id)}
                  >
                    <td className="px-4 py-3">
                      <div className="font-mono text-xs">{record.id}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {record.title}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {record.transferId ?? record.customerId}
                    </td>
                    <td className="px-4 py-3">
                      <PriorityBadge value={record.priority} />
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline">{label(record.status)}</Badge>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {record.assignedToDisplayName ?? 'Unassigned'}
                    </td>
                    <td className="px-4 py-3">
                      <TimestampDisplay iso={record.updatedAt} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Sheet
        open={selected !== null}
        onOpenChange={(open) => !open && setSelected(null)}
      >
        <SheetContent
          className="w-full overflow-y-auto dark sm:max-w-2xl"
          side="right"
        >
          <SheetHeader>
            <SheetTitle className="font-mono text-sm">{selected}</SheetTitle>
          </SheetHeader>
          {detailQuery.isLoading && (
            <div className="mt-6">
              <TableSkeleton rows={5} cols={2} />
            </div>
          )}
          {detailQuery.error && (
            <div className="mt-6">
              <ApiErrorState
                error={detailQuery.error}
                onRetry={() => detailQuery.refetch()}
              />
            </div>
          )}
          {detailQuery.data && (
            <CaseDetail
              detail={detailQuery.data}
              onChanged={(detail) => void refresh(detail)}
            />
          )}
        </SheetContent>
      </Sheet>
    </OpsShell>
  );
}

function CreateCaseDialog({
  onCreated,
}: {
  onCreated: (detail: OperationsCaseDetail) => void;
}) {
  const [reference, setReference] = useState('');
  const [referenceType, setReferenceType] = useState<
    'customerId' | 'transferId'
  >('transferId');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<
    | 'transfer_status'
    | 'funding'
    | 'payout'
    | 'refund'
    | 'identity'
    | 'reconciliation'
    | 'technical'
    | 'other'
  >('transfer_status');
  const mutation = useMutation({
    mutationFn: () =>
      opsApi.createCase({
        [referenceType]: reference.trim(),
        title: title.trim(),
        category,
        priority: 'normal',
      }),
    onSuccess: onCreated,
  });
  function submit(event: FormEvent) {
    event.preventDefault();
    mutation.mutate();
  }
  return (
    <DialogContent className="dark">
      <DialogHeader>
        <DialogTitle>Open support case</DialogTitle>
      </DialogHeader>
      <form className="space-y-4" onSubmit={submit}>
        <div className="grid grid-cols-3 gap-2">
          <Select
            value={referenceType}
            onValueChange={(value) =>
              setReferenceType(value as typeof referenceType)
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="transferId">Transfer</SelectItem>
              <SelectItem value="customerId">Customer</SelectItem>
            </SelectContent>
          </Select>
          <Input
            className="col-span-2"
            required
            placeholder={
              referenceType === 'transferId' ? 'transfer_...' : 'customer_...'
            }
            value={reference}
            onChange={(event) => setReference(event.target.value)}
          />
        </div>
        <Input
          required
          minLength={3}
          maxLength={160}
          placeholder="Short issue summary"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <div>
          <Select
            value={category}
            onValueChange={(value) => setCategory(value as typeof category)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[
                'transfer_status',
                'funding',
                'payout',
                'refund',
                'identity',
                'reconciliation',
                'technical',
                'other',
              ].map((value) => (
                <SelectItem key={value} value={value}>
                  {label(value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {mutation.error && <ApiErrorState error={mutation.error} compact />}
        <Button className="w-full" disabled={mutation.isPending}>
          {mutation.isPending ? 'Opening…' : 'Open case'}
        </Button>
      </form>
    </DialogContent>
  );
}

function CaseDetail({
  detail,
  onChanged,
}: {
  detail: OperationsCaseDetail;
  onChanged: (detail: OperationsCaseDetail) => void;
}) {
  const [note, setNote] = useState('');
  const [resolution, setResolution] = useState(detail.case.resolution ?? '');
  const noteMutation = useMutation({
    mutationFn: () => opsApi.addCaseNote(detail.case.id, { body: note }),
    onSuccess: (value) => {
      setNote('');
      onChanged(value);
    },
  });
  const statusMutation = useMutation({
    mutationFn: (status: OperationsCaseStatus) =>
      opsApi.updateCase(detail.case.id, {
        expectedVersion: detail.case.version,
        status,
        ...(status === 'resolved' || status === 'closed' ? { resolution } : {}),
      }),
    onSuccess: onChanged,
  });
  return (
    <div className="mt-6 space-y-6">
      <section className="rounded-md border border-border p-4">
        <div className="flex flex-wrap items-center gap-2">
          <PriorityBadge value={detail.case.priority} />
          <Badge variant="outline">{label(detail.case.status)}</Badge>
          <span className="ml-auto text-xs text-muted-foreground">
            Version {detail.case.version}
          </span>
        </div>
        <h2 className="mt-3 font-medium">{detail.case.title}</h2>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
          <div>
            <dt className="text-muted-foreground">Customer</dt>
            <dd className="font-mono">{detail.case.customerId}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Transfer</dt>
            <dd className="font-mono">{detail.case.transferId ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Owner</dt>
            <dd>{detail.case.assignedToDisplayName ?? 'Unassigned'}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">SLA due</dt>
            <dd>
              {detail.case.dueAt ? (
                <TimestampDisplay iso={detail.case.dueAt} />
              ) : (
                'Not set'
              )}
            </dd>
          </div>
        </dl>
      </section>
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Advance workflow
        </h3>
        {(detail.case.status === 'in_progress' ||
          detail.case.status === 'pending_customer' ||
          detail.case.status === 'resolved') && (
          <Textarea
            className="mb-2"
            placeholder="Resolution required to resolve or close"
            value={resolution}
            onChange={(event) => setResolution(event.target.value)}
          />
        )}
        <div className="flex flex-wrap gap-2">
          {nextStatuses(detail.case.status).map((status) => (
            <Button
              key={status}
              size="sm"
              variant="outline"
              disabled={
                statusMutation.isPending ||
                ((status === 'resolved' || status === 'closed') &&
                  resolution.trim().length < 3)
              }
              onClick={() => statusMutation.mutate(status)}
            >
              {label(status)}
            </Button>
          ))}
        </div>
        {statusMutation.error && (
          <div className="mt-2">
            <ApiErrorState error={statusMutation.error} compact />
          </div>
        )}
      </section>
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Internal notes
        </h3>
        <Textarea
          maxLength={4000}
          placeholder="Add immutable internal note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          disabled={detail.case.status === 'closed'}
        />
        <Button
          className="mt-2"
          size="sm"
          disabled={
            !note.trim() ||
            noteMutation.isPending ||
            detail.case.status === 'closed'
          }
          onClick={() => noteMutation.mutate()}
        >
          Add note
        </Button>
        {noteMutation.error && (
          <div className="mt-2">
            <ApiErrorState error={noteMutation.error} compact />
          </div>
        )}
        <div className="mt-4 space-y-3">
          {detail.notes.map((entry) => (
            <article
              key={entry.id}
              className="rounded-md border border-border p-3"
            >
              <div className="flex justify-between gap-3 text-xs">
                <strong>{entry.authorDisplayName}</strong>
                <TimestampDisplay iso={entry.createdAt} />
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm">{entry.body}</p>
            </article>
          ))}
        </div>
      </section>
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Immutable history
        </h3>
        <div className="space-y-2">
          {detail.events.map((event) => (
            <div
              key={event.id}
              className="flex justify-between gap-3 border-l-2 border-border pl-3 text-xs"
            >
              <span>
                {label(event.eventType)} by {event.actorDisplayName}
              </span>
              <TimestampDisplay iso={event.createdAt} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Header({ children }: { children: string }) {
  return (
    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">
      {children}
    </th>
  );
}
function PriorityBadge({ value }: { value: OperationsCase['priority'] }) {
  return (
    <Badge
      className={cn(
        value === 'urgent' && 'bg-destructive text-destructive-foreground',
        value === 'high' && 'bg-berbere text-berbere-foreground',
      )}
    >
      {label(value)}
    </Badge>
  );
}
function label(value: string) {
  return value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function nextStatuses(status: OperationsCaseStatus): OperationsCaseStatus[] {
  switch (status) {
    case 'open':
      return ['in_progress'];
    case 'in_progress':
      return ['pending_customer', 'resolved'];
    case 'pending_customer':
      return ['in_progress', 'resolved'];
    case 'resolved':
      return ['in_progress', 'closed'];
    case 'closed':
      return [];
  }
}
