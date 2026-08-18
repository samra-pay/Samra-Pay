import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import type { Server } from "node:http";
import { createApp } from "./app";
import type { ApiRuntimeConfig } from "./config";
import {
  DEMO_ACTOR,
  DemoRuntime,
  type PublicTransferDemoScenario,
} from "./domain/demo-runtime";
import { DEMO_LEDGER_ACCOUNT_IDS } from "./domain/demo-ledger";

const demoConfig: ApiRuntimeConfig = Object.freeze({
  backendMode: "demo",
  providerMode: "fake",
  devControlsEnabled: true,
  runWorker: false,
  workerIntervalMilliseconds: 5,
});

const disabledConfig: ApiRuntimeConfig = Object.freeze({
  backendMode: "disabled",
  providerMode: "fake",
  devControlsEnabled: false,
  runWorker: false,
  workerIntervalMilliseconds: 5,
});

type JsonObject = Record<string, unknown>;

test("health remains available while disabled mode returns a stable 503 problem", async () => {
  await withServer(disabledConfig, undefined, async (origin) => {
    const health = await request(origin, "/api/healthz");
    assert.equal(health.status, 200);
    assert.deepEqual(health.body, { status: "ok" });
    const readiness = await request(origin, "/api/readyz");
    assert.equal(readiness.status, 200);
    assert.deepEqual(readiness.body, { status: "ready" });

    const unavailable = await request(origin, "/api/v1/me");
    assert.equal(unavailable.status, 503);
    assert.equal(unavailable.body["code"], "BACKEND_UNAVAILABLE");
    assert.equal(typeof unavailable.body["traceId"], "string");

    const hiddenDevRoute = await request(
      origin,
      "/api/v1/dev/reconciliation/runs/not-exposed",
    );
    assert.equal(hiddenDevRoute.status, 404);
    assert.equal(hiddenDevRoute.body["code"], "NOT_FOUND");
  });
});

test("readiness fails closed without exposing persistence errors", async () => {
  const runtime = new DemoRuntime({
    readiness: async () => {
      throw new Error("postgresql://sensitive-host/internal-detail");
    },
  });
  await withServer(demoConfig, runtime, async (origin) => {
    const health = await request(origin, "/api/healthz");
    assert.equal(health.status, 200);
    const readiness = await request(origin, "/api/readyz");
    assert.equal(readiness.status, 503);
    assert.deepEqual(readiness.body, { status: "not_ready" });
    assert.doesNotMatch(JSON.stringify(readiness.body), /sensitive-host/);
  });
});

test("production-style demo mode does not mount dev controls", async () => {
  await withServer(
    { ...demoConfig, devControlsEnabled: false },
    new DemoRuntime(),
    async (origin) => {
      const me = await request(origin, "/api/v1/me");
      assert.equal(me.status, 200);
      const dev = await request(origin, "/api/v1/dev/reconciliation/runs", {
        method: "POST",
        body: {},
      });
      assert.equal(dev.status, 404);
      assert.equal(dev.body["code"], "NOT_FOUND");
    },
  );
});

test("development controls reject scenarios from the wrong domain", async () => {
  await withServer(demoConfig, new DemoRuntime(), async (origin) => {
    const transferControl = await request(
      origin,
      "/api/v1/dev/remittance/transfers/not-used/scenario",
      {
        method: "POST",
        body: { scenario: "reconciliation_amount_mismatch" },
      },
    );
    assert.equal(transferControl.status, 422);
    assert.equal(transferControl.body["code"], "VALIDATION_ERROR");

    const reconciliationControl = await request(
      origin,
      "/api/v1/dev/reconciliation/runs",
      { method: "POST", body: { scenario: "chapa_failure" } },
    );
    assert.equal(reconciliationControl.status, 422);
    assert.equal(reconciliationControl.body["code"], "VALIDATION_ERROR");
  });
});

