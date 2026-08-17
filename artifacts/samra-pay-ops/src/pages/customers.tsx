import { useState, useMemo } from 'react';
import { IS_MOCK } from '@/lib/data-mode';
import { CUSTOMERS, TRANSFERS } from '@/lib/fixtures';
import { opsApi } from '@/lib/ops-api';
import { useQuery } from '@tanstack/react-query';
import { OpsShell } from '@/components/ops-shell';
import {
  PageHeader,
  CustomerStatusBadge,
  MoneyDisplay,
  TimestampDisplay,
  useTimezonePref,
  TimezoneSwitcher,
  SourceChip,
} from '@/components/ops-formatters';
import { TableSkeleton, ApiErrorState, EmptyState, ReadOnlyAction } from '@/components/ops-states';
import { Input } from '@workspace/samra-pay-ds/components/ui/input';
import { Badge } from '@workspace/samra-pay-ds/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@workspace/samra-pay-ds/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@workspace/samra-pay-ds/components/ui/sheet';
import { Separator } from '@workspace/samra-pay-ds/components/ui/separator';
import { AlertTriangle, Info, AlertCircle, Search } from 'lucide-react';
import type { Customer } from '@/lib/types';
import { Link } from 'wouter';
import { relatedFixtureTransfers } from '@/lib/ops-selectors';

const ISSUE_ICONS = {
  info: Info,
  warning: AlertTriangle,
  error: AlertCircle,
};

const ISSUE_CLASSES = {
  info: 'text-muted-foreground',
  warning: 'text-berbere',
  error: 'text-destructive',
};

