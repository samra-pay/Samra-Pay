import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  readStagingDatabaseAccess,
  validateStagingDatabaseAccess,
} from "./validate-staging-database-access.mjs";

const contract = readStagingDatabaseAccess();
const source = await readFile(
  "deploy/gcp/staging-database-access.json",
  "utf8",
);
const activate = await readFile(
  "deploy/gcp/activate-staging-database-access.sh",
  "utf8",
);
const audit = await readFile(
  "deploy/gcp/audit-staging-database-access.sh",
  "utf8",
);
const runner = await readFile("lib/db/src/staging-database-access.ts", "utf8");

test("validates the review-only staging database access contract", () => {
  assert.deepEqual(validateStagingDatabaseAccess(contract), {
    schemaVersion: 1,
    status: "validated",
    projectId: "samra-pay-staging",
    region: "us-east4",
    database: "samra_staging",
    runtimeUser: "samra_runtime_staging",
    migrationUser: "samra_migrations_staging",
    runtimeSecret: "samra-staging-database-url",
    migrationSecret: "samra-staging-migration-database-url",
    maxApplicationConnections: 10,
  });
});

test("isolates permanent migration and runtime principals", () => {
  const { principals } = contract;
  assert.notEqual(principals.runtimeUser.name, principals.migrationUser.name);
  assert.notEqual(
    principals.runtimeUser.memberOf,
    principals.migrationUser.memberOf,
  );
  for (const name of [
    "migrationRole",
    "migrationUser",
    "runtimeRole",
    "runtimeUser",
  ]) {
    const principal = principals[name];
    assert.equal(principal.superuser, false);
    assert.equal(principal.createDatabase, false);
    assert.equal(principal.createRole, false);
    assert.equal(principal.replication, false);
    assert.equal(principal.bypassRowLevelSecurity, false);
  }
  assert.equal(principals.runtimeUser.ddlAllowed, false);
  assert.equal(principals.runtimeUser.schemaOwnershipAllowed, false);
  assert.equal(principals.migrationUser.runtimeTrafficAllowed, false);
});

test("keeps bootstrap access temporary and absent at acceptance", () => {
  assert.equal(contract.principals.bootstrap.lifecycle, "ephemeral");
  assert.equal(contract.principals.bootstrap.deletedBeforeAcceptance, true);
  assert.equal(contract.secrets.bootstrap.temporary, true);
  assert.equal(contract.secrets.bootstrap.versionsAfterAcceptance, 0);
  assert.equal(
    contract.secrets.bootstrap.metadataDeletedBeforeAcceptance,
    true,
  );
  assert.equal(contract.acceptance.bootstrapArtifactsRemaining, 0);
  assert.equal(contract.acceptance.permanentCloudSqlSuperusers, 0);
});

test("gives runtime data access without database administration", () => {
  assert.deepEqual(contract.databasePrivileges.runtime, {
    database: ["CONNECT"],
    schemas: ["USAGE"],
    tables: ["SELECT", "INSERT", "UPDATE"],
    sequences: [],
    functions: [],
    futureObjectsCoveredByOwnerDefaultPrivileges: true,
  });
  assert.deepEqual(contract.databasePrivileges.migrations, {
    database: ["CONNECT", "CREATE"],
    ownsSchemas: ["samra_core", "samra_migrations"],
    manualExecutionOnly: true,
  });
  assert.equal(contract.databasePrivileges.publicSchemaCreateRevoked, true);
});

test("separates secrets and bounds the aggregate API pool", () => {
  assert.notEqual(contract.secrets.runtime.id, contract.secrets.migrations.id);
  assert.equal(contract.secrets.runtime.consumer, "samra-api-staging");
  assert.equal(
    contract.secrets.migrations.consumer,
    "samra-migrations-staging",
  );
  assert.equal(contract.runtimePool.maxConnectionsPerInstance, 5);
  assert.equal(contract.runtimePool.cloudRunMaxInstances, 2);
  assert.equal(contract.runtimePool.maximumApplicationConnections, 10);
  assert.equal(contract.acceptance.secretIamExact, true);
});

