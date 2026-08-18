import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { performance } from "node:perf_hooks";
import test from "node:test";
import {
  PostgresLedgerControl,
  PostgresLedgerBalanceProjection,
  PostgresPersistenceContext,
  createDatabase,
  ledgerCustomerBalanceSql,
} from "@workspace/db";

const connectionString = process.env["TEST_DATABASE_URL"];
if (!connectionString) {
  throw new Error(
    "TEST_DATABASE_URL is required for PostgreSQL performance characterization.",
  );
}

const smallPostingCount = positiveInteger(
  "LEDGER_PERF_SMALL_POSTINGS",
  100_000,
);
const largePostingCount = positiveInteger(
  "LEDGER_PERF_LARGE_POSTINGS",
  1_000_000,
);
const sampleCount = positiveInteger("LEDGER_PERF_SAMPLES", 40);
const resultsPath =
  process.env["LEDGER_PERF_RESULTS_PATH"] ??
  "test-results/ledger-performance-characterization.json";

if (largePostingCount <= smallPostingCount) {
  throw new Error(
    "LEDGER_PERF_LARGE_POSTINGS must exceed LEDGER_PERF_SMALL_POSTINGS.",
  );
}

type ScaleResult = Readonly<{
  postingsOnAccount: number;
  samples: number;
  p50Ms: number;
  p99Ms: number;
  minMs: number;
  maxMs: number;
  meanMs: number;
  explainAnalyze: unknown;
}>;

type PerformanceClient = Pick<
  ReturnType<typeof createDatabase>["pool"],
  "query"
>;

