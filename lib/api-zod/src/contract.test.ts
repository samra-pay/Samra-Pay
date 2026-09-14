import assert from "node:assert/strict";
import test from "node:test";

import {
  CreateRemittanceQuoteBody,
  CreateRemittanceQuoteResponse,
  GetCustomerWalletDisclosureResponse,
  StartCustomerWalletProvisioningBody,
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

const stagingWalletDisclosure = {
  bundleVersion: "sandbox-customer-wallet-v2",
  documentVersion: "sandbox-customer-wallet-v2",
  locale: "en-US",
  legalEffect: "non_production",
  environment: "staging",
  createsRealWallet: true,
  customerControlSetupRequired: true,
  fundingEnabled: false,
  remittanceEnabled: false,
  presentation: {
    title: "Create your Crossmint non-production EVM wallet",
    body: "This creates a real, non-production Crossmint EVM wallet intended for future approved USDC use and associates it with your Samra account. Crossmint receives an opaque Samra customer reference and the configured tester recovery email for the wallet's email admin signer. Samra has not configured a token or on-chain asset for this wallet. Because this flow does not inspect on-chain holdings, it makes no claim that the address is empty; Samra does not recognize or present a wallet balance. Customer signing and recovery control have not been verified, so the wallet is not ready. Funding, remittance, transfers, withdrawals, and live financial access remain disabled.",
    acceptanceLabel:
      "I understand Crossmint receives the configured tester recovery email; this flow does not prove the wallet is empty or customer-controlled, and Samra does not present a wallet balance",
    actionLabel: "Create Crossmint test wallet",
  },
} as const;

test("wallet disclosure variants reject incoherent truth or substituted copy", () => {
  assert.deepEqual(
    GetCustomerWalletDisclosureResponse.parse(stagingWalletDisclosure),
    stagingWalletDisclosure,
  );
  for (const candidate of [
    { ...stagingWalletDisclosure, createsRealWallet: false },
    { ...stagingWalletDisclosure, environment: "synthetic" },
    {
      ...stagingWalletDisclosure,
      presentation: {
        ...stagingWalletDisclosure.presentation,
        acceptanceLabel: "Substituted acceptance",
      },
    },
  ]) {
    assert.throws(() => GetCustomerWalletDisclosureResponse.parse(candidate));
  }
});

test("wallet acceptance requires a coherent disclosure version pair", () => {
  assert.deepEqual(
    StartCustomerWalletProvisioningBody.parse({
      bundleVersion: "sandbox-customer-wallet-v2",
      documentVersion: "sandbox-customer-wallet-v2",
      locale: "en-US",
      decision: "accepted",
    }),
    {
      bundleVersion: "sandbox-customer-wallet-v2",
      documentVersion: "sandbox-customer-wallet-v2",
      locale: "en-US",
      decision: "accepted",
    },
  );
  assert.throws(() =>
    StartCustomerWalletProvisioningBody.parse({
      bundleVersion: "sandbox-customer-wallet-v2",
      documentVersion: "alpha-wallet-non-production-v2",
      locale: "en-US",
      decision: "accepted",
    }),
  );
});
