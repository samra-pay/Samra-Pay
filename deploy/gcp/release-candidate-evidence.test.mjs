import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import {
  RELEASE_EVIDENCE_MANIFEST,
  RELEASE_EVIDENCE_MANIFEST_HASH,
  RELEASE_GATE_EVIDENCE,
  RELEASE_IDENTITY_EVIDENCE,
  RELEASE_QASE_EVIDENCE,
  RELEASE_RECOVERY_EVIDENCE,
  validateReleaseCandidateRunMetadata,
  verifyReleaseCandidateEvidence,
} from "./verify-release-candidate-evidence.mjs";

const candidateSha = "a".repeat(40);
const gitTreeSha = "b".repeat(40);
const runId = "32608456303";
const runAttempt = 2;
const runUrl =
  "https://github.com/samra-pay/Samra-Pay/actions/runs/32608456303";
const generatedAt = "2026-09-02T00:00:00.000Z";

function runMetadata(overrides = {}) {
  return {
    id: Number(runId),
    run_attempt: runAttempt,
    name: "Immutable release candidate",
    path: ".github/workflows/release-candidate.yml",
    event: "workflow_dispatch",
    head_branch: "main",
    head_sha: candidateSha,
    status: "completed",
    conclusion: "success",
    html_url: runUrl,
    repository: { full_name: "samra-pay/Samra-Pay" },
    head_repository: { full_name: "samra-pay/Samra-Pay" },
    ...overrides,
  };
}

function recoveryEvidence(overrides = {}) {
  return {
    schemaVersion: 1,
    kind: "samra-synthetic-postgres-backup-restore",
    generatedAt,
    result: "pass",
    provenance: {
      executor: "github-actions",
      repository: "samra-pay/Samra-Pay",
      eventName: "workflow_dispatch",
      candidateSha,
      githubSha: candidateSha,
      workflowRunId: runId,
      workflowRunAttempt: runAttempt,
      workflowRef:
        "samra-pay/Samra-Pay/.github/workflows/release-candidate.yml@refs/heads/main",
    },
    tooling: {
      clientMode: "digest-pinned-container",
      clientImage:
        "postgres:16@sha256:f1c3376c26f2609ab9f29f71f824103fe2fcd8ee0346485cb6122a4f93df6f94",
    },
    boundaries: {
      localhostOnly: true,
      disposableDatabasesOnly: true,
      syntheticDataOnly: true,
      cloudAccess: false,
      customerData: false,
      dumpRetained: false,
    },
    databases: {
      sourcePattern: "samra_backup_source_*",
      targetPattern: "samra_backup_restore_*",
    },
    versions: {
      postgres: { raw: "PostgreSQL 16", versionNumber: "160000", major: 16 },
      pgDump: { raw: "pg_dump (PostgreSQL) 16", major: 16 },
      pgRestore: { raw: "pg_restore (PostgreSQL) 16", major: 16 },
    },
    dump: {
      format: "custom",
      bytes: 100,
      maximumBytes: 67_108_864,
      sha256: "c".repeat(64),
      retained: false,
    },
    timingsMs: {
      migrationAndSeed: 1,
      dump: 1,
      restore: 1,
      verification: 1,
      cleanup: 1,
      total: 5,
    },
    comparison: {
      allTableFingerprintsMatch: true,
      sequenceStateMatches: true,
      triggerDefinitionsMatch: true,
      recoveryInvariantsMatch: true,
      migrationHistoryMatchesCheckedInSql: true,
    },
    migrations: {
      count: 17,
      currentTag: "0017",
      sha256: "a".repeat(64),
      entries: Array.from({ length: 17 }, (_, index) => ({
        tag: String(index + 1).padStart(4, "0"),
        createdAt: index + 1,
        sqlSha256: "b".repeat(64),
      })),
    },
    tableFingerprints: { count: 1, sha256: "d".repeat(64), tables: [] },
    sequences: { count: 1, sha256: "e".repeat(64) },
    triggers: {
      count: 1,
      names: ["immutable_journal"],
      requiredNames: ["immutable_journal"],
      sha256: "f".repeat(64),
    },
    invariants: {
      migrationCount: 17,
      currentMigrationTag: "0017",
      demoSeedJournalCount: 1,
      postedJournalCount: 1,
      postingCount: 2,
      unbalancedJournalCount: 0,
      currencyImbalanceCount: 0,
      balanceProjectionDriftCount: 0,
    },
    ...overrides,
  };
}