test("$100 + $3 quote, idempotency, polling, and ledger-derived balances stay exact", async () => {
  const runtime = new DemoRuntime();
  await withServer(demoConfig, runtime, async (origin) => {
    const quote = await createQuote(origin, 10_000n);
    assert.deepEqual(quote["sendAmount"], {
      currency: "USD",
      minorUnits: "10000",
    });
    assert.deepEqual(quote["feeAmount"], {
      currency: "USD",
      minorUnits: "300",
    });
    assert.deepEqual(quote["totalDebit"], {
      currency: "USD",
      minorUnits: "10300",
    });
    assert.deepEqual(quote["receiveAmount"], {
      currency: "ETB",
      minorUnits: "1800000",
    });
    assert.equal(quote["exchangeRate"], "180");

    const created = await createTransfer(
      origin,
      String(quote["id"]),
      "create-key-001",
    );
    assert.equal(created.status, 201);
    assert.equal(created.body["status"], "submitted");

    const replay = await createTransfer(
      origin,
      String(quote["id"]),
      "create-key-001",
    );
    assert.equal(replay.status, 201);
    assert.equal(replay.body["id"], created.body["id"]);

    const secondQuote = await createQuote(origin, 5_000n);
    const conflict = await createTransfer(
      origin,
      String(secondQuote["id"]),
      "create-key-001",
    );
    assert.equal(conflict.status, 409);
    assert.equal(conflict.body["code"], "CONFLICT");

    let account = await getDemoAccount(origin);
    assert.equal(moneyMinor(account["bookBalance"]), "425000");
    assert.equal(moneyMinor(account["availableBalance"]), "414700");

    const transferId = String(created.body["id"]);
    assert.deepEqual(
      (await runtime.repository.listOutbox())
        .slice(0, 3)
        .map((message) => [message.type, message.payload["state"]]),
      [
        ["TRANSFER_CREATED", "CREATED"],
        ["FUNDS_RESERVED", "FUNDS_RESERVED"],
        ["TRANSFER_SUBMITTED", "SUBMITTED"],
      ],
    );
    for (const expected of ["in_transit", "payout_pending", "completed"]) {
      const advanced = await advanceScenario(origin, transferId, "happy_path");
      assert.equal(advanced["status"], expected);
      const polled = await request(
        origin,
        `/api/v1/remittance/transfers/${transferId}`,
      );
      assert.equal(polled.status, 200);
      assert.equal(polled.body["status"], expected);
    }

    account = await getDemoAccount(origin);
    assert.equal(moneyMinor(account["bookBalance"]), "414700");
    assert.equal(moneyMinor(account["availableBalance"]), "414700");

    const journals = runtime.ledger.repository.listJournals();
    assert.deepEqual(
      journals.map((journal) => journal.source.type),
      [
        "demo_seed",
        "remittance_capture",
        "remittance_settlement",
        "remittance_fee_recognition",
      ],
    );
    assert.equal(
      runtime.ledger.repository.getAccountBalance(
        DEMO_LEDGER_ACCOUNT_IDS.principalClearingUsd,
      ).naturalBalanceMinor,
      0n,
    );
    assert.equal(
      runtime.ledger.repository.getAccountBalance(
        DEMO_LEDGER_ACCOUNT_IDS.deferredFeeUsd,
      ).naturalBalanceMinor,
      0n,
    );
    assert.equal(
      runtime.ledger.repository.getAccountBalance(
        DEMO_LEDGER_ACCOUNT_IDS.feeRevenueUsd,
      ).naturalBalanceMinor,
      300n,
    );

    const reconciliation = await request(
      origin,
      "/api/v1/dev/reconciliation/runs",
      { method: "POST", body: { scenario: "happy_path" } },
    );
    assert.equal(reconciliation.status, 201);
    assert.equal(reconciliation.body["status"], "completed");
    const reconciliationItems = reconciliation.body["items"] as JsonObject[];
    assert.equal(reconciliationItems[0]?.["classification"], "matched");
    const fetchedRun = await request(
      origin,
      `/api/v1/dev/reconciliation/runs/${String(reconciliation.body["id"])}`,
    );
    assert.equal(fetchedRun.status, 200);
    assert.deepEqual(fetchedRun.body, reconciliation.body);
  });
});

