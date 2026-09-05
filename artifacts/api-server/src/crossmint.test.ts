import assert from "node:assert/strict";
import test from "node:test";
import {
  CrossmintSandboxAdapter,
  type CrossmintSandboxAdapterConfig,
} from "./domain/crossmint";

const API_KEY = "crossmint_sandbox_server_key_123456789";
const CONFIGURATION_VERSION = "crossmint-sandbox-customer-recovery-v1";
const OWNER = "userId:customer_00000000000000000000000000000001";
const WALLET_ID = "wallet_00000000000000000000000000000001";
const REQUEST_KEY = "a".repeat(64);
const RECOVERY_EMAIL = "synthetic-customer@example.test";
const resolveCustomerRecovery = async (ownerLocator: string) => ({
  ownerLocator,
  type: "email" as const,
  email: RECOVERY_EMAIL,
});
const WALLET_ADDRESS = `0x${"B".repeat(40)}`;

function smartConfig(
  overrides: Partial<CrossmintSandboxAdapterConfig> = {},
): CrossmintSandboxAdapterConfig {
  return Object.freeze({
    apiKey: API_KEY,
    apiVersion: "2025-06-09",
    chainType: "evm",
    walletType: "smart",
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
        type: "email",
        email: RECOVERY_EMAIL,
      },
    },
    ...overrides,
  };
}

test("Crossmint sandbox create sends opaque owner and customer recovery with idempotency", async () => {
  let observedUrl = "";
  let observedInit: RequestInit | undefined;
  const adapter = new CrossmintSandboxAdapter(smartConfig(), {
    resolveCustomerRecovery,
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
        type: "email",
        email: RECOVERY_EMAIL,
      },
    },
    owner: OWNER,
  });
  assert.doesNotMatch(
    String(observedInit?.body),
    /phone|first.name|last.name|birth|auth0|token|api.key/iu,
  );
  assert.equal(String(observedInit?.body).includes(API_KEY), false);
  assert.deepEqual(result, {
    providerWalletRef: `evm:${WALLET_ADDRESS.toLowerCase()}`,
    network: "evm",
    custodyModel: "smart-customer-recovery-pending-passkey",
    publicAddress: WALLET_ADDRESS.toLowerCase(),
    configurationVersion: CONFIGURATION_VERSION,
  });
});

test("Crossmint rejects MPC and server/global signer configurations before any request", () => {
  for (const invalid of [
    { ...smartConfig(), walletType: "mpc" },
    { ...smartConfig(), adminSigner: { type: "server" } },
    {
      ...smartConfig(),
      adminSigner: { type: "external-wallet", address: `0x${"a".repeat(40)}` },
    },
  ]) {
    assert.throws(
      () =>
        new CrossmintSandboxAdapter(invalid as never, {
          resolveCustomerRecovery,
          fetch: async () => {
            assert.fail("must not call provider");
          },
        }),
    );
  }
});

test("Crossmint recovery enrollment must belong to the requested customer", async () => {
  for (const resolved of [
    { ownerLocator: OWNER + "other", type: "email", email: RECOVERY_EMAIL },
    { ownerLocator: OWNER, type: "server", email: RECOVERY_EMAIL },
    { ownerLocator: OWNER, type: "email", email: "not-an-email" },
  ]) {
    const adapter = new CrossmintSandboxAdapter(smartConfig(), {
      resolveCustomerRecovery: async () => resolved as never,
      fetch: async () => {
        assert.fail("must not call provider");
      },
    });
    await assert.rejects(
      adapter.createWallet(createInput()),
      /wallet creation failed/,
    );
  }
});

test("Crossmint resolves recovery per customer and preserves retry identity", async () => {
  const owners: string[] = [];
  const requests: Array<{ owner: string; email: string; key: string | null }> =
    [];
  const adapter = new CrossmintSandboxAdapter(smartConfig(), {
    resolveCustomerRecovery: async (ownerLocator) => {
      owners.push(ownerLocator);
      return {
        ownerLocator,
        type: "email",
        email: ownerLocator === OWNER ? RECOVERY_EMAIL : "second@example.test",
      };
    },
    fetch: async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      requests.push({
        owner: body.owner,
        email: body.config.adminSigner.email,
        key: new Headers(init?.headers).get("x-idempotency-key"),
      });
      return jsonResponse(
        smartResponse({ owner: body.owner, config: body.config }),
        200,
      );
    },
  });
  const first = await adapter.createWallet(createInput());
  assert.deepEqual(await adapter.createWallet(createInput()), first);
  await adapter.createWallet({
    ...createInput(),
    ownerLocator: `userId:customer_${"2".repeat(32)}`,
    walletId: `wallet_${"2".repeat(32)}`,
    providerRequestKey: "b".repeat(64),
  });
  assert.deepEqual(requests[0], requests[1]);
  assert.notEqual(requests[0]?.email, requests[2]?.email);
  assert.equal(owners.length, 3);
  assert.equal(JSON.stringify(first).includes(RECOVERY_EMAIL), false);
});

