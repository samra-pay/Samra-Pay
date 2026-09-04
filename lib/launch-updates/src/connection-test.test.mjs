import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { connectionTestTarget, runConnectionTest } from "./connection-test.mjs";

const now = () => Date.parse("2026-09-03T12:00:00.000Z");
function config(overrides = {}) {
  return {
    SAMRA_LAUNCH_UPDATES_MODE: "test",
    SAMRA_CLOUD_PROJECT_ID: "samra-pay-production",
    SAMRA_RESEND_SECRET_VERSION: "1",
    CLOUD_RUN_JOB: "samra-production-resend-test",
    CLOUD_RUN_TASK_COUNT: "1",
    CLOUD_RUN_TASK_INDEX: "0",
    CLOUD_RUN_TASK_ATTEMPT: "0",
    SAMRA_LAUNCH_UPDATES_TEST_RECIPIENT: "owner@example.com",
    SAMRA_LAUNCH_UPDATES_TEST_APPROVAL_ID: "synthetic-test-0001",
    SAMRA_LAUNCH_UPDATES_TEST_EXPIRES_AT: "2026-09-03T12:30:00.000Z",
    RESEND_API_KEY: "re_synthetic_test_fixture_not_a_credential",
    ...overrides,
  };
}

test("disabled CLI wrapper does not access key or network", async () => {
  const env = Object.defineProperty({}, "RESEND_API_KEY", {
    get() {
      assert.fail("disabled execution must not access the key");
    },
  });
  const result = await runConnectionTest({
    env,
    fetchImpl() {
      assert.fail("disabled execution must not use the network");
    },
  });
  assert.deepEqual(result, {
    exitCode: 0,
    report: { event: "samra_resend_connection_test", status: "disabled" },
  });
});

test("test mode alone does not authorize CLI execution", async () => {
  const env = Object.defineProperty(config(), "RESEND_API_KEY", {
    get() {
      assert.fail("missing explicit flag must not access the key");
    },
  });
  const result = await runConnectionTest({ env });
  assert.equal(result.exitCode, 1);
  assert.equal(result.report.status, "blocked");
});

for (const [field, value] of [
  ["SAMRA_CLOUD_PROJECT_ID", "samra-pay-staging"],
  ["SAMRA_RESEND_SECRET_VERSION", "latest"],
  ["SAMRA_RESEND_SECRET_VERSION", "2"],
  ["SAMRA_RESEND_SECRET_VERSION", undefined],
  ["CLOUD_RUN_JOB", "financial-api"],
  ["CLOUD_RUN_JOB", undefined],
  ["CLOUD_RUN_TASK_COUNT", "2"],
  ["CLOUD_RUN_TASK_INDEX", "1"],
  ["CLOUD_RUN_TASK_ATTEMPT", "1"],
  ["K_SERVICE", "public-service"],
]) {
  test(`rejects mismatched private-job boundary: ${field} / ${value}`, async () => {
    const env = Object.defineProperty(config({ [field]: value }), "RESEND_API_KEY", {
      get() {
        assert.fail("mismatched execution must not access the key");
      },
    });
    const result = await runConnectionTest({
      args: ["--send-approved-test"],
      env,
      now,
      fetchImpl() {
        assert.fail("mismatched execution must not call Resend");
      },
    });
    assert.equal(result.exitCode, 1);
    assert.equal(result.report.status, "blocked");
  });
}

test("rejects unknown arguments without echoing them", async () => {
  const result = await runConnectionTest({
    args: ["--send-approved-test", "owner@example.com"],
    env: config(),
  });
  assert.equal(result.exitCode, 1);
  assert.doesNotMatch(JSON.stringify(result), /owner@example/u);
});

