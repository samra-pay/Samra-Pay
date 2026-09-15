import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { createReadStream } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test, { type TestContext } from "node:test";
import { createDatabase, type DatabaseConnection } from "@workspace/db";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { closeDisposableConnection } from "./disposable-postgres-cleanup.js";

const execFileAsync = promisify(execFile);
const workspaceRoot = fileURLToPath(new URL("../../../", import.meta.url));
const apiServerRoot = fileURLToPath(new URL("../", import.meta.url));
const migrationFolder = join(workspaceRoot, "lib/db/drizzle");
const migrationJournalPath = join(migrationFolder, "meta/_journal.json");
const requiredEvidencePath = join(
  apiServerRoot,
  "test-results/weekly-backup-restore.json",
);
const configuredEvidencePath =
  process.env["WEEKLY_BACKUP_RESTORE_RESULTS_PATH"] ?? requiredEvidencePath;
const evidencePath = resolve(apiServerRoot, configuredEvidencePath);
if (evidencePath !== requiredEvidencePath) {
  throw new Error(
    "WEEKLY_BACKUP_RESTORE_RESULTS_PATH must resolve to test-results/weekly-backup-restore.json.",
  );
}
const confirmationVariable = "SAMRA_DISPOSABLE_BACKUP_RESTORE_CONFIRMATION";
const requiredConfirmation =
  "I_UNDERSTAND_THIS_DROPS_DISPOSABLE_LOCAL_DATABASES";
const requiredLoopbackHost = "127.0.0.1";
const allowedConnectionProfiles = [
  {
    port: "5432",
    role: "samra_resilience",
    database: "samra_resilience",
    password: "samra_resilience",
  },
  {
    port: "5436",
    role: "samra_release_recovery",
    database: "samra_release_recovery",
    password: "samra_release_recovery",
  },
] as const;
const disposableDatabasePattern =
  /^samra_backup_(?:source|restore)_[a-f0-9]{32}$/;
const databaseOperationTimeoutMs = 60_000;
const maximumDumpBytes = 64 * 1024 * 1024;
const pinnedPostgresClientImage =
  "postgres:16@sha256:f1c3376c26f2609ab9f29f71f824103fe2fcd8ee0346485cb6122a4f93df6f94";
const requiredGithubRepository = "samra-pay/Samra-Pay";
const containerEvidenceFolder = "/samra-recovery";
const requiredTriggers = [
  "audit_events_append_only",
  "ledger_account_balances_derived_only",
  "ledger_journals_apply_balance_projection",
  "ledger_journals_guard",
] as const;

interface TableFingerprint {
  table: string;
  rows: number;
  sha256: string;
}

interface FingerprintSet {
  count: number;
  sha256: string;
  tables: TableFingerprint[];
}

interface TriggerFingerprint {
  count: number;
  names: string[];
  requiredNames: readonly string[];
  sha256: string;
}

interface SequenceFingerprint {
  count: number;
  sha256: string;
}

interface RecoveryInvariants {
  migrationCount: number;
  currentMigrationTag: string;
  demoSeedJournalCount: number;
  postedJournalCount: number;
  postingCount: number;
  unbalancedJournalCount: number;
  currencyImbalanceCount: number;
  balanceProjectionDriftCount: number;
}

interface MigrationFingerprintEntry {
  tag: string;
  createdAt: string;
  sqlSha256: string;
}

interface MigrationFingerprint {
  count: number;
  currentTag: string;
  sha256: string;
  entries: MigrationFingerprintEntry[];
}

interface PostgresVersion {
  raw: string;
  major: number;
}

interface RecoveryProvenance {
  executor: "github-actions" | "local";
  repository: string | null;
  eventName: string | null;
  candidateSha: string | null;
  githubSha: string | null;
  workflowRunId: string | null;
  workflowRunAttempt: number | null;
  workflowRef: string | null;
}

