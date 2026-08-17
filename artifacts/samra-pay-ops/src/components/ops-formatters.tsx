// Formatting utilities for the ops portal.
// Renders money, timestamps, statuses — always from fixture/API values, never computed.

import { useState } from 'react';
import { Badge } from '@workspace/samra-pay-ds/components/ui/badge';
import { Button } from '@workspace/samra-pay-ds/components/ui/button';
import { cn } from '@workspace/samra-pay-ds/lib/utils';
import type { Money, TransferStatus, CustomerStatus, HealthStatus, WorkerJobStatus, MetricSource, FundingState, PayoutState, ReconciliationState } from '@/lib/types';

// ─── Money display ────────────────────────────────────────────────────────────
// Always show currency code + exact decimal string from fixture. No math done here.

export function MoneyDisplay({ money, className, large }: { money: Money; className?: string; large?: boolean }) {
  return (
    <span className={cn('font-mono tabular-nums', large ? 'text-lg font-semibold' : 'text-sm', className)} data-testid="money-display">
      <span className="text-muted-foreground mr-1 text-xs">{money.currency}</span>
      {money.amount}
    </span>
  );
}

// ─── Timestamp display with UTC / local toggle ────────────────────────────────

export function TimestampDisplay({ iso, showLocal, className }: { iso: string; showLocal?: boolean; className?: string }) {
  const date = new Date(iso);
  const utc = date.toISOString().replace('T', ' ').replace('.000Z', ' UTC');
  const local = date.toLocaleString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  });
  return (
    <time dateTime={iso} className={cn('font-mono text-xs tabular-nums', className)} title={showLocal ? utc : local}>
      {showLocal ? local : utc}
    </time>
  );
}

// ─── UTC / Local toggle control ───────────────────────────────────────────────

export function TimezoneSwitcher({ showLocal, onToggle }: { showLocal: boolean; onToggle: () => void }) {
  return (
    <Button variant="ghost" size="sm" onClick={onToggle} data-testid="timezone-toggle" className="text-xs text-muted-foreground h-7 px-2" aria-label={showLocal ? 'Switch to UTC timestamps' : 'Switch to local timestamps'}>
      {showLocal ? 'Local' : 'UTC'}
    </Button>
  );
}

export function useTimezonePref() {
  const [showLocal, setShowLocal] = useState(false);
  return { showLocal, toggleLocal: () => setShowLocal((v) => !v) };
}

// ─── Transfer status badge ────────────────────────────────────────────────────

const TRANSFER_STATUS_CONFIG: Record<TransferStatus, { label: string; className: string }> = {
  completed: {
    label: 'Completed',
    className: 'bg-eucalyptus text-eucalyptus-foreground border-transparent',
  },
  pending: {
    label: 'Pending',
    className: 'bg-injera text-injera-foreground border-transparent',
  },
  failed: {
    label: 'Failed',
    className: 'bg-destructive text-destructive-foreground border-transparent',
  },
  refunded: {
    label: 'Refunded',
    className: 'bg-coffee text-coffee-foreground border-transparent',
  },
  reversed: {
    label: 'Reversed',
    className: 'bg-coffee text-coffee-foreground border-transparent',
  },
  timed_out: {
    label: 'Timed Out',
    className: 'bg-berbere text-berbere-foreground border-transparent',
  },
  reconciliation_exception: {
    label: 'Recon Exception',
    className: 'bg-berbere text-berbere-foreground border-transparent',
  },
};

export function TransferStatusBadge({ status }: { status: TransferStatus }) {
  const cfg = TRANSFER_STATUS_CONFIG[status] ?? {
    label: status,
    className: '',
  };
  return (
    <Badge className={cfg.className} data-testid={`status-${status}`}>
      {cfg.label}
    </Badge>
  );
}

// ─── Customer status badge ────────────────────────────────────────────────────

