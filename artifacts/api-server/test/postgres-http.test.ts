import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import type { RequestHandler } from "express";
import { UnauthorizedError } from "express-oauth2-jwt-bearer";
import { randomUUID } from "node:crypto";
import { ALPHA_ONBOARDING_CONSENT_BUNDLE } from "@workspace/db";
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
  customerAuth: Object.freeze({ mode: "disabled" }),
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
    assert.deepEqual(
      objectBody(await apiRequest(first.origin, "/api/readyz"), 200),
      { status: "ready" },
    );

    const workforce = first.runtime.workforceAuthStore!;
    await Promise.all([
      workforce.upsertUser({
        externalRef: "demo_admin_001",
        loginName: "admin@samra.test",
        displayName: "Synthetic Administrator",
        role: "administrator",
        password: "synthetic-admin-password-2026",
      }),
      workforce.upsertUser({
        externalRef: "demo_support_001",
        loginName: "support@samra.test",
        displayName: "Synthetic Support Agent",
        role: "support_readonly",
        password: "synthetic-support-password-2026",
      }),
      workforce.upsertUser({
        externalRef: "demo_compliance_001",
        loginName: "compliance@samra.test",
        displayName: "Synthetic Compliance Analyst",
        role: "compliance_readonly",
        password: "synthetic-compliance-password-2026",
      }),
      workforce.upsertUser({
        externalRef: "demo_disabled_001",
        loginName: "disabled@samra.test",
        displayName: "Disabled Synthetic Operator",
        role: "support_readonly",
        password: "synthetic-disabled-password-2026",
        state: "disabled",
      }),
    ]);
    const operationsHeaders = await loginWorkforce(
      first.origin,
      "admin@samra.test",
      "synthetic-admin-password-2026",
    );
    const supportHeaders = await loginWorkforce(
      first.origin,
      "support@samra.test",
      "synthetic-support-password-2026",
    );
    const complianceHeaders = await loginWorkforce(
      first.origin,
      "compliance@samra.test",
      "synthetic-compliance-password-2026",
    );
    assert.equal(
      (
        await apiRequest(first.origin, "/api/v1/internal/auth/session", {
          headers: operationsHeaders,
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await apiRequest(first.origin, "/api/v1/internal/auth/session", {
          method: "POST",
          body: { loginName: "admin@samra.test", password: "wrong-password" },
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await apiRequest(first.origin, "/api/v1/internal/auth/session", {
          method: "POST",
          body: {
            loginName: "disabled@samra.test",
            password: "synthetic-disabled-password-2026",
          },
        })
      ).status,
      401,
    );
    const expiryProbe = await workforce.authenticate(
      "admin@samra.test",
      "synthetic-admin-password-2026",
      new Date("2026-08-17T10:00:00.000Z"),
    );
    assert.equal(
      await workforce.resolveSession(
        expiryProbe.token,
        new Date("2026-08-18T10:00:00.000Z"),
      ),
      undefined,
    );
    await workforce.revokeSession(
      expiryProbe.token,
      new Date("2026-08-17T10:30:00.000Z"),
    );
    assert.equal(
      await workforce.resolveSession(
        expiryProbe.token,
        new Date("2026-08-17T10:31:00.000Z"),
      ),
      undefined,
    );

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
    assert.equal(hiddenOperations.status, 401);
    assert.equal(
      (
        await apiRequest(first.origin, "/api/v1/internal/operations/summary", {
          headers: {
            "X-Demo-Operator-Id": "demo_cs_agent_001",
            "X-Demo-Operator-Role": "support_readonly",
          },
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await apiRequest(
          first.origin,
          "/api/v1/internal/operations/audit-events",
          {
            headers: supportHeaders,
          },
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await apiRequest(
          first.origin,
          "/api/v1/internal/operations/customers",
          {
            headers: complianceHeaders,
          },
        )
      ).status,
      403,
    );
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
        "/api/v1/internal/operations/customers?search=Samra",
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
    const complianceTransfers = arrayBody(
      await apiRequest(
        first.origin,
        `/api/v1/internal/operations/transfers?search=${transferId}`,
        { headers: complianceHeaders },
      ),
      200,
    );
    assert.equal(
      complianceTransfers[0]?.["beneficiaryDisplay"],
      "Restricted recipient",
    );
    assert.equal(
      (
        await apiRequest(first.origin, "/api/v1/internal/operations/cases", {
          headers: complianceHeaders,
        })
      ).status,
      403,
    );

    const operatorCancelQuote = objectBody(
      await createQuote(first.origin, "1000", "beneficiary_bank_001", "bank"),
      201,
    );
    const operatorCancelTransfer = objectBody(
      await createTransfer(
        first.origin,
        String(operatorCancelQuote["id"]),
        "http-operator-cancel-create",
      ),
      201,
    );
    const operatorCancelId = String(operatorCancelTransfer["id"]);
    const cancelRequest = {
      method: "POST",
      headers: {
        ...supportHeaders,
        "Idempotency-Key": "http-operator-cancel-action",
      },
      body: { reason: "Customer verified cancellation before capture." },
    } as const;
    assert.equal(
      (
        await apiRequest(
          first.origin,
          `/api/v1/internal/operations/transfers/${operatorCancelId}/cancel`,
          cancelRequest,
        )
      ).status,
      403,
    );
    const cancelledByOperator = objectBody(
      await apiRequest(
        first.origin,
        `/api/v1/internal/operations/transfers/${operatorCancelId}/cancel`,
        {
          ...cancelRequest,
          headers: {
            ...operationsHeaders,
            "Idempotency-Key": "http-operator-cancel-action",
          },
        },
      ),
      200,
    );
    assert.equal(
      (cancelledByOperator["transfer"] as JsonObject)["status"],
      "cancelled",
    );
    assert.equal(
      (cancelledByOperator["transfer"] as JsonObject)["fundingStatus"],
      "released",
    );
    const cancellationAudit = cancelledByOperator["audit"] as JsonObject[];
    assert.ok(
      cancellationAudit.some(
        (event) =>
          event["actorType"] === "operator" &&
          event["actorId"] === "demo_admin_001" &&
          event["action"] === "ledger_hold_released",
      ),
    );
    assertAccount(await getAccount(first.origin), "425000", "414700");

    const caseInput = {
      transferId,
      title: "Recipient has not received completed transfer",
      category: "payout",
      priority: "normal",
    };
    const [createdCaseA, createdCaseB] = await Promise.all([
      apiRequest(first.origin, "/api/v1/internal/operations/cases", {
        method: "POST",
        headers: {
          ...supportHeaders,
          "Idempotency-Key": "case-concurrent-create-key",
        },
        body: caseInput,
      }),
      apiRequest(concurrent.origin, "/api/v1/internal/operations/cases", {
        method: "POST",
        headers: {
          ...supportHeaders,
          "Idempotency-Key": "case-concurrent-create-key",
        },
        body: caseInput,
      }),
    ]);
    const createdCaseDetailA = objectBody(createdCaseA, 201);
    const createdCaseDetailB = objectBody(createdCaseB, 201);
    const caseId = String((createdCaseDetailA["case"] as JsonObject)["id"]);
    assert.equal((createdCaseDetailB["case"] as JsonObject)["id"], caseId);
    assert.equal(
      (createdCaseDetailA["case"] as JsonObject)["version"] as number,
      1,
    );
    assert.equal(
      ((createdCaseDetailA["events"] as JsonObject[])[0] as JsonObject)[
        "eventType"
      ],
      "created",
    );
    assert.equal(
      (
        await apiRequest(first.origin, "/api/v1/internal/operations/cases", {
          method: "POST",
          headers: {
            ...supportHeaders,
            "Idempotency-Key": "case-concurrent-create-key",
          },
          body: { ...caseInput, title: "Different request" },
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await apiRequest(
          first.origin,
          `/api/v1/internal/operations/cases/${caseId}`,
          {
            method: "PATCH",
            headers: {
              ...supportHeaders,
              "Idempotency-Key": "case-support-cannot-assign",
            },
            body: { expectedVersion: 1, assignedTo: "demo_support_001" },
          },
        )
      ).status,
      403,
    );
    const assignedCase = objectBody(
      await apiRequest(
        first.origin,
        `/api/v1/internal/operations/cases/${caseId}`,
        {
          method: "PATCH",
          headers: {
            ...operationsHeaders,
            "Idempotency-Key": "case-admin-assignment",
          },
          body: {
            expectedVersion: 1,
            assignedTo: "demo_support_001",
            priority: "urgent",
          },
        },
      ),
      200,
    );
    assert.equal((assignedCase["case"] as JsonObject)["version"], 2);
    assert.equal(
      (assignedCase["case"] as JsonObject)["assignedTo"],
      "demo_support_001",
    );
    assert.equal(
      (
        await apiRequest(
          first.origin,
          `/api/v1/internal/operations/cases/${caseId}`,
          {
            method: "PATCH",
            headers: {
              ...supportHeaders,
              "Idempotency-Key": "case-stale-version",
            },
            body: { expectedVersion: 1, status: "in_progress" },
          },
        )
      ).status,
      409,
    );
    const notedCase = objectBody(
      await apiRequest(
        first.origin,
        `/api/v1/internal/operations/cases/${caseId}/notes`,
        {
          method: "POST",
          headers: {
            ...supportHeaders,
            "Idempotency-Key": "case-first-note",
          },
          body: {
            body: "Confirmed recipient details and escalated payout evidence.",
          },
        },
      ),
      200,
    );
    assert.equal((notedCase["case"] as JsonObject)["version"], 3);
    const replayedNote = objectBody(
      await apiRequest(
        concurrent.origin,
        `/api/v1/internal/operations/cases/${caseId}/notes`,
        {
          method: "POST",
          headers: {
            ...supportHeaders,
            "Idempotency-Key": "case-first-note",
          },
          body: {
            body: "Confirmed recipient details and escalated payout evidence.",
          },
        },
      ),
      200,
    );
    assert.equal((replayedNote["notes"] as JsonObject[]).length, 1);
    const activeCase = objectBody(
      await apiRequest(
        first.origin,
        `/api/v1/internal/operations/cases/${caseId}`,
        {
          method: "PATCH",
          headers: {
            ...supportHeaders,
            "Idempotency-Key": "case-start-work",
          },
          body: { expectedVersion: 3, status: "in_progress" },
        },
      ),
      200,
    );
    assert.equal((activeCase["case"] as JsonObject)["version"], 4);
    assert.equal(
      (
        await apiRequest(
          first.origin,
          `/api/v1/internal/operations/cases/${caseId}`,
          {
            method: "PATCH",
            headers: {
              ...supportHeaders,
              "Idempotency-Key": "case-missing-resolution",
            },
            body: { expectedVersion: 4, status: "resolved" },
          },
        )
      ).status,
      422,
    );
    const resolvedCase = objectBody(
      await apiRequest(
        first.origin,
        `/api/v1/internal/operations/cases/${caseId}`,
        {
          method: "PATCH",
          headers: {
            ...supportHeaders,
            "Idempotency-Key": "case-resolve",
          },
          body: {
            expectedVersion: 4,
            status: "resolved",
            resolution:
              "Provider evidence confirmed delivery to the recipient.",
          },
        },
      ),
      200,
    );
    assert.equal((resolvedCase["case"] as JsonObject)["version"], 5);
    assert.equal((resolvedCase["case"] as JsonObject)["status"], "resolved");
    await workforce.upsertUser({
      externalRef: "demo_compliance_001",
      loginName: "compliance@samra.test",
      displayName: "Synthetic Compliance Analyst",
      role: "compliance_readonly",
      password: "rotated-compliance-password-2026",
    });
    assert.equal(
      (
        await apiRequest(first.origin, "/api/v1/internal/operations/summary", {
          headers: complianceHeaders,
        })
      ).status,
      401,
    );
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
    assert.deepEqual(
      objectBody(await apiRequest(restarted.origin, "/api/readyz"), 200),
      { status: "ready" },
    );
    const recovered = objectBody(
      await apiRequest(
        restarted.origin,
        `/api/v1/remittance/transfers/${transferId}`,
      ),
      200,
    );
    assert.equal(recovered["status"], "submitted");
    const recoveredCase = objectBody(
      await apiRequest(
        restarted.origin,
        `/api/v1/internal/operations/cases/${caseId}`,
        { headers: operationsHeaders },
      ),
      200,
    );
    assert.equal((recoveredCase["case"] as JsonObject)["status"], "resolved");
    assert.equal((recoveredCase["notes"] as JsonObject[]).length, 1);
    const caseAudit = arrayBody(
      await apiRequest(
        restarted.origin,
        `/api/v1/internal/operations/audit-events?entityId=${caseId}`,
        { headers: operationsHeaders },
      ),
      200,
    );
    const caseAuditActions = new Set(caseAudit.map((event) => event["action"]));
    assert.ok(caseAuditActions.has("operations_case_created"));
    assert.ok(caseAuditActions.has("operations_case_updated"));
    assert.ok(caseAuditActions.has("operations_case_note_added"));
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
    const rotatedComplianceHeaders = await loginWorkforce(
      afterRestart.origin,
      "compliance@samra.test",
      "rotated-compliance-password-2026",
    );
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
    const reconciliationException = exceptions.find(
      (exception) => exception["transferId"] === transferId,
    );
    assert.ok(reconciliationException);
    const reconciliationExceptionId = String(reconciliationException["id"]);
    const resolutionReason =
      "Provider settlement evidence confirmed the synthetic amount variance.";
    const forbiddenResolution = await apiRequest(
      afterRestart.origin,
      `/api/v1/internal/operations/reconciliation/exceptions/${reconciliationExceptionId}/resolve`,
      {
        method: "POST",
        headers: {
          ...rotatedComplianceHeaders,
          "Idempotency-Key": "http-reconciliation-resolution",
        },
        body: { reason: resolutionReason },
      },
    );
    assert.equal(forbiddenResolution.status, 403);
    const resolvedException = objectBody(
      await apiRequest(
        afterRestart.origin,
        `/api/v1/internal/operations/reconciliation/exceptions/${reconciliationExceptionId}/resolve`,
        {
          method: "POST",
          headers: {
            ...operationsHeaders,
            "Idempotency-Key": "http-reconciliation-resolution",
          },
          body: { reason: resolutionReason },
        },
      ),
      200,
    );
    assert.equal(resolvedException["state"], "resolved");
    assert.equal(resolvedException["resolvedBy"], "demo_admin_001");
    assert.equal(resolvedException["resolutionNote"], resolutionReason);
    assert.equal(typeof resolvedException["resolutionJournalId"], "string");
    const replayedResolution = objectBody(
      await apiRequest(
        afterRestart.origin,
        `/api/v1/internal/operations/reconciliation/exceptions/${reconciliationExceptionId}/resolve`,
        {
          method: "POST",
          headers: {
            ...operationsHeaders,
            "Idempotency-Key": "http-reconciliation-resolution",
          },
          body: { reason: resolutionReason },
        },
      ),
      200,
    );
    assert.deepEqual(replayedResolution, resolvedException);
    const resolvedExceptions = arrayBody(
      await apiRequest(
        afterRestart.origin,
        "/api/v1/internal/operations/reconciliation/exceptions",
        { headers: operationsHeaders },
      ),
      200,
    );
    assert.deepEqual(
      resolvedExceptions.find(
        (exception) => exception["id"] === reconciliationExceptionId,
      ),
      resolvedException,
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

test("the Auth0 HTTP onboarding boundary creates one customer, resumes after restart, and blocks financial access before activation", async () => {
  const originalDatabaseUrl = process.env["DATABASE_URL"];
  process.env["DATABASE_URL"] = connectionString;
  const running: RunningServer[] = [];
  const issuer = `https://${randomUUID()}.http-onboarding.samra.test/`;
  const subject = `auth0|${randomUUID()}`;
  const config: ApiRuntimeConfig = Object.freeze({
    backendMode: "demo",
    providerMode: "fake",
    persistenceMode: "postgres",
    devControlsEnabled: true,
    runWorker: false,
    workerIntervalMilliseconds: 5,
    internalOperationsEnabled: false,
    customerAuth: Object.freeze({
      mode: "auth0",
      issuerBaseUrl: issuer,
      audience: "https://api.samrapay.test",
      tokenSigningAlgorithm: "RS256",
    }),
  });
  const token = `test:${subject}`;
  const authorization = { authorization: `Bearer ${token}` };
  const customerAccessTokenMiddleware: RequestHandler = (req, _res, next) => {
    if (req.header("authorization") !== `Bearer ${token}`) {
      next(new UnauthorizedError());
      return;
    }
    req.auth = {
      header: { alg: "RS256" },
      payload: {
        iss: issuer,
        sub: subject,
        aud: "https://api.samrapay.test",
        exp: Math.floor(Date.now() / 1_000) + 300,
      },
      token,
    };
    next();
  };

  try {
    const first = await startServer(config, { customerAccessTokenMiddleware });
    const second = await startServer(config, {
      customerAccessTokenMiddleware,
    });
    running.push(first, second);

    assert.equal(
      (await apiRequest(first.origin, "/api/v1/onboarding")).status,
      401,
    );
    const [startA, startB] = await Promise.all([
      apiRequest(first.origin, "/api/v1/onboarding", {
        method: "POST",
        headers: {
          ...authorization,
          "Idempotency-Key": "http-first-login-command-001",
        },
      }),
      apiRequest(second.origin, "/api/v1/onboarding", {
        method: "POST",
        headers: {
          ...authorization,
          "Idempotency-Key": "http-first-login-command-002",
        },
      }),
    ]);
    assert.deepEqual([startA.status, startB.status].sort(), [200, 201]);
    const onboardingA = startA.body as JsonObject;
    const onboardingB = startB.body as JsonObject;
    assert.equal(onboardingA["onboardingId"], onboardingB["onboardingId"]);
    assert.equal(onboardingA["customerId"], onboardingB["customerId"]);
    assert.equal(onboardingA["state"], "consent_pending");

    const financialAccess = objectBody(
      await apiRequest(first.origin, "/api/v1/me", {
        headers: authorization,
      }),
      403,
    );
    assert.equal(financialAccess["code"], "CUSTOMER_ONBOARDING_REQUIRED");

    const consentBody = {
      bundleVersion: ALPHA_ONBOARDING_CONSENT_BUNDLE.bundleVersion,
      locale: ALPHA_ONBOARDING_CONSENT_BUNDLE.locale,
      decisions: ALPHA_ONBOARDING_CONSENT_BUNDLE.documents.map((document) => ({
        consentType: document.consentType,
        documentVersion: document.documentVersion,
        decision: "accepted",
      })),
    };
    const [consentA, consentB] = await Promise.all([
      apiRequest(first.origin, "/api/v1/onboarding/consents", {
        method: "POST",
        headers: {
          ...authorization,
          "Idempotency-Key": "http-consent-command-001",
        },
        body: consentBody,
      }),
      apiRequest(second.origin, "/api/v1/onboarding/consents", {
        method: "POST",
        headers: {
          ...authorization,
          "Idempotency-Key": "http-consent-command-001",
        },
        body: consentBody,
      }),
    ]);
    assert.equal(consentA.status, 200);
    assert.equal(consentB.status, 200);
    assert.equal(
      (consentA.body as JsonObject)["state"],
      "identity_in_progress",
    );
    assert.equal((consentB.body as JsonObject)["version"], 2);

    await stopServer(first);
    const afterRestart = await startServer(config, {
      customerAccessTokenMiddleware,
    });
    running.push(afterRestart);
    const resumed = objectBody(
      await apiRequest(afterRestart.origin, "/api/v1/onboarding", {
        headers: authorization,
      }),
      200,
    );
    assert.equal(resumed["onboardingId"], onboardingA["onboardingId"]);
    assert.equal(resumed["customerId"], onboardingA["customerId"]);
    assert.equal(resumed["state"], "identity_in_progress");
    assert.equal(resumed["version"], 2);
  } finally {
    await Promise.allSettled(running.map(stopServer));
    if (originalDatabaseUrl === undefined) {
      delete process.env["DATABASE_URL"];
    } else {
      process.env["DATABASE_URL"] = originalDatabaseUrl;
    }
  }
});

async function startServer(
  config: ApiRuntimeConfig = postgresConfig,
  dependencies: Parameters<typeof createApp>[2] = {},
): Promise<RunningServer> {
  const runtime = createConfiguredDemoRuntime(config);
  const app = createApp(config, runtime, dependencies);
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

async function loginWorkforce(
  origin: string,
  loginName: string,
  password: string,
): Promise<Readonly<Record<string, string>>> {
  const response = await fetch(`${origin}/api/v1/internal/auth/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ loginName, password }),
  });
  assert.equal(response.status, 201);
  const setCookie = response.headers.get("set-cookie");
  assert.ok(setCookie);
  const cookie = setCookie.split(";", 1)[0];
  assert.match(cookie, /^samra_ops_session=/);
  return Object.freeze({ Cookie: cookie });
}
