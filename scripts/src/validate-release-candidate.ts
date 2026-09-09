#!/usr/bin/env tsx

import * as fs from "node:fs";
import * as path from "node:path";
import type { ReleaseEvidenceContract } from "./release-evidence";

const WORKSPACE_ROOT = path.resolve(import.meta.dirname, "../..");
const CONTRACT_PATH = path.join(
  WORKSPACE_ROOT,
  "docs/testing/release-evidence-contract.json",
);
const TEST_EVIDENCE_PATH = path.join(
  WORKSPACE_ROOT,
  "docs/testing/test-evidence.json",
);

type TestEvidence = Readonly<{
  automatedReports: readonly Readonly<{ report: string }>[];
}>;

export function validateReleaseCandidateContract(
  contract: ReleaseEvidenceContract,
  workflow: string,
  governance: TestEvidence,
): void {
  if (
    contract.version !== 2 ||
    contract.qaseReporting !== "optional" ||
    contract.retentionDays !== 365
  ) {
    throw new Error(
      "Release evidence contract must use version 2, optional Qase reporting, and 365-day retention.",
    );
  }
  if (contract.qaseEnvironment !== "github-ci-postgres") {
    throw new Error(
      "Release evidence must use disposable PostgreSQL attribution.",
    );
  }
  assertUnique(
    contract.requiredGates.map(({ id }) => id),
    "Release gate IDs",
  );
  assertUnique(contract.requiredEvidenceFiles, "Release evidence paths");
  if (
    contract.requiredGates.length !== 10 ||
    contract.requiredEvidenceFiles.length < 25
  ) {
    throw new Error("Release evidence contract is missing required depth.");
  }
  const engineeringGates = [
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
  ];
  if (
    JSON.stringify(contract.requiredGates.map(({ id }) => id)) !==
      JSON.stringify(engineeringGates) ||
    !contract.requiredGates.every(
      ({ includeInQase }) => includeInQase === true,
    ) ||
    !contract.requiredEvidenceFiles.includes(
      "artifacts/release-candidate/qase-run.json",
    )
  ) {
    throw new Error(
      "Release contract must preserve all ten engineering gates and local reporting evidence.",
    );
  }
  if (
    /report_to_qase:|qase-tms\/|secrets\.QASE_|api\.qase\.io/.test(workflow)
  ) {
    throw new Error(
      "Qase is retired; release workflows must not expose remote reporting.",
    );
  }
  const reportingStep = readWorkflowStep(
    workflow,
    "Record Qase release identity",
  );
  for (const required of [
    "if: always()",
    'QASE_REPORTING_ENABLED: "false"',
    'QASE_RUN_ID: ""',
    '"qase_create":"skipped"',
    '"qase_upload":"skipped"',
    '"qase_complete":"skipped"',
    "release-evidence -- qase-metadata",
  ]) {
    if (!reportingStep.includes(required)) {
      throw new Error(
        "Retired Qase compatibility evidence must record disabled, skipped, and no run identity.",
      );
    }
  }
  for (const report of governance.automatedReports) {
    if (
      !contract.requiredEvidenceFiles.includes(
        `artifacts/api-server/test-results/${report.report}`,
      )
    ) {
      throw new Error(
        `Release evidence omits governed report ${report.report}.`,
      );
    }
  }
  for (const requiredReport of [
    "weekly-concurrency-soak.xml",
    "weekly-randomized-ledger.xml",
    "weekly-fault-injection.xml",
    "weekly-migration-compatibility.xml",
    "weekly-backup-restore.xml",
    "weekly-backup-restore.json",
    "ledger-performance-characterization.xml",
    "ledger-performance-characterization.json",
  ]) {
    if (
      !contract.requiredEvidenceFiles.some((file) =>
        file.endsWith(requiredReport),
      )
    ) {
      throw new Error(`Release evidence omits ${requiredReport}.`);
    }
  }

  for (const requiredWorkflowControl of [
    "workflow_dispatch:",
    "candidate_sha:",
    "required: true",
    "cancel-in-progress: false",
    "timeout-minutes: 120",
    "image: postgres:16",
    "persist-credentials: false",
    "fetch-depth: 0",
    "ref: ${{ inputs.candidate_sha }}",
    "git show-ref --verify refs/remotes/origin/main",
    "release-evidence -- identity",
    "release-evidence -- gate-junit",
    "id: security",
    "pnpm run test:action-pins",
    "pnpm run test:repository-controls",
    "pnpm run test:migration-policy",
    "semgrep/semgrep@sha256:65dcd4408adda7c183a6b4550cb1e9b19f7f627a6fbb7e0559bd466bedc44d7b",
    "aquasecurity/trivy-action@ed142fd0673e97e23eac54620cfb913e5ce36c25",
    "artifacts/release-candidate/security/semgrep.json",
    "artifacts/release-candidate/security/trivy-vulnerabilities.json",
    "artifacts/release-candidate/security/trivy-secrets-misconfiguration.json",
    "artifacts/release-candidate/security/trivy-license-policy.json",
    "artifacts/release-candidate/security/sbom.cdx.json",
    "name: Release runtime image security (${{ matrix.id }})",
    "fail-fast: false",
    "Build exact-SHA runtime image from pinned inputs",
    "docker image inspect",
    "Gate fixed critical runtime vulnerabilities",
    "Gate high and critical runtime secrets",
    "severity: HIGH,CRITICAL",
    "name: Download exact-SHA runtime image security evidence",
    "pattern: release-runtime-security-*-${{ inputs.candidate_sha }}",
    "needs.runtime-image-security.result",
    "pnpm run test:experience-budgets",
    "id: qase_payload",
    "release-evidence -- manifest",
    "release-evidence -- verify --require-passing",
    `retention-days: ${contract.retentionDays}`,
    "TEST_ENVIRONMENT: github-ci-postgres",
  ]) {
    if (!workflow.includes(requiredWorkflowControl)) {
      throw new Error(
        `Release workflow is missing ${requiredWorkflowControl}.`,
      );
    }
  }
  if (
    !/uses:\s+actions\/upload-artifact@[0-9a-f]{40}(?:\s+#.*)?/.test(workflow)
  ) {
    throw new Error(
      "Release workflow must pin actions/upload-artifact to an immutable commit SHA.",
    );
  }
  if (
    !/uses:\s+actions\/download-artifact@[0-9a-f]{40}(?:\s+#.*)?/.test(workflow)
  ) {
    throw new Error(
      "Release workflow must pin actions/download-artifact to an immutable commit SHA.",
    );
  }
  for (const forbiddenTrigger of [
    /^  pull_request:/m,
    /^  push:/m,
    /^  schedule:/m,
  ]) {
    if (forbiddenTrigger.test(workflow)) {
      throw new Error(
        "Release issuance must remain manual workflow_dispatch only.",
      );
    }
  }
  const uploadIndex = workflow.indexOf(
    "name: Preserve immutable release evidence",
  );
  const enforcementIndex = workflow.indexOf(
    "name: Enforce release stop conditions",
  );
  if (uploadIndex < 0 || enforcementIndex <= uploadIndex) {
    throw new Error(
      "Release evidence must be preserved before stop conditions fail the run.",
    );
  }
  const qasePayloadStep = readWorkflowStep(
    workflow,
    "Build stable Qase release gate payload",
  );
  const manifestStep = readWorkflowStep(
    workflow,
    "Build content-addressed release evidence manifest",
  );
  const uploadStep = readWorkflowStep(
    workflow,
    "Preserve immutable release evidence",
  );
  const runtimeSecurityAggregate = readWorkflowStep(
    workflow,
    "Aggregate exact-SHA security gate",
  );
  if (
    !runtimeSecurityAggregate.includes(
      "RUNTIME_IMAGES_RESULT: ${{ needs.runtime-image-security.result }}",
    ) ||
    !runtimeSecurityAggregate.includes(
      'test "${RUNTIME_IMAGES_RESULT}" = success',
    )
  ) {
    throw new Error(
      "Release security aggregate must fail unless every runtime image scan passes.",
    );
  }
  if (!uploadStep.includes("if-no-files-found: error")) {
    throw new Error(
      "Release evidence upload must reject a wholly empty evidence selection.",
    );
  }
  for (const gate of contract.requiredGates) {
    if (!workflow.includes(`id: ${gate.id}`)) {
      throw new Error(`Release workflow is missing gate step ${gate.id}.`);
    }
    const gateResult = `"${gate.id}":"\${{ steps.${gate.id}.outcome }}"`;
    if (!manifestStep.includes(gateResult)) {
      throw new Error(
        `Release workflow does not bind gate ${gate.id} into the immutable manifest.`,
      );
    }
    if (gate.includeInQase && !qasePayloadStep.includes(gateResult)) {
      throw new Error(
        `Release workflow does not bind gate ${gate.id} into the Qase payload.`,
      );
    }
  }
  for (const evidencePath of [
    contract.manifest,
    contract.manifestHash,
    ...contract.requiredEvidenceFiles,
  ]) {
    if (!uploadStep.includes(evidencePath)) {
      throw new Error(`Release workflow does not preserve ${evidencePath}.`);
    }
  }
  if (workflow.includes("replit") || workflow.includes("worf.replit")) {
    throw new Error("Release workflow must not depend on Replit.");
  }
  validateIsolatedPostgresSuites(workflow);
}

function validateIsolatedPostgresSuites(workflow: string): void {
  for (const service of [
    "postgres-persistence:",
    "postgres-http:",
    "postgres-resilience:",
    "postgres-performance:",
    "postgres-recovery:",
  ]) {
    if (!workflow.includes(service)) {
      throw new Error(`Release workflow is missing isolated ${service}`);
    }
  }

  const migrationStep = readWorkflowStep(
    workflow,
    "Apply migrations and prove repeatable seed",
  );
  const persistenceStep = readWorkflowStep(
    workflow,
    "Run PostgreSQL persistence and ledger release suite",
  );
  const httpStep = readWorkflowStep(
    workflow,
    "Run HTTP, daily journey, and process-restart release suite",
  );
  const resilienceStep = readWorkflowStep(
    workflow,
    "Run weekly backend resilience release suite",
  );
  const performanceStep = readWorkflowStep(
    workflow,
    "Run million-posting materialized balance gate",
  );
  const recoveryStep = readWorkflowStep(
    workflow,
    "Run synthetic logical backup and restore release rehearsal",
  );

  const persistenceUrl = readDatabaseUrl(migrationStep);
  if (readDatabaseUrl(persistenceStep) !== persistenceUrl) {
    throw new Error(
      "Persistence migrations and tests must use the same disposable database.",
    );
  }
  const suiteUrls = [
    persistenceUrl,
    readDatabaseUrl(httpStep),
    readDatabaseUrl(resilienceStep),
    readDatabaseUrl(performanceStep),
    readDatabaseUrl(recoveryStep),
  ];
  if (new Set(suiteUrls).size !== suiteUrls.length) {
    throw new Error(
      "Persistence, HTTP, resilience, and performance suites must use isolated database URLs.",
    );
  }
  if (suiteUrls.some((url) => !url.includes("@127.0.0.1:"))) {
    throw new Error(
      "Release suites must use only local disposable PostgreSQL services.",
    );
  }

  const migrationIndex = migrationStep.indexOf(
    "@workspace/db run test:migrate",
  );
  const firstSeedIndex = migrationStep.indexOf("@workspace/db run test:seed");
  const secondSeedIndex = migrationStep.indexOf(
    "@workspace/db run test:seed",
    firstSeedIndex + 1,
  );
  if (
    migrationIndex < 0 ||
    firstSeedIndex <= migrationIndex ||
    secondSeedIndex <= firstSeedIndex
  ) {
    throw new Error(
      "The persistence database must be migrated and seeded repeatably before testing.",
    );
  }
  assertDatabasePreparedBeforeTests(
    httpStep,
    "@workspace/api-server run build",
  );
  assertDatabasePreparedBeforeTests(
    resilienceStep,
    "test:weekly-concurrency:junit",
  );
  assertDatabasePreparedBeforeTests(
    performanceStep,
    "test:ledger-performance:junit",
  );
  assertDatabasePreparedBeforeTests(
    recoveryStep,
    "test:weekly-backup-restore:junit",
  );
  if (
    !/^          SAMRA_DISPOSABLE_BACKUP_RESTORE_CONFIRMATION: I_UNDERSTAND_THIS_DROPS_DISPOSABLE_LOCAL_DATABASES$/mu.test(
      recoveryStep,
    ) ||
    !/^          SAMRA_RECOVERY_CANDIDATE_SHA: \$\{\{ inputs\.candidate_sha \}\}$/mu.test(
      recoveryStep,
    ) ||
    !/^          SAMRA_POSTGRES_CLIENT_IMAGE: postgres:16@sha256:f1c3376c26f2609ab9f29f71f824103fe2fcd8ee0346485cb6122a4f93df6f94$/mu.test(
      recoveryStep,
    ) ||
    !/^          WEEKLY_BACKUP_RESTORE_RESULTS_PATH: test-results\/weekly-backup-restore\.json$/mu.test(
      recoveryStep,
    )
  ) {
    throw new Error(
      "Recovery rehearsal must bind the candidate, pinned PostgreSQL client, explicit disposable-database confirmation, and JSON evidence.",
    );
  }
}

function readWorkflowStep(workflow: string, name: string): string {
  const marker = `- name: ${name}`;
  const start = workflow.indexOf(marker);
  if (start < 0) {
    throw new Error(`Release workflow is missing step ${name}.`);
  }
  const next = workflow.indexOf("\n      - name:", start + marker.length);
  return workflow.slice(start, next < 0 ? workflow.length : next);
}

function readDatabaseUrl(step: string): string {
  const match = step.match(/TEST_DATABASE_URL:\s*([^\s]+)/);
  if (!match?.[1]) {
    throw new Error(
      "Every release database suite must declare its database URL.",
    );
  }
  return match[1];
}

function assertDatabasePreparedBeforeTests(
  step: string,
  firstTestCommand: string,
): void {
  const migrationIndex = step.indexOf("@workspace/db run test:migrate");
  const seedIndex = step.indexOf("@workspace/db run test:seed");
  const testIndex = step.indexOf(firstTestCommand);
  if (
    migrationIndex < 0 ||
    seedIndex <= migrationIndex ||
    testIndex <= seedIndex
  ) {
    throw new Error(
      "Every isolated release database must be migrated and seeded before its suite runs.",
    );
  }
}

function assertUnique(values: readonly string[], label: string): void {
  const duplicates = values.filter(
    (value, index) => values.indexOf(value) !== index,
  );
  if (duplicates.length > 0) {
    throw new Error(`${label} contains duplicates: ${duplicates.join(", ")}`);
  }
}

function main(): void {
  const contract = JSON.parse(
    fs.readFileSync(CONTRACT_PATH, "utf8"),
  ) as ReleaseEvidenceContract;
  const governance = JSON.parse(
    fs.readFileSync(TEST_EVIDENCE_PATH, "utf8"),
  ) as TestEvidence;
  const workflow = fs.readFileSync(
    path.join(WORKSPACE_ROOT, contract.workflow),
    "utf8",
  );
  validateReleaseCandidateContract(contract, workflow, governance);
  console.log(
    `Release candidate contract valid: ${contract.requiredGates.length} gates, ${contract.requiredEvidenceFiles.length} evidence files, ${contract.retentionDays}-day retention.`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) main();