for (const uid of [0, undefined, -1, NaN]) {
  test(`rejects an unsafe or unavailable runtime UID: ${uid}`, async () => {
    const env = Object.defineProperty(config(), "RESEND_API_KEY", {
      get() {
        assert.fail("unsafe execution must not read the key");
      },
    });
    const result = await runConnectionTest({
      args: ["--send-approved-test"], env, now, getEffectiveUid: () => uid,
      fetchImpl() { assert.fail("unsafe execution must not contact Resend"); },
    });
    assert.equal(result.exitCode, 1);
    assert.equal(result.report.code, "NON_ROOT_RUNTIME_REQUIRED");
  });
}

test("one guarded invocation reports API acceptance, not delivery", async () => {
  const methods = [];
  const result = await runConnectionTest({
    args: ["--send-approved-test"],
    env: config(),
    now,
    fetchImpl: async (_url, options) => {
      methods.push(options.method);
      if (options.method === "GET") return new Response("{}", { status: 404 });
      return Response.json({ id: "557934fe-0b4c-4b48-b71c-e929d9dab974" });
    },
  });
  assert.deepEqual(methods, ["GET", "GET", "POST"]);
  assert.deepEqual(result, {
    exitCode: 0,
    report: {
      event: "samra_resend_connection_test",
      status: "provider_accepted",
      messageId: "557934fe-0b4c-4b48-b71c-e929d9dab974",
    },
  });
  assert.doesNotMatch(JSON.stringify(result), /re_synthetic|owner@example|delivered/u);
});

test("provider failure produces only an allowed error code, with no retry", async () => {
  let requests = 0;
  const result = await runConnectionTest({
    args: ["--send-approved-test"],
    env: config(),
    now,
    fetchImpl: async () => {
      requests += 1;
      throw new Error("owner@example.com re_synthetic raw provider detail");
    },
  });
  assert.equal(requests, 1);
  assert.equal(result.exitCode, 1);
  assert.equal(result.report.code, "REQUEST_FAILED");
  assert.doesNotMatch(JSON.stringify(result), /re_synthetic|owner@example|provider detail/u);
});

test("unexpected configuration exceptions do not enter the report", async () => {
  const env = Object.defineProperty({}, "SAMRA_LAUNCH_UPDATES_MODE", {
    get() {
      throw new Error("sensitive environment detail");
    },
  });
  const result = await runConnectionTest({ env });
  assert.equal(result.report.code, "TEST_FAILED");
  assert.doesNotMatch(JSON.stringify(result), /sensitive/u);
});

test("running the real CLI with an empty environment is offline and disabled", () => {
  const child = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("./connection-test.mjs", import.meta.url))],
    { env: {}, encoding: "utf8", timeout: 3_000 },
  );
  assert.equal(child.status, 0);
  assert.equal(child.stderr, "");
  assert.equal(JSON.parse(child.stdout).status, "disabled");
});