async function writeEvidence(root, relativePath, content) {
  const path = join(root, relativePath);
  await mkdir(dirname(path), { recursive: true });
  const serialized =
    typeof content === "string"
      ? content
      : `${JSON.stringify(content, null, 2)}\n`;
  await writeFile(path, serialized, "utf8");
  return Buffer.from(serialized);
}

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), "samra-release-lineage-"));
  const evidenceRoot = join(root, "download");
  const contractPath = join(root, "release-evidence-contract.json");
  const requiredGates = [
    { id: "identity", title: "Identity", includeInQase: true },
    { id: "resilience", title: "Resilience", includeInQase: true },
    { id: "recovery", title: "Recovery", includeInQase: true },
    { id: "qase_create", title: "Qase create", includeInQase: false },
    { id: "qase_upload", title: "Qase upload", includeInQase: false },
    { id: "qase_complete", title: "Qase complete", includeInQase: false },
  ];
  const requiredEvidenceFiles = [
    RELEASE_IDENTITY_EVIDENCE,
    RELEASE_GATE_EVIDENCE,
    RELEASE_QASE_EVIDENCE,
    ...RELEASE_RECOVERY_EVIDENCE,
  ];
  const contract = {
    version: 1,
    workflow: ".github/workflows/release-candidate.yml",
    manifest: RELEASE_EVIDENCE_MANIFEST,
    manifestHash: RELEASE_EVIDENCE_MANIFEST_HASH,
    retentionDays: 365,
    qaseEnvironment: "github-ci-postgres",
    requiredGates,
    requiredEvidenceFiles,
    boundaries: ["synthetic only"],
  };
  await writeFile(
    contractPath,
    `${JSON.stringify(contract, null, 2)}\n`,
    "utf8",
  );

  const evidenceContents = new Map([
    [
      RELEASE_IDENTITY_EVIDENCE,
      await writeEvidence(evidenceRoot, RELEASE_IDENTITY_EVIDENCE, {
        schemaVersion: 1,
        releaseId: `rc-${candidateSha.slice(0, 12)}`,
        candidateSha,
        shortSha: candidateSha.slice(0, 12),
        gitTreeSha,
        parentShas: ["1".repeat(40)],
        repository: "samra-pay/Samra-Pay",
        workflowRunId: runId,
        workflowRunAttempt: runAttempt,
        workflowRunUrl: runUrl,
        actor: "haileleuld87",
        eventName: "workflow_dispatch",
        mainAncestryVerified: true,
        generatedAt,
      }),
    ],
    [
      RELEASE_GATE_EVIDENCE,
      await writeEvidence(
        evidenceRoot,
        RELEASE_GATE_EVIDENCE,
        [
          '<?xml version="1.0" encoding="utf-8"?>',
          '<testsuites name="Release Candidate" tests="3" failures="0" skipped="0">',
          '  <testsuite name="Release Candidate Gates" tests="3" failures="0" skipped="0">',
          `    <property name="release_id" value="rc-${candidateSha.slice(0, 12)}"/>`,
          `    <property name="candidate_sha" value="${candidateSha}"/>`,
          "  </testsuite>",
          "</testsuites>",
          "",
        ].join("\n"),
      ),
    ],
    [
      RELEASE_QASE_EVIDENCE,
      await writeEvidence(evidenceRoot, RELEASE_QASE_EVIDENCE, {
        project: "SAMP",
        environment: "github-ci-postgres",
        runId: "9",
        runUrl: "https://app.qase.io/run/SAMP/dashboard/9",
      }),
    ],
    [
      RELEASE_RECOVERY_EVIDENCE[0],
      await writeEvidence(
        evidenceRoot,
        RELEASE_RECOVERY_EVIDENCE[0],
        '<testsuite name="backup restore" tests="1" failures="0"/>\n',
      ),
    ],
    [
      RELEASE_RECOVERY_EVIDENCE[1],
      await writeEvidence(
        evidenceRoot,
        RELEASE_RECOVERY_EVIDENCE[1],
        recoveryEvidence(),
      ),
    ],
  ]);
  const evidenceFiles = requiredEvidenceFiles.map((path) => {
    const content = evidenceContents.get(path);
    return {
      path,
      bytes: content.length,
      sha256: createHash("sha256").update(content).digest("hex"),
    };
  });
  const manifest = {
    schemaVersion: 1,
    releaseId: `rc-${candidateSha.slice(0, 12)}`,
    candidateSha,
    gitTreeSha,
    parentShas: ["1".repeat(40)],
    repository: "samra-pay/Samra-Pay",
    workflowRunId: runId,
    workflowRunAttempt: runAttempt,
    workflowRunUrl: runUrl,
    qaseEnvironment: "github-ci-postgres",
    qaseRunId: "9",
    qaseRunUrl: "https://app.qase.io/run/SAMP/dashboard/9",
    gateResults: Object.fromEntries(
      requiredGates.map(({ id }) => [id, "success"]),
    ),
    evidenceFiles,
    missingEvidenceFiles: [],
    overallStatus: "passed",
    boundaries: contract.boundaries,
    generatedAt,
  };
  const manifestBytes = await writeEvidence(
    evidenceRoot,
    RELEASE_EVIDENCE_MANIFEST,
    manifest,
  );
  const manifestHash = createHash("sha256").update(manifestBytes).digest("hex");
  await writeEvidence(
    evidenceRoot,
    RELEASE_EVIDENCE_MANIFEST_HASH,
    `${manifestHash}  release-evidence-manifest.json\n`,
  );
  return { root, evidenceRoot, contractPath, contract, manifest, manifestHash };
}

