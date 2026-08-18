import { describe, expect, it } from "vitest";
import type { RemittanceQuote } from "@workspace/samra-client";

import {
  clearRemittanceSession,
  formatMinorUnits,
  isTerminalTransferStatus,
  loadRemittanceSession,
  persistActiveQuote,
  persistCreatedTransfer,
  prepareCancelSubmission,
  prepareTransferSubmission,
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

  it("rejects corrupt session data and clears active recovery state", async () => {
    const storage = new MemoryStorage();
    storage.values.set("samra.mobile.remittance.session.v1", "{bad json");
    expect(await loadRemittanceSession(storage)).toBeNull();
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
