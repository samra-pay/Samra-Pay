import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const POSTGRES_NAME = /^[a-z][a-z0-9_]{2,62}$/;
const SECRET_NAME = /^[a-z][a-z0-9-]{2,254}$/;

export function readStagingDatabaseAccess() {
  return JSON.parse(
    readFileSync(
      new URL("./staging-database-access.json", import.meta.url),
      "utf8",
    ),
  );
}

function assertRestrictedPrincipal(principal, expectedName, login) {
  if (
    principal.name !== expectedName ||
    !POSTGRES_NAME.test(principal.name) ||
    principal.login !== login ||
    principal.superuser !== false ||
    principal.createDatabase !== false ||
    principal.createRole !== false ||
    principal.replication !== false ||
    principal.bypassRowLevelSecurity !== false
  ) {
    throw new Error(`Permanent principal ${expectedName} is not restricted`);
  }
}

export function validateStagingDatabaseAccess(
  contract = readStagingDatabaseAccess(),
) {
  if (contract.schemaVersion !== 1) {
    throw new Error("Unsupported staging database-access schema");
  }
  if (
    contract.status !== "review-only" ||
    contract.environment !== "staging" ||
    contract.dataClassification !== "synthetic-only" ||
    contract.activationAuthorized !== false
  ) {
    throw new Error(
      "Database access must remain review-only synthetic staging",
    );
  }
  if (
    contract.project.id !== "samra-pay-staging" ||
    contract.project.organizationId !== "614833350075" ||
    contract.project.region !== "us-east4"
  ) {
    throw new Error("The reviewed project, organization, and region changed");
  }
  if (
    contract.database.instance !== "samra-staging-postgres" ||
    contract.database.name !== "samra_staging" ||
    contract.database.network !== "samra-staging-vpc" ||
    contract.database.privateIpRequired !== true ||
    contract.database.publicIpAllowed !== false
  ) {
    throw new Error("The private staging database boundary changed");
  }

  const principals = contract.principals;
  if (
    principals.bootstrap.name !== "samra_bootstrap_staging" ||
    principals.bootstrap.lifecycle !== "ephemeral" ||
    principals.bootstrap.deletedBeforeAcceptance !== true
  ) {
    throw new Error("The bootstrap principal must be temporary and deleted");
  }
  assertRestrictedPrincipal(principals.migrationRole, "samra_migrator", false);
  assertRestrictedPrincipal(
    principals.migrationUser,
    "samra_migrations_staging",
    true,
  );
  assertRestrictedPrincipal(principals.runtimeRole, "samra_runtime", false);
  assertRestrictedPrincipal(
    principals.runtimeUser,
    "samra_runtime_staging",
    true,
  );
  if (
    principals.migrationUser.memberOf !== principals.migrationRole.name ||
    principals.runtimeUser.memberOf !== principals.runtimeRole.name ||
    principals.migrationUser.runtimeTrafficAllowed !== false ||
    principals.runtimeUser.schemaOwnershipAllowed !== false ||
    principals.runtimeUser.ddlAllowed !== false
  ) {
    throw new Error("Migration and runtime trust boundaries are not isolated");
  }

  const privileges = contract.databasePrivileges;
  if (
    privileges.publicSchemaCreateRevoked !== true ||
    JSON.stringify(privileges.runtime.database) !==
      JSON.stringify(["CONNECT"]) ||
    JSON.stringify(privileges.runtime.schemas) !== JSON.stringify(["USAGE"]) ||
    JSON.stringify(privileges.runtime.tables) !==
      JSON.stringify(["SELECT", "INSERT", "UPDATE"]) ||
    JSON.stringify(privileges.runtime.tableOverrides) !==
      JSON.stringify({
        alpha_release_controls: {
          tables: ["SELECT"],
          updateColumns: ["release_id"],
        },
        alpha_invitations: { tables: ["SELECT"], updateColumns: ["id"] },
        alpha_admissions: { tables: ["SELECT", "INSERT"], updateColumns: [] },
      }) ||
    JSON.stringify(privileges.runtime.sequences) !== JSON.stringify([]) ||
    JSON.stringify(privileges.runtime.functions) !== JSON.stringify([]) ||
    privileges.runtime.futureObjectsCoveredByOwnerDefaultPrivileges !== false ||
    privileges.runtime.futureObjectsRequireReviewedGrants !== true ||
    JSON.stringify(privileges.migrations.database) !==
      JSON.stringify(["CONNECT", "CREATE"]) ||
    JSON.stringify(privileges.migrations.ownsSchemas) !==
      JSON.stringify(["samra_core", "samra_migrations"]) ||
    privileges.migrations.manualExecutionOnly !== true
  ) {
    throw new Error("Reviewed database grants changed");
  }

  const secrets = contract.secrets;
  const secretIds = [
    secrets.runtime.id,
    secrets.migrations.id,
    secrets.bootstrap.id,
  ];
  if (
    new Set(secretIds).size !== secretIds.length ||
    secretIds.some((name) => !SECRET_NAME.test(name)) ||
    secrets.runtime.id !== "samra-staging-database-url" ||
    secrets.migrations.id !== "samra-staging-migration-database-url" ||
    secrets.runtime.consumer !== "samra-api-staging" ||
    secrets.migrations.consumer !== "samra-migrations-staging" ||
    secrets.runtime.enabledVersionsAfterInitialActivation !== 1 ||
    secrets.migrations.enabledVersionsAfterInitialActivation !== 1 ||
    secrets.bootstrap.temporary !== true ||
    secrets.bootstrap.versionsAfterAcceptance !== 0 ||
    secrets.bootstrap.metadataDeletedBeforeAcceptance !== true
  ) {
    throw new Error("Database secrets are not isolated or bounded");
  }

  const pool = contract.runtimePool;
  if (
    pool.maxConnectionsPerInstance !== 5 ||
    pool.cloudRunMaxInstances !== 2 ||
    pool.maximumApplicationConnections !== 10 ||
    pool.maximumApplicationConnections !==
      pool.maxConnectionsPerInstance * pool.cloudRunMaxInstances ||
    pool.idleTimeoutMilliseconds !== 30_000 ||
    pool.connectionTimeoutMilliseconds !== 10_000
  ) {
    throw new Error("The staging database connection budget changed");
  }

  if (
    contract.apply.authorizationSentinel !==
      "AUTHORIZED_STAGING_DATABASE_ACCESS" ||
    contract.apply.fixedGitShaRequired !== true ||
    contract.apply.resumableOnlyWhenObservedStateMatches !== true ||
    contract.apply.passwordBytesMinimum < 32 ||
    contract.apply.credentialsMayAppearInOutput !== false
  ) {
    throw new Error("Database-access apply guards are incomplete");
  }
  if (
    contract.acceptance.bootstrapArtifactsRemaining !== 0 ||
    contract.acceptance.runtimeAndMigrationCredentialsDiffer !== true ||
    contract.acceptance.secretIamExact !== true ||
    contract.acceptance.permanentCloudSqlSuperusers !== 0 ||
    contract.acceptance.runtimeCanCreateSchema !== false ||
    contract.acceptance.runtimeCanCreateRole !== false ||
    contract.acceptance.runtimeOwnsSchema !== false ||
    contract.acceptance.migrationHistoryPresent !== true ||
    contract.acceptance.requiredRuntimeRelationsPresent !== true ||
    contract.acceptance.syntheticOnly !== true
  ) {
    throw new Error("Database-access acceptance controls changed");
  }

  return Object.freeze({
    schemaVersion: contract.schemaVersion,
    status: "validated",
    projectId: contract.project.id,
    region: contract.project.region,
    database: contract.database.name,
    runtimeUser: principals.runtimeUser.name,
    migrationUser: principals.migrationUser.name,
    runtimeSecret: secrets.runtime.id,
    migrationSecret: secrets.migrations.id,
    maxApplicationConnections: pool.maximumApplicationConnections,
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.stdout.write(`${JSON.stringify(validateStagingDatabaseAccess())}\n`);
}