test("CLAUDE-LED-043 Balance read latency is characterised at scale", async () => {
  const opened = createDatabase({ connectionString, poolConfig: { max: 1 } });
  const context = new PostgresPersistenceContext(opened.pool);
  const ledger = new PostgresLedgerControl(context);
  const projection = new PostgresLedgerBalanceProjection(context);
  const fixtureId = randomUUID();
  const eventType = `ledger_performance_${fixtureId.replaceAll("-", "")}`;
  const accountRef = `ledger-performance:${fixtureId}`;
  const rollbackSignal = new Error("ledger-performance-rollback");
  let report: Record<string, unknown> | undefined;

  try {
    try {
      await context.run(async () => {
        const client = context.query();
        await client.query("SET LOCAL synchronous_commit = off");

        const product = await client.query<{ id: string }>(
          `INSERT INTO samra_core.product_accounts
           (customer_id, external_ref, kind, currency)
           SELECT id, $1, 'domestic_cash', 'USD'
           FROM samra_core.customers WHERE external_ref = 'demo_customer_001'
           RETURNING id`,
          [accountRef],
        );
        assert.ok(product.rows[0], "The synthetic customer seed must exist.");

        const ledgerAccount = await client.query<{ id: string }>(
          `INSERT INTO samra_core.ledger_accounts
           (code, name, account_class, normal_side, currency, product_account_id)
           VALUES ($1,$2,'liability','credit','USD',$3)
           RETURNING id`,
          [
            `ledger-performance:${fixtureId}`,
            "Synthetic balance performance account",
            product.rows[0]!.id,
          ],
        );
        const controlAccount = await client.query<{ id: string }>(
          `SELECT id FROM samra_core.ledger_accounts
           WHERE code = 'control_rain_usd' AND state = 'active'`,
        );
        assert.ok(
          controlAccount.rows[0],
          "The seeded control account must exist.",
        );

        const scales: ScaleResult[] = [];
        await insertPostingRange({
          client,
          eventType,
          targetAccountId: ledgerAccount.rows[0]!.id,
          controlAccountId: controlAccount.rows[0]!.id,
          first: 1,
          last: smallPostingCount,
        });
        await projection.rebuild({
          commandRef: `performance:${fixtureId}:100k`,
          operatorId: "performance-assurance",
          reason:
            "Rebuild the synthetic projection after the 100k fixture load.",
        });
        scales.push(
          await characterizeScale(
            client,
            ledger,
            accountRef,
            smallPostingCount,
            sampleCount,
          ),
        );

        await insertPostingRange({
          client,
          eventType,
          targetAccountId: ledgerAccount.rows[0]!.id,
          controlAccountId: controlAccount.rows[0]!.id,
          first: smallPostingCount + 1,
          last: largePostingCount,
        });
        await projection.rebuild({
          commandRef: `performance:${fixtureId}:1m`,
          operatorId: "performance-assurance",
          reason:
            "Rebuild the synthetic projection after the one-million fixture load.",
        });
        scales.push(
          await characterizeScale(
            client,
            ledger,
            accountRef,
            largePostingCount,
            sampleCount,
          ),
        );

        const p99Growth = scales[1]!.p99Ms / scales[0]!.p99Ms;
        const postingGrowth = largePostingCount / smallPostingCount;
        report = {
          testCase: "CLAUDE-LED-043",
          characterizedAt: new Date().toISOString(),
          nodeVersion: process.version,
          postgresVersion: (
            await client.query<{ version: string }>("SELECT version()")
          ).rows[0]!.version,
          outcome: "materialized_projection_pass",
          scales,
          growth: {
            postingMultiplier: round(postingGrowth),
            p99Multiplier: round(p99Growth),
            linearityRatio: round(p99Growth / postingGrowth),
          },
          suggestedRegressionWarning: {
            basis: "25ms absolute p99 ceiling at one million postings",
            p99Ms: 25,
          },
        };
        assert.ok(
          scales[1]!.p99Ms <= 25,
          `One-million-posting materialized balance p99 ${scales[1]!.p99Ms}ms exceeded 25ms.`,
        );
        assert.deepEqual(
          await projection.verify({
            sweepRef: `performance:${fixtureId}:drift`,
            actorType: "system",
            actorId: "performance-assurance",
          }),
          [],
        );
        throw rollbackSignal;
      });
    } catch (error) {
      if (error !== rollbackSignal) throw error;
    }

    assert.ok(
      report,
      "The performance report must be produced before rollback.",
    );
    await mkdir(dirname(resultsPath), { recursive: true });
    await writeFile(
      resultsPath,
      `${JSON.stringify(report, null, 2)}\n`,
      "utf8",
    );
    console.log(JSON.stringify(report));
    const residue = await opened.pool.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM samra_core.ledger_journals WHERE business_event_type = $1`,
      [eventType],
    );
    assert.equal(residue.rows[0]!.count, "0");
  } finally {
    await opened.pool.end();
  }
});

async function insertPostingRange(input: {
  client: PerformanceClient;
  eventType: string;
  targetAccountId: string;
  controlAccountId: string;
  first: number;
  last: number;
}): Promise<void> {
  await input.client.query(
    `ALTER TABLE samra_core.ledger_journals DISABLE TRIGGER USER`,
  );
  await input.client.query(
    `ALTER TABLE samra_core.ledger_postings DISABLE TRIGGER USER`,
  );
  await input.client.query(
    `INSERT INTO samra_core.ledger_journals
     (business_event_type, business_event_id, currency, state,
      description, posted_at, metadata)
     SELECT $1, series::text, 'USD', 'posted',
            'Synthetic balance performance fixture', now(),
            '{"synthetic":"true"}'::jsonb
     FROM generate_series($2::integer, $3::integer) AS series`,
    [input.eventType, input.first, input.last],
  );
  await input.client.query(
    `INSERT INTO samra_core.ledger_postings
     (journal_id, account_id, sequence, side, amount_minor)
     SELECT journal.id, $2::uuid, 1,
            'credit'::samra_core.ledger_entry_side, 1
     FROM samra_core.ledger_journals journal
     WHERE journal.business_event_type = $1
       AND journal.business_event_id::integer BETWEEN $4 AND $5
     UNION ALL
     SELECT journal.id, $3::uuid, 2,
            'debit'::samra_core.ledger_entry_side, 1
     FROM samra_core.ledger_journals journal
     WHERE journal.business_event_type = $1
       AND journal.business_event_id::integer BETWEEN $4 AND $5`,
    [
      input.eventType,
      input.targetAccountId,
      input.controlAccountId,
      input.first,
      input.last,
    ],
  );
  await input.client.query(
    `ALTER TABLE samra_core.ledger_postings ENABLE TRIGGER USER`,
  );
  await input.client.query(
    `ALTER TABLE samra_core.ledger_journals ENABLE TRIGGER USER`,
  );
  await input.client.query(`ANALYZE samra_core.ledger_journals`);
  await input.client.query(`ANALYZE samra_core.ledger_postings`);
}

async function characterizeScale(
  client: PerformanceClient,
  ledger: PostgresLedgerControl,
  accountRef: string,
  postingsOnAccount: number,
  samples: number,
): Promise<ScaleResult> {
  const plan = await client.query<{ "QUERY PLAN": unknown }>(
    `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${ledgerCustomerBalanceSql}`,
    [accountRef],
  );

  for (let index = 0; index < 3; index += 1) {
    await ledger.getCustomerBalance(accountRef);
  }
  const durations: number[] = [];
  for (let index = 0; index < samples; index += 1) {
    const startedAt = performance.now();
    const balance = await ledger.getCustomerBalance(accountRef);
    durations.push(performance.now() - startedAt);
    assert.deepEqual(balance, {
      naturalBalanceMinor: BigInt(postingsOnAccount),
      activeHoldsMinor: 0n,
      availableMinor: BigInt(postingsOnAccount),
    });
  }
  durations.sort((left, right) => left - right);

  return Object.freeze({
    postingsOnAccount,
    samples,
    p50Ms: percentile(durations, 0.5),
    p99Ms: percentile(durations, 0.99),
    minMs: round(durations[0]!),
    maxMs: round(durations.at(-1)!),
    meanMs: round(
      durations.reduce((total, duration) => total + duration, 0) /
        durations.length,
    ),
    explainAnalyze: plan.rows[0]!["QUERY PLAN"],
  });
}

function percentile(values: readonly number[], quantile: number): number {
  return round(values[Math.ceil(values.length * quantile) - 1]!);
}

function round(value: number): number {
  return Number(value.toFixed(3));
}

function positiveInteger(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}
