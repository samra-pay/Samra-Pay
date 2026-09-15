import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  buildPersonaReport,
  renderPersonaSummary,
  validateLocalDatabaseUrl,
  validatePersonaManifest,
} from "./contract.mjs";

const exec = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const apiRoot = resolve(here, "../..");
const repository = resolve(apiRoot, "../..");
export const POSTGRES_IMAGE =
  "postgres:16@sha256:f1c3376c26f2609ab9f29f71f824103fe2fcd8ee0346485cb6122a4f93df6f94";

export function parseArguments(args) {
  const options = {
    plan: false,
    manifest: resolve(here, "personas.json"),
    output: resolve(apiRoot, "test-results/personas"),
  };
  const seen = new Set();
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (seen.has(flag)) throw new Error("PERSONA_ARGUMENT_INVALID");
    seen.add(flag);
    if (flag === "--plan") options.plan = true;
    else if (
      ["--manifest", "--output"].includes(flag) &&
      args[index + 1] &&
      !args[index + 1].startsWith("--")
    ) {
      options[flag.slice(2)] = resolve(args[++index]);
    } else throw new Error("PERSONA_ARGUMENT_INVALID");
  }
  return options;
}

export function childEnvironment(source = process.env) {
  // Do not pass host database URLs, auth settings, cloud credentials, NODE_OPTIONS,
  // provider secrets, or PostgreSQL connection overrides into a test process.
  const environment = {
    NODE_ENV: "test",
    SAMRA_BACKEND_MODE: "disabled",
    SAMRA_PROVIDER_MODE: "fake",
    SAMRA_CUSTOMER_IDENTITY_PROVIDER_MODE: "fake",
    SAMRA_CUSTOMER_WALLET_PROVIDER_MODE: "fake",
    SAMRA_RUN_WORKER: "false",
    SAMRA_INTERNAL_OPERATIONS_ENABLED: "false",
  };
  for (const key of ["PATH", "HOME", "TMPDIR", "SYSTEMROOT", "DOCKER_CONFIG"]) {
    if (source[key]) environment[key] = source[key];
  }
  return environment;
}

export function assertLocalDocker(endpoint) {
  if (!/^unix:\/\/\/[^\r\n]+\.sock$/.test(endpoint))
    throw new Error("PERSONA_DOCKER_MUST_BE_LOCAL");
}

async function command(program, args, options = {}) {
  const result = await exec(program, args, {
    cwd: repository,
    env: childEnvironment(),
    timeout: 120_000,
    maxBuffer: 2 * 1024 * 1024,
    ...options,
  });
  return result.stdout.trim();
}

