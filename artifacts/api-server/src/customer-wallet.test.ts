import assert from "node:assert/strict";
import test from "node:test";
import {
  ALPHA_WALLET_CONFIGURATION_VERSION,
  ALPHA_WALLET_PROVISIONING_DISCLOSURE,
  type CustomerWalletProviderResult,
  type CustomerWalletSnapshot,
  type CustomerWalletStore,
} from "@workspace/db";
import {
  CustomerWalletProvisioningService,
  DeterministicFakeCrossmintAdapter,
  WalletProviderUnavailableError,
  type CustomerWalletProvider,
} from "./domain/customer-wallet";
import { DomainError } from "@workspace/remittance";

const CONSENT = Object.freeze({
  bundleVersion: ALPHA_WALLET_PROVISIONING_DISCLOSURE.bundleVersion,
  documentVersion: ALPHA_WALLET_PROVISIONING_DISCLOSURE.documentVersion,
  locale: ALPHA_WALLET_PROVISIONING_DISCLOSURE.locale,
  decision: "accepted" as const,
});

function snapshot(
  state: CustomerWalletSnapshot["state"],
): CustomerWalletSnapshot {
  return Object.freeze({
    walletId: "wallet_00000000000000000000000000000001",
    state,
    reasonFamily:
      state === "error"
        ? "wallet_provider_unavailable"
        : state === "restricted"
          ? "wallet_provider_conflict"
          : null,
    provider: "crossmint",
    asset: "USDC",
    network: state === "ready" ? "synthetic" : null,
    custodyModel: state === "ready" ? "synthetic" : null,
    publicAddress: null,
    configurationVersion: ALPHA_WALLET_CONFIGURATION_VERSION,
    synthetic: true,
    version: state === "provisioning" ? 2 : 3,
    readyAt: state === "ready" ? "2026-08-22T00:00:00.000Z" : null,
    createdAt: "2026-08-22T00:00:00.000Z",
    updatedAt: "2026-08-22T00:00:00.000Z",
    nextAllowedActions: [],
  });
}

function storeWith(
  overrides: Partial<CustomerWalletStore>,
): CustomerWalletStore {
  const notUsed = async (): Promise<never> => {
    throw new Error("unexpected store call");
  };
  return {
    prepareAuth0Wallet: notUsed,
    attachProviderWallet: notUsed,
    recordProviderStartFailure: notUsed,
    getAuth0Wallet: notUsed,
    ...overrides,
  };
}

function prepared(state: CustomerWalletSnapshot["state"], created = true) {
  return Object.freeze({
    snapshot: snapshot(state),
    providerRequestKey: "a".repeat(64),
    ownerLocator: "userId:customer_00000000000000000000000000000001",
    created,
  });
}

test("fake Crossmint wallet creation is stable and contains no customer PII", async () => {
  const provider = new DeterministicFakeCrossmintAdapter();
  const input = {
    walletId: snapshot("provisioning").walletId,
    ownerLocator: "userId:customer_00000000000000000000000000000001",
    providerRequestKey: "a".repeat(64),
    asset: "USDC" as const,
    configurationVersion: ALPHA_WALLET_CONFIGURATION_VERSION,
  };
  const first = await provider.createWallet(input);
  const second = await provider.createWallet(input);
  assert.deepEqual(first, second);
  assert.match(first.providerWalletRef, /^wallet_fake_[0-9a-f]{32}$/u);
  assert.deepEqual(first, {
    providerWalletRef: first.providerWalletRef,
    network: "synthetic",
    custodyModel: "synthetic",
    publicAddress: null,
    configurationVersion: ALPHA_WALLET_CONFIGURATION_VERSION,
  });
  assert.doesNotMatch(
    JSON.stringify(first),
    /email|phone|name|subject|token/iu,
  );
});

test("ready wallets resume without another provider call", async () => {
  let providerCalls = 0;
  const service = new CustomerWalletProvisioningService({
    store: storeWith({
      async prepareAuth0Wallet() {
        return prepared("ready", false);
      },
    }),
    provider: {
      provider: "crossmint",
      async createWallet() {
        providerCalls += 1;
        throw new Error("must not be called");
      },
    },
  });
  const result = await service.startAuth0Wallet({
    issuer: "https://tenant.example.test/",
    subject: "auth0|subject",
    idempotencyKey: "wallet-start-001",
    consent: CONSENT,
  });
  assert.equal(result.snapshot.state, "ready");
  assert.equal(result.created, false);
  assert.equal(providerCalls, 0);
});

