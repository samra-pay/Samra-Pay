import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  executeStagingMigration,
  migrationCatalog,
  validateMigrationEnvironment,
  verifyHistory,
} from "../../lib/db/staging-migrate.mjs";
import {
  MIGRATION as M,
  buildMigrationManifest,
  extractMigrationReport,
  validateMigrationReport,
  verifyMigrationManifest,
  writeMigrationManifest,
  hash,
} from "./staging-migration-evidence.mjs";
import {
  MIGRATION_CONTROLLER_PERMISSIONS,
  runStagingMigrations,
  validateCreatedMigrationJob,
  validateMigrationControllerEnvironment,
  validateMigrationIam,
  validateSqlMigrationTarget,
} from "./run-staging-migrations.mjs";
import {
  buildStagingImagePublicationManifest,
  STAGING_IMAGE_NAMES,
} from "./record-staging-image-publication.mjs";
import {
  imageSecurityGate,
  releaseCandidateLineage,
} from "./staging-release-test-fixtures.mjs";
import { validateGitHubUpstreamRunMetadata } from "./verify-github-upstream-artifact.mjs";

const candidate = "a".repeat(40);
const catalog = migrationCatalog();
const rows = catalog.map((entry) => ({
  hash: entry.hash,
  created_at: String(entry.createdAt),
}));
const history = verifyHistory(rows, catalog, true);
const execution = `${M.job}-abc123`;
const report = () => ({
  event: "samra_staging_migration",
  candidateSha: candidate,
  execution,
  secretVersion: "7",
  catalog,
  before: history.slice(0, -1),
  after: history,
  appliedCount: 1,
  database: "samra_staging",
  databaseUser: "samra_migrations_staging",
  encrypted: true,
});
const expected = { candidateSha: candidate, execution, secretVersion: "7" };
const future = () => new Date(Date.now() + 1800000).toISOString();

function environment() {
  return {
    GITHUB_SHA: candidate,
    GITHUB_REPOSITORY: "samra-pay/Samra-Pay",
    GITHUB_REPOSITORY_ID: "1335175962",
    GITHUB_REPOSITORY_OWNER_ID: "320532147",
    GITHUB_REF: "refs/heads/main",
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_WORKFLOW_REF:
      "samra-pay/Samra-Pay/.github/workflows/staging-migrations.yml@refs/heads/main",
    GITHUB_RUN_ID: "20",
    GITHUB_RUN_ATTEMPT: "1",
    SAMRA_PUBLICATION_RUN_ID: "10",
    SAMRA_PUBLICATION_RUN_ATTEMPT: "1",
    SAMRA_MIGRATION_SECRET_VERSION: "7",
    SAMRA_MIGRATION_AUTHORIZATION: "AUTHORIZED_STAGING_MIGRATION",
    SAMRA_MIGRATION_EXPIRES_AT: future(),
  };
}
function publication() {
  const images = Object.fromEntries(
    STAGING_IMAGE_NAMES.map((name) => [
      name,
      `us-east4-docker.pkg.dev/samra-pay-staging/samra-staging/${name}@sha256:${"c".repeat(64)}`,
    ]),
  );
  return buildStagingImagePublicationManifest({
    candidateSha: candidate,
    gitTreeSha: "b".repeat(40),
    projectId: M.project,
    projectNumber: M.projectNumber,
    region: M.region,
    repository: "samra-staging",
    sourceRepository: "samra-pay/Samra-Pay",
    cloudBuildId: "0ebc07c2-3e97-4d6c-8ff3-1bbf6229db00",
    publisherIdentity:
      "samra-github-staging@samra-pay-staging.iam.gserviceaccount.com",
    buildServiceAccount:
      "samra-cloud-build-staging@samra-pay-staging.iam.gserviceaccount.com",
    githubRunId: "10",
    githubRunAttempt: "1",
    githubActor: "test",
    generatedAt: "2026-09-05T12:00:00Z",
    imageDigests: images,
    securityGate: imageSecurityGate(images),
    releaseCandidate: releaseCandidateLineage(candidate, "b".repeat(40)),
  });
}
function manifest() {
  return buildMigrationManifest({
    publication: publication(),
    publicationHash: "d".repeat(64),
    report: report(),
    githubRunId: "20",
    githubRunAttempt: "1",
    generatedAt: "2026-09-05T12:30:00Z",
    cleanupVerified: true,
  });
}

