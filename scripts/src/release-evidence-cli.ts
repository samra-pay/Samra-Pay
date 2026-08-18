#!/usr/bin/env tsx

import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import {
  buildReleaseIdentity,
  createReleaseEvidenceManifest,
  createReleaseGateJunit,
  normalizeCandidateSha,
  readContract,
  splitReleaseEvidenceInvocation,
  verifyManifest,
  writeManifestAndHash,
  type ReleaseIdentity,
} from "./release-evidence";

const workspaceRoot = resolve(import.meta.dirname, "../..");
const contractPath = resolve(
  workspaceRoot,
  "docs/testing/release-evidence-contract.json",
);

async function main(): Promise<void> {
  const { command, rawArguments } = splitReleaseEvidenceInvocation(
    process.argv.slice(2),
  );
  const argumentsByName = parseArguments(rawArguments);
  const contract = await readContract(contractPath);

  if (command === "identity") {
    const candidateSha = normalizeCandidateSha(
      required(argumentsByName, "candidate-sha"),
    );
    const actualSha = git("rev-parse", "HEAD");
    if (candidateSha !== actualSha) {
      throw new Error(
        `Checked-out SHA ${actualSha} does not match ${candidateSha}.`,
      );
    }
    const ancestry = spawnSync(
      "git",
      ["merge-base", "--is-ancestor", candidateSha, "refs/remotes/origin/main"],
      { cwd: workspaceRoot, stdio: "ignore" },
    );
    if (ancestry.status !== 0) {
      throw new Error("Candidate SHA is not contained in GitHub main.");
    }
    const identity = buildReleaseIdentity({
      candidateSha,
      gitTreeSha: git("rev-parse", "HEAD^{tree}"),
      parentShas: git("show", "-s", "--format=%P", "HEAD")
        .split(" ")
        .filter(Boolean),
      repository: requiredEnvironment("GITHUB_REPOSITORY"),
      workflowRunId: requiredEnvironment("GITHUB_RUN_ID"),
      workflowRunAttempt: Number(requiredEnvironment("GITHUB_RUN_ATTEMPT")),
      workflowRunUrl: `${requiredEnvironment("GITHUB_SERVER_URL")}/${requiredEnvironment("GITHUB_REPOSITORY")}/actions/runs/${requiredEnvironment("GITHUB_RUN_ID")}`,
      actor: requiredEnvironment("GITHUB_ACTOR"),
      eventName: requiredEnvironment("GITHUB_EVENT_NAME"),
      mainAncestryVerified: true,
      generatedAt: new Date().toISOString(),
    });
    const output = resolve(workspaceRoot, required(argumentsByName, "output"));
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, `${JSON.stringify(identity, null, 2)}\n`, "utf8");
    const githubOutput = requiredEnvironment("GITHUB_OUTPUT");
    await appendFile(
      githubOutput,
      [
        `candidate_sha=${identity.candidateSha}`,
        `short_sha=${identity.shortSha}`,
        `release_id=${identity.releaseId}`,
        `tree_sha=${identity.gitTreeSha}`,
        "",
      ].join("\n"),
      "utf8",
    );
    return;
  }

  if (command === "gate-junit") {
    const identity = await readIdentity(required(argumentsByName, "identity"));
    const results = parseGateResults(
      requiredEnvironment("RELEASE_GATE_RESULTS"),
    );
    const output = resolve(workspaceRoot, required(argumentsByName, "output"));
    await mkdir(dirname(output), { recursive: true });
    await writeFile(
      output,
      createReleaseGateJunit(contract, identity, results),
      "utf8",
    );
    return;
  }

  if (command === "qase-metadata") {
    const runId = required(argumentsByName, "run-id");
    const output = resolve(workspaceRoot, required(argumentsByName, "output"));
    await mkdir(dirname(output), { recursive: true });
    await writeFile(
      output,
      `${JSON.stringify(
        {
          project: "SAMP",
          environment: contract.qaseEnvironment,
          runId,
          runUrl: `https://app.qase.io/run/SAMP/dashboard/${runId}`,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    return;
  }

  if (command === "manifest") {
    const identity = await readIdentity(required(argumentsByName, "identity"));
    const qase = await readOptionalJson<{
      runId: string;
      runUrl: string;
    }>(resolve(workspaceRoot, required(argumentsByName, "qase")));
    const manifest = await createReleaseEvidenceManifest({
      workspaceRoot,
      contract,
      identity,
      gateResults: parseGateResults(
        requiredEnvironment("RELEASE_GATE_RESULTS"),
      ),
      ...(qase ? { qaseRunId: qase.runId, qaseRunUrl: qase.runUrl } : {}),
      generatedAt: new Date().toISOString(),
    });
    const manifestPath = resolve(workspaceRoot, contract.manifest);
    const hashPath = resolve(workspaceRoot, contract.manifestHash);
    await mkdir(dirname(manifestPath), { recursive: true });
    await writeManifestAndHash(manifest, manifestPath, hashPath);
    return;
  }

  if (command === "verify") {
    await verifyManifest(
      resolve(workspaceRoot, contract.manifest),
      resolve(workspaceRoot, contract.manifestHash),
      argumentsByName.has("require-passing"),
      workspaceRoot,
      contract,
    );
    return;
  }

  throw new Error(
    "Usage: release-evidence <identity|gate-junit|qase-metadata|manifest|verify>",
  );
}

function git(...arguments_: string[]): string {
  return execFileSync("git", arguments_, {
    cwd: workspaceRoot,
    encoding: "utf8",
  }).trim();
}

function parseArguments(values: readonly string[]): Map<string, string> {
  const parsed = new Map<string, string>();
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]!;
    if (!value.startsWith("--"))
      throw new Error(`Unexpected argument ${value}.`);
    const name = value.slice(2);
    const next = values[index + 1];
    if (!next || next.startsWith("--")) {
      parsed.set(name, "true");
    } else {
      parsed.set(name, next);
      index += 1;
    }
  }
  return parsed;
}

function required(values: ReadonlyMap<string, string>, name: string): string {
  const value = values.get(name);
  if (!value) throw new Error(`--${name} is required.`);
  return value;
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function parseGateResults(value: string): Record<string, string> {
  return JSON.parse(value) as Record<string, string>;
}

async function readIdentity(path: string): Promise<ReleaseIdentity> {
  return JSON.parse(
    await readFile(resolve(workspaceRoot, path), "utf8"),
  ) as ReleaseIdentity;
}

async function readOptionalJson<T>(path: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