test("provider failure is recorded before the customer receives unavailable", async () => {
  const failures: Array<{ walletId: string; reasonFamily: string }> = [];
  const service = new CustomerWalletProvisioningService({
    store: storeWith({
      async prepareAuth0Wallet() {
        return prepared("provisioning");
      },
      async recordProviderStartFailure(input) {
        failures.push(input);
        return snapshot("error");
      },
    }),
    provider: {
      provider: "crossmint",
      async createWallet() {
        throw new Error("synthetic outage");
      },
    },
  });
  await assert.rejects(
    service.startAuth0Wallet({
      issuer: "https://tenant.example.test/",
      subject: "auth0|subject",
      idempotencyKey: "wallet-start-002",
      consent: CONSENT,
    }),
    WalletProviderUnavailableError,
  );
  assert.deepEqual(failures, [
    {
      walletId: snapshot("provisioning").walletId,
      reasonFamily: "wallet_provider_unavailable",
    },
  ]);
});

test("provider timeout follows the same durable failure path", async () => {
  let failureCalls = 0;
  const service = new CustomerWalletProvisioningService({
    store: storeWith({
      async prepareAuth0Wallet() {
        return prepared("provisioning");
      },
      async recordProviderStartFailure() {
        failureCalls += 1;
        return snapshot("error");
      },
    }),
    provider: {
      provider: "crossmint",
      createWallet() {
        return new Promise<CustomerWalletProviderResult>(() => undefined);
      },
    },
    providerTimeoutMs: 5,
  });
  await assert.rejects(
    service.startAuth0Wallet({
      issuer: "https://tenant.example.test/",
      subject: "auth0|subject",
      idempotencyKey: "wallet-start-003",
      consent: CONSENT,
    }),
    WalletProviderUnavailableError,
  );
  assert.equal(failureCalls, 1);
});

test("a concurrent successful provider result wins over a failing caller", async () => {
  const service = new CustomerWalletProvisioningService({
    store: storeWith({
      async prepareAuth0Wallet() {
        return prepared("provisioning");
      },
      async recordProviderStartFailure() {
        return snapshot("ready");
      },
    }),
    provider: {
      provider: "crossmint",
      async createWallet() {
        throw new Error("one concurrent provider call failed");
      },
    },
  });
  const result = await service.startAuth0Wallet({
    issuer: "https://tenant.example.test/",
    subject: "auth0|subject",
    idempotencyKey: "wallet-start-004",
    consent: CONSENT,
  });
  assert.equal(result.snapshot.state, "ready");
  assert.equal(result.created, false);
});

test("the service forwards only opaque ownership and normalized wallet configuration", async () => {
  const observed: unknown[] = [];
  const result: CustomerWalletProviderResult = Object.freeze({
    providerWalletRef: "wallet_fake_00000000000000000000000000000001",
    network: "synthetic",
    custodyModel: "synthetic",
    publicAddress: null,
    configurationVersion: ALPHA_WALLET_CONFIGURATION_VERSION,
  });
  const provider: CustomerWalletProvider = {
    provider: "crossmint",
    async createWallet(input) {
      observed.push(input);
      return result;
    },
  };
  const attached: unknown[] = [];
  const service = new CustomerWalletProvisioningService({
    store: storeWith({
      async prepareAuth0Wallet() {
        return prepared("provisioning");
      },
      async attachProviderWallet(input) {
        attached.push(input);
        return snapshot("ready");
      },
    }),
    provider,
  });
  const response = await service.startAuth0Wallet({
    issuer: "https://tenant.example.test/",
    subject: "auth0|subject",
    idempotencyKey: "wallet-start-005",
    consent: CONSENT,
  });
  assert.equal(response.snapshot.state, "ready");
  assert.deepEqual(observed, [
    {
      walletId: snapshot("provisioning").walletId,
      ownerLocator: "userId:customer_00000000000000000000000000000001",
      providerRequestKey: "a".repeat(64),
      asset: "USDC",
      configurationVersion: ALPHA_WALLET_CONFIGURATION_VERSION,
    },
  ]);
  assert.deepEqual(attached, [
    {
      walletId: snapshot("provisioning").walletId,
      providerRequestKey: "a".repeat(64),
      result,
    },
  ]);
});

test("a conflicting provider result restricts the wallet instead of replacing its mapping", async () => {
  const service = new CustomerWalletProvisioningService({
    store: storeWith({
      async prepareAuth0Wallet() {
        return prepared("provisioning");
      },
      async attachProviderWallet() {
        return snapshot("restricted");
      },
    }),
    provider: new DeterministicFakeCrossmintAdapter(),
  });
  await assert.rejects(
    service.startAuth0Wallet({
      issuer: "https://tenant.example.test/",
      subject: "auth0|subject",
      idempotencyKey: "wallet-start-006",
      consent: CONSENT,
    }),
    (error: unknown) =>
      error instanceof DomainError && error.code === "CONFLICT",
  );
});
