import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { MIGRATION as M, hash } from "./staging-migration-evidence.mjs";
import {
  MIGRATION_CONTROLLER_PERMISSIONS,
  migrationProviderTrust,
  validateMigrationIam,
} from "./run-staging-migrations.mjs";

export const FOUNDATION = Object.freeze({
  roleId: "samraStagingMigrationController",
  repository: "samra-staging",
  poolDisplayName: "Samra staging migrations",
  authorization: "AUTHORIZED_STAGING_MIGRATION_FOUNDATION",
  requiredApis: [
    "artifactregistry.googleapis.com",
    "compute.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "logging.googleapis.com",
    "run.googleapis.com",
    "secretmanager.googleapis.com",
    "sqladmin.googleapis.com",
    "sts.googleapis.com",
  ],
});
const controller = `serviceAccount:${M.controller}`;
const runtime = `serviceAccount:${M.runtime}`;
const role = `projects/${M.project}/roles/${FOUNDATION.roleId}`;
const poolResource = `projects/${M.projectNumber}/locations/global/workloadIdentityPools/${M.pool}`;
const principal = `principalSet://iam.googleapis.com/${poolResource}/attribute.repository_id/1335175962`;
const logFilter = `resource.type="cloud_run_job" AND resource.labels.job_name="${M.job}"`;
const emptyPolicy = () => ({ bindings: [] });
const canonical = (value) =>
  JSON.stringify(value, (_key, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort())
      : v,
  );

function memberRoles(policy, member) {
  assert(policy && Array.isArray(policy.bindings ?? []), "Invalid IAM policy");
  return (policy.bindings ?? [])
    .filter((b) => b.members?.includes(member))
    .map((b) => {
      assert(
        !b.condition,
        "Conditional identity binding requires separate review",
      );
      return b.role;
    })
    .sort();
}
function exactOrMissing(policy, member, expected) {
  const actual = memberRoles(policy, member);
  assert(
    actual.length === 0 || canonical(actual) === canonical([expected]),
    "Existing IAM authority drifted",
  );
  return actual.length === 1;
}

