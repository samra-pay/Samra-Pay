import {
  cancelRemittanceTransfer,
  createRemittanceQuote,
  createRemittanceTransfer,
  getCurrentCustomer,
  getRemittanceOptions,
  getRemittanceTransfer,
  listAccounts,
  listActivity,
  listRemittanceTransfers,
} from "@workspace/api-client-react";

import type {
  ActivityQuery,
  CreateQuoteInput,
  CreateTransferInput,
  SamraTransport,
  TransferQuery,
} from "./index";

function idempotencyHeaders(key: string): HeadersInit {
  return { "Idempotency-Key": key };
}

/**
 * The only adapter that knows generated operation names. Screens and hooks use
 * SamraDataSource, allowing the OpenAPI generator to evolve without spreading
 * transport naming through either client.
 */
export function createGeneratedSamraTransport(): SamraTransport {
  return {
    async getCurrentCustomer() {
      const { backendMode: _backendMode, ...customer } =
        await getCurrentCustomer();
      return customer;
    },

    listAccounts,

    listActivity(input?: ActivityQuery) {
      return listActivity(input);
    },

    getRemittanceOptions,

    createQuote(input: CreateQuoteInput) {
      return createRemittanceQuote(input);
    },

    createTransfer(input: CreateTransferInput, idempotencyKey: string) {
      return createRemittanceTransfer(input, {
        headers: idempotencyHeaders(idempotencyKey),
      });
    },

    getTransfer(id: string) {
      return getRemittanceTransfer(id);
    },

    listTransfers(input?: TransferQuery) {
      return listRemittanceTransfers(input);
    },

    cancelTransfer(id: string, idempotencyKey: string) {
      return cancelRemittanceTransfer(id, {
        headers: idempotencyHeaders(idempotencyKey),
      });
    },
  };
}
