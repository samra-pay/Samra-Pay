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

  const libpqCompatibility = parsed.searchParams.get("uselibpqcompat");

  if (
    parsed.protocol !== "postgresql:" ||
    decodeURIComponent(parsed.username) !== expectedUser ||
    parsed.pathname !== `/${STAGING_DATABASE_ACCESS.database}` ||
    parsed.port !== "5432" ||
    !privateAddress ||
    Number(privateAddress[1]) > 255 ||
    Number(privateAddress[2]) > 255 ||
    parsed.searchParams.get("sslmode") !== "require" ||
    (libpqCompatibility !== null && libpqCompatibility !== "true") ||
    !parsed.password ||
    Buffer.byteLength(decodeURIComponent(parsed.password), "utf8") < 32
  ) {
    throw new Error(`${field} does not match the staging access contract`);
  }

  // Accept the one recoverable pre-contract bootstrap secret, but always
  // return the explicit connection policy consumed by node-postgres.
  parsed.searchParams.set("uselibpqcompat", "true");
  return parsed.toString();
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
    const permanentRoles = await client.query<{ role_count: string }>(
      `SELECT count(*)::text AS role_count
         FROM pg_roles
        WHERE rolname = ANY($1::text[])`,
      [
        [
          STAGING_DATABASE_ACCESS.migrationRole,
          STAGING_DATABASE_ACCESS.migrationUser,
          STAGING_DATABASE_ACCESS.runtimeRole,
          STAGING_DATABASE_ACCESS.runtimeUser,
        ],
      ],
    );

    if (permanentRoles.rows[0]?.role_count === "0") {
      const systemMembership = await client.query<{ can_set: boolean }>(`
        SELECT EXISTS (
          SELECT 1
            FROM pg_auth_members membership
            JOIN pg_roles parent ON parent.oid = membership.roleid
            JOIN pg_roles member ON member.oid = membership.member
           WHERE parent.rolname = 'cloudsqlsuperuser'
             AND member.rolname = session_user
             AND membership.set_option
        ) AS can_set
      `);
      if (systemMembership.rows[0]?.can_set !== true) {
        throw new Error(
          "The bootstrap user cannot SET ROLE to cloudsqlsuperuser",
        );
      }

      await client.query("SET ROLE cloudsqlsuperuser");
      await client.query(
        "SELECT set_config('samra.migration_password', $1, true), set_config('samra.runtime_password', $2, true)",
        [migrationPassword, runtimePassword],
      );
      await client.query(`
        CREATE ROLE samra_migrator
          NOLOGIN NOCREATEDB NOCREATEROLE;
        CREATE ROLE samra_runtime
          NOLOGIN NOCREATEDB NOCREATEROLE;
      `);
      await client.query(`
        DO $samra$
        DECLARE
          migration_password text := current_setting('samra.migration_password');
          runtime_password text := current_setting('samra.runtime_password');
        BEGIN
          EXECUTE format(
            'CREATE ROLE samra_migrations_staging LOGIN INHERIT PASSWORD %L NOCREATEDB NOCREATEROLE',
            migration_password
          );
          EXECUTE format(
            'CREATE ROLE samra_runtime_staging LOGIN INHERIT PASSWORD %L NOCREATEDB NOCREATEROLE',
            runtime_password
          );
        END
        $samra$;

        GRANT samra_migrator TO samra_migrations_staging;
        GRANT samra_runtime TO samra_runtime_staging;
        RESET ROLE;
      `);
    } else if (permanentRoles.rows[0]?.role_count !== "4") {
      throw new Error("Permanent Samra roles are partially initialized");
    }

    await client.query(`
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
             AND member.rolname IN (
               'samra_migrator',
               'samra_migrations_staging',
               'samra_runtime',
               'samra_runtime_staging'
             )
        ) THEN
          RAISE EXCEPTION 'A permanent Samra role inherited cloudsqlsuperuser';
        END IF;

        IF EXISTS (
          SELECT 1
            FROM pg_auth_members membership
            JOIN pg_roles parent ON parent.oid = membership.roleid
            JOIN pg_roles member ON member.oid = membership.member
            JOIN pg_roles grantor ON grantor.oid = membership.grantor
           WHERE grantor.rolname = 'samra_bootstrap_staging'
              OR (
                member.rolname = 'samra_bootstrap_staging'
                AND parent.rolname <> 'cloudsqlsuperuser'
              )
        ) THEN
          RAISE EXCEPTION 'The temporary bootstrap role remains in a membership ownership chain';
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
      REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA samra_core FROM samra_runtime, samra_runtime_staging;
      GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA samra_core TO samra_runtime;

      -- Table-level REVOKE does not clear column ACLs left by an earlier grant.
      DO $samra$
      DECLARE
        relation record;
      BEGIN
        FOR relation IN
          SELECT c.relname, string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum) AS columns
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            JOIN pg_attribute a ON a.attrelid = c.oid
           WHERE n.nspname = 'samra_core'
             AND c.relname IN ('alpha_release_controls', 'alpha_invitations', 'alpha_admissions')
             AND a.attnum > 0 AND NOT a.attisdropped
           GROUP BY c.relname
        LOOP
          EXECUTE format(
            'REVOKE ALL PRIVILEGES (%s) ON TABLE samra_core.%I FROM PUBLIC, samra_runtime, samra_runtime_staging',
            relation.columns, relation.relname
          );
        END LOOP;
      END
      $samra$;

      REVOKE ALL PRIVILEGES ON samra_core.alpha_release_controls, samra_core.alpha_invitations,
        samra_core.alpha_admissions FROM samra_runtime;
      GRANT SELECT ON samra_core.alpha_release_controls, samra_core.alpha_invitations TO samra_runtime;
      GRANT SELECT, INSERT ON samra_core.alpha_admissions TO samra_runtime;
      -- PostgreSQL row locks require UPDATE on at least one column. These keys
      -- cannot change: the release CHECK and invitation identity trigger enforce it.
      GRANT UPDATE (release_id) ON samra_core.alpha_release_controls TO samra_runtime;
      GRANT UPDATE (id) ON samra_core.alpha_invitations TO samra_runtime;

      REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA samra_core FROM PUBLIC;
      REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA samra_core FROM samra_runtime;
      REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA samra_core FROM PUBLIC;
      REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA samra_core FROM samra_runtime;

      ALTER DEFAULT PRIVILEGES FOR ROLE samra_migrations_staging IN SCHEMA samra_core
        REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC;
      ALTER DEFAULT PRIVILEGES FOR ROLE samra_migrations_staging IN SCHEMA samra_core
        REVOKE ALL PRIVILEGES ON TABLES FROM samra_runtime, samra_runtime_staging;
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
    const shouldLogin =
      role.rolname === STAGING_DATABASE_ACCESS.migrationUser ||
      role.rolname === STAGING_DATABASE_ACCESS.runtimeUser;
    assertCondition(
      role.rolcanlogin === shouldLogin,
      `${role.rolname} login state drifted`,
    );
  }

  const memberships = await client.query<{
    role_name: string;
    member_name: string;
    grantor_name: string;
    admin_option: boolean;
  }>(`
    SELECT parent.rolname AS role_name,
           member.rolname AS member_name,
           grantor.rolname AS grantor_name,
           membership.admin_option
     FROM pg_auth_members membership
      JOIN pg_roles parent ON parent.oid = membership.roleid
      JOIN pg_roles member ON member.oid = membership.member
      JOIN pg_roles grantor ON grantor.oid = membership.grantor
     WHERE parent.rolname IN (
       'samra_migrator',
       'samra_runtime'
     )
     ORDER BY parent.rolname, member.rolname
  `);
  const membershipShape = memberships.rows.map(
    ({ role_name, member_name, admin_option }) => ({
      role_name,
      member_name,
      admin_option,
    }),
  );
  assertCondition(
    JSON.stringify(membershipShape) ===
      JSON.stringify([
        {
          role_name: STAGING_DATABASE_ACCESS.migrationRole,
          member_name: "cloudsqlsuperuser",
          admin_option: true,
        },
        {
          role_name: STAGING_DATABASE_ACCESS.migrationRole,
          member_name: STAGING_DATABASE_ACCESS.migrationUser,
          admin_option: false,
        },
        {
          role_name: STAGING_DATABASE_ACCESS.runtimeRole,
          member_name: "cloudsqlsuperuser",
          admin_option: true,
        },
        {
          role_name: STAGING_DATABASE_ACCESS.runtimeRole,
          member_name: STAGING_DATABASE_ACCESS.runtimeUser,
          admin_option: false,
        },
      ]),
    "Permanent role memberships drifted",
  );
  assertCondition(
    memberships.rows[1]?.grantor_name === "cloudsqlsuperuser" &&
      memberships.rows[3]?.grantor_name === "cloudsqlsuperuser",
    "Permanent user memberships have the wrong grantor",
  );
  assertCondition(
    memberships.rows[0]?.grantor_name !==
      STAGING_DATABASE_ACCESS.bootstrapUser &&
      memberships.rows[2]?.grantor_name !==
        STAGING_DATABASE_ACCESS.bootstrapUser,
    "The bootstrap user owns a permanent role membership",
  );

  const elevated = await client.query<{ member_name: string }>(`
    SELECT member.rolname AS member_name
      FROM pg_auth_members membership
      JOIN pg_roles parent ON parent.oid = membership.roleid
      JOIN pg_roles member ON member.oid = membership.member
     WHERE parent.rolname = 'cloudsqlsuperuser'
       AND member.rolname IN (
         'samra_migrator',
         'samra_migrations_staging',
         'samra_runtime',
         'samra_runtime_staging'
       )
  `);
  assertCondition(
    elevated.rows.length === 0,
    "A permanent Samra role inherited cloudsqlsuperuser",
  );

  const bootstrapDependencies = await client.query<{
    dependency_count: string;
  }>(`
    SELECT count(*)::text AS dependency_count
      FROM pg_auth_members membership
      JOIN pg_roles member ON member.oid = membership.member
      JOIN pg_roles grantor ON grantor.oid = membership.grantor
     WHERE member.rolname = 'samra_bootstrap_staging'
        OR grantor.rolname = 'samra_bootstrap_staging'
  `);
  assertCondition(
    bootstrapDependencies.rows[0]?.dependency_count === "0",
    "The bootstrap role remains in a membership ownership chain",
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
        ('customer_onboardings'),
        ('alpha_release_controls'),
        ('alpha_invitations'),
        ('alpha_admissions')
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
       AND relation.relname NOT IN ('alpha_release_controls', 'alpha_invitations', 'alpha_admissions')
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
  await auditAlphaRuntimePrivileges(client);

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
      SELECT NOT EXISTS (
        SELECT 1 FROM (VALUES ('samra_runtime'), ('samra_runtime_staging')) AS principal(name)
         WHERE has_table_privilege(principal.name, 'samra_core.samra_access_default_privilege_probe',
           'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      )
         AS valid
    `);
    assertCondition(
      futureGrant.rows[0]?.valid === true,
      "Future objects must deny runtime access until reviewed grant finalization",
    );
  } finally {
    await client.query("ROLLBACK");
  }
}

