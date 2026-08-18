/** @vitest-environment happy-dom */

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it } from "vitest";

import type {
  AccountSummary,
  ActivityPage,
  SamraDataSource,
  Transfer,
} from "@workspace/samra-client";
import {
  SamraDataSourceProvider,
  samraQueryKeys,
  useAccounts,
  useActivity,
  useTransfer,
} from "@workspace/samra-client/react";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const account: AccountSummary = {
  id: "account_1",
  kind: "domestic",
  displayName: "Samra USD",
  last4: "4242",
  currency: "USD",
  bookBalance: { currency: "USD", minorUnits: "425000" },
  availableBalance: { currency: "USD", minorUnits: "414700" },
  status: "active",
};

const activity: ActivityPage = {
  items: [],
  nextCursor: null,
};

const submittedTransfer: Transfer = {
  id: "transfer_1",
  status: "submitted",
  recipientDisplay: "Abebe Bekele",
  quoteSnapshot: {
    id: "quote_1",
    status: "consumed",
    expiresAt: "2026-08-18T12:05:00.000Z",
    sourceAccountId: account.id,
    beneficiaryId: "beneficiary_1",
    sendAmount: { currency: "USD", minorUnits: "10000" },
    feeAmount: { currency: "USD", minorUnits: "300" },
    totalDebit: { currency: "USD", minorUnits: "10300" },
    receiveAmount: { currency: "ETB", minorUnits: "1800000" },
    exchangeRate: "180",
    fundingMethod: "samra_balance",
    deliveryMethod: "bank",
    estimatedDelivery: "Same day",
  },
  createdAt: "2026-08-18T12:00:00.000Z",
  updatedAt: "2026-08-18T12:00:00.000Z",
  failureCode: null,
  timeline: [],
};

let mountedRoot: ReturnType<typeof createRoot> | null = null;

afterEach(async () => {
  if (!mountedRoot) return;
  await act(async () => mountedRoot?.unmount());
  mountedRoot = null;
});

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (predicate()) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
  }
  throw new Error("Timed out waiting for the query state to settle.");
}

describe("transfer-driven financial truth refresh", () => {
  it("refetches account and activity queries when backend transfer status changes", async () => {
    let currentTransfer = submittedTransfer;
    let accountCalls = 0;
    let activityCalls = 0;

    const source = {
      async listAccounts() {
        accountCalls += 1;
        return [account];
      },
      async listActivity() {
        activityCalls += 1;
        return activity;
      },
      async getTransfer() {
        return currentTransfer;
      },
    } as unknown as SamraDataSource;

    function Harness() {
      useAccounts();
      useActivity({ limit: 25 });
      useTransfer(currentTransfer.id);
      return null;
    }

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const container = document.createElement("div");
    mountedRoot = createRoot(container);

    await act(async () => {
      mountedRoot?.render(
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          React.createElement(
            SamraDataSourceProvider,
            { source },
            React.createElement(Harness),
          ),
        ),
      );
    });

    await waitFor(() => accountCalls > 0 && activityCalls > 0);
    await waitFor(() => !queryClient.isFetching());
    const accountCallsBeforeCompletion = accountCalls;
    const activityCallsBeforeCompletion = activityCalls;

    currentTransfer = {
      ...submittedTransfer,
      status: "completed",
      updatedAt: "2026-08-18T12:00:03.000Z",
    };
    await act(async () => {
      await queryClient.refetchQueries({
        queryKey: samraQueryKeys.transfer(submittedTransfer.id),
      });
    });

    await waitFor(
      () =>
        accountCalls > accountCallsBeforeCompletion &&
        activityCalls > activityCallsBeforeCompletion,
    );
    expect(
      queryClient.getQueryData<Transfer>(samraQueryKeys.transfer("transfer_1"))
        ?.status,
    ).toBe("completed");
  });
});
