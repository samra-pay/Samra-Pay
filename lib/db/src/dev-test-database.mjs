import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const MIGRATIONS_URL = new URL("../drizzle/", import.meta.url);
const MIGRATION_TAG = /^\d{4}_[a-z0-9_]+$/;
const SHA256 = /^[a-f0-9]{64}$/;

// Native Dev/Test jobs only. Staging access contracts are intentionally unchanged.
export function configuration(env) {
  const name = env.SAMRA_DEPLOYMENT_ENVIRONMENT;
  assert(["dev", "test"].includes(name), "Dev or Test required");
  assert.equal(env.GOOGLE_CLOUD_PROJECT, `samra-pay-${name}`);
  return {
    name,
    database: `samra_${name}`,
    prefix: name === "dev" ? "10.61." : "10.71.",
    bootstrap: `samra_bootstrap_${name}`,
    migration: `samra_migrations_${name}`,
    runtime: `samra_runtime_${name}`,
    audit: `samra_audit_${name}`,
  };
}
export function connection(value, user, cfg) {
  const u = new URL(value);
  assert.equal(u.protocol, "postgresql:");
  assert.equal(decodeURIComponent(u.username), user);
  assert.equal(u.pathname, `/${cfg.database}`);
  assert.equal(u.port, "5432");
  const octets = u.hostname.split(".");
  assert(
    octets.length === 4 && octets.every((x) => /^\d+$/.test(x) && +x <= 255),
  );
  assert(u.hostname.startsWith(cfg.prefix));
  assert.equal(u.searchParams.get("sslmode"), "verify-ca");
  assert.equal(u.searchParams.get("sslrootcert"), "/secrets/ca/server-ca.pem");
  assert.equal(u.searchParams.get("uselibpqcompat"), "true");
  assert.deepEqual([...u.searchParams.keys()].sort(), [
    "sslmode",
    "sslrootcert",
    "uselibpqcompat",
  ]);
  assert(decodeURIComponent(u.password).length >= 32 && !u.hash);
  return u.toString();
}

export async function loadExpectedMigrationHistory(
  migrationsUrl = MIGRATIONS_URL,
) {
  const journal = JSON.parse(
    await readFile(new URL("meta/_journal.json", migrationsUrl), "utf8"),
  );
  assert(Array.isArray(journal.entries), "Migration journal entries required");
  const expected = [];
  let priorTimestamp = -1;
  for (const [position, entry] of journal.entries.entries()) {
    assert.equal(entry.idx, position, "Migration journal order is invalid");
    assert(
      MIGRATION_TAG.test(entry.tag),
      "Migration journal contains an invalid tag",
    );
    assert(
      Number.isSafeInteger(entry.when) && entry.when > priorTimestamp,
      "Migration journal timestamps must be strictly increasing",
    );
    const sql = await readFile(new URL(`${entry.tag}.sql`, migrationsUrl));
    expected.push(
      Object.freeze({
        tag: entry.tag,
        createdAt: String(entry.when),
        hash: createHash("sha256").update(sql).digest("hex"),
      }),
    );
    priorTimestamp = entry.when;
  }
  assert(expected.length > 0, "Migration journal cannot be empty");
  return Object.freeze(expected);
}

export function validateMigrationHistory(actual, expected, phase) {
  assert(
    phase === "before" || phase === "after",
    "Migration attestation phase must be before or after",
  );
  assert(Array.isArray(actual) && Array.isArray(expected));
  if (actual.length > expected.length) {
    throw new Error(
      "Database migration history contains an unrecognized future migration.",
    );
  }
  for (const [position, row] of actual.entries()) {
    const target = expected[position];
    if (!target || String(row.created_at) !== target.createdAt) {
      throw new Error(
        `Database migration history is missing or out of order at position ${position + 1}.`,
      );
    }
    if (typeof row.hash !== "string" || !SHA256.test(row.hash)) {
      throw new Error(
        `Database migration history has an invalid hash at position ${position + 1}.`,
      );
    }
    if (row.hash !== target.hash) {
      throw new Error(
        `Database migration history hash drifted for ${target.tag}.`,
      );
    }
  }
  if (phase === "after" && actual.length !== expected.length) {
    throw new Error(
      `Database migration history is incomplete after migration: expected ${expected.length} entries, found ${actual.length}.`,
    );
  }
  return Object.freeze({
    status: "validated",
    phase,
    migrationCount: actual.length,
    current: actual.length === expected.length,
  });
}

async function readDatabaseMigrationHistory(client) {
  const relation = await client.query(
    `SELECT to_regclass('samra_migrations.migration_history') IS NOT NULL AS present`,
  );
  if (relation.rows[0]?.present !== true) return [];
  const history = await client.query(
    `SELECT hash, created_at::text AS created_at
       FROM samra_migrations.migration_history
      ORDER BY id`,
  );
  return history.rows;
}

