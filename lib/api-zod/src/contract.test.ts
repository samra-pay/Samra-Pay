import assert from "node:assert/strict";
import test from "node:test";

import {
  CreateRemittanceQuoteBody,
  CreateRemittanceQuoteResponse,
} from "./generated/api.ts";

const validQuoteRequest = {
  sourceAccountId: "acct_demo_primary",
  beneficiaryId: "beneficiary_demo_bank",
  sendAmount: { currency: "USD", minorUnits: "10000" },
  fundingMethod: "samra_balance",
  deliveryMethod: "bank",
} as const;

test("quote requests require exact string USD minor units", () => {
  assert.equal(
    CreateRemittanceQuoteBody.parse(validQuoteRequest).sendAmount.minorUnits,
    "10000",
  );

  assert.throws(() =>
    CreateRemittanceQuoteBody.parse({
      ...validQuoteRequest,
      sendAmount: { currency: "ETB", minorUnits: "10000" },
    }),
  );
  assert.throws(() =>
    CreateRemittanceQuoteBody.parse({
      ...validQuoteRequest,
      sendAmount: { currency: "USD", minorUnits: 10000 },
    }),
  );
  assert.throws(() =>
    CreateRemittanceQuoteBody.parse({
      ...validQuoteRequest,
      sendAmount: { currency: "USD", minorUnits: "100.00" },
    }),
  );
});

test("quote responses keep timestamps and bigint-safe money as JSON strings", () => {
  const parsed = CreateRemittanceQuoteResponse.parse({
    id: "quote_demo_1",
    status: "active",
    expiresAt: "2026-08-15T18:15:00.000Z",
    sourceAccountId: "acct_demo_primary",
    beneficiaryId: "beneficiary_demo_bank",
    sendAmount: { currency: "USD", minorUnits: "10000" },
    feeAmount: { currency: "USD", minorUnits: "300" },
    totalDebit: { currency: "USD", minorUnits: "10300" },
    receiveAmount: { currency: "ETB", minorUnits: "1800000" },
    exchangeRate: "180.0000",
    fundingMethod: "samra_balance",
    deliveryMethod: "bank",
    estimatedDelivery: "Demo: under one minute",
  });

  assert.equal(typeof parsed.expiresAt, "string");
  assert.equal(typeof parsed.totalDebit.minorUnits, "string");
  assert.equal(parsed.receiveAmount.currency, "ETB");
});
