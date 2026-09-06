import { validateOptionalQaseReporting } from "./qase-reporting.mjs";
import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, posix, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const RELEASE_EVIDENCE_MANIFEST =
  "artifacts/release-candidate/release-evidence-manifest.json";
export const RELEASE_EVIDENCE_MANIFEST_HASH =
  "artifacts/release-candidate/release-evidence-manifest.sha256";
export const RELEASE_IDENTITY_EVIDENCE =
  "artifacts/release-candidate/release-candidate-identity.json";
export const RELEASE_QASE_EVIDENCE =
  "artifacts/release-candidate/qase-run.json";
export const RELEASE_GATE_EVIDENCE =
  "artifacts/release-candidate/release-gates.xml";
export const RELEASE_RECOVERY_EVIDENCE = Object.freeze([
  "artifacts/api-server/test-results/weekly-backup-restore.xml",
  "artifacts/api-server/test-results/weekly-backup-restore.json",
]);

const SOURCE_REPOSITORY = "samra-pay/Samra-Pay";
const SOURCE_BRANCH = "main";
const RELEASE_WORKFLOW = ".github/workflows/release-candidate.yml";
const RELEASE_WORKFLOW_NAME = "Immutable release candidate";
const RELEASE_POSTGRES_CLIENT_IMAGE =
  "postgres:16@sha256:f1c3376c26f2609ab9f29f71f824103fe2fcd8ee0346485cb6122a4f93df6f94";
const QASE_PROJECT = "SAMP";
const QASE_ENVIRONMENT = "github-ci-postgres";
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const INTEGER_PATTERN = /^[1-9][0-9]*$/;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function normalizeCandidateSha(value) {
  const normalized = value?.trim().toLowerCase();
  assert(
    SHA_PATTERN.test(normalized ?? ""),
    "Candidate SHA must be a full lowercase Git SHA",
  );
  return normalized;
}

function normalizePositiveInteger(value, label) {
  const normalized = String(value ?? "").trim();
  assert(
    INTEGER_PATTERN.test(normalized),
    `${label} must be a positive integer`,
  );
  const parsed = Number.parseInt(normalized, 10);
  assert(Number.isSafeInteger(parsed), `${label} must be a safe integer`);
  return { string: normalized, number: parsed };
}

function normalizeEvidencePath(value, label) {
  assert(typeof value === "string" && value.length > 0, `${label} is required`);
  assert(!value.includes("\\"), `${label} must use POSIX separators`);
  assert(!value.startsWith("/"), `${label} must be workspace-relative`);
  assert(posix.normalize(value) === value, `${label} is not normalized`);
  assert(
    !value.split("/").includes(".."),
    `${label} escapes the evidence root`,
  );
  assert(
    value.startsWith("artifacts/release-candidate/") ||
      value.startsWith("artifacts/api-server/test-results/"),
    `${label} is outside the release evidence allowlist`,
  );
  return value;
}