interface DisposableConnectionInput {
  connectionString: string | undefined;
  confirmation: string | undefined;
  inheritedPostgresVariables: readonly string[];
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function roundedMilliseconds(value: number): number {
  return Math.round(value * 100) / 100;
}

function escapeRegularExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

async function loadExpectedMigrations(): Promise<MigrationFingerprint> {
  const journal = JSON.parse(await readFile(migrationJournalPath, "utf8")) as {
    version: string;
    dialect: string;
    entries: Array<{
      idx: number;
      when: number;
      tag: string;
      breakpoints: boolean;
    }>;
  };
  assert.equal(journal.version, "7");
  assert.equal(journal.dialect, "postgresql");
  assert.ok(journal.entries.length > 0);

  const entries: MigrationFingerprintEntry[] = [];
  let previousWhen = -1;
  for (const [position, entry] of journal.entries.entries()) {
    assert.equal(entry.idx, position);
    assert.match(entry.tag, /^\d{4}_[a-z0-9_]+$/u);
    assert.ok(Number.isSafeInteger(entry.when));
    assert.ok(entry.when > previousWhen);
    assert.equal(entry.breakpoints, true);
    const sql = await readFile(join(migrationFolder, `${entry.tag}.sql`));
    entries.push({
      tag: entry.tag,
      createdAt: String(entry.when),
      sqlSha256: sha256(sql),
    });
    previousWhen = entry.when;
  }

  return {
    count: entries.length,
    currentTag: entries.at(-1)!.tag,
    sha256: sha256(
      `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`,
    ),
    entries,
  };
}

async function collectMigrationFingerprint(
  pool: DatabaseConnection["pool"],
  expected: MigrationFingerprint,
): Promise<MigrationFingerprint> {
  const result = await pool.query<{
    hash: string;
    created_at: string;
  }>(
    `SELECT hash, created_at::text
     FROM samra_migrations.migration_history
     ORDER BY created_at, id`,
  );
  const actual = result.rows.map((row, index): MigrationFingerprintEntry => ({
    tag: expected.entries[index]?.tag ?? `<unexpected-${index}>`,
    createdAt: row.created_at,
    sqlSha256: row.hash,
  }));
  assert.deepEqual(
    actual,
    expected.entries,
    "applied migration hashes and timestamps must match every checked-in SQL file and journal entry",
  );
  return {
    count: actual.length,
    currentTag: actual.at(-1)!.tag,
    sha256: sha256(
      `${actual.map((entry) => JSON.stringify(entry)).join("\n")}\n`,
    ),
    entries: actual,
  };
}

async function hashBoundedFile(
  filePath: string,
  expectedBytes: number,
  signal: AbortSignal,
): Promise<string> {
  assert.ok(expectedBytes > 0, "backup dump must not be empty");
  assert.ok(
    expectedBytes <= maximumDumpBytes,
    `backup dump exceeds the ${maximumDumpBytes}-byte synthetic limit`,
  );
  const hash = createHash("sha256");
  let observedBytes = 0;
  for await (const chunk of createReadStream(filePath, { signal })) {
    observedBytes += chunk.length;
    assert.ok(
      observedBytes <= maximumDumpBytes,
      `backup dump exceeded the ${maximumDumpBytes}-byte synthetic limit while hashing`,
    );
    hash.update(chunk);
  }
  assert.equal(observedBytes, expectedBytes);
  return hash.digest("hex");
}

function parseServerMajor(versionNumber: string): number {
  assert.match(versionNumber, /^\d{6}$/u);
  const major = Math.trunc(Number(versionNumber) / 10_000);
  assert.ok(
    major >= 10,
    `unsupported PostgreSQL server version ${versionNumber}`,
  );
  return major;
}

function parseClientVersion(command: string, raw: string): PostgresVersion {
  const escapedCommand = command.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const match = new RegExp(
    `^${escapedCommand} \\(PostgreSQL\\) (\\d+)(?:\\.\\d+)*`,
    "u",
  ).exec(raw);
  assert.ok(match, `could not parse ${command} version: ${raw}`);
  return { raw, major: Number(match[1]) };
}

function validateLocalDisposableConnection(
  input: DisposableConnectionInput,
): string {
  const connectionString = input.connectionString;
  if (!connectionString) {
    throw new Error(
      "TEST_DATABASE_URL is required for the backup-and-restore rehearsal.",
    );
  }

  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error("TEST_DATABASE_URL must be a PostgreSQL URL.");
  }
  if (url.protocol !== "postgresql:") {
    throw new Error("TEST_DATABASE_URL must use explicit postgresql protocol.");
  }
  if (url.hostname !== requiredLoopbackHost) {
    throw new Error(
      `Backup-and-restore rehearsal requires ${requiredLoopbackHost}.`,
    );
  }
  if (url.search || url.hash) {
    throw new Error(
      "TEST_DATABASE_URL query parameters and fragments are not allowed.",
    );
  }
  if (!url.username || !url.password) {
    throw new Error(
      "TEST_DATABASE_URL must include an explicit user and password.",
    );
  }
  const connectionProfile = allowedConnectionProfiles.find(
    ({ port, role, database, password }) =>
      connectionString ===
        `postgresql://${role}:${password}@${requiredLoopbackHost}:${port}/${database}` &&
      url.port === port &&
      decodeURIComponent(url.username) === role &&
      decodeURIComponent(url.password) === password &&
      decodeURIComponent(url.pathname) === `/${database}`,
  );
  if (!connectionProfile) {
    throw new Error(
      "Backup-and-restore rehearsal requires an exact approved disposable connection profile.",
    );
  }
  if (input.inheritedPostgresVariables.length > 0) {
    throw new Error(
      `Inherited PostgreSQL variables are not allowed: ${[...input.inheritedPostgresVariables].sort().join(", ")}.`,
    );
  }
  if (input.confirmation !== requiredConfirmation) {
    throw new Error(
      `${confirmationVariable} must equal ${requiredConfirmation}.`,
    );
  }
  return connectionString;
}

function requireLocalDisposableConnection(): string {
  return validateLocalDisposableConnection({
    connectionString: process.env["TEST_DATABASE_URL"],
    confirmation: process.env[confirmationVariable],
    inheritedPostgresVariables: Object.keys(process.env).filter((key) =>
      key.startsWith("PG"),
    ),
  });
}

function configuredPostgresClientImage(
  environment: Readonly<NodeJS.ProcessEnv> = process.env,
): string | undefined {
  const configured = environment["SAMRA_POSTGRES_CLIENT_IMAGE"];
  if (configured && configured !== pinnedPostgresClientImage) {
    throw new Error(
      `SAMRA_POSTGRES_CLIENT_IMAGE must equal ${pinnedPostgresClientImage}.`,
    );
  }
  if (environment["GITHUB_ACTIONS"] === "true" && !configured) {
    throw new Error(
      "GitHub recovery rehearsals require the digest-pinned PostgreSQL client image.",
    );
  }
  return configured;
}

