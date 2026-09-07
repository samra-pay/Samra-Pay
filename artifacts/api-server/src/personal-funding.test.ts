import assert from "node:assert/strict";
import test from "node:test";
import type {
  PersonalFundingSnapshot,
  PersonalFundingStore,
} from "@workspace/db";
import {
  CrossmintOnrampAdapter,
  CrossmintOnrampUnavailableError,
} from "./domain/crossmint-onramp";
import {
  PersonalFundingService,
  PersonalFundingStatusService,
  type PersonalFundingProvider,
} from "./domain/personal-funding";

const address = `0x${"1".repeat(40)}`;
const providerOrderRef = "11111111-2222-4333-8444-555555555555";
const config = {
  environment: "staging" as const,
  apiKey: `sk_staging_${"synthetic".repeat(3)}`,
  receiptEmail: "pilot@samra.invalid",
};
const target = {
  environment: "staging" as const,
  walletAddress: address,
  providerWalletRef: `evm:${address}`,
};
const command = {
  issuer: "https://pilot.auth0.invalid/",
  subject: "auth0|synthetic-pilot",
  idempotencyKey: "pilot-command-0001",
  amountMinor: "1500",
};
const secret = "synthetic-checkout-secret-never-persist";
const receipt = () =>
  Response.json(
    {
      clientSecret: secret,
      order: { orderId: providerOrderRef },
      sensitiveProviderField: "discard-this",
    },
    { status: 201 },
  );

test("onramp creates a server-selected Base Sepolia USDC order with exact decimal money", async () => {
  let requests = 0;
  const adapter = new CrossmintOnrampAdapter(config, {
    fetch: async (url, init) => {
      requests++;
      assert.equal(url, "https://staging.crossmint.com/api/2022-06-09/orders");
      assert.equal(init!.method, "POST");
      assert.equal(init!.redirect, "error");
      assert.ok(init!.signal);
      assert.equal(new Headers(init!.headers).get("X-API-KEY"), config.apiKey);
      assert.deepEqual(JSON.parse(init!.body as string), {
        state: "create",
        locale: "en-US",
        recipient: { walletAddress: address },
        payment: {
          method: "card",
          currency: "usd",
          receiptEmail: config.receiptEmail,
        },
        lineItems: [
          {
            tokenLocator:
              "base-sepolia:0x036CbD53842c5426634e7929541eC2318f3dCF7e",
            executionParameters: { mode: "exact-in", amount: "0.01" },
          },
        ],
      });
      return receipt();
    },
  });
  assert.deepEqual(await adapter.createOrder({ ...target, amountMinor: "1" }), {
    providerOrderRef,
    clientSecret: secret,
  });
  assert.equal(requests, 1);
});