test("Crossmint sandbox rejects unapproved configuration and non-opaque commands before fetch", async () => {
  for (const config of [
    smartConfig({ apiKey: "contains whitespace" }),
    smartConfig({ apiVersion: "2025-01-01" as never }),
    smartConfig({ configurationVersion: "crossmint-production-v1" as never }),
    smartConfig({ requestTimeoutMilliseconds: 4_001 }),
  ]) {
    assert.throws(
      () => new CrossmintSandboxAdapter(config, { resolveCustomerRecovery }),
    );
  }

  let fetchCalls = 0;
  const adapter = new CrossmintSandboxAdapter(smartConfig(), {
    resolveCustomerRecovery,
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
    jsonResponse(
      smartResponse({ config: { adminSigner: { type: "server" } } }),
    ),
    jsonResponse(
      smartResponse({
        config: {
          adminSigner: { type: "email", email: RECOVERY_EMAIL },
          delegatedSigners: [{ type: "server" }],
        },
      }),
    ),
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
            type: "email",
            email: "different@example.test",
          },
        },
      }),
    ),
  ];

  for (const response of failureResponses) {
    const adapter = new CrossmintSandboxAdapter(smartConfig(), {
      resolveCustomerRecovery,
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
    resolveCustomerRecovery,
    fetch: async () => {
      throw new Error(`network detail ${API_KEY}`);
    },
  });
  await assert.rejects(networkFailure.createWallet(createInput()), {
    message: "Crossmint sandbox wallet creation failed.",
  });
});

test("Crossmint sanitizes recovery resolver failures", async () => {
  const adapter = new CrossmintSandboxAdapter(smartConfig(), {
    resolveCustomerRecovery: async () => {
      throw new Error(RECOVERY_EMAIL);
    },
    fetch: async () => {
      assert.fail("must not call provider");
    },
  });
  await assert.rejects(adapter.createWallet(createInput()), {
    message: "Crossmint sandbox wallet creation failed.",
  });
});

test("Crossmint pins customer and retry identity while recovery enrollment is loading", async () => {
  const mutable = {
    ...createInput(),
    ownerLocator: OWNER as string,
    configurationVersion: CONFIGURATION_VERSION as string,
  };
  let observedBody: unknown;
  let observedKey: string | null = null;
  const adapter = new CrossmintSandboxAdapter(smartConfig(), {
    resolveCustomerRecovery: async (ownerLocator) => {
      mutable.ownerLocator = `userId:customer_${"2".repeat(32)}`;
      mutable.providerRequestKey = "b".repeat(64);
      mutable.configurationVersion = "changed";
      return resolveCustomerRecovery(ownerLocator);
    },
    fetch: async (_url, init) => {
      observedBody = JSON.parse(String(init?.body));
      observedKey = new Headers(init?.headers).get("x-idempotency-key");
      return jsonResponse(smartResponse());
    },
  });
  await adapter.createWallet(mutable);
  assert.equal((observedBody as { owner: string }).owner, OWNER);
  assert.equal(observedKey, REQUEST_KEY);
});

test("Crossmint cancels oversized response streams without buffering the whole body", async () => {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(new Uint8Array(32 * 1024 + 1));
    },
    cancel() {
      cancelled = true;
    },
  });
  const adapter = new CrossmintSandboxAdapter(smartConfig(), {
    resolveCustomerRecovery,
    fetch: async () =>
      new Response(body, {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
  });
  await assert.rejects(adapter.createWallet(createInput()), {
    message: "Crossmint sandbox wallet creation failed.",
  });
  assert.equal(cancelled, true);
});

test("Crossmint rejects unexpected operational signers and malformed signer lists", async () => {
  for (const signers of [
    [{ type: "device" }],
    [{ type: "passkey" }],
    null,
    {},
  ]) {
    const adapter = new CrossmintSandboxAdapter(smartConfig(), {
      resolveCustomerRecovery,
      fetch: async () =>
        jsonResponse(
          smartResponse({
            config: {
              adminSigner: { type: "email", email: RECOVERY_EMAIL },
              signers,
            },
          }),
        ),
    });
    await assert.rejects(adapter.createWallet(createInput()), {
      message: "Crossmint sandbox wallet creation failed.",
    });
  }
});
