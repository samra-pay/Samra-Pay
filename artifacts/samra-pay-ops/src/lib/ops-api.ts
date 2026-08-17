// Typed OpsApi adapter for API mode.
// This is an INCOMPLETE adapter — no authorized operations endpoints exist yet.
// Every method intentionally throws EndpointUnavailable unless the endpoint
// is explicitly wired. Do not invent endpoints or fall back to mock data.

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
} from './types';

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
  // Every method remains deliberately unavailable until the OpenAPI contract
  // ships an authorized operations method. No paths are guessed here.

  async getOverviewMetrics(): Promise<OpsMetric[]> {
    throw new EndpointUnavailable('overview metrics');
  }

  async getCustomers(_params?: {
    search?: string;
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<Customer[]> {
    throw new EndpointUnavailable('customer search');
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
    throw new EndpointUnavailable('transfer search');
  }

  async getTransfer(_id: string): Promise<Transfer> {
    throw new EndpointUnavailable('transfer detail');
  }

  async getMoneyFlow(_transferId: string): Promise<MoneyFlow> {
    throw new EndpointUnavailable('money-flow detail');
  }

  async getMoneyFlows(): Promise<MoneyFlow[]> {
    throw new EndpointUnavailable('money-flow search');
  }

  async getReconciliationRuns(_params?: {
    status?: string;
    page?: number;
  }): Promise<ReconciliationRun[]> {
    throw new EndpointUnavailable('reconciliation runs');
  }

  async getReconciliationRun(_id: string): Promise<ReconciliationRun> {
    throw new EndpointUnavailable('reconciliation run detail');
  }

  async getWorkerJobs(_params?: {
    queue?: string;
    status?: string;
    page?: number;
  }): Promise<WorkerJob[]> {
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
    throw new EndpointUnavailable('audit events');
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

  // Future implementation must use an authorized, generated Samra client.
  // This portal intentionally has no raw browser fetch fallback.
}

export const opsApi = new OpsApi();