test("migration history must match the full ordered source prefix, including hashes", () => {
  assert.equal(history.length, 20);
  assert.deepEqual(verifyHistory([], catalog), []);
  for (const changed of [
    rows.slice(1),
    [...rows].reverse(),
    [...rows, rows[0]],
    [{ ...rows[0], hash: "f".repeat(64) }],
    [{ ...rows[0], created_at: "NaN" }],
  ])
    assert.throws(() => verifyHistory(changed, catalog));
  assert.throws(() => verifyHistory(rows.slice(0, -1), catalog, true));
});

function clientFixture({
  before = rows.slice(0, -1),
  after = rows,
  acquired = true,
  identity = {},
} = {}) {
  const calls = [];
  let reads = 0;
  return {
    calls,
    query: async (sql) => {
      calls.push(sql);
      if (sql.includes("current_database"))
        return {
          rows: [
            {
              database: "samra_staging",
              username: "samra_migrations_staging",
              encrypted: true,
              rolsuper: false,
              rolcreatedb: false,
              rolcreaterole: false,
              rolreplication: false,
              rolbypassrls: false,
              ...identity,
            },
          ],
        };
      if (sql.includes("pg_try_advisory_lock")) return { rows: [{ acquired }] };
      if (sql.includes("to_regclass"))
        return { rows: [{ history: "migration_history" }] };
      if (sql.startsWith("SELECT hash"))
        return { rows: reads++ === 0 ? before : after };
      return { rows: [] };
    },
  };
}
test("migration runs once on the locked connection and verifies the resulting history", async () => {
  const client = clientFixture();
  let runs = 0;
  const result = await executeStagingMigration({
    client,
    migrate: async (connection) => {
      assert.equal(connection, client);
      runs++;
    },
  });
  assert.equal(runs, 1);
  assert.equal(result.appliedCount, 1);
  assert.match(client.calls.at(-1), /pg_advisory_unlock/);
});
test("concurrent, wrong-role, unencrypted and modified-history runs never execute migrations", async () => {
  for (const options of [
    { acquired: false },
    { identity: { encrypted: false } },
    { identity: { username: "postgres" } },
    { identity: { rolsuper: true } },
    { before: [{ ...rows[0], hash: "bad" }] },
  ]) {
    let runs = 0;
    const client = clientFixture(options);
    await assert.rejects(
      executeStagingMigration({
        client,
        migrate: async () => {
          runs++;
        },
      }),
    );
    assert.equal(runs, 0);
  }
});
test("a migration failure releases the lock; a missing post-migration row cannot become success", async () => {
  const client = clientFixture();
  await assert.rejects(
    executeStagingMigration({
      client,
      migrate: async () => {
        throw new Error("test failure");
      },
    }),
  );
  assert.match(client.calls.at(-1), /pg_advisory_unlock/);
  await assert.rejects(
    executeStagingMigration({
      client: clientFixture({ after: rows.slice(0, -1) }),
      migrate: async () => {},
    }),
  );
});
test("completed-history replay performs no additional migrations in its evidence", async () => {
  const result = await executeStagingMigration({
    client: clientFixture({ before: rows }),
    migrate: async () => {},
  });
  assert.equal(result.appliedCount, 0);
  assert.deepEqual(result.before, result.after);
});

