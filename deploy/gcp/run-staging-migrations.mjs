import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { verifyPublicationManifest } from "./record-staging-image-publication.mjs";
import { verifyGitHubUpstreamArtifact } from "./verify-github-upstream-artifact.mjs";
import {
  MIGRATION as M,
  hash,
  extractMigrationReport,
  buildMigrationManifest,
  writeMigrationManifest,
} from "./staging-migration-evidence.mjs";

export function migrationProviderTrust(repository = "haileleuld87/Samra-Pay") {
  const claims = [
    "repository",
    "repository_id",
    "repository_owner_id",
    "ref",
    "event_name",
    "workflow",
    "workflow_ref",
    "environment",
  ];
  return {
    issuerUri: "https://token.actions.githubusercontent.com",
    attributeMapping: Object.fromEntries([
      ["google.subject", "assertion.sub"],
      ...claims.map((claim) => [`attribute.${claim}`, `assertion.${claim}`]),
    ]),
    attributeCondition: `assertion.repository=='${repository}' && assertion.repository_id=='1335175962' && assertion.repository_owner_id=='237485986' && assertion.ref=='refs/heads/main' && assertion.event_name=='workflow_dispatch' && assertion.workflow=='${M.workflow}' && assertion.workflow_ref=='${repository}/${M.workflowPath}@refs/heads/main' && assertion.environment=='${M.environment}'`,
  };
}

export const MIGRATION_CONTROLLER_PERMISSIONS = Object.freeze(
  [
    "artifactregistry.dockerimages.get",
    "compute.subnetworks.get",
    "iam.roles.get",
    "iam.serviceAccounts.get",
    "iam.serviceAccounts.getIamPolicy",
    "iam.serviceAccountKeys.list",
    "iam.workloadIdentityPoolProviders.get",
    "logging.views.get",
    "resourcemanager.projects.get",
    "resourcemanager.projects.getIamPolicy",
    "run.jobs.create",
    "run.jobs.delete",
    "run.jobs.get",
    "run.jobs.list",
    "run.jobs.run",
    "run.executions.get",
    "run.operations.get",
    "secretmanager.secrets.getIamPolicy",
    "secretmanager.versions.get",
    "serviceusage.services.use",
    "cloudsql.instances.get",
  ].sort(),
);
const controllerRole = `projects/${M.project}/roles/samraStagingMigrationController`;
const rolesFor = (policy, member) =>
  (policy.bindings ?? [])
    .filter((binding) => binding.members?.includes(member))
    .map((binding) => {
      assert(!binding.condition, "Unexpected conditional identity role");
      return binding.role;
    })
    .sort();

export function validateMigrationIam({
  projectPolicy,
  customRole,
  controllerPolicy,
  runtimePolicy,
  secretPolicy,
}) {
  assert(
    JSON.stringify(
      rolesFor(projectPolicy, `serviceAccount:${M.controller}`),
    ) === JSON.stringify([controllerRole]),
    "Migration controller project authority is not exact",
  );
  assert(
    customRole.deleted !== true &&
      customRole.stage === "GA" &&
      JSON.stringify([...(customRole.includedPermissions ?? [])].sort()) ===
        JSON.stringify(MIGRATION_CONTROLLER_PERMISSIONS),
    "Migration controller permissions drifted",
  );
  assert(
    JSON.stringify(rolesFor(projectPolicy, `serviceAccount:${M.runtime}`)) ===
      JSON.stringify(["roles/cloudsql.client"]),
    "Migration runtime project authority drifted",
  );
  const principal = `principalSet://iam.googleapis.com/projects/${M.projectNumber}/locations/global/workloadIdentityPools/${M.pool}/attribute.repository_id/1335175962`;
  assert(
    JSON.stringify(rolesFor(controllerPolicy, principal)) ===
      JSON.stringify(["roles/iam.workloadIdentityUser"]),
    "Exact migration federation binding required",
  );
  assert(
    (controllerPolicy.bindings ?? []).every(
      (binding) =>
        binding.role !== "roles/iam.workloadIdentityUser" ||
        (binding.members?.length === 1 &&
          binding.members[0] === principal &&
          !binding.condition),
    ),
    "Unexpected migration federated caller",
  );
  assert(
    JSON.stringify(
      rolesFor(runtimePolicy, `serviceAccount:${M.controller}`),
    ) === JSON.stringify(["roles/iam.serviceAccountUser"]),
    "Controller may act as only the migration runtime",
  );
  assert(
    JSON.stringify(rolesFor(secretPolicy, `serviceAccount:${M.runtime}`)) ===
      JSON.stringify(["roles/secretmanager.secretAccessor"]),
    "Migration runtime needs its isolated database secret",
  );
  assert(
    rolesFor(secretPolicy, `serviceAccount:${M.controller}`).length === 0,
    "Controller must not read database credentials",
  );
  assert(
    !(secretPolicy.bindings ?? []).some((binding) =>
      binding.members?.some((member) =>
        ["allUsers", "allAuthenticatedUsers"].includes(member),
      ),
    ),
    "Public secret access is prohibited",
  );
}