const CUSTOMER_STATUS_CONFIG: Record<CustomerStatus, { label: string; className: string }> = {
  active: {
    label: 'Active',
    className: 'bg-eucalyptus text-eucalyptus-foreground border-transparent',
  },
  suspended: {
    label: 'Suspended',
    className: 'bg-berbere text-berbere-foreground border-transparent',
  },
  closed: {
    label: 'Closed',
    className: 'bg-muted text-muted-foreground border-transparent',
  },
  pending_kyc: {
    label: 'Pending KYC',
    className: 'bg-injera text-injera-foreground border-transparent',
  },
  unknown: {
    label: 'Unknown',
    className: 'bg-muted text-muted-foreground border-transparent',
  },
};

export function CustomerStatusBadge({ status }: { status: CustomerStatus }) {
  const cfg = CUSTOMER_STATUS_CONFIG[status] ?? {
    label: status,
    className: '',
  };
  return <Badge className={cfg.className}>{cfg.label}</Badge>;
}

// ─── Health status badge ──────────────────────────────────────────────────────

const HEALTH_STATUS_CONFIG: Record<HealthStatus, { label: string; className: string; dot: string }> = {
  healthy: {
    label: 'Healthy',
    className: 'bg-eucalyptus/10 text-eucalyptus border border-eucalyptus/30',
    dot: 'bg-eucalyptus',
  },
  degraded: {
    label: 'Degraded',
    className: 'bg-injera text-injera-foreground border-transparent',
    dot: 'bg-berbere',
  },
  down: {
    label: 'Down',
    className: 'bg-destructive text-destructive-foreground border-transparent',
    dot: 'bg-destructive-foreground',
  },
  unknown: {
    label: 'Unknown',
    className: 'bg-muted text-muted-foreground border-transparent',
    dot: 'bg-muted-foreground',
  },
};

export function HealthStatusBadge({ status }: { status: HealthStatus }) {
  const cfg = HEALTH_STATUS_CONFIG[status];
  return (
    <Badge className={cn(cfg.className, 'gap-1.5 items-center')} data-testid={`health-${status}`}>
      <span className={cn('inline-block w-1.5 h-1.5 rounded-full', cfg.dot)} aria-hidden="true" />
      {cfg.label}
    </Badge>
  );
}

// ─── Worker status badge ──────────────────────────────────────────────────────

const WORKER_STATUS_CONFIG: Record<WorkerJobStatus, { label: string; className: string }> = {
  running: {
    label: 'Running',
    className: 'bg-eucalyptus text-eucalyptus-foreground border-transparent',
  },
  queued: {
    label: 'Queued',
    className: 'bg-injera text-injera-foreground border-transparent',
  },
  completed: {
    label: 'Completed',
    className: 'bg-muted text-muted-foreground border-transparent',
  },
  failed: {
    label: 'Failed',
    className: 'bg-destructive text-destructive-foreground border-transparent',
  },
  retrying: {
    label: 'Retrying',
    className: 'bg-berbere text-berbere-foreground border-transparent',
  },
  lease_expired: {
    label: 'Lease Expired',
    className: 'bg-coffee text-coffee-foreground border-transparent',
  },
};

export function WorkerStatusBadge({ status }: { status: WorkerJobStatus }) {
  const cfg = WORKER_STATUS_CONFIG[status] ?? { label: status, className: '' };
  return <Badge className={cfg.className}>{cfg.label}</Badge>;
}

// ─── Source chip ──────────────────────────────────────────────────────────────

const SOURCE_CONFIG: Record<MetricSource, { label: string; title: string }> = {
  ledger: {
    label: 'LEDGER',
    title: 'Samra canonical ledger value — authoritative source of financial truth',
  },
  provider: {
    label: 'PROVIDER',
    title: 'Provider-reported evidence — not a substitute for ledger truth',
  },
  computed: {
    label: 'COMPUTED',
    title: 'Derived from multiple sources — not a primary financial value',
  },
  cache: {
    label: 'CACHE',
    title: 'Cached value — may be stale by up to 60 seconds',
  },
};

export function SourceChip({ source }: { source: MetricSource }) {
  const cfg = SOURCE_CONFIG[source];
  return (
    <span title={cfg.title} className="inline-block font-mono text-[10px] px-1.5 py-0.5 rounded-sm bg-muted text-muted-foreground tracking-wide cursor-help">
      {cfg.label}
    </span>
  );
}

// ─── State badges ─────────────────────────────────────────────────────────────