export async function executePersonaLab(manifest, runId, execute = command) {
  validatePersonaManifest(manifest);
  if (!/^[a-f0-9-]{36}$/.test(runId)) throw new Error("PERSONA_RUN_ID_INVALID");
  const name = `samra-persona-${runId}`;
  const label = "com.samrapay.persona-run";
  const environment = childEnvironment();
  const results = [];
  let context;
  let creationAttempted = false;
  let primaryFailure;
  const cancellation = new AbortController();
  const interrupt = () => cancellation.abort();
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", interrupt);
  const work = (program, args, options = {}) => {
    cancellation.signal.throwIfAborted();
    return execute(program, args, { ...options, signal: cancellation.signal });
  };
  // Cleanup must remain usable after a run is interrupted.
  const cleanupDocker = (args) =>
    execute("docker", ["--context", context, ...args], { timeout: 15_000 });
  const docker = (args, options = {}) =>
    work("docker", ["--context", context, ...args], options);
  try {
    context = await work("docker", ["context", "show"]);
    if (!/^[A-Za-z0-9_.-]+$/.test(context))
      throw new Error("PERSONA_DOCKER_CONTEXT_INVALID");
    assertLocalDocker(
      await work("docker", [
        "context",
        "inspect",
        context,
        "--format",
        "{{.Endpoints.docker.Host}}",
      ]),
    );
    const password = `local_fixture_${runId.replaceAll("-", "")}`;
    creationAttempted = true;
    await docker(
      [
        "run",
        "--detach",
        "--pull=missing",
        "--name",
        name,
        "--label",
        `${label}=${runId}`,
        "--memory=512m",
        "--cpus=1",
        "--publish",
        "127.0.0.1::5432",
        "--tmpfs",
        "/var/lib/postgresql/data:rw,nosuid,size=268435456",
        "--env",
        "POSTGRES_USER=samra_persona",
        "--env",
        "POSTGRES_DB=samra_test",
        "--env",
        "POSTGRES_PASSWORD",
        "--health-cmd",
        "pg_isready -U samra_persona -d samra_test",
        "--health-interval=1s",
        "--health-timeout=2s",
        "--health-retries=30",
        POSTGRES_IMAGE,
      ],
      { env: { ...environment, POSTGRES_PASSWORD: password } },
    );
    const containerId = await docker(["inspect", name, "--format", "{{.Id}}"]);
    if (!/^[a-f0-9]{64}$/.test(containerId))
      throw new Error("PERSONA_CONTAINER_ID_INVALID");
    const owner = await docker([
      "inspect",
      name,
      "--format",
      `{{index .Config.Labels "${label}"}}`,
    ]);
    if (owner !== runId) throw new Error("PERSONA_CONTAINER_OWNER_INVALID");
    let healthy = false;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const health = await docker([
        "inspect",
        name,
        "--format",
        "{{.State.Health.Status}}",
      ]);
      if (health === "healthy") {
        healthy = true;
        break;
      }
      if (health === "unhealthy") break;
      await new Promise((done) => setTimeout(done, 250));
    }
    if (!healthy) throw new Error("PERSONA_DATABASE_NOT_READY");
    const port = await docker(["port", name, "5432/tcp"]);
    if (!/^127\.0\.0\.1:[1-9][0-9]{0,4}$/.test(port))
      throw new Error("PERSONA_DATABASE_PORT_INVALID");
    const connectionString = validateLocalDatabaseUrl(
      `postgresql://samra_persona:${password}@${port}/samra_test`,
    );
    // This proof is written through the exact owned container, not an arbitrary
    // host URL. A loopback tunnel to another database cannot satisfy the runner.
    await docker([
      "exec",
      name,
      "psql",
      "-X",
      "-U",
      "samra_persona",
      "-d",
      "samra_test",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      `CREATE SCHEMA samra_persona_lab; CREATE TABLE samra_persona_lab.guard (run_id text NOT NULL, container_id text NOT NULL); INSERT INTO samra_persona_lab.guard VALUES ('${runId}', '${containerId}');`,
    ]);
    const testEnvironment = {
      ...environment,
      TEST_DATABASE_URL: connectionString,
      SAMRA_PERSONA_LAB_OWNED_DATABASE: "true",
      SAMRA_PERSONA_LAB_CONTAINER_ID: containerId,
    };
    await work(process.execPath, ["--import", "tsx", "src/test-migrate.ts"], {
      cwd: resolve(repository, "lib/db"),
      env: testEnvironment,
    });
    const stdout = await work(
      process.execPath,
      ["--import", "tsx", "test/persona-lab/run.ts"],
      {
        cwd: apiRoot,
        env: {
          ...testEnvironment,
          SAMRA_PERSONA_LAB_MANIFEST: JSON.stringify(manifest),
          SAMRA_PERSONA_LAB_RUN_ID: runId,
        },
      },
    );
    const payload = JSON.parse(stdout);
    if (!Array.isArray(payload.results))
      throw new Error("PERSONA_RUNTIME_RESULT_INVALID");
    results.push(...payload.results);
  } catch {
    primaryFailure = true;
    results.push({
      id: "environment",
      title: "Local isolated runtime",
      persona: "both",
      status: "blocked",
      observations: { ready: false },
      errorCode: "PERSONA_LOCAL_RUN_BLOCKED",
    });
  } finally {
    let removed = !creationAttempted;
    if (creationAttempted) {
      try {
        const existing = await cleanupDocker([
          "ps",
          "--all",
          "--quiet",
          "--filter",
          `name=^/${name}$`,
        ]);
        if (!existing) removed = true;
        else {
          const owner = await cleanupDocker([
            "inspect",
            name,
            "--format",
            `{{index .Config.Labels "${label}"}}`,
          ]);
          if (owner !== runId)
            throw new Error("PERSONA_CLEANUP_OWNER_MISMATCH");
          await cleanupDocker(["rm", "--force", name]);
          const remaining = await cleanupDocker([
            "ps",
            "--all",
            "--quiet",
            "--filter",
            `label=${label}=${runId}`,
          ]);
          removed = remaining === "";
        }
      } catch {
        removed = false;
      }
    }
    const runtimeCleanup = results.find((result) => result.id === "cleanup");
    const cleanupPassed =
      removed && (!runtimeCleanup || runtimeCleanup.status === "passed");
    const interrupted = cancellation.signal.aborted;
    const cleanup = {
      id: "cleanup",
      title: "Disposable local database cleanup",
      persona: "both",
      status: !cleanupPassed ? "failed" : interrupted ? "blocked" : "passed",
      observations: {
        ...runtimeCleanup?.observations,
        containerRemoved: removed,
        cleanupUnverified: !removed,
        interrupted,
      },
      ...(!cleanupPassed
        ? { errorCode: "PERSONA_CLEANUP_REQUIRES_ATTENTION" }
        : interrupted
          ? { errorCode: "PERSONA_RUN_INTERRUPTED" }
          : {}),
    };
    if (runtimeCleanup) results[results.indexOf(runtimeCleanup)] = cleanup;
    else results.push(cleanup);
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", interrupt);
  }
  return {
    results,
    primaryFailure: Boolean(primaryFailure),
    containerName: name,
  };
}

