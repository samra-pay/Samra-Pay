import { describe, expect, it } from 'vitest';
import { AUDIT_EVENTS, MONEY_FLOWS, RECONCILIATION_RUNS, TRANSFERS } from './fixtures';
import { parseApiOrigin, parseDataMode, parseOperationsEnabled } from './data-mode';
import { EndpointUnavailable, opsApi } from './ops-api';
import {
  chronologicalTimeline,
  filterMoneyFlows,
  filterTransfers,
  fixtureTransferLookup,
  isProviderEvidence,
  relatedFixtureTransfers,
} from './ops-selectors';

describe('operations data boundaries', () => {
  it('keeps explicit modes isolated and rejects unknown modes', () => {
    expect(parseDataMode(undefined)).toBe('mock');
    expect(parseDataMode('mock')).toBe('mock');
    expect(parseDataMode('api')).toBe('api');
    expect(() => parseDataMode('legacy')).toThrow('must be "mock" or "api"');
    expect(parseApiOrigin(undefined, 'mock')).toBeNull();
    expect(() => parseApiOrigin(undefined, 'api')).toThrow('is required');
    expect(parseApiOrigin('https://api.example.test/', 'api')).toBe('https://api.example.test');
    expect(parseOperationsEnabled(undefined)).toBe(false);
    expect(parseOperationsEnabled('true')).toBe(true);
    expect(() => parseOperationsEnabled('yes')).toThrow('must be "true" or "false"');
  });

  it('does not use synthetic fixtures when an API endpoint is unavailable', async () => {
    await expect(opsApi.getSystemHealth()).rejects.toBeInstanceOf(EndpointUnavailable);
    await expect(opsApi.getMoneyFlows()).rejects.toBeInstanceOf(EndpointUnavailable);
    expect(relatedFixtureTransfers('api', TRANSFERS, 'cust-001')).toEqual([]);
    expect(fixtureTransferLookup('api', TRANSFERS).size).toBe(0);
  });

  it('keeps API-mode flow selection and searching independent of fixture transfers', () => {
    const apiFlow = {
      transferId: 'api-flow-001',
      reference: 'API-FLOW-001',
      currentStage: 'payout',
      stages: [
        {
          stage: 'payout',
          label: 'Payout',
          status: 'active' as const,
          evidenceSource: 'Worker processing' as const,
        },
      ],
    };

    expect(filterMoneyFlows('api', [apiFlow], fixtureTransferLookup('api', TRANSFERS), 'api-flow', 'failed')).toEqual([
      apiFlow,
    ]);
  });
});

describe('read-only investigative data', () => {
  it('filters transfer records without altering exact supplied money strings', () => {
    const filtered = filterTransfers(TRANSFERS, 'txn-20240614-001', 'all');
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.sendAmount).toEqual({
      amount: '500.00',
      currency: 'USD',
    });
    expect(filtered[0]?.fee).toEqual({ amount: '4.50', currency: 'USD' });
  });

  it('orders timelines chronologically and distinguishes provider evidence', () => {
    const transfer = TRANSFERS[0]!;
    const ordered = chronologicalTimeline([...transfer.timeline].reverse());
    expect(ordered.map((event) => event.id)).toEqual(transfer.timeline.map((event) => event.id));
    expect(ordered.some(isProviderEvidence)).toBe(true);
    expect(ordered.some((event) => event.category === 'samra_canonical')).toBe(true);
  });

  it('contains every required synthetic terminal scenario and flow evidence fields', () => {
    const statuses = new Set(TRANSFERS.map((transfer) => transfer.status));
    for (const status of ['completed', 'pending', 'failed', 'refunded', 'reversed', 'timed_out'] as const) {
      expect(statuses.has(status)).toBe(true);
    }
    expect(MONEY_FLOWS.every((flow) => flow.stages.every((stage) => stage.money && stage.evidenceSource))).toBe(true);
  });

  it('renders reconciliation exceptions and keeps audit records immutable', () => {
    expect(RECONCILIATION_RUNS.some((run) => run.exceptions.length > 0)).toBe(true);
    expect(AUDIT_EVENTS.every((event) => event.immutable)).toBe(true);
    expect('retryWorkerJob' in opsApi).toBe(false);
    expect('editLedger' in opsApi).toBe(false);
  });
});
