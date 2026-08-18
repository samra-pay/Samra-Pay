import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { createDatabase } from "@workspace/db";
import { createApp } from "../src/app";
import type { ApiRuntimeConfig } from "../src/config";
import { createConfiguredDemoRuntime } from "../src/domain/create-demo-runtime";
import type { DemoRuntime } from "../src/domain/demo-runtime";

const connectionString = process.env["TEST_DATABASE_URL"];
if (!connectionString) {
  throw new Error(
    "TEST_DATABASE_URL is required for daily synthetic acceptance journeys.",
  );
}

const originalDatabaseUrl = process.env["DATABASE_URL"];
process.env["DATABASE_URL"] = connectionString;

const evidenceDatabase = createDatabase({ connectionString });
const journeyTransferIds = new Set<string>();

const postgresConfig: ApiRuntimeConfig = Object.freeze({
  backendMode: "demo",
  providerMode: "fake",
  persistenceMode: "postgres",
  devControlsEnabled: true,
  runWorker: false,
  workerIntervalMilliseconds: 5,
  internalOperationsEnabled: true,
});

type JsonObject = Record<string, unknown>;
type ApiResponse = Readonly<{ status: number; body: unknown }>;
type RunningServer = Readonly<{
  origin: string;
  server: Server;
  runtime: DemoRuntime;
}>;
type Balance = Readonly<{ book: bigint; available: bigint }>;
type Journey = Readonly<{
  id: string;
  idempotencyKey: string;
  quote: JsonObject;
  transfer: JsonObject;
  debitMinor: bigint;
}>;

test.after(async () => {
  await evidenceDatabase.pool.end();
  if (originalDatabaseUrl === undefined) {
    delete process.env["DATABASE_URL"];
  } else {
    process.env["DATABASE_URL"] = originalDatabaseUrl;
  }
});

test("SYNTH-DAILY-001 completion commits the exact debit and reconstructible audit trail", async () => {
  await withServer(async ({ origin }) => {
    const before = await getBalance(origin);
    const journey = await createJourney(origin, "completion", "1000");

    assert.deepEqual(await getBalance(origin), {
      book: before.book,
      available: before.available - journey.debitMinor,
    });
    await advanceThrough(origin, journey.id, "happy_path", [
      "in_transit",
      "payout_pending",
      "completed",
    ]);
    assert.deepEqual(await getBalance(origin), {
      book: before.book - journey.debitMinor,
      available: before.available - journey.debitMinor,
    });

    await assertJournalEvidence(journey.id, 3, 0);
    await assertAuditActions(journey.id, [
      "ledger_hold_reserved",
      "ledger_hold_captured",
      "ledger_journal_posted",
      "provider_event_recorded",
      "transfer_status_changed",
    ]);
  });
});

test("SYNTH-DAILY-002 provider rejection fails safely and releases the hold", async () => {
  await withServer(async ({ origin }) => {
    const before = await getBalance(origin);
    const journey = await createJourney(origin, "provider-rejection", "1100");
    const failed = objectBody(
      await advanceScenario(origin, journey.id, "caliza_rejection"),
      200,
    );

    assert.equal(failed["status"], "failed");
    assert.equal(failed["failureCode"], "CALIZA_REJECTED");
    assert.deepEqual(await getBalance(origin), before);
    await assertJournalEvidence(journey.id, 0, 0);
    assert.equal(await holdState(journey.id), "released");
    await assertAuditActions(journey.id, [
      "ledger_hold_reserved",
      "ledger_hold_released",
      "provider_event_recorded",
      "transfer_status_changed",
    ]);
  });
});

test("SYNTH-DAILY-003 timeout retry survives a no-progress attempt and completes once", async () => {
  await withServer(async ({ origin, runtime }) => {
    const before = await getBalance(origin);
    const journey = await createJourney(origin, "timeout-retry", "1200");
    await runtime.repository.saveFakeScenario(journey.id, "TIMEOUT_RETRY");

    assert.equal(await runtime.advanceWorkerBatch(1), 1);
    assert.equal(
      (await getTransfer(origin, journey.id))["status"],
      "submitted",
    );
    await wait(140);
    assert.equal(await runtime.advanceWorkerBatch(1), 1);
    assert.equal(
      (await getTransfer(origin, journey.id))["status"],
      "in_transit",
    );

    await advanceWorkerUntil(runtime, origin, journey.id, "completed");
    assert.deepEqual(await getBalance(origin), {
      book: before.book - journey.debitMinor,
      available: before.available - journey.debitMinor,
    });

    const workflow = await evidenceDatabase.pool.query<{
      retry_count: string;
      advanced_count: string;
      workflow_rows: string;
    }>(
      `SELECT
         count(*) FILTER (WHERE action = 'workflow_retry_scheduled')::text AS retry_count,
         count(*) FILTER (WHERE action = 'workflow_advanced')::text AS advanced_count,
         (SELECT count(*) FROM samra_core.remittance_workflow_work work
          JOIN samra_core.remittance_transfers transfer
            ON transfer.id = work.transfer_id
          WHERE transfer.external_ref = $1)::text AS workflow_rows
       FROM samra_core.audit_events
       WHERE correlation_id = $1`,
      [journey.id],
    );
    assert.equal(workflow.rows[0]!.retry_count, "1");
    assert.ok(Number(workflow.rows[0]!.advanced_count) >= 3);
    assert.equal(workflow.rows[0]!.workflow_rows, "1");
    await assertJournalEvidence(journey.id, 3, 0);
  });
});

