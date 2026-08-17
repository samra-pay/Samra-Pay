import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { createApp } from "../src/app";
import type { ApiRuntimeConfig } from "../src/config";
import { createConfiguredDemoRuntime } from "../src/domain/create-demo-runtime";
import type { DemoRuntime } from "../src/domain/demo-runtime";

const connectionString = process.env["TEST_DATABASE_URL"];
if (!connectionString) {
  throw new Error(
    "TEST_DATABASE_URL is required for the PostgreSQL HTTP acceptance test.",
  );
}

const postgresConfig: ApiRuntimeConfig = Object.freeze({
  backendMode: "demo",
  providerMode: "fake",
  persistenceMode: "postgres",
  devControlsEnabled: true,
  runWorker: false,
  workerIntervalMilliseconds: 5,
  internalOperationsEnabled: true,
});

const operationsHeaders = Object.freeze({
  "X-Demo-Operator-Id": "demo_cs_agent_001",
  "X-Demo-Operator-Role": "support_readonly",
});

type JsonObject = Record<string, unknown>;
type ApiResponse = Readonly<{ status: number; body: unknown }>;
type RunningServer = Readonly<{
  origin: string;
  server: Server;
  runtime: DemoRuntime;
}>;

test("the HTTP API uses PostgreSQL as durable balance truth across concurrency, restart, reconciliation, and refund", async () => {
  const originalDatabaseUrl = process.env["DATABASE_URL"];
  process.env["DATABASE_URL"] = connectionString;
  const running: RunningServer[] = [];

  try {
    const first = await startServer();
    const concurrent = await startServer();
    running.push(first, concurrent);

    assertAccount(await getAccount(first.origin), "425000", "425000");
    const seededBeneficiaries = arrayBody(
      await apiRequest(first.origin, "/api/v1/beneficiaries"),
      200,
    );
    assert.deepEqual(
      seededBeneficiaries.map((item) => item["id"]),
      ["beneficiary_bank_001", "beneficiary_wallet_001"],
    );
    assert.deepEqual(seededBeneficiaries[0]?.["deliveryDetails"], {
      method: "bank",
      bankId: "cbe",
      institutionName: "Commercial Bank of Ethiopia",
      accountNumberLast4: "6789",
    });
    const actorBRead = await apiRequest(
      first.origin,
      "/api/v1/beneficiaries/beneficiary_bank_001",
      { headers: { "x-demo-actor-id": "demo_customer_002" } },
    );
    assert.equal(actorBRead.status, 404);

    const [createdBankResponse, createdWalletResponse] = await Promise.all([
      apiRequest(first.origin, "/api/v1/beneficiaries", {
        method: "POST",
        body: {
          displayName: "Durable Bank Recipient",
          city: "Adama",
          countryCode: "ET",
          deliveryDetails: {
            method: "bank",
            bankId: "awash",
            accountNumber: "200000005678",
          },
        },
      }),
      apiRequest(concurrent.origin, "/api/v1/beneficiaries", {
        method: "POST",
        body: {
          displayName: "Durable Wallet Recipient",
          city: "Mekelle",
          countryCode: "ET",
          deliveryDetails: {
            method: "wallet",
            walletId: "cbebirr",
            phoneNumber: "+251933335678",
          },
        },
      }),
    ]);
    const durableBank = objectBody(createdBankResponse, 201);
    const durableWallet = objectBody(createdWalletResponse, 201);
    const durableBankId = String(durableBank["id"]);
    const durableWalletId = String(durableWallet["id"]);
    assert.notEqual(durableBankId, durableWalletId);
    const quote = objectBody(
      await createQuote(first.origin, "10000", "beneficiary_bank_001", "bank"),
      201,
    );
    assert.deepEqual(quote["feeAmount"], {
      currency: "USD",
      minorUnits: "300",
    });
    assert.deepEqual(quote["totalDebit"], {
      currency: "USD",
      minorUnits: "10300",
    });

    const [createdA, createdB] = await Promise.all([
      createTransfer(
        first.origin,
        String(quote["id"]),
        "http-concurrent-create-key",
      ),
      createTransfer(
        concurrent.origin,
        String(quote["id"]),
        "http-concurrent-create-key",
      ),
    ]);
    const transferA = objectBody(createdA, 201);
    const transferB = objectBody(createdB, 201);
    assert.equal(transferA["id"], transferB["id"]);
    assert.equal(transferA["status"], "submitted");
    const transferId = String(transferA["id"]);
    assertAccount(await getAccount(concurrent.origin), "425000", "414700");

    const hiddenOperations = await apiRequest(
      first.origin,
      "/api/v1/internal/operations/summary",
    );
    assert.equal(hiddenOperations.status, 404);
    const operationsSummary = objectBody(
      await apiRequest(first.origin, "/api/v1/internal/operations/summary", {
        headers: operationsHeaders,
      }),
      200,
    );
    assert.ok(
      Number(
        (operationsSummary["transfers"] as JsonObject)["submitted"] ?? 0,
      ) >= 1,
    );
    assert.equal(
      Number((operationsSummary["customers"] as JsonObject)["active"] ?? 0),
      2,
    );
    const operationsCustomers = arrayBody(
      await apiRequest(
        first.origin,
        "/api/v1/internal/operations/customers?search=Selam",
        { headers: operationsHeaders },
      ),
      200,
    );
    assert.equal(operationsCustomers.length, 1);
    assert.equal(operationsCustomers[0]?.["id"], "demo_customer_001");
    assert.deepEqual(operationsCustomers[0]?.["totalSent"], {
      currency: "USD",
      minorUnits: "10300",
    });
    const operationsTransfers = arrayBody(
      await apiRequest(
        first.origin,
        `/api/v1/internal/operations/transfers?search=${transferId}`,
        { headers: operationsHeaders },
      ),
      200,
    );
    assert.equal(operationsTransfers[0]?.["id"], transferId);
    assert.deepEqual(operationsTransfers[0]?.["totalDebit"], {
      currency: "USD",
      minorUnits: "10300",
    });
    const operationsDetail = objectBody(
      await apiRequest(
        first.origin,
        `/api/v1/internal/operations/transfers/${transferId}`,
        { headers: operationsHeaders },
      ),
      200,
    );
    assert.ok((operationsDetail["timeline"] as JsonObject[]).length >= 3);
    assert.ok((operationsDetail["outbox"] as JsonObject[]).length >= 3);
    assert.ok((operationsDetail["audit"] as JsonObject[]).length >= 1);

    await stopServer(concurrent);
    await stopServer(first);
    running.splice(0);

    const restarted = await startServer();
    running.push(restarted);
    const recovered = objectBody(
      await apiRequest(
        restarted.origin,
        `/api/v1/remittance/transfers/${transferId}`,
      ),
      200,
    );
    assert.equal(recovered["status"], "submitted");
    assertAccount(await getAccount(restarted.origin), "425000", "414700");
    const durableBankAfterRestart = objectBody(
      await apiRequest(
        restarted.origin,
        `/api/v1/beneficiaries/${durableBankId}`,
      ),
      200,
    );
    assert.equal(
      durableBankAfterRestart["displayName"],
      "Durable Bank Recipient",
    );
    const updatedWallet = objectBody(
      await apiRequest(
        restarted.origin,
        `/api/v1/beneficiaries/${durableWalletId}`,
        { method: "PATCH", body: { city: "Gondar" } },
      ),
      200,
    );
    assert.equal(updatedWallet["city"], "Gondar");
    const deletedBank = await apiRequest(
      restarted.origin,
      `/api/v1/beneficiaries/${durableBankId}`,
      { method: "DELETE" },
    );
    assert.equal(deletedBank.status, 204);

    for (const expected of ["in_transit", "payout_pending", "completed"]) {
      const advanced = objectBody(
        await advanceScenario(restarted.origin, transferId, "happy_path"),
        200,
      );
      assert.equal(advanced["status"], expected);
    }
    assertAccount(await getAccount(restarted.origin), "414700", "414700");

    const reconciliation = objectBody(
      await apiRequest(restarted.origin, "/api/v1/dev/reconciliation/runs", {
        method: "POST",
        body: { scenario: "reconciliation_amount_mismatch" },
      }),
      201,
    );
    assert.equal(reconciliation["status"], "completed");
    const reconciliationItems = reconciliation["items"] as JsonObject[];
    assert.equal(reconciliationItems.length, 1);
    assert.equal(reconciliationItems[0]?.["classification"], "amount_mismatch");
    const reconciliationId = String(reconciliation["id"]);

    await stopServer(restarted);
    running.splice(0);

    const afterRestart = await startServer();
    running.push(afterRestart);
    const durableTransfer = objectBody(
      await apiRequest(
        afterRestart.origin,
        `/api/v1/remittance/transfers/${transferId}`,
      ),
      200,
    );
    assert.equal(durableTransfer["status"], "completed");
    const deletedAfterRestart = await apiRequest(
      afterRestart.origin,
      `/api/v1/beneficiaries/${durableBankId}`,
    );
    assert.equal(deletedAfterRestart.status, 404);
    const updatedAfterRestart = objectBody(
      await apiRequest(
        afterRestart.origin,
        `/api/v1/beneficiaries/${durableWalletId}`,
      ),
      200,
    );
    assert.equal(updatedAfterRestart["city"], "Gondar");
    const durableReconciliation = objectBody(
      await apiRequest(
        afterRestart.origin,
        `/api/v1/dev/reconciliation/runs/${reconciliationId}`,
      ),
      200,
    );
    assert.deepEqual(durableReconciliation, reconciliation);
    const exceptions = arrayBody(
      await apiRequest(
        afterRestart.origin,
        "/api/v1/internal/operations/reconciliation/exceptions",
        { headers: operationsHeaders },
      ),
      200,
    );
    assert.ok(
      exceptions.some((exception) => exception["transferId"] === transferId),
    );
    const auditEvents = arrayBody(
      await apiRequest(
        afterRestart.origin,
        `/api/v1/internal/operations/audit-events?entityId=${transferId}`,
        { headers: operationsHeaders },
      ),
      200,
    );
    assert.ok(auditEvents.length >= 1);
    assertAccount(await getAccount(afterRestart.origin), "414700", "414700");

    const activity = objectBody(
      await apiRequest(afterRestart.origin, "/api/v1/activity"),
      200,
    );
    const activityItems = activity["items"] as JsonObject[];
    assert.ok(activityItems.some((item) => item["sourceId"] === transferId));

    const refundQuote = objectBody(
      await createQuote(
        afterRestart.origin,
        "5000",
        "beneficiary_wallet_001",
        "wallet",
      ),
      201,
    );
    const refundTransfer = objectBody(
      await createTransfer(
        afterRestart.origin,
        String(refundQuote["id"]),
        "http-settlement-refund-key",
      ),
      201,
    );
    const refundTransferId = String(refundTransfer["id"]);
    const expectedRefundStates = [
      "in_transit",
      "payout_pending",
      "completed",
      "refund_pending",
      "refunded",
    ];
    for (const expected of expectedRefundStates) {
      const advanced = objectBody(
        await advanceScenario(
          afterRestart.origin,
          refundTransferId,
          "settlement_refund",
        ),
        200,
      );
      assert.equal(advanced["status"], expected);
    }
    assertAccount(await getAccount(afterRestart.origin), "414700", "414700");
  } finally {
    await Promise.allSettled(running.map(stopServer));
    if (originalDatabaseUrl === undefined) {
      delete process.env["DATABASE_URL"];
    } else {
      process.env["DATABASE_URL"] = originalDatabaseUrl;
    }
  }
});