async function collectRecoveryProvenance(
  environment: Readonly<NodeJS.ProcessEnv> = process.env,
  readHead: () => Promise<string> = async () => {
    const result = await execFileAsync("git", ["rev-parse", "HEAD"], {
      cwd: workspaceRoot,
      maxBuffer: 1024 * 1024,
      timeout: 10_000,
      killSignal: "SIGKILL",
    });
    return String(result.stdout).trim();
  },
): Promise<RecoveryProvenance> {
  const githubKeys = [
    "GITHUB_SHA",
    "GITHUB_RUN_ID",
    "GITHUB_RUN_ATTEMPT",
    "GITHUB_WORKFLOW_REF",
    "GITHUB_REPOSITORY",
    "GITHUB_EVENT_NAME",
    "SAMRA_RECOVERY_CANDIDATE_SHA",
  ] as const;
  if (environment["GITHUB_ACTIONS"] !== "true") {
    const unexpected = githubKeys.filter((key) => environment[key]);
    if (unexpected.length > 0) {
      throw new Error(
        `Local recovery provenance cannot accept GitHub identity fields: ${unexpected.join(", ")}.`,
      );
    }
    return {
      executor: "local",
      repository: null,
      eventName: null,
      candidateSha: null,
      githubSha: null,
      workflowRunId: null,
      workflowRunAttempt: null,
      workflowRef: null,
    };
  }

  const githubSha = environment["GITHUB_SHA"] ?? "";
  const candidateSha = environment["SAMRA_RECOVERY_CANDIDATE_SHA"] ?? "";
  const workflowRunId = environment["GITHUB_RUN_ID"] ?? "";
  const workflowRunAttempt = environment["GITHUB_RUN_ATTEMPT"] ?? "";
  const workflowRef = environment["GITHUB_WORKFLOW_REF"] ?? "";
  const repository = environment["GITHUB_REPOSITORY"] ?? "";
  const eventName = environment["GITHUB_EVENT_NAME"] ?? "";
  assert.match(githubSha, /^[0-9a-f]{40}$/u);
  assert.match(candidateSha, /^[0-9a-f]{40}$/u);
  assert.match(workflowRunId, /^[1-9]\d*$/u);
  assert.match(workflowRunAttempt, /^[1-9]\d*$/u);
  const parsedWorkflowRunAttempt = Number(workflowRunAttempt);
  assert.ok(
    Number.isSafeInteger(parsedWorkflowRunAttempt),
    "GitHub workflow run attempt must be a safe integer",
  );
  assert.equal(repository, requiredGithubRepository);
  const releaseWorkflowRef = `${requiredGithubRepository}/.github/workflows/release-candidate.yml@refs/heads/main`;
  const backendWorkflowMainRef = `${requiredGithubRepository}/.github/workflows/backend-resilience.yml@refs/heads/main`;
  const backendPullRequestRef = new RegExp(
    `^${escapeRegularExpression(requiredGithubRepository)}/\\.github/workflows/backend-resilience\\.yml@refs/pull/[1-9]\\d*/merge$`,
    "u",
  );
  if (workflowRef === releaseWorkflowRef) {
    assert.equal(eventName, "workflow_dispatch");
  } else if (eventName === "pull_request") {
    assert.match(workflowRef, backendPullRequestRef);
  } else {
    assert.ok(
      new Set(["schedule", "workflow_dispatch"]).has(eventName) &&
        workflowRef === backendWorkflowMainRef,
      `backend resilience cannot run for ${eventName || "a missing event"}`,
    );
  }
  assert.equal(
    githubSha,
    candidateSha,
    "GitHub SHA must equal the recovery candidate SHA",
  );
  const head = await readHead();
  assert.match(head, /^[0-9a-f]{40}$/u);
  assert.equal(
    candidateSha,
    head,
    "recovery candidate SHA must match the checked-out commit",
  );
  return {
    executor: "github-actions",
    repository,
    eventName,
    candidateSha,
    githubSha,
    workflowRunId,
    workflowRunAttempt: parsedWorkflowRunAttempt,
    workflowRef,
  };
}

async function assertDisposableAdminBoundary(
  pool: DatabaseConnection["pool"],
  connectionString: string,
): Promise<void> {
  const expected = new URL(connectionString);
  const result = await pool.query<{
    database_name: string;
    role_name: string;
    is_replica: boolean;
  }>(
    `SELECT current_database() AS database_name,
            current_user AS role_name,
            pg_is_in_recovery() AS is_replica`,
  );
  assert.deepEqual(result.rows[0], {
    database_name: decodeURIComponent(expected.pathname.slice(1)),
    role_name: decodeURIComponent(expected.username),
    is_replica: false,
  });
}

function databaseUrl(connectionString: string, database: string): string {
  const url = new URL(connectionString);
  url.pathname = `/${database}`;
  return url.toString();
}

function quoteDisposableDatabase(database: string): string {
  if (!disposableDatabasePattern.test(database)) {
    throw new Error(`Refusing unsafe disposable database name: ${database}`);
  }
  return `"${database}"`;
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function postgresCliEnvironment(
  connectionString: string,
  database: string,
): NodeJS.ProcessEnv {
  const url = new URL(connectionString);
  const environment: NodeJS.ProcessEnv = { ...process.env };
  for (const key of Object.keys(environment)) {
    if (key.startsWith("PG")) delete environment[key];
  }
  environment["PGDATABASE"] = database;
  environment["PGHOST"] = url.hostname.replace(/^\[(.*)\]$/, "$1");
  environment["PGPORT"] = url.port || "5432";
  if (url.username) environment["PGUSER"] = decodeURIComponent(url.username);
  if (url.password)
    environment["PGPASSWORD"] = decodeURIComponent(url.password);
  return environment;
}

function postgresContainerArguments(
  clientImage: string,
  connectionString: string,
  database: string,
  temporaryFolder: string,
  command: "pg_dump" | "pg_restore",
  commandArguments: readonly string[],
): string[] {
  const uid = process.getuid?.();
  const gid = process.getgid?.();
  assert.notEqual(
    uid,
    undefined,
    "pinned PostgreSQL client requires a Unix UID",
  );
  assert.notEqual(
    gid,
    undefined,
    "pinned PostgreSQL client requires a Unix GID",
  );
  const environment = postgresCliEnvironment(connectionString, database);
  return [
    "run",
    "--rm",
    "--pull=never",
    "--network=host",
    "--read-only",
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges:true",
    `--user=${uid}:${gid}`,
    "--tmpfs=/tmp:rw,noexec,nosuid,size=16m",
    `--mount=type=bind,source=${temporaryFolder},target=${containerEvidenceFolder}`,
    "--env",
    `PGDATABASE=${environment["PGDATABASE"]}`,
    "--env",
    `PGHOST=${environment["PGHOST"]}`,
    "--env",
    `PGPORT=${environment["PGPORT"]}`,
    "--env",
    `PGUSER=${environment["PGUSER"]}`,
    "--env",
    `PGPASSWORD=${environment["PGPASSWORD"]}`,
    clientImage,
    command,
    ...commandArguments,
  ];
}

async function runPostgresCommand(
  command: "pg_dump" | "pg_restore",
  commandArguments: readonly string[],
  connectionString: string,
  database: string,
  temporaryFolder: string,
  clientImage: string | undefined,
  signal: AbortSignal,
): Promise<void> {
  const executable = clientImage ? "docker" : command;
  const args = clientImage
    ? postgresContainerArguments(
        clientImage,
        connectionString,
        database,
        temporaryFolder,
        command,
        commandArguments,
      )
    : [...commandArguments];
  await execFileAsync(executable, args, {
    ...(clientImage
      ? {}
      : { env: postgresCliEnvironment(connectionString, database) }),
    maxBuffer: 4 * 1024 * 1024,
    timeout: databaseOperationTimeoutMs,
    killSignal: "SIGKILL",
    signal,
  });
}

async function migrateAndSeed(
  connection: DatabaseConnection,
  connectionString: string,
  signal: AbortSignal,
): Promise<void> {
  await migrate(drizzle(connection.pool), {
    migrationsFolder: migrationFolder,
    migrationsSchema: "samra_migrations",
    migrationsTable: "migration_history",
  });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await execFileAsync(
      "pnpm",
      ["--filter", "@workspace/db", "run", "test:seed"],
      {
        cwd: workspaceRoot,
        env: { ...process.env, TEST_DATABASE_URL: connectionString },
        maxBuffer: 4 * 1024 * 1024,
        timeout: databaseOperationTimeoutMs,
        killSignal: "SIGKILL",
        signal,
      },
    );
  }
}