test("job template pins both secret references and remains unapproved/disabled", () => {
  const job = JSON.parse(readFileSync(
    new URL("../deploy/cloud-run-job.template.json", import.meta.url), "utf8",
  ));
  assert.equal(job.name, `projects/${connectionTestTarget.projectId}/locations/${connectionTestTarget.region}/jobs/${connectionTestTarget.jobName}`);
  assert.deepEqual(Object.keys(job).sort(), ["name", "template"]);
  const execution = job.template;
  assert.deepEqual(Object.keys(execution).sort(), ["parallelism", "taskCount", "template"]);
  assert.equal(execution.taskCount, 1);
  assert.equal(execution.parallelism, 1);
  const task = execution.template;
  assert.deepEqual(Object.keys(task).sort(), ["containers", "maxRetries", "serviceAccount", "timeout"]);
  assert.equal(task.maxRetries, 0);
  assert.equal(task.timeout, "60s");
  assert.equal(task.serviceAccount, "samra-resend-test@samra-pay-production.iam.gserviceaccount.com");
  assert.equal(task.containers.length, 1);
  const container = task.containers[0];
  assert.deepEqual(Object.keys(container).sort(), ["args", "command", "env", "image", "resources"]);
  assert.deepEqual(container.command, ["node", "./src/connection-test.mjs"]);
  assert.equal(container.image, "REVIEWED_IMAGE_DIGEST_REQUIRED");
  assert.deepEqual(container.args, []);
  assert.deepEqual(Object.keys(container.resources), ["limits"]);
  assert.deepEqual(container.resources.limits, { cpu: "1", memory: "512Mi" });
  const env = Object.fromEntries(container.env.map((item) => [item.name, item]));
  assert.equal(container.env.length, 7, "no duplicate or extra environment entries");
  assert.deepEqual(Object.keys(env).sort(), [
    "RESEND_API_KEY", "SAMRA_CLOUD_PROJECT_ID", "SAMRA_LAUNCH_UPDATES_MODE",
    "SAMRA_LAUNCH_UPDATES_TEST_APPROVAL_ID", "SAMRA_LAUNCH_UPDATES_TEST_EXPIRES_AT",
    "SAMRA_LAUNCH_UPDATES_TEST_RECIPIENT", "SAMRA_RESEND_SECRET_VERSION",
  ]);
  for (const entry of container.env) {
    assert.deepEqual(Object.keys(entry).sort(), [
      "name", entry.name === "RESEND_API_KEY" ? "valueSource" : "value",
    ]);
  }
  assert.equal(env.SAMRA_LAUNCH_UPDATES_MODE.value, "disabled");
  assert.equal(env.SAMRA_LAUNCH_UPDATES_TEST_RECIPIENT.value, "");
  assert.equal(env.SAMRA_LAUNCH_UPDATES_TEST_APPROVAL_ID.value, "");
  assert.equal(env.SAMRA_LAUNCH_UPDATES_TEST_EXPIRES_AT.value, "");
  assert.equal(env.SAMRA_RESEND_SECRET_VERSION.value, connectionTestTarget.secretVersion);
  assert.equal(env.SAMRA_CLOUD_PROJECT_ID.value, connectionTestTarget.projectId);
  assert.equal(env.RESEND_API_KEY.value, undefined);
  assert.deepEqual(env.RESEND_API_KEY.valueSource.secretKeyRef, {
    secret: "samra-production-resend-api-key", version: connectionTestTarget.secretVersion,
  });
  assert.doesNotMatch(JSON.stringify(job), /DATABASE|vpcAccess|cloudsql|ports|allUsers|startExecutionToken|runExecutionToken|securityContext/u);
});

test("container recipes share one explicit source allowlist and the private job defaults to disabled", () => {
  const dockerfile = readFileSync(new URL("../Dockerfile", import.meta.url), "utf8");
  const ignore = readFileSync(new URL("../.dockerignore", import.meta.url), "utf8");
  const uploadIgnore = readFileSync(new URL("../.gcloudignore", import.meta.url), "utf8");
  assert.equal(uploadIgnore, ignore, "cloud source uploads use the same explicit allowlist");
  assert.match(dockerfile, /FROM node:24-bookworm-slim@sha256:[0-9a-f]{64}/u);
  assert.match(dockerfile, /ENV SAMRA_LAUNCH_UPDATES_MODE=disabled/u);
  assert.match(dockerfile, /^USER node$/mu);
  assert.equal(dockerfile.split("\n").filter((line) => line.startsWith("COPY ")).length, 1);
  assert.match(dockerfile, /COPY --chown=node:node src\/server\.mjs src\/resend\.mjs src\/connection-test\.mjs \.\/src\//u);
  assert.doesNotMatch(dockerfile, /(?:^|\n)(?:RUN|EXPOSE|ADD) |--send-approved-test/u);
  assert.deepEqual(ignore.trim().split("\n"), [
    "**", "!Dockerfile", "!Dockerfile.waitlist", "!cloudbuild.waitlist.yaml", "!src/",
    "!src/server.mjs", "!src/resend.mjs", "!src/connection-test.mjs",
    "!src/public-server.mjs", "!src/public-waitlist-service.mjs", "!src/waitlist-resend.mjs",
  ]);
});
