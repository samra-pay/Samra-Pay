import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import {
  AlphaAccessDeniedError,
  PostgresAlphaAccessStore,
} from "./postgres-alpha-access";
import { PostgresCustomerOnboardingStore } from "./postgres-customer-onboarding";
import { PostgresPersistenceContext } from "./postgres-persistence";
import {
  auditMigrationDatabaseAccess,
  auditRuntimeDatabaseAccess,
  bootstrapPermanentDatabasePrincipals,
  finalizeRuntimeDatabasePrivileges,
  STAGING_DATABASE_ACCESS,
  runStagingDatabaseAccessAction,
} from "./staging-database-access";

const { Client, Pool } = pg;

test("staging database access isolates permanent identities and runtime privileges", async (t) => {
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

    await t.test(
      "restricted runtime admits only eligible users and preserves the cohort under concurrency and restart",
      async () => {
        await proveAlphaRuntimeAdmission(
          payload.migrationDatabaseUrl,
          payload.runtimeDatabaseUrl,
        );
      },
    );
    await t.test(
      "audits reject direct and inherited alpha grants and finalization clears stale column ACLs",
      async () => {
        const owner = new Client({
          connectionString: payload.migrationDatabaseUrl,
        });
        const runtime = new Client({
          connectionString: payload.runtimeDatabaseUrl,
        });
        await owner.connect();
        await runtime.connect();
        try {
          for (const grant of [
            "GRANT UPDATE (admission_limit) ON samra_core.alpha_release_controls TO samra_runtime_staging",
            "GRANT UPDATE (revoked_at) ON samra_core.alpha_invitations TO samra_runtime",
            "GRANT INSERT (issuer, subject, expires_at) ON samra_core.alpha_invitations TO PUBLIC",
            "GRANT UPDATE ON samra_core.alpha_admissions TO samra_runtime",
            "GRANT UPDATE (id) ON samra_core.alpha_invitations TO samra_runtime_staging WITH GRANT OPTION",
          ]) {
            await owner.query(grant);
            await assert.rejects(
              auditMigrationDatabaseAccess(owner),
              /Alpha runtime .* privileges drifted/,
            );
            await assert.rejects(
              auditRuntimeDatabaseAccess(runtime),
              /Alpha runtime .* privileges drifted/,
            );
            await finalizeRuntimeDatabasePrivileges(owner);
            await auditMigrationDatabaseAccess(owner);
            await auditRuntimeDatabaseAccess(runtime);
          }
          await owner.query(
            "ALTER DEFAULT PRIVILEGES IN SCHEMA samra_core GRANT SELECT, INSERT, UPDATE ON TABLES TO samra_runtime",
          );
          await assert.rejects(
            auditMigrationDatabaseAccess(owner),
            /Future objects must deny runtime access/,
          );
          await finalizeRuntimeDatabasePrivileges(owner);
          await auditMigrationDatabaseAccess(owner);
        } finally {
          await runtime.end();
          await owner.end();
        }
      },
    );
  } finally {
    try {
      await dropTestState();
    } finally {
      await admin.end();
    }
  }
});