export async function attestMigrationHistory(client, expected, phase) {
  return validateMigrationHistory(
    await readDatabaseMigrationHistory(client),
    expected,
    phase,
  );
}

export async function migrateDatabase(
  client,
  { drizzle, migrate },
  migrationsUrl = MIGRATIONS_URL,
) {
  const expected = await loadExpectedMigrationHistory(migrationsUrl);
  const before = await attestMigrationHistory(client, expected, "before");
  await migrate(drizzle(client), {
    migrationsFolder: fileURLToPath(migrationsUrl),
    migrationsSchema: "samra_migrations",
    migrationsTable: "migration_history",
  });
  const after = await attestMigrationHistory(client, expected, "after");
  return Object.freeze({ before, after });
}

async function transaction(client, fn) {
  await client.query("BEGIN");
  try {
    await fn();
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
export async function bootstrap(client, cfg, passwords) {
  await transaction(client, async () => {
    const names = [cfg.migration, cfg.runtime, cfg.audit];
    const existing = await client.query(
      "SELECT rolname FROM pg_roles WHERE rolname=ANY($1)",
      [names],
    );
    assert.equal(
      existing.rows.length,
      0,
      "Roles already exist: audit before retry; never reset passwords",
    );
    await client.query("SET LOCAL ROLE cloudsqlsuperuser");
    for (let i = 0; i < names.length; i++) {
      assert(
        /^[A-Za-z0-9_-]{43,128}$/.test(passwords[i]),
        "Generated password required",
      );
      await client.query(
        "SELECT set_config('samra.setup_password', $1, true)",
        [passwords[i]],
      );
      // names are constructed exclusively from the dev/test allowlist.
      await client.query(
        `DO $setup$ BEGIN EXECUTE format('CREATE ROLE ${names[i]} LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', current_setting('samra.setup_password')); END $setup$;`,
      );
    }
    await client.query("RESET ROLE");
    await client.query(`REVOKE ALL ON DATABASE ${cfg.database} FROM PUBLIC;
      REVOKE CREATE ON SCHEMA public FROM PUBLIC;
      GRANT CONNECT, CREATE ON DATABASE ${cfg.database} TO ${cfg.migration};
      GRANT CONNECT ON DATABASE ${cfg.database} TO ${cfg.runtime}, ${cfg.audit};`);
  });
}
export async function finalize(client, cfg) {
  await transaction(client, async () => {
    await client.query(`REVOKE ALL ON SCHEMA samra_core, samra_migrations FROM PUBLIC;
      GRANT USAGE ON SCHEMA samra_core TO ${cfg.runtime}, ${cfg.audit};
      REVOKE ALL ON ALL TABLES IN SCHEMA samra_core FROM PUBLIC, ${cfg.runtime}, ${cfg.audit};
      REVOKE ALL ON ALL SEQUENCES IN SCHEMA samra_core FROM PUBLIC, ${cfg.runtime}, ${cfg.audit};
      REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA samra_core FROM PUBLIC, ${cfg.runtime}, ${cfg.audit};
      GRANT SELECT ON ALL TABLES IN SCHEMA samra_core TO ${cfg.audit};
      GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA samra_core TO ${cfg.runtime};
      REVOKE ALL ON samra_core.alpha_release_controls, samra_core.alpha_invitations, samra_core.alpha_admissions FROM ${cfg.runtime};
      DO $acl$ DECLARE r record; BEGIN
        FOR r IN SELECT c.relname, string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum) cols
          FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid
          WHERE n.nspname='samra_core' AND c.relname IN ('alpha_release_controls','alpha_invitations','alpha_admissions')
          AND a.attnum>0 AND NOT a.attisdropped GROUP BY c.relname
        LOOP EXECUTE format('REVOKE ALL (%s) ON samra_core.%I FROM PUBLIC, ${cfg.runtime}, ${cfg.audit}', r.cols, r.relname); END LOOP;
      END $acl$;
      GRANT SELECT ON samra_core.alpha_release_controls, samra_core.alpha_invitations TO ${cfg.runtime};
      GRANT UPDATE (release_id) ON samra_core.alpha_release_controls TO ${cfg.runtime};
      GRANT UPDATE (id) ON samra_core.alpha_invitations TO ${cfg.runtime};
      GRANT SELECT, INSERT ON samra_core.alpha_admissions TO ${cfg.runtime};
      ALTER DEFAULT PRIVILEGES IN SCHEMA samra_core REVOKE ALL ON TABLES FROM PUBLIC, ${cfg.runtime}, ${cfg.audit};
      ALTER DEFAULT PRIVILEGES IN SCHEMA samra_core REVOKE ALL ON SEQUENCES FROM PUBLIC, ${cfg.runtime}, ${cfg.audit};
      ALTER DEFAULT PRIVILEGES IN SCHEMA samra_core REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, ${cfg.runtime}, ${cfg.audit};`);
  });
}
export async function audit(client, cfg, role) {
  const identity = (
    await client.query("SELECT current_user, current_database()")
  ).rows[0];
  assert.equal(identity.current_user, cfg[role]);
  assert.equal(identity.current_database, cfg.database);
  const elevated = await client.query(
    `SELECT rolname FROM pg_roles WHERE rolname=ANY($1)
    AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls
      OR pg_has_role(rolname, 'cloudsqlsuperuser','MEMBER'))`,
    [[cfg.migration, cfg.runtime, cfg.audit]],
  );
  assert.equal(elevated.rowCount, 0, "Elevated permanent role");
  if (role === "migration") return;
  await client.query("SELECT 1 FROM samra_core.ledger_journals LIMIT 0");
  const denied = [
    "CREATE TEMP TABLE forbidden_probe(id int)",
    "CREATE TABLE samra_core.forbidden_probe(id int)",
    "SELECT 1 FROM samra_migrations.migration_history LIMIT 0",
    "DELETE FROM samra_core.audit_events WHERE false",
    "UPDATE samra_core.alpha_release_controls SET admission_limit=100 WHERE false",
    "UPDATE samra_core.alpha_invitations SET revoked_at=NULL WHERE false",
    "INSERT INTO samra_core.alpha_invitations(issuer,subject,expires_at) SELECT 'https://synthetic.invalid/','synthetic',now() WHERE false",
  ];
  if (role === "audit")
    denied.push(
      "UPDATE samra_core.audit_events SET metadata=metadata WHERE false",
    );
  for (const sql of denied) {
    await assert.rejects(client.query(sql), (error) => error.code === "42501");
  }
  if (role === "runtime") {
    await transaction(client, () =>
      client.query(
        "SELECT release_id FROM samra_core.alpha_release_controls FOR UPDATE",
      ),
    );
  }
}
export async function drain(client) {
  const result = await client.query(`SELECT
    (SELECT count(*) FROM samra_core.remittance_transfers WHERE state NOT IN ('completed','failed','cancelled','refunded','reversed'))::int AS active_transfers,
    (SELECT count(*) FROM samra_core.ledger_holds WHERE state='active')::int AS active_holds,
    (SELECT count(*) FROM samra_core.outbox_events WHERE state IN ('pending','processing','failed'))::int AS unresolved_outbox,
    (SELECT count(*) FROM samra_core.provider_events WHERE state IN ('received','deferred','failed'))::int AS unresolved_provider_events`);
  const counts = result.rows[0];
  assert(
    Object.values(counts).every((value) => value === 0),
    "Session has unresolved financial work; keep API and database running",
  );
  return counts;
}
export async function run(action, env = process.env) {
  const cfg = configuration(env);
  const roles = {
    bootstrap: "bootstrap",
    migrate: "migration",
    finalize: "migration",
    "audit-migration": "migration",
    "audit-runtime": "runtime",
    "audit-reader": "audit",
    drain: "audit",
  };
  assert(Object.hasOwn(roles, action), "Unsupported action");
  const role = roles[action];
  const payload =
    action === "bootstrap" ? JSON.parse(env.SAMRA_DATABASE_SETUP_JSON) : null;
  const url = connection(
    payload?.bootstrapDatabaseUrl ?? env.DATABASE_URL,
    cfg[role],
    cfg,
  );
  const { default: pg } = await import("pg");
  const client = new pg.Client({
    connectionString: url,
    connectionTimeoutMillis: 30000,
    statement_timeout: 120000,
  });
  await client.connect();
  try {
    assert.equal(
      (await client.query("SELECT current_database() AS name")).rows[0].name,
      cfg.database,
    );
    const lock = await client.query(
      "SELECT pg_try_advisory_lock(783214905127::bigint) AS locked",
    );
    assert(lock.rows[0].locked, "Another database operation is running");
    if (action === "bootstrap") {
      const urls = ["migration", "runtime", "audit"].map((key) =>
        connection(payload[`${key}DatabaseUrl`], cfg[key], cfg),
      );
      assert(urls.every((value) => new URL(value).host === new URL(url).host));
      await bootstrap(
        client,
        cfg,
        urls.map((value) => decodeURIComponent(new URL(value).password)),
      );
    } else if (action === "migrate") {
      const { drizzle } = await import("drizzle-orm/node-postgres");
      const { migrate } = await import("drizzle-orm/node-postgres/migrator");
      await migrateDatabase(client, { drizzle, migrate });
      await finalize(client, cfg);
      await audit(client, cfg, "migration");
    } else if (action === "finalize") await finalize(client, cfg);
    else if (action === "drain") await drain(client);
    else await audit(client, cfg, role);
    console.log(
      JSON.stringify({ status: "passed", environment: cfg.name, action }),
    );
  } finally {
    await client.end();
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    await run(process.argv[2]);
  } catch {
    console.error(
      "Dev/Test database operation failed. No credentials or database error details logged.",
    );
    process.exitCode = 1;
  }
}
