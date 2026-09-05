import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { readCrossmintSandboxWallet } from "../src/domain/crossmint-sandbox-read.mjs";

const input = {
  apiKey: "sk_staging_" + "a".repeat(32),
  address: "0x" + "B".repeat(40),
  expectedOwner: "userId:samra-sandbox-wallet-001",
};
const wallet = {
  address: input.address,
  owner: input.expectedOwner,
  chainType: "evm",
  type: "smart",
};
const json = (body) =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
  });

test("customer-controlled check requires the exact customer email recovery signer", async () => {
  const email = "recovery@example.test";
  const request = { ...input, expectedRecoveryEmail: email };
  const result = await readCrossmintSandboxWallet(request, {
    fetch: async () =>
      json({ ...wallet, config: { adminSigner: { type: "email", email } } }),
  });
  assert.equal(result.customerRecoveryVerified, true);
  assert.equal(result.operationalSignersVerified, false);
  assert.equal(result.transactionApprovalVerified, false);
  assert.equal(JSON.stringify(result).includes(email), false);
  for (const override of [
    { config: { adminSigner: { type: "server" } } },
    {
      config: {
        adminSigner: { type: "external-wallet", address: input.address },
      },
    },
    {
      config: {
        adminSigner: { type: "email", email: "someone-else@example.test" },
      },
    },
    { config: {} },
    { type: "mpc", config: { adminSigner: { type: "email", email } } },
  ]) {
    await assert.rejects(
      readCrossmintSandboxWallet(request, {
        fetch: async () => json({ ...wallet, ...override }),
      }),
      {
        message:
          "Crossmint sandbox recovery does not match the customer-controlled policy.",
      },
    );
  }
});

test("malformed private CLI input never appears in an error", () => {
  const privateInput = '{"apiKey":"sk_staging_private-do-not-print';
  const result = spawnSync(
    process.execPath,
    [
      new URL("./crossmint-sandbox-connection.mjs", import.meta.url).pathname,
      input.address,
      input.expectedOwner,
      "--customer-controlled",
    ],
    { input: privateInput + "\n", encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr.includes("private-do-not-print"), false);
  assert.match(result.stderr, /Invalid staging credential input/);
});

test("CLI rejects a production key without printing it", () => {
  const key = "sk_production_" + "b".repeat(32);
  const result = spawnSync(
    process.execPath,
    [
      new URL("./crossmint-sandbox-connection.mjs", import.meta.url).pathname,
      input.address,
      input.expectedOwner,
    ],
    { input: key + "\n", encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr.includes(key), false);
  assert.match(result.stderr, /staging server API key is required/);
});

test("one staging-only GET verifies identity and drops provider data", async () => {
  let calls = 0;
  const result = await readCrossmintSandboxWallet(input, {
    fetch: async (url, init) => {
      calls++;
      assert.equal(
        String(url),
        `https://staging.crossmint.com/api/2025-06-09/wallets/${input.address}`,
      );
      assert.equal(init.method, "GET");
      assert.equal(init.redirect, "error");
      assert.equal(init.headers["X-API-KEY"], input.apiKey);
      assert.equal(init.body, undefined);
      return json({
        ...wallet,
        config: { email: "private@example.test" },
        secret: input.apiKey,
      });
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.ownerVerified, true);
  assert.equal(result.runtimeConnected, false);
  assert.equal(result.financialCapabilityEnabled, false);
  assert.doesNotMatch(JSON.stringify(result), /private|secret|sk_staging/);
});

test("invalid credentials, destinations and owners fail before network access", async () => {
  for (const override of [
    { apiKey: "sk_production_" + "a".repeat(32) },
    { apiKey: "ck_staging_" + "a".repeat(32) },
    { address: "https://example.test" },
    { expectedOwner: "email:private@example.test" },
  ]) {
    await assert.rejects(
      readCrossmintSandboxWallet(
        { ...input, ...override },
        { fetch: () => assert.fail("network called") },
      ),
    );
  }
});

test("wrong wallet, malformed and oversized responses fail without leaking data", async () => {
  for (const response of [
    json({ ...wallet, owner: "userId:wrong" }),
    json({ ...wallet, address: "0x" + "c".repeat(40) }),
    json({ ...wallet, chainType: "solana" }),
    json({ ...wallet, type: "unexpected" }),
    new Response(input.apiKey, { status: 401 }),
    new Response(input.apiKey, { headers: { "content-type": "text/plain" } }),
    json({ ...wallet, extra: "x".repeat(65537) }),
    new Response("{", { headers: { "content-type": "application/json" } }),
  ]) {
    await assert.rejects(
      readCrossmintSandboxWallet(input, { fetch: async () => response }),
      (error) => {
        assert.equal(error.message.includes(input.apiKey), false);
        return true;
      },
    );
  }
  await assert.rejects(
    readCrossmintSandboxWallet(input, {
      fetch: async () => {
        throw new Error(input.apiKey);
      },
    }),
    { message: "Crossmint sandbox connection failed." },
  );
});
