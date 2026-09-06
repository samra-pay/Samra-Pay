import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { basename, relative, resolve } from "node:path";

export type ReleaseGate = Readonly<{
  id: string;
  title: string;
  includeInQase: boolean;
}>;

export type ReleaseEvidenceContract = Readonly<{
  version: number;
  workflow: string;
  manifest: string;
  manifestHash: string;
  retentionDays: number;
  qaseEnvironment: string;
  qaseReporting: "optional";
  requiredGates: readonly ReleaseGate[];
  requiredEvidenceFiles: readonly string[];
  boundaries: readonly string[];
}>;

export type ReleaseIdentity = Readonly<{
  schemaVersion: 1;
  releaseId: string;
  candidateSha: string;
  shortSha: string;
  gitTreeSha: string;
  parentShas: readonly string[];
  repository: string;
  workflowRunId: string;
  workflowRunAttempt: number;
  workflowRunUrl: string;
  actor: string;
  eventName: string;
  mainAncestryVerified: true;
  generatedAt: string;
}>;

type EvidenceFile = Readonly<{
  path: string;
  bytes: number;
  sha256: string;
}>;

export type QaseReporting = Readonly<{
  enabled: boolean;
  outcomes: Readonly<Record<string, string>>;
}>;

export type ReleaseEvidenceManifest = Readonly<{
  schemaVersion: 2;
  qaseReporting: QaseReporting;
  releaseId: string;
  candidateSha: string;
  gitTreeSha: string;
  parentShas: readonly string[];
  repository: string;
  workflowRunId: string;
  workflowRunAttempt: number;
  workflowRunUrl: string;
  qaseEnvironment: string;
  qaseRunId: string | null;
  qaseRunUrl: string | null;
  gateResults: Readonly<Record<string, string>>;
  evidenceFiles: readonly EvidenceFile[];
  missingEvidenceFiles: readonly string[];
  overallStatus: "passed" | "failed";
  boundaries: readonly string[];
  generatedAt: string;
}>;

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const ALLOWED_GATE_RESULTS = new Set([
  "success",
  "failure",
  "cancelled",
  "skipped",
  "missing",
]);

export function splitReleaseEvidenceInvocation(
  values: readonly string[],
): Readonly<{ command: string | undefined; rawArguments: readonly string[] }> {
  const normalized = values[0] === "--" ? values.slice(1) : [...values];
  const [command, ...rawArguments] = normalized;
  return Object.freeze({
    command,
    rawArguments: Object.freeze(rawArguments),
  });
}

export function normalizeCandidateSha(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!SHA_PATTERN.test(normalized)) {
    throw new Error("Candidate SHA must be exactly 40 hexadecimal characters.");
  }
  return normalized;
}

export function buildReleaseIdentity(
  input: Omit<ReleaseIdentity, "schemaVersion" | "releaseId" | "shortSha">,
): ReleaseIdentity {
  const candidateSha = normalizeCandidateSha(input.candidateSha);
  const gitTreeSha = normalizeCandidateSha(input.gitTreeSha);
  const parentShas = input.parentShas.map(normalizeCandidateSha);
  if (!input.repository.trim() || !input.workflowRunId.trim()) {
    throw new Error("Repository and workflow run ID are required.");
  }
  if (
    !Number.isSafeInteger(input.workflowRunAttempt) ||
    input.workflowRunAttempt < 1
  ) {
    throw new Error("Workflow run attempt must be a positive integer.");
  }
  const shortSha = candidateSha.slice(0, 12);
  return Object.freeze({
    schemaVersion: 1,
    releaseId: `rc-${shortSha}`,
    candidateSha,
    shortSha,
    gitTreeSha,
    parentShas: Object.freeze(parentShas),
    repository: input.repository,
    workflowRunId: input.workflowRunId,
    workflowRunAttempt: input.workflowRunAttempt,
    workflowRunUrl: input.workflowRunUrl,
    actor: input.actor,
    eventName: input.eventName,
    mainAncestryVerified: true,
    generatedAt: input.generatedAt,
  });
}

export function normalizeGateResults(
  contract: ReleaseEvidenceContract,
  results: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  return Object.freeze(
    Object.fromEntries(
      contract.requiredGates.map(({ id }) => {
        const result = results[id] ?? "missing";
        if (!ALLOWED_GATE_RESULTS.has(result)) {
          throw new Error(`Gate ${id} has unsupported result ${result}.`);
        }
        return [id, result];
      }),
    ),
  );
}