test("migration execution requires exact manual main identity, numeric pins and an expiring approval", () => {
  assert.doesNotThrow(() =>
    validateMigrationControllerEnvironment(environment(), "migrate"),
  );
  for (const change of [
    { GITHUB_SHA: "main" },
    { GITHUB_REF: "refs/heads/other" },
    { GITHUB_EVENT_NAME: "push" },
    { GITHUB_REPOSITORY_ID: "1" },
    { SAMRA_MIGRATION_SECRET_VERSION: "latest" },
    { SAMRA_MIGRATION_SECRET_VERSION: "1e3" },
    { SAMRA_MIGRATION_AUTHORIZATION: "" },
    { SAMRA_MIGRATION_EXPIRES_AT: "invalid" },
    { SAMRA_MIGRATION_EXPIRES_AT: new Date(Date.now() - 1).toISOString() },
    {
      SAMRA_MIGRATION_EXPIRES_AT: new Date(Date.now() + 86400000).toISOString(),
    },
  ])
    assert.throws(() =>
      validateMigrationControllerEnvironment(
        { ...environment(), ...change },
        "migrate",
      ),
    );
  assert.doesNotThrow(() =>
    validateMigrationControllerEnvironment(
      {
        ...environment(),
        SAMRA_MIGRATION_AUTHORIZATION: "",
        SAMRA_MIGRATION_EXPIRES_AT: "",
      },
      "review",
    ),
  );
});
test("runtime independently rejects wrong job, task retry, expired approval and external database", () => {
  const env = {
    NODE_ENV: "production",
    SAMRA_DEPLOYMENT_ENVIRONMENT: "staging",
    SAMRA_CANDIDATE_SHA: candidate,
    SAMRA_MIGRATION_SECRET_VERSION: "7",
    SAMRA_MIGRATION_EXPIRES_AT: future(),
    CLOUD_RUN_JOB: M.job,
    CLOUD_RUN_EXECUTION: execution,
    CLOUD_RUN_TASK_INDEX: "0",
    CLOUD_RUN_TASK_ATTEMPT: "0",
    CLOUD_RUN_TASK_COUNT: "1",
    DATABASE_URL:
      "postgresql://samra_migrations_staging:fixture@10.41.0.3:5432/samra_staging?sslmode=require",
  };
  assert.doesNotThrow(() => validateMigrationEnvironment(env));
  for (const change of [
    { CLOUD_RUN_JOB: "other" },
    { CLOUD_RUN_TASK_ATTEMPT: "1" },
    { CLOUD_RUN_TASK_COUNT: "2" },
    { SAMRA_MIGRATION_EXPIRES_AT: "2000-01-01" },
    { DATABASE_URL: env.DATABASE_URL.replace("10.41.0.3", "example.invalid") },
    { DATABASE_URL: env.DATABASE_URL.replace("require", "disable") },
  ])
    assert.throws(() => validateMigrationEnvironment({ ...env, ...change }));
});
test("SQL preflight rejects public connectivity, disabled TLS and missing recovery controls", () => {
  const value = {
    name: M.instance,
    region: M.region,
    databaseVersion: "POSTGRES_16",
    state: "RUNNABLE",
    settings: {
      ipConfiguration: {
        ipv4Enabled: false,
        privateNetwork: `https://www.googleapis.com/compute/v1/projects/${M.project}/global/networks/${M.network}`,
        sslMode: "ENCRYPTED_ONLY",
      },
      backupConfiguration: { enabled: true, pointInTimeRecoveryEnabled: true },
      deletionProtectionEnabled: true,
    },
  };
  assert.doesNotThrow(() => validateSqlMigrationTarget(value));
  for (const mutate of [
    (v) => {
      v.settings.ipConfiguration.ipv4Enabled = true;
    },
    (v) => {
      v.settings.ipConfiguration.sslMode = "ALLOW_UNENCRYPTED_AND_ENCRYPTED";
    },
    (v) => {
      v.settings.backupConfiguration.pointInTimeRecoveryEnabled = false;
    },
    (v) => {
      v.settings.deletionProtectionEnabled = false;
    },
  ]) {
    const changed = structuredClone(value);
    mutate(changed);
    assert.throws(() => validateSqlMigrationTarget(changed));
  }
});