export function buildFoundationPlan(snapshot, candidateSha) {
  assert(/^[0-9a-f]{40}$/.test(candidateSha), "Full candidate SHA required");
  const s = snapshot;
  assert(
    String(s.project.projectNumber) === M.projectNumber &&
      s.project.parent?.type === "organization" &&
      s.project.parent.id === M.organization &&
      s.project.labels?.environment === "staging" &&
      s.project.labels.data_classification === "synthetic",
    "Wrong project boundary",
  );
  for (const api of FOUNDATION.requiredApis)
    assert(
      s.apis.includes(api),
      "Required API is missing; foundation does not enable APIs",
    );
  assert(
    s.runtime?.email === M.runtime &&
      s.runtime.disabled !== true &&
      s.runtimeKeys.length === 0,
    "Existing keyless migration runtime required",
  );
  assert(
    canonical(memberRoles(s.projectPolicy, runtime)) ===
      canonical(["roles/cloudsql.client"]),
    "Migration runtime project authority drifted",
  );
  assert(
    canonical(memberRoles(s.secretPolicy, runtime)) ===
      canonical(["roles/secretmanager.secretAccessor"]),
    "Existing migration credential grant required",
  );
  assert(
    memberRoles(s.secretPolicy, controller).length === 0,
    "Controller cannot have credential access",
  );
  assert(
    !(s.secretPolicy.bindings ?? []).some((b) =>
      b.members?.some((m) => ["allUsers", "allAuthenticatedUsers"].includes(m)),
    ),
    "Public credential access prohibited",
  );
  assert(
    (s.projectPolicy.bindings ?? []).some(
      (b) =>
        b.role === "roles/run.serviceAgent" &&
        !b.condition &&
        b.members?.includes(
          `serviceAccount:service-${M.projectNumber}@serverless-robot-prod.iam.gserviceaccount.com`,
        ),
    ),
    "Existing Cloud Run service agent required",
  );
  assert(s.jobs.length === 0, "Migration or bootstrap job exists");
  const actions = [];
  const add = (id, args) => actions.push({ id, args });
  const location = ["--location=global"];
  const viewFlags = ["--bucket=_Default", "--location=global"];
  const trust = migrationProviderTrust();
  if (s.pool)
    assert(
      s.pool.state === "ACTIVE" &&
        s.pool.disabled !== true &&
        s.pool.displayName === FOUNDATION.poolDisplayName,
      "Pool drifted or is deleted",
    );
  else
    add("create-pool", [
      "iam",
      "workload-identity-pools",
      "create",
      M.pool,
      ...location,
      `--display-name=${FOUNDATION.poolDisplayName}`,
    ]);
  assert(
    s.providers.every((p) => p.name?.split("/").at(-1) === M.provider),
    "Pool contains another provider",
  );
  assert(s.providers.length <= 1, "Duplicate provider");
  const provider = s.providers[0];
  if (provider)
    assert(
      provider.state === "ACTIVE" &&
        provider.disabled !== true &&
        provider.oidc?.issuerUri === trust.issuerUri &&
        (provider.oidc.allowedAudiences ?? []).length === 0 &&
        canonical(provider.attributeMapping) ===
          canonical(trust.attributeMapping) &&
        provider.attributeCondition === trust.attributeCondition,
      "Provider trust drifted",
    );
  else
    add("create-provider", [
      "iam",
      "workload-identity-pools",
      "providers",
      "create-oidc",
      M.provider,
      ...location,
      `--workload-identity-pool=${M.pool}`,
      `--issuer-uri=${trust.issuerUri}`,
      `--attribute-mapping=${Object.entries(trust.attributeMapping)
        .map(([k, v]) => `${k}=${v}`)
        .join(",")}`,
      `--attribute-condition=${trust.attributeCondition}`,
    ]);
  if (s.customRole)
    assert(
      s.customRole.deleted !== true &&
        s.customRole.stage === "GA" &&
        canonical([...s.customRole.includedPermissions].sort()) ===
          canonical(MIGRATION_CONTROLLER_PERMISSIONS),
      "Custom role drifted",
    );
  else
    add("create-role", [
      "iam",
      "roles",
      "create",
      FOUNDATION.roleId,
      "--title=Samra staging migration controller",
      "--stage=GA",
      `--permissions=${MIGRATION_CONTROLLER_PERMISSIONS.join(",")}`,
    ]);
  if (s.controller)
    assert(
      s.controller.email === M.controller &&
        s.controller.disabled !== true &&
        s.controllerKeys.length === 0,
      "Controller must be enabled and keyless",
    );
  else
    add("create-controller", [
      "iam",
      "service-accounts",
      "create",
      M.controller.split("@")[0],
      "--display-name=Samra keyless staging migration controller",
    ]);
  if (s.view)
    assert(
      s.view.filter === logFilter,
      "Log view is not restricted to the migration job",
    );
  else
    add("create-log-view", [
      "logging",
      "views",
      "create",
      M.logView,
      ...viewFlags,
      `--log-filter=${logFilter}`,
    ]);
  const bindings = [
    [
      "controller-project-role",
      s.projectPolicy,
      controller,
      role,
      ["projects", "add-iam-policy-binding", M.project],
    ],
    [
      "controller-image-reader",
      s.repositoryPolicy,
      controller,
      "roles/artifactregistry.reader",
      [
        "artifacts",
        "repositories",
        "add-iam-policy-binding",
        FOUNDATION.repository,
        `--location=${M.region}`,
      ],
    ],
    [
      "controller-runtime-use",
      s.runtimePolicy,
      controller,
      "roles/iam.serviceAccountUser",
      ["iam", "service-accounts", "add-iam-policy-binding", M.runtime],
    ],
    [
      "controller-log-reader",
      s.viewPolicy,
      controller,
      "roles/logging.viewAccessor",
      ["logging", "views", "add-iam-policy-binding", M.logView, ...viewFlags],
    ],
    // Grant federation last: no GitHub caller before all resource grants exist.
    [
      "controller-federation",
      s.controllerPolicy,
      principal,
      "roles/iam.workloadIdentityUser",
      ["iam", "service-accounts", "add-iam-policy-binding", M.controller],
    ],
  ];
  for (const b of s.controllerPolicy.bindings ?? [])
    assert(
      b.role === "roles/iam.workloadIdentityUser" &&
        !b.condition &&
        b.members?.length === 1 &&
        b.members[0] === principal,
      "Unexpected controller impersonator",
    );
  for (const [id, policy, member, expected, args] of bindings)
    if (!exactOrMissing(policy, member, expected))
      add(id, [
        ...args,
        `--member=${member}`,
        `--role=${expected}`,
        "--condition=None",
      ]);
  if (actions.length === 0) validateMigrationIam(s);
  const plan = {
    schemaVersion: 1,
    candidateSha,
    projectId: M.project,
    controller: M.controller,
    status: actions.length ? "changes-required" : "foundation-verified",
    actions,
    migrationExecuted: false,
    deploymentAuthorized: false,
    // Database readiness is reported separately; IAM setup does not fix TLS/users/history.
    database: {
      instance: M.instance,
      sslMode: s.sql.settings?.ipConfiguration?.sslMode ?? "unknown",
      enabledSecretVersions: s.secretVersions
        .filter((v) => v.state === "ENABLED")
        .map((v) => v.name.split("/").at(-1))
        .sort(),
    },
  };
  return { ...plan, planSha256: hash(canonical(plan)) };
}