export function createReleaseGateJunit(
  contract: ReleaseEvidenceContract,
  identity: ReleaseIdentity,
  results: Readonly<Record<string, string>>,
): string {
  const normalized = normalizeGateResults(contract, results);
  const gates = contract.requiredGates.filter(
    ({ includeInQase }) => includeInQase,
  );
  const failures = gates.filter(
    ({ id }) => normalized[id] !== "success",
  ).length;
  const cases = gates.map(({ id, title }) => {
    const result = normalized[id]!;
    const failure =
      result === "success"
        ? ""
        : `<failure message="${xmlEscape(`Gate ${id} finished ${result}`)}"/>`;
    return `    <testcase classname="Release Candidate Gates" name="${xmlEscape(title)}">${failure}</testcase>`;
  });
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    `<testsuites name="Release Candidate" tests="${gates.length}" failures="${failures}" skipped="0">`,
    `  <testsuite name="Release Candidate Gates" tests="${gates.length}" failures="${failures}" skipped="0">`,
    "    <properties>",
    `      <property name="release_id" value="${xmlEscape(identity.releaseId)}"/>`,
    `      <property name="candidate_sha" value="${identity.candidateSha}"/>`,
    "    </properties>",
    ...cases,
    "  </testsuite>",
    "</testsuites>",
    "",
  ].join("\n");
}

export async function createReleaseEvidenceManifest(
  input: Readonly<{
    workspaceRoot: string;
    contract: ReleaseEvidenceContract;
    identity: ReleaseIdentity;
    gateResults: Readonly<Record<string, string>>;
    qaseReporting: QaseReporting;
    qaseRunId?: string;
    qaseRunUrl?: string;
    generatedAt: string;
  }>,
): Promise<ReleaseEvidenceManifest> {
  if (
    input.contract.version !== 2 ||
    input.contract.qaseReporting !== "optional"
  ) {
    throw new Error(
      "Release evidence requires the version 2 optional-reporting contract.",
    );
  }
  validateQaseReporting(
    input.qaseReporting,
    input.qaseRunId ?? null,
    input.qaseRunUrl ?? null,
  );
  const root = resolve(input.workspaceRoot);
  const gateResults = normalizeGateResults(input.contract, input.gateResults);
  const evidenceFiles: EvidenceFile[] = [];
  const missingEvidenceFiles: string[] = [];
  for (const relativePath of input.contract.requiredEvidenceFiles) {
    const absolutePath = resolve(root, relativePath);
    if (!isInside(root, absolutePath)) {
      throw new Error(`Evidence path escapes workspace: ${relativePath}`);
    }
    try {
      const [content, metadata] = await Promise.all([
        readFile(absolutePath),
        stat(absolutePath),
      ]);
      if (!metadata.isFile() || metadata.size === 0) {
        missingEvidenceFiles.push(relativePath);
        continue;
      }
      evidenceFiles.push(
        Object.freeze({
          path: relative(root, absolutePath).replaceAll("\\", "/"),
          bytes: metadata.size,
          sha256: createHash("sha256").update(content).digest("hex"),
        }),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        missingEvidenceFiles.push(relativePath);
      } else {
        throw error;
      }
    }
  }
  const gatesPassed = input.contract.requiredGates.every(
    ({ id }) => gateResults[id] === "success",
  );
  return Object.freeze({
    schemaVersion: 2,
    qaseReporting: input.qaseReporting,
    releaseId: input.identity.releaseId,
    candidateSha: input.identity.candidateSha,
    gitTreeSha: input.identity.gitTreeSha,
    parentShas: input.identity.parentShas,
    repository: input.identity.repository,
    workflowRunId: input.identity.workflowRunId,
    workflowRunAttempt: input.identity.workflowRunAttempt,
    workflowRunUrl: input.identity.workflowRunUrl,
    qaseEnvironment: input.contract.qaseEnvironment,
    qaseRunId: input.qaseRunId ?? null,
    qaseRunUrl: input.qaseRunUrl ?? null,
    gateResults,
    evidenceFiles: Object.freeze(evidenceFiles),
    missingEvidenceFiles: Object.freeze(missingEvidenceFiles),
    overallStatus:
      gatesPassed && missingEvidenceFiles.length === 0 ? "passed" : "failed",
    boundaries: input.contract.boundaries,
    generatedAt: input.generatedAt,
  });
}

export async function writeManifestAndHash(
  manifest: ReleaseEvidenceManifest,
  manifestPath: string,
  hashPath: string,
): Promise<string> {
  const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
  const hash = createHash("sha256").update(serialized).digest("hex");
  await writeFile(manifestPath, serialized, "utf8");
  await writeFile(hashPath, `${hash}  ${basename(manifestPath)}\n`, "utf8");
  return hash;
}