async function collectTableFingerprints(
  pool: DatabaseConnection["pool"],
): Promise<FingerprintSet> {
  const tableResult = await pool.query<{
    table_schema: string;
    table_name: string;
  }>(
    `SELECT table_schema, table_name
     FROM information_schema.tables
     WHERE table_type = 'BASE TABLE'
       AND table_schema NOT IN ('information_schema', 'pg_catalog')
       AND table_schema !~ '^pg_'
     ORDER BY table_schema, table_name`,
  );
  const tables: TableFingerprint[] = [];
  for (const table of tableResult.rows) {
    const qualifiedName = `${quoteIdentifier(table.table_schema)}.${quoteIdentifier(table.table_name)}`;
    const rowResult = await pool.query<{ row_json: string }>(
      `SELECT to_jsonb(row_value)::text AS row_json
       FROM ${qualifiedName} AS row_value
       ORDER BY to_jsonb(row_value)::text`,
    );
    const hash = createHash("sha256");
    for (const row of rowResult.rows) {
      hash.update(row.row_json);
      hash.update("\n");
    }
    tables.push({
      table: `${table.table_schema}.${table.table_name}`,
      rows: rowResult.rowCount ?? rowResult.rows.length,
      sha256: hash.digest("hex"),
    });
  }
  return {
    count: tables.length,
    sha256: sha256(
      `${tables.map((table) => JSON.stringify(table)).join("\n")}\n`,
    ),
    tables,
  };
}

async function collectTriggerFingerprint(
  pool: DatabaseConnection["pool"],
): Promise<TriggerFingerprint> {
  const result = await pool.query<{
    schema_name: string;
    table_name: string;
    trigger_name: string;
    definition: string;
  }>(
    `SELECT namespace.nspname AS schema_name,
            relation.relname AS table_name,
            trigger.tgname AS trigger_name,
            pg_get_triggerdef(trigger.oid, true) AS definition
     FROM pg_trigger AS trigger
     JOIN pg_class AS relation ON relation.oid = trigger.tgrelid
     JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
     WHERE NOT trigger.tgisinternal
       AND namespace.nspname NOT IN ('information_schema', 'pg_catalog')
       AND namespace.nspname !~ '^pg_'
     ORDER BY namespace.nspname, relation.relname, trigger.tgname`,
  );
  const names = result.rows.map((row) => row.trigger_name);
  const missing = requiredTriggers.filter((name) => !names.includes(name));
  assert.deepEqual(
    missing,
    [],
    `required triggers missing: ${missing.join(", ")}`,
  );
  return {
    count: result.rows.length,
    names,
    requiredNames: requiredTriggers,
    sha256: sha256(
      `${result.rows.map((row) => JSON.stringify(row)).join("\n")}\n`,
    ),
  };
}

async function collectSequenceFingerprint(
  pool: DatabaseConnection["pool"],
): Promise<SequenceFingerprint> {
  const result = await pool.query<{
    schemaname: string;
    sequencename: string;
    start_value: string;
    min_value: string;
    max_value: string;
    increment_by: string;
    cycle: boolean;
    cache_size: string;
    last_value: string | null;
  }>(
    `SELECT schemaname, sequencename,
            start_value::text, min_value::text, max_value::text,
            increment_by::text, cycle, cache_size::text, last_value::text
     FROM pg_sequences
     WHERE schemaname NOT IN ('information_schema', 'pg_catalog')
       AND schemaname !~ '^pg_'
     ORDER BY schemaname, sequencename`,
  );
  return {
    count: result.rows.length,
    sha256: sha256(
      `${result.rows.map((row) => JSON.stringify(row)).join("\n")}\n`,
    ),
  };
}

