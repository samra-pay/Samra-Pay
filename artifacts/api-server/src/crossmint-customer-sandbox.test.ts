import assert from "node:assert/strict";
import test from "node:test";
import { CrossmintCustomerSandboxAdapter } from "./domain/crossmint-customer-sandbox";
import { loadApiRuntimeConfig } from "./config";

const config = {
  mode: "crossmint-sandbox-customer" as const,
  apiKey: `sk_staging_${"a".repeat(32)}`,
  allowedCustomerId: `customer_${"1".repeat(32)}`,
  recoveryEmail: "tester@example.test",
};
const input = {
  walletId: `wallet_${"2".repeat(32)}`,
  ownerLocator: `userId:${config.allowedCustomerId}`,
  providerRequestKey: "3".repeat(64),
  asset: "USDC" as const,
  configurationVersion: "crossmint-sandbox-evm-customer-email-v1",
};
const address = `0x${"Ab".repeat(20)}`;
const response = () => ({
  owner: input.ownerLocator,
  chainType: "evm",
  type: "smart",
  address,
  config: { adminSigner: { type: "email", email: config.recoveryEmail } },
});

test("sandbox wallet creation uses a fixed staging endpoint, stable idempotency header, and tester recovery", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const adapter = new CrossmintCustomerSandboxAdapter(config, {
    fetch: async (url, init) => {
      calls.push({ url: String(url), init: init! });
      return Response.json(response());
    },
  });
  const first = await adapter.createWallet(input);
  assert.deepEqual(await adapter.createWallet(input), first);
  assert.deepEqual(first, {
    providerWalletRef: `evm:${address.toLowerCase()}`,
    network: "evm",
    custodyModel: "smart-customer-email-recovery",
    publicAddress: address.toLowerCase(),
    configurationVersion: input.configurationVersion,
  });
  assert.equal(calls.length, 2);
  for (const { url, init } of calls) {
    assert.equal(url, "https://staging.crossmint.com/api/2025-06-09/wallets");
    assert.equal(init.method, "POST");
    assert.equal(init.redirect, "error");
    assert.ok(init.signal instanceof AbortSignal);
    assert.equal(
      new Headers(init.headers).get("x-idempotency-key"),
      input.providerRequestKey,
    );
    assert.deepEqual(JSON.parse(String(init.body)), {
      owner: input.ownerLocator,
      chainType: "evm",
      type: "smart",
      config: { adminSigner: { type: "email", email: config.recoveryEmail } },
    });
  }
  assert.doesNotMatch(JSON.stringify(first), /tester@example|sk_staging/);
});

test("unapproved customers and request configurations never reach Crossmint", async () => {
  let calls = 0;
  const adapter = new CrossmintCustomerSandboxAdapter(config, {
    fetch: async () => {
      calls++;
      throw new Error("unexpected request");
    },
  });
  for (const override of [
    { ownerLocator: "userId:someone-else" },
    { walletId: "invalid" },
    { providerRequestKey: "invalid" },
    { configurationVersion: "crossmint-synthetic-v1" },
    { asset: "ETH" as "USDC" },
  ])
    await assert.rejects(
      adapter.createWallet({ ...input, ...override }),
      /not approved/,
    );
  assert.equal(calls, 0);
  assert.throws(
    () =>
      new CrossmintCustomerSandboxAdapter({
        ...config,
        apiKey: "sk_production_secret",
      }),
    /Invalid/,
  );
});

test("wrong ownership, server authority, unexpected delegates, and invalid provider output fail closed", async () => {
  const bad = [
    null,
    [],
    {},
    { ...response(), owner: "userId:other" },
    { ...response(), type: "mpc" },
    { ...response(), chainType: "solana" },
    { ...response(), address: "invalid" },
    { ...response(), config: { adminSigner: { type: "api-key" } } },
    {
      ...response(),
      config: { adminSigner: { type: "email", email: "other@example.test" } },
    },
    { ...response(), delegatedSigners: [{ type: "api-key" }] },
    {
      ...response(),
      config: { ...response().config, delegatedSigners: "invalid" },
    },
  ];
  for (const value of bad) {
    const adapter = new CrossmintCustomerSandboxAdapter(config, {
      fetch: async () => Response.json(value),
    });
    await assert.rejects(adapter.createWallet(input), {
      message: "Customer-controlled Crossmint sandbox wallet creation failed.",
    });
  }
});

test("provider errors and oversized bodies never expose credentials or upstream content", async () => {
  const fetchers: (typeof fetch)[] = [
    async () => {
      throw new Error(config.apiKey);
    },
    async () => new Response(config.apiKey, { status: 403 }),
    async () =>
      new Response("{}", { headers: { "content-type": "text/plain" } }),
    async () =>
      new Response("invalid", {
        headers: { "content-type": "application/json" },
      }),
    async () => Response.json({ data: "a".repeat(65537) }),
  ];
  for (const fetch of fetchers)
    await assert.rejects(
      new CrossmintCustomerSandboxAdapter(config, { fetch }).createWallet(
        input,
      ),
      {
        message:
          "Customer-controlled Crossmint sandbox wallet creation failed.",
      },
    );
});

test("runtime sandbox mode is opt-in, staging-only, authenticated, persistent, and has no dev controls", () => {
  assert.deepEqual(loadApiRuntimeConfig({}).customerWalletProvider, {
    mode: "fake",
  });
  const environment = {
    NODE_ENV: "test",
    SAMRA_BACKEND_MODE: "demo",
    SAMRA_PERSISTENCE_MODE: "postgres",
    SAMRA_DEPLOYMENT_ENVIRONMENT: "staging",
    SAMRA_CUSTOMER_AUTH_MODE: "auth0",
    AUTH0_ISSUER_BASE_URL: "https://example.us.auth0.com",
    AUTH0_AUDIENCE: "https://api.example.test",
    SAMRA_CUSTOMER_WALLET_PROVIDER_MODE: config.mode,
    CROSSMINT_SERVER_API_KEY: config.apiKey,
    CROSSMINT_SANDBOX_CUSTOMER_ID: config.allowedCustomerId,
    CROSSMINT_SANDBOX_RECOVERY_EMAIL: config.recoveryEmail,
  };
  const loaded = loadApiRuntimeConfig(environment);
  assert.deepEqual(loaded.customerWalletProvider, config);
  assert.equal(loaded.devControlsEnabled, false);
  assert.equal(loaded.runWorker, false);
  for (const override of [
    { SAMRA_DEPLOYMENT_ENVIRONMENT: "production" },
    { SAMRA_CUSTOMER_AUTH_MODE: "disabled" },
    { SAMRA_PERSISTENCE_MODE: "memory" },
    { SAMRA_RUN_WORKER: "true" },
    { SAMRA_INTERNAL_OPERATIONS_ENABLED: "true" },
    { CROSSMINT_SERVER_API_KEY: "sk_production_secret" },
    { CROSSMINT_SANDBOX_CUSTOMER_ID: "email:tester@example.test" },
    { CROSSMINT_SANDBOX_RECOVERY_EMAIL: "invalid" },
    { CROSSMINT_SERVER_API_KEY: "" },
    { SAMRA_CUSTOMER_WALLET_PROVIDER_MODE: "crossmint-production" },
  ])
    assert.throws(() => loadApiRuntimeConfig({ ...environment, ...override }));
});
