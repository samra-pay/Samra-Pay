import { randomUUID } from "node:crypto";
import pg from "pg";

const { Client } = pg;

export const STAGING_DATABASE_ACCESS = Object.freeze({
  database: "samra_staging",
  schemas: ["samra_core", "samra_migrations"] as const,
  bootstrapUser: "samra_bootstrap_staging",
  migrationRole: "samra_migrator",
  migrationUser: "samra_migrations_staging",
  runtimeRole: "samra_runtime",
  runtimeUser: "samra_runtime_staging",
});

export interface BootstrapPayload {
  bootstrapDatabaseUrl: string;
  migrationDatabaseUrl: string;
  runtimeDatabaseUrl: string;
}

interface QueryResult<Row extends pg.QueryResultRow = pg.QueryResultRow> {
  rows: Row[];
  rowCount: number | null;
}

export interface Queryable {
  query<Row extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<Row>>;
}

function requireDatabaseUrl(
  value: unknown,
  expectedUser: string,
  field: string,
): string {
  if (typeof value !== "string") {
    throw new Error(`${field} must be a PostgreSQL URL`);
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${field} must be a PostgreSQL URL`);
  }

  const privateAddress = parsed.hostname.match(
    /^10\.41\.(\d{1,3})\.(\d{1,3})$/u,
  );

  if (
    parsed.protocol !== "postgresql:" ||
    decodeURIComponent(parsed.username) !== expectedUser ||
    parsed.pathname !== `/${STAGING_DATABASE_ACCESS.database}` ||
    parsed.port !== "5432" ||
    !privateAddress ||
    Number(privateAddress[1]) > 255 ||
    Number(privateAddress[2]) > 255 ||
    parsed.searchParams.get("sslmode") !== "require" ||
    !parsed.password ||
    Buffer.byteLength(decodeURIComponent(parsed.password), "utf8") < 32
  ) {
    throw new Error(`${field} does not match the staging access contract`);
  }

  return value;
}

export function parseBootstrapPayload(raw: string): BootstrapPayload {
  let candidate: Record<string, unknown>;
  try {
    candidate = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error("The bootstrap payload is not valid JSON");
  }

  const payload = {
    bootstrapDatabaseUrl: requireDatabaseUrl(
      candidate.bootstrapDatabaseUrl,
      STAGING_DATABASE_ACCESS.bootstrapUser,
      "bootstrapDatabaseUrl",
    ),
    migrationDatabaseUrl: requireDatabaseUrl(
      candidate.migrationDatabaseUrl,
      STAGING_DATABASE_ACCESS.migrationUser,
      "migrationDatabaseUrl",
    ),
    runtimeDatabaseUrl: requireDatabaseUrl(
      candidate.runtimeDatabaseUrl,
      STAGING_DATABASE_ACCESS.runtimeUser,
      "runtimeDatabaseUrl",
    ),
  };

  if (new Set(Object.values(payload)).size !== 3) {
    throw new Error("Bootstrap, migration, and runtime URLs must be distinct");
  }

  const hosts = new Set(
    Object.values(payload).map((value) => new URL(value).host),
  );
  if (hosts.size !== 1) {
    throw new Error("All database identities must target the same instance");
  }

  return payload;
}

function passwordFromUrl(value: string): string {
  return decodeURIComponent(new URL(value).password);
}

async function inTransaction<T>(
  client: Queryable,
  operation: () => Promise<T>,
): Promise<T> {
  await client.query("BEGIN");
  try {
    const result = await operation();
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

export async function bootstrapPermanentDatabasePrincipals(
  client: Queryable,
  payload: BootstrapPayload,
): Promise<void> {
  const runtimePassword = passwordFromUrl(payload.runtimeDatabaseUrl);
  const migrationPassword = passwordFromUrl(payload.migrationDatabaseUrl);

  await client.query("SET search_path TO pg_catalog");
  await inTransaction(client, async () => {
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      ["samra-staging-database-access-v1"],
    );
    await client.query(`
      DO $samra$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'samra_migrator') THEN
          CREATE ROLE samra_migrator NOLOGIN NOCREATEDB NOCREATEROLE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'samra_runtime') THEN
          CREATE ROLE samra_runtime NOLOGIN NOCREATEDB NOCREATEROLE;
        END IF;
      END
      $samra$;

      ALTER ROLE samra_migrator NOLOGIN NOCREATEDB NOCREATEROLE;
      ALTER ROLE samra_runtime NOLOGIN NOCREATEDB NOCREATEROLE;
    `);

    await client.query(
      "SELECT set_config('samra.migration_password', $1, true), set_config('samra.runtime_password', $2, true)",
      [migrationPassword, runtimePassword],
    );
    await client.query(`
      DO $samra$
      DECLARE
        migration_password text := current_setting('samra.migration_password');
        runtime_password text := current_setting('samra.runtime_password');
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'samra_migrations_staging') THEN
          EXECUTE format(
            'CREATE ROLE samra_migrations_staging LOGIN INHERIT PASSWORD %L NOCREATEDB NOCREATEROLE',
            migration_password
          );
        ELSE
          EXECUTE format('ALTER ROLE samra_migrations_staging PASSWORD %L', migration_password);
        END IF;

        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'samra_runtime_staging') THEN
          EXECUTE format(
            'CREATE ROLE samra_runtime_staging LOGIN INHERIT PASSWORD %L NOCREATEDB NOCREATEROLE',
            runtime_password
          );
        ELSE
          EXECUTE format('ALTER ROLE samra_runtime_staging PASSWORD %L', runtime_password);
        END IF;
      END
      $samra$;

      ALTER ROLE samra_migrations_staging LOGIN INHERIT NOCREATEDB NOCREATEROLE;
      ALTER ROLE samra_runtime_staging LOGIN INHERIT NOCREATEDB NOCREATEROLE;

      GRANT samra_migrator TO samra_migrations_staging;
      GRANT samra_runtime TO samra_runtime_staging;

      DO $samra$
      BEGIN
        IF EXISTS (
          SELECT 1
            FROM pg_roles
           WHERE rolname IN (
             'samra_migrator',
             'samra_migrations_staging',
             'samra_runtime',
             'samra_runtime_staging'
           )
             AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)
        ) THEN
          RAISE EXCEPTION 'A permanent Samra role has elevated attributes';
        END IF;

        IF EXISTS (
          SELECT 1
            FROM pg_auth_members membership
            JOIN pg_roles parent ON parent.oid = membership.roleid
            JOIN pg_roles member ON member.oid = membership.member
           WHERE parent.rolname = 'cloudsqlsuperuser'
             AND member.rolname IN ('samra_migrations_staging', 'samra_runtime_staging')
        ) THEN
          RAISE EXCEPTION 'A permanent Samra login inherited cloudsqlsuperuser';
        END IF;
      END
      $samra$;

      REVOKE CONNECT, TEMPORARY ON DATABASE samra_staging FROM PUBLIC;
      REVOKE ALL PRIVILEGES ON DATABASE samra_staging FROM samra_migrator;
      REVOKE ALL PRIVILEGES ON DATABASE samra_staging FROM samra_runtime;
      GRANT CONNECT, CREATE ON DATABASE samra_staging TO samra_migrator;
      GRANT CONNECT ON DATABASE samra_staging TO samra_runtime;
      REVOKE CREATE ON SCHEMA public FROM PUBLIC;
    `);
  });
}

export async function finalizeRuntimeDatabasePrivileges(
  client: Queryable,
): Promise<void> {
  await inTransaction(client, async () => {
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      ["samra-staging-database-access-v1"],
    );
    await client.query(`
      REVOKE ALL PRIVILEGES ON SCHEMA samra_core FROM PUBLIC;
      GRANT USAGE ON SCHEMA samra_core TO samra_runtime;

      REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA samra_core FROM PUBLIC;
      REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA samra_core FROM samra_runtime;
      GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA samra_core TO samra_runtime;

      REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA samra_core FROM PUBLIC;
      REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA samra_core FROM samra_runtime;
      REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA samra_core FROM PUBLIC;
      REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA samra_core FROM samra_runtime;

      ALTER DEFAULT PRIVILEGES FOR ROLE samra_migrations_staging IN SCHEMA samra_core
        REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC;
      ALTER DEFAULT PRIVILEGES FOR ROLE samra_migrations_staging IN SCHEMA samra_core
        GRANT SELECT, INSERT, UPDATE ON TABLES TO samra_runtime;
      ALTER DEFAULT PRIVILEGES FOR ROLE samra_migrations_staging IN SCHEMA samra_core
        REVOKE ALL PRIVILEGES ON SEQUENCES FROM PUBLIC;
      ALTER DEFAULT PRIVILEGES FOR ROLE samra_migrations_staging IN SCHEMA samra_core
        REVOKE ALL PRIVILEGES ON SEQUENCES FROM samra_runtime;
      ALTER DEFAULT PRIVILEGES FOR ROLE samra_migrations_staging IN SCHEMA samra_core
        REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
      ALTER DEFAULT PRIVILEGES FOR ROLE samra_migrations_staging IN SCHEMA samra_core
        REVOKE EXECUTE ON FUNCTIONS FROM samra_runtime;
    `);
  });
}

function assertCondition(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) throw new Error(message);
}

export async function auditMigrationDatabaseAccess(
  client: Queryable,
): Promise<void> {
  const expected = [
    STAGING_DATABASE_ACCESS.migrationRole,
    STAGING_DATABASE_ACCESS.migrationUser,
    STAGING_DATABASE_ACCESS.runtimeRole,
    STAGING_DATABASE_ACCESS.runtimeUser,
  ];
  const roleResult = await client.query<{
    rolname: string;
    rolsuper: boolean;
    rolcreatedb: boolean;
    rolcreaterole: boolean;
    rolreplication: boolean;
    rolbypassrls: boolean;
    rolcanlogin: boolean;
  }>(
    `SELECT rolname, rolsuper, rolcreatedb, rolcreaterole, rolreplication,
            rolbypassrls, rolcanlogin
       FROM pg_roles
      WHERE rolname = ANY($1::text[])
      ORDER BY rolname`,
    [expected],
  );
  assertCondition(roleResult.rows.length === 4, "Permanent roles are missing");
  for (const role of roleResult.rows) {
    assertCondition(!role.rolsuper, `${role.rolname} must not be superuser`);
    assertCondition(
      !role.rolcreatedb,
      `${role.rolname} must not create databases`,
    );
    assertCondition(
      !role.rolcreaterole,
      `${role.rolname} must not create roles`,
    );
    assertCondition(!role.rolreplication, `${role.rolname} must not replicate`);
    assertCondition(!role.rolbypassrls, `${role.rolname} must not bypass RLS`);
    const shouldLogin = role.rolname.endsWith("_staging");
    assertCondition(
      role.rolcanlogin === shouldLogin,
      `${role.rolname} login state drifted`,
    );
  }

  const memberships = await client.query<{
    role_name: string;
    member_name: string;
  }>(`
    SELECT parent.rolname AS role_name, member.rolname AS member_name
     FROM pg_auth_members membership
      JOIN pg_roles parent ON parent.oid = membership.roleid
      JOIN pg_roles member ON member.oid = membership.member
     WHERE member.rolname IN (
       'samra_migrator',
       'samra_migrations_staging',
       'samra_runtime',
       'samra_runtime_staging'
     )
     ORDER BY parent.rolname, member.rolname
  `);
  assertCondition(
    JSON.stringify(memberships.rows) ===
      JSON.stringify([
        {
          role_name: STAGING_DATABASE_ACCESS.migrationRole,
          member_name: STAGING_DATABASE_ACCESS.migrationUser,
        },
        {
          role_name: STAGING_DATABASE_ACCESS.runtimeRole,
          member_name: STAGING_DATABASE_ACCESS.runtimeUser,
        },
      ]),
    "Permanent role memberships drifted",
  );

  const elevated = await client.query<{ member_name: string }>(`
    SELECT member.rolname AS member_name
      FROM pg_auth_members membership
      JOIN pg_roles parent ON parent.oid = membership.roleid
      JOIN pg_roles member ON member.oid = membership.member
     WHERE parent.rolname = 'cloudsqlsuperuser'
       AND member.rolname IN ('samra_migrations_staging', 'samra_runtime_staging')
  `);
  assertCondition(
    elevated.rows.length === 0,
    "A permanent Samra user inherited cloudsqlsuperuser",
  );

  const schemas = await client.query<{ nspname: string; owner: string }>(`
    SELECT nspname, pg_get_userbyid(nspowner) AS owner
      FROM pg_namespace
     WHERE nspname IN ('samra_core', 'samra_migrations')
     ORDER BY nspname
  `);
  assertCondition(schemas.rows.length === 2, "Required schemas are missing");
  for (const schema of schemas.rows) {
    assertCondition(
      schema.owner === STAGING_DATABASE_ACCESS.migrationUser,
      `${schema.nspname} must be owned by the migration user`,
    );
  }

  const relationCheck = await client.query<{ missing_count: string }>(`
    SELECT count(*)::text AS missing_count
      FROM (VALUES
        ('audit_events'),
        ('customers'),
        ('ledger_journals'),
        ('remittance_transfers'),
        ('reconciliation_exceptions'),
        ('customer_onboardings')
      ) AS required(name)
     WHERE to_regclass(format('samra_core.%I', required.name)) IS NULL
  `);
  assertCondition(
    relationCheck.rows[0]?.missing_count === "0",
    "Required runtime relations are missing",
  );

  const history = await client.query<{ present: boolean }>(`
    SELECT to_regclass('samra_migrations.migration_history') IS NOT NULL AS present
  `);
  assertCondition(
    history.rows[0]?.present === true,
    "Migration history is missing",
  );

  const boundary = await client.query<{
    can_connect: boolean;
    can_create_database_objects: boolean;
    can_create_temporary_objects: boolean;
    can_use_core: boolean;
    can_create_in_core: boolean;
    can_use_migrations: boolean;
  }>(`
    SELECT has_database_privilege('samra_runtime', 'samra_staging', 'CONNECT') AS can_connect,
           has_database_privilege('samra_runtime', 'samra_staging', 'CREATE') AS can_create_database_objects,
           has_database_privilege('samra_runtime', 'samra_staging', 'TEMPORARY') AS can_create_temporary_objects,
           has_schema_privilege('samra_runtime', 'samra_core', 'USAGE') AS can_use_core,
           has_schema_privilege('samra_runtime', 'samra_core', 'CREATE') AS can_create_in_core,
           has_schema_privilege('samra_runtime', 'samra_migrations', 'USAGE') AS can_use_migrations
  `);
  const observedBoundary = boundary.rows[0];
  assertCondition(
    observedBoundary?.can_connect === true &&
      observedBoundary.can_create_database_objects === false &&
      observedBoundary.can_create_temporary_objects === false &&
      observedBoundary.can_use_core === true &&
      observedBoundary.can_create_in_core === false &&
      observedBoundary.can_use_migrations === false,
    "Runtime database or schema boundary drifted",
  );

  const grants = await client.query<{ invalid_count: string }>(`
    SELECT count(*)::text AS invalid_count
      FROM pg_class relation
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
     WHERE namespace.nspname = 'samra_core'
       AND relation.relkind IN ('r', 'p', 'v', 'm')
       AND NOT (
         has_table_privilege('samra_runtime', relation.oid, 'SELECT')
         AND has_table_privilege('samra_runtime', relation.oid, 'INSERT')
         AND has_table_privilege('samra_runtime', relation.oid, 'UPDATE')
         AND NOT has_table_privilege('samra_runtime', relation.oid, 'DELETE')
       )
  `);
  assertCondition(
    grants.rows[0]?.invalid_count === "0",
    "Runtime table grants drifted",
  );

  const executableOrSequencePrivileges = await client.query<{
    invalid_count: string;
  }>(`
    SELECT (
      SELECT count(*)
        FROM pg_class relation
        JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
       WHERE namespace.nspname = 'samra_core'
         AND relation.relkind = 'S'
         AND (
           has_sequence_privilege('samra_runtime', relation.oid, 'USAGE') OR
           has_sequence_privilege('samra_runtime', relation.oid, 'SELECT') OR
           has_sequence_privilege('samra_runtime', relation.oid, 'UPDATE')
         )
    ) + (
      SELECT count(*)
        FROM pg_proc function
        JOIN pg_namespace namespace ON namespace.oid = function.pronamespace
       WHERE namespace.nspname = 'samra_core'
         AND has_function_privilege('samra_runtime', function.oid, 'EXECUTE')
    ) AS invalid_count
  `);
  assertCondition(
    executableOrSequencePrivileges.rows[0]?.invalid_count === "0",
    "Runtime sequence or function grants drifted",
  );

  await client.query("BEGIN");
  try {
    await client.query(
      "CREATE TABLE samra_core.samra_access_default_privilege_probe (id uuid PRIMARY KEY)",
    );
    const futureGrant = await client.query<{ valid: boolean }>(`
      SELECT has_table_privilege('samra_runtime', 'samra_core.samra_access_default_privilege_probe', 'SELECT')
         AND has_table_privilege('samra_runtime', 'samra_core.samra_access_default_privilege_probe', 'INSERT')
         AND has_table_privilege('samra_runtime', 'samra_core.samra_access_default_privilege_probe', 'UPDATE')
         AND NOT has_table_privilege('samra_runtime', 'samra_core.samra_access_default_privilege_probe', 'DELETE')
         AS valid
    `);
    assertCondition(
      futureGrant.rows[0]?.valid === true,
      "Future-object runtime grants drifted",
    );
  } finally {
    await client.query("ROLLBACK");
  }
}

async function expectPrivilegeDenied(
  client: Queryable,
  statement: string,
): Promise<void> {
  try {
    await client.query(statement);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "42501") return;
    throw error;
  }
  throw new Error(
    `Forbidden statement succeeded: ${statement.split(/\s+/u)[0]}`,
  );
}

export async function auditRuntimeDatabaseAccess(
  client: Queryable,
): Promise<void> {
  const identity = await client.query<{ current_user: string }>(
    "SELECT current_user",
  );
  assertCondition(
    identity.rows[0]?.current_user === STAGING_DATABASE_ACCESS.runtimeUser,
    "Runtime audit used the wrong database identity",
  );

  await client.query("SELECT 1 FROM samra_core.audit_events LIMIT 1");
  await client.query("BEGIN");
  try {
    const eventKey = `staging-access-probe:${randomUUID()}`;
    await client.query(
      `INSERT INTO samra_core.audit_events
        (actor_type, action, entity_type, entity_id, event_key)
       VALUES ('system', 'staging_access_probe', 'database_access', $1, $2)`,
      [eventKey, eventKey],
    );
    await client.query(
      "UPDATE samra_core.audit_events SET metadata = metadata WHERE false",
    );
  } finally {
    await client.query("ROLLBACK");
  }

  await expectPrivilegeDenied(
    client,
    "DELETE FROM samra_core.audit_events WHERE false",
  );
  await expectPrivilegeDenied(
    client,
    "CREATE SCHEMA samra_runtime_forbidden_probe",
  );
  await expectPrivilegeDenied(
    client,
    "CREATE ROLE samra_runtime_forbidden_probe",
  );
  await expectPrivilegeDenied(
    client,
    "CREATE TEMPORARY TABLE samra_runtime_forbidden_probe (id integer)",
  );
  await expectPrivilegeDenied(
    client,
    "SELECT * FROM samra_migrations.migration_history LIMIT 1",
  );
}

async function withClient(
  connectionString: string,
  operation: (client: pg.Client) => Promise<void>,
): Promise<void> {
  const client = new Client({
    connectionString,
    application_name: "samra-staging-database-access",
    connectionTimeoutMillis: 10_000,
    statement_timeout: 60_000,
  });
  await client.connect();
  try {
    await operation(client);
  } finally {
    await client.end();
  }
}

export async function runStagingDatabaseAccessAction(
  action: string,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  if (action === "bootstrap") {
    const raw = environment.SAMRA_DATABASE_ACCESS_BOOTSTRAP_JSON;
    if (!raw)
      throw new Error("SAMRA_DATABASE_ACCESS_BOOTSTRAP_JSON is required");
    const payload = parseBootstrapPayload(raw);
    await withClient(payload.bootstrapDatabaseUrl, (client) =>
      bootstrapPermanentDatabasePrincipals(client, payload),
    );
    return;
  }

  const databaseUrl = environment.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  if (action === "finalize") {
    await withClient(databaseUrl, finalizeRuntimeDatabasePrivileges);
    return;
  }
  if (action === "audit-migration") {
    await withClient(databaseUrl, auditMigrationDatabaseAccess);
    return;
  }
  if (action === "audit-runtime") {
    await withClient(databaseUrl, auditRuntimeDatabaseAccess);
    return;
  }

  throw new Error(`Unsupported staging database access action: ${action}`);
}