test("SYNTH-DAILY-004 cancellation is idempotent and restores available balance", async () => {
  await withServer(async ({ origin }) => {
    const before = await getBalance(origin);
    const journey = await createJourney(origin, "cancellation", "1300");
    const path = `/api/v1/remittance/transfers/${journey.id}/cancel`;
    const options = {
      method: "POST",
      headers: { "Idempotency-Key": "daily-cancellation-command" },
    } as const;
    const cancelled = objectBody(await apiRequest(origin, path, options), 200);
    const replayed = objectBody(await apiRequest(origin, path, options), 200);

    assert.equal(cancelled["status"], "cancelled");
    assert.deepEqual(replayed, cancelled);
    assert.deepEqual(await getBalance(origin), before);
    assert.equal(await holdState(journey.id), "released");
    await assertJournalEvidence(journey.id, 0, 0);
    await assertAuditActions(journey.id, [
      "ledger_hold_reserved",
      "ledger_hold_released",
      "transfer_status_changed",
    ]);
  });
});

test("SYNTH-DAILY-005 payout failure reverses capture and settlement without balance drift", async () => {
  await withServer(async ({ origin }) => {
    const before = await getBalance(origin);
    const journey = await createJourney(origin, "payout-failure", "1400");

    await advanceThrough(origin, journey.id, "chapa_failure", [
      "in_transit",
      "payout_pending",
      "refund_pending",
      "refunded",
    ]);
    assert.deepEqual(await getBalance(origin), before);
    await assertJournalEvidence(journey.id, 2, 2);
    await assertAuditActions(journey.id, [
      "ledger_hold_captured",
      "ledger_journal_posted",
      "ledger_journal_reversed",
      "provider_event_recorded",
      "transfer_status_changed",
    ]);
  });
});

test("SYNTH-DAILY-006 settlement refund reverses principal, fee, and capture exactly once", async () => {
  await withServer(async ({ origin }) => {
    const before = await getBalance(origin);
    const journey = await createJourney(origin, "settlement-refund", "1500");

    await advanceThrough(origin, journey.id, "settlement_refund", [
      "in_transit",
      "payout_pending",
      "completed",
      "refund_pending",
      "refunded",
    ]);
    assert.deepEqual(await getBalance(origin), before);
    await assertJournalEvidence(journey.id, 3, 3);

    const duplicateReversals = await evidenceDatabase.pool.query<{
      count: string;
    }>(
      `SELECT count(*)::text AS count FROM (
         SELECT reverses_journal_id FROM samra_core.ledger_journals
         WHERE reverses_journal_id IS NOT NULL
         GROUP BY reverses_journal_id HAVING count(*) > 1
       ) duplicate`,
    );
    assert.equal(duplicateReversals.rows[0]!.count, "0");
  });
});

test("SYNTH-DAILY-007 restart preserves the transfer and replays creation without a second debit", async () => {
  let first: RunningServer | undefined;
  let restarted: RunningServer | undefined;
  try {
    first = await startServer();
    const before = await getBalance(first.origin);
    const journey = await createJourney(first.origin, "restart", "1600");
    const held = await getBalance(first.origin);
    assert.deepEqual(held, {
      book: before.book,
      available: before.available - journey.debitMinor,
    });

    await stopServer(first);
    first = undefined;
    restarted = await startServer();

    const recovered = await getTransfer(restarted.origin, journey.id);
    assert.equal(recovered["status"], "submitted");
    const replayed = objectBody(
      await apiRequest(restarted.origin, "/api/v1/remittance/transfers", {
        method: "POST",
        headers: { "Idempotency-Key": journey.idempotencyKey },
        body: { quoteId: String(journey.quote["id"]) },
      }),
      201,
    );
    assert.equal(replayed["id"], journey.id);
    assert.deepEqual(await getBalance(restarted.origin), held);

    await advanceThrough(restarted.origin, journey.id, "happy_path", [
      "in_transit",
      "payout_pending",
      "completed",
    ]);
    assert.deepEqual(await getBalance(restarted.origin), {
      book: before.book - journey.debitMinor,
      available: before.available - journey.debitMinor,
    });
    await assertJournalEvidence(journey.id, 3, 0);
  } finally {
    await Promise.allSettled(
      [first, restarted]
        .filter((running): running is RunningServer => running !== undefined)
        .map(stopServer),
    );
  }
});

