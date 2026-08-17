import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getOperationsSummary,
  getOperationsTransfer,
  listOperationsAuditEvents,
  listOperationsCustomers,
  listOperationsReconciliationExceptions,
  listOperationsTransfers,
} from "@workspace/api-client-react";
import { opsApi } from "./ops-api";

vi.mock("@workspace/api-client-react", () => ({
  getOperationsSummary: vi.fn(),
  getOperationsTransfer: vi.fn(),
  listOperationsAuditEvents: vi.fn(),
  listOperationsCustomers: vi.fn(),
  listOperationsReconciliationExceptions: vi.fn(),
  listOperationsTransfers: vi.fn(),
  setBaseUrl: vi.fn(),
}));

const money = (currency: "USD" | "ETB", minorUnits: string) => ({
  currency,
  minorUnits,
});

describe("authorized operations API adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses the generated client, operator boundary, and durable summary counts", async () => {
    vi.mocked(getOperationsSummary).mockResolvedValue({
      generatedAt: "2026-08-17T10:00:00.000Z",
      customers: { active: 4 },
      transfers: { completed: 3, failed: 1 },
      workflow: { ready: 1 },
      outbox: { published: 3 },
      providerEvents: { processed: 3 },
      openReconciliationExceptions: 1,
    });

    const metrics = await opsApi.getOverviewMetrics();

    expect(getOperationsSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        credentials: "include",
      }),
    );
    expect(metrics).toContainEqual(
      expect.objectContaining({ label: "Transfers · completed", value: "3" }),
    );
    expect(metrics).toContainEqual(
      expect.objectContaining({
        label: "Open reconciliation exceptions",
        value: "1",
      }),
    );
  });

  it("maps exact server minor units and customer identity without fixture fallback", async () => {
    vi.mocked(listOperationsCustomers).mockResolvedValue([
      {
        id: "customer-1",
        displayName: "Synthetic Customer",
        countryCode: "US",
        status: "active",
        accountCount: 1,
        beneficiaryCount: 1,
        transferCount: 1,
        completedTransferCount: 0,
        totalSent: money("USD", "10000"),
        lastTransferAt: "2026-08-17T10:00:00.000Z",
        createdAt: "2026-08-17T09:00:00.000Z",
      },
    ]);
    vi.mocked(listOperationsTransfers).mockResolvedValue([
      {
        id: "transfer-1",
        customerId: "customer-1",
        beneficiaryDisplay: "Synthetic Recipient",
        status: "submitted",
        fundingStatus: "captured",
        payoutStatus: "queued",
        reconciliationStatus: "pending",
        sourceAmount: money("USD", "10000"),
        feeAmount: money("USD", "300"),
        totalDebit: money("USD", "10300"),
        destinationAmount: money("ETB", "1800000"),
        workflowState: "submitted",
        workflowAttempts: 1,
        workflowLastError: null,
        createdAt: "2026-08-17T10:00:00.000Z",
        updatedAt: "2026-08-17T10:01:00.000Z",
      },
    ]);

    const [transfer] = await opsApi.getTransfers();

    expect(transfer).toMatchObject({
      id: "transfer-1",
      senderName: "Synthetic Customer",
      sendAmount: { currency: "USD", amount: "100.00" },
      fee: { currency: "USD", amount: "3.00" },
      receiveAmount: { currency: "ETB", amount: "18000.00" },
      status: "pending",
    });
  });

  it("loads Compliance transfers without requesting the restricted customer directory", async () => {
    vi.mocked(listOperationsTransfers).mockResolvedValue([
      {
        id: "transfer-compliance-1",
        customerId: "customer-restricted",
        beneficiaryDisplay: "Restricted recipient",
        status: "submitted",
        fundingStatus: "captured",
        payoutStatus: "queued",
        reconciliationStatus: "pending",
        sourceAmount: money("USD", "10000"),
        feeAmount: money("USD", "300"),
        totalDebit: money("USD", "10300"),
        destinationAmount: money("ETB", "1800000"),
        workflowState: "submitted",
        workflowAttempts: 1,
        workflowLastError: null,
        createdAt: "2026-08-17T10:00:00.000Z",
        updatedAt: "2026-08-17T10:01:00.000Z",
      },
    ]);

    const [transfer] = await opsApi.getTransfers({
      includeCustomerNames: false,
    });

    expect(listOperationsCustomers).not.toHaveBeenCalled();
    expect(transfer).toMatchObject({
      senderName: "customer-restricted",
      recipientName: "Restricted recipient",
    });
  });

  it("combines canonical, provider, and worker evidence in transfer detail", async () => {
    vi.mocked(getOperationsTransfer).mockResolvedValue({
      transfer: {
        id: "transfer-1",
        customerId: "customer-1",
        beneficiaryDisplay: "Synthetic Recipient",
        status: "completed",
        fundingStatus: "settled",
        payoutStatus: "delivered",
        reconciliationStatus: "matched",
        sourceAmount: money("USD", "10000"),
        feeAmount: money("USD", "300"),
        totalDebit: money("USD", "10300"),
        destinationAmount: money("ETB", "1800000"),
        workflowState: "completed",
        workflowAttempts: 1,
        workflowLastError: null,
        createdAt: "2026-08-17T10:00:00.000Z",
        updatedAt: "2026-08-17T10:02:00.000Z",
      },
      timeline: [
        {
          sequence: 1,
          fromState: "submitted",
          toState: "completed",
          reason: "Synthetic payout completed",
          occurredAt: "2026-08-17T10:02:00.000Z",
        },
      ],
      providerLinks: [
        {
          provider: "chapa",
          resourceType: "payout",
          providerResourceId: "chapa-1",
          createdAt: "2026-08-17T10:01:00.000Z",
        },
      ],
      providerEvents: [
        {
          provider: "chapa",
          providerEventId: "event-1",
          eventType: "paid",
          state: "processed",
          attemptCount: 1,
          lastError: null,
          occurredAt: "2026-08-17T10:02:00.000Z",
          receivedAt: "2026-08-17T10:02:00.000Z",
          processedAt: "2026-08-17T10:02:00.000Z",
        },
      ],
      outbox: [
        {
          eventKey: "outbox-1",
          eventType: "transfer.completed",
          state: "published",
          attemptCount: 1,
          availableAt: "2026-08-17T10:02:00.000Z",
          publishedAt: "2026-08-17T10:02:00.000Z",
          lastError: null,
          createdAt: "2026-08-17T10:02:00.000Z",
        },
      ],
      audit: [],
      reconciliationExceptions: [],
    });

    const transfer = await opsApi.getTransfer("transfer-1");

    expect(transfer.providerRef).toBe("chapa-1");
    expect(transfer.timeline.map((event) => event.category)).toEqual([
      "samra_canonical",
      "provider_evidence",
      "worker",
    ]);
  });
});