async function proveAlphaRuntimeAdmission(
  migrationUrl: string,
  runtimeUrl: string,
): Promise<void> {
  const owner = new Client({ connectionString: migrationUrl });
  let pool = new Pool({ connectionString: runtimeUrl, max: 4 });
  await owner.connect();
  const issuer = "https://alpha-access.samra.test/";
  const input = (subject: string) => ({
    issuer,
    subject,
    idempotencyKey: `access-${subject}`,
  });
  const makeStores = () => {
    const context = new PostgresPersistenceContext(pool);
    const access = new PostgresAlphaAccessStore(context);
    return {
      context,
      access,
      onboarding: new PostgresCustomerOnboardingStore(context, access),
    };
  };
  let stores = makeStores();
  const count = async () =>
    Number(
      (await pool.query("SELECT count(*) FROM samra_core.alpha_admissions"))
        .rows[0].count,
    );
  try {
    await owner.query(
      `INSERT INTO samra_core.alpha_invitations (issuer, subject, expires_at)
       SELECT $1, 'auth0|access-' || n, now() + interval '1 hour' FROM generate_series(0, 6) AS n`,
      [issuer],
    );
    await assert.rejects(
      stores.onboarding.startAuth0Onboarding(input("auth0|access-0")),
      AlphaAccessDeniedError,
    );
    await owner.query(
      "UPDATE samra_core.alpha_release_controls SET admission_limit = 5",
    );
    await assert.rejects(
      stores.onboarding.startAuth0Onboarding(input("auth0|uninvited")),
      AlphaAccessDeniedError,
    );
    assert.equal(
      (await pool.query("SELECT count(*) FROM samra_core.customers")).rows[0]
        .count,
      "0",
    );

    // A failed application transaction releases its customer, identity and admission.
    await assert.rejects(
      stores.context.run(async () => {
        await stores.onboarding.startAuth0Onboarding(input("auth0|access-0"));
        throw new Error("controlled rollback");
      }),
      /controlled rollback/,
    );
    assert.equal(await count(), 0);

    // The runtime still locks both operator-owned rows until admission commits.
    await owner.query("SET lock_timeout = '100ms'");
    await stores.context.run(async () => {
      await stores.onboarding.startAuth0Onboarding(input("auth0|access-0"));
      for (const statement of [
        "UPDATE samra_core.alpha_release_controls SET admission_limit = 0",
        "UPDATE samra_core.alpha_invitations SET revoked_at = now() WHERE subject = 'auth0|access-0'",
      ]) {
        await assert.rejects(owner.query(statement), { code: "55P03" });
      }
    });
    await owner.query("SET lock_timeout = 0");

    const results = await Promise.allSettled(
      Array.from({ length: 6 }, (_, i) =>
        stores.onboarding.startAuth0Onboarding(input(`auth0|access-${i + 1}`)),
      ),
    );
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 4);
    for (const result of results) {
      if (result.status === "rejected")
        assert.ok(result.reason instanceof AlphaAccessDeniedError);
    }
    assert.equal(await count(), 5);
    assert.equal(
      (await pool.query("SELECT count(*) FROM samra_core.customers")).rows[0]
        .count,
      "5",
    );

    const original = await stores.onboarding.startAuth0Onboarding(
      input("auth0|access-0"),
    );
    await pool.end();
    pool = new Pool({ connectionString: runtimeUrl, max: 2 });
    stores = makeStores();
    await owner.query(
      "UPDATE samra_core.alpha_release_controls SET admission_limit = 0",
    );
    await owner.query(
      "UPDATE samra_core.alpha_invitations SET expires_at = now() - interval '1 hour'",
    );
    const returned = await stores.onboarding.startAuth0Onboarding({
      ...input("auth0|access-0"),
      idempotencyKey: "after-restart",
    });
    assert.equal(returned.snapshot.customerId, original.snapshot.customerId);
    assert.equal(returned.created, false);
    await stores.access.assertAuth0Access(input("auth0|access-0"));
    assert.equal(await count(), 5);

    // Column privileges exist only to acquire locks; existing constraints prevent key changes.
    await assert.rejects(
      pool.query(
        "UPDATE samra_core.alpha_release_controls SET release_id = 'different-release'",
      ),
      { code: "23514" },
    );
    await assert.rejects(
      pool.query(
        "UPDATE samra_core.alpha_invitations SET id = gen_random_uuid() WHERE subject = 'auth0|access-0'",
      ),
      { code: "23514" },
    );
    await assert.rejects(
      pool.query(
        "UPDATE samra_core.alpha_release_controls SET admission_limit = 100",
      ),
      { code: "42501" },
    );
    await assert.rejects(
      pool.query(
        "UPDATE samra_core.alpha_invitations SET revoked_at = NULL, expires_at = now() + interval '1 year'",
      ),
      { code: "42501" },
    );
    await assert.rejects(
      pool.query("UPDATE samra_core.alpha_admissions SET slot = slot"),
      { code: "42501" },
    );
    await assert.rejects(
      pool.query("DELETE FROM samra_core.alpha_admissions"),
      { code: "42501" },
    );

    await owner.query(
      "UPDATE samra_core.alpha_invitations SET revoked_at = now() WHERE subject = 'auth0|access-0'",
    );
    await assert.rejects(
      stores.access.assertAuth0Access(input("auth0|access-0")),
      AlphaAccessDeniedError,
    );
    await assert.rejects(
      stores.onboarding.startAuth0Onboarding(input("auth0|access-0")),
      AlphaAccessDeniedError,
    );
    assert.equal(await count(), 5);
  } finally {
    await pool.end();
    await owner.end();
  }
}
