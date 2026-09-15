import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import test from "node:test";
import {
  assertLocalDocker,
  childEnvironment,
  executePersonaLab,
  parseArguments,
  POSTGRES_IMAGE,
} from "./cli.mjs";

const manifest = JSON.parse(
  await readFile(new URL("./personas.json", import.meta.url), "utf8"),
);
const runId = "12345678-1234-1234-1234-123456789abc";

function fakeExecutor({
  failMigration = false,
  failCreation = false,
  failCleanup = false,
  owner = runId,
  runtimeCleanupFailed = false,
  endpoint = "unix:///local/docker.sock",
} = {}) {
  const calls = [];
  let exists = false;
  const execute = async (program, args, options = {}) => {
    calls.push({ program, args, options });
    if (program === "docker") {
      if (args[0] === "context")
        return args[1] === "show" ? "desktop-linux" : endpoint;
      assert.deepEqual(args.slice(0, 2), ["--context", "desktop-linux"]);
      const action = args[2];
      if (action === "run") {
        if (failCreation)
          throw new Error("fixture failure with private material");
        exists = true;
        return "owned-container";
      }
      if (action === "inspect")
        return args.at(-1).includes("Health")
          ? "healthy"
          : args.at(-1) === "{{.Id}}"
            ? "a".repeat(64)
            : owner;
      if (action === "exec") return "";
      if (action === "port") return "127.0.0.1:55499";
      if (action === "ps") return exists ? "owned-container" : "";
      if (action === "rm") {
        if (failCleanup) throw new Error("fixture cleanup failure");
        exists = false;
        return "owned-container";
      }
      assert.fail("Unexpected container operation");
    }
    if (args.at(-1) === "src/test-migrate.ts") {
      if (failMigration) throw new Error("postgresql://private-input.invalid");
      return "";
    }
    if (args.at(-1) === "test/persona-lab/run.ts")
      return JSON.stringify({
        results: [
          {
            id: "environment",
            title: "Isolated local runtime",
            persona: "both",
            status: "passed",
            observations: { ready: true },
          },
          {
            id: "cleanup",
            title: "Runtime cleanup",
            persona: "both",
            status: runtimeCleanupFailed ? "failed" : "passed",
            observations: { resourcesClosed: !runtimeCleanupFailed },
          },
        ],
      });
    assert.fail("Unexpected process operation");
  };
  return { execute, calls };
}

test("CLI rejects external database/API options and duplicate flags", () => {
  assert.equal(parseArguments(["--plan"]).plan, true);
  for (const args of [
    ["--database", "local"],
    ["--api-origin", "https://example.invalid"],
    ["--plan", "--plan"],
    ["--manifest"],
    ["--output", "--plan"],
  ])
    assert.throws(() => parseArguments(args), /PERSONA_ARGUMENT_INVALID/);
});

test("children receive no host financial, authentication or execution overrides", () => {
  const clean = childEnvironment({
    PATH: "/bin",
    HOME: "/local",
    DATABASE_URL: "private",
    PGHOST: "private",
    AUTH0_CLIENT_SECRET: "private",
    GOOGLE_APPLICATION_CREDENTIALS: "private",
    SAMRA_CUSTOMER_WALLET_PROVIDER_MODE: "live",
    NODE_OPTIONS: "--require private",
    DOCKER_HOST: "ssh://remote",
    DOCKER_CONTEXT: "remote",
  });
  assert.equal(clean.PATH, "/bin");
  assert.equal(clean.SAMRA_CUSTOMER_WALLET_PROVIDER_MODE, "fake");
  for (const key of [
    "DATABASE_URL",
    "PGHOST",
    "AUTH0_CLIENT_SECRET",
    "GOOGLE_APPLICATION_CREDENTIALS",
    "NODE_OPTIONS",
    "DOCKER_HOST",
    "DOCKER_CONTEXT",
  ])
    assert.equal(clean[key], undefined);
});

test("Docker endpoints must be local Unix sockets", () => {
  assertLocalDocker("unix:///local/docker.sock");
  for (const endpoint of [
    "ssh://remote",
    "tcp://127.0.0.1:2375",
    "tcp://remote:2376",
    "unix:///local/docker.sock\nremote",
  ])
    assert.throws(
      () => assertLocalDocker(endpoint),
      /PERSONA_DOCKER_MUST_BE_LOCAL/,
    );
});