async function collectRecoveryInvariants(
  pool: DatabaseConnection["pool"],
  expectedMigrationCount: number,
  currentMigrationTag: string,
): Promise<RecoveryInvariants> {
  const result = await pool.query<{
    migration_count: string;
    demo_seed_journal_count: string;
    posted_journal_count: string;
    posting_count: string;
    unbalanced_journal_count: string;
    currency_imbalance_count: string;
    balance_projection_drift_count: string;
  }>(
    `WITH journal_totals AS (
       SELECT journal.id,
              count(posting.id) AS posting_count,
              COALESCE(sum(posting.amount_minor)
                FILTER (WHERE posting.side = 'debit'), 0) AS debit_minor,
              COALESCE(sum(posting.amount_minor)
                FILTER (WHERE posting.side = 'credit'), 0) AS credit_minor
       FROM samra_core.ledger_journals AS journal
       LEFT JOIN samra_core.ledger_postings AS posting
         ON posting.journal_id = journal.id
       WHERE journal.state IN ('posted', 'reversed')
       GROUP BY journal.id
     ), currency_totals AS (
       SELECT journal.currency,
              COALESCE(sum(posting.amount_minor)
                FILTER (WHERE posting.side = 'debit'), 0) AS debit_minor,
              COALESCE(sum(posting.amount_minor)
                FILTER (WHERE posting.side = 'credit'), 0) AS credit_minor
       FROM samra_core.ledger_journals AS journal
       JOIN samra_core.ledger_postings AS posting
         ON posting.journal_id = journal.id
       WHERE journal.state IN ('posted', 'reversed')
       GROUP BY journal.currency
     ), projection_drift AS (
       SELECT COALESCE(balance.account_id, truth.account_id) AS account_id
       FROM samra_core.ledger_account_balances AS balance
       FULL OUTER JOIN samra_core.ledger_account_balance_truth AS truth
         ON truth.account_id = balance.account_id
       WHERE balance.account_id IS NULL
          OR truth.account_id IS NULL
          OR balance.currency IS DISTINCT FROM truth.currency
          OR balance.natural_balance_minor IS DISTINCT FROM truth.natural_balance_minor
          OR balance.active_holds_minor IS DISTINCT FROM truth.active_holds_minor
          OR balance.available_balance_minor IS DISTINCT FROM truth.available_balance_minor
          OR balance.applied_posting_count IS DISTINCT FROM truth.applied_posting_count
          OR balance.active_hold_count IS DISTINCT FROM truth.active_hold_count
     )
     SELECT
       (SELECT count(*) FROM samra_migrations.migration_history)::text
         AS migration_count,
       (SELECT count(*) FROM samra_core.ledger_journals
        WHERE business_event_type = 'demo_seed'
          AND business_event_id = 'opening_balance_001')::text
         AS demo_seed_journal_count,
       (SELECT count(*) FROM samra_core.ledger_journals
        WHERE state IN ('posted', 'reversed'))::text AS posted_journal_count,
       (SELECT count(*) FROM samra_core.ledger_postings)::text AS posting_count,
       (SELECT count(*) FROM journal_totals
        WHERE posting_count < 2 OR debit_minor <> credit_minor)::text
         AS unbalanced_journal_count,
       (SELECT count(*) FROM currency_totals
        WHERE debit_minor <> credit_minor)::text AS currency_imbalance_count,
       (SELECT count(*) FROM projection_drift)::text
         AS balance_projection_drift_count`,
  );
  const row = result.rows[0]!;
  const invariants: RecoveryInvariants = {
    migrationCount: Number(row.migration_count),
    currentMigrationTag,
    demoSeedJournalCount: Number(row.demo_seed_journal_count),
    postedJournalCount: Number(row.posted_journal_count),
    postingCount: Number(row.posting_count),
    unbalancedJournalCount: Number(row.unbalanced_journal_count),
    currencyImbalanceCount: Number(row.currency_imbalance_count),
    balanceProjectionDriftCount: Number(row.balance_projection_drift_count),
  };
  assert.equal(invariants.migrationCount, expectedMigrationCount);
  assert.equal(invariants.demoSeedJournalCount, 1);
  assert.ok(invariants.postedJournalCount > 0);
  assert.ok(invariants.postingCount >= 2);
  assert.equal(invariants.unbalancedJournalCount, 0);
  assert.equal(invariants.currencyImbalanceCount, 0);
  assert.equal(invariants.balanceProjectionDriftCount, 0);
  return invariants;
}

async function readServerVersion(pool: DatabaseConnection["pool"]): Promise<{
  raw: string;
  versionNumber: string;
  major: number;
}> {
  const result = await pool.query<{
    server_version: string;
    server_version_num: string;
  }>(
    `SELECT current_setting('server_version') AS server_version,
            current_setting('server_version_num') AS server_version_num`,
  );
  return {
    raw: result.rows[0]!.server_version,
    versionNumber: result.rows[0]!.server_version_num,
    major: parseServerMajor(result.rows[0]!.server_version_num),
  };
}

async function commandVersion(
  command: string,
  signal: AbortSignal,
  clientImage: string | undefined,
): Promise<PostgresVersion> {
  const result = await execFileAsync(
    clientImage ? "docker" : command,
    clientImage
      ? [
          "run",
          "--rm",
          "--pull=never",
          "--network=none",
          "--read-only",
          "--cap-drop=ALL",
          "--security-opt=no-new-privileges:true",
          clientImage,
          command,
          "--version",
        ]
      : ["--version"],
    {
      maxBuffer: 1024 * 1024,
      timeout: 10_000,
      killSignal: "SIGKILL",
      signal,
    },
  );
  return parseClientVersion(command, String(result.stdout).trim());
}

async function closeConnection(
  connection: Pick<DatabaseConnection, "pool"> | undefined,
  cleanupErrors: unknown[],
): Promise<void> {
  try {
    await closeDisposableConnection(connection, databaseOperationTimeoutMs);
  } catch (error) {
    cleanupErrors.push(error);
  }
}

test("RESILIENCE-WEEKLY-007E cleanup waits for physical disconnects before dropping a disposable database", async () => {
  let finishDisconnects: () => void = () => undefined;
  const disconnected = new Promise<void>((resolve) => {
    finishDisconnects = resolve;
  });
  class ClosingPool extends EventEmitter {
    totalCount = 2;
    removed = 0;
    async end(): Promise<void> {
      // pg-pool 3.14 removes clients from its inventory before their asynchronous
      // end callbacks emit 'remove'; its end promise can therefore resolve first.
      this.totalCount = 0;
      for (const delay of [10, 25]) {
        setTimeout(() => {
          this.removed += 1;
          this.emit("remove", {});
          if (this.removed === 2) finishDisconnects();
        }, delay);
      }
    }
  }
  const pool = new ClosingPool();
  const cleanupErrors: unknown[] = [];
  await closeConnection(
    { pool: pool as unknown as DatabaseConnection["pool"] },
    cleanupErrors,
  );
  const removedBeforeReturn = pool.removed;
  await disconnected;
  assert.equal(removedBeforeReturn, 2);
  assert.deepEqual(cleanupErrors, []);
  assert.equal(pool.listenerCount("remove"), 0);
});

