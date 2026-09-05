import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { MIGRATION as M } from "./staging-migration-evidence.mjs";
import {
  MIGRATION_CONTROLLER_PERMISSIONS,
  migrationProviderTrust,
} from "./run-staging-migrations.mjs";
import {
  FOUNDATION as F,
  buildFoundationPlan,
  collectFoundationSnapshot,
  runMigrationFoundation,
  validateFoundationApproval,
} from "./staging-migration-foundation.mjs";

const sha = "a".repeat(40);
const operator = "admin@davidhaile.com";
const binding = (member, role) => ({ role, members: [member] });
const controller = `serviceAccount:${M.controller}`;
const runtime = `serviceAccount:${M.runtime}`;
const principal = `principalSet://iam.googleapis.com/projects/${M.projectNumber}/locations/global/workloadIdentityPools/${M.pool}/attribute.repository_id/1335175962`;
const role = `projects/${M.project}/roles/${F.roleId}`;

function snapshot(complete = false) {
  const s = {
    project: {
      projectNumber: M.projectNumber,
      parent: { type: "organization", id: M.organization },
      labels: { environment: "staging", data_classification: "synthetic" },
    },
    apis: [...F.requiredApis],
    runtime: { email: M.runtime },
    runtimeKeys: [],
    controller: null,
    controllerKeys: [],
    projectPolicy: {
      bindings: [
        binding(runtime, "roles/cloudsql.client"),
        binding(
          `serviceAccount:service-${M.projectNumber}@serverless-robot-prod.iam.gserviceaccount.com`,
          "roles/run.serviceAgent",
        ),
      ],
    },
    secretPolicy: {
      bindings: [binding(runtime, "roles/secretmanager.secretAccessor")],
    },
    runtimePolicy: { bindings: [] },
    controllerPolicy: { bindings: [] },
    repositoryPolicy: { bindings: [] },
    viewPolicy: { bindings: [] },
    pool: null,
    providers: [],
    customRole: null,
    view: null,
    jobs: [],
    sql: { settings: { ipConfiguration: { sslMode: "ENCRYPTED_ONLY" } } },
    secretVersions: [
      {
        state: "ENABLED",
        name: `projects/${M.projectNumber}/secrets/${M.secret}/versions/7`,
      },
    ],
  };
  if (complete) {
    const trust = migrationProviderTrust();
    s.controller = { email: M.controller };
    s.pool = {
      name: `projects/${M.projectNumber}/locations/global/workloadIdentityPools/${M.pool}`,
      state: "ACTIVE",
      displayName: F.poolDisplayName,
    };
    s.providers = [
      {
        name: `${s.pool.name}/providers/${M.provider}`,
        state: "ACTIVE",
        oidc: { issuerUri: trust.issuerUri },
        attributeMapping: trust.attributeMapping,
        attributeCondition: trust.attributeCondition,
      },
    ];
    s.customRole = {
      name: role,
      stage: "GA",
      includedPermissions: [...MIGRATION_CONTROLLER_PERMISSIONS],
    };
    s.view = {
      name: `projects/${M.project}/locations/global/buckets/_Default/views/${M.logView}`,
      filter: `resource.type="cloud_run_job" AND resource.labels.job_name="${M.job}"`,
    };
    s.projectPolicy.bindings.push(binding(controller, role));
    s.runtimePolicy.bindings.push(
      binding(controller, "roles/iam.serviceAccountUser"),
    );
    s.controllerPolicy.bindings.push(
      binding(principal, "roles/iam.workloadIdentityUser"),
    );
    s.repositoryPolicy.bindings.push(
      binding(controller, "roles/artifactregistry.reader"),
    );
    s.viewPolicy.bindings.push(
      binding(controller, "roles/logging.viewAccessor"),
    );
  }
  return s;
}

