#!/usr/bin/env tsx

import { gzipSync } from "node:zlib";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import * as path from "node:path";

const WORKSPACE_ROOT = path.resolve(import.meta.dirname, "../..");
const DEFAULT_CONTRACT_PATH = path.join(
  WORKSPACE_ROOT,
  "docs/testing/experience-budgets.json",
);
const DEFAULT_REPORT_PATH = path.join(
  WORKSPACE_ROOT,
  "tmp/experience-budget-report.json",
);

export type ExperienceBudget = Readonly<{
  id: string;
  surface: string;
  directory: string;
  match: string;
  expectedMatches: number;
  maximumBytes?: number;
  maximumGzipBytes?: number;
}>;

export type ExperienceBudgetContract = Readonly<{
  version: number;
  budgets: readonly ExperienceBudget[];
}>;

export type ExperienceBudgetResult = Readonly<{
  id: string;
  surface: string;
  status: "passed" | "failed";
  matchedFiles: readonly string[];
  expectedMatches: number;
  bytes: number | null;
  gzipBytes: number | null;
  maximumBytes: number | null;
  maximumGzipBytes: number | null;
  failures: readonly string[];
}>;

export type ExperienceBudgetReport = Readonly<{
  schemaVersion: 1;
  contractVersion: number;
  candidateSha: string;
  status: "passed" | "failed";
  results: readonly ExperienceBudgetResult[];
  generatedAt: string;
}>;

export async function evaluateExperienceBudgets(
  contract: ExperienceBudgetContract,
  workspaceRoot: string,
  metadata: Readonly<{ candidateSha: string; generatedAt: string }>,
): Promise<ExperienceBudgetReport> {
  validateContract(contract);
  const root = path.resolve(workspaceRoot);
  const results: ExperienceBudgetResult[] = [];

  for (const budget of contract.budgets) {
    const directory = path.resolve(root, budget.directory);
    if (!isInside(root, directory)) {
      throw new Error(
        `Budget directory escapes workspace: ${budget.directory}`,
      );
    }

    const expression = new RegExp(budget.match);
    const files = await listFiles(directory);
    const matchedFiles = files
      .filter((file) => expression.test(file))
      .sort((left, right) => left.localeCompare(right));
    const failures: string[] = [];
    let bytes: number | null = null;
    let gzipBytes: number | null = null;

    if (matchedFiles.length !== budget.expectedMatches) {
      failures.push(
        `expected ${budget.expectedMatches} matching artifact(s), found ${matchedFiles.length}`,
      );
    } else if (budget.expectedMatches === 1 && matchedFiles.length === 1) {
      const content = await readFile(path.join(directory, matchedFiles[0]!));
      bytes = content.byteLength;
      gzipBytes = gzipSync(content, { level: 9 }).byteLength;
      if (bytes > budget.maximumBytes!) {
        failures.push(
          `raw bytes ${bytes} exceed maximum ${budget.maximumBytes!}`,
        );
      }
      if (gzipBytes > budget.maximumGzipBytes!) {
        failures.push(
          `gzip bytes ${gzipBytes} exceed maximum ${budget.maximumGzipBytes!}`,
        );
      }
    }

    results.push(
      Object.freeze({
        id: budget.id,
        surface: budget.surface,
        status: failures.length === 0 ? "passed" : "failed",
        matchedFiles: Object.freeze(
          matchedFiles.map((file) =>
            path.posix.join(budget.directory.replaceAll("\\", "/"), file),
          ),
        ),
        expectedMatches: budget.expectedMatches,
        bytes,
        gzipBytes,
        maximumBytes:
          budget.expectedMatches === 1 ? budget.maximumBytes! : null,
        maximumGzipBytes:
          budget.expectedMatches === 1 ? budget.maximumGzipBytes! : null,
        failures: Object.freeze(failures),
      }),
    );
  }

  return Object.freeze({
    schemaVersion: 1,
    contractVersion: contract.version,
    candidateSha: metadata.candidateSha,
    status: results.every(({ status }) => status === "passed")
      ? "passed"
      : "failed",
    results: Object.freeze(results),
    generatedAt: metadata.generatedAt,
  });
}

