import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import {
  migrationCatalog,
  verifyHistory,
} from "../../lib/db/staging-migrate.mjs";
import { validateStagingImagePublicationManifest } from "./record-staging-image-publication.mjs";

export const MIGRATION = Object.freeze({
  project: "samra-pay-staging",
  projectNumber: "934122615631",
  organization: "614833350075",
  region: "us-east4",
  job: "samra-staging-migrations",
  instance: "samra-staging-postgres",
  controller:
    "samra-github-migrate-staging@samra-pay-staging.iam.gserviceaccount.com",
  runtime: "samra-migrations-staging@samra-pay-staging.iam.gserviceaccount.com",
  secret: "samra-staging-migration-database-url",
  pool: "samra-migrations-staging",
  provider: "samra-pay-migrations-main",
  workflow: "Staging migrations",
  workflowPath: ".github/workflows/staging-migrations.yml",
  environment: "staging-migrations",
  network: "samra-staging-vpc",
  subnet: "samra-staging-us-east4",
  logView: "samra-staging-migrations",
});
export const hash = (value) => createHash("sha256").update(value).digest("hex");
const integer = (value) =>
  /^[1-9][0-9]*$/.test(String(value)) && Number.isSafeInteger(Number(value));
const sha = (value) => /^[0-9a-f]{40}$/.test(value ?? "");

export function validateMigrationReport(
  report,
  { candidateSha, execution, secretVersion, catalog = migrationCatalog() },
) {
  assert(
    report?.event === "samra_staging_migration" &&
      report.candidateSha === candidateSha &&
      sha(candidateSha),
    "Migration report source mismatch",
  );
  assert(
    /^samra-staging-migrations-[a-z0-9]+$/.test(execution) &&
      report.execution === execution,
    "Migration execution mismatch",
  );
  assert(
    integer(secretVersion) && report.secretVersion === String(secretVersion),
    "Migration secret version mismatch",
  );
  assert(
    report.database === "samra_staging" &&
      report.databaseUser === "samra_migrations_staging" &&
      report.encrypted === true,
    "Migration database identity or transport mismatch",
  );
  assert(
    JSON.stringify(report.catalog) === JSON.stringify(catalog),
    "Migration catalog differs from source",
  );
  const asRows = (entries) => {
    assert(Array.isArray(entries), "Missing migration history");
    return entries.map((row) => ({
      hash: row.hash,
      created_at: row.createdAt,
    }));
  };
  const before = verifyHistory(asRows(report.before), catalog);
  const after = verifyHistory(asRows(report.after), catalog, true);
  assert(
    report.appliedCount === after.length - before.length,
    "Migration applied count mismatch",
  );
  return {
    event: report.event,
    candidateSha,
    execution,
    secretVersion: String(secretVersion),
    database: report.database,
    databaseUser: report.databaseUser,
    encrypted: true,
    catalog,
    before,
    after,
    appliedCount: report.appliedCount,
  };
}

export function extractMigrationReport(logs, expected) {
  assert(Array.isArray(logs), "Invalid migration log envelope");
  const reports = logs
    .filter(
      (entry) =>
        entry.resource?.type === "cloud_run_job" &&
        entry.resource.labels?.project_id === MIGRATION.project &&
        entry.resource.labels?.location === MIGRATION.region &&
        entry.resource.labels?.job_name === MIGRATION.job &&
        entry.labels?.execution_name === expected.execution &&
        entry.logName ===
          `projects/${MIGRATION.project}/logs/run.googleapis.com%2Fstdout`,
    )
    .map((entry) => {
      if (entry.jsonPayload) return entry.jsonPayload;
      try {
        return JSON.parse(entry.textPayload);
      } catch {
        return null;
      }
    })
    .filter((entry) => entry?.event === "samra_staging_migration");
  assert(
    reports.length === 1,
    "Expected exactly one execution-bound migration report",
  );
  return validateMigrationReport(reports[0], expected);
}

export function buildMigrationManifest({
  publication,
  publicationHash,
  report,
  githubRunId,
  githubRunAttempt,
  generatedAt,
  cleanupVerified,
}) {
  validateStagingImagePublicationManifest(publication);
  assert(/^[0-9a-f]{64}$/.test(publicationHash), "Invalid publication hash");
  assert(
    integer(githubRunId) && integer(githubRunAttempt),
    "Exact GitHub execution required",
  );
  assert(
    cleanupVerified === true,
    "Temporary migration job must be removed before success",
  );
  const normalized = validateMigrationReport(report, {
    candidateSha: publication.candidateSha,
    execution: report.execution,
    secretVersion: report.secretVersion,
  });
  assert(
    Number.isFinite(Date.parse(generatedAt)),
    "Valid evidence timestamp required",
  );
  return {
    schemaVersion: 1,
    status: "migration-completed",
    environment: "staging",
    dataClassification: "synthetic-only",
    candidateSha: publication.candidateSha,
    projectId: MIGRATION.project,
    projectNumber: MIGRATION.projectNumber,
    region: MIGRATION.region,
    publication: {
      manifestSha256: publicationHash,
      runId: publication.github.runId,
      runAttempt: publication.github.runAttempt,
      imageDigest: publication.imageDigests["samra-migrations"],
    },
    github: {
      repository: publication.sourceRepository,
      workflow: MIGRATION.workflow,
      workflowPath: MIGRATION.workflowPath,
      ref: "refs/heads/main",
      eventName: "workflow_dispatch",
      protectedEnvironment: MIGRATION.environment,
      runId: String(githubRunId),
      runAttempt: Number(githubRunAttempt),
    },
    execution: {
      job: MIGRATION.job,
      name: normalized.execution,
      runtimeIdentity: MIGRATION.runtime,
      tasks: 1,
      parallelism: 1,
      maxRetries: 0,
      timeoutSeconds: 600,
      succeeded: 1,
      failed: 0,
      deleted: true,
    },
    report: normalized,
    generatedAt,
    deploymentAuthorized: false,
    trafficAuthorized: false,
    vendorActivationAuthorized: false,
  };
}

export async function verifyMigrationManifest(
  path,
  sidecar,
  { publication, publicationHash, candidateSha, runId, runAttempt } = {},
) {
  const source = await readFile(path, "utf8");
  assert(
    hash(source) === (await readFile(sidecar, "utf8")).trim().split(/\s+/)[0],
    "Migration prerequisite hash mismatch",
  );
  const value = JSON.parse(source);
  assert(
    value.candidateSha === candidateSha && sha(candidateSha),
    "Migration prerequisite candidate mismatch",
  );
  assert(
    value.github?.runId === String(runId) &&
      value.github.runAttempt === Number(runAttempt) &&
      integer(runId) &&
      integer(runAttempt),
    "Migration prerequisite run mismatch",
  );
  const expected = buildMigrationManifest({
    publication,
    publicationHash,
    report: value.report,
    githubRunId: runId,
    githubRunAttempt: runAttempt,
    generatedAt: value.generatedAt,
    cleanupVerified: value.execution?.deleted,
  });
  assert(
    JSON.stringify(value) === JSON.stringify(expected),
    "Migration prerequisite differs from governed evidence",
  );
  return value;
}

export async function writeMigrationManifest(manifest, path, sidecar) {
  const source = `${JSON.stringify(manifest, null, 2)}\n`;
  await writeFile(path, source, { flag: "wx" });
  await writeFile(sidecar, `${hash(source)}\n`, { flag: "wx" });
}