test("contains no credential, connection URL, or apply authorization", () => {
  assert.equal(contract.activationAuthorized, false);
  assert.doesNotMatch(
    source,
    /postgres(?:ql)?:\/\/|password\s*[=:]|12345678|AUTHORIZED_STAGING_DATABASE_ACCESS\s*[=:]\s*(?:true|1)/i,
  );
  for (const forbidden of [
    "shared runtime and migration credential",
    "permanent bootstrap credential",
    "cloudsqlsuperuser on a permanent Samra principal",
    "runtime schema ownership",
    "runtime DDL",
    "runtime DELETE privilege without an approved product requirement",
    "automatic migration",
    "public IP or authorized network",
    "production or customer data",
  ]) {
    assert.ok(contract.forbidden.includes(forbidden));
  }
});

test("rejects privilege, secret, pool, and cleanup drift", () => {
  const mutate = (operation) => {
    const copy = structuredClone(contract);
    operation(copy);
    return copy;
  };
  assert.throws(() =>
    validateStagingDatabaseAccess(
      mutate((value) => {
        value.principals.runtimeUser.createRole = true;
      }),
    ),
  );
  assert.throws(() =>
    validateStagingDatabaseAccess(
      mutate((value) => {
        value.secrets.migrations.id = value.secrets.runtime.id;
      }),
    ),
  );
  assert.throws(() =>
    validateStagingDatabaseAccess(
      mutate((value) => {
        value.runtimePool.maxConnectionsPerInstance = 20;
      }),
    ),
  );
  assert.throws(() =>
    validateStagingDatabaseAccess(
      mutate((value) => {
        value.acceptance.bootstrapArtifactsRemaining = 1;
      }),
    ),
  );
});

test("separates plan, live review, fresh apply, and controlled resume", () => {
  assert.match(activate, /--plan\|--review\|--apply\|--resume/);
  assert.match(activate, /AUTHORIZED_STAGING_DATABASE_ACCESS/);
  assert.match(activate, /source commit does not match the authorized SHA/);
  assert.match(activate, /source working tree is not clean/);
  assert.match(activate, /IMAGE_DIGEST.*sha256:\[0-9a-f\]\{64\}/);
  assert.match(activate, /IMAGE_BASE}:\${EXPECTED_SHA}/);
  assert.match(activate, /authorized source tag does not resolve/);
  assert.match(
    activate,
    /apply requires a fresh zero-version credential boundary/,
  );
  assert.match(activate, /recoverable bootstrap payload/);
  assert.match(activate, /REVIEW COMPLETE — NO CLOUD CHANGES/);
});

test("parses the private Cloud SQL address from version-stable JSON", () => {
  assert.match(
    activate,
    /PRIVATE_IP="\$\(gcloud sql instances describe "\$\{INSTANCE\}"[\s\S]{0,200}--format=json \| node -e/,
  );
  assert.match(
    activate,
    /addresses\.find\(\(candidate\) => candidate\.type === "PRIVATE"\)/,
  );
  assert.doesNotMatch(activate, /ipAddresses\.filter\(type:PRIVATE\)/);
});

test("makes encrypted private-IP libpq TLS semantics explicit", () => {
  assert.equal(
    (activate.match(/sslmode=require&uselibpqcompat=true/g) ?? []).length,
    3,
  );
  assert.match(
    runner,
    /parsed\.searchParams\.set\("uselibpqcompat", "true"\)/,
  );
  assert.match(activate, /recoverable bootstrap URL has an invalid TLS policy/);
});

