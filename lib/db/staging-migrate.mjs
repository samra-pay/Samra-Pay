import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const MIGRATION_LOCK = "783214905126";
export const migrationFolder = fileURLToPath(
  new URL("./drizzle", import.meta.url),
);

export function migrationCatalog(folder = migrationFolder) {
  const journal = JSON.parse(
    readFileSync(resolve(folder, "meta/_journal.json"), "utf8"),
  );
  assert(
    journal.dialect === "postgresql" && journal.entries?.length > 0,
    "Invalid migration journal",
  );
  return journal.entries.map((entry, index) => {
    assert(
      entry.idx === index &&
        new RegExp(`^${String(index).padStart(4, "0")}_[a-z0-9_]+$`).test(
          entry.tag,
        ),
      "Invalid migration sequence",
    );
    assert(
      Number.isSafeInteger(entry.when) &&
        entry.when > (journal.entries[index - 1]?.when ?? 0),
      "Invalid migration timestamp",
    );
    const sql = readFileSync(resolve(folder, `${entry.tag}.sql`));
    assert(sql.length > 0, "Empty migration");
    return {
      tag: entry.tag,
      createdAt: entry.when,
      hash: createHash("sha256").update(sql).digest("hex"),
    };
  });
}

export function verifyHistory(rows, catalog, complete = false) {
  assert(
    Array.isArray(rows) && rows.length <= catalog.length,
    "Database history is ahead of source",
  );
  const history = rows.map((row, index) => {
    const createdAt = Number(row.created_at);
    assert(
      row.hash === catalog[index].hash &&
        createdAt === catalog[index].createdAt,
      "Database migration history is not an exact source prefix",
    );
    return { hash: row.hash, createdAt };
  });
  if (complete)
    assert(
      history.length === catalog.length,
      "Database migration history is incomplete",
    );
  return history;
}

// Keep the advisory lock, Drizzle migration and journal reads on one connection.
// The lock rejects concurrent governed executions instead of retrying DDL.
export async function executeStagingMigration({
  client,
  migrate,
  catalog = migrationCatalog(),
}) {
  const identity = (
    await client.query(`SELECT current_database() AS database, current_user AS username,
    r.rolsuper, r.rolcreatedb, r.rolcreaterole, r.rolreplication, r.rolbypassrls,
    (SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()) AS encrypted
    FROM pg_roles r WHERE r.rolname = current_user`)
  ).rows[0];
  assert(
    identity?.database === "samra_staging" &&
      identity.username === "samra_migrations_staging" &&
      identity.encrypted === true,
    "Wrong migration database, identity or TLS transport",
  );
  for (const key of [
    "rolsuper",
    "rolcreatedb",
    "rolcreaterole",
    "rolreplication",
    "rolbypassrls",
  ])
    assert(identity[key] === false, "Elevated migration identity");
  const locked = (
    await client.query("SELECT pg_try_advisory_lock($1::bigint) AS acquired", [
      MIGRATION_LOCK,
    ])
  ).rows[0]?.acquired;
  assert(locked === true, "Another staging migration holds the lock");
  try {
    await client.query("SET statement_timeout = '540s'");
    await client.query("SET lock_timeout = '5s'");
    const exists = (
      await client.query(
        "SELECT to_regclass('samra_migrations.migration_history') AS history",
      )
    ).rows[0]?.history;
    const readHistory = async () =>
      (
        await client.query(
          "SELECT hash, created_at FROM samra_migrations.migration_history ORDER BY created_at, id",
        )
      ).rows;
    const before = verifyHistory(exists ? await readHistory() : [], catalog);
    await migrate(client);
    const after = verifyHistory(await readHistory(), catalog, true);
    return {
      catalog,
      before,
      after,
      appliedCount: after.length - before.length,
      database: identity.database,
      databaseUser: identity.username,
      encrypted: true,
    };
  } finally {
    await client.query("SELECT pg_advisory_unlock($1::bigint)", [
      MIGRATION_LOCK,
    ]);
  }
}

export function validateMigrationEnvironment(env, { bootstrap = false } = {}) {
  assert(
    env.NODE_ENV === "production" &&
      env.SAMRA_DEPLOYMENT_ENVIRONMENT === "staging",
    "Staging runtime required",
  );
  assert(
    /^[0-9a-f]{40}$/.test(env.SAMRA_CANDIDATE_SHA ?? ""),
    "Full candidate SHA required",
  );
  assert(
    /^[1-9][0-9]*$/.test(env.SAMRA_MIGRATION_SECRET_VERSION ?? ""),
    "Pinned secret version required",
  );
  const job = bootstrap
    ? "samra-database-access-bootstrap"
    : "samra-staging-migrations";
  assert(
    env.CLOUD_RUN_JOB === job &&
      new RegExp(`^${job}-[a-z0-9]+$`).test(env.CLOUD_RUN_EXECUTION ?? ""),
    "Governed job execution required",
  );
  assert(
    env.CLOUD_RUN_TASK_INDEX === "0" && env.CLOUD_RUN_TASK_ATTEMPT === "0",
    "One task without retry required",
  );
  assert(env.CLOUD_RUN_TASK_COUNT === "1", "One task required");
  if (!bootstrap) {
    const remaining = Date.parse(env.SAMRA_MIGRATION_EXPIRES_AT) - Date.now();
    assert(
      remaining >= 600000 && remaining <= 3600000,
      "Migration approval expired or has insufficient execution time",
    );
  }
  const url = new URL(env.DATABASE_URL);
  assert(
    url.protocol === "postgresql:" &&
      url.username === "samra_migrations_staging" &&
      url.pathname === "/samra_staging" &&
      /^10\.41\.\d{1,3}\.\d{1,3}$/.test(url.hostname) &&
      url.hostname.split(".").every((part) => Number(part) <= 255) &&
      ["", "5432"].includes(url.port),
    "Wrong private database target",
  );
  assert(
    ["require", "verify-ca", "verify-full"].includes(
      url.searchParams.get("sslmode"),
    ),
    "TLS database URL required",
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  let client;
  try {
    assert(
      process.argv.length === 2 ||
        (process.argv.length === 3 && process.argv[2] === "--bootstrap"),
      "Unsupported migration command",
    );
    const bootstrap = process.argv[2] === "--bootstrap";
    validateMigrationEnvironment(process.env, { bootstrap });
    const { default: pg } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    client = new pg.Client({
      connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: 10000,
    });
    await client.connect();
    const result = await executeStagingMigration({
      client,
      migrate: (connection) =>
        migrate(drizzle(connection), {
          migrationsFolder: migrationFolder,
          migrationsSchema: "samra_migrations",
          migrationsTable: "migration_history",
        }),
    });
    console.log(
      JSON.stringify({
        event: bootstrap
          ? "samra_staging_bootstrap_migration"
          : "samra_staging_migration",
        candidateSha: process.env.SAMRA_CANDIDATE_SHA,
        execution: process.env.CLOUD_RUN_EXECUTION,
        secretVersion: process.env.SAMRA_MIGRATION_SECRET_VERSION,
        ...result,
      }),
    );
  } catch {
    // SQL, provider errors and connection URLs must not enter release logs.
    console.error("Staging migration failed. No success evidence emitted.");
    process.exitCode = 1;
  } finally {
    await client?.end().catch(() => {
      process.exitCode = 1;
    });
  }
}
