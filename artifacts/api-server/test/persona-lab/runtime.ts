import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { RequestHandler } from "express";
import { UnauthorizedError } from "express-oauth2-jwt-bearer";
import pino from "pino";
import {
  createDatabase,
  PostgresLedgerBalanceProjection,
  PostgresPersistenceContext,
} from "@workspace/db";
import { runSharedTestOperation } from "../../../../lib/db/src/shared-test-operator";
import type { ApiRuntimeConfig } from "../../src/config";
import { createConfiguredDemoRuntime } from "../../src/domain/create-demo-runtime";
import type { DemoRuntime } from "../../src/domain/demo-runtime";
import type { PersonaAlias, PersonaManifest, ScenarioResult } from "./contract";
import {
  validateLocalDatabaseUrl,
  validatePersonaManifest,
} from "./contract.mjs";

type Json = Record<string, unknown>;
type Observations = ScenarioResult["observations"];
type Running = { server: Server; runtime: DemoRuntime; origin: string };
type Actor = {
  alias: PersonaAlias;
  subject: string;
  token: string;
  expires: number;
};
type Options = Readonly<{ connectionString: string; runId: string }>;

class HttpStatusMismatch extends Error {
  constructor(
    readonly expectedStatus: number,
    readonly actualStatus: number,
  ) {
    super("PERSONA_HTTP_STATUS_MISMATCH");
  }
}

function object(value: unknown): Json {
  assert.ok(value && typeof value === "object" && !Array.isArray(value));
  return value as Json;
}
function string(value: unknown): string {
  assert.equal(typeof value, "string");
  return value as string;
}
function array(value: unknown): unknown[] {
  assert.ok(Array.isArray(value));
  return value;
}
function minor(value: unknown): bigint {
  const amount = object(value);
  assert.equal(amount.currency, "USD");
  const result = string(amount.minorUnits);
  assert.match(result, /^-?[0-9]+$/u);
  return BigInt(result);
}

// createApp's default export reads process.env when imported. Keep that unused
// default disabled, and restore the caller's environment when the lab finishes.
// This local runner is intentionally one run per process, not concurrent.
const disabledDefault = {
  NODE_ENV: "test",
  SAMRA_BACKEND_MODE: "disabled",
  SAMRA_RELEASE_PROFILE: "demo",
  SAMRA_PERSISTENCE_MODE: "postgres",
  SAMRA_PROVIDER_MODE: "fake",
  SAMRA_CUSTOMER_AUTH_MODE: "disabled",
  SAMRA_CUSTOMER_IDENTITY_PROVIDER_MODE: "fake",
  SAMRA_CUSTOMER_WALLET_PROVIDER_MODE: "fake",
  SAMRA_RUN_WORKER: "false",
  SAMRA_INTERNAL_OPERATIONS_ENABLED: "false",
  SAMRA_ALLOWED_ORIGINS: "",
  SAMRA_TRUSTED_PROXIES: "",
};
let active = false;