test("SAMRA_RUN_WORKER mode advances pending fake transfers to completion", async () => {
  const runtime = new DemoRuntime();
  await withServer(
    { ...demoConfig, runWorker: true },
    runtime,
    async (origin) => {
      const transferId = await createTransferForScenario(origin);
      let status: unknown = "submitted";
      for (
        let attempt = 0;
        attempt < 20 && status !== "completed";
        attempt += 1
      ) {
        await new Promise((resolve) => setTimeout(resolve, 10));
        const response = await request(
          origin,
          `/api/v1/remittance/transfers/${transferId}`,
        );
        status = response.body["status"];
      }
      assert.equal(status, "completed");
      const account = await getDemoAccount(origin);
      assert.equal(moneyMinor(account["bookBalance"]), "414700");
    },
  );
});

test("the worker preserves an explicitly selected failure scenario", async () => {
  const runtime = new DemoRuntime();
  await withServer(demoConfig, runtime, async (origin) => {
    const transferId = await createTransferForScenario(origin);
    const selected = await advanceScenario(origin, transferId, "chapa_failure");
    assert.equal(selected["status"], "in_transit");

    for (const expected of ["payout_pending", "refund_pending", "refunded"]) {
      await runtime.advanceWorkerBatch();
      const transfer = await request(
        origin,
        `/api/v1/remittance/transfers/${transferId}`,
      );
      assert.equal(transfer.body["status"], expected);
    }
  });
});

test("reconciliation changes each transfer from its own item classification", async () => {
  const runtime = new DemoRuntime();
  await withServer(demoConfig, runtime, async (origin) => {
    const transferIds: string[] = [];
    for (const [index, amountMinor] of [10_000n, 5_000n].entries()) {
      const quote = await createQuote(origin, amountMinor);
      const created = await createTransfer(
        origin,
        String(quote["id"]),
        `reconciliation-create-${index}`,
      );
      assert.equal(created.status, 201);
      const transferId = String(created.body["id"]);
      transferIds.push(transferId);
      for (let step = 0; step < 3; step += 1) {
        await advanceScenario(origin, transferId, "happy_path");
      }
    }

    const response = await request(origin, "/api/v1/dev/reconciliation/runs", {
      method: "POST",
      body: { scenario: "reconciliation_amount_mismatch" },
    });
    assert.equal(response.status, 201);
    const items = response.body["items"] as JsonObject[];
    assert.deepEqual(
      items.map((item) => item["classification"]),
      ["amount_mismatch", "matched"],
    );

    for (const item of items) {
      const transfer = await runtime.service.getTransfer(
        DEMO_ACTOR.id,
        String(item["matchKey"]),
      );
      assert.equal(
        transfer.reconciliationState,
        item["classification"] === "matched" ? "MATCHED" : "EXCEPTION",
      );
    }
    assert.equal(new Set(transferIds).size, 2);
  });
});

test("an over-balance transfer returns public INSUFFICIENT_FUNDS without internals", async () => {
  await withServer(demoConfig, new DemoRuntime(), async (origin) => {
    const quote = await createQuote(origin, 425_000n);
    const transfer = await createTransfer(
      origin,
      String(quote["id"]),
      "too-large-key-001",
    );
    assert.equal(transfer.status, 409);
    assert.equal(transfer.body["code"], "INSUFFICIENT_FUNDS");
    assert.equal(
      transfer.body["detail"],
      "The selected account does not have enough available demo funds.",
    );
    assert.equal(String(transfer.body["detail"]).includes("demo_usd"), false);
  });
});

test("concurrent commands cannot consume one quote or reserve its funds twice", async () => {
  const runtime = new DemoRuntime();
  await withServer(demoConfig, runtime, async (origin) => {
    const quote = await createQuote(origin, 10_000n);
    const responses = await Promise.all([
      createTransfer(origin, String(quote["id"]), "concurrent-create-a"),
      createTransfer(origin, String(quote["id"]), "concurrent-create-b"),
    ]);
    assert.deepEqual(
      responses.map((response) => response.status).sort(),
      [201, 409],
    );
    const conflict = responses.find((response) => response.status === 409);
    assert.equal(conflict?.body["code"], "QUOTE_ALREADY_USED");

    const transfers = await request(origin, "/api/v1/remittance/transfers");
    assert.equal(transfers.status, 200);
    assert.equal((transfers.body["items"] as JsonObject[]).length, 1);
    assert.equal(
      runtime.ledger.repository
        .listHolds(DEMO_LEDGER_ACCOUNT_IDS.customerUsd)
        .filter((hold) => hold.status === "active").length,
      1,
    );
    const account = await getDemoAccount(origin);
    assert.equal(moneyMinor(account["bookBalance"]), "425000");
    assert.equal(moneyMinor(account["availableBalance"]), "414700");
  });
});