export function validateMigrationControllerEnvironment(
  env,
  mode,
  now = Date.now(),
) {
  assert(["review", "migrate"].includes(mode), "Unsupported migration mode");
  assert(
    /^[0-9a-f]{40}$/.test(env.GITHUB_SHA ?? ""),
    "Exact candidate SHA required",
  );
  assert(
    env.GITHUB_REPOSITORY === "haileleuld87/Samra-Pay" &&
      env.GITHUB_REPOSITORY_ID === "1335175962" &&
      env.GITHUB_REPOSITORY_OWNER_ID === "237485986",
    "Wrong repository identity",
  );
  assert(
    env.GITHUB_REF === "refs/heads/main" &&
      env.GITHUB_EVENT_NAME === "workflow_dispatch" &&
      env.GITHUB_WORKFLOW_REF ===
        `${env.GITHUB_REPOSITORY}/${M.workflowPath}@refs/heads/main`,
    "Protected manual main workflow required",
  );
  for (const key of [
    "GITHUB_RUN_ID",
    "GITHUB_RUN_ATTEMPT",
    "SAMRA_PUBLICATION_RUN_ID",
    "SAMRA_PUBLICATION_RUN_ATTEMPT",
    "SAMRA_MIGRATION_SECRET_VERSION",
  ])
    assert(
      /^[1-9][0-9]*$/.test(env[key] ?? "") &&
        Number.isSafeInteger(Number(env[key])),
      "Numeric execution and secret pins required",
    );
  if (mode === "migrate") {
    assert(
      env.SAMRA_MIGRATION_AUTHORIZATION === "AUTHORIZED_STAGING_MIGRATION",
      "Explicit migration authorization required",
    );
    const expiry = Date.parse(env.SAMRA_MIGRATION_EXPIRES_AT);
    assert(
      Number.isFinite(now) && expiry - now >= 650000 && expiry - now <= 3600000,
      "Approval must expire in 650 to 3600 seconds",
    );
  }
}

export function validateSqlMigrationTarget(instance) {
  assert(
    instance.name === M.instance &&
      instance.region === M.region &&
      /^POSTGRES_16/.test(instance.databaseVersion) &&
      instance.state === "RUNNABLE",
    "Wrong SQL instance",
  );
  const settings = instance.settings;
  assert(
    settings.ipConfiguration?.ipv4Enabled === false &&
      settings.ipConfiguration.privateNetwork?.endsWith(
        `/projects/${M.project}/global/networks/${M.network}`,
      ),
    "Private SQL network required",
  );
  assert(
    ["ENCRYPTED_ONLY", "TRUSTED_CLIENT_CERTIFICATE_REQUIRED"].includes(
      settings.ipConfiguration.sslMode,
    ),
    "Enforced database TLS required",
  );
  assert(
    settings.backupConfiguration?.enabled === true &&
      settings.backupConfiguration.pointInTimeRecoveryEnabled === true &&
      settings.deletionProtectionEnabled === true,
    "SQL backup, PITR and deletion protection required",
  );
}