export async function main(args = process.argv.slice(2)) {
  const options = parseArguments(args);
  const manifest = validatePersonaManifest(
    JSON.parse(await readFile(options.manifest, "utf8")),
  );
  if (options.plan) {
    process.stdout.write(
      JSON.stringify(
        {
          status: "planned-not-run",
          scope: "local-disposable-synthetic-only",
          manifest,
          databaseImage: POSTGRES_IMAGE,
          cloudChanges: false,
          authentication: "simulated",
          humanAcceptance: false,
        },
        null,
        2,
      ) + "\n",
    );
    return 0;
  }
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const sourceSha = await command("git", ["rev-parse", "HEAD"]);
  const dirty = (await command("git", ["status", "--porcelain"])) !== "";
  process.stderr.write(
    "Running two synthetic personas against a disposable local database.\n",
  );
  const { results, containerName } = await executePersonaLab(manifest, runId);
  const report = buildPersonaReport({
    manifest,
    runId,
    sourceSha,
    dirty,
    startedAt,
    finishedAt: new Date().toISOString(),
    results,
  });
  const output = resolve(options.output, runId);
  await mkdir(output, { recursive: true });
  await writeFile(
    resolve(output, "results.json"),
    JSON.stringify(report, null, 2) + "\n",
    { flag: "wx" },
  );
  await writeFile(resolve(output, "summary.md"), renderPersonaSummary(report), {
    flag: "wx",
  });
  process.stdout.write(
    `Persona run: ${report.status}\nReport: ${resolve(output, "summary.md")}\n`,
  );
  if (
    results.some(
      (result) =>
        result.id === "cleanup" && !result.observations.containerRemoved,
    )
  )
    process.stderr.write(
      `Local fixture container requires inspection: ${containerName}\n`,
    );
  return report.status === "passed" ? 0 : 1;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch(() => {
      process.stderr.write(
        "Persona runner could not start or write its report. Check arguments, dependencies and local Docker; no raw private input is printed.\n",
      );
      process.exitCode = 1;
    });
}
