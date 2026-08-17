// Typed adapter from the generated read-only operations contract to the
// Replit-built portal view model. API mode never reads fixture data.

import {
  getOperationsSummary,
  getOperationsTransfer,
  listOperationsAuditEvents,
  listOperationsCustomers,
  listOperationsReconciliationExceptions,
  listOperationsTransfers,
  setBaseUrl,
  type OperationsAuditEvent,
  type OperationsCustomer,
  type OperationsSummary,
  type OperationsTransfer,
  type OperationsTransferDetail,
} from '@workspace/api-client-react';
import { API_ORIGIN } from './data-mode';

import type {
  Customer,
  Transfer,
  MoneyFlow,
  ReconciliationRun,
  WorkerJob,
  AuditEvent,
  SystemHealth,
  AggregateReport,
  OpsMetric,
  FundingState,
  PayoutState,
  ReconciliationState,
  TransferStatus,
  TimelineEvent,
} from './types';

setBaseUrl(API_ORIGIN);

const OPERATOR_REQUEST = Object.freeze({
  headers: Object.freeze({
    'X-Demo-Operator-Id': 'demo_cs_agent_001',
    'X-Demo-Operator-Role': 'support_readonly',
  }),
  timeoutMs: 10_000,
});

export class EndpointUnavailable extends Error {
  constructor(operation: string) {
    super(`No authorized operations API is available for: ${operation}`);
    this.name = 'EndpointUnavailable';
  }
}

export class ApiTimeout extends Error {
  constructor(endpoint: string, timeoutMs: number) {
    super(`Request to ${endpoint} timed out after ${timeoutMs}ms`);
    this.name = 'ApiTimeout';
  }
}

export class ApiServerError extends Error {
  status: number;
  constructor(endpoint: string, status: number, message?: string) {
    super(message ?? `Server error ${status} from ${endpoint}`);
    this.name = 'ApiServerError';
    this.status = status;
  }
}

// ─── OpsApi class ────────────────────────────────────────────────────────────

export class OpsApi {
  async getOverviewMetrics(): Promise<OpsMetric[]> {
    const summary = await getOperationsSummary(OPERATOR_REQUEST);
    return mapSummary(summary);
  }