test("verifies the exact successful release run, gates, hashes, and recovery evidence", async () => {
  const fixture = await createFixture();
  const result = await verifyReleaseCandidateEvidence({
    evidenceRoot: fixture.evidenceRoot,
    contractPath: fixture.contractPath,
    candidateSha,
    releaseRunId: runId,
    releaseRunAttempt: String(runAttempt),
    runMetadata: runMetadata(),
  });

  assert.equal(result.candidateSha, candidateSha);
  assert.equal(result.workflowRunId, runId);
  assert.equal(result.workflowRunAttempt, runAttempt);
  assert.equal(result.evidenceManifestSha256, fixture.manifestHash);
  assert.equal(result.requiredGatesPassed, true);
  assert.deepEqual(
    result.recoveryEvidence.map(({ path }) => path),
    RELEASE_RECOVERY_EVIDENCE,
  );
});

test("rejects a different workflow, SHA, attempt, or incomplete run", () => {
  for (const overrides of [
    { path: ".github/workflows/ci.yml" },
    { head_sha: "f".repeat(40) },
    { run_attempt: 1 },
    { conclusion: "failure" },
  ]) {
    assert.throws(() =>
      validateReleaseCandidateRunMetadata(runMetadata(overrides), {
        candidateSha,
        releaseRunId: runId,
        releaseRunAttempt: String(runAttempt),
      }),
    );
  }
});

test("rejects failed gates, missing recovery, old paths, and changed bytes", async () => {
  const failedGate = await createFixture();
  failedGate.manifest.gateResults.resilience = "failure";
  const changedManifest = `${JSON.stringify(failedGate.manifest, null, 2)}\n`;
  await writeFile(
    join(failedGate.evidenceRoot, RELEASE_EVIDENCE_MANIFEST),
    changedManifest,
    "utf8",
  );
  await writeFile(
    join(failedGate.evidenceRoot, RELEASE_EVIDENCE_MANIFEST_HASH),
    `${createHash("sha256").update(changedManifest).digest("hex")}  release-evidence-manifest.json\n`,
    "utf8",
  );
  await assert.rejects(
    verifyReleaseCandidateEvidence({
      evidenceRoot: failedGate.evidenceRoot,
      contractPath: failedGate.contractPath,
      candidateSha,
      releaseRunId: runId,
      releaseRunAttempt: String(runAttempt),
      runMetadata: runMetadata(),
    }),
    /every contracted gate passed/,
  );

  const missingRecovery = await createFixture();
  missingRecovery.contract.requiredEvidenceFiles.pop();
  await writeFile(
    missingRecovery.contractPath,
    `${JSON.stringify(missingRecovery.contract, null, 2)}\n`,
    "utf8",
  );
  await assert.rejects(
    verifyReleaseCandidateEvidence({
      evidenceRoot: missingRecovery.evidenceRoot,
      contractPath: missingRecovery.contractPath,
      candidateSha,
      releaseRunId: runId,
      releaseRunAttempt: String(runAttempt),
      runMetadata: runMetadata(),
    }),
    /missing recovery evidence/,
  );

  const changedBytes = await createFixture();
  await writeFile(
    join(changedBytes.evidenceRoot, RELEASE_RECOVERY_EVIDENCE[0]),
    "changed\n",
    "utf8",
  );
  await assert.rejects(
    verifyReleaseCandidateEvidence({
      evidenceRoot: changedBytes.evidenceRoot,
      contractPath: changedBytes.contractPath,
      candidateSha,
      releaseRunId: runId,
      releaseRunAttempt: String(runAttempt),
      runMetadata: runMetadata(),
    }),
    /changed after hashing/,
  );

  const oldPath = await createFixture();
  oldPath.manifest.evidenceFiles[0].path = "release-candidate/identity.json";
  const oldManifest = `${JSON.stringify(oldPath.manifest, null, 2)}\n`;
  await writeFile(
    join(oldPath.evidenceRoot, RELEASE_EVIDENCE_MANIFEST),
    oldManifest,
    "utf8",
  );
  await writeFile(
    join(oldPath.evidenceRoot, RELEASE_EVIDENCE_MANIFEST_HASH),
    `${createHash("sha256").update(oldManifest).digest("hex")}  release-evidence-manifest.json\n`,
    "utf8",
  );
  await assert.rejects(
    verifyReleaseCandidateEvidence({
      evidenceRoot: oldPath.evidenceRoot,
      contractPath: oldPath.contractPath,
      candidateSha,
      releaseRunId: runId,
      releaseRunAttempt: String(runAttempt),
      runMetadata: runMetadata(),
    }),
    /file set or order drifted/,
  );
});