export async function verifyManifest(
  manifestPath: string,
  hashPath: string,
  requirePassing: boolean,
  workspaceRoot?: string,
  contract?: ReleaseEvidenceContract,
): Promise<ReleaseEvidenceManifest> {
  const [serialized, hashRecord] = await Promise.all([
    readFile(manifestPath, "utf8"),
    readFile(hashPath, "utf8"),
  ]);
  const expectedHash = hashRecord.trim().split(/\s+/)[0];
  const actualHash = createHash("sha256").update(serialized).digest("hex");
  if (expectedHash !== actualHash) {
    throw new Error("Release evidence manifest hash does not match.");
  }
  const manifest = JSON.parse(serialized) as ReleaseEvidenceManifest;
  if (
    manifest.schemaVersion !== 2 ||
    !SHA_PATTERN.test(manifest.candidateSha) ||
    manifest.releaseId !== `rc-${manifest.candidateSha.slice(0, 12)}`
  ) {
    throw new Error("Release evidence manifest identity is invalid.");
  }
  validateQaseReporting(
    manifest.qaseReporting,
    manifest.qaseRunId,
    manifest.qaseRunUrl,
  );
  if (contract) {
    const expectedGates = contract.requiredGates.map(({ id }) => id);
    const actualGates = Object.keys(manifest.gateResults);
    const recordedEvidence = [
      ...manifest.evidenceFiles.map(({ path }) => path),
      ...manifest.missingEvidenceFiles,
    ];
    if (
      contract.version !== 2 ||
      contract.qaseReporting !== "optional" ||
      !haveSameUniqueMembers(actualGates, expectedGates) ||
      !haveSameUniqueMembers(
        recordedEvidence,
        contract.requiredEvidenceFiles,
      ) ||
      manifest.qaseEnvironment !== contract.qaseEnvironment ||
      JSON.stringify(manifest.boundaries) !==
        JSON.stringify(contract.boundaries)
    ) {
      throw new Error("Release evidence manifest does not match its contract.");
    }
  }
  if (workspaceRoot) {
    const root = resolve(workspaceRoot);
    for (const evidence of manifest.evidenceFiles) {
      const absolutePath = resolve(root, evidence.path);
      if (!isInside(root, absolutePath)) {
        throw new Error(`Evidence path escapes workspace: ${evidence.path}`);
      }
      const [content, metadata] = await Promise.all([
        readFile(absolutePath),
        stat(absolutePath),
      ]);
      const actualEvidenceHash = createHash("sha256")
        .update(content)
        .digest("hex");
      if (
        !metadata.isFile() ||
        metadata.size !== evidence.bytes ||
        actualEvidenceHash !== evidence.sha256
      ) {
        throw new Error(
          `Evidence file changed after hashing: ${evidence.path}`,
        );
      }
    }
  }
  if (
    requirePassing &&
    (manifest.overallStatus !== "passed" ||
      Object.values(manifest.gateResults).some(
        (result) => result !== "success",
      ) ||
      manifest.missingEvidenceFiles.length > 0)
  ) {
    const failedGates = Object.entries(manifest.gateResults)
      .filter(([, result]) => result !== "success")
      .map(([gate, result]) => `${gate}=${result}`);
    throw new Error(
      `Release candidate failed: ${failedGates.join(", ") || "no failed gate recorded"}; ${manifest.missingEvidenceFiles.length} evidence files missing.`,
    );
  }
  return manifest;
}

export function validateQaseReporting(
  reporting: QaseReporting,
  runId: string | null,
  runUrl: string | null,
): void {
  const ids = ["qase_create", "qase_upload", "qase_complete"];
  if (
    !reporting ||
    typeof reporting.enabled !== "boolean" ||
    !haveSameUniqueMembers(Object.keys(reporting.outcomes ?? {}), ids) ||
    !Object.values(reporting.outcomes).every((value) =>
      ALLOWED_GATE_RESULTS.has(value),
    )
  ) {
    throw new Error("Qase reporting outcomes are invalid.");
  }
  const outcomes = reporting.outcomes;
  const hasRun = runId !== null;
  if (
    (hasRun &&
      (typeof runId !== "string" ||
        !/^[1-9][0-9]*$/.test(runId) ||
        runUrl !== `https://app.qase.io/run/SAMP/dashboard/${runId}`)) ||
    (hasRun && ["skipped", "missing"].includes(outcomes.qase_create!)) ||
    (!hasRun && runUrl !== null) ||
    (!reporting.enabled &&
      (hasRun || ids.some((id) => outcomes[id] !== "skipped"))) ||
    // A successful action exit can still have no run ID after a Qase API error.
    // Preserve the reported outcome; null identity and skipped downstream steps
    // prevent treating that process exit as proof of external delivery.
    (!hasRun &&
      (outcomes.qase_upload !== "skipped" ||
        outcomes.qase_complete !== "skipped"))
  ) {
    throw new Error("Qase reporting identity or outcomes are inconsistent.");
  }
}

export async function readContract(
  path: string,
): Promise<ReleaseEvidenceContract> {
  return JSON.parse(await readFile(path, "utf8")) as ReleaseEvidenceContract;
}

function isInside(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path === "" || (!path.startsWith("..") && !path.startsWith("/"));
}

function haveSameUniqueMembers(
  actual: readonly string[],
  expected: readonly string[],
): boolean {
  if (
    actual.length !== expected.length ||
    new Set(actual).size !== actual.length ||
    new Set(expected).size !== expected.length
  ) {
    return false;
  }
  const expectedMembers = new Set(expected);
  return actual.every((value) => expectedMembers.has(value));
}

function xmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