test("report validation rejects wrong source, execution, secret, role, journal and count", () => {
  assert.deepEqual(validateMigrationReport(report(), expected), report());
  for (const change of [
    { candidateSha: "b".repeat(40) },
    { execution: `${M.job}-other` },
    { secretVersion: "latest" },
    { databaseUser: "postgres" },
    { encrypted: false },
    { appliedCount: 2 },
    { after: history.slice(0, -1) },
    { before: history.slice(1) },
    { catalog: [] },
  ])
    assert.throws(() =>
      validateMigrationReport({ ...report(), ...change }, expected),
    );
  assert.equal(
    "unexpectedSecret" in
      validateMigrationReport(
        { ...report(), unexpectedSecret: "DO_NOT_RETAIN" },
        expected,
      ),
    false,
  );
});
test("only one report from the exact Cloud Run execution and restricted stdout is accepted", () => {
  const entry = {
    resource: {
      type: "cloud_run_job",
      labels: { project_id: M.project, location: M.region, job_name: M.job },
    },
    labels: { execution_name: execution },
    logName: `projects/${M.project}/logs/run.googleapis.com%2Fstdout`,
    jsonPayload: report(),
  };
  assert.deepEqual(extractMigrationReport([entry], expected), report());
  for (const logs of [
    [],
    [entry, entry],
    [{ ...entry, labels: { execution_name: "other" } }],
    [{ ...entry, logName: "stderr" }],
  ])
    assert.throws(() => extractMigrationReport(logs, expected));
});
test("migration artifacts bind publication, run, contents and cleanup without authorizing deployment", async () => {
  const dir = await mkdtemp(join(tmpdir(), "samra-migration-evidence-"));
  const path = join(dir, "manifest.json"),
    sidecar = join(dir, "manifest.sha256");
  try {
    const value = manifest();
    const expectedBinding = {
      publication: publication(),
      publicationHash: "d".repeat(64),
      candidateSha: candidate,
      runId: "20",
      runAttempt: "1",
    };
    await writeMigrationManifest(value, path, sidecar);
    assert.equal(
      (await verifyMigrationManifest(path, sidecar, expectedBinding))
        .deploymentAuthorized,
      false,
    );
    for (const change of [
      { candidateSha: "b".repeat(40) },
      { runId: "21" },
      { runAttempt: "2" },
      { publicationHash: "e".repeat(64) },
    ])
      await assert.rejects(
        verifyMigrationManifest(path, sidecar, {
          ...expectedBinding,
          ...change,
        }),
      );
    for (const mutate of [
      (v) => {
        v.status = "review-completed";
      },
      (v) => {
        v.execution.deleted = false;
      },
      (v) => {
        v.publication.imageDigest = "latest";
      },
      (v) => {
        v.report.after.pop();
      },
    ]) {
      const changed = structuredClone(value);
      mutate(changed);
      const content = JSON.stringify(changed);
      await writeFile(path, content);
      await writeFile(sidecar, hash(content));
      await assert.rejects(
        verifyMigrationManifest(path, sidecar, expectedBinding),
      );
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("GitHub provenance accepts only the registered successful same-SHA migration producer", () => {
  const repo = {
    id: 1335175962,
    full_name: "samra-pay/Samra-Pay",
    owner: { id: 320532147 },
  };
  const metadata = {
    id: 20,
    run_attempt: 1,
    name: M.workflow,
    path: M.workflowPath,
    event: "workflow_dispatch",
    head_branch: "main",
    head_sha: candidate,
    status: "completed",
    conclusion: "success",
    html_url: "https://github.com/samra-pay/Samra-Pay/actions/runs/20",
    repository: repo,
    head_repository: repo,
  };
  const input = {
    kind: "staging-migration",
    candidateSha: candidate,
    runId: "20",
    runAttempt: "1",
    artifactName: `staging-migration-${candidate}-run-20-attempt-1`,
  };
  assert.doesNotThrow(() => validateGitHubUpstreamRunMetadata(metadata, input));
  for (const change of [
    { path: ".github/workflows/operator.yml" },
    { conclusion: "failure" },
    { run_attempt: 2 },
    { head_sha: "b".repeat(40) },
  ])
    assert.throws(() =>
      validateGitHubUpstreamRunMetadata({ ...metadata, ...change }, input),
    );
});

test("workflow keeps review non-mutating and publishes only successful migration evidence", async () => {
  const workflow = await readFile(M.workflowPath, "utf8");
  assert.match(
    workflow,
    /group: staging-database-mutation\n  cancel-in-progress: false/,
  );
  assert.doesNotMatch(workflow, /^\s+(push|pull_request|schedule):/m);
  assert.match(workflow, /environment: staging-migrations/);
  assert.match(workflow, /if: inputs.mode == 'migrate' && success\(\)/);
  assert.ok(
    workflow.indexOf("Validate downloaded publication") <
      workflow.indexOf("google-github-actions/auth@"),
  );
  assert.doesNotMatch(
    workflow,
    /credentials_json|secrets\.|:latest|continue-on-error/,
  );
  const plan = execFileSync(
    process.execPath,
    ["deploy/gcp/run-staging-migrations.mjs", "--plan"],
    { encoding: "utf8", env: { ...process.env, PATH: "" } },
  );
  assert.match(plan, /No cloud action attempted/);
  const bootstrap = await readFile(
    "deploy/gcp/activate-staging-database-access.sh",
    "utf8",
  );
  assert.doesNotMatch(bootstrap, /:latest|versions access latest/);
  assert.match(bootstrap, /enabled.length !== 1/);
});

test("migration custom permissions cannot read credentials, alter IAM or deploy services", () => {
  assert.doesNotMatch(
    MIGRATION_CONTROLLER_PERMISSIONS.join(","),
    /versions.access|setIamPolicy|run.services|jobs.update|runWithOverrides/,
  );
  const binding = (role, member) => ({ role, members: [member] });
  const principal = `principalSet://iam.googleapis.com/projects/${M.projectNumber}/locations/global/workloadIdentityPools/${M.pool}/attribute.repository_id/1335175962`;
  const value = {
    projectPolicy: {
      bindings: [
        binding(
          `projects/${M.project}/roles/samraStagingMigrationController`,
          `serviceAccount:${M.controller}`,
        ),
        binding("roles/cloudsql.client", `serviceAccount:${M.runtime}`),
      ],
    },
    customRole: {
      stage: "GA",
      includedPermissions: MIGRATION_CONTROLLER_PERMISSIONS,
    },
    controllerPolicy: {
      bindings: [binding("roles/iam.workloadIdentityUser", principal)],
    },
    runtimePolicy: {
      bindings: [
        binding(
          "roles/iam.serviceAccountUser",
          `serviceAccount:${M.controller}`,
        ),
      ],
    },
    secretPolicy: {
      bindings: [
        binding(
          "roles/secretmanager.secretAccessor",
          `serviceAccount:${M.runtime}`,
        ),
      ],
    },
  };
  assert.doesNotThrow(() => validateMigrationIam(value));
  for (const mutate of [
    (v) => {
      v.projectPolicy.bindings.push(
        binding("roles/owner", `serviceAccount:${M.controller}`),
      );
    },
    (v) => {
      v.customRole.includedPermissions.push("secretmanager.versions.access");
    },
    (v) => {
      v.controllerPolicy.bindings[0].members.push("allUsers");
    },
    (v) => {
      v.secretPolicy.bindings.push(
        binding(
          "roles/secretmanager.secretAccessor",
          `serviceAccount:${M.controller}`,
        ),
      );
    },
  ]) {
    const changed = structuredClone(value);
    mutate(changed);
    assert.throws(() => validateMigrationIam(changed));
  }
});

test("controller review performs only metadata reads and refuses drift before job creation", async () => {
  const dir = await mkdtemp(join(tmpdir(), "samra-migration-review-"));
  try {
    const source = JSON.stringify(publication());
    const env = {
      ...environment(),
      SAMRA_PUBLICATION_MANIFEST: join(dir, "publication.json"),
      SAMRA_PUBLICATION_HASH: join(dir, "publication.sha256"),
    };
    await writeFile(env.SAMRA_PUBLICATION_MANIFEST, source);
    await writeFile(env.SAMRA_PUBLICATION_HASH, hash(source));
    const member = (account) => `serviceAccount:${account}`;
    const policy = (role, account) => ({
      bindings: [{ role, members: [account] }],
    });
    const condition = `assertion.repository=='${env.GITHUB_REPOSITORY}' && assertion.repository_id=='1335175962' && assertion.repository_owner_id=='320532147' && assertion.ref=='refs/heads/main' && assertion.event_name=='workflow_dispatch' && assertion.workflow=='${M.workflow}' && assertion.workflow_ref=='${env.GITHUB_REPOSITORY}/${M.workflowPath}@refs/heads/main' && assertion.environment=='${M.environment}'`;
    const sql = {
      name: M.instance,
      region: M.region,
      databaseVersion: "POSTGRES_16",
      state: "RUNNABLE",
      settings: {
        ipConfiguration: {
          ipv4Enabled: false,
          privateNetwork: `https://www.googleapis.com/compute/v1/projects/${M.project}/global/networks/${M.network}`,
          sslMode: "ENCRYPTED_ONLY",
        },
        backupConfiguration: {
          enabled: true,
          pointInTimeRecoveryEnabled: true,
        },
        deletionProtectionEnabled: true,
      },
    };
    const calls = [];
    let upstreamVerified = false;
    let secretState = "ENABLED";
    const command = (binary, args) => {
      calls.push([binary, ...args]);
      if (binary === "git") return args[0] === "rev-parse" ? candidate : "";
      assert.equal(upstreamVerified, true);
      const start = args.slice(0, 3).join(" ");
      let result;
      if (start === "config get-value account") return M.controller;
      if (start === "config get-value project") return M.project;
      if (start === `projects describe ${M.project}`)
        result = {
          projectNumber: M.projectNumber,
          parent: { type: "organization", id: M.organization },
          labels: { environment: "staging", data_classification: "synthetic" },
        };
      else if (start === "iam workload-identity-pools providers")
        result = {
          state: "ACTIVE",
          oidc: { issuerUri: "https://token.actions.githubusercontent.com" },
          attributeCondition: condition,
        };
      else if (start === "iam service-accounts describe")
        result = { disabled: false };
      else if (start === "iam service-accounts keys") result = [];
      else if (start === `projects get-iam-policy ${M.project}`)
        result = {
          bindings: [
            ...policy(
              `projects/${M.project}/roles/samraStagingMigrationController`,
              member(M.controller),
            ).bindings,
            ...policy("roles/cloudsql.client", member(M.runtime)).bindings,
          ],
        };
      else if (start === "iam roles describe")
        result = {
          stage: "GA",
          includedPermissions: MIGRATION_CONTROLLER_PERMISSIONS,
        };
      else if (start === "iam service-accounts get-iam-policy")
        result =
          args[3] === M.controller
            ? policy(
                "roles/iam.workloadIdentityUser",
                `principalSet://iam.googleapis.com/projects/${M.projectNumber}/locations/global/workloadIdentityPools/${M.pool}/attribute.repository_id/1335175962`,
              )
            : policy("roles/iam.serviceAccountUser", member(M.controller));
      else if (start === `secrets get-iam-policy ${M.secret}`)
        result = policy(
          "roles/secretmanager.secretAccessor",
          member(M.runtime),
        );
      else if (start === "sql instances describe") result = sql;
      else if (start === "secrets versions describe")
        result = {
          state: secretState,
          name: `projects/${M.projectNumber}/secrets/${M.secret}/versions/7`,
        };
      else if (start === "artifacts docker images") result = {};
      else if (start === "compute networks subnets")
        result = {
          network: sql.settings.ipConfiguration.privateNetwork,
          privateIpGoogleAccess: true,
        };
      else if (start === "logging views describe")
        result = {
          filter: `resource.type="cloud_run_job" AND resource.labels.job_name="${M.job}"`,
        };
      else if (start === "run jobs list") result = [];
      else throw new Error(`Unexpected or mutating command: ${start}`);
      return JSON.stringify(result);
    };
    const verifyUpstream = async (input) => {
      assert.equal(input.kind, "staging-image-publication");
      assert.equal(input.candidateSha, candidate);
      upstreamVerified = true;
    };
    const result = await runStagingMigrations({
      env,
      mode: "review",
      command,
      verifyUpstream,
    });
    assert.equal(result.mutationPerformed, false);
    assert.equal(result.migrationEvidenceProduced, false);
    assert.equal(
      calls.some(
        (call) =>
          call.includes("create") ||
          call.includes("execute") ||
          call.includes("delete") ||
          call.includes("access"),
      ),
      false,
    );
    calls.length = 0;
    secretState = "DISABLED";
    await assert.rejects(
      runStagingMigrations({ env, mode: "migrate", command, verifyUpstream }),
      /Pinned migration secret unavailable/,
    );
    assert.equal(
      calls.some((call) => call.includes("create") || call.includes("execute")),
      false,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("created job attestation rejects changed image, floating secret and expanded execution", () => {
  const image = publication().imageDigests["samra-migrations"];
  const expiresAt = "2026-09-05T13:00:00.000Z";
  const container = {
    image,
    command: ["node"],
    args: ["./staging-migrate.mjs"],
    resources: { limits: { cpu: "1", memory: "512Mi" } },
    env: [
      {
        name: "DATABASE_URL",
        valueFrom: { secretKeyRef: { name: M.secret, key: "7" } },
      },
      { name: "SAMRA_CANDIDATE_SHA", value: candidate },
      { name: "SAMRA_MIGRATION_SECRET_VERSION", value: "7" },
      { name: "NODE_ENV", value: "production" },
      { name: "SAMRA_DEPLOYMENT_ENVIRONMENT", value: "staging" },
      { name: "SAMRA_MIGRATION_EXPIRES_AT", value: expiresAt },
    ],
  };
  // Cloud Run v1 Job schema: network annotations belong to ExecutionTemplate.
  const job = {
    metadata: { name: M.job, uid: "job-uid" },
    spec: {
      template: {
        metadata: {
          annotations: {
            "run.googleapis.com/vpc-access-egress": "private-ranges-only",
            "run.googleapis.com/network-interfaces": JSON.stringify([
              { network: M.network, subnetwork: M.subnet },
            ]),
          },
        },
        spec: {
          parallelism: 1,
          taskCount: 1,
          template: {
            spec: {
              maxRetries: 0,
              timeoutSeconds: 600,
              serviceAccountName: M.runtime,
              containers: [container],
            },
          },
        },
      },
    },
  };
  const expectedJob = {
    image,
    secretVersion: "7",
    candidateSha: candidate,
    expiresAt,
  };
  assert.equal(validateCreatedMigrationJob(job, expectedJob), "job-uid");
  for (const mutate of [
    (j) => {
      j.spec.template.spec.template.spec.containers[0].env[5].value =
        "2026-09-05T14:00:00.000Z";
    },
    (j) => {
      j.spec.template.spec.template.spec.containers[0].env.push({
        name: "NODE_OPTIONS",
        value: "--eval=bad",
      });
    },
    (j) => {
      j.spec.template.spec.taskCount = 2;
    },
    (j) => {
      j.spec.template.spec.template.spec.maxRetries = 1;
    },
    (j) => {
      j.spec.template.spec.template.spec.containers[0].image = "latest";
    },
    (j) => {
      j.spec.template.spec.template.spec.containers[0].env[0].valueFrom.secretKeyRef.key =
        "latest";
    },
    (j) => {
      j.spec.template.metadata.annotations[
        "run.googleapis.com/vpc-access-egress"
      ] = "all-traffic";
    },
  ]) {
    const changed = structuredClone(job);
    mutate(changed);
    assert.throws(() => validateCreatedMigrationJob(changed, expectedJob));
  }
});

test("bootstrap shares the migration lock but cannot supply governed migration evidence", async () => {
  const source = await readFile(
    "lib/db/src/staging-database-access.ts",
    "utf8",
  );
  assert.match(source, /pg_try_advisory_lock/);
  assert.match(source, /783214905126/);
  assert.throws(() =>
    validateMigrationReport(
      { ...report(), event: "samra_staging_bootstrap_migration" },
      expected,
    ),
  );
  const bootstrap = await readFile(
    "deploy/gcp/activate-staging-database-access.sh",
    "utf8",
  );
  assert.match(bootstrap, /--args=\.\/staging-migrate\.mjs,--bootstrap/);
});