test("RESILIENCE-WEEKLY-007A destructive connection guard accepts only exact synthetic profiles", () => {
  const weekly =
    "postgresql://samra_resilience:samra_resilience@127.0.0.1:5432/samra_resilience";
  const release =
    "postgresql://samra_release_recovery:samra_release_recovery@127.0.0.1:5436/samra_release_recovery";
  for (const connectionString of [weekly, release]) {
    assert.equal(
      validateLocalDisposableConnection({
        connectionString,
        confirmation: requiredConfirmation,
        inheritedPostgresVariables: [],
      }),
      connectionString,
    );
  }

  for (const connectionString of [
    weekly.replace("postgresql:", "postgres:"),
    weekly.replace("127.0.0.1", "localhost"),
    weekly.replace(":5432/", ":5433/"),
    weekly.replace(":5432/", ":05432/"),
    weekly.replace("samra_resilience:", "other_role:"),
    weekly.replace("samra_resilience:", "samra%5fresilience:"),
    weekly.replace(":samra_resilience@", ":wrong_password@"),
    weekly.replace(/\/samra_resilience$/u, "/postgres"),
    `${weekly}?sslmode=disable`,
    `${weekly}?`,
    `${weekly}#fragment`,
  ]) {
    assert.throws(() =>
      validateLocalDisposableConnection({
        connectionString,
        confirmation: requiredConfirmation,
        inheritedPostgresVariables: [],
      }),
    );
  }
  assert.throws(() =>
    validateLocalDisposableConnection({
      connectionString: weekly,
      confirmation: "weak-confirmation",
      inheritedPostgresVariables: [],
    }),
  );
  assert.throws(() =>
    validateLocalDisposableConnection({
      connectionString: weekly,
      confirmation: requiredConfirmation,
      inheritedPostgresVariables: ["PGPASSWORD"],
    }),
  );
});

test("RESILIENCE-WEEKLY-007B destructive database-name guard rejects non-random targets", () => {
  const source = `samra_backup_source_${"a".repeat(32)}`;
  const target = `samra_backup_restore_${"b".repeat(32)}`;
  assert.equal(quoteDisposableDatabase(source), `"${source}"`);
  assert.equal(quoteDisposableDatabase(target), `"${target}"`);
  for (const unsafe of [
    "samra_resilience",
    "samra_backup_source_short",
    `samra_backup_source_${"A".repeat(32)}`,
    `samra_backup_source_${"a".repeat(32)}; DROP DATABASE postgres`,
    `samra_backup_other_${"a".repeat(32)}`,
  ]) {
    assert.throws(() => quoteDisposableDatabase(unsafe));
  }
});

test("RESILIENCE-WEEKLY-007C GitHub client tooling requires the pinned PostgreSQL image", () => {
  assert.equal(configuredPostgresClientImage({}), undefined);
  assert.equal(
    configuredPostgresClientImage({
      GITHUB_ACTIONS: "true",
      SAMRA_POSTGRES_CLIENT_IMAGE: pinnedPostgresClientImage,
    }),
    pinnedPostgresClientImage,
  );
  assert.throws(() =>
    configuredPostgresClientImage({ GITHUB_ACTIONS: "true" }),
  );
  assert.throws(() =>
    configuredPostgresClientImage({
      SAMRA_POSTGRES_CLIENT_IMAGE: "postgres:16",
    }),
  );

  const containerArguments = postgresContainerArguments(
    pinnedPostgresClientImage,
    "postgresql://samra_resilience:samra_resilience@127.0.0.1:5432/samra_resilience",
    `samra_backup_source_${"a".repeat(32)}`,
    "/tmp/samra-pinned-client-test",
    "pg_dump",
    ["--version"],
  );
  assert.ok(containerArguments.includes("--pull=never"));
  assert.ok(containerArguments.includes("--read-only"));
  assert.ok(containerArguments.includes("--cap-drop=ALL"));
  assert.ok(
    containerArguments.includes("--security-opt=no-new-privileges:true"),
  );
  assert.ok(containerArguments.includes(pinnedPostgresClientImage));
  assert.deepEqual(containerArguments.slice(-2), ["pg_dump", "--version"]);
});

