import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import { createDatabase } from "@workspace/db";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const connectionString = process.env["TEST_DATABASE_URL"];
if (!connectionString) {
  throw new Error("TEST_DATABASE_URL is required for migration compatibility.");
}
const sourceUrl = new URL(connectionString);
if (!new Set(["127.0.0.1", "localhost"]).has(sourceUrl.hostname)) {
  throw new Error(
    "Migration compatibility can run only against a local disposable PostgreSQL service.",
  );
}

const execFileAsync = promisify(execFile);
const workspaceRoot = fileURLToPath(new URL("../../../", import.meta.url));
const migrationFolder = join(workspaceRoot, "lib/db/drizzle");

function databaseUrl(database: string): string {
  const url = new URL(connectionString!);
  url.pathname = `/${database}`;
  return url.toString();
}

async function seed(url: string): Promise<void> {
  await execFileAsync(
    "pnpm",
    ["--filter", "@workspace/db", "run", "test:seed"],
    {
      cwd: workspaceRoot,
      env: { ...process.env, TEST_DATABASE_URL: url },
      maxBuffer: 4 * 1024 * 1024,
    },
  );
}

async function createBaselineMigrationFolder(): Promise<string> {
  const folder = await mkdtemp(join(tmpdir(), "samra-migrations-0007-"));
  await mkdir(join(folder, "meta"), { recursive: true });
  const journal = JSON.parse(
    await readFile(join(migrationFolder, "meta/_journal.json"), "utf8"),
  ) as {
    version: string;
    dialect: string;
    entries: { idx: number; tag: string }[];
  };
  const baselineEntries = journal.entries.filter(({ idx }) => idx <= 7);
  assert.equal(baselineEntries.length, 8);
  for (const entry of baselineEntries) {
    await copyFile(
      join(migrationFolder, `${entry.tag}.sql`),
      join(folder, `${entry.tag}.sql`),
    );
  }
  await writeFile(
    join(folder, "meta/_journal.json"),
    `${JSON.stringify({ ...journal, entries: baselineEntries }, null, 2)}\n`,
    "utf8",
  );
  return folder;
}

test("RESILIENCE-WEEKLY-006 migration 0007 data upgrades to current and current replay is idempotent", async () => {
  const databaseName = `samra_upgrade_${randomUUID().replaceAll("-", "")}`;
  const adminUrl = new URL(connectionString);
  adminUrl.pathname = "/postgres";
  const admin = createDatabase({ connectionString: adminUrl.toString() });
  const targetUrl = databaseUrl(databaseName);
  let target: ReturnType<typeof createDatabase> | undefined;
  let baselineFolder: string | undefined;
  try {
    await admin.pool.query(`CREATE DATABASE "${databaseName}"`);
    target = createDatabase({ connectionString: targetUrl });
    baselineFolder = await createBaselineMigrationFolder();
    await migrate(drizzle(target.pool), {
      migrationsFolder: baselineFolder,
      migrationsSchema: "samra_migrations",
      migrationsTable: "migration_history",
    });
    await seed(targetUrl);

    const baseline = await target.pool.query<{
      migrations: string;
      customers: string;
      opening_journals: string;
      balance_table: string | null;
    }>(
      `SELECT
         (SELECT count(*) FROM samra_migrations.migration_history)::text AS migrations,
         (SELECT count(*) FROM samra_core.customers)::text AS customers,
         (SELECT count(*) FROM samra_core.ledger_journals
          WHERE business_event_type = 'demo_seed'
            AND business_event_id = 'opening_balance_001')::text AS opening_journals,
         to_regclass('samra_core.ledger_account_balances')::text AS balance_table`,
    );
    assert.deepEqual(baseline.rows[0], {
      migrations: "8",
      customers: "2",
      opening_journals: "1",
      balance_table: null,
    });

    await migrate(drizzle(target.pool), {
      migrationsFolder: migrationFolder,
      migrationsSchema: "samra_migrations",
      migrationsTable: "migration_history",
    });
    await seed(targetUrl);
    await seed(targetUrl);
    await migrate(drizzle(target.pool), {
      migrationsFolder: migrationFolder,
      migrationsSchema: "samra_migrations",
      migrationsTable: "migration_history",
    });

    const upgraded = await target.pool.query<{
      migrations: string;
      customers: string;
      opening_journals: string;
      natural_balance_minor: string;
      truth_balance_minor: string;
      quote_guard: string;
      resolution_columns: string;
      customer_auth_identity_table: string;
      customer_auth_identity_guard: string;
    }>(
      `SELECT
         (SELECT count(*) FROM samra_migrations.migration_history)::text AS migrations,
         (SELECT count(*) FROM samra_core.customers)::text AS customers,
         (SELECT count(*) FROM samra_core.ledger_journals
          WHERE business_event_type = 'demo_seed'
            AND business_event_id = 'opening_balance_001')::text AS opening_journals,
         (SELECT balance.natural_balance_minor::text
          FROM samra_core.ledger_account_balances balance
          JOIN samra_core.ledger_accounts account ON account.id = balance.account_id
          WHERE account.code = 'demo_usd_account_001') AS natural_balance_minor,
         (SELECT truth.natural_balance_minor::text
          FROM samra_core.ledger_account_balance_truth truth
          JOIN samra_core.ledger_accounts account ON account.id = truth.account_id
          WHERE account.code = 'demo_usd_account_001') AS truth_balance_minor,
         (SELECT count(*)::text FROM pg_trigger
          WHERE tgname = 'remittance_quotes_snapshot_immutable'
            AND NOT tgisinternal) AS quote_guard,
         (SELECT count(*)::text FROM information_schema.columns
          WHERE table_schema = 'samra_core'
            AND table_name = 'reconciliation_exceptions'
            AND column_name IN ('resolved_by','resolution_journal_id',
                                'resolution_idempotency_key')) AS resolution_columns,
         (SELECT count(*)::text FROM information_schema.tables
          WHERE table_schema = 'samra_core'
            AND table_name = 'customer_auth_identities')
           AS customer_auth_identity_table,
         (SELECT count(*)::text FROM pg_trigger
          WHERE tgname = 'customer_auth_identities_controlled_mutation'
            AND NOT tgisinternal) AS customer_auth_identity_guard`,
    );
    assert.deepEqual(upgraded.rows[0], {
      migrations: "12",
      customers: "2",
      opening_journals: "1",
      natural_balance_minor: "425000",
      truth_balance_minor: "425000",
      quote_guard: "1",
      resolution_columns: "3",
      customer_auth_identity_table: "1",
      customer_auth_identity_guard: "1",
    });
  } finally {
    if (target) await target.pool.end();
    if (baselineFolder)
      await rm(baselineFolder, { recursive: true, force: true });
    await admin.pool.query(
      `DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`,
    );
    await admin.pool.end();
  }
});