test("quote creation rejects a beneficiary and delivery-rail mismatch", async () => {
  await withServer(demoConfig, new DemoRuntime(), async (origin) => {
    const response = await request(origin, "/api/v1/remittance/quotes", {
      method: "POST",
      body: {
        sourceAccountId: DEMO_LEDGER_ACCOUNT_IDS.customerUsd,
        beneficiaryId: "beneficiary_bank_001",
        sendAmount: { currency: "USD", minorUnits: "10000" },
        fundingMethod: "samra_balance",
        deliveryMethod: "wallet",
      },
    });
    assert.equal(response.status, 422);
    assert.equal(response.body["code"], "INVALID_ARGUMENT");
  });
});

test("beneficiary CRUD is actor-owned, rail-safe, and soft-deleted", async () => {
  await withServer(demoConfig, new DemoRuntime(), async (origin) => {
    const seeded = await request(origin, "/api/v1/beneficiaries");
    assert.equal(seeded.status, 200);
    assert.deepEqual(
      (seeded.body as unknown as JsonObject[]).map((item) => item["id"]),
      ["beneficiary_bank_001", "beneficiary_wallet_001"],
    );
    assert.deepEqual(
      (seeded.body as unknown as JsonObject[]).map(
        (item) => item["displayName"],
      ),
      ["Abebe Bekele", "Tigist Haile"],
    );

    const actorBHeaders = { "x-demo-actor-id": "demo_customer_002" };
    const actorBList = await request(origin, "/api/v1/beneficiaries", {
      headers: actorBHeaders,
    });
    assert.deepEqual(
      (actorBList.body as unknown as JsonObject[]).map((item) => item["id"]),
      ["beneficiary_actor_b_001"],
    );
    for (const method of ["GET", "PATCH", "DELETE"]) {
      const isolated = await request(
        origin,
        "/api/v1/beneficiaries/beneficiary_bank_001",
        {
          method,
          headers: actorBHeaders,
          ...(method === "PATCH" ? { body: { city: "Gondar" } } : {}),
        },
      );
      assert.equal(isolated.status, 404);
      assert.equal(isolated.body["code"], "NOT_FOUND");
    }

    const mixedRail = await request(origin, "/api/v1/beneficiaries", {
      method: "POST",
      body: {
        displayName: "Invalid Recipient",
        city: "Addis Ababa",
        countryCode: "ET",
        deliveryDetails: {
          method: "bank",
          bankId: "cbe",
          accountNumber: "100000001111",
          phoneNumber: "+251911111111",
        },
      },
    });
    assert.equal(mixedRail.status, 422);

    const created = await request(origin, "/api/v1/beneficiaries", {
      method: "POST",
      body: {
        displayName: "New Synthetic Recipient",
        city: "Dire Dawa",
        countryCode: "ET",
        deliveryDetails: {
          method: "wallet",
          walletId: "cbebirr",
          phoneNumber: "+251922221234",
        },
      },
    });
    assert.equal(created.status, 201);
    const createdId = String(created.body["id"]);
    assert.match(createdId, /^beneficiary_[0-9a-f]{32}$/);
    assert.equal(created.body["actorId"], undefined);
    assert.equal(created.body["customerId"], undefined);
    assert.deepEqual(created.body["deliveryDetails"], {
      method: "wallet",
      walletId: "cbebirr",
      institutionName: "CBE Birr",
      phoneNumberLast4: "1234",
    });

    const wrongRailQuote = await request(origin, "/api/v1/remittance/quotes", {
      method: "POST",
      body: {
        sourceAccountId: DEMO_LEDGER_ACCOUNT_IDS.customerUsd,
        beneficiaryId: createdId,
        sendAmount: { currency: "USD", minorUnits: "10000" },
        fundingMethod: "samra_balance",
        deliveryMethod: "bank",
      },
    });
    assert.equal(wrongRailQuote.status, 422);

    const updated = await request(
      origin,
      `/api/v1/beneficiaries/${createdId}`,
      { method: "PATCH", body: { displayName: "Updated Recipient" } },
    );
    assert.equal(updated.status, 200);
    assert.equal(updated.body["displayName"], "Updated Recipient");

    const deleted = await request(
      origin,
      `/api/v1/beneficiaries/${createdId}`,
      { method: "DELETE" },
    );
    assert.equal(deleted.status, 204);
    const afterDelete = await request(
      origin,
      `/api/v1/beneficiaries/${createdId}`,
    );
    assert.equal(afterDelete.status, 404);
  });
});