test("RESILIENCE-WEEKLY-007D recovery provenance is exact in GitHub and explicit locally", async () => {
  assert.deepEqual(await collectRecoveryProvenance({}, async () => "unused"), {
    executor: "local",
    repository: null,
    eventName: null,
    candidateSha: null,
    githubSha: null,
    workflowRunId: null,
    workflowRunAttempt: null,
    workflowRef: null,
  });

  const candidateSha = "a".repeat(40);
  const environment = {
    GITHUB_ACTIONS: "true",
    GITHUB_REPOSITORY: "samra-pay/Samra-Pay",
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_WORKFLOW_REF:
      "samra-pay/Samra-Pay/.github/workflows/release-candidate.yml@refs/heads/main",
    GITHUB_SHA: candidateSha,
    GITHUB_RUN_ID: "123456",
    GITHUB_RUN_ATTEMPT: "2",
    SAMRA_RECOVERY_CANDIDATE_SHA: candidateSha,
  };
  assert.deepEqual(
    await collectRecoveryProvenance(environment, async () => candidateSha),
    {
      executor: "github-actions",
      repository: "samra-pay/Samra-Pay",
      eventName: "workflow_dispatch",
      candidateSha,
      githubSha: candidateSha,
      workflowRunId: "123456",
      workflowRunAttempt: 2,
      workflowRef:
        "samra-pay/Samra-Pay/.github/workflows/release-candidate.yml@refs/heads/main",
    },
  );
  await assert.rejects(
    collectRecoveryProvenance(environment, async () => "c".repeat(40)),
    /must match the checked-out commit/,
  );
  await assert.rejects(
    collectRecoveryProvenance(
      { ...environment, GITHUB_SHA: "b".repeat(40) },
      async () => candidateSha,
    ),
    /GitHub SHA must equal/,
  );
  await assert.rejects(
    collectRecoveryProvenance(
      { ...environment, GITHUB_REPOSITORY: "attacker/fork" },
      async () => candidateSha,
    ),
  );
  const migration = JSON.parse(
    await readFile(
      join(
        workspaceRoot,
        "deploy/gcp/staging-github-enterprise-migration.json",
      ),
      "utf8",
    ),
  ) as { repository: { previousAuthority: { nameWithOwner: string } } };
  await assert.rejects(
    collectRecoveryProvenance(
      {
        ...environment,
        GITHUB_REPOSITORY: migration.repository.previousAuthority.nameWithOwner,
      },
      async () => candidateSha,
    ),
  );
  await assert.rejects(
    collectRecoveryProvenance(
      { ...environment, GITHUB_EVENT_NAME: "push" },
      async () => candidateSha,
    ),
  );
  await assert.rejects(
    collectRecoveryProvenance(
      {
        ...environment,
        GITHUB_WORKFLOW_REF:
          "samra-pay/Samra-Pay/.github/workflows/release-candidate.yml@refs/heads/feature",
      },
      async () => candidateSha,
    ),
  );
  await assert.rejects(
    collectRecoveryProvenance(
      { ...environment, GITHUB_RUN_ID: "0" },
      async () => candidateSha,
    ),
  );
  await assert.rejects(
    collectRecoveryProvenance(
      { ...environment, GITHUB_RUN_ATTEMPT: "1.5" },
      async () => candidateSha,
    ),
  );
  await assert.rejects(
    collectRecoveryProvenance(
      { ...environment, SAMRA_RECOVERY_CANDIDATE_SHA: "short" },
      async () => candidateSha,
    ),
  );
  const backendPullRequest = {
    ...environment,
    GITHUB_EVENT_NAME: "pull_request",
    GITHUB_WORKFLOW_REF:
      "samra-pay/Samra-Pay/.github/workflows/backend-resilience.yml@refs/pull/42/merge",
  };
  assert.equal(
    (
      await collectRecoveryProvenance(
        backendPullRequest,
        async () => candidateSha,
      )
    ).eventName,
    "pull_request",
  );
  await assert.rejects(
    collectRecoveryProvenance(
      { GITHUB_SHA: candidateSha },
      async () => candidateSha,
    ),
    /Local recovery provenance cannot accept/,
  );
});