export default function CustomersPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const { showLocal, toggleLocal } = useTimezonePref();

  const customersQuery = useQuery<Customer[]>({
    queryKey: ['customers', { mock: IS_MOCK }],
    queryFn: async () => {
      if (IS_MOCK) return CUSTOMERS;
      return opsApi.getCustomers();
    },
    retry: 1,
  });

  const filtered = useMemo(() => {
    const list = customersQuery.data ?? [];
    return list.filter((c) => {
      const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        c.displayName.toLowerCase().includes(q) ||
        c.externalRef.toLowerCase().includes(q) ||
        c.accounts.some((account) => account.reference.toLowerCase().includes(q));
      return matchesStatus && matchesSearch;
    });
  }, [customersQuery.data, search, statusFilter]);

  const customerTransfers = useMemo(() => {
    if (!selectedCustomer) return [];
    return relatedFixtureTransfers(
      IS_MOCK ? 'mock' : 'api',
      TRANSFERS,
      selectedCustomer.id,
    );
  }, [selectedCustomer]);

  return (
    <OpsShell>
      <PageHeader
        title="Customers"
        description="Synthetic customer search and account investigation — read-only"
      >
        <TimezoneSwitcher showLocal={showLocal} onToggle={toggleLocal} />
      </PageHeader>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3 px-6 py-3 border-b border-border bg-card/50">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" aria-hidden="true" />
          <Input
            type="search"
            placeholder="Customer, account, or transfer ref..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
            data-testid="search-customers"
            aria-label="Search customers"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40 h-8 text-xs" data-testid="filter-status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
            <SelectItem value="pending_kyc">Pending KYC</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="p-6">
        {customersQuery.isLoading && <TableSkeleton rows={6} cols={5} />}
        {customersQuery.error && (
          <ApiErrorState error={customersQuery.error} onRetry={() => customersQuery.refetch()} />
        )}
        {customersQuery.data && filtered.length === 0 && (
          <EmptyState message="No customers match your search." subtext="Try adjusting the filters." />
        )}
        {customersQuery.data && filtered.length > 0 && (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm" aria-label="Customer list">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Customer</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden md:table-cell">External Ref</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Status</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden md:table-cell">KYC Tier</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Issues</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Investigate</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                    data-testid={`row-customer-${c.id}`}
                  >
                    <td className="px-4 py-3">
                      <div className="text-xs font-medium text-foreground">{c.displayName}</div>
                      <div className="font-mono text-[10px] text-muted-foreground">{c.externalRef}</div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="font-mono text-xs text-muted-foreground">{c.externalRef}</span>
                    </td>
                    <td className="px-4 py-3">
                      <CustomerStatusBadge status={c.status} />
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="font-mono text-xs">Tier {c.kycTier}</span>
                    </td>
                    <td className="px-4 py-3">
                      {c.issues.length === 0 ? (
                        <span className="text-xs text-muted-foreground">None</span>
                      ) : (
                        <div className="flex gap-1 flex-wrap">
                          {c.issues.map((issue) => {
                            const Icon = ISSUE_ICONS[issue.level];
                            return (
                              <span
                                key={issue.code}
                                className={`flex items-center gap-1 text-xs ${ISSUE_CLASSES[issue.level]}`}
                                title={issue.message}
                              >
                                <Icon className="size-3" aria-hidden="true" />
                                {issue.code}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        className="text-xs text-primary hover:underline focus-visible:outline-none focus-visible:underline"
                        onClick={(e) => { e.stopPropagation(); setSelectedCustomer(c); }}
                        data-testid={`btn-investigate-${c.id}`}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Customer detail drawer */}
      <Sheet open={!!selectedCustomer} onOpenChange={(o) => !o && setSelectedCustomer(null)}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-xl overflow-y-auto dark"
          data-testid="customer-drawer"
          aria-label="Customer investigation"
        >
          {selectedCustomer && (
            <>
              <SheetHeader>
                <SheetTitle className="text-base">{selectedCustomer.displayName}</SheetTitle>
                <div className="flex flex-wrap gap-2 items-center">
                  <CustomerStatusBadge status={selectedCustomer.status} />
                  <Badge variant="outline" className="font-mono text-xs">KYC Tier {selectedCustomer.kycTier}</Badge>
                  <span className="font-mono text-xs text-muted-foreground">{selectedCustomer.externalRef}</span>
                </div>
              </SheetHeader>

              <div className="mt-6 space-y-6">
                <section>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">Customer record</h3>
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-xs text-muted-foreground">Customer reference</dt>
                      <dd className="font-mono text-xs text-foreground">{selectedCustomer.externalRef}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Registered</dt>
                      <dd><TimestampDisplay iso={selectedCustomer.registeredAt} showLocal={showLocal} /></dd>
                    </div>
                  </dl>
                </section>

                <Separator />

                {/* Accounts */}
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Accounts</h3>
                    <SourceChip source="ledger" />
                  </div>
                  {selectedCustomer.accounts.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No accounts.</p>
                  ) : (
                    <div className="space-y-3">
                      {selectedCustomer.accounts.map((acct) => (
                        <div key={acct.id} className="rounded-md border border-border bg-card p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-xs font-semibold text-foreground">{acct.reference}</span>
                            <Badge variant="outline" className="font-mono text-xs">{acct.currency}</Badge>
                          </div>
                          <dl className="grid grid-cols-3 gap-2 text-xs">
                            <div>
                              <dt className="text-muted-foreground">Book</dt>
                              <dd className="font-mono tabular-nums text-foreground">{acct.bookBalance}</dd>
                            </div>
                            <div>
                              <dt className="text-muted-foreground">Available</dt>
                              <dd className="font-mono tabular-nums text-foreground">{acct.availableBalance}</dd>
                            </div>
                            <div>
                              <dt className="text-muted-foreground">Held</dt>
                              <dd className="font-mono tabular-nums text-foreground">{acct.heldBalance}</dd>
                            </div>
                          </dl>
                          <p className="text-xs text-muted-foreground">
                            Balances are Samra ledger values. Never calculated in this portal.
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <Separator />

                {/* Issues */}
                {selectedCustomer.issues.length > 0 && (
                  <>
                    <section>
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">Issues</h3>
                      <div className="space-y-2">
                        {selectedCustomer.issues.map((issue) => {
                          const Icon = ISSUE_ICONS[issue.level];
                          return (
                            <div
                              key={issue.code}
                              className={`flex gap-3 p-3 rounded-md border ${issue.level === 'error' ? 'border-destructive/30 bg-destructive/5' : issue.level === 'warning' ? 'border-berbere/30 bg-berbere/5' : 'border-border bg-muted/30'}`}
                            >
                              <Icon className={`size-4 mt-0.5 shrink-0 ${ISSUE_CLASSES[issue.level]}`} aria-hidden="true" />
                              <div className="min-w-0">
                                <div className="text-xs font-semibold font-mono text-foreground">{issue.code}</div>
                                <div className="text-xs text-muted-foreground mt-0.5">{issue.message}</div>
                                <div className="text-xs text-muted-foreground mt-1">
                                  <TimestampDisplay iso={issue.raisedAt} showLocal={showLocal} />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                    <Separator />
                  </>
                )}

                {/* Recent transfers */}
                <section>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Recent Transfers</h3>
                    <Link
                      href={`/transfers?sender=${selectedCustomer.id}`}
                      className="text-xs text-primary hover:underline"
                    >
                      View all
                    </Link>
                  </div>
                  {!IS_MOCK ? (
                    <p className="text-xs text-muted-foreground">Related transfers require an authorized operations API endpoint.</p>
                  ) : customerTransfers.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No transfers found for this customer.</p>
                  ) : (
                    <div className="space-y-2">
                      {customerTransfers.map((txn) => (
                        <div key={txn.id} className="flex items-center justify-between p-3 rounded-md border border-border bg-card">
                          <div>
                            <div className="font-mono text-xs text-foreground">{txn.reference}</div>
                            <div className="text-xs text-muted-foreground">
                              to {txn.recipientName} · <TimestampDisplay iso={txn.createdAt} showLocal={showLocal} />
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <MoneyDisplay money={txn.sendAmount} />
                            <Link href={`/transfers?id=${txn.id}`} className="text-xs text-primary hover:underline">
                              View
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <Separator />

                <div className="pt-2">
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