function haveSameMembersInOrder(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function isInside(root, candidate) {
  const path = relative(root, candidate);
  return path === "" || (!path.startsWith("..") && !path.startsWith("/"));
}

async function readRegularFileInside(root, relativePath) {
  const normalized = normalizeEvidencePath(relativePath, "Evidence path");
  const absolutePath = resolve(root, normalized);
  assert(
    isInside(root, absolutePath),
    `Evidence path escapes root: ${normalized}`,
  );
  const metadata = await lstat(absolutePath);
  assert(
    metadata.isFile() && !metadata.isSymbolicLink(),
    `Evidence is not a regular file: ${normalized}`,
  );
  const resolvedRoot = await realpath(root);
  const resolvedFile = await realpath(absolutePath);
  assert(
    isInside(resolvedRoot, resolvedFile),
    `Evidence resolves outside root: ${normalized}`,
  );
  const content = await readFile(resolvedFile);
  assert(content.length > 0, `Evidence file is empty: ${normalized}`);
  return { content, metadata, absolutePath: resolvedFile };
}

async function enumerateArtifactFiles(root) {
  const files = [];

  async function visit(directory) {
    const names = await readdir(directory);
    names.sort();
    for (const name of names) {
      const absolutePath = resolve(directory, name);
      assert(
        isInside(root, absolutePath),
        "Downloaded release artifact contains a path escape",
      );
      const metadata = await lstat(absolutePath);
      const relativePath = relative(root, absolutePath);
      assert(
        relativePath.length > 0 &&
          !relativePath.startsWith("..") &&
          !relativePath.startsWith("/") &&
          !relativePath.includes("\\") &&
          posix.normalize(relativePath) === relativePath,
        "Downloaded release artifact contains an invalid path",
      );
      assert(
        !metadata.isSymbolicLink(),
        `Downloaded release artifact contains a symlink: ${relativePath}`,
      );
      const resolvedPath = await realpath(absolutePath);
      assert(
        isInside(root, resolvedPath),
        `Downloaded release artifact resolves outside root: ${relativePath}`,
      );
      if (metadata.isDirectory()) {
        await visit(resolvedPath);
      } else if (metadata.isFile()) {
        files.push(relativePath);
      } else {
        throw new Error(
          `Downloaded release artifact contains a special file: ${relativePath}`,
        );
      }
    }
  }

  await visit(root);
  return files.sort();
}

function parseJson(content, label) {
  try {
    return JSON.parse(content.toString("utf8"));
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
}

function validateContract(contract) {
  assert(
    contract?.version === 2 &&
      contract.qaseReporting === "optional" &&
      contract.workflow === RELEASE_WORKFLOW &&
      contract.manifest === RELEASE_EVIDENCE_MANIFEST &&
      contract.manifestHash === RELEASE_EVIDENCE_MANIFEST_HASH &&
      contract.qaseEnvironment === QASE_ENVIRONMENT,
    "Release evidence contract identity drifted",
  );
  assert(
    Array.isArray(contract.requiredGates) &&
      contract.requiredGates.length > 0 &&
      new Set(contract.requiredGates.map(({ id }) => id)).size ===
        contract.requiredGates.length,
    "Release gate contract is invalid",
  );
  assert(
    haveSameMembersInOrder(
      contract.requiredGates.map(({ id }) => id),
      [
        "identity",
        "security",
        "quality",
        "commercial",
        "migrations",
        "postgres_persistence",
        "postgres_http",
        "resilience",
        "recovery",
        "performance",
      ],
    ) &&
      contract.requiredGates.every(
        ({ includeInQase }) => includeInQase === true,
      ),
    "Release contract must preserve all ten engineering gates",
  );
  assert(
    contract.requiredGates.some(({ id }) => id === "resilience"),
    "Release contract must include the resilience gate",
  );
  assert(
    contract.requiredGates.some(({ id }) => id === "recovery"),
    "Release contract must include the recovery gate",
  );
  assert(
    Array.isArray(contract.requiredEvidenceFiles) &&
      contract.requiredEvidenceFiles.length > 0 &&
      new Set(contract.requiredEvidenceFiles).size ===
        contract.requiredEvidenceFiles.length,
    "Release evidence path contract is invalid",
  );
  for (const path of contract.requiredEvidenceFiles) {
    normalizeEvidencePath(path, "Contract evidence path");
  }
  for (const path of RELEASE_RECOVERY_EVIDENCE) {
    assert(
      contract.requiredEvidenceFiles.includes(path),
      `Release contract is missing recovery evidence: ${path}`,
    );
  }
  return contract;
}

export function validateReleaseCandidateRunMetadata(metadata, input) {
  const candidateSha = normalizeCandidateSha(input.candidateSha);
  const runId = normalizePositiveInteger(input.releaseRunId, "Release run ID");
  const runAttempt = normalizePositiveInteger(
    input.releaseRunAttempt,
    "Release run attempt",
  );
  const expectedRunUrl = `https://github.com/${SOURCE_REPOSITORY}/actions/runs/${runId.string}`;
  assert(
    String(metadata?.id) === runId.string &&
      metadata.run_attempt === runAttempt.number &&
      metadata.name === RELEASE_WORKFLOW_NAME &&
      metadata.path === RELEASE_WORKFLOW &&
      metadata.event === "workflow_dispatch" &&
      metadata.head_branch === SOURCE_BRANCH &&
      metadata.head_sha === candidateSha &&
      metadata.status === "completed" &&
      metadata.conclusion === "success" &&
      metadata.html_url === expectedRunUrl &&
      metadata.repository?.full_name === SOURCE_REPOSITORY &&
      metadata.head_repository?.full_name === SOURCE_REPOSITORY,
    "GitHub release-candidate run identity or result drifted",
  );
  return Object.freeze({
    repository: SOURCE_REPOSITORY,
    workflow: RELEASE_WORKFLOW,
    workflowName: RELEASE_WORKFLOW_NAME,
    runId: runId.string,
    runAttempt: runAttempt.number,
    runUrl: expectedRunUrl,
    candidateSha,
    githubSha: metadata.head_sha,
    status: "completed",
    conclusion: "success",
  });
}

async function fetchReleaseCandidateRunMetadata(input) {
  const token = process.env.GITHUB_TOKEN?.trim();
  assert(token, "GITHUB_TOKEN is required to read the release workflow run");
  const runId = normalizePositiveInteger(input.releaseRunId, "Release run ID");
  const runAttempt = normalizePositiveInteger(
    input.releaseRunAttempt,
    "Release run attempt",
  );
  const endpoint = `https://api.github.com/repos/${SOURCE_REPOSITORY}/actions/runs/${runId.string}/attempts/${runAttempt.string}`;
  const response = await fetch(endpoint, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "samra-release-candidate-verifier",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  assert(
    response.ok,
    `Unable to read release workflow run metadata: HTTP ${response.status}`,
  );
  return response.json();
}

function validateIdentity(identity, manifest, run) {
  assert(
    identity?.schemaVersion === 1 &&
      identity.releaseId === manifest.releaseId &&
      identity.candidateSha === manifest.candidateSha &&
      identity.shortSha === manifest.candidateSha.slice(0, 12) &&
      identity.gitTreeSha === manifest.gitTreeSha &&
      JSON.stringify(identity.parentShas) ===
        JSON.stringify(manifest.parentShas) &&
      identity.repository === SOURCE_REPOSITORY &&
      identity.workflowRunId === run.runId &&
      identity.workflowRunAttempt === run.runAttempt &&
      identity.workflowRunUrl === run.runUrl &&
      identity.eventName === "workflow_dispatch" &&
      identity.mainAncestryVerified === true &&
      typeof identity.actor === "string" &&
      identity.actor.length > 0 &&
      new Date(identity.generatedAt).toISOString() === identity.generatedAt,
    "Release candidate identity evidence drifted",
  );
}

function validateQase(qase, manifest) {
  const reporting = manifest.qaseReporting;
  assert(
    qase?.schemaVersion === 2 &&
      qase.project === QASE_PROJECT &&
      qase.environment === QASE_ENVIRONMENT &&
      JSON.stringify(qase.reporting) === JSON.stringify(reporting) &&
      qase.runId === manifest.qaseRunId &&
      qase.runUrl === manifest.qaseRunUrl,
    "Release Qase evidence drifted",
  );
  validateOptionalQaseReporting(reporting, qase.runId, qase.runUrl);
}

function validateGateJunit(source, contract, manifest) {
  const qaseGateCount = contract.requiredGates.filter(
    ({ includeInQase }) => includeInQase,
  ).length;
  assert(
    source.includes(
      `<testsuites name="Release Candidate" tests="${qaseGateCount}" failures="0" skipped="0">`,
    ) &&
      source.includes(
        `<property name="release_id" value="${manifest.releaseId}"/>`,
      ) &&
      source.includes(
        `<property name="candidate_sha" value="${manifest.candidateSha}"/>`,
      ) &&
      !source.includes("<failure"),
    "Release gate JUnit does not prove every engineering gate passed",
  );
}

function validateRecoveryJson(recovery, run) {
  const expectedProvenanceKeys = [
    "executor",
    "repository",
    "eventName",
    "candidateSha",
    "githubSha",
    "workflowRunId",
    "workflowRunAttempt",
    "workflowRef",
  ].sort();
  const actualProvenanceKeys = Object.keys(recovery?.provenance ?? {}).sort();
  const expectedToolingKeys = ["clientImage", "clientMode"].sort();
  const actualToolingKeys = Object.keys(recovery?.tooling ?? {}).sort();
  const expectedWorkflowRef = `${SOURCE_REPOSITORY}/${RELEASE_WORKFLOW}@refs/heads/${SOURCE_BRANCH}`;
  assert(
    recovery?.schemaVersion === 1 &&
      recovery.kind === "samra-synthetic-postgres-backup-restore" &&
      recovery.result === "pass" &&
      haveSameMembersInOrder(actualProvenanceKeys, expectedProvenanceKeys) &&
      recovery.provenance.executor === "github-actions" &&
      recovery.provenance.repository === SOURCE_REPOSITORY &&
      recovery.provenance.eventName === "workflow_dispatch" &&
      recovery.provenance.workflowRef === expectedWorkflowRef &&
      recovery.provenance.candidateSha === run.candidateSha &&
      recovery.provenance.githubSha === run.githubSha &&
      recovery.provenance.workflowRunId === run.runId &&
      recovery.provenance.workflowRunAttempt === run.runAttempt &&
      haveSameMembersInOrder(actualToolingKeys, expectedToolingKeys) &&
      recovery.tooling.clientMode === "digest-pinned-container" &&
      recovery.tooling.clientImage === RELEASE_POSTGRES_CLIENT_IMAGE &&
      recovery.boundaries?.localhostOnly === true &&
      recovery.boundaries?.disposableDatabasesOnly === true &&
      recovery.boundaries?.syntheticDataOnly === true &&
      recovery.boundaries?.cloudAccess === false &&
      recovery.boundaries?.customerData === false &&
      recovery.boundaries?.dumpRetained === false &&
      recovery.versions?.postgres?.major === 16 &&
      recovery.versions?.pgDump?.major === 16 &&
      recovery.versions?.pgRestore?.major === 16 &&
      recovery.versions.postgres.major === recovery.versions.pgDump.major &&
      recovery.versions.postgres.major === recovery.versions.pgRestore.major &&
      recovery.dump?.retained === false &&
      recovery.dump?.maximumBytes === 67_108_864 &&
      Number.isSafeInteger(recovery.dump?.bytes) &&
      recovery.dump.bytes > 0 &&
      recovery.dump.bytes <= recovery.dump.maximumBytes &&
      HASH_PATTERN.test(recovery.dump?.sha256 ?? "") &&
      recovery.comparison?.allTableFingerprintsMatch === true &&
      recovery.comparison?.sequenceStateMatches === true &&
      recovery.comparison?.triggerDefinitionsMatch === true &&
      recovery.comparison?.recoveryInvariantsMatch === true &&
      recovery.comparison?.migrationHistoryMatchesCheckedInSql === true &&
      Number.isSafeInteger(recovery.migrations?.count) &&
      recovery.migrations.count > 0 &&
      recovery.migrations.count === recovery.migrations.entries?.length &&
      typeof recovery.migrations.currentTag === "string" &&
      recovery.migrations.currentTag.length > 0 &&
      HASH_PATTERN.test(recovery.migrations.sha256 ?? "") &&
      recovery.invariants?.migrationCount === recovery.migrations.count &&
      recovery.invariants?.currentMigrationTag ===
        recovery.migrations.currentTag &&
      recovery.invariants?.unbalancedJournalCount === 0 &&
      recovery.invariants?.currencyImbalanceCount === 0 &&
      recovery.invariants?.balanceProjectionDriftCount === 0 &&
      new Date(recovery.generatedAt).toISOString() === recovery.generatedAt,
    "Release recovery evidence drifted",
  );
}

export async function verifyReleaseCandidateEvidence(input) {
  const candidateSha = normalizeCandidateSha(input.candidateSha);
  const evidenceRoot = resolve(input.evidenceRoot);
  const rootMetadata = await lstat(evidenceRoot);
  assert(
    rootMetadata.isDirectory() && !rootMetadata.isSymbolicLink(),
    "Release evidence root must be a real directory",
  );
  const resolvedEvidenceRoot = await realpath(evidenceRoot);
  const contract = validateContract(
    JSON.parse(await readFile(resolve(input.contractPath), "utf8")),
  );
  const expectedArtifactFiles = [
    ...contract.requiredEvidenceFiles,
    RELEASE_EVIDENCE_MANIFEST,
    RELEASE_EVIDENCE_MANIFEST_HASH,
  ].sort();
  assert(
    new Set(expectedArtifactFiles).size === expectedArtifactFiles.length,
    "Release artifact contract contains duplicate paths",
  );
  const artifactFiles = await enumerateArtifactFiles(resolvedEvidenceRoot);
  assert(
    haveSameMembersInOrder(artifactFiles, expectedArtifactFiles),
    "Downloaded release artifact file set drifted",
  );
  const runMetadata = input.runMetadata
    ? input.runMetadata
    : input.runMetadataPath
      ? JSON.parse(await readFile(resolve(input.runMetadataPath), "utf8"))
      : await fetchReleaseCandidateRunMetadata(input);
  const run = validateReleaseCandidateRunMetadata(runMetadata, input);

  const [{ content: manifestBytes }, { content: hashBytes }] =
    await Promise.all([
      readRegularFileInside(resolvedEvidenceRoot, RELEASE_EVIDENCE_MANIFEST),
      readRegularFileInside(
        resolvedEvidenceRoot,
        RELEASE_EVIDENCE_MANIFEST_HASH,
      ),
    ]);
  const expectedManifestHash = createHash("sha256")
    .update(manifestBytes)
    .digest("hex");
  assert(
    hashBytes.toString("utf8") ===
      `${expectedManifestHash}  ${basename(RELEASE_EVIDENCE_MANIFEST)}\n`,
    "Release evidence manifest SHA-256 sidecar drifted",
  );
  const manifest = parseJson(manifestBytes, "Release evidence manifest");
  assert(
    manifest?.schemaVersion === 2 &&
      manifest.releaseId === `rc-${candidateSha.slice(0, 12)}` &&
      manifest.candidateSha === candidateSha &&
      SHA_PATTERN.test(manifest.gitTreeSha) &&
      Array.isArray(manifest.parentShas) &&
      manifest.parentShas.every((sha) => SHA_PATTERN.test(sha)) &&
      manifest.repository === SOURCE_REPOSITORY &&
      manifest.workflowRunId === run.runId &&
      manifest.workflowRunAttempt === run.runAttempt &&
      manifest.workflowRunUrl === run.runUrl &&
      manifest.qaseEnvironment === QASE_ENVIRONMENT &&
      manifest.overallStatus === "passed" &&
      Array.isArray(manifest.missingEvidenceFiles) &&
      manifest.missingEvidenceFiles.length === 0 &&
      new Date(manifest.generatedAt).toISOString() === manifest.generatedAt,
    "Release evidence manifest identity or status drifted",
  );

  const expectedGateIds = contract.requiredGates.map(({ id }) => id);
  assert(
    manifest.gateResults &&
      haveSameMembersInOrder(
        Object.keys(manifest.gateResults),
        expectedGateIds,
      ) &&
      expectedGateIds.every((id) => manifest.gateResults[id] === "success") &&
      manifest.gateResults.resilience === "success" &&
      manifest.gateResults.recovery === "success",
    "Release evidence does not prove every contracted gate passed",
  );
  assert(
    Array.isArray(manifest.evidenceFiles) &&
      haveSameMembersInOrder(
        manifest.evidenceFiles.map(({ path }) => path),
        contract.requiredEvidenceFiles,
      ),
    "Release evidence file set or order drifted",
  );

  const evidenceByPath = new Map();
  for (const entry of manifest.evidenceFiles) {
    const path = normalizeEvidencePath(entry.path, "Manifest evidence path");
    assert(
      !evidenceByPath.has(path) &&
        Number.isSafeInteger(entry.bytes) &&
        entry.bytes > 0 &&
        HASH_PATTERN.test(entry.sha256),
      `Release evidence descriptor is invalid: ${path}`,
    );
    const { content, metadata } = await readRegularFileInside(
      resolvedEvidenceRoot,
      path,
    );
    const actualHash = createHash("sha256").update(content).digest("hex");
    assert(
      metadata.size === entry.bytes && actualHash === entry.sha256,
      `Release evidence changed after hashing: ${path}`,
    );
    evidenceByPath.set(path, Object.freeze({ path, sha256: actualHash }));
  }

  const identity = parseJson(
    (
      await readRegularFileInside(
        resolvedEvidenceRoot,
        RELEASE_IDENTITY_EVIDENCE,
      )
    ).content,
    "Release candidate identity",
  );
  validateIdentity(identity, manifest, run);
  const qase = parseJson(
    (await readRegularFileInside(resolvedEvidenceRoot, RELEASE_QASE_EVIDENCE))
      .content,
    "Release Qase evidence",
  );
  validateQase(qase, manifest);
  validateGateJunit(
    (
      await readRegularFileInside(resolvedEvidenceRoot, RELEASE_GATE_EVIDENCE)
    ).content.toString("utf8"),
    contract,
    manifest,
  );
  validateRecoveryJson(
    parseJson(
      (
        await readRegularFileInside(
          resolvedEvidenceRoot,
          RELEASE_RECOVERY_EVIDENCE[1],
        )
      ).content,
      "Release recovery evidence",
    ),
    run,
  );

  return Object.freeze({
    releaseId: manifest.releaseId,
    candidateSha,
    gitTreeSha: manifest.gitTreeSha,
    repository: SOURCE_REPOSITORY,
    workflow: RELEASE_WORKFLOW,
    workflowName: RELEASE_WORKFLOW_NAME,
    workflowRunId: run.runId,
    workflowRunAttempt: run.runAttempt,
    workflowRunUrl: run.runUrl,
    artifactName: `samra-${manifest.releaseId}-run-${run.runId}-attempt-${run.runAttempt}`,
    evidenceManifestPath: RELEASE_EVIDENCE_MANIFEST,
    evidenceManifestSha256: expectedManifestHash,
    overallStatus: "passed",
    requiredGatesPassed: true,
    recoveryEvidence: Object.freeze(
      RELEASE_RECOVERY_EVIDENCE.map((path) => evidenceByPath.get(path)),
    ),
  });
}

function parseCliArguments(values) {
  const options = {};
  for (let index = 0; index < values.length; index += 1) {
    const key = values[index];
    const value = values[index + 1];
    assert(
      key?.startsWith("--") && value !== undefined,
      `Invalid option: ${key}`,
    );
    index += 1;
    options[key.slice(2).replaceAll("-", "_")] = value;
  }
  return options;
}

async function runCli() {
  const options = parseCliArguments(process.argv.slice(2));
  const runMetadata = options.run_metadata
    ? JSON.parse(await readFile(resolve(options.run_metadata), "utf8"))
    : await fetchReleaseCandidateRunMetadata({
        releaseRunId: options.release_run_id,
        releaseRunAttempt: options.release_run_attempt,
      });
  if (options.run_metadata_output) {
    await mkdir(dirname(resolve(options.run_metadata_output)), {
      recursive: true,
    });
    await writeFile(
      resolve(options.run_metadata_output),
      `${JSON.stringify(runMetadata, null, 2)}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
  }
  const result = await verifyReleaseCandidateEvidence({
    evidenceRoot: options.evidence_root,
    contractPath:
      options.contract ?? "docs/testing/release-evidence-contract.json",
    candidateSha: options.candidate_sha,
    releaseRunId: options.release_run_id,
    releaseRunAttempt: options.release_run_attempt,
    runMetadata,
  });
  if (options.output) {
    await mkdir(dirname(resolve(options.output)), { recursive: true });
    await writeFile(
      resolve(options.output),
      `${JSON.stringify(result, null, 2)}\n`,
      {
        encoding: "utf8",
        mode: 0o600,
      },
    );
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runCli().catch((error) => {
    process.stderr.write(
      `Release candidate evidence rejected: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