test("rejects files not declared by the release evidence contract", async () => {
  const fixture = await createFixture();
  await writeEvidence(
    fixture.evidenceRoot,
    "artifacts/release-candidate/unexpected.txt",
    "unexpected\n",
  );

  await assert.rejects(
    verifyReleaseCandidateEvidence({
      evidenceRoot: fixture.evidenceRoot,
      contractPath: fixture.contractPath,
      candidateSha,
      releaseRunId: runId,
      releaseRunAttempt: String(runAttempt),
      runMetadata: runMetadata(),
    }),
    /artifact file set drifted/,
  );
});

test("rejects old or weakened recovery evidence even when its hash is updated", async () => {
  for (const mutate of [
    (value) => (value.result = "fail"),
    (value) => (value.provenance.executor = "local"),
    (value) => (value.provenance.eventName = "schedule"),
    (value) => (value.provenance.candidateSha = "f".repeat(40)),
    (value) => (value.provenance.githubSha = "f".repeat(40)),
    (value) => (value.provenance.workflowRunId = "1"),
    (value) => (value.provenance.workflowRunAttempt = 1),
    (value) =>
      (value.provenance.workflowRef =
        "samra-pay/Samra-Pay/.github/workflows/backend-resilience.yml@refs/heads/main"),
    (value) => (value.tooling.clientMode = "local-path"),
    (value) => (value.tooling.clientImage = "postgres:16"),
    (value) => (value.boundaries.cloudAccess = true),
    (value) => (value.boundaries.customerData = true),
    (value) => (value.dump.retained = true),
    (value) => (value.comparison.recoveryInvariantsMatch = false),
    (value) => (value.comparison.migrationHistoryMatchesCheckedInSql = false),
    (value) => (value.invariants.unbalancedJournalCount = 1),
  ]) {
    const fixture = await createFixture();
    const changedRecovery = recoveryEvidence();
    mutate(changedRecovery);
    const recoveryBytes = Buffer.from(
      `${JSON.stringify(changedRecovery, null, 2)}\n`,
    );
    await writeFile(
      join(fixture.evidenceRoot, RELEASE_RECOVERY_EVIDENCE[1]),
      recoveryBytes,
    );
    const descriptor = fixture.manifest.evidenceFiles.find(
      ({ path }) => path === RELEASE_RECOVERY_EVIDENCE[1],
    );
    descriptor.bytes = recoveryBytes.length;
    descriptor.sha256 = createHash("sha256")
      .update(recoveryBytes)
      .digest("hex");
    const manifestBytes = `${JSON.stringify(fixture.manifest, null, 2)}\n`;
    await writeFile(
      join(fixture.evidenceRoot, RELEASE_EVIDENCE_MANIFEST),
      manifestBytes,
      "utf8",
    );
    await writeFile(
      join(fixture.evidenceRoot, RELEASE_EVIDENCE_MANIFEST_HASH),
      `${createHash("sha256").update(manifestBytes).digest("hex")}  release-evidence-manifest.json\n`,
      "utf8",
    );
    await assert.rejects(
      verifyReleaseCandidateEvidence({
        evidenceRoot: fixture.evidenceRoot,
        contractPath: fixture.contractPath,
        candidateSha,
        releaseRunId: runId,
        releaseRunAttempt: String(runAttempt),
        runMetadata: runMetadata(),
      }),
      /recovery evidence drifted/,
    );
  }
});

test("the verifier never shells out or imports cloud/vendor clients", async () => {
  const source = await readFile(
    "deploy/gcp/verify-release-candidate-evidence.mjs",
    "utf8",
  );
  assert.doesNotMatch(
    source,
    /node:child_process|execFile|spawn|gcloud|@google|qase\/|postgres(?:ql)?:\/\//i,
  );
});