export function validateCreatedMigrationJob(
  job,
  { image, secretVersion, candidateSha, expiresAt },
) {
  const execution = job.spec?.template?.spec;
  const task = execution?.template?.spec;
  const containers = task?.containers;
  assert(
    job.metadata?.name === M.job &&
      typeof job.metadata.uid === "string" &&
      job.metadata.uid.length > 0,
    "Migration job identity missing",
  );
  assert(
    Number(execution.parallelism) === 1 &&
      Number(execution.taskCount) === 1 &&
      Number(task.maxRetries) === 0 &&
      Number(task.timeoutSeconds) === 600 &&
      task.serviceAccountName === M.runtime,
    "Migration job task boundary drifted",
  );
  assert(
    containers?.length === 1 &&
      containers[0].image === image &&
      JSON.stringify(containers[0].command) === '["node"]' &&
      JSON.stringify(containers[0].args) === '["./staging-migrate.mjs"]',
    "Migration job image or entrypoint drifted",
  );
  assert(
    containers[0].resources?.limits?.cpu === "1" &&
      containers[0].resources.limits.memory === "512Mi",
    "Migration resource limits drifted",
  );
  const variables = containers[0].env ?? [];
  assert(
    variables.length === 6 &&
      new Set(variables.map((entry) => entry.name)).size === variables.length,
    "Duplicate migration environment variable",
  );
  const variable = (name) => variables.find((entry) => entry.name === name);
  assert(
    variable("DATABASE_URL")?.valueFrom?.secretKeyRef?.name === M.secret &&
      variable("DATABASE_URL").valueFrom.secretKeyRef.key === secretVersion &&
      !variable("DATABASE_URL").value,
    "Migration job secret pin drifted",
  );
  assert(
    variable("SAMRA_CANDIDATE_SHA")?.value === candidateSha &&
      variable("SAMRA_MIGRATION_SECRET_VERSION")?.value === secretVersion &&
      variable("NODE_ENV")?.value === "production" &&
      variable("SAMRA_DEPLOYMENT_ENVIRONMENT")?.value === "staging" &&
      typeof expiresAt === "string" &&
      variable("SAMRA_MIGRATION_EXPIRES_AT")?.value === expiresAt,
    "Migration job source binding drifted",
  );
  const annotations = job.spec.template.metadata?.annotations;
  assert(
    annotations?.["run.googleapis.com/vpc-access-egress"] ===
      "private-ranges-only",
    "Migration VPC egress drifted",
  );
  const interfaces = JSON.parse(
    annotations["run.googleapis.com/network-interfaces"] ?? "null",
  );
  assert(
    interfaces?.length === 1 &&
      interfaces[0].network === M.network &&
      interfaces[0].subnetwork === M.subnet,
    "Migration private network drifted",
  );
  return job.metadata.uid;
}