function environment(plan) {
  return {
    SAMRA_GCP_EXPECTED_SHA: sha,
    SAMRA_GCP_OPERATOR_ACCOUNT: operator,
    SAMRA_MIGRATION_FOUNDATION_APPLY: F.authorization,
    SAMRA_MIGRATION_FOUNDATION_PLAN_SHA256: plan.planSha256,
    SAMRA_MIGRATION_FOUNDATION_EXPIRES_AT: new Date(
      Date.now() + 600000,
    ).toISOString(),
  };
}

function harness({
  before = snapshot(),
  after = snapshot(true),
  failRead = false,
  drift = false,
} = {}) {
  const writes = [];
  const reads = [];
  let rounds = 0;
  const command = (binary, args) => {
    if (binary === "git") return args[0] === "rev-parse" ? sha : "";
    if (args[0] === "config")
      return args[2] === "account" ? operator : M.project;
    assert(args.includes(`--project=${M.project}`));
    if (
      args.includes("create") ||
      args.includes("create-oidc") ||
      args.includes("add-iam-policy-binding")
    ) {
      writes.push(args);
      return "{}";
    }
    reads.push(args);
    if (failRead) throw new Error("PERMISSION_DENIED");
    if (args.slice(0, 3).join(" ") === "iam service-accounts list") rounds++;
    const s = structuredClone(writes.length ? after : before);
    if (drift && rounds > 1)
      s.sql.settings.ipConfiguration.sslMode =
        "ALLOW_UNENCRYPTED_AND_ENCRYPTED";
    const starts = (...prefix) =>
      args.slice(0, prefix.length).join(" ") === prefix.join(" ");
    let result;
    if (starts("iam", "service-accounts", "list"))
      result = [s.controller, s.runtime].filter(Boolean);
    else if (starts("iam", "workload-identity-pools", "list"))
      result = s.pool ? [s.pool] : [];
    else if (starts("iam", "workload-identity-pools", "providers", "list"))
      result = s.providers;
    else if (starts("iam", "roles", "list")) {
      result = s.customRole ? [s.customRole] : [];
    } else if (starts("iam", "roles", "describe")) result = s.customRole;
    else if (starts("logging", "views", "list"))
      result = s.view ? [s.view] : [];
    else if (starts("logging", "views", "get-iam-policy"))
      result = s.viewPolicy;
    else if (starts("projects", "describe")) result = s.project;
    else if (starts("projects", "get-iam-policy")) result = s.projectPolicy;
    else if (starts("services", "list"))
      result = s.apis.map((name) => ({ config: { name } }));
    else if (starts("iam", "service-accounts", "keys", "list"))
      result = args.includes(`--iam-account=${M.controller}`)
        ? s.controllerKeys
        : s.runtimeKeys;
    else if (starts("iam", "service-accounts", "get-iam-policy"))
      result = args[3] === M.controller ? s.controllerPolicy : s.runtimePolicy;
    else if (starts("artifacts", "repositories", "get-iam-policy"))
      result = s.repositoryPolicy;
    else if (starts("secrets", "get-iam-policy")) result = s.secretPolicy;
    else if (starts("secrets", "versions", "list")) result = s.secretVersions;
    else if (starts("sql", "instances", "describe")) result = s.sql;
    else if (starts("run", "jobs", "list")) result = s.jobs;
    else throw new Error(`Unexpected command ${args.slice(0, 4)}`);
    return JSON.stringify(result);
  };
  return { command, writes, reads };
}

test("offline foundation plan requires no credential, GitHub or Google command", () => {
  const result = runMigrationFoundation({
    mode: "plan",
    command: () => {
      throw new Error("must not execute");
    },
  });
  assert.equal(result.cloudChanged, false);
  assert.equal(result.cloudInspected, false);
  assert.match(
    execFileSync(
      process.execPath,
      ["deploy/gcp/staging-migration-foundation.mjs", "--plan"],
      { encoding: "utf8" },
    ),
    /offline-plan-only/,
  );
});

