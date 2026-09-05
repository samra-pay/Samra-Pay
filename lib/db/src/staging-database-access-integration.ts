import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import {
  auditMigrationDatabaseAccess,
  auditRuntimeDatabaseAccess,
  bootstrapPermanentDatabasePrincipals,
  finalizeRuntimeDatabasePrivileges,
  STAGING_DATABASE_ACCESS,
  runStagingDatabaseAccessAction,
} from "./staging-database-access";

const { Client, Pool } = pg;

test("staging database access isolates permanent identities and runtime privileges", async () => {
  const controlUrl = process.env.TEST_DATABASE_URL;
  if (!controlUrl) {
    throw new Error(
      "TEST_DATABASE_URL is required for the disposable access-control integration test.",
    );
  }

  const password = (character: string) => character.repeat(64);
  const bootstrapPassword = password("b");
  const migrationPassword = password("m");
  const runtimePassword = password("r");

  function databaseUrl(user: string, userPassword: string): string {
    const value = new URL(controlUrl!);
    value.username = user;
    value.password = userPassword;
    value.pathname = `/${STAGING_DATABASE_ACCESS.database}`;
    return value.toString();
  }

  const admin = new Client({ connectionString: controlUrl });
  await admin.connect();

  async function dropTestState(): Promise<void> {
    await admin.query(
      `SELECT pg_terminate_backend(pid)
         FROM pg_stat_activity
        WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [STAGING_DATABASE_ACCESS.database],
    );
    await admin.query(
      `DROP DATABASE IF EXISTS ${STAGING_DATABASE_ACCESS.database}`,
    );
    for (const role of [
      STAGING_DATABASE_ACCESS.runtimeUser,
      STAGING_DATABASE_ACCESS.migrationUser,
      STAGING_DATABASE_ACCESS.runtimeRole,
      STAGING_DATABASE_ACCESS.migrationRole,
      STAGING_DATABASE_ACCESS.bootstrapUser,
      "cloudsqlsuperuser",
    ]) {
      await admin.query(`DROP ROLE IF EXISTS ${role}`);
    }
  }

  try {
    await dropTestState();
    await admin.query(
      "CREATE ROLE cloudsqlsuperuser NOLOGIN CREATEROLE CREATEDB",
    );
    await admin.query(
      `CREATE ROLE ${STAGING_DATABASE_ACCESS.bootstrapUser}
         LOGIN PASSWORD '${bootstrapPassword}'`,
    );
    await admin.query(
      `GRANT cloudsqlsuperuser TO ${STAGING_DATABASE_ACCESS.bootstrapUser}`,
    );
    await admin.query(
      `CREATE DATABASE ${STAGING_DATABASE_ACCESS.database}
         OWNER ${STAGING_DATABASE_ACCESS.bootstrapUser}`,
    );

    const payload = {
      bootstrapDatabaseUrl: databaseUrl(
        STAGING_DATABASE_ACCESS.bootstrapUser,
        bootstrapPassword,
      ),
      migrationDatabaseUrl: databaseUrl(
        STAGING_DATABASE_ACCESS.migrationUser,
        migrationPassword,
      ),
      runtimeDatabaseUrl: databaseUrl(
        STAGING_DATABASE_ACCESS.runtimeUser,
        runtimePassword,
      ),
    };

    const bootstrap = new Client({
      connectionString: payload.bootstrapDatabaseUrl,
    });
    await bootstrap.connect();
    try {
      await bootstrapPermanentDatabasePrincipals(bootstrap, payload);
    } finally {
      await bootstrap.end();
    }

    const migrationPool = new Pool({
      connectionString: payload.migrationDatabaseUrl,
      max: 1,
    });
    try {
      await migrate(drizzle(migrationPool), {
        migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
        migrationsSchema: "samra_migrations",
        migrationsTable: "migration_history",
      });
      await finalizeRuntimeDatabasePrivileges(migrationPool);
    } finally {
      await migrationPool.end();
    }

    await admin.query(
      `ALTER DATABASE ${STAGING_DATABASE_ACCESS.database} OWNER TO CURRENT_USER`,
    );
    await admin.query(`DROP ROLE ${STAGING_DATABASE_ACCESS.bootstrapUser}`);

    const migrationAudit = new Client({
      connectionString: payload.migrationDatabaseUrl,
    });
    await migrationAudit.connect();
    try {
      await auditMigrationDatabaseAccess(migrationAudit);
      await migrationAudit.query("SELECT pg_advisory_lock($1::bigint)", [
        "783214905126",
      ]);
      await assert.rejects(
        runStagingDatabaseAccessAction("audit-runtime", {
          DATABASE_URL: payload.runtimeDatabaseUrl,
        }),
        /Another staging database operation holds the lock/,
      );
      await migrationAudit.query("SELECT pg_advisory_unlock($1::bigint)", [
        "783214905126",
      ]);
      await runStagingDatabaseAccessAction("audit-runtime", {
        DATABASE_URL: payload.runtimeDatabaseUrl,
      });
    } finally {
      await migrationAudit.end();
    }

    const runtimeAudit = new Client({
      connectionString: payload.runtimeDatabaseUrl,
    });
    await runtimeAudit.connect();
    try {
      await auditRuntimeDatabaseAccess(runtimeAudit);
    } finally {
      await runtimeAudit.end();
    }
  } finally {
    try {
      await dropTestState();
    } finally {
      await admin.end();
    }
  }
});