test("activates roles, secrets, migrations, grants, cleanup, and audits in order", () => {
  const ordered = [
    'gcloud sql users create "${BOOTSTRAP_USER}"',
    "SAMRA_DATABASE_ACCESS_BOOTSTRAP_JSON bootstrap",
    'gcloud secrets versions add "${MIGRATION_SECRET}"',
    "\nrun_migration_job\n",
    '"${MIGRATION_SECRET}" DATABASE_URL finalize',
    'gcloud sql users delete "${BOOTSTRAP_USER}"',
    'gcloud secrets delete "${BOOTSTRAP_SECRET}"',
    '"${MIGRATION_SECRET}" DATABASE_URL audit-migration',
    '"${RUNTIME_SECRET}" DATABASE_URL audit-runtime',
  ].map((needle) => activate.lastIndexOf(needle));
  assert.ok(ordered.every((index) => index >= 0));
  assert.deepEqual(
    [...ordered].sort((a, b) => a - b),
    ordered,
  );

  for (const control of [
    '--network="${NETWORK}"',
    '--subnet="${SUBNET}"',
    "--vpc-egress=private-ranges-only",
    "--tasks=1",
    "--parallelism=1",
    "--max-retries=0",
    "--task-timeout=10m",
    "trap cleanup_job EXIT",
  ]) {
    assert.ok(activate.includes(control), control);
  }

  assert.match(
    activate,
    /--args=--filter,@workspace\/db,run,staging:access,"\$\{action\}"/,
  );
  assert.match(
    audit,
    /--args=--filter,@workspace\/db,run,staging:access,"\$\{action\}"/,
  );
  assert.doesNotMatch(`${activate}\n${audit}`, /staging:access,--/);
});

test("implements runtime DML without DELETE, DDL, ownership, or elevation", () => {
  assert.match(
    runner,
    /GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA samra_core TO samra_runtime/,
  );
  assert.match(runner, /REVOKE CREATE ON SCHEMA public FROM PUBLIC/);
  assert.match(runner, /A permanent Samra role inherited cloudsqlsuperuser/);
  assert.match(runner, /SET ROLE cloudsqlsuperuser/);
  assert.match(
    runner,
    /temporary bootstrap role remains in a membership ownership chain/i,
  );
  assert.doesNotMatch(runner, /GRANT cloudsqlsuperuser TO samra_/);
  assert.match(runner, /DELETE FROM samra_core\.audit_events WHERE false/);
  assert.match(runner, /CREATE SCHEMA samra_runtime_forbidden_probe/);
  assert.match(runner, /CREATE ROLE samra_runtime_forbidden_probe/);
  assert.match(runner, /CREATE TEMPORARY TABLE samra_runtime_forbidden_probe/);
  assert.doesNotMatch(
    runner,
    /GRANT[^;]*(?:DELETE|CREATE|TRUNCATE|REFERENCES|TRIGGER)[^;]*TO samra_runtime[;\n]/i,
  );
});

test("independent audit proves exact secret IAM and bootstrap cleanup", () => {
  for (const evidence of [
    "bootstrap secret remains",
    "bootstrap database user remains",
    "bootstrap Cloud Run job remains",
    "runtime secret version drift",
    "migration secret version drift",
    "secret metadata or regional replication drift",
    "project-level Secret Manager accessor grant",
    "accessor IAM drift",
    "AUTHORIZED_STAGING_DATABASE_ACCESS_AUDIT",
    "audit-migration",
    "audit-runtime",
    "STAGING DATABASE ACCESS INDEPENDENT AUDIT PASS",
  ]) {
    assert.ok(audit.includes(evidence), evidence);
  }
  assert.match(audit, /trap cleanup_job EXIT/);
  assert.match(
    activate,
    /versions\.filter\(\(version\) => version\.state === "ENABLED"\)/,
  );
  assert.match(
    audit,
    /versions\.filter\(\(version\) => version\.state === "ENABLED"\)/,
  );
  assert.doesNotMatch(
    `${activate}\n${audit}`,
    /--filter=['"]state:ENABLED['"]/,
  );
  assert.doesNotMatch(
    `${activate}\n${audit}`,
    /gcloud run deploy|--allow-unauthenticated|--authorized-networks|worf\.replit|12345678/i,
  );
});
