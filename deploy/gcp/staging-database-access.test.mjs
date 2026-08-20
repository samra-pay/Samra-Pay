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