test("SYNTH-DAILY-008 reconciliation mismatch and controlled resolution survive restart", async () => {
  let first: RunningServer | undefined;
  let restarted: RunningServer | undefined;
  try {
    first = await startServer();
    await objectResponse(
      first.origin,
      "/api/v1/dev/reconciliation/runs",
      { method: "POST", body: { scenario: "happy_path" } },
      201,
    );

    const workforce = first.runtime.workforceAuthStore!;
    await workforce.upsertUser({
      externalRef: "daily_reconciliation_admin",
      loginName: "daily-reconciliation-admin@samra.test",
      displayName: "Daily Reconciliation Administrator",
      role: "administrator",
      password: "daily-synthetic-reconciliation-password",
    });
    const operationsHeaders = await loginWorkforce(
      first.origin,
      "daily-reconciliation-admin@samra.test",
      "daily-synthetic-reconciliation-password",
    );
    const before = await getBalance(first.origin);
    const journey = await createJourney(first.origin, "reconciliation", "1700");
    const mismatch = await objectResponse(
      first.origin,
      "/api/v1/dev/reconciliation/runs",
      {
        method: "POST",
        body: { scenario: "reconciliation_amount_mismatch" },
      },
      201,
    );
    const items = mismatch["items"] as JsonObject[];
    assert.equal(items.length, 1);
    assert.equal(items[0]?.["matchKey"], journey.id);
    assert.equal(items[0]?.["classification"], "amount_mismatch");
    const runId = String(mismatch["id"]);

    await stopServer(first);
    first = undefined;
    restarted = await startServer();
    const durableRun = await objectResponse(
      restarted.origin,
      `/api/v1/dev/reconciliation/runs/${runId}`,
      {},
      200,
    );
    assert.deepEqual(durableRun, mismatch);

    const exceptions = arrayBody(
      await apiRequest(
        restarted.origin,
        "/api/v1/internal/operations/reconciliation/exceptions",
        { headers: operationsHeaders },
      ),
      200,
    );
    const exception = exceptions.find(
      (candidate) => candidate["transferId"] === journey.id,
    );
    assert.ok(exception);
    const exceptionId = String(exception["id"]);
    const resolutionOptions = {
      method: "POST",
      headers: {
        ...operationsHeaders,
        "Idempotency-Key": "daily-reconciliation-resolution",
      },
      body: {
        reason:
          "Synthetic provider evidence explains the one-minor-unit variance.",
      },
    } as const;
    const resolved = objectBody(
      await apiRequest(
        restarted.origin,
        `/api/v1/internal/operations/reconciliation/exceptions/${exceptionId}/resolve`,
        resolutionOptions,
      ),
      200,
    );
    const replayed = objectBody(
      await apiRequest(
        restarted.origin,
        `/api/v1/internal/operations/reconciliation/exceptions/${exceptionId}/resolve`,
        resolutionOptions,
      ),
      200,
    );
    assert.equal(resolved["state"], "resolved");
    assert.equal(resolved["resolvedBy"], "daily_reconciliation_admin");
    assert.equal(typeof resolved["resolutionJournalId"], "string");
    assert.deepEqual(replayed, resolved);

    const cancelled = objectBody(
      await apiRequest(
        restarted.origin,
        `/api/v1/remittance/transfers/${journey.id}/cancel`,
        {
          method: "POST",
          headers: {
            "Idempotency-Key": "daily-reconciliation-transfer-cleanup",
          },
        },
      ),
      200,
    );
    assert.equal(cancelled["status"], "cancelled");
    assert.deepEqual(await getBalance(restarted.origin), before);
  } finally {
    await Promise.allSettled(
      [first, restarted]
        .filter((running): running is RunningServer => running !== undefined)
        .map(stopServer),
    );
  }
});