test("foundation plan binds source and grants federation only after scoped resource permissions", () => {
  const p = buildFoundationPlan(snapshot(), sha);
  assert.equal(p.actions.length, 10);
  assert.equal(p.actions.at(-1).id, "controller-federation");
  assert.equal(p.migrationExecuted, false);
  assert.equal(p.deploymentAuthorized, false);
  assert.notEqual(
    buildFoundationPlan(snapshot(), "b".repeat(40)).planSha256,
    p.planSha256,
  );
  assert.equal(
    p.planSha256,
    buildFoundationPlan(structuredClone(snapshot()), sha).planSha256,
  );
  const commands = JSON.stringify(p.actions);
  for (const forbidden of [
    "versions access",
    "secretmanager.versions.access",
    "run.jobs.runWithOverrides",
    "keys create",
    "services enable",
    "instances patch",
    "jobs execute",
    "run deploy",
    "roles/owner",
    "set-iam-policy",
  ])
    assert.equal(commands.includes(forbidden), false);
});

test("existing exact foundation is idempotent and passes the runtime controller IAM validator", () => {
  const p = buildFoundationPlan(snapshot(true), sha);
  assert.equal(p.status, "foundation-verified");
  assert.deepEqual(p.actions, []);
});

test("foundation rejects widened trust, privileges, user keys, deleted resources and concurrent jobs", () => {
  for (const mutate of [
    (s) => {
      s.project.projectNumber = "1";
    },
    (s) => {
      s.apis.pop();
    },
    (s) => {
      s.runtimeKeys.push({ name: "key" });
    },
    (s) => {
      s.controllerKeys.push({ name: "key" });
    },
    (s) => {
      s.runtime.disabled = true;
    },
    (s) => {
      s.pool.disabled = true;
    },
    (s) => {
      s.pool.state = "DELETED";
    },
    (s) => {
      s.providers.push({ ...s.providers[0], name: "unexpected" });
    },
    (s) => {
      s.providers[0].attributeMapping["google.subject"] =
        "assertion.repository";
    },
    (s) => {
      s.providers[0].attributeCondition = "true";
    },
    (s) => {
      s.providers[0].oidc.allowedAudiences = ["unexpected"];
    },
    (s) => {
      s.customRole.includedPermissions.push("secretmanager.versions.access");
    },
    (s) => {
      s.projectPolicy.bindings.push(binding(controller, "roles/owner"));
    },
    (s) => {
      s.secretPolicy.bindings.push(
        binding(controller, "roles/secretmanager.secretAccessor"),
      );
    },
    (s) => {
      s.secretPolicy.bindings.push(
        binding("allUsers", "roles/secretmanager.secretAccessor"),
      );
    },
    (s) => {
      s.runtimePolicy.bindings[0].condition = { expression: "true" };
    },
    (s) => {
      s.controllerPolicy.bindings.push(
        binding(
          "user:unexpected@example.invalid",
          "roles/iam.serviceAccountTokenCreator",
        ),
      );
    },
    (s) => {
      s.view.filter = "";
    },
    (s) => {
      s.jobs.push({ metadata: { name: M.job } });
    },
  ]) {
    const s = snapshot(true);
    mutate(s);
    assert.throws(() => buildFoundationPlan(s, sha));
  }
});

test("a read permission failure cannot be interpreted as an absent resource", () => {
  assert.throws(
    () =>
      collectFoundationSnapshot(() => {
        throw new Error("PERMISSION_DENIED");
      }),
    /PERMISSION_DENIED/,
  );
  const h = harness({ failRead: true });
  assert.throws(
    () =>
      runMigrationFoundation({
        mode: "apply",
        env: environment(buildFoundationPlan(snapshot(), sha)),
        command: h.command,
      }),
    /PERMISSION_DENIED/,
  );
  assert.equal(h.writes.length, 0);
});