async function startServer(): Promise<RunningServer> {
  const runtime = createConfiguredDemoRuntime(postgresConfig);
  const app = createApp(postgresConfig, runtime);
  const server = await new Promise<Server>((resolve, reject) => {
    const candidate = app.listen(0, "127.0.0.1", (error?: Error) =>
      error ? reject(error) : resolve(candidate),
    );
    candidate.once("error", reject);
  });
  const address = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${address.port}`,
    server,
    runtime,
  };
}

async function stopServer(running: RunningServer): Promise<void> {
  if (running.server.listening) {
    await new Promise<void>((resolve, reject) => {
      running.server.close((error) => (error ? reject(error) : resolve()));
    });
  }
  await running.runtime.close();
}

function createQuote(
  origin: string,
  amountMinor: string,
  beneficiaryId: string,
  deliveryMethod: "bank" | "wallet",
): Promise<ApiResponse> {
  return apiRequest(origin, "/api/v1/remittance/quotes", {
    method: "POST",
    body: {
      sourceAccountId: "demo_usd_account_001",
      beneficiaryId,
      sendAmount: { currency: "USD", minorUnits: amountMinor },
      fundingMethod: "samra_balance",
      deliveryMethod,
    },
  });
}

function createTransfer(
  origin: string,
  quoteId: string,
  idempotencyKey: string,
): Promise<ApiResponse> {
  return apiRequest(origin, "/api/v1/remittance/transfers", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: { quoteId },
  });
}

function advanceScenario(
  origin: string,
  transferId: string,
  scenario: "happy_path" | "settlement_refund",
): Promise<ApiResponse> {
  return apiRequest(
    origin,
    `/api/v1/dev/remittance/transfers/${transferId}/scenario`,
    { method: "POST", body: { scenario } },
  );
}

async function getAccount(origin: string): Promise<JsonObject> {
  const response = await apiRequest(origin, "/api/v1/accounts");
  assert.equal(response.status, 200);
  const accounts = response.body as JsonObject[];
  assert.equal(accounts.length, 1);
  return accounts[0] ?? {};
}

function assertAccount(
  account: JsonObject,
  bookMinor: string,
  availableMinor: string,
): void {
  assert.equal(moneyMinor(account["bookBalance"]), bookMinor);
  assert.equal(moneyMinor(account["availableBalance"]), availableMinor);
}

function moneyMinor(value: unknown): unknown {
  return (value as JsonObject)["minorUnits"];
}

function objectBody(response: ApiResponse, status: number): JsonObject {
  assert.equal(response.status, status);
  assert.ok(
    typeof response.body === "object" &&
      response.body !== null &&
      !Array.isArray(response.body),
  );
  return response.body as JsonObject;
}

function arrayBody(response: ApiResponse, status: number): JsonObject[] {
  assert.equal(response.status, status);
  assert.ok(Array.isArray(response.body));
  return response.body as JsonObject[];
}

async function apiRequest(
  origin: string,
  path: string,
  options: Readonly<{
    method?: string;
    headers?: Readonly<Record<string, string>>;
    body?: unknown;
  }> = {},
): Promise<ApiResponse> {
  const response = await fetch(`${origin}${path}`, {
    method: options.method,
    headers: {
      ...(options.body === undefined
        ? {}
        : { "content-type": "application/json" }),
      ...(options.headers ?? {}),
    },
    ...(options.body === undefined
      ? {}
      : { body: JSON.stringify(options.body) }),
  });
  const responseBody = await response.text();
  return {
    status: response.status,
    body: responseBody ? (JSON.parse(responseBody) as unknown) : {},
  };
}
