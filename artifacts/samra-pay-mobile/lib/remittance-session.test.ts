import { describe, expect, it } from "vitest";
import type { RemittanceQuote, Transfer } from "@workspace/samra-client";

import {
  clearRemittanceSession,
  formatMinorUnits,
  isTerminalTransferStatus,
  loadRemittanceSession,
  persistActiveQuote,
  persistCreatedTransfer,
  prepareCancelSubmission,
  prepareTransferSubmission,
  resumePreparedCancellation,
  resumePreparedTransfer,
  sanitizeUsdInput,
  usdInputToMinorUnits,
  type AsyncKeyValueStorage,
} from "./remittance-session";

class MemoryStorage implements AsyncKeyValueStorage {
  readonly values = new Map<string, string>();
  async getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  async setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  async removeItem(key: string) {
    this.values.delete(key);
  }
}

const quote: RemittanceQuote = {
  id: "quote_1",
  status: "active",
  expiresAt: "2099-01-01T00:00:00.000Z",
  sourceAccountId: "account_1",
  beneficiaryId: "beneficiary_1",
  sendAmount: { currency: "USD", minorUnits: "10000" },
  feeAmount: { currency: "USD", minorUnits: "300" },
  totalDebit: { currency: "USD", minorUnits: "10300" },
  receiveAmount: { currency: "ETB", minorUnits: "1800000" },
  exchangeRate: "180.0000",
  fundingMethod: "samra_balance",
  deliveryMethod: "bank",
  estimatedDelivery: "Within minutes",
};

const transfer: Transfer = {
  id: "transfer_1",
  status: "submitted",
  recipientDisplay: "Abebe Bekele",
  quoteSnapshot: { ...quote, status: "consumed" },
  createdAt: "2026-08-18T12:00:00.000Z",
  updatedAt: "2026-08-18T12:00:00.000Z",
  failureCode: null,
  timeline: [],
};

