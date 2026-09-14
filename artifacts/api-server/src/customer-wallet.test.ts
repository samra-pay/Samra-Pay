import assert from "node:assert/strict";
import test from "node:test";
import {
  ALPHA_WALLET_CONFIGURATION_VERSION,
  ALPHA_WALLET_PROVISIONING_DISCLOSURE,
  CUSTOMER_CONTROLLED_SANDBOX_DISCLOSURE,
  CustomerOnboardingAccessRestrictedError,
  type CustomerWalletProviderResult,
  type CustomerWalletSnapshot,
  type CustomerWalletStore,
} from "@workspace/db";
import {
  customerWalletDisclosureFor,
  CustomerWalletProvisioningService,
  DeterministicFakeCrossmintAdapter,
  toPublicCustomerWalletSnapshot,
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

const STAGING_CONSENT = Object.freeze({
  bundleVersion: CUSTOMER_CONTROLLED_SANDBOX_DISCLOSURE.bundleVersion,
  documentVersion: CUSTOMER_CONTROLLED_SANDBOX_DISCLOSURE.documentVersion,
  locale: CUSTOMER_CONTROLLED_SANDBOX_DISCLOSURE.locale,
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
    async runAuthorizedProviderDispatch(_input, operation) {
      return operation();
    },
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

test("a stale same-key preparation returns the winning ready snapshot without redispatching", async () => {
  let providerCalls = 0;
  let guardCalls = 0;
  const service = new CustomerWalletProvisioningService({
    store: storeWith({
      async prepareAuth0Wallet() {
        return prepared("provisioning", false);
      },
      async runAuthorizedProviderDispatch() {
        guardCalls += 1;
        return snapshot("ready");
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

  const replay = await service.startAuth0Wallet({
    issuer: "https://tenant.example.test/",
    subject: "auth0|subject",
    idempotencyKey: "wallet-start-concurrent-same-key-001",
    consent: CONSENT,
  });

  assert.equal(replay.snapshot.state, "ready");
  assert.equal(replay.created, false);
  assert.equal(guardCalls, 1);
  assert.equal(providerCalls, 0);
});

test("a stale staging creator returns a reconciled control-setup snapshot without dispatching", async () => {
  let providerCalls = 0;
  const service = new CustomerWalletProvisioningService({
    store: storeWith({
      async prepareAuth0Wallet() {
        return prepared("provisioning", true);
      },
      async runAuthorizedProviderDispatch() {
        return snapshot("customer_control_setup");
      },
    }),
    providerMode: "crossmint-sandbox-customer",
    provider: {
      provider: "crossmint",
      async createWallet() {
        providerCalls += 1;
        throw new Error("must not be called");
      },
    },
  });

  const replay = await service.startAuth0Wallet({
    issuer: "https://tenant.example.test/",
    subject: "auth0|subject",
    idempotencyKey: "wallet-start-staging-reconciled-001",
    consent: STAGING_CONSENT,
  });

  assert.equal(replay.snapshot.state, "customer_control_setup");
  assert.equal(replay.created, true);
  assert.equal(providerCalls, 0);
});

test("customer-control setup resume preserves exact disclosure versions without another provider call", async () => {
  let providerCalls = 0;
  let prepareCalls = 0;
  const service = new CustomerWalletProvisioningService({
    store: storeWith({
      async prepareAuth0Wallet() {
        prepareCalls += 1;
        return prepared("customer_control_setup", false);
      },
    }),
    providerMode: "crossmint-sandbox-customer",
    provider: {
      provider: "crossmint",
      async createWallet() {
        providerCalls += 1;
        throw new Error("must not be called");
      },
    },
  });
  const input = {
    issuer: "https://tenant.example.test/",
    subject: "auth0|subject",
    idempotencyKey: "wallet-start-control-setup-001",
    consent: STAGING_CONSENT,
  };
  const result = await service.startAuth0Wallet(input);
  const replay = await service.startAuth0Wallet(input);
  assert.equal(result.snapshot.state, "customer_control_setup");
  assert.equal(replay.snapshot.state, "customer_control_setup");
  assert.equal(result.created, false);
  assert.equal(providerCalls, 0);
  assert.equal(prepareCalls, 2);

  await assert.rejects(
    service.startAuth0Wallet({ ...input, consent: CONSENT }),
    /server-selected version/i,
  );
  assert.equal(prepareCalls, 2);
});

test("a new staging command records an ambiguous outcome and blocks another create call", async () => {
  let walletState: CustomerWalletSnapshot["state"] = "provisioning";
  let created = true;
  let providerCalls = 0;
  let failureCalls = 0;
  const failureReasons: string[] = [];
  const service = new CustomerWalletProvisioningService({
    store: storeWith({
      async prepareAuth0Wallet() {
        const result = prepared(walletState, created);
        created = false;
        return result;
      },
      async recordProviderStartFailure(input) {
        failureCalls += 1;
        failureReasons.push(input.reasonFamily);
        walletState = "error";
        return snapshot("error");
      },
    }),
    providerMode: "crossmint-sandbox-customer",
    provider: {
      provider: "crossmint",
      async createWallet() {
        providerCalls += 1;
        throw new Error("ambiguous provider outcome");
      },
    },
  });
  const input = {
    issuer: "https://tenant.example.test/",
    subject: "auth0|subject",
    idempotencyKey: "wallet-start-outcome-unknown-001",
    consent: STAGING_CONSENT,
  };

  await assert.rejects(
    service.startAuth0Wallet(input),
    WalletProviderUnavailableError,
  );
  await assert.rejects(
    service.startAuth0Wallet(input),
    WalletProviderUnavailableError,
  );
  assert.equal(providerCalls, 1);
  assert.equal(failureCalls, 1);
  assert.deepEqual(failureReasons, ["wallet_provider_outcome_unknown"]);
});

test("an existing nonterminal staging row never issues provider creation", async () => {
  for (const state of ["created", "provisioning", "error"] as const) {
    let providerCalls = 0;
    const service = new CustomerWalletProvisioningService({
      store: storeWith({
        async prepareAuth0Wallet() {
          return prepared(state, false);
        },
      }),
      providerMode: "crossmint-sandbox-customer",
      provider: {
        provider: "crossmint",
        async createWallet() {
          providerCalls += 1;
          throw new Error("must not be called");
        },
      },
    });

    await assert.rejects(
      service.startAuth0Wallet({
        issuer: "https://tenant.example.test/",
        subject: "auth0|subject",
        idempotencyKey: `wallet-start-existing-${state}-001`,
        consent: STAGING_CONSENT,
      }),
      WalletProviderUnavailableError,
    );
    assert.equal(providerCalls, 0);
  }
});

test("wallet disclosure is server-selected and contains no provider contract", () => {
  const synthetic = customerWalletDisclosureFor("fake");
  assert.deepEqual(synthetic, {
    bundleVersion: "alpha-wallet-non-production-v2",
    documentVersion: "alpha-wallet-non-production-v2",
    locale: "en-US",
    legalEffect: "non_production",
    environment: "synthetic",
    createsRealWallet: false,
    customerControlSetupRequired: false,
    fundingEnabled: false,
    remittanceEnabled: false,
    presentation: {
      title: "Create your synthetic USDC wallet record",
      body: "This alpha step creates only a synthetic wallet record. It does not create a blockchain wallet, tokens, public address, balance, funding, remittance, transfers, withdrawals, or live financial access.",
      acceptanceLabel:
        "I understand this creates only a synthetic wallet record",
      actionLabel: "Create synthetic wallet",
    },
  });

  const staging = customerWalletDisclosureFor("crossmint-sandbox-customer");
  assert.deepEqual(staging, {
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
  });
  assert.equal("provider" in synthetic, false);
  assert.equal("provider" in staging, false);
  assert.doesNotMatch(JSON.stringify(synthetic), /crossmint|provider/iu);
  assert.match(JSON.stringify(staging), /crossmint/iu);
  assert.match(JSON.stringify(staging), /configured tester recovery email/iu);
});

test("non-ready wallet state never exposes control or address evidence", () => {
  const projected = toPublicCustomerWalletSnapshot(
    Object.freeze({
      ...snapshot("customer_control_setup"),
      custodyModel: "smart-customer-email-recovery",
      publicAddress: "0x1111111111111111111111111111111111111111",
      synthetic: false,
    }),
  );
  assert.equal(projected.state, "customer_control_setup");
  assert.equal(projected.custodyModel, null);
  assert.equal(projected.publicAddress, null);
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

test("a concurrent customer restriction is returned only after the provider result is attached", async () => {
  let attachCalls = 0;
  const service = new CustomerWalletProvisioningService({
    store: storeWith({
      async prepareAuth0Wallet() {
        return prepared("provisioning");
      },
      async attachProviderWallet() {
        attachCalls += 1;
        return Object.freeze({
          ...snapshot("restricted"),
          reasonFamily: "identity_provider_conflict",
        });
      },
    }),
    provider: new DeterministicFakeCrossmintAdapter(),
  });

  await assert.rejects(
    service.startAuth0Wallet({
      issuer: "https://tenant.example.test/",
      subject: "auth0|subject",
      idempotencyKey: "wallet-start-restricted-001",
      consent: CONSENT,
    }),
    CustomerOnboardingAccessRestrictedError,
  );
  assert.equal(attachCalls, 1);
});

test("a restriction committed after preparation blocks dispatch at the transactional guard", async () => {
  let providerCalls = 0;
  const service = new CustomerWalletProvisioningService({
    store: storeWith({
      async prepareAuth0Wallet() {
        return prepared("provisioning");
      },
      async runAuthorizedProviderDispatch() {
        throw new CustomerOnboardingAccessRestrictedError();
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

  await assert.rejects(
    service.startAuth0Wallet({
      issuer: "https://tenant.example.test/",
      subject: "auth0|subject",
      idempotencyKey: "wallet-start-restricted-guard-001",
      consent: CONSENT,
    }),
    CustomerOnboardingAccessRestrictedError,
  );
  assert.equal(providerCalls, 0);
});

test("a restriction that wins after provider failure is not returned as success", async () => {
  const service = new CustomerWalletProvisioningService({
    store: storeWith({
      async prepareAuth0Wallet() {
        return prepared("provisioning");
      },
      async recordProviderStartFailure() {
        return Object.freeze({
          ...snapshot("restricted"),
          reasonFamily: "identity_provider_conflict",
        });
      },
    }),
    provider: {
      provider: "crossmint",
      async createWallet() {
        throw new Error("provider unavailable");
      },
    },
  });

  await assert.rejects(
    service.startAuth0Wallet({
      issuer: "https://tenant.example.test/",
      subject: "auth0|subject",
      idempotencyKey: "wallet-start-failure-restricted-001",
      consent: CONSENT,
    }),
    CustomerOnboardingAccessRestrictedError,
  );
});
