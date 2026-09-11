import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import {
  configuration,
  bootstrap,
  finalize,
  audit,
  drain,
} from "./dev-test-database.mjs";

test("disposable Dev/Test roles migrate, enforce admission ACLs and drain safely", async () => {
  const control = process.env.TEST_DATABASE_URL;
  assert(control, "Explicit disposable TEST_DATABASE_URL required");
  const controlUrl = new URL(control);
  assert(
    ["localhost", "127.0.0.1"].includes(controlUrl.hostname),
    "Disposable loopback only",
  );
  const admin = new pg.Client({ connectionString: control });
  await admin.connect();
  // Never drop an existing database or role to make a test pass.
  const cfg = configuration({
    SAMRA_DEPLOYMENT_ENVIRONMENT: "dev",
    GOOGLE_CLOUD_PROJECT: "samra-pay-dev",
  });
  const pwd = "s".repeat(64);
  const made = [];
  let created = false;
  const url = (user) => {
    const u = new URL(control);
    u.username = user;
    u.password = pwd;
    u.pathname = "/samra_dev";
    return u.toString();
  };
  try {
    const exists = await admin.query(
      "SELECT 1 FROM pg_roles WHERE rolname='cloudsqlsuperuser'",
    );
    if (!exists.rowCount) {
      await admin.query(
        "CREATE ROLE cloudsqlsuperuser NOLOGIN CREATEROLE CREATEDB",
      );
      made.push("cloudsqlsuperuser");
    }
    await admin.query(`CREATE ROLE ${cfg.bootstrap} LOGIN PASSWORD '${pwd}'`);
    made.push(cfg.bootstrap);
    await admin.query(`GRANT cloudsqlsuperuser TO ${cfg.bootstrap}`);
    await admin.query(`CREATE DATABASE ${cfg.database} OWNER ${cfg.bootstrap}`);
    created = true;
    const setup = new pg.Client({ connectionString: url(cfg.bootstrap) });
    await setup.connect();
    try {
      await bootstrap(setup, cfg, [pwd, pwd, pwd]);
      made.push(cfg.migration, cfg.runtime, cfg.audit);
      await assert.rejects(
        bootstrap(setup, cfg, [pwd, pwd, pwd]),
        /already exist/,
      );
    } finally {
      await setup.end();
    }
    const migration = new pg.Client({ connectionString: url(cfg.migration) });
    await migration.connect();
    try {
      await migrate(drizzle(migration), {
        migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
        migrationsSchema: "samra_migrations",
        migrationsTable: "migration_history",
      });
      await finalize(migration, cfg);
      await finalize(migration, cfg);
      await audit(migration, cfg, "migration");
      await migration.query(
        "CREATE TABLE samra_core.future_private_table(id integer)",
      );
      const priv = await migration.query(
        "SELECT has_table_privilege($1,'samra_core.future_private_table','SELECT') AS allowed",
        [cfg.runtime],
      );
      assert.equal(priv.rows[0].allowed, false);
    } finally {
      await migration.end();
    }
    for (const role of ["runtime", "audit"]) {
      const client = new pg.Client({ connectionString: url(cfg[role]) });
      await client.connect();
      try {
        await audit(client, cfg, role);
        await drain(client);
      } finally {
        await client.end();
      }
    }
  } finally {
    if (created) await admin.query(`DROP DATABASE ${cfg.database}`);
    // Roles belong exclusively to this test; revoke creator memberships before removing them.
    for (const role of made.reverse()) await admin.query(`DROP ROLE ${role}`);
    await admin.end();
  }
});