  async getCustomers(_params?: {
    search?: string;
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<Customer[]> {
    const values = await listOperationsCustomers(
      {
        search: _params?.search,
        limit: _params?.limit,
      },
      OPERATOR_REQUEST,
    );
    const customers = values.map(mapCustomer);
    return _params?.status ? customers.filter((customer) => customer.status === _params.status) : customers;
  }

  async getCustomer(_id: string): Promise<Customer> {
    throw new EndpointUnavailable('customer detail');
  }

  async getTransfers(_params?: {
    status?: string;
    dateFrom?: string;
    dateTo?: string;
    senderId?: string;
    page?: number;
    limit?: number;
  }): Promise<Transfer[]> {
    const [values, customers] = await Promise.all([
      listOperationsTransfers(
        {
          status: normalizeTransferQueryStatus(_params?.status),
          search: undefined,
          limit: _params?.limit,
        },
        OPERATOR_REQUEST,
      ),
      listOperationsCustomers(undefined, OPERATOR_REQUEST),
    ]);
    const customerNames = new Map(customers.map((customer) => [customer.id, customer.displayName]));
    return values.map((value) => mapTransfer(value, customerNames.get(value.customerId)));
  }

  async getTransfer(_id: string): Promise<Transfer> {
    const detail = await getOperationsTransfer(_id, OPERATOR_REQUEST);
    return mapTransferDetail(detail);
  }

  async getMoneyFlow(_transferId: string): Promise<MoneyFlow> {
    throw new EndpointUnavailable('money-flow detail');
  }

  async getMoneyFlows(): Promise<MoneyFlow[]> {
    throw new EndpointUnavailable('money-flow search');
  }

  async getReconciliationRuns(_params?: { status?: string; page?: number }): Promise<ReconciliationRun[]> {
    const exceptions = await listOperationsReconciliationExceptions(undefined, OPERATOR_REQUEST);
    const byRun = new Map<string, typeof exceptions>();
    for (const exception of exceptions) {
      const group = byRun.get(exception.runId) ?? [];
      group.push(exception);
      byRun.set(exception.runId, group);
    }
    return [...byRun.entries()].map(([runId, values]) => ({
      id: runId,
      reference: runId,
      startedAt: values.reduce(
        (oldest, value) => (value.openedAt < oldest ? value.openedAt : oldest),
        values[0]!.openedAt,
      ),
      status: 'partial',
      totalRecords: values.length,
      matchedRecords: 0,
      exceptionCount: values.length,
      provider: 'Durable reconciliation exceptions',
      exceptions: values.map((value) => ({
        id: value.id,
        runId: value.runId,
        transferId: value.transferId ?? undefined,
        transferRef: value.transferId ?? undefined,
        exceptionType: mapExceptionType(value.code),
        raisedAt: value.openedAt,
        notes: value.summary,
      })),
    }));
  }

  async getReconciliationRun(_id: string): Promise<ReconciliationRun> {
    throw new EndpointUnavailable('reconciliation run detail');
  }

  async getWorkerJobs(_params?: { queue?: string; status?: string; page?: number }): Promise<WorkerJob[]> {
    throw new EndpointUnavailable('worker operations');
  }

  async getAuditEvents(_params?: {
    category?: string;
    actorId?: string;
    resourceId?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
  }): Promise<AuditEvent[]> {
    const events = await listOperationsAuditEvents(
      {
        actorId: _params?.actorId,
        entityId: _params?.resourceId,
        limit: _params?.limit,
      },
      OPERATOR_REQUEST,
    );
    return events.map(mapAuditEvent);
  }

  async getSystemHealth(): Promise<SystemHealth> {
    throw new EndpointUnavailable('system health');
  }

  async getReports(): Promise<AggregateReport[]> {
    throw new EndpointUnavailable('reports');
  }

  async getReport(_id: string): Promise<AggregateReport> {
    throw new EndpointUnavailable('report detail');
  }

  // System health, reports, worker controls, and cross-transfer money-flow
  // searches remain unavailable until their OpenAPI contracts exist.
}

export const opsApi = new OpsApi();

function minorUnitsToDecimal(value: string): string {
  const padded = value.padStart(3, '0');
  return `${padded.slice(0, -2)}.${padded.slice(-2)}`;
}

function mapMoney(value: { currency: string; minorUnits: string }) {
  return {
    currency: value.currency,
    amount: minorUnitsToDecimal(value.minorUnits),
  };
}

function mapSummary(summary: OperationsSummary): OpsMetric[] {
  const groups: Array<[string, Record<string, number>]> = [
    ['Customers', summary.customers],
    ['Transfers', summary.transfers],
    ['Workflow', summary.workflow],
    ['Outbox', summary.outbox],
    ['Provider events', summary.providerEvents],
  ];
  const metrics = groups.flatMap(([group, counts]) =>
    Object.entries(counts).map(([key, value]) => ({
      source: 'ledger' as const,
      label: `${group} · ${key.replaceAll('_', ' ')}`,
      value: String(value),
      unit: 'records',
    })),
  );
  metrics.push({
    source: 'ledger',
    label: 'Open reconciliation exceptions',
    value: String(summary.openReconciliationExceptions),
    unit: 'records',
  });
  return metrics;
}

function mapCustomer(value: OperationsCustomer): Customer {
  return {
    id: value.id,
    externalRef: null,
    displayName: value.displayName,
    status: mapCustomerStatus(value.status),
    kycTier: null,
    registeredAt: value.createdAt,
    accounts: [],
    recentTransferIds: [],
    issues: [],
  };
}

function mapTransfer(
  value: OperationsTransfer,
  senderName = value.customerId,
  timeline: TimelineEvent[] = [],
): Transfer {
  return {
    id: value.id,
    reference: value.id,
    senderId: value.customerId,
    senderName,
    recipientName: value.beneficiaryDisplay,
    sendAmount: mapMoney(value.sourceAmount),
    receiveAmount: mapMoney(value.destinationAmount),
    fee: mapMoney(value.feeAmount),
    exchangeRate: 'Not exposed',
    status: mapTransferStatus(value.status),
    fundingState: mapFundingState(value.fundingStatus),
    payoutState: mapPayoutState(value.payoutStatus),
    reconciliationState: mapReconciliationState(value.reconciliationStatus),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    completedAt: value.status === 'completed' ? value.updatedAt : undefined,
    timeline,
  };
}

function mapTransferDetail(value: OperationsTransferDetail): Transfer {
  const timeline: TimelineEvent[] = [
    ...value.timeline.map((event) => ({
      id: `${value.transfer.id}:state:${event.sequence}`,
      timestamp: event.occurredAt,
      category: 'samra_canonical' as const,
      label: event.toState.replaceAll('_', ' '),
      detail: event.reason,
    })),
    ...value.providerEvents.map((event) => ({
      id: `${event.provider}:${event.providerEventId}`,
      timestamp: event.occurredAt,
      category: 'provider_evidence' as const,
      label: `${event.provider} · ${event.eventType}`,
      detail: event.lastError ?? `State: ${event.state}`,
      correlationRef: event.providerEventId,
    })),
    ...value.outbox.map((event) => ({
      id: event.eventKey,
      timestamp: event.createdAt,
      category: 'worker' as const,
      label: event.eventType,
      detail: event.lastError ?? `State: ${event.state}; attempts: ${event.attemptCount}`,
      correlationRef: event.eventKey,
    })),
  ];
  const transfer = mapTransfer(value.transfer, value.transfer.customerId, timeline);
  const providerLink = value.providerLinks[0];
  return {
    ...transfer,
    providerRef: providerLink?.providerResourceId,
    providerCorrelationRef: value.audit.find((event) => event.correlationId)?.correlationId ?? undefined,
  };
}

function mapAuditEvent(value: OperationsAuditEvent): AuditEvent {
  return {
    id: value.id,
    timestamp: value.occurredAt,
    category: mapAuditCategory(value.entityType),
    action: value.action,
    actorId: value.actorId ?? 'system',
    actorType: mapActorType(value.actorType),
    resourceType: value.entityType,
    resourceId: value.entityId,
    detail: value.metadata,
    immutable: true,
  };
}

function mapCustomerStatus(value: string): Customer['status'] {
  if (value === 'suspended' || value === 'closed' || value === 'pending_kyc') return value;
  if (value === 'active') return value;
  return 'unknown';
}

function mapTransferStatus(value: string): TransferStatus {
  if (value === 'completed' || value === 'failed' || value === 'refunded' || value === 'reversed') return value;
  return 'pending';
}

function normalizeTransferQueryStatus(value: string | undefined): string | undefined {
  if (!value || value === 'all' || value === 'pending') return undefined;
  return value;
}

function mapFundingState(value: string): FundingState {
  if (value === 'captured' || value === 'settled' || value === 'failed' || value === 'refunded') return value;
  return 'awaiting';
}

function mapPayoutState(value: string): PayoutState {
  if (value === 'processing' || value === 'delivered' || value === 'failed' || value === 'reversed') return value;
  return 'queued';
}

function mapReconciliationState(value: string): ReconciliationState {
  if (value === 'matched' || value === 'exception' || value === 'skipped') return value;
  return 'pending';
}

function mapExceptionType(value: string): ReconciliationRun['exceptions'][number]['exceptionType'] {
  if (
    value === 'amount_mismatch' ||
    value === 'missing_provider_record' ||
    value === 'duplicate_settlement' ||
    value === 'timing_gap'
  )
    return value;
  return 'status_conflict';
}

function mapAuditCategory(value: string): AuditEvent['category'] {
  if (value.includes('transfer')) return 'transfer';
  if (value.includes('customer')) return 'customer';
  if (value.includes('reconciliation')) return 'reconciliation';
  if (value.includes('provider')) return 'provider';
  return 'system';
}

function mapActorType(value: string): AuditEvent['actorType'] {
  if (value === 'user' || value === 'service' || value === 'worker') return value;
  return 'system';
}