test("cancel idempotency replays exactly and rejects key reuse for another transfer", async () => {
  await withServer(demoConfig, new DemoRuntime(), async (origin) => {
    const firstTransferId = await createTransferForScenario(origin);
    const cancelPath = `/api/v1/remittance/transfers/${firstTransferId}/cancel`;
    const first = await request(origin, cancelPath, {
      method: "POST",
      headers: { "Idempotency-Key": "cancel-key-001" },
    });
    assert.equal(first.status, 200);
    assert.equal(first.body["status"], "cancelled");

    const replay = await request(origin, cancelPath, {
      method: "POST",
      headers: { "Idempotency-Key": "cancel-key-001" },
    });
    assert.equal(replay.status, 200);
    assert.deepEqual(replay.body, first.body);

    const secondQuote = await createQuote(origin, 10_000n);
    const second = await createTransfer(
      origin,
      String(secondQuote["id"]),
      "create-key-002",
    );
    assert.equal(second.status, 201);
    const reused = await request(
      origin,
      `/api/v1/remittance/transfers/${String(second.body["id"])}/cancel`,
      {
        method: "POST",
        headers: { "Idempotency-Key": "cancel-key-001" },
      },
    );
    assert.equal(reused.status, 409);
    assert.equal(reused.body["code"], "CONFLICT");
  });
});

test("Caliza rejection releases the hold and posts no transfer journal", async () => {
  const runtime = new DemoRuntime();
  await withServer(demoConfig, runtime, async (origin) => {
    const transferId = await createTransferForScenario(origin);
    const failed = await advanceScenario(
      origin,
      transferId,
      "caliza_rejection",
    );
    assert.equal(failed["status"], "failed");
    const account = await getDemoAccount(origin);
    assert.equal(moneyMinor(account["bookBalance"]), "425000");
    assert.equal(moneyMinor(account["availableBalance"]), "425000");
    assert.deepEqual(
      runtime.ledger.repository
        .listJournals()
        .map((journal) => journal.source.type),
      ["demo_seed"],
    );
  });
});

test("payout failure reverses settlement then capture and restores the customer", async () => {
  const runtime = new DemoRuntime();
  await withServer(demoConfig, runtime, async (origin) => {
    const transferId = await createTransferForScenario(origin);
    for (const expected of [
      "in_transit",
      "payout_pending",
      "refund_pending",
      "refunded",
    ]) {
      const transfer = await advanceScenario(
        origin,
        transferId,
        "chapa_failure",
      );
      assert.equal(transfer["status"], expected);
    }
    assertRestoredLedger(runtime, 2, false);
    const account = await getDemoAccount(origin);
    assert.equal(moneyMinor(account["bookBalance"]), "425000");
    assert.equal(moneyMinor(account["availableBalance"]), "425000");
  });
});

test("post-completion settlement refund reverses fee, settlement, then capture", async () => {
  const runtime = new DemoRuntime();
  await withServer(demoConfig, runtime, async (origin) => {
    const transferId = await createTransferForScenario(origin);
    for (const expected of [
      "in_transit",
      "payout_pending",
      "completed",
      "refund_pending",
      "refunded",
    ]) {
      const transfer = await advanceScenario(
        origin,
        transferId,
        "settlement_refund",
      );
      assert.equal(transfer["status"], expected);
    }
    assertRestoredLedger(runtime, 3, true);
    const account = await getDemoAccount(origin);
    assert.equal(moneyMinor(account["bookBalance"]), "425000");
    assert.equal(moneyMinor(account["availableBalance"]), "425000");
  });
});