export function collectFoundationSnapshot(read) {
  const list = (...args) => {
    const result = read(...args);
    assert(Array.isArray(result), "Expected complete metadata list");
    return result;
  };
  // List commands must succeed. Permission failures never mean absent resources.
  const accounts = list("iam", "service-accounts", "list");
  const controllerAccount =
    accounts.find((a) => a.email === M.controller) ?? null;
  const runtimeAccount = accounts.find((a) => a.email === M.runtime) ?? null;
  const pools = list(
    "iam",
    "workload-identity-pools",
    "list",
    "--location=global",
    "--show-deleted",
  );
  const pool = pools.find((p) => p.name?.split("/").at(-1) === M.pool) ?? null;
  const rolePresent = list("iam", "roles", "list", "--show-deleted").some(
    (r) => r.name === role,
  );
  const customRole = rolePresent
    ? read("iam", "roles", "describe", FOUNDATION.roleId)
    : null;
  const view =
    list(
      "logging",
      "views",
      "list",
      "--bucket=_Default",
      "--location=global",
    ).find((v) => v.name?.split("/").at(-1) === M.logView) ?? null;
  return {
    project: read("projects", "describe", M.project),
    projectPolicy: read("projects", "get-iam-policy", M.project),
    apis: list("services", "list", "--enabled").map((s) => s.config?.name),
    controller: controllerAccount,
    runtime: runtimeAccount,
    customRole,
    pool,
    view,
    providers: pool
      ? list(
          "iam",
          "workload-identity-pools",
          "providers",
          "list",
          "--location=global",
          `--workload-identity-pool=${M.pool}`,
          "--show-deleted",
        )
      : [],
    controllerKeys: controllerAccount
      ? list(
          "iam",
          "service-accounts",
          "keys",
          "list",
          `--iam-account=${M.controller}`,
          "--managed-by=user",
        )
      : [],
    runtimeKeys: runtimeAccount
      ? list(
          "iam",
          "service-accounts",
          "keys",
          "list",
          `--iam-account=${M.runtime}`,
          "--managed-by=user",
        )
      : [],
    controllerPolicy: controllerAccount
      ? read("iam", "service-accounts", "get-iam-policy", M.controller)
      : emptyPolicy(),
    runtimePolicy: runtimeAccount
      ? read("iam", "service-accounts", "get-iam-policy", M.runtime)
      : emptyPolicy(),
    repositoryPolicy: read(
      "artifacts",
      "repositories",
      "get-iam-policy",
      FOUNDATION.repository,
      `--location=${M.region}`,
    ),
    secretPolicy: read("secrets", "get-iam-policy", M.secret),
    secretVersions: list("secrets", "versions", "list", M.secret),
    sql: read("sql", "instances", "describe", M.instance),
    viewPolicy: view
      ? read(
          "logging",
          "views",
          "get-iam-policy",
          M.logView,
          "--bucket=_Default",
          "--location=global",
        )
      : emptyPolicy(),
    jobs: list("run", "jobs", "list", `--region=${M.region}`).filter((j) =>
      [M.job, "samra-database-access-bootstrap"].includes(
        j.metadata?.name ?? j.name?.split("/").at(-1),
      ),
    ),
  };
}