export function validateContract(contract: ExperienceBudgetContract): void {
  if (
    contract.version !== 2 ||
    !Array.isArray(contract.budgets) ||
    contract.budgets.length === 0
  ) {
    throw new Error(
      "Experience budget contract must use version 2 and define budgets.",
    );
  }
  const ids = contract.budgets.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) {
    throw new Error("Experience budget IDs must be unique.");
  }
  for (const budget of contract.budgets) {
    if (
      !budget.id.trim() ||
      !budget.surface.trim() ||
      !budget.directory.trim()
    ) {
      throw new Error(
        "Every experience budget requires an ID, surface, and directory.",
      );
    }
    if (path.isAbsolute(budget.directory)) {
      throw new Error(`Budget directory must be relative: ${budget.directory}`);
    }
    try {
      new RegExp(budget.match);
    } catch {
      throw new Error(
        `Budget ${budget.id} contains an invalid match expression.`,
      );
    }
    if (budget.expectedMatches !== 0 && budget.expectedMatches !== 1) {
      throw new Error(
        `Budget ${budget.id} must expect zero or exactly one artifact.`,
      );
    }
    if (budget.expectedMatches === 0) {
      if (
        budget.maximumBytes !== undefined ||
        budget.maximumGzipBytes !== undefined
      ) {
        throw new Error(
          `Forbidden budget ${budget.id} must not define size limits.`,
        );
      }
      continue;
    }
    for (const [label, value] of [
      ["maximumBytes", budget.maximumBytes],
      ["maximumGzipBytes", budget.maximumGzipBytes],
    ] as const) {
      if (!Number.isSafeInteger(value) || (value ?? 0) < 1) {
        throw new Error(`Budget ${budget.id} requires a positive ${label}.`);
      }
    }
  }
}

async function listFiles(directory: string): Promise<string[]> {
  try {
    if (!(await stat(directory)).isDirectory()) return [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const files: string[] = [];
  async function visit(
    current: string,
    relativeDirectory: string,
  ): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const relativePath = path.posix.join(relativeDirectory, entry.name);
      if (entry.isDirectory()) {
        await visit(path.join(current, entry.name), relativePath);
      } else if (entry.isFile()) {
        files.push(relativePath);
      }
    }
  }
  await visit(directory, "");
  return files;
}

function isInside(root: string, candidate: string): boolean {
  const relativePath = path.relative(root, candidate);
  return (
    relativePath === "" ||
    (!relativePath.startsWith(`..${path.sep}`) &&
      relativePath !== ".." &&
      !path.isAbsolute(relativePath))
  );
}

function readArgument(values: readonly string[], name: string): string | null {
  const index = values.indexOf(name);
  if (index < 0) return null;
  const value = values[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value.`);
  }
  return value;
}

function normalizeCandidateSha(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === "local" || /^[0-9a-f]{40}$/.test(normalized)) {
    return normalized;
  }
  throw new Error(
    "Candidate SHA must be local or exactly 40 hexadecimal characters.",
  );
}

export function resolveWorkspacePath(
  value: string,
  workspaceRoot = WORKSPACE_ROOT,
): string {
  return path.resolve(workspaceRoot, value);
}

async function main(): Promise<void> {
  const rawArguments = process.argv.slice(2);
  const args = rawArguments[0] === "--" ? rawArguments.slice(1) : rawArguments;
  const contractPath = resolveWorkspacePath(
    readArgument(args, "--contract") ?? DEFAULT_CONTRACT_PATH,
  );
  const reportPath = resolveWorkspacePath(
    readArgument(args, "--output") ?? DEFAULT_REPORT_PATH,
  );
  const contract = JSON.parse(
    await readFile(contractPath, "utf8"),
  ) as ExperienceBudgetContract;
  const report = await evaluateExperienceBudgets(contract, WORKSPACE_ROOT, {
    candidateSha: normalizeCandidateSha(
      readArgument(args, "--candidate-sha") ??
        process.env.GITHUB_SHA ??
        "local",
    ),
    generatedAt: new Date().toISOString(),
  });

  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  for (const result of report.results) {
    const measured =
      result.expectedMatches === 0
        ? `${result.matchedFiles.length} forbidden artifact(s)`
        : result.bytes === null
          ? "artifact mismatch"
          : `${result.bytes} B raw / ${result.gzipBytes} B gzip`;
    console.log(
      `${result.status === "passed" ? "PASS" : "FAIL"} ${result.id}: ${measured}`,
    );
    for (const failure of result.failures) console.error(`  ${failure}`);
  }
  console.log(`Experience budget report: ${reportPath}`);
  if (report.status !== "passed") process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