/** Local engineering simulation; no actual Auth0 login or human consent occurs. */
export async function runPersonaJourneys(
  suppliedManifest: PersonaManifest,
  options: Options,
): Promise<readonly ScenarioResult[]> {
  const manifest = validatePersonaManifest(suppliedManifest) as PersonaManifest;
  const connectionString = validateLocalDatabaseUrl(options.connectionString);
  if (process.env.SAMRA_PERSONA_LAB_OWNED_DATABASE !== "true") {
    throw new Error("PERSONA_DATABASE_OWNERSHIP_REQUIRED");
  }
  const containerId = process.env.SAMRA_PERSONA_LAB_CONTAINER_ID;
  if (!containerId || !/^[0-9a-f]{64}$/u.test(containerId)) {
    throw new Error("PERSONA_CONTAINER_PROOF_REQUIRED");
  }
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(
      options.runId,
    )
  ) {
    throw new Error("PERSONA_RUN_ID_INVALID");
  }
  if (active) throw new Error("PERSONA_RUN_ALREADY_ACTIVE");
  active = true;
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries({
    ...disabledDefault,
    DATABASE_URL: connectionString,
  })) {
    previous.set(key, process.env[key]);
    process.env[key] = value;
  }
  const runDigest = createHash("sha256")
    .update(options.runId)
    .digest("hex")
    .slice(0, 24);
  const issuer = "https://persona-lab.invalid/";
  const audience = "https://persona-lab.invalid/api";
  const actors = Object.fromEntries(
    manifest.personas.map(({ alias }) => [
      alias,
      {
        alias,
        subject: `auth0|persona-lab-${runDigest}-${alias}`,
        token: `synthetic-${randomBytes(24).toString("hex")}`,
        expires: Math.floor(Date.now() / 1000) + 600,
      },
    ]),
  ) as Record<PersonaAlias, Actor>;
  const results: ScenarioResult[] = [];
  const connection = createDatabase({
    connectionString,
    poolConfig: { max: 2 },
  });
  const context = new PostgresPersistenceContext(connection.pool);
  let running: Running | undefined;
  const accounts = new Map<PersonaAlias, string>();
  const beneficiaries = new Map<PersonaAlias, string>();
  const wallets = new Map<PersonaAlias, Json>();
  let successQuote: Json;
  let successTransfer: Json;
  let successDebit = 0n;
  const transferKey = `persona-${runDigest}-success`;
  const config: ApiRuntimeConfig = {
    backendMode: "demo",
    persistenceMode: "postgres",
    providerMode: "fake",
    releaseProfile: "synthetic-shared",
    devControlsEnabled: false,
    internalOperationsEnabled: false,
    runWorker: false,
    workerIntervalMilliseconds: 5,
    allowedOrigins: [],
    trustedProxies: false,
    customerIdentityProvider: { mode: "fake" },
    customerWalletProvider: { mode: "fake" },
    customerAuth: {
      mode: "auth0",
      issuerBaseUrl: issuer,
      audience,
      tokenSigningAlgorithm: "RS256",
    },
  };
  // The only simulated boundary is external token authentication. Durable Samra
  // admission, identity mapping, activation, ownership and financial gates stay on.
  const authenticate: RequestHandler = (req, _res, next) => {
    const value = req.header("authorization");
    const actor = Object.values(actors).find(
      (item) => value === `Bearer ${item.token}`,
    );
    if (!actor || actor.expires <= Math.floor(Date.now() / 1000)) {
      next(new UnauthorizedError());
      return;
    }
    req.auth = {
      header: { alg: "RS256" },
      token: actor.token,
      payload: {
        iss: issuer,
        sub: actor.subject,
        aud: audience,
        exp: actor.expires,
      },
    };
    next();
  };
  async function start(): Promise<Running> {
    const { createApp } = await import("../../src/app");
    const runtime = createConfiguredDemoRuntime(config);
    try {
      const app = createApp(config, runtime, {
        customerAccessTokenMiddleware: authenticate,
        requestLogger: pino({ enabled: false }),
      });
      const server = await new Promise<Server>((resolve, reject) => {
        const candidate = app.listen(0, "127.0.0.1", () => resolve(candidate));
        candidate.once("error", reject);
      });
      const address = server.address() as AddressInfo;
      return { server, runtime, origin: `http://127.0.0.1:${address.port}` };
    } catch (error) {
      await runtime.close();
      throw error;
    }
  }
  async function close(current: Running): Promise<void> {
    try {
      if (current.server.listening) {
        await new Promise<void>((resolve, reject) => {
          current.server.close((error) => (error ? reject(error) : resolve()));
          current.server.closeIdleConnections();
        });
      }
    } finally {
      await current.runtime.close();
    }
  }
  async function request(
    alias: PersonaAlias | undefined,
    path: string,
    options: {
      method?: string;
      body?: unknown;
      key?: string;
      status?: number | readonly number[];
    } = {},
  ): Promise<unknown> {
    assert.ok(running);
    assert.ok(path.startsWith("/api/") && !path.includes("://"));
    const response = await fetch(running.origin + path, {
      method: options.method ?? "GET",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
      headers: {
        "content-type": "application/json",
        ...(alias ? { authorization: `Bearer ${actors[alias].token}` } : {}),
        ...(options.key ? { "Idempotency-Key": options.key } : {}),
      },
      ...(options.body === undefined
        ? {}
        : { body: JSON.stringify(options.body) }),
    });
    const body: unknown = await response.json();
    const expected = options.status ?? 200;
    const statuses: readonly number[] =
      typeof expected === "number" ? [expected] : expected;
    if (!statuses.includes(response.status))
      throw new HttpStatusMismatch(statuses[0]!, response.status);
    return body;
  }
  async function scenario(
    id: string,
    title: string,
    persona: PersonaAlias | "both",
    dependencies: string[],
    execute: () => Promise<Observations>,
  ): Promise<void> {
    if (
      dependencies.some(
        (dependency) =>
          !results.some(
            (result) => result.id === dependency && result.status === "passed",
          ),
      )
    ) {
      results.push({
        id,
        title,
        persona,
        status: "blocked",
        observations: {},
        errorCode: "PERSONA_DEPENDENCY_BLOCKED",
      });
      return;
    }
    try {
      results.push({
        id,
        title,
        persona,
        status: "passed",
        observations: await execute(),
      });
    } catch (error) {
      // Assertions and DB errors can contain private connection or identity data.
      // Retain only a source line and HTTP status numbers for bounded diagnosis.
      const sourceLines =
        error instanceof Error
          ? [
              ...(error.stack ?? "").matchAll(
                /\/persona-lab\/runtime\.(?:ts|js):(\d+):/gu,
              ),
            ].map((match) => match[1])
          : [];
      const line =
        error instanceof HttpStatusMismatch
          ? (sourceLines[1] ?? sourceLines[0])
          : sourceLines[0];
      const observations: Observations = line
        ? { failureLine: Number(line) }
        : {};
      if (error instanceof HttpStatusMismatch) {
        observations.expectedStatus = error.expectedStatus;
        observations.actualStatus = error.actualStatus;
      }
      results.push({
        id,
        title,
        persona,
        status: "failed",
        observations,
        errorCode:
          error instanceof HttpStatusMismatch
            ? "PERSONA_HTTP_STATUS_MISMATCH"
            : error instanceof assert.AssertionError
              ? "PERSONA_ASSERTION_FAILED"
              : "PERSONA_SCENARIO_FAILED",
      });
    }
  }
  async function balance(
    alias: PersonaAlias,
  ): Promise<{ book: bigint; available: bigint }> {
    const all = array(await request(alias, "/api/v1/accounts"));
    assert.equal(all.length, 1);
    const account = object(all[0]);
    assert.equal(account.id, accounts.get(alias));
    return {
      book: minor(account.bookBalance),
      available: minor(account.availableBalance),
    };
  }
  async function quote(
    alias: PersonaAlias,
    amountMinor = "1000",
  ): Promise<Json> {
    return object(
      await request(alias, "/api/v1/remittance/quotes", {
        method: "POST",
        status: 201,
        body: {
          sourceAccountId: accounts.get(alias),
          beneficiaryId: beneficiaries.get(alias),
          sendAmount: { currency: "USD", minorUnits: amountMinor },
          fundingMethod: "samra_balance",
          deliveryMethod: "bank",
        },
      }),
    );
  }
  async function advance(
    alias: PersonaAlias,
    id: string,
    expected: string,
  ): Promise<Json> {
    assert.ok(running);
    for (let attempt = 0; attempt < 30; attempt++) {
      await running.runtime.advanceWorkerBatch(10);
      const transfer = object(
        await request(alias, `/api/v1/remittance/transfers/${id}`),
      );
      if (transfer.status === expected) return transfer;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error("PERSONA_WORKER_DID_NOT_CONVERGE");
  }
  async function journalEvidence(id: string): Promise<Json> {
    const counts = await connection.pool.query(
      `SELECT
      (SELECT count(*)::text FROM samra_core.ledger_journals WHERE business_event_id=$1 AND reverses_journal_id IS NULL) AS originals,
      (SELECT count(*)::text FROM samra_core.ledger_journals r JOIN samra_core.ledger_journals o ON o.id=r.reverses_journal_id WHERE o.business_event_id=$1) AS reversals,
      (SELECT count(*)::text FROM samra_core.ledger_holds WHERE business_event_id=$1) AS holds,
      (SELECT count(*)::text FROM samra_core.ledger_hold_events e JOIN samra_core.ledger_holds h ON h.id=e.hold_id WHERE h.business_event_id=$1 AND e.event_type='captured') AS captures`,
      [id],
    );
    return object(counts.rows[0]);
  }
  try {
    await scenario(
      "environment",
      "Isolated local database and HTTP readiness",
      "both",
      [],
      async () => {
        // Created by the owning CLI through docker exec, not through this URL.
        // An existing database behind a loopback proxy cannot pass this proof.
        const guard = await connection.pool.query(
          "SELECT run_id, container_id FROM samra_persona_lab.guard LIMIT 2",
        );
        assert.deepEqual(guard.rows, [
          { run_id: options.runId, container_id: containerId },
        ]);
        const target = await connection.pool
          .query(`SELECT current_database() AS name,
        (SELECT count(*)::int FROM samra_core.customers) AS customers,
        (SELECT count(*)::int FROM samra_core.alpha_invitations) AS invitations,
        (SELECT count(*)::int FROM samra_core.ledger_journals) AS journals,
        (SELECT count(*)::int FROM samra_core.remittance_transfers) AS transfers`);
        assert.deepEqual(target.rows[0], {
          name: "samra_test",
          customers: 0,
          invitations: 0,
          journals: 0,
          transfers: 0,
        });
        running = await start();
        assert.deepEqual(await request(undefined, "/api/readyz"), {
          status: "ready",
        });
        await request(undefined, "/api/v1/accounts", { status: 401 });
        await request(
          "sender",
          "/api/v1/dev/onboarding/identity/fixture/decision",
          { method: "POST", body: {}, status: 404 },
        );
        await request("sender", "/api/v1/internal/operations/summary", {
          status: 404,
        });
        return {
          localDatabase: true,
          ownedDatabaseVerified: true,
          providersSimulated: true,
          authenticationSimulated: true,
          anonymousDenied: true,
          developerRoutesDisabled: true,
        };
      },
    );
    await scenario(
      "admission",
      "Exactly two artificial identities admitted",
      "both",
      ["environment"],
      async () => {
        await request("sender", "/api/v1/onboarding", {
          method: "POST",
          key: `before-${runDigest}`,
          status: 403,
        });
        const invitation = {
          operation: "invite" as const,
          environment: "test" as const,
          operatorAlias: "operator_persona_lab",
          issuer,
          subjects: [actors.sender.subject, actors.limited.subject] as [
            string,
            string,
          ],
          admissionLimit: 5 as const,
          expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        };
        const preview = await runSharedTestOperation(context, invitation);
        assert.equal(preview.applied, false);
        assert.equal(
          (
            await connection.pool.query(
              "SELECT count(*)::int AS count FROM samra_core.alpha_invitations",
            )
          ).rows[0].count,
          0,
        );
        await runSharedTestOperation(context, invitation, true);
        await runSharedTestOperation(context, invitation, true);
        assert.equal(
          (
            await connection.pool.query(
              "SELECT count(*)::int AS count FROM samra_core.alpha_invitations",
            )
          ).rows[0].count,
          2,
        );
        return {
          invitedPersonas: 2,
          uninvitedDenied: true,
          previewRolledBack: true,
          invitationReplayStable: true,
        };
      },
    );
    for (const persona of manifest.personas) {
      const { alias } = persona;
      await scenario(
        `onboarding-${alias}`,
        "Simulated consent, identity and durable wallet",
        alias,
        ["admission"],
        async () => {
          const key = (stage: string) =>
            `persona-${runDigest}-${alias}-${stage}`;
          const started = object(
            await request(alias, "/api/v1/onboarding", {
              method: "POST",
              key: key("start"),
              status: 201,
            }),
          );
          assert.equal(started.state, "consent_pending");
          const repeated = object(
            await request(alias, "/api/v1/onboarding", {
              method: "POST",
              key: key("start"),
              status: 200,
            }),
          );
          assert.equal(repeated.onboardingId, started.onboardingId);
          await request(alias, "/api/v1/accounts", { status: 403 });
          const bundle = object(started.consentBundle);
          const consent = {
            bundleVersion: bundle.bundleVersion,
            locale: bundle.locale,
            decisions: array(bundle.documents).map((item) => {
              const doc = object(item);
              return {
                consentType: doc.consentType,
                documentVersion: doc.documentVersion,
                decision: "accepted",
              };
            }),
          };
          const consented = await request(
            alias,
            "/api/v1/onboarding/consents",
            { method: "POST", body: consent, key: key("consent") },
          );
          assert.deepEqual(
            await request(alias, "/api/v1/onboarding/consents", {
              method: "POST",
              body: consent,
              key: key("consent"),
            }),
            consented,
          );
          const identity = object(
            await request(alias, "/api/v1/onboarding/identity", {
              method: "POST",
              key: key("identity"),
              status: 201,
            }),
          );
          assert.equal(identity.synthetic, true);
          await runSharedTestOperation(
            context,
            {
              operation: "identity-decision",
              environment: "test",
              operatorAlias: "operator_persona_lab",
              issuer,
              subject: actors[alias].subject,
              identityCaseId: string(identity.identityCaseId),
              decision: "approved",
              commandId: `synthetic_${runDigest}_${alias}`,
            },
            true,
          );
          assert.equal(
            object(await request(alias, "/api/v1/onboarding/identity")).state,
            "approved",
          );
          const disclosure = object(
            await request(alias, "/api/v1/onboarding/wallet/disclosure"),
          );
          assert.equal(disclosure.environment, "synthetic");
          const walletBody = {
            bundleVersion: disclosure.bundleVersion,
            documentVersion: disclosure.documentVersion,
            locale: disclosure.locale,
            decision: "accepted",
          };
          const wallet = object(
            await request(alias, "/api/v1/onboarding/wallet", {
              method: "POST",
              key: key("wallet"),
              body: walletBody,
              status: [200, 201],
            }),
          );
          assert.equal(wallet.state, "ready");
          assert.equal(wallet.synthetic, true);
          const replay = object(
            await request(alias, "/api/v1/onboarding/wallet", {
              method: "POST",
              key: key("wallet"),
              body: walletBody,
              status: [200, 201],
            }),
          );
          assert.deepEqual(replay, wallet);
          wallets.set(
            alias,
            object(await request(alias, "/api/v1/onboarding/wallet")),
          );
          const count = await connection.pool.query(
            `SELECT count(*)::int AS count FROM samra_core.customer_wallets w
          JOIN samra_core.customer_auth_identities a ON a.customer_id=w.customer_id WHERE a.issuer=$1 AND a.subject=$2`,
            [issuer, actors[alias].subject],
          );
          assert.equal(count.rows[0].count, 1);
          return {
            consentSimulated: true,
            identityApproved: true,
            walletCount: 1,
            walletReplayStable: true,
            financialAccessBeforeActivationDenied: true,
          };
        },
      );
    }
    await scenario(
      "funding",
      "Independent opening balances with no duplicate credit",
      "both",
      ["onboarding-sender", "onboarding-limited"],
      async () => {
        for (const persona of manifest.personas) {
          const funding = {
            operation: "fund-synthetic-account" as const,
            environment: "test" as const,
            operatorAlias: "operator_persona_lab",
            issuer,
            subject: actors[persona.alias].subject,
            amountMinor: persona.openingBalanceMinor,
          };
          await runSharedTestOperation(context, funding);
          await request(persona.alias, "/api/v1/accounts", { status: 403 });
          await runSharedTestOperation(context, funding, true);
          const first = array(await request(persona.alias, "/api/v1/accounts"));
          assert.equal(first.length, 1);
          accounts.set(persona.alias, string(object(first[0]).id));
          await runSharedTestOperation(context, funding, true);
          assert.deepEqual(
            await request(persona.alias, "/api/v1/accounts"),
            first,
          );
          assert.deepEqual(await balance(persona.alias), {
            book: BigInt(persona.openingBalanceMinor),
            available: BigInt(persona.openingBalanceMinor),
          });
        }
        assert.notEqual(accounts.get("sender"), accounts.get("limited"));
        assert.equal(
          (
            await connection.pool.query(
              "SELECT count(*)::int AS count FROM samra_core.ledger_journals WHERE business_event_type='synthetic_initial_credit'",
            )
          ).rows[0].count,
          2,
        );
        return {
          fundedPersonas: 2,
          balancedOpeningJournals: 2,
          creditReplayStable: true,
          distinctAccounts: true,
        };
      },
    );
    await scenario(
      "beneficiaries",
      "Each persona creates their own artificial recipient",
      "both",
      ["funding"],
      async () => {
        for (const persona of manifest.personas) {
          const recipient = object(
            await request(persona.alias, "/api/v1/beneficiaries", {
              method: "POST",
              status: 201,
              body: {
                displayName: `Synthetic ${persona.alias} recipient`,
                city: "Addis Ababa",
                countryCode: "ET",
                deliveryDetails: {
                  method: "bank",
                  bankId: "cbe",
                  accountNumber:
                    persona.alias === "sender"
                      ? "100000000001"
                      : "100000000002",
                },
              },
            }),
          );
          beneficiaries.set(persona.alias, string(recipient.id));
          const own = array(
            await request(persona.alias, "/api/v1/beneficiaries"),
          );
          assert.equal(own.length, 1);
          assert.equal(object(own[0]).id, recipient.id);
        }
        assert.notEqual(
          beneficiaries.get("sender"),
          beneficiaries.get("limited"),
        );
        return { recipientsCreated: 2, distinctOwners: true };
      },
    );
    await scenario(
      "transfer-success",
      "Synthetic remittance settles the server-quoted debit",
      "sender",
      ["beneficiaries"],
      async () => {
        const before = await balance("sender");
        const otherBefore = await balance("limited");
        successQuote = await quote("sender");
        successDebit = minor(successQuote.totalDebit);
        successTransfer = object(
          await request("sender", "/api/v1/remittance/transfers", {
            method: "POST",
            status: 201,
            key: transferKey,
            body: { quoteId: successQuote.id },
          }),
        );
        assert.deepEqual(await balance("sender"), {
          book: before.book,
          available: before.available - successDebit,
        });
        successTransfer = await advance(
          "sender",
          string(successTransfer.id),
          "completed",
        );
        const expected = {
          book: before.book - successDebit,
          available: before.available - successDebit,
        };
        const actual = await balance("sender");
        assert.deepEqual(actual, expected);
        assert.deepEqual(await balance("limited"), otherBefore);
        assert.deepEqual(await journalEvidence(string(successTransfer.id)), {
          originals: "3",
          reversals: "0",
          holds: "1",
          captures: "1",
        });
        return {
          status: "completed",
          debitMinor: successDebit.toString(),
          journalCount: 3,
          captureCount: 1,
          otherPersonaUnchanged: true,
          startingBookMinor: before.book.toString(),
          expectedBookMinor: expected.book.toString(),
          actualBookMinor: actual.book.toString(),
          expectedAvailableMinor: expected.available.toString(),
          actualAvailableMinor: actual.available.toString(),
        };
      },
    );
    await scenario(
      "duplicate-retry",
      "Retry reuses one transfer and one financial effect",
      "sender",
      ["transfer-success"],
      async () => {
        const before = await balance("sender");
        const evidence = await journalEvidence(string(successTransfer.id));
        const replay = object(
          await request("sender", "/api/v1/remittance/transfers", {
            method: "POST",
            status: 201,
            key: transferKey,
            body: { quoteId: successQuote.id },
          }),
        );
        assert.equal(replay.id, successTransfer.id);
        assert.deepEqual(await balance("sender"), before);
        assert.deepEqual(
          await journalEvidence(string(successTransfer.id)),
          evidence,
        );
        return { originalTransferReused: true, duplicateDebitCount: 0 };
      },
    );
    await scenario(
      "insufficient-funds",
      "Low-balance persona cannot overspend",
      "limited",
      ["beneficiaries"],
      async () => {
        const before = await balance("limited");
        const expensive = await quote("limited");
        assert.ok(minor(expensive.totalDebit) > before.available);
        const countBefore = (
          await connection.pool.query(
            "SELECT count(*)::int AS count FROM samra_core.ledger_holds",
          )
        ).rows[0].count;
        const key = `persona-${runDigest}-insufficient`;
        for (let attempt = 0; attempt < 2; attempt++) {
          const denied = object(
            await request("limited", "/api/v1/remittance/transfers", {
              method: "POST",
              status: 409,
              key,
              body: { quoteId: expensive.id },
            }),
          );
          assert.equal(denied.code, "INSUFFICIENT_FUNDS");
        }
        assert.deepEqual(await balance("limited"), before);
        assert.equal(
          (
            await connection.pool.query(
              "SELECT count(*)::int AS count FROM samra_core.ledger_holds",
            )
          ).rows[0].count,
          countBefore,
        );
        return { attemptsRejected: 2, extraHolds: 0, balanceUnchanged: true };
      },
    );
    await scenario(
      "account-isolation",
      "Account ownership separates both personas",
      "both",
      ["transfer-success"],
      async () => {
        for (const [alias, other] of [
          ["sender", "limited"],
          ["limited", "sender"],
        ] as const) {
          await request(
            alias,
            `/api/v1/beneficiaries/${beneficiaries.get(other)}`,
            { status: 404 },
          );
          await request(
            alias,
            `/api/v1/activity?accountId=${accounts.get(other)}`,
            { status: 404 },
          );
          await request(alias, "/api/v1/remittance/quotes", {
            method: "POST",
            status: 404,
            body: {
              sourceAccountId: accounts.get(other),
              beneficiaryId: beneficiaries.get(alias),
              sendAmount: { currency: "USD", minorUnits: "1000" },
              fundingMethod: "samra_balance",
              deliveryMethod: "bank",
            },
          });
        }
        await request(
          "limited",
          `/api/v1/remittance/transfers/${successTransfer.id}`,
          { status: 404 },
        );
        const expires = actors.sender.expires;
        try {
          actors.sender.expires = 0;
          await request("sender", "/api/v1/accounts", { status: 401 });
        } finally {
          actors.sender.expires = expires;
        }
        return {
          reciprocalRecipientDenied: true,
          reciprocalAccountDenied: true,
          otherTransferDenied: true,
          expiredFixtureDenied: true,
        };
      },
    );
    await scenario(
      "payout-refund",
      "Failed fake payout refunds the original balance",
      "sender",
      ["transfer-success", "duplicate-retry"],
      async () => {
        assert.ok(running);
        const before = await balance("sender");
        const pendingQuote = await quote("sender");
        const transfer = object(
          await request("sender", "/api/v1/remittance/transfers", {
            method: "POST",
            status: 201,
            key: `persona-${runDigest}-refund`,
            body: { quoteId: pendingQuote.id },
          }),
        );
        await running.runtime.repository.saveFakeScenario(
          string(transfer.id),
          "CHAPA_FAILURE",
        );
        const refunded = await advance(
          "sender",
          string(transfer.id),
          "refunded",
        );
        assert.equal(refunded.failureCode, "CHAPA_FAILED");
        assert.deepEqual(await balance("sender"), before);
        const evidence = await journalEvidence(string(transfer.id));
        assert.equal(evidence.originals, "2");
        assert.equal(evidence.reversals, "2");
        await running.runtime.advanceWorkerBatch(10);
        assert.deepEqual(await journalEvidence(string(transfer.id)), evidence);
        const actual = await balance("sender");
        assert.deepEqual(actual, before);
        return {
          status: "refunded",
          originalJournals: 2,
          reversalJournals: 2,
          balanceRestored: true,
          refundReplayStable: true,
          startingBookMinor: before.book.toString(),
          expectedBookMinor: before.book.toString(),
          actualBookMinor: actual.book.toString(),
          expectedAvailableMinor: before.available.toString(),
          actualAvailableMinor: actual.available.toString(),
        };
      },
    );
    await scenario(
      "restart-persistence",
      "Runtime restart retains identities, wallets and financial state",
      "both",
      ["account-isolation", "payout-refund", "insufficient-funds"],
      async () => {
        assert.ok(running);
        const before = new Map<PersonaAlias, unknown[]>();
        for (const { alias } of manifest.personas)
          before.set(
            alias,
            await Promise.all([
              request(alias, "/api/v1/accounts"),
              request(alias, "/api/v1/onboarding"),
              request(alias, "/api/v1/onboarding/wallet"),
              request(alias, "/api/v1/activity"),
            ]),
          );
        await close(running);
        running = undefined;
        running = await start();
        assert.deepEqual(await request(undefined, "/api/readyz"), {
          status: "ready",
        });
        for (const { alias } of manifest.personas) {
          assert.deepEqual(
            await Promise.all([
              request(alias, "/api/v1/accounts"),
              request(alias, "/api/v1/onboarding"),
              request(alias, "/api/v1/onboarding/wallet"),
              request(alias, "/api/v1/activity"),
            ]),
            before.get(alias),
          );
          assert.deepEqual(
            await request(alias, "/api/v1/onboarding/wallet"),
            wallets.get(alias),
          );
        }
        const replay = object(
          await request("sender", "/api/v1/remittance/transfers", {
            method: "POST",
            status: 201,
            key: transferKey,
            body: { quoteId: successQuote.id },
          }),
        );
        assert.equal(replay.id, successTransfer.id);
        assert.equal(
          object(
            await request(
              "sender",
              `/api/v1/remittance/transfers/${successTransfer.id}`,
            ),
          ).status,
          "completed",
        );
        await request(
          "limited",
          `/api/v1/remittance/transfers/${successTransfer.id}`,
          { status: 404 },
        );
        return {
          persistedPersonas: 2,
          walletsRetained: true,
          balancesRetained: true,
          activityRetained: true,
          transferRetryStable: true,
          isolationRetained: true,
        };
      },
    );
    await scenario(
      "ledger-integrity",
      "Independent journal, balance and hold verification",
      "both",
      ["funding", "transfer-success", "payout-refund", "insufficient-funds"],
      async () => {
        const checks = await connection.pool.query(`SELECT
        (SELECT count(*)::int FROM (SELECT j.id FROM samra_core.ledger_journals j JOIN samra_core.ledger_postings p ON p.journal_id=j.id GROUP BY j.id HAVING sum(CASE WHEN p.side='debit' THEN p.amount_minor ELSE -p.amount_minor END)<>0) bad) AS unbalanced,
        (SELECT count(*)::int FROM samra_core.ledger_account_balances b JOIN samra_core.ledger_accounts a ON a.id=b.account_id WHERE NOT a.allow_negative_available AND b.available_balance_minor<0) AS negative,
        (SELECT count(*)::int FROM samra_core.ledger_holds WHERE state='active') AS active_holds,
        (SELECT count(*)::int FROM samra_core.customer_wallets) AS wallets,
        (SELECT count(*)::int FROM samra_core.alpha_admissions) AS admissions`);
        assert.deepEqual(checks.rows[0], {
          unbalanced: 0,
          negative: 0,
          active_holds: 0,
          wallets: 2,
          admissions: 2,
        });
        const drift = await new PostgresLedgerBalanceProjection(context).verify(
          {
            sweepRef: `persona-${runDigest}`,
            actorType: "system",
            actorId: "persona-lab",
          },
        );
        assert.deepEqual(drift, []);
        const senderFinal = await balance("sender");
        const limitedFinal = await balance("limited");
        return {
          unbalancedJournals: 0,
          negativeBalances: 0,
          activeHolds: 0,
          projectionMismatches: 0,
          walletCount: 2,
          admittedPersonas: 2,
          senderFinalBookMinor: senderFinal.book.toString(),
          limitedFinalBookMinor: limitedFinal.book.toString(),
        };
      },
    );
  } finally {
    const cleanup = await Promise.allSettled([
      ...(running ? [close(running)] : []),
      connection.pool.end(),
    ]);
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    active = false;
    const passed = cleanup.every((item) => item.status === "fulfilled");
    results.push({
      id: "cleanup",
      title: "Local listener and database connections closed",
      persona: "both",
      status: passed ? "passed" : "failed",
      observations: { resourcesClosed: passed },
      ...(passed ? {} : { errorCode: "PERSONA_CLEANUP_FAILED" }),
    });
  }
  return results;
}