test("SYNTH-DAILY-009 cross-journey ledger, projection, hold, and audit sweeps remain clean", async () => {
  const transferIds = [...journeyTransferIds];
  assert.equal(transferIds.length, 8);
  const result = await evidenceDatabase.pool.query<{
    unbalanced_journals: string;
    duplicate_reversals: string;
    projection_drift: string;
    active_journey_holds: string;
    missing_journey_audit: string;
  }>(
    `SELECT
       (SELECT count(*) FROM (
          SELECT j.id FROM samra_core.ledger_journals j
          JOIN samra_core.ledger_postings p ON p.journal_id = j.id
          WHERE j.state IN ('posted','reversed')
          GROUP BY j.id
          HAVING sum(p.amount_minor) FILTER (WHERE p.side = 'debit')
             <> sum(p.amount_minor) FILTER (WHERE p.side = 'credit')
        ) invalid)::text AS unbalanced_journals,
       (SELECT count(*) FROM (
          SELECT reverses_journal_id FROM samra_core.ledger_journals
          WHERE reverses_journal_id IS NOT NULL
          GROUP BY reverses_journal_id HAVING count(*) > 1
        ) duplicate)::text AS duplicate_reversals,
       (SELECT count(*)
        FROM samra_core.ledger_account_balance_truth truth
        FULL OUTER JOIN samra_core.ledger_account_balances projection
          ON projection.account_id = truth.account_id
        WHERE projection.account_id IS NULL OR truth.account_id IS NULL
          OR projection.currency IS DISTINCT FROM truth.currency
          OR projection.natural_balance_minor IS DISTINCT FROM truth.natural_balance_minor
          OR projection.active_holds_minor IS DISTINCT FROM truth.active_holds_minor
          OR projection.available_balance_minor IS DISTINCT FROM truth.available_balance_minor
          OR projection.applied_posting_count IS DISTINCT FROM truth.applied_posting_count
          OR projection.active_hold_count IS DISTINCT FROM truth.active_hold_count
       )::text AS projection_drift,
       (SELECT count(*) FROM samra_core.ledger_holds
        WHERE business_event_id = ANY($1::text[]) AND state = 'active')::text
          AS active_journey_holds,
       (SELECT count(*) FROM unnest($1::text[]) AS journey(transfer_id)
        WHERE NOT EXISTS (
          SELECT 1 FROM samra_core.audit_events audit
          WHERE audit.correlation_id = journey.transfer_id
        ))::text AS missing_journey_audit`,
    [transferIds],
  );
  assert.deepEqual(result.rows[0], {
    unbalanced_journals: "0",
    duplicate_reversals: "0",
    projection_drift: "0",
    active_journey_holds: "0",
    missing_journey_audit: "0",
  });
});

async function withServer(
  operation: (running: RunningServer) => Promise<void>,
): Promise<void> {
  const running = await startServer();
  try {
    await operation(running);
  } finally {
    await stopServer(running);
  }
}

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

async function createJourney(
  origin: string,
  label: string,
  amountMinor: string,
): Promise<Journey> {
  const quote = objectBody(
    await apiRequest(origin, "/api/v1/remittance/quotes", {
      method: "POST",
      body: {
        sourceAccountId: "demo_usd_account_001",
        beneficiaryId: "beneficiary_bank_001",
        sendAmount: { currency: "USD", minorUnits: amountMinor },
        fundingMethod: "samra_balance",
        deliveryMethod: "bank",
      },
    }),
    201,
  );
  const idempotencyKey = `daily-${label}-create`;
  const transfer = objectBody(
    await apiRequest(origin, "/api/v1/remittance/transfers", {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: { quoteId: String(quote["id"]) },
    }),
    201,
  );
  const id = String(transfer["id"]);
  journeyTransferIds.add(id);
  return {
    id,
    idempotencyKey,
    quote,
    transfer,
    debitMinor: moneyMinor(quote["totalDebit"]),
  };
}

async function advanceThrough(
  origin: string,
  transferId: string,
  scenario: "happy_path" | "chapa_failure" | "settlement_refund",
  expectedStatuses: readonly string[],
): Promise<void> {
  for (const expected of expectedStatuses) {
    const transfer = objectBody(
      await advanceScenario(origin, transferId, scenario),
      200,
    );
    assert.equal(transfer["status"], expected);
  }
}

function advanceScenario(
  origin: string,
  transferId: string,
  scenario:
    "happy_path" | "caliza_rejection" | "chapa_failure" | "settlement_refund",
): Promise<ApiResponse> {
  return apiRequest(
    origin,
    `/api/v1/dev/remittance/transfers/${transferId}/scenario`,
    { method: "POST", body: { scenario } },
  );
}