test("lab uses pinned image, loopback port, tmpfs and exact owned cleanup", async () => {
  const mock = fakeExecutor();
  const result = await executePersonaLab(manifest, runId, mock.execute);
  assert.equal(result.primaryFailure, false);
  assert.equal(result.results.filter(({ id }) => id === "cleanup").length, 1);
  assert.equal(result.results.at(-1).observations.containerRemoved, true);
  const run = mock.calls.find(({ args }) => args[2] === "run");
  assert.equal(run.args.at(-1), POSTGRES_IMAGE);
  assert.ok(run.args.includes("127.0.0.1::5432"));
  assert.ok(
    run.args.includes("/var/lib/postgresql/data:rw,nosuid,size=268435456"),
  );
  assert.ok(!run.args.some((arg) => arg.startsWith("POSTGRES_PASSWORD=")));
  const migrate = mock.calls.find(
    ({ args }) => args.at(-1) === "src/test-migrate.ts",
  );
  assert.match(
    migrate.options.env.TEST_DATABASE_URL,
    /@127\.0\.0\.1:55499\/samra_test$/,
  );
  assert.equal(
    migrate.options.env.SAMRA_PERSONA_LAB_CONTAINER_ID,
    "a".repeat(64),
  );
  const proof = mock.calls.find(({ args }) => args[2] === "exec");
  assert.match(proof.args.at(-1), /CREATE TABLE samra_persona_lab.guard/);
  assert.ok(mock.calls.indexOf(proof) < mock.calls.indexOf(migrate));
  const remove = mock.calls.find(({ args }) => args[2] === "rm");
  assert.deepEqual(remove.args.slice(2), [
    "rm",
    "--force",
    `samra-persona-${runId}`,
  ]);
});

test("migration failures block the run but still remove only its disposable database", async () => {
  const mock = fakeExecutor({ failMigration: true });
  const result = await executePersonaLab(manifest, runId, mock.execute);
  assert.equal(result.primaryFailure, true);
  assert.equal(result.results[0].status, "blocked");
  assert.equal(result.results.at(-1).status, "passed");
  assert.ok(mock.calls.some(({ args }) => args[2] === "rm"));
  assert.doesNotMatch(JSON.stringify(result), /postgresql:|private-input/);
  assert.ok(
    !mock.calls.some(({ args }) => args.at(-1) === "test/persona-lab/run.ts"),
  );
});

test("failure before container creation verifies absence without deleting anything", async () => {
  const mock = fakeExecutor({ failCreation: true });
  const result = await executePersonaLab(manifest, runId, mock.execute);
  assert.equal(result.results.at(-1).status, "passed");
  assert.ok(!mock.calls.some(({ args }) => args[2] === "rm"));
});

test("cleanup refuses a foreign owner and cannot claim success", async () => {
  const mock = fakeExecutor({ owner: "someone-else" });
  const result = await executePersonaLab(manifest, runId, mock.execute);
  assert.equal(result.results.at(-1).status, "failed");
  assert.ok(!mock.calls.some(({ args }) => args[2] === "rm"));
});

test("cleanup preserves runtime failures and failed container removal", async () => {
  for (const flags of [{ runtimeCleanupFailed: true }, { failCleanup: true }]) {
    const mock = fakeExecutor(flags);
    const result = await executePersonaLab(manifest, runId, mock.execute);
    assert.equal(result.results.at(-1).status, "failed");
  }
});

test("remote Docker cannot create any test resource", async () => {
  const mock = fakeExecutor({ endpoint: "ssh://remote" });
  const result = await executePersonaLab(manifest, runId, mock.execute);
  assert.equal(result.results[0].status, "blocked");
  assert.ok(!mock.calls.some(({ args }) => args[2] === "run"));
});

test("interruptions abort work and still await exact owned cleanup", async () => {
  for (const signal of ["SIGINT", "SIGTERM"]) {
    const mock = fakeExecutor();
    const before = process.listenerCount(signal);
    const execute = async (program, args, options) => {
      if (args.at(-1) === "src/test-migrate.ts") {
        process.emit(signal);
        options.signal.throwIfAborted();
      }
      return mock.execute(program, args, options);
    };
    const result = await executePersonaLab(manifest, runId, execute);
    assert.equal(result.primaryFailure, true);
    assert.equal(result.results.at(-1).observations.containerRemoved, true);
    assert.equal(result.results.at(-1).status, "blocked");
    assert.ok(mock.calls.some(({ args }) => args[2] === "rm"));
    assert.equal(process.listenerCount(signal), before);
  }
});

test("an interruption during cleanup cannot preserve a passing result", async () => {
  const mock = fakeExecutor();
  let interrupted = false;
  const execute = async (program, args, options) => {
    if (args[2] === "ps" && !interrupted) {
      interrupted = true;
      process.emit("SIGTERM");
    }
    return mock.execute(program, args, options);
  };
  const result = await executePersonaLab(manifest, runId, execute);
  assert.equal(result.results.at(-1).status, "blocked");
  assert.equal(result.results.at(-1).observations.containerRemoved, true);
  assert.equal(result.results.at(-1).errorCode, "PERSONA_RUN_INTERRUPTED");
});

test("plan is import-safe and needs no Docker or database", async () => {
  const { stdout, stderr } = await promisify(execFile)(
    process.execPath,
    [new URL("./cli.mjs", import.meta.url).pathname, "--plan"],
    { env: { PATH: "/nonexistent" } },
  );
  assert.equal(stderr, "");
  const result = JSON.parse(stdout);
  assert.equal(result.status, "planned-not-run");
  assert.equal(result.cloudChanges, false);
  assert.equal(result.humanAcceptance, false);
  assert.equal(result.manifest.personas.length, 2);
});