async function createTransferForScenario(origin: string): Promise<string> {
  const quote = await createQuote(origin, 10_000n);
  const transfer = await createTransfer(
    origin,
    String(quote["id"]),
    "scenario-key-001",
  );
  assert.equal(transfer.status, 201);
  return String(transfer.body["id"]);
}

async function createQuote(origin: string, amountMinor: bigint) {
  const response = await request(origin, "/api/v1/remittance/quotes", {
    method: "POST",
    body: {
      sourceAccountId: DEMO_LEDGER_ACCOUNT_IDS.customerUsd,
      beneficiaryId: "beneficiary_bank_001",
      sendAmount: { currency: "USD", minorUnits: amountMinor.toString() },
      fundingMethod: "samra_balance",
      deliveryMethod: "bank",
    },
  });
  assert.equal(response.status, 201);
  return response.body;
}

function createTransfer(
  origin: string,
  quoteId: string,
  idempotencyKey: string,
) {
  return request(origin, "/api/v1/remittance/transfers", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: { quoteId },
  });
}

async function advanceScenario(
  origin: string,
  transferId: string,
  scenario: PublicTransferDemoScenario,
) {
  const response = await request(
    origin,
    `/api/v1/dev/remittance/transfers/${transferId}/scenario`,
    { method: "POST", body: { scenario } },
  );
  assert.equal(response.status, 200);
  return response.body;
}

async function getDemoAccount(origin: string): Promise<JsonObject> {
  const response = await request(origin, "/api/v1/accounts");
  assert.equal(response.status, 200);
  const accounts = response.body as unknown as JsonObject[];
  assert.equal(accounts.length, 1);
  return accounts[0] ?? {};
}

function moneyMinor(value: unknown): unknown {
  return (value as JsonObject)["minorUnits"];
}

function assertRestoredLedger(
  runtime: DemoRuntime,
  expectedReversals: number,
  expectFeeRecognition: boolean,
): void {
  const journals = runtime.ledger.repository.listJournals();
  const sourceTypes = journals.map((journal) => journal.source.type);
  assert.equal(
    sourceTypes.filter((source) => source === "remittance_refund_reversal")
      .length,
    expectedReversals,
  );
  assert.equal(
    sourceTypes.includes("remittance_fee_recognition"),
    expectFeeRecognition,
  );
  assert.equal(
    runtime.ledger.repository.getAccountBalance(
      DEMO_LEDGER_ACCOUNT_IDS.customerUsd,
    ).naturalBalanceMinor,
    425_000n,
  );
  assert.equal(
    runtime.ledger.repository.getAccountBalance(
      DEMO_LEDGER_ACCOUNT_IDS.rainControlUsd,
    ).naturalBalanceMinor,
    425_000n,
  );
  assert.equal(
    runtime.ledger.repository.getAccountBalance(
      DEMO_LEDGER_ACCOUNT_IDS.principalClearingUsd,
    ).naturalBalanceMinor,
    0n,
  );
  assert.equal(
    runtime.ledger.repository.getAccountBalance(
      DEMO_LEDGER_ACCOUNT_IDS.deferredFeeUsd,
    ).naturalBalanceMinor,
    0n,
  );
}

async function request(
  origin: string,
  path: string,
  options: Readonly<{
    method?: string;
    headers?: Readonly<Record<string, string>>;
    body?: unknown;
  }> = {},
): Promise<Readonly<{ status: number; body: JsonObject }>> {
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
    body: responseBody ? (JSON.parse(responseBody) as JsonObject) : {},
  };
}

async function withServer(
  config: ApiRuntimeConfig,
  runtime: DemoRuntime | undefined,
  run: (origin: string) => Promise<void>,
): Promise<void> {
  const app = createApp(config, runtime);
  const server = await new Promise<Server>((resolve, reject) => {
    const candidate = app.listen(0, "127.0.0.1", (error?: Error) =>
      error ? reject(error) : resolve(candidate),
    );
    candidate.once("error", reject);
  });
  const address = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    const workerTimer = app.locals["demoWorkerTimer"] as
      NodeJS.Timeout | undefined;
    if (workerTimer) {
      clearInterval(workerTimer);
    }
    if (server.listening) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  }
}