describe("mobile remittance session", () => {
  it("persists the server quote needed to recover the review screen", async () => {
    const storage = new MemoryStorage();
    await persistActiveQuote(quote, storage);
    expect(await loadRemittanceSession(storage)).toEqual({ version: 1, quote });
  });

  it("persists an idempotency key before submission and reuses it after restart", async () => {
    const storage = new MemoryStorage();
    await persistActiveQuote(quote, storage);
    const first = await prepareTransferSubmission(
      quote,
      storage,
      () => "stable-token",
    );
    const replay = await prepareTransferSubmission(
      quote,
      storage,
      () => "different-token",
    );
    expect(first).toBe("mobile-transfer-stable-token");
    expect(replay).toBe(first);
    expect((await loadRemittanceSession(storage))?.transferIdempotencyKey).toBe(
      first,
    );
  });

  it("restores the transfer id while retaining the submission key", async () => {
    const storage = new MemoryStorage();
    const key = await prepareTransferSubmission(quote, storage, () => "key");
    await persistCreatedTransfer(quote, "transfer_1", storage);
    expect(await loadRemittanceSession(storage)).toMatchObject({
      quote,
      transferId: "transfer_1",
      transferIdempotencyKey: key,
    });
  });

  it("automatically resumes the prepared command with the original key after restart", async () => {
    const storage = new MemoryStorage();
    const key = await prepareTransferSubmission(
      quote,
      storage,
      () => "restart-key",
    );
    const restartedSession = await loadRemittanceSession(storage);
    expect(restartedSession).not.toBeNull();

    const calls: Array<{ quoteId: string; idempotencyKey: string }> = [];
    const recovered = await resumePreparedTransfer(
      restartedSession!,
      async (input, idempotencyKey) => {
        calls.push({ quoteId: input.quoteId, idempotencyKey });
        return transfer;
      },
      storage,
    );

    expect(recovered).toEqual(transfer);
    expect(calls).toEqual([{ quoteId: quote.id, idempotencyKey: key }]);
    expect(await loadRemittanceSession(storage)).toMatchObject({
      transferId: transfer.id,
      transferIdempotencyKey: key,
    });
  });

  it("recovers a lost create response without creating a second logical transfer", async () => {
    const storage = new MemoryStorage();
    const key = await prepareTransferSubmission(
      quote,
      storage,
      () => "lost-response",
    );
    const backendTransfers = new Map<string, Transfer>();
    let attempts = 0;
    const backendCreate = async (
      _input: Readonly<{ quoteId: string }>,
      idempotencyKey: string,
    ) => {
      attempts += 1;
      const existing = backendTransfers.get(idempotencyKey);
      if (existing) return existing;
      backendTransfers.set(idempotencyKey, transfer);
      throw new Error("Connection closed after backend commit");
    };

    await expect(
      resumePreparedTransfer(
        (await loadRemittanceSession(storage))!,
        backendCreate,
        storage,
      ),
    ).rejects.toThrow("Connection closed after backend commit");
    expect((await loadRemittanceSession(storage))?.transferId).toBeUndefined();
    expect(
      (await loadRemittanceSession(storage))?.transferIdempotencyKey,
    ).toBe(key);

    const recovered = await resumePreparedTransfer(
      (await loadRemittanceSession(storage))!,
      backendCreate,
      storage,
    );
    expect(recovered?.id).toBe(transfer.id);
    expect(attempts).toBe(2);
    expect(backendTransfers.size).toBe(1);
    expect((await loadRemittanceSession(storage))?.transferId).toBe(
      transfer.id,
    );
  });

  it("does not replay creation after a transfer id is durable", async () => {
    const storage = new MemoryStorage();
    await persistCreatedTransfer(quote, transfer.id, storage);
    let calls = 0;
    const recovered = await resumePreparedTransfer(
      (await loadRemittanceSession(storage))!,
      async () => {
        calls += 1;
        return transfer;
      },
      storage,
    );
    expect(recovered).toBeNull();
    expect(calls).toBe(0);
  });

  it("reuses a persisted cancellation key", async () => {
    const storage = new MemoryStorage();
    await persistCreatedTransfer(quote, "transfer_1", storage);
    const session = await loadRemittanceSession(storage);
    expect(session).not.toBeNull();
    const first = await prepareCancelSubmission(
      session!,
      storage,
      () => "cancel-key",
    );
    const restored = await loadRemittanceSession(storage);
    const replay = await prepareCancelSubmission(
      restored!,
      storage,
      () => "different",
    );
    expect(first).toBe("mobile-cancel-cancel-key");
    expect(replay).toBe(first);
  });

  it("automatically resumes a user-authorized cancellation with the original key", async () => {
    const storage = new MemoryStorage();
    await persistCreatedTransfer(quote, transfer.id, storage);
    const prepared = await loadRemittanceSession(storage);
    const key = await prepareCancelSubmission(
      prepared!,
      storage,
      () => "restart-cancel",
    );
    const restarted = await loadRemittanceSession(storage);
    const cancelled = { ...transfer, status: "cancelled" as const };
    const calls: Array<{ transferId: string; idempotencyKey: string }> = [];

    const recovered = await resumePreparedCancellation(
      restarted!,
      transfer.status,
      async (transferId, idempotencyKey) => {
        calls.push({ transferId, idempotencyKey });
        return cancelled;
      },
    );

    expect(recovered?.status).toBe("cancelled");
    expect(calls).toEqual([{ transferId: transfer.id, idempotencyKey: key }]);
  });

  it("does not replay cancellation after backend status is terminal", async () => {
    const storage = new MemoryStorage();
    await persistCreatedTransfer(quote, transfer.id, storage);
    const prepared = await loadRemittanceSession(storage);
    await prepareCancelSubmission(prepared!, storage, () => "terminal-cancel");
    let calls = 0;
    const recovered = await resumePreparedCancellation(
      (await loadRemittanceSession(storage))!,
      "cancelled",
      async () => {
        calls += 1;
        return { ...transfer, status: "cancelled" };
      },
    );
    expect(recovered).toBeNull();
    expect(calls).toBe(0);
  });

  it("rejects corrupt session data and clears active recovery state", async () => {
    const storage = new MemoryStorage();
    storage.values.set("samra.mobile.remittance.session.v1", "{bad json");
    expect(await loadRemittanceSession(storage)).toBeNull();
    expect(storage.values).toHaveLength(0);
    await persistActiveQuote(quote, storage);
    await clearRemittanceSession(storage);
    expect(await loadRemittanceSession(storage)).toBeNull();
  });
});

describe("mobile remittance financial truth helpers", () => {
  it("sanitizes USD input and converts it without floating-point arithmetic", () => {
    expect(sanitizeUsdInput("$001,234.567")).toBe("1234.56");
    expect(usdInputToMinorUnits("1234.56")).toBe("123456");
    expect(usdInputToMinorUnits("0")).toBeNull();
    expect(usdInputToMinorUnits("1.234")).toBeNull();
    expect(formatMinorUnits("123456")).toBe("1,234.56");
  });

  it("does not classify processing or refund-pending states as completed", () => {
    expect(isTerminalTransferStatus("created")).toBe(false);
    expect(isTerminalTransferStatus("payout_pending")).toBe(false);
    expect(isTerminalTransferStatus("refund_pending")).toBe(false);
    expect(isTerminalTransferStatus("completed")).toBe(true);
    expect(isTerminalTransferStatus("failed")).toBe(true);
    expect(isTerminalTransferStatus("refunded")).toBe(true);
    expect(isTerminalTransferStatus("cancelled")).toBe(true);
  });
});
