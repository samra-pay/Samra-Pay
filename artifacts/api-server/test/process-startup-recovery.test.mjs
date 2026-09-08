import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import test from "node:test";

const connectionString = process.env.TEST_DATABASE_URL;

test("compiled disabled API serves probes without a database and drains cleanly on SIGTERM", async () => {
  let running;
  try {
    running = await startApi({ backendMode: "disabled" });
    assert.deepEqual(await getJson(running.origin, "/api/healthz"), {
      status: "ok",
    });
    assert.deepEqual(await getJson(running.origin, "/api/readyz"), {
      status: "ready",
    });
    const financial = await fetch(`${running.origin}/api/v1/accounts`);
    assert.equal(financial.status, 503);
    await financial.arrayBuffer();
    await stopApi(running);
    running = undefined;
  } finally {
    await forceStop(running);
  }
});

test(
  "compiled PostgreSQL API starts ready, drains on SIGTERM, and recovers idempotently",
  {
    timeout: 30_000,
    skip: connectionString
      ? false
      : "TEST_DATABASE_URL is required for PostgreSQL process recovery.",
  },
  async () => {
    const idempotencyKey = `compiled-restart-${Date.now()}`;
    let first;
    let restarted;
    try {
      first = await startApi();
      assert.deepEqual(await getJson(first.origin, "/api/healthz"), {
        status: "ok",
      });
      assert.deepEqual(await getJson(first.origin, "/api/readyz"), {
        status: "ready",
      });

      const accounts = await getJson(first.origin, "/api/v1/accounts");
      const beneficiaries = await getJson(
        first.origin,
        "/api/v1/beneficiaries",
      );
      assert.equal(accounts.length, 1);
      assert.ok(beneficiaries.length >= 1);
      const account = accounts[0];
      const startingBookMinor = BigInt(account.bookBalance.minorUnits);
      const startingAvailableMinor = BigInt(
        account.availableBalance.minorUnits,
      );
      const beneficiary = beneficiaries[0];
      const quote = await requestJson(
        first.origin,
        "/api/v1/remittance/quotes",
        {
          method: "POST",
          body: {
            sourceAccountId: account.id,
            beneficiaryId: beneficiary.id,
            sendAmount: { currency: "USD", minorUnits: "10000" },
            fundingMethod: "samra_balance",
            deliveryMethod: beneficiary.deliveryDetails.method,
          },
          expectedStatus: 201,
        },
      );
      const created = await requestJson(
        first.origin,
        "/api/v1/remittance/transfers",
        {
          method: "POST",
          headers: { "Idempotency-Key": idempotencyKey },
          body: { quoteId: quote.id },
          expectedStatus: 201,
        },
      );
      assert.equal(created.status, "submitted");

      await stopApi(first);
      first = undefined;

      restarted = await startApi();
      assert.deepEqual(await getJson(restarted.origin, "/api/readyz"), {
        status: "ready",
      });
      const recovered = await getJson(
        restarted.origin,
        `/api/v1/remittance/transfers/${created.id}`,
      );
      assert.equal(recovered.id, created.id);
      assert.equal(recovered.status, "submitted");

      const replay = await requestJson(
        restarted.origin,
        "/api/v1/remittance/transfers",
        {
          method: "POST",
          headers: { "Idempotency-Key": idempotencyKey },
          body: { quoteId: quote.id },
          expectedStatus: 201,
        },
      );
      assert.equal(replay.id, created.id);
      const recoveredAccounts = await getJson(
        restarted.origin,
        "/api/v1/accounts",
      );
      assert.deepEqual(recoveredAccounts[0].bookBalance, {
        currency: "USD",
        minorUnits: startingBookMinor.toString(),
      });
      assert.deepEqual(recoveredAccounts[0].availableBalance, {
        currency: "USD",
        minorUnits: (startingAvailableMinor - 10_300n).toString(),
      });

      await stopApi(restarted);
      restarted = undefined;
    } finally {
      await forceStop(first);
      await forceStop(restarted);
    }
  },
);

async function availablePort() {
  const probe = createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const address = probe.address();
  assert.ok(address && typeof address === "object");
  const { port } = address;
  probe.close();
  await once(probe, "close");
  return port;
}

async function startApi({ backendMode = "demo" } = {}) {
  const port = await availablePort();
  const logs = [];
  const child = spawn(
    process.execPath,
    ["--enable-source-maps", "./dist/index.mjs"],
    {
      cwd: new URL("..", import.meta.url),
      env: {
        ...process.env,
        DATABASE_URL: backendMode === "demo" ? connectionString : undefined,
        NODE_ENV: "production",
        PORT: String(port),
        SAMRA_BACKEND_MODE: backendMode,
        SAMRA_INTERNAL_OPERATIONS_ENABLED: "false",
        SAMRA_PERSISTENCE_MODE: "postgres",
        SAMRA_PROVIDER_MODE: "fake",
        SAMRA_RUN_WORKER: "false",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  for (const stream of [child.stdout, child.stderr]) {
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => {
      logs.push(chunk);
      if (logs.join("").length > 20_000) logs.shift();
    });
  }

  const origin = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`API exited before readiness:\n${logs.join("")}`);
    }
    try {
      const response = await fetch(`${origin}/api/readyz`);
      if (response.status === 200) return { child, logs, origin };
    } catch {
      // The compiled process has not opened its socket yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`API readiness timed out:\n${logs.join("")}`);
}

async function stopApi(running) {
  running.child.kill("SIGTERM");
  let timeout;
  const timedOut = new Promise((_, reject) => {
    timeout = setTimeout(
      () => reject(new Error("Graceful shutdown timed out")),
      12_000,
    );
  });
  const [code, signal] = await Promise.race([
    once(running.child, "exit"),
    timedOut,
  ]).finally(() => clearTimeout(timeout));
  assert.equal(signal, null, running.logs.join(""));
  assert.equal(code, 0, running.logs.join(""));
}

async function forceStop(running) {
  if (!running || running.child.exitCode !== null) return;
  running.child.kill("SIGKILL");
  await once(running.child, "exit");
}

function getJson(origin, path) {
  return requestJson(origin, path, { expectedStatus: 200 });
}

async function requestJson(
  origin,
  path,
  { method = "GET", headers = {}, body, expectedStatus },
) {
  const response = await fetch(`${origin}${path}`, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const responseBody = await response.json();
  assert.equal(
    response.status,
    expectedStatus,
    `${method} ${path}: ${JSON.stringify(responseBody)}`,
  );
  return responseBody;
}
