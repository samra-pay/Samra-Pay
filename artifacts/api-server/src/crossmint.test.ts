import assert from "node:assert/strict";
import test from "node:test";
import {
  CrossmintSandboxAdapter,
  type CrossmintSandboxAdapterConfig,
} from "./domain/crossmint";

const API_KEY = "crossmint_sandbox_server_key_123456789";
const CONFIGURATION_VERSION = "crossmint-sandbox-evm-smart-v1";
const OWNER = "userId:customer_00000000000000000000000000000001";
const WALLET_ID = "wallet_00000000000000000000000000000001";
const REQUEST_KEY = "a".repeat(64);
const SIGNER_ADDRESS = `0x${"a".repeat(40)}`;
const WALLET_ADDRESS = `0x${"B".repeat(40)}`;

function smartConfig(
  overrides: Partial<CrossmintSandboxAdapterConfig> = {},
): CrossmintSandboxAdapterConfig {
  return Object.freeze({
    apiKey: API_KEY,
    apiVersion: "2025-06-09",
    chainType: "evm",
    walletType: "smart",
    adminSigner: Object.freeze({
      type: "external-wallet" as const,
      address: SIGNER_ADDRESS,
    }),
    configurationVersion: CONFIGURATION_VERSION,
    ...overrides,
  });
}

function createInput() {
  return Object.freeze({
    walletId: WALLET_ID,
    ownerLocator: OWNER,
    providerRequestKey: REQUEST_KEY,
    asset: "USDC" as const,
    configurationVersion: CONFIGURATION_VERSION,
  });
}

function jsonResponse(value: unknown, status = 201): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function smartResponse(overrides: Record<string, unknown> = {}) {
  return {
    chainType: "evm",
    type: "smart",
    address: WALLET_ADDRESS,
    owner: OWNER,
    config: {
      adminSigner: {
        type: "external-wallet",
        address: SIGNER_ADDRESS.toUpperCase().replace("0X", "0x"),
      },
    },
    ...overrides,
  };
}

test("Crossmint sandbox smart-wallet create sends one opaque, idempotent server request", async () => {
  let observedUrl = "";
  let observedInit: RequestInit | undefined;
  const adapter = new CrossmintSandboxAdapter(smartConfig(), {
    fetch: async (input, init) => {
      observedUrl = String(input);
      observedInit = init;
      return jsonResponse(smartResponse());
    },
  });

  const result = await adapter.createWallet(createInput());

  assert.equal(
    observedUrl,
    "https://staging.crossmint.com/api/2025-06-09/wallets",
  );
  assert.equal(observedInit?.method, "POST");
  assert.equal(observedInit?.redirect, "error");
  assert.ok(observedInit?.signal instanceof AbortSignal);
  const headers = new Headers(observedInit?.headers);
  assert.equal(headers.get("x-api-key"), API_KEY);
  assert.equal(headers.get("x-idempotency-key"), REQUEST_KEY);
  assert.equal(headers.get("content-type"), "application/json");
  assert.deepEqual(JSON.parse(String(observedInit?.body)), {
    chainType: "evm",
    type: "smart",
    config: {
      adminSigner: {
        type: "external-wallet",
        address: SIGNER_ADDRESS,
      },
    },
    owner: OWNER,
  });
  assert.doesNotMatch(
    String(observedInit?.body),
    /email|phone|first.name|last.name|birth|auth0|token|api.key/iu,
  );
  assert.equal(String(observedInit?.body).includes(API_KEY), false);
  assert.deepEqual(result, {
    providerWalletRef: `evm:${WALLET_ADDRESS.toLowerCase()}`,
    network: "evm",
    custodyModel: "smart-external-wallet",
    publicAddress: WALLET_ADDRESS.toLowerCase(),
    configurationVersion: CONFIGURATION_VERSION,
  });
});

test("Crossmint sandbox accepts a 200 idempotent replay for an MPC wallet", async () => {
  const adapter = new CrossmintSandboxAdapter(
    {
      apiKey: API_KEY,
      apiVersion: "2025-06-09",
      chainType: "evm",
      walletType: "mpc",
      configurationVersion: "crossmint-sandbox-evm-mpc-v1",
    },
    {
      fetch: async (_input, init) => {
        assert.deepEqual(JSON.parse(String(init?.body)), {
          chainType: "evm",
          type: "mpc",
          owner: OWNER,
        });
        return jsonResponse(
          {
            chainType: "evm",
            type: "mpc",
            address: WALLET_ADDRESS,
            owner: OWNER,
          },
          200,
        );
      },
    },
  );

  const result = await adapter.createWallet({
    ...createInput(),
    configurationVersion: "crossmint-sandbox-evm-mpc-v1",
  });
  assert.equal(result.custodyModel, "mpc");
  assert.equal(result.providerWalletRef, `evm:${WALLET_ADDRESS.toLowerCase()}`);
});