test("production configuration selects the production endpoint and native USDC without floating point", async () => {
  // Injected transport only: no live credential or provider request.
  const adapter = new CrossmintOnrampAdapter(
    {
      ...config,
      environment: "production",
      apiKey: `sk_production_${"synthetic".repeat(3)}`,
    },
    {
      fetch: async (url, init) => {
        assert.equal(url, "https://www.crossmint.com/api/2022-06-09/orders");
        const body = JSON.parse(init!.body as string);
        assert.equal(
          body.lineItems[0].tokenLocator,
          "base:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        );
        assert.equal(body.lineItems[0].executionParameters.amount, "19.99");
        return receipt();
      },
    },
  );
  await adapter.createOrder({
    ...target,
    environment: "production",
    amountMinor: "1999",
  });
});

test("invalid identities, networks, wallet references and money never reach the provider", async () => {
  let requests = 0;
  const adapter = new CrossmintOnrampAdapter(config, {
    fetch: async () => {
      requests++;
      return receipt();
    },
  });
  for (const change of [
    { environment: "production" as const },
    { walletAddress: `0x${"0".repeat(40)}` },
    { walletAddress: "email:other@samra.invalid" },
    { providerWalletRef: `evm:0x${"2".repeat(40)}` },
    ...[
      "0",
      "-1",
      "1.00",
      "01",
      "1e4",
      "2001",
      "9007199254740993",
      "1000000000000000000",
    ].map((amountMinor) => ({ amountMinor })),
  ])
    await assert.rejects(
      adapter.createOrder({ ...target, amountMinor: "100", ...change }),
      CrossmintOnrampUnavailableError,
    );
  assert.equal(requests, 0);
  assert.throws(
    () => new CrossmintOnrampAdapter({ ...config, environment: "production" }),
    /Invalid Crossmint/,
  );
  assert.throws(
    () => new CrossmintOnrampAdapter({ ...config, receiptEmail: "bad\nemail" }),
    /Invalid Crossmint/,
  );
});

test("provider failures, malformed responses and large bodies are bounded and redact sensitive text", async () => {
  const transports: (typeof fetch)[] = [
    async () => {
      throw new Error(config.apiKey + config.receiptEmail);
    },
    async () => new Response(config.apiKey, { status: 429 }),
    async () => new Response("{}", { status: 201 }),
    async () =>
      new Response("broken", {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    async () =>
      Response.json(
        { clientSecret: secret, order: { orderId: "not-a-reference" } },
        { status: 201 },
      ),
    async () =>
      Response.json(
        { clientSecret: "bad", order: { orderId: providerOrderRef } },
        { status: 201 },
      ),
    async () => Response.json({ extra: "x".repeat(65_536) }, { status: 201 }),
  ];
  for (const transport of transports) {
    let requests = 0;
    const adapter = new CrossmintOnrampAdapter(config, {
      fetch: async (...args) => {
        requests++;
        return transport(...args);
      },
    });
    await assert.rejects(
      adapter.createOrder({ ...target, amountMinor: "100" }),
      (error) => {
        assert.ok(error instanceof CrossmintOnrampUnavailableError);
        assert.equal(String(error).includes(config.apiKey), false);
        assert.equal(String(error).includes(config.receiptEmail), false);
        return true;
      },
    );
    assert.equal(requests, 1);
  }
});

function storeFixture() {
  let snapshot: PersonalFundingSnapshot | null = null;
  const outcomes: unknown[] = [];
  const store: PersonalFundingStore = {
    async reserve() {
      const dispatch = snapshot === null;
      snapshot ??= {
        orderId: providerOrderRef,
        amountMinor: command.amountMinor,
        currency: "USD",
        state: "reserved",
        environment: "staging",
        providerOrderRef: null,
        createdAt: new Date(0).toISOString(),
        progress: null,
        fundingConfirmed: false,
      };
      return { snapshot, target, dispatch };
    },
    async get() {
      return snapshot;
    },
    async recordOutcome(input) {
      outcomes.push(input);
      snapshot = { ...snapshot!, ...input.outcome };
    },
  };
  return { store, outcomes };
}

test("concurrent commands return one checkout and never persist the checkout bearer token", async () => {
  const { store, outcomes } = storeFixture();
  let requests = 0;
  const provider: PersonalFundingProvider = {
    environment: "staging",
    async createOrder() {
      requests++;
      return { providerOrderRef, clientSecret: secret };
    },
  };
  const service = new PersonalFundingService(store, provider);
  const results = await Promise.all(
    Array.from({ length: 8 }, () => service.start(command)),
  );
  assert.equal(requests, 1);
  assert.equal(results.filter((result) => result.checkout !== null).length, 1);
  assert.equal(JSON.stringify(outcomes).includes(secret), false);
  const resumed = await new PersonalFundingService(store, provider).start(
    command,
  );
  assert.equal(resumed.checkout, null);
  assert.equal(resumed.snapshot.state, "checkout_created");
  assert.equal(resumed.snapshot.fundingConfirmed, false);
  assert.equal(requests, 1);
});

test("ambiguous provider outcomes survive service restart without another purchase", async () => {
  const { store } = storeFixture();
  let requests = 0;
  const provider: PersonalFundingProvider = {
    environment: "staging",
    async createOrder() {
      requests++;
      throw new Error("sensitive vendor detail");
    },
  };
  assert.equal(
    (await new PersonalFundingService(store, provider).start(command)).snapshot
      .state,
    "provider_unknown",
  );
  const restart = new PersonalFundingService(store, provider);
  assert.equal((await restart.start(command)).checkout, null);
  assert.equal((await restart.resume(command))!.state, "provider_unknown");
  assert.equal(requests, 1);
});

test("a failed persistence commit withholds the checkout token and blocks redispatch", async () => {
  const { store } = storeFixture();
  let requests = 0;
  store.recordOutcome = async () => {
    throw new Error("database unavailable");
  };
  const provider: PersonalFundingProvider = {
    environment: "staging",
    async createOrder() {
      requests++;
      return { providerOrderRef, clientSecret: secret };
    },
  };
  await assert.rejects(
    new PersonalFundingService(store, provider).start(command),
    /database unavailable/,
  );
  assert.equal(
    (await new PersonalFundingService(store, provider).start(command)).checkout,
    null,
  );
  assert.equal(requests, 1);
});

test("order polling binds the saved reference and returns only normalized KYC/payment/delivery progress", async () => {
  for (const paymentStatus of [
    "requires-kyc",
    "manual-kyc",
    "failed-kyc",
    "awaiting-payment",
    "in-progress",
    "completed",
  ]) {
    const adapter = new CrossmintOnrampAdapter(config, {
      fetch: async (url, init) => {
        assert.equal(
          url,
          `https://staging.crossmint.com/api/2022-06-09/orders/${providerOrderRef}`,
        );
        assert.equal(init!.method, "GET");
        assert.equal(init!.body, undefined);
        assert.equal(init!.redirect, "error");
        assert.ok(init!.signal);
        assert.equal(
          new Headers(init!.headers).get("X-API-KEY"),
          config.apiKey,
        );
        return Response.json({
          clientSecret: secret,
          order: {
            orderId: providerOrderRef,
            payment: {
              status: paymentStatus,
              preparation: { kyc: { sensitive: "discard-this" } },
            },
            lineItems: [
              { delivery: { status: "completed", sensitive: "discard-this" } },
            ],
            receiptEmail: config.receiptEmail,
          },
        });
      },
    });
    assert.deepEqual(await adapter.readOrder(providerOrderRef), {
      paymentStatus,
      deliveryStatus: "completed",
    });
  }
  const unknown = new CrossmintOnrampAdapter(config, {
    fetch: async () =>
      Response.json({
        order: {
          orderId: providerOrderRef,
          payment: { status: "unrecognized-sensitive-value" },
          lineItems: [{ delivery: { status: "unrecognized-sensitive-value" } }],
        },
      }),
  });
  assert.deepEqual(await unknown.readOrder(providerOrderRef), {
    paymentStatus: "unknown",
    deliveryStatus: "unknown",
  });
});

test("status reads reject another order, unsupported payloads and provider failure without retrying", async () => {
  for (const response of [
    () =>
      Response.json({
        order: {
          orderId: "aaaaaaaa-2222-4333-8444-555555555555",
          payment: { status: "completed" },
          lineItems: [{}],
        },
      }),
    () =>
      Response.json({
        order: {
          orderId: providerOrderRef,
          payment: { status: "completed" },
          lineItems: [{}, {}],
        },
      }),
    () => Response.json({ id: "155", terms: {} }), // Known inconsistent GET documentation example must fail closed.
    () => Response.json({ order: { orderId: providerOrderRef, payment: {} } }),
    () => Response.json({ sensitive: "x".repeat(65_536) }),
    () => new Response(config.apiKey + secret, { status: 503 }),
  ]) {
    let calls = 0;
    const adapter = new CrossmintOnrampAdapter(config, {
      fetch: async () => {
        calls++;
        return response();
      },
    });
    await assert.rejects(adapter.readOrder(providerOrderRef), (error) => {
      assert.ok(error instanceof CrossmintOnrampUnavailableError);
      assert.ok(
        !String(error).includes(config.apiKey) &&
          !String(error).includes(secret),
      );
      return true;
    });
    assert.equal(calls, 1);
    await assert.rejects(
      adapter.readOrder("../another-order"),
      CrossmintOnrampUnavailableError,
    );
    assert.equal(calls, 1);
  }
});

test("returning funding progress cannot create or pay for another order and distinguishes unavailable reads", async () => {
  const { store } = storeFixture();
  const observations: unknown[] = [];
  const statusStore = {
    get: store.get,
    async recordProviderStatus(input: unknown) {
      observations.push(input);
    },
  };
  let calls = 0;
  let fail = false;
  const provider = {
    environment: "staging" as const,
    async readOrder(ref: string) {
      calls++;
      assert.equal(ref, providerOrderRef);
      if (fail) throw new Error(secret);
      return {
        paymentStatus: "completed" as const,
        deliveryStatus: "completed" as const,
      };
    },
  };
  const service = new PersonalFundingStatusService(statusStore, provider);
  assert.equal((await service.refresh(command)).providerRead, "not-requested");
  const reservation = await store.reserve({
    ...command,
    environment: "staging",
  });
  assert.equal((await service.refresh(command)).providerRead, "not-requested");
  assert.equal(calls, 0);
  await store.recordOutcome({
    orderId: reservation.snapshot.orderId,
    outcome: { state: "checkout_created", providerOrderRef },
  });
  const refreshed = await service.refresh(command);
  assert.equal(refreshed.providerRead, "updated");
  assert.equal(refreshed.snapshot!.fundingConfirmed, false);
  assert.equal(observations.length, 1);
  assert.equal(JSON.stringify(observations).includes(secret), false);
  fail = true;
  assert.equal((await service.refresh(command)).providerRead, "unavailable");
  assert.equal(observations.length, 1);
  await assert.rejects(
    new PersonalFundingStatusService(statusStore, {
      ...provider,
      environment: "production",
    }).refresh(command),
  );
  assert.equal(calls, 2);
  await assert.rejects(
    new PersonalFundingStatusService(
      {
        ...statusStore,
        get: async () => {
          throw new Error("Account denied");
        },
      },
      provider,
    ).refresh(command),
  );
  assert.equal(calls, 2);
  await new PersonalFundingStatusService(
    {
      ...statusStore,
      recordProviderStatus: async () => {
        throw new Error("revoked during read");
      },
    },
    {
      ...provider,
      readOrder: async () => ({
        paymentStatus: "manual-kyc",
        deliveryStatus: "not-reported",
      }),
    },
  )
    .refresh(command)
    .then(
      () => assert.fail("revocation must not return a successful refresh"),
      (error: Error) => assert.match(error.message, /revoked during read/),
    );
});
