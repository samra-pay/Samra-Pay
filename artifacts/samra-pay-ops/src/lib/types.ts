// All domain types for the Samra Pay Ops Portal.
// Financial amounts are ALWAYS decimal strings — never computed in the browser.

export type DecimalString = string; // e.g. "1234.56"
export type CurrencyCode = string; // e.g. "USD", "ETB"
export type ISODateString = string; // e.g. "2024-01-15T10:30:00Z"
export type UUID = string;

export interface Money {
  amount: DecimalString;
  currency: CurrencyCode;
}

// ─── Metrics ────────────────────────────────────────────────────────────────

export type MetricSource = 'ledger' | 'provider' | 'computed' | 'cache';

export interface OpsMetric {
  source: MetricSource;
  label: string;
  value: string;
  unit?: string;
  delta?: string; // e.g. "+3.2%" — raw string from fixture/API
  deltaDirection?: 'up' | 'down' | 'neutral';
}

// ─── Customers ───────────────────────────────────────────────────────────────

export type CustomerStatus = 'active' | 'suspended' | 'closed' | 'pending_kyc' | 'unknown';
export type IssueLevel = 'info' | 'warning' | 'error';

export interface CustomerIssue {
  level: IssueLevel;
  code: string;
  message: string;
  raisedAt: ISODateString;
}

export interface CustomerAccount {
  id: UUID;
  reference: string;
  currency: CurrencyCode;
  bookBalance: DecimalString;
  availableBalance: DecimalString;
  heldBalance: DecimalString;
  openedAt: ISODateString;
}

export interface Customer {
  id: UUID;
  externalRef: string | null;
  displayName: string;
  status: CustomerStatus;
  kycTier: number | null;
  registeredAt: ISODateString;
  accounts: CustomerAccount[];
  recentTransferIds: UUID[];
  issues: CustomerIssue[];
}

// ─── Transfers ───────────────────────────────────────────────────────────────

export type TransferStatus = 'completed' | 'pending' | 'failed' | 'refunded' | 'reversed' | 'timed_out' | 'reconciliation_exception';

export type FundingState = 'awaiting' | 'captured' | 'settled' | 'failed' | 'refunded';

export type PayoutState = 'queued' | 'processing' | 'delivered' | 'failed' | 'reversed';

export type ReconciliationState = 'pending' | 'matched' | 'exception' | 'skipped';

export type TimelineEventCategory = 'samra_canonical' | 'provider_evidence' | 'system' | 'worker';

export interface TimelineEvent {
  id: UUID;
  timestamp: ISODateString;
  category: TimelineEventCategory;
  label: string;
  detail?: string;
  correlationRef?: string;
}

export interface Transfer {
  id: UUID;
  reference: string;
  senderId: UUID;
  senderName: string;
  recipientId?: UUID;
  recipientName: string;
  sendAmount: Money;
  receiveAmount: Money;
  fee: Money;
  exchangeRate: DecimalString;
  status: TransferStatus;
  fundingState: FundingState;
  payoutState: PayoutState;
  reconciliationState: ReconciliationState;
  providerRef?: string;
  providerCorrelationRef?: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  completedAt?: ISODateString;
  timeline: TimelineEvent[];
}

// ─── Money Flow ──────────────────────────────────────────────────────────────

export type FlowStageStatus = 'complete' | 'active' | 'failed' | 'pending' | 'skipped';

export interface FlowStage {
  stage: string;
  label: string;
  status: FlowStageStatus;
  enteredAt?: ISODateString;
  exitedAt?: ISODateString;
  durationMs?: number;
  note?: string;
  money?: Money;
  correlationId?: string;
  attempt?: number;
  lastError?: string;
  nextRetryAt?: ISODateString;
  evidenceSource?: 'Samra canonical state' | 'Provider-reported evidence' | 'Worker processing';
}

export interface MoneyFlow {
  transferId: UUID;
  reference: string;
  stages: FlowStage[];
  currentStage: string;
}

// ─── Reconciliation ──────────────────────────────────────────────────────────

export type ReconciliationRunStatus = 'completed' | 'failed' | 'running' | 'partial';

export type ExceptionType = 'amount_mismatch' | 'missing_provider_record' | 'duplicate_settlement' | 'timing_gap' | 'status_conflict';

export interface ReconciliationException {
  id: UUID;
  runId: UUID;
  transferId?: UUID;
  transferRef?: string;
  exceptionType: ExceptionType;
  samraValue?: Money;
  providerValue?: Money;
  raisedAt: ISODateString;
  notes: string;
}

export interface ReconciliationRun {
  id: UUID;
  reference: string;
  startedAt: ISODateString;
  completedAt?: ISODateString;
  status: ReconciliationRunStatus;
  totalRecords: number;
  matchedRecords: number;
  exceptionCount: number;
  provider: string;
  exceptions: ReconciliationException[];
}

// ─── Workers ─────────────────────────────────────────────────────────────────

export type WorkerJobStatus = 'running' | 'queued' | 'completed' | 'failed' | 'retrying' | 'lease_expired';

export interface WorkerJob {
  id: UUID;
  queue: string;
  jobType: string;
  status: WorkerJobStatus;
  attempt: number;
  maxAttempts: number;
  leaseExpiresAt?: ISODateString;
  enqueuedAt: ISODateString;
  startedAt?: ISODateString;
  completedAt?: ISODateString;
  latencyMs?: number;
  errorMessage?: string;
  payload: Record<string, unknown>;
}

// ─── Audit Log ───────────────────────────────────────────────────────────────

export type AuditEventCategory = 'auth' | 'transfer' | 'customer' | 'reconciliation' | 'admin' | 'system' | 'provider';

export interface AuditEvent {
  id: UUID;
  timestamp: ISODateString;
  category: AuditEventCategory;
  action: string;
  actorId: string;
  actorType: 'user' | 'service' | 'worker' | 'system';
  resourceType?: string;
  resourceId?: string;
  ipAddress?: string;
  detail: Record<string, unknown>;
  immutable: true;
}

// ─── System Health ───────────────────────────────────────────────────────────

export type HealthStatus = 'healthy' | 'degraded' | 'down' | 'unknown';

export interface HealthSignal {
  component: string;
  category: 'api' | 'database' | 'worker' | 'provider' | 'cache';
  status: HealthStatus;
  latencyMs?: number;
  lastCheckedAt: ISODateString;
  message?: string;
}

export interface SystemHealth {
  overallStatus: HealthStatus;
  signals: HealthSignal[];
  checkedAt: ISODateString;
}

// ─── Reports ─────────────────────────────────────────────────────────────────

export interface AggregateReport {
  id: UUID;
  title: string;
  period: string;
  generatedAt: ISODateString;
  sections: ReportSection[];
}

export interface ReportSection {
  title: string;
  metrics: OpsMetric[];
}
