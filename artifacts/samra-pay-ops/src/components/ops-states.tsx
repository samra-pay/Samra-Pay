// Shared operational state components: loading skeletons, error panels,
// empty states, endpoint-unavailable, timeout, server-error.
// All compose from the design system's primitives.

import { Button } from '@workspace/samra-pay-ds/components/ui/button';
import { Badge } from '@workspace/samra-pay-ds/components/ui/badge';
import { Skeleton } from '@workspace/samra-pay-ds/components/ui/skeleton';
import { AlertTriangle, ServerCrash, Clock, WifiOff, Inbox, RefreshCw } from 'lucide-react';
import { cn } from '@workspace/samra-pay-ds/lib/utils';
import { EndpointUnavailable, ApiTimeout, ApiServerError } from '@/lib/ops-api';

// ─── Loading skeletons ────────────────────────────────────────────────────────

export function MetricsSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4" aria-busy="true" aria-label="Loading metrics">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-lg border border-border bg-card p-4 space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-3 w-16" />
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 8, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-0" aria-busy="true" aria-label="Loading table data">
      <div className="flex gap-4 px-4 py-2 border-b border-border">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 px-4 py-3 border-b border-border">
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton key={j} className="h-3 flex-1" style={{ opacity: 1 - i * 0.08 }} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div className="space-y-6 p-6" aria-busy="true" aria-label="Loading details">
      <div className="space-y-2">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-3 w-32" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-1">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-4 w-28" />
          </div>
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}

// ─── API-mode error states ────────────────────────────────────────────────────

interface ErrorStateProps {
  error: unknown;
  onRetry?: () => void;
  compact?: boolean;
}

function ErrorPanel({
  icon: Icon,
  title,
  message,
  badge,
  onRetry,
  compact,
}: {
  icon: React.ElementType;
  title: string;
  message: string;
  badge?: string;
  onRetry?: () => void;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center gap-4',
        compact ? 'py-8 px-4' : 'py-16 px-6',
      )}
      role="alert"
      aria-live="assertive"
      data-testid="error-state"
    >
      <div className="flex items-center justify-center w-12 h-12 rounded-full bg-muted text-muted-foreground">
        <Icon className="size-5" aria-hidden="true" />
      </div>
      {badge && (
        <Badge variant="outline" className="font-mono text-xs">
          {badge}
        </Badge>
      )}
      <div className="space-y-1 max-w-sm">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{message}</p>
      </div>
      {onRetry && (
        <Button
          variant="outline"
          size="sm"
          onClick={onRetry}
          data-testid="retry-button"
          className="gap-2"
        >
          <RefreshCw className="size-3" aria-hidden="true" />
          Retry
        </Button>
      )}
    </div>
  );
}

export function ApiErrorState({ error, onRetry, compact }: ErrorStateProps) {
  if (error instanceof EndpointUnavailable) {
    return (
      <ErrorPanel
        icon={WifiOff}
        title="Endpoint unavailable"
        message="This operations endpoint has not yet been authorized or deployed. No data is available in API mode."
        badge="ENDPOINT_UNAVAILABLE"
        onRetry={onRetry}
        compact={compact}
      />
    );
  }
  if (error instanceof ApiTimeout) {
    return (
      <ErrorPanel
        icon={Clock}
        title="Request timed out"
        message="The server did not respond within the timeout window. Check API gateway and worker health."
        badge="TIMEOUT"
        onRetry={onRetry}
        compact={compact}
      />
    );
  }
  if (error instanceof ApiServerError) {
    return (
      <ErrorPanel
        icon={ServerCrash}
        title={`Server error ${(error as ApiServerError).status}`}
        message={(error as Error).message}
        badge={`HTTP_${(error as ApiServerError).status}`}
        onRetry={onRetry}
        compact={compact}
      />
    );
  }
  return (
    <ErrorPanel
      icon={AlertTriangle}
      title="Unexpected error"
      message={(error as Error)?.message ?? 'An unknown error occurred.'}
      onRetry={onRetry}
      compact={compact}
    />
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

export function EmptyState({
  message = 'No records found.',
  subtext,
  compact,
}: {
  message?: string;
  subtext?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center gap-3',
        compact ? 'py-8 px-4' : 'py-16 px-6',
      )}
      data-testid="empty-state"
    >
      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-muted text-muted-foreground">
        <Inbox className="size-4" aria-hidden="true" />
      </div>
      <div className="space-y-1 max-w-xs">
        <p className="text-sm text-muted-foreground font-medium">{message}</p>
        {subtext && <p className="text-xs text-muted-foreground">{subtext}</p>}
      </div>
    </div>
  );
}

// ─── Read-only action placeholder ─────────────────────────────────────────────

export function ReadOnlyAction({ label }: { label?: string }) {
  return (
    <Button
      variant="outline"
      size="sm"
      disabled
      title="This action requires an audited operations command"
      data-testid="readonly-action"
    >
      {label ?? 'Requires audited operations command'}
    </Button>
  );
}