test("Crossmint sandbox supports an explicitly reviewed server signer without choosing it by default", async () => {
  const adapter = new CrossmintSandboxAdapter(
    smartConfig({
      adminSigner: Object.freeze({ type: "server" as const }),
      configurationVersion: "crossmint-sandbox-evm-server-v1",
    }),
    {
      fetch: async (_input, init) => {
        assert.deepEqual(JSON.parse(String(init?.body)), {
          chainType: "evm",
          type: "smart",
          config: { adminSigner: { type: "server" } },
          owner: OWNER,
        });
        return jsonResponse(
          smartResponse({
            config: { adminSigner: { type: "server" } },
          }),
        );
      },
    },
  );

  const result = await adapter.createWallet({
    ...createInput(),
    configurationVersion: "crossmint-sandbox-evm-server-v1",
  });
  assert.equal(result.custodyModel, "smart-server-signer");
});

test("Crossmint sandbox rejects unapproved configuration and non-opaque commands before fetch", async () => {
  for (const config of [
    smartConfig({ apiKey: "contains whitespace" }),
    smartConfig({ apiVersion: "2025-01-01" as never }),
    smartConfig({ configurationVersion: "crossmint-production-v1" }),
    smartConfig({ requestTimeoutMilliseconds: 4_001 }),
    smartConfig({
      adminSigner: {
        type: "external-wallet",
        address: "not-an-address",
      },
    }),
  ]) {
    assert.throws(() => new CrossmintSandboxAdapter(config));
  }

  let fetchCalls = 0;
  const adapter = new CrossmintSandboxAdapter(smartConfig(), {
    fetch: async () => {
      fetchCalls += 1;
      return jsonResponse(smartResponse());
    },
  });
  for (const input of [
    { ...createInput(), walletId: "wallet_wrong" },
    { ...createInput(), ownerLocator: "email:customer@example.test" },
    { ...createInput(), providerRequestKey: "short" },
    { ...createInput(), configurationVersion: "crossmint-sandbox-other-v1" },
  ]) {
    await assert.rejects(adapter.createWallet(input));
  }
  assert.equal(fetchCalls, 0);
});

test("Crossmint sandbox fails closed without leaking provider bodies or credentials", async () => {
  const failureResponses = [
    new Response(`provider detail ${API_KEY}`, { status: 401 }),
    new Response("not-json", {
      status: 201,
      headers: { "content-type": "application/json" },
    }),
    new Response("{}", {
      status: 201,
      headers: {
        "content-type": "text/plain",
      },
    }),
    new Response("{}", {
      status: 201,
      headers: {
        "content-type": "application/json",
        "content-length": String(64 * 1024 + 1),
      },
    }),
    jsonResponse(smartResponse({ owner: `${OWNER}-different` })),
    jsonResponse(smartResponse({ type: "mpc" })),
    jsonResponse(smartResponse({ address: "0xwrong" })),
    jsonResponse(
      smartResponse({
        config: {
          adminSigner: {
            type: "external-wallet",
            address: `0x${"c".repeat(40)}`,
          },
        },
      }),
    ),
  ];

  for (const response of failureResponses) {
    const adapter = new CrossmintSandboxAdapter(smartConfig(), {
      fetch: async () => response,
    });
    await assert.rejects(adapter.createWallet(createInput()), (error) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, "Crossmint sandbox wallet creation failed.");
      assert.equal(error.message.includes(API_KEY), false);
      assert.doesNotMatch(error.message, /provider detail/iu);
      return true;
    });
  }

  const networkFailure = new CrossmintSandboxAdapter(smartConfig(), {
    fetch: async () => {
      throw new Error(`network detail ${API_KEY}`);
    },
  });
  await assert.rejects(networkFailure.createWallet(createInput()), {
    message: "Crossmint sandbox wallet creation failed.",
  });
});