export function FundingStateBadge({ state }: { state: FundingState }) {
  const cfg: Record<FundingState, { label: string; className: string }> = {
    awaiting: {
      label: 'Awaiting',
      className: 'bg-injera text-injera-foreground border-transparent',
    },
    captured: {
      label: 'Captured',
      className: 'bg-coffee text-coffee-foreground border-transparent',
    },
    settled: {
      label: 'Settled',
      className: 'bg-eucalyptus text-eucalyptus-foreground border-transparent',
    },
    failed: {
      label: 'Failed',
      className: 'bg-destructive text-destructive-foreground border-transparent',
    },
    refunded: {
      label: 'Refunded',
      className: 'bg-coffee text-coffee-foreground border-transparent',
    },
  };
  const c = cfg[state] ?? { label: state, className: '' };
  return <Badge className={c.className}>{c.label}</Badge>;
}

export function PayoutStateBadge({ state }: { state: PayoutState }) {
  const cfg: Record<PayoutState, { label: string; className: string }> = {
    queued: {
      label: 'Queued',
      className: 'bg-injera text-injera-foreground border-transparent',
    },
    processing: {
      label: 'Processing',
      className: 'bg-coffee text-coffee-foreground border-transparent',
    },
    delivered: {
      label: 'Delivered',
      className: 'bg-eucalyptus text-eucalyptus-foreground border-transparent',
    },
    failed: {
      label: 'Failed',
      className: 'bg-destructive text-destructive-foreground border-transparent',
    },
    reversed: {
      label: 'Reversed',
      className: 'bg-muted text-muted-foreground border-transparent',
    },
  };
  const c = cfg[state] ?? { label: state, className: '' };
  return <Badge className={c.className}>{c.label}</Badge>;
}

export function ReconciliationStateBadge({ state }: { state: ReconciliationState }) {
  const cfg: Record<ReconciliationState, { label: string; className: string }> = {
    pending: {
      label: 'Pending',
      className: 'bg-injera text-injera-foreground border-transparent',
    },
    matched: {
      label: 'Matched',
      className: 'bg-eucalyptus text-eucalyptus-foreground border-transparent',
    },
    exception: {
      label: 'Exception',
      className: 'bg-berbere text-berbere-foreground border-transparent',
    },
    skipped: {
      label: 'Skipped',
      className: 'bg-muted text-muted-foreground border-transparent',
    },
  };
  const c = cfg[state] ?? { label: state, className: '' };
  return <Badge className={c.className}>{c.label}</Badge>;
}

// ─── Page header ─────────────────────────────────────────────────────────────

export function PageHeader({ title, description, children }: { title: string; description?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 px-6 py-4 border-b border-border bg-card">
      <div className="min-w-0">
        <h1 className="text-base font-semibold text-foreground">{title}</h1>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      {children && <div className="flex items-center gap-2 shrink-0">{children}</div>}
    </div>
  );
}

// ─── Metric card ─────────────────────────────────────────────────────────────

import { OpsMetric } from '@/lib/types';
import { ArrowUp, ArrowDown, Minus } from 'lucide-react';

export function MetricCard({ metric }: { metric: OpsMetric }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-1.5" data-testid={`metric-${metric.label.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground leading-tight">{metric.label}</span>
        <SourceChip source={metric.source} />
      </div>
      <div className="flex items-end gap-2">
        <span className="text-xl font-semibold font-mono tabular-nums text-foreground leading-none">{metric.value}</span>
        {metric.unit && <span className="text-xs text-muted-foreground leading-snug pb-0.5">{metric.unit}</span>}
      </div>
      {metric.delta && (
        <div className={cn('flex items-center gap-1 text-xs', metric.deltaDirection === 'up' ? 'text-eucalyptus' : metric.deltaDirection === 'down' ? 'text-berbere' : 'text-muted-foreground')}>
          {metric.deltaDirection === 'up' && <ArrowUp className="size-3" aria-hidden="true" />}
          {metric.deltaDirection === 'down' && <ArrowDown className="size-3" aria-hidden="true" />}
          {metric.deltaDirection === 'neutral' && <Minus className="size-3" aria-hidden="true" />}
          <span>{metric.delta}</span>
        </div>
      )}
    </div>
  );
}