async function auditAlphaRuntimePrivileges(client: Queryable): Promise<void> {
  const grants = await client.query<{ valid: boolean }>(`
    WITH expected(relation_name, insert_allowed, lock_column) AS (
      VALUES ('alpha_release_controls', false, 'release_id'),
             ('alpha_invitations', false, 'id'),
             ('alpha_admissions', true, NULL)
    ), principals(name) AS (VALUES ('samra_runtime'), ('samra_runtime_staging'))
    SELECT count(*) = 6 AND bool_and(
      has_table_privilege(p.name, c.oid, 'SELECT')
      AND has_table_privilege(p.name, c.oid, 'INSERT') = e.insert_allowed
      AND NOT has_table_privilege(p.name, c.oid, 'UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      AND NOT has_table_privilege(p.name, c.oid, 'SELECT WITH GRANT OPTION,INSERT WITH GRANT OPTION')
      AND NOT EXISTS (
        SELECT 1 FROM pg_attribute a
         WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
           AND (
             has_column_privilege(p.name, c.oid, a.attnum, 'UPDATE')
               <> coalesce(a.attname = e.lock_column, false)
             OR has_column_privilege(p.name, c.oid, a.attnum, 'INSERT') <> e.insert_allowed
             OR has_column_privilege(p.name, c.oid, a.attnum,
               'REFERENCES,SELECT WITH GRANT OPTION,INSERT WITH GRANT OPTION,UPDATE WITH GRANT OPTION')
           )
      )
    ) AS valid
      FROM expected e
      JOIN pg_namespace n ON n.nspname = 'samra_core'
      JOIN pg_class c ON c.relnamespace = n.oid AND c.relname = e.relation_name
      CROSS JOIN principals p
  `);
  assertCondition(
    grants.rows[0]?.valid === true,
    "Alpha runtime invitation, cohort, or admission privileges drifted",
  );
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
  await auditAlphaRuntimePrivileges(client);

  await client.query("BEGIN");
  try {
    await client.query(
      "SELECT admission_limit FROM samra_core.alpha_release_controls WHERE release_id = 'alpha-release-1' FOR UPDATE",
    );
    await client.query(
      "SELECT id FROM samra_core.alpha_invitations WHERE false FOR UPDATE",
    );
  } finally {
    await client.query("ROLLBACK");
  }
  for (const statement of [
    "INSERT INTO samra_core.alpha_invitations (issuer, subject, expires_at) SELECT 'https://audit.invalid/', 'synthetic', now() WHERE false",
    "UPDATE samra_core.alpha_release_controls SET admission_limit = 100 WHERE false",
    "INSERT INTO samra_core.alpha_release_controls (release_id) SELECT 'alpha-release-1' WHERE false",
    "UPDATE samra_core.alpha_invitations SET expires_at = now(), revoked_at = NULL WHERE false",
    "UPDATE samra_core.alpha_invitations SET issuer = 'https://audit.invalid/', subject = 'synthetic' WHERE false",
    "UPDATE samra_core.alpha_admissions SET slot = 1 WHERE false",
    "DELETE FROM samra_core.alpha_admissions WHERE false",
  ]) {
    await expectPrivilegeDenied(client, statement);
  }

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
    // Shared with the governed migration runner; connection closure releases
    // this session lock even when bootstrap/finalization or an audit fails.
    const lock = await client.query<{ acquired: boolean }>(
      "SELECT pg_try_advisory_lock($1::bigint) AS acquired",
      ["783214905126"],
    );
    assertCondition(
      lock.rows[0]?.acquired === true,
      "Another staging database operation holds the lock",
    );
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