async function advanceWorkerUntil(
  runtime: DemoRuntime,
  origin: string,
  transferId: string,
  expectedStatus: string,
): Promise<void> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    if ((await getTransfer(origin, transferId))["status"] === expectedStatus) {
      return;
    }
    await runtime.advanceWorkerBatch(1);
    await wait(10);
  }
  assert.equal(
    (await getTransfer(origin, transferId))["status"],
    expectedStatus,
  );
}

async function getTransfer(
  origin: string,
  transferId: string,
): Promise<JsonObject> {
  return objectBody(
    await apiRequest(origin, `/api/v1/remittance/transfers/${transferId}`),
    200,
  );
}

async function getBalance(origin: string): Promise<Balance> {
  const accounts = arrayBody(await apiRequest(origin, "/api/v1/accounts"), 200);
  assert.equal(accounts.length, 1);
  return {
    book: moneyMinor(accounts[0]?.["bookBalance"]),
    available: moneyMinor(accounts[0]?.["availableBalance"]),
  };
}

async function holdState(transferId: string): Promise<string | undefined> {
  const result = await evidenceDatabase.pool.query<{ state: string }>(
    `SELECT state::text FROM samra_core.ledger_holds
     WHERE business_event_type = 'remittance_transfer'
       AND business_event_id = $1`,
    [transferId],
  );
  return result.rows[0]?.state;
}

async function assertJournalEvidence(
  transferId: string,
  expectedOriginals: number,
  expectedReversals: number,
): Promise<void> {
  const counts = await evidenceDatabase.pool.query<{
    originals: string;
    reversals: string;
    unbalanced: string;
  }>(
    `SELECT
       (SELECT count(*) FROM samra_core.ledger_journals
        WHERE business_event_id = $1 AND reverses_journal_id IS NULL)::text
          AS originals,
       (SELECT count(*) FROM samra_core.ledger_journals reversal
        JOIN samra_core.ledger_journals original
          ON original.id = reversal.reverses_journal_id
        WHERE original.business_event_id = $1)::text AS reversals,
       (SELECT count(*) FROM (
          SELECT journal.id FROM samra_core.ledger_journals journal
          JOIN samra_core.ledger_postings posting
            ON posting.journal_id = journal.id
          LEFT JOIN samra_core.ledger_journals original
            ON original.id = journal.reverses_journal_id
          WHERE journal.business_event_id = $1
             OR original.business_event_id = $1
          GROUP BY journal.id
          HAVING sum(posting.amount_minor) FILTER (WHERE posting.side = 'debit')
             <> sum(posting.amount_minor) FILTER (WHERE posting.side = 'credit')
        ) invalid)::text AS unbalanced`,
    [transferId],
  );
  assert.deepEqual(counts.rows[0], {
    originals: String(expectedOriginals),
    reversals: String(expectedReversals),
    unbalanced: "0",
  });
}

async function assertAuditActions(
  transferId: string,
  expectedActions: readonly string[],
): Promise<void> {
  const result = await evidenceDatabase.pool.query<{ action: string }>(
    `SELECT action FROM samra_core.audit_events
     WHERE correlation_id = $1 ORDER BY occurred_at, id`,
    [transferId],
  );
  const actions = new Set(result.rows.map(({ action }) => action));
  for (const action of expectedActions) {
    assert.ok(actions.has(action), `Missing ${action} audit for ${transferId}`);
  }
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
  const body = await response.json();
  assert.equal(response.status, 201, JSON.stringify(body));
  const cookie = response.headers.get("set-cookie")?.split(";", 1)[0];
  assert.ok(cookie);
  return { Cookie: cookie };
}

function objectResponse(
  origin: string,
  path: string,
  options: Readonly<{
    method?: string;
    headers?: Readonly<Record<string, string>>;
    body?: unknown;
  }>,
  status: number,
): Promise<JsonObject> {
  return apiRequest(origin, path, options).then((response) =>
    objectBody(response, status),
  );
}

function moneyMinor(value: unknown): bigint {
  assert.ok(typeof value === "object" && value !== null);
  const minorUnits = (value as JsonObject)["minorUnits"];
  assert.equal(typeof minorUnits, "string");
  return BigInt(minorUnits);
}

function objectBody(response: ApiResponse, status: number): JsonObject {
  assert.equal(response.status, status, JSON.stringify(response.body));
  assert.ok(
    typeof response.body === "object" &&
      response.body !== null &&
      !Array.isArray(response.body),
  );
  return response.body as JsonObject;
}

function arrayBody(response: ApiResponse, status: number): JsonObject[] {
  assert.equal(response.status, status, JSON.stringify(response.body));
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
  const responseText = await response.text();
  return {
    status: response.status,
    body: responseText ? (JSON.parse(responseText) as unknown) : {},
  };
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