export async function runStagingMigrations({
  env = process.env,
  mode,
  command = execFileSync,
  sleep = delay,
  verifyUpstream = verifyGitHubUpstreamArtifact,
}) {
  validateMigrationControllerEnvironment(env, mode);
  const execute = (binary, args) =>
    command(binary, args, {
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      timeout: 700000,
      stdio: ["ignore", "pipe", "pipe"],
    });
  const git = (...args) => execute("git", args).trim();
  assert(
    git("rev-parse", "HEAD") === env.GITHUB_SHA &&
      git("status", "--porcelain") === "",
    "Clean exact checkout required",
  );
  const publication = await verifyPublicationManifest(
    env.SAMRA_PUBLICATION_MANIFEST,
    env.SAMRA_PUBLICATION_HASH,
  );
  assert(
    publication.candidateSha === env.GITHUB_SHA &&
      publication.github?.runId === env.SAMRA_PUBLICATION_RUN_ID &&
      publication.github.runAttempt ===
        Number(env.SAMRA_PUBLICATION_RUN_ATTEMPT),
    "Publication source/run mismatch",
  );
  // Revalidate upstream provenance on direct controller invocation too.
  await verifyUpstream({
    kind: "staging-image-publication",
    candidateSha: env.GITHUB_SHA,
    runId: env.SAMRA_PUBLICATION_RUN_ID,
    runAttempt: env.SAMRA_PUBLICATION_RUN_ATTEMPT,
    artifactName: `staging-image-publication-${env.GITHUB_SHA}-run-${env.SAMRA_PUBLICATION_RUN_ID}-attempt-${env.SAMRA_PUBLICATION_RUN_ATTEMPT}`,
    token: env.GITHUB_TOKEN,
  });
  const cloud = (...args) =>
    execute("gcloud", [...args, `--project=${M.project}`, "--format=json"]);
  const read = (...args) => JSON.parse(cloud(...args));
  assert(
    execute("gcloud", ["config", "get-value", "account"]).trim() ===
      M.controller &&
      execute("gcloud", ["config", "get-value", "project"]).trim() ===
        M.project,
    "Wrong federated Google identity or project",
  );
  const project = read("projects", "describe", M.project);
  assert(
    String(project.projectNumber) === M.projectNumber &&
      project.parent?.type === "organization" &&
      project.parent.id === M.organization &&
      project.labels?.environment === "staging" &&
      project.labels.data_classification === "synthetic",
    "Project boundary drifted",
  );
  const provider = read(
    "iam",
    "workload-identity-pools",
    "providers",
    "describe",
    M.provider,
    `--workload-identity-pool=${M.pool}`,
    "--location=global",
  );
  const condition = migrationProviderTrust(
    env.GITHUB_REPOSITORY,
  ).attributeCondition;
  assert(
    provider.state === "ACTIVE" &&
      provider.oidc?.issuerUri ===
        "https://token.actions.githubusercontent.com" &&
      provider.attributeCondition === condition,
    "Migration federation trust drifted",
  );
  for (const account of [M.controller, M.runtime]) {
    assert(
      read("iam", "service-accounts", "describe", account).disabled !== true,
      "Disabled migration identity",
    );
    assert(
      read(
        "iam",
        "service-accounts",
        "keys",
        "list",
        `--iam-account=${account}`,
        "--managed-by=user",
      ).length === 0,
      "User-managed migration key found",
    );
  }
  validateMigrationIam({
    projectPolicy: read("projects", "get-iam-policy", M.project),
    customRole: read(
      "iam",
      "roles",
      "describe",
      "samraStagingMigrationController",
    ),
    controllerPolicy: read(
      "iam",
      "service-accounts",
      "get-iam-policy",
      M.controller,
    ),
    runtimePolicy: read("iam", "service-accounts", "get-iam-policy", M.runtime),
    secretPolicy: read("secrets", "get-iam-policy", M.secret),
  });
  validateSqlMigrationTarget(read("sql", "instances", "describe", M.instance));
  const version = read(
    "secrets",
    "versions",
    "describe",
    env.SAMRA_MIGRATION_SECRET_VERSION,
    `--secret=${M.secret}`,
  );
  assert(
    version.state === "ENABLED" &&
      version.name ===
        `projects/${M.projectNumber}/secrets/${M.secret}/versions/${env.SAMRA_MIGRATION_SECRET_VERSION}`,
    "Pinned migration secret unavailable",
  );
  const image = publication.imageDigests["samra-migrations"];
  read("artifacts", "docker", "images", "describe", image);
  const subnet = read(
    "compute",
    "networks",
    "subnets",
    "describe",
    M.subnet,
    `--region=${M.region}`,
  );
  assert(
    subnet.network?.endsWith(
      `/projects/${M.project}/global/networks/${M.network}`,
    ) && subnet.privateIpGoogleAccess === true,
    "Private migration subnet drifted",
  );
  const view = read(
    "logging",
    "views",
    "describe",
    M.logView,
    "--bucket=_Default",
    "--location=global",
  );
  assert(
    view.filter ===
      `resource.type="cloud_run_job" AND resource.labels.job_name="${M.job}"`,
    "Migration log view is not isolated",
  );
  const jobs = () => read("run", "jobs", "list", `--region=${M.region}`);
  const relevantJobs = () =>
    jobs().filter((job) =>
      [M.job, "samra-database-access-bootstrap"].includes(
        job.metadata?.name ?? job.name?.split("/").at(-1),
      ),
    );
  assert(
    relevantJobs().length === 0,
    "Migration or bootstrap job already exists; inspect it before retrying",
  );
  if (mode === "review")
    return {
      status: "review-completed",
      candidateSha: env.GITHUB_SHA,
      mutationPerformed: false,
      migrationEvidenceProduced: false,
    };
  validateMigrationControllerEnvironment(env, mode); // Approval must still be valid immediately before creation.
  let created = false;
  try {
    cloud(
      "run",
      "jobs",
      "create",
      M.job,
      `--region=${M.region}`,
      `--image=${image}`,
      `--service-account=${M.runtime}`,
      `--network=${M.network}`,
      `--subnet=${M.subnet}`,
      "--vpc-egress=private-ranges-only",
      "--tasks=1",
      "--parallelism=1",
      "--max-retries=0",
      "--task-timeout=600s",
      "--cpu=1",
      "--memory=512Mi",
      `--set-secrets=DATABASE_URL=${M.secret}:${env.SAMRA_MIGRATION_SECRET_VERSION}`,
      `--set-env-vars=NODE_ENV=production,SAMRA_DEPLOYMENT_ENVIRONMENT=staging,SAMRA_CANDIDATE_SHA=${env.GITHUB_SHA},SAMRA_MIGRATION_SECRET_VERSION=${env.SAMRA_MIGRATION_SECRET_VERSION},SAMRA_MIGRATION_EXPIRES_AT=${env.SAMRA_MIGRATION_EXPIRES_AT}`,
      "--command=node",
      "--args=./staging-migrate.mjs",
      `--labels=environment=staging,data_classification=synthetic,application=samra-pay,git_sha=${env.GITHUB_SHA}`,
      "--quiet",
    );
    created = true;
    const jobUid = validateCreatedMigrationJob(
      read("run", "jobs", "describe", M.job, `--region=${M.region}`),
      {
        image,
        secretVersion: env.SAMRA_MIGRATION_SECRET_VERSION,
        candidateSha: env.GITHUB_SHA,
        expiresAt: env.SAMRA_MIGRATION_EXPIRES_AT,
      },
    );
    read(
      "run",
      "jobs",
      "execute",
      M.job,
      `--region=${M.region}`,
      "--wait",
      "--quiet",
    );
    const job = read("run", "jobs", "describe", M.job, `--region=${M.region}`);
    assert(
      validateCreatedMigrationJob(job, {
        image,
        secretVersion: env.SAMRA_MIGRATION_SECRET_VERSION,
        candidateSha: env.GITHUB_SHA,
        expiresAt: env.SAMRA_MIGRATION_EXPIRES_AT,
      }) === jobUid && Number(job.status?.executionCount) === 1,
      "Migration job changed or was executed more than once",
    );
    const execution = job.status?.latestCreatedExecution?.name;
    assert(
      /^samra-staging-migrations-[a-z0-9]+$/.test(execution),
      "Invalid migration execution identity",
    );
    const state = read(
      "run",
      "jobs",
      "executions",
      "describe",
      execution,
      `--region=${M.region}`,
    );
    assert(
      state.status?.conditions?.some(
        (c) => c.type === "Completed" && c.status === "True",
      ) &&
        Number(state.status.succeededCount) === 1 &&
        Number(state.status.failedCount ?? 0) === 0,
      "Migration execution did not succeed exactly once",
    );
    let report;
    for (let attempt = 0; attempt < 15; attempt++) {
      const logs = read(
        "logging",
        "read",
        `resource.type="cloud_run_job" AND resource.labels.job_name="${M.job}" AND labels.execution_name="${execution}" AND logName="projects/${M.project}/logs/run.googleapis.com%2Fstdout"`,
        "--bucket=_Default",
        "--location=global",
        `--view=${M.logView}`,
        "--freshness=1h",
        "--limit=100",
        "--order=asc",
      );
      try {
        report = extractMigrationReport(logs, {
          candidateSha: env.GITHUB_SHA,
          execution,
          secretVersion: env.SAMRA_MIGRATION_SECRET_VERSION,
        });
        break;
      } catch {
        if (attempt === 14)
          throw new Error("Migration report unavailable or invalid");
      }
      await sleep(2000);
    }
    const cleanupJob = read(
      "run",
      "jobs",
      "describe",
      M.job,
      `--region=${M.region}`,
    );
    assert(
      validateCreatedMigrationJob(cleanupJob, {
        image,
        secretVersion: env.SAMRA_MIGRATION_SECRET_VERSION,
        candidateSha: env.GITHUB_SHA,
        expiresAt: env.SAMRA_MIGRATION_EXPIRES_AT,
      }) === jobUid && Number(cleanupJob.status?.executionCount) === 1,
      "Migration job changed before cleanup",
    );
    cloud("run", "jobs", "delete", M.job, `--region=${M.region}`, "--quiet");
    assert(relevantJobs().length === 0, "Migration cleanup failed");
    created = false;
    const manifest = buildMigrationManifest({
      publication,
      publicationHash: hash(await readFile(env.SAMRA_PUBLICATION_MANIFEST)),
      report,
      githubRunId: env.GITHUB_RUN_ID,
      githubRunAttempt: env.GITHUB_RUN_ATTEMPT,
      generatedAt: new Date().toISOString(),
      cleanupVerified: true,
    });
    const output = resolve("artifacts/staging-release");
    await mkdir(output, { recursive: true });
    await writeMigrationManifest(
      manifest,
      resolve(output, "staging-migration.json"),
      resolve(output, "staging-migration.sha256"),
    );
    return {
      status: "migration-completed",
      candidateSha: env.GITHUB_SHA,
      execution,
      appliedCount: report.appliedCount,
      jobDeleted: true,
    };
  } finally {
    if (created) {
      // Only this invocation's successfully created job is eligible for cleanup.
      // An ambiguous execute failure may leave a running execution: preserve it
      // for inspection rather than delete a running migration or retry its DDL.
      console.error(
        "STOP: migration job remains for execution-state audit; do not retry or activate the API.",
      );
    }
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    assert(process.argv.length === 3, "One controller mode required");
    if (process.argv[2] === "--plan")
      console.log(
        "PLAN ONLY: exact published migration image; private staging; pinned secret version; one task; no retries; governed evidence after cleanup. No cloud action attempted.",
      );
    else
      console.log(
        JSON.stringify(
          await runStagingMigrations({
            mode: process.argv[2].replace(/^--/, ""),
          }),
        ),
      );
  } catch {
    console.error(
      "STOP: staging migration did not pass. No success artifact is authorized; inspect normalized workflow status and any orphan job. Credentials and SQL errors are suppressed.",
    );
    process.exitCode = 1;
  }
}