export function validateFoundationApproval(env, plan, now = Date.now()) {
  assert(
    env.SAMRA_MIGRATION_FOUNDATION_APPLY === FOUNDATION.authorization,
    "Foundation authorization required",
  );
  assert(
    env.SAMRA_MIGRATION_FOUNDATION_PLAN_SHA256 === plan.planSha256,
    "Review and approve this exact plan hash",
  );
  const remaining = Date.parse(env.SAMRA_MIGRATION_FOUNDATION_EXPIRES_AT) - now;
  assert(
    remaining > 0 && remaining <= 3600000,
    "Foundation approval expired or exceeds one hour",
  );
}

export function runMigrationFoundation({
  mode,
  env = process.env,
  command = execFileSync,
  now = Date.now,
}) {
  assert(
    ["plan", "review", "apply", "audit"].includes(mode),
    "Unsupported foundation mode",
  );
  if (mode === "plan")
    return {
      status: "offline-plan-only",
      controller: M.controller,
      pool: M.pool,
      provider: M.provider,
      runtime: M.runtime,
      permissions: MIGRATION_CONTROLLER_PERMISSIONS,
      authorization: FOUNDATION.authorization,
      cloudInspected: false,
      cloudChanged: false,
    };
  const sha = env.SAMRA_GCP_EXPECTED_SHA;
  assert(
    /^[0-9a-f]{40}$/.test(sha ?? ""),
    "Explicit full candidate SHA required",
  );
  const operator = env.SAMRA_GCP_OPERATOR_ACCOUNT;
  assert(
    /^[^@\s]+@davidhaile\.com$/.test(operator ?? ""),
    "Reviewed administrator required",
  );
  const exec = (bin, args) =>
    command(bin, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 120000,
      maxBuffer: 16 * 1024 * 1024,
    });
  assert(
    exec("git", ["rev-parse", "HEAD"]).trim() === sha &&
      exec("git", ["status", "--porcelain"]).trim() === "",
    "Clean reviewed checkout required",
  );
  assert(
    exec("gcloud", ["config", "get-value", "account"]).trim() === operator &&
      exec("gcloud", ["config", "get-value", "project"]).trim() === M.project,
    "Wrong Google account or project",
  );
  const cloud = (args) =>
    exec("gcloud", [...args, `--project=${M.project}`, "--format=json"]);
  const read = (...args) => JSON.parse(cloud(args));
  const review = () =>
    buildFoundationPlan(collectFoundationSnapshot(read), sha);
  const before = review();
  if (mode === "review") return before;
  if (mode === "audit") {
    assert(before.actions.length === 0, "Foundation remains incomplete");
    return before;
  }
  validateFoundationApproval(env, before, now());
  const fresh = review();
  assert(
    fresh.planSha256 === before.planSha256,
    "Foundation changed after preflight",
  );
  for (const action of before.actions) {
    validateFoundationApproval(env, before, now());
    cloud([...action.args, "--quiet"]);
  }
  // Independently reload all metadata, including exact IAM and provider trust.
  const after = review();
  assert(
    after.actions.length === 0,
    "Foundation post-audit failed; inspect partial state before retry",
  );
  return {
    ...after,
    status: "foundation-applied-and-verified",
    approvedPlanSha256: before.planSha256,
    appliedActions: before.actions.map((a) => a.id),
    migrationExecuted: false,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    assert(process.argv.length <= 3, "One foundation mode required");
    console.log(
      JSON.stringify(
        runMigrationFoundation({
          mode: (process.argv[2] ?? "--plan").replace(/^--/, ""),
        }),
        null,
        2,
      ),
    );
  } catch {
    console.error(
      "STOP: migration foundation review/apply failed. No migration or deployment is authorized. Inspect access and any partial foundation state; credentials and raw provider errors are suppressed.",
    );
    process.exitCode = 1;
  }
}