test(
  "RESILIENCE-WEEKLY-007 synthetic PostgreSQL custom dump restores exactly and leaves no dump",
  { timeout: 300_000 },
  async (context: TestContext) => {
    await rm(evidencePath, { force: true });
    const connectionString = requireLocalDisposableConnection();

    const suffix = randomUUID().replaceAll("-", "");
    const sourceDatabase = `samra_backup_source_${suffix}`;
    const targetDatabase = `samra_backup_restore_${suffix}`;
    const sourceIdentifier = quoteDisposableDatabase(sourceDatabase);
    const targetIdentifier = quoteDisposableDatabase(targetDatabase);
    const sourceUrl = databaseUrl(connectionString, sourceDatabase);
    const targetUrl = databaseUrl(connectionString, targetDatabase);
    const temporaryFolder = await mkdtemp(
      join(tmpdir(), "samra-backup-restore-"),
    );
    const dumpPath = join(temporaryFolder, "synthetic.dump");
    const databasePoolConfig = {
      query_timeout: databaseOperationTimeoutMs,
      statement_timeout: databaseOperationTimeoutMs,
    } as const;
    const admin = createDatabase({
      connectionString,
      poolConfig: databasePoolConfig,
    });
    let source: DatabaseConnection | undefined;
    let target: DatabaseConnection | undefined;
    let sourceCreated = false;
    let targetCreated = false;
    let primaryError: unknown;
    let evidence: Record<string, unknown> | undefined;
    const startedAt = performance.now();

    try {
      const expectedMigrations = await loadExpectedMigrations();
      const clientImage = configuredPostgresClientImage();
      const provenance = await collectRecoveryProvenance();
      const clientDumpPath = clientImage
        ? `${containerEvidenceFolder}/synthetic.dump`
        : dumpPath;

      await assertDisposableAdminBoundary(admin.pool, connectionString);
      const pgDumpVersion = await commandVersion(
        "pg_dump",
        context.signal,
        clientImage,
      );
      const pgRestoreVersion = await commandVersion(
        "pg_restore",
        context.signal,
        clientImage,
      );

      await admin.pool.query(`CREATE DATABASE ${sourceIdentifier}`);
      sourceCreated = true;
      await admin.pool.query(`CREATE DATABASE ${targetIdentifier}`);
      targetCreated = true;

      source = createDatabase({
        connectionString: sourceUrl,
        poolConfig: databasePoolConfig,
      });
      const migrationSeedStartedAt = performance.now();
      await migrateAndSeed(source, sourceUrl, context.signal);
      const migrationSeedMs = performance.now() - migrationSeedStartedAt;

      const sourceServerVersion = await readServerVersion(source.pool);
      assert.equal(pgDumpVersion.major, sourceServerVersion.major);
      assert.equal(pgRestoreVersion.major, sourceServerVersion.major);
      const sourceTables = await collectTableFingerprints(source.pool);
      assert.ok(
        sourceTables.tables.some(
          ({ table }) => table === "samra_migrations.migration_history",
        ),
      );
      assert.ok(
        sourceTables.tables.some(
          ({ table }) => table === "samra_core.ledger_postings",
        ),
      );
      const sourceTriggers = await collectTriggerFingerprint(source.pool);
      const sourceSequences = await collectSequenceFingerprint(source.pool);
      const sourceMigrations = await collectMigrationFingerprint(
        source.pool,
        expectedMigrations,
      );
      const sourceInvariants = await collectRecoveryInvariants(
        source.pool,
        expectedMigrations.count,
        expectedMigrations.currentTag,
      );

      const dumpStartedAt = performance.now();
      await runPostgresCommand(
        "pg_dump",
        [
          "--format=custom",
          "--no-owner",
          "--no-privileges",
          `--file=${clientDumpPath}`,
        ],
        connectionString,
        sourceDatabase,
        temporaryFolder,
        clientImage,
        context.signal,
      );
      const dumpMs = performance.now() - dumpStartedAt;
      const dumpStats = await stat(dumpPath);
      const dumpSha256 = await hashBoundedFile(
        dumpPath,
        dumpStats.size,
        context.signal,
      );

      const restoreStartedAt = performance.now();
      await runPostgresCommand(
        "pg_restore",
        [
          "--single-transaction",
          "--exit-on-error",
          "--no-owner",
          "--no-privileges",
          `--dbname=${targetDatabase}`,
          clientDumpPath,
        ],
        connectionString,
        targetDatabase,
        temporaryFolder,
        clientImage,
        context.signal,
      );
      const restoreMs = performance.now() - restoreStartedAt;

      target = createDatabase({
        connectionString: targetUrl,
        poolConfig: databasePoolConfig,
      });
      const verificationStartedAt = performance.now();
      const targetServerVersion = await readServerVersion(target.pool);
      const targetTables = await collectTableFingerprints(target.pool);
      const targetTriggers = await collectTriggerFingerprint(target.pool);
      const targetSequences = await collectSequenceFingerprint(target.pool);
      const targetMigrations = await collectMigrationFingerprint(
        target.pool,
        expectedMigrations,
      );
      const targetInvariants = await collectRecoveryInvariants(
        target.pool,
        expectedMigrations.count,
        expectedMigrations.currentTag,
      );
      assert.deepEqual(targetServerVersion, sourceServerVersion);
      assert.deepEqual(targetTables, sourceTables);
      assert.deepEqual(targetTriggers, sourceTriggers);
      assert.deepEqual(targetSequences, sourceSequences);
      assert.deepEqual(targetMigrations, sourceMigrations);
      assert.deepEqual(targetInvariants, sourceInvariants);
      const verificationMs = performance.now() - verificationStartedAt;

      evidence = {
        schemaVersion: 1,
        kind: "samra-synthetic-postgres-backup-restore",
        generatedAt: new Date().toISOString(),
        result: "pass",
        provenance,
        tooling: {
          clientMode: clientImage ? "digest-pinned-container" : "local-path",
          clientImage: clientImage ?? null,
        },
        boundaries: {
          localhostOnly: true,
          disposableDatabasesOnly: true,
          syntheticDataOnly: true,
          cloudAccess: false,
          customerData: false,
          dumpRetained: false,
        },
        databases: {
          sourcePattern: "samra_backup_source_<32-lowercase-hex>",
          targetPattern: "samra_backup_restore_<32-lowercase-hex>",
        },
        versions: {
          postgres: sourceServerVersion,
          pgDump: pgDumpVersion,
          pgRestore: pgRestoreVersion,
        },
        dump: {
          format: "custom",
          bytes: dumpStats.size,
          maximumBytes: maximumDumpBytes,
          sha256: dumpSha256,
          retained: false,
        },
        timingsMs: {
          migrationAndSeed: roundedMilliseconds(migrationSeedMs),
          dump: roundedMilliseconds(dumpMs),
          restore: roundedMilliseconds(restoreMs),
          verification: roundedMilliseconds(verificationMs),
        },
        comparison: {
          allTableFingerprintsMatch: true,
          sequenceStateMatches: true,
          triggerDefinitionsMatch: true,
          migrationHistoryMatchesCheckedInSql: true,
          recoveryInvariantsMatch: true,
        },
        tableFingerprints: sourceTables,
        sequences: sourceSequences,
        triggers: sourceTriggers,
        migrations: sourceMigrations,
        invariants: sourceInvariants,
      };
    } catch (error) {
      primaryError = error;
    }

    const cleanupStartedAt = performance.now();
    const cleanupErrors: unknown[] = [];
    await closeConnection(target, cleanupErrors);
    await closeConnection(source, cleanupErrors);
    if (targetCreated) {
      try {
        await admin.pool.query(
          `DROP DATABASE IF EXISTS ${targetIdentifier} WITH (FORCE)`,
        );
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (sourceCreated) {
      try {
        await admin.pool.query(
          `DROP DATABASE IF EXISTS ${sourceIdentifier} WITH (FORCE)`,
        );
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    await closeConnection(admin, cleanupErrors);
    try {
      await rm(temporaryFolder, { recursive: true, force: true });
    } catch (error) {
      cleanupErrors.push(error);
    }

    if (primaryError || cleanupErrors.length > 0) {
      throw new AggregateError(
        [primaryError, ...cleanupErrors].filter(
          (error): error is NonNullable<unknown> => error != null,
        ),
        "Synthetic PostgreSQL backup-and-restore rehearsal failed.",
      );
    }
    assert.ok(evidence);
    await assert.rejects(stat(dumpPath), { code: "ENOENT" });
    const cleanupMs = performance.now() - cleanupStartedAt;
    const totalMs = performance.now() - startedAt;
    evidence["timingsMs"] = {
      ...(evidence["timingsMs"] as Record<string, number>),
      cleanup: roundedMilliseconds(cleanupMs),
      total: roundedMilliseconds(totalMs),
    };
    await mkdir(join(apiServerRoot, "test-results"), { recursive: true });
    await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
  },
);