test("review only reads metadata and distinguishes IAM readiness from database readiness", () => {
  const before = snapshot();
  before.secretVersions = [];
  before.sql.settings.ipConfiguration.sslMode =
    "ALLOW_UNENCRYPTED_AND_ENCRYPTED";
  const h = harness({ before });
  const p = runMigrationFoundation({
    mode: "review",
    env: environment(buildFoundationPlan(before, sha)),
    command: h.command,
  });
  assert.equal(h.writes.length, 0);
  assert.deepEqual(p.database.enabledSecretVersions, []);
  assert.equal(p.database.sslMode, "ALLOW_UNENCRYPTED_AND_ENCRYPTED");
  assert.equal(
    h.reads.some((args) => args.includes("access")),
    false,
  );
});

test("apply requires exact reviewed plan hash and unexpired authorization", () => {
  const p = buildFoundationPlan(snapshot(), sha);
  for (const mutate of [
    (e) => {
      delete e.SAMRA_MIGRATION_FOUNDATION_APPLY;
    },
    (e) => {
      e.SAMRA_MIGRATION_FOUNDATION_PLAN_SHA256 = "b".repeat(64);
    },
    (e) => {
      e.SAMRA_MIGRATION_FOUNDATION_EXPIRES_AT = new Date(
        Date.now() - 1,
      ).toISOString();
    },
  ]) {
    const env = environment(p);
    mutate(env);
    const h = harness();
    assert.throws(() =>
      runMigrationFoundation({ mode: "apply", env, command: h.command }),
    );
    assert.equal(h.writes.length, 0);
  }
  assert.throws(() =>
    validateFoundationApproval(
      {
        ...environment(p),
        SAMRA_MIGRATION_FOUNDATION_EXPIRES_AT: new Date(
          Date.now() + 7200000,
        ).toISOString(),
      },
      p,
    ),
  );
});

test("drift between reviewed metadata and apply causes zero mutations", () => {
  const h = harness({ drift: true });
  assert.throws(
    () =>
      runMigrationFoundation({
        mode: "apply",
        env: environment(buildFoundationPlan(snapshot(), sha)),
        command: h.command,
      }),
    /changed after preflight/,
  );
  assert.equal(h.writes.length, 0);
});

test("apply performs only the approved missing actions and re-audits all metadata", () => {
  const h = harness();
  const p = buildFoundationPlan(snapshot(), sha);
  const result = runMigrationFoundation({
    mode: "apply",
    env: environment(p),
    command: h.command,
  });
  assert.equal(result.status, "foundation-applied-and-verified");
  assert.deepEqual(
    result.appliedActions,
    p.actions.map((a) => a.id),
  );
  assert.equal(h.writes.length, 10);
  assert(
    h.writes.every(
      (args) =>
        args.includes("--quiet") && args.includes(`--project=${M.project}`),
    ),
  );
  assert.equal(result.migrationExecuted, false);
  assert.equal(result.actions.length, 0);
  assert(
    h.reads.filter(
      (args) => args.slice(0, 3).join(" ") === "iam service-accounts list",
    ).length === 3,
  );
});

test("a failed post-audit or mid-apply expiry emits no successful result and performs no rollback", () => {
  const p = buildFoundationPlan(snapshot(), sha);
  const h = harness({ after: snapshot() });
  assert.throws(
    () =>
      runMigrationFoundation({
        mode: "apply",
        env: environment(p),
        command: h.command,
      }),
    /post-audit failed/,
  );
  assert.equal(
    h.writes.some((args) => args.includes("delete")),
    false,
  );
  const second = harness();
  const start = Date.now();
  let calls = 0;
  assert.throws(
    () =>
      runMigrationFoundation({
        mode: "apply",
        env: environment(p),
        command: second.command,
        now: () => (++calls <= 2 ? start : start + 7200000),
      }),
    /expired/,
  );
  assert.equal(second.writes.length, 1);
});

test("audit rejects an incomplete foundation and never changes the cloud", () => {
  const h = harness();
  assert.throws(
    () =>
      runMigrationFoundation({
        mode: "audit",
        env: environment(buildFoundationPlan(snapshot(), sha)),
        command: h.command,
      }),
    /incomplete/,
  );
  assert.equal(h.writes.length, 0);
});
