#!/usr/bin/env tsx

import * as fs from "node:fs";
import * as path from "node:path";
import type { ReleaseEvidenceContract } from "./release-evidence";

const WORKSPACE_ROOT = path.resolve(import.meta.dirname, "../..");
const CONTRACT_PATH = path.join(
  WORKSPACE_ROOT,
  "docs/testing/release-evidence-contract.json",
);
const QASE_GOVERNANCE_PATH = path.join(
  WORKSPACE_ROOT,
  "docs/testing/qase-governance.json",
);

type QaseGovernance = Readonly<{
  automatedReports: readonly Readonly<{ report: string }>[];
}>;

export function validateReleaseCandidateContract(
  contract: ReleaseEvidenceContract,
  workflow: string,
  governance: QaseGovernance,
): void {
  if (contract.version !== 1 || contract.retentionDays !== 365) {
    throw new Error(
      "Release evidence contract must use version 1 and 365-day retention.",
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
    contract.requiredGates.length < 11 ||
    contract.requiredEvidenceFiles.length < 25
  ) {
    throw new Error("Release evidence contract is missing required depth.");
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
    "timeout-minutes: 90",
    "image: postgres:16",
    "persist-credentials: false",
    "fetch-depth: 0",
    "ref: ${{ inputs.candidate_sha }}",
    "git show-ref --verify refs/remotes/origin/main",
    "release-evidence -- identity",
    "release-evidence -- gate-junit",
    "id: qase_payload",
    "if: steps.qase_payload.outcome == 'success' && !cancelled()",
    "release-evidence -- manifest",
    "release-evidence -- verify --require-passing",
    "uses: actions/upload-artifact@v4",
    `retention-days: ${contract.retentionDays}`,
    "QASE_TESTOPS_ENVIRONMENT: github-ci-postgres",
    "environment: ${{ env.QASE_TESTOPS_ENVIRONMENT }}",
  ]) {
    if (!workflow.includes(requiredWorkflowControl)) {
      throw new Error(
        `Release workflow is missing ${requiredWorkflowControl}.`,
      );
    }
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
  for (const gate of contract.requiredGates) {
    if (!workflow.includes(`id: ${gate.id}`)) {
      throw new Error(`Release workflow is missing gate step ${gate.id}.`);
    }
  }
  for (const evidencePath of contract.requiredEvidenceFiles) {
    if (!workflow.includes(evidencePath)) {
      throw new Error(`Release workflow does not preserve ${evidencePath}.`);
    }
  }
  if (workflow.includes("replit") || workflow.includes("worf.replit")) {
    throw new Error("Release workflow must not depend on Replit.");
  }
  validateIsolatedPostgresSuites(workflow);
  const completeQaseIndex = workflow.indexOf(
    "name: Complete Qase release-candidate run",
  );
  const recordQaseIndex = workflow.indexOf(
    "name: Record Qase release identity",
  );
  const completeQaseStep = workflow.slice(completeQaseIndex, recordQaseIndex);
  if (
    completeQaseIndex < 0 ||
    recordQaseIndex <= completeQaseIndex ||
    !completeQaseStep.includes(
      "if: steps.qase_create.outputs.id != '' && !cancelled()",
    )
  ) {
    throw new Error(
      "Release workflow must close every created Qase run even when upload fails.",
    );
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
}

function validateIsolatedPostgresSuites(workflow: string): void {
  for (const service of [
    "postgres-persistence:",
    "postgres-http:",
    "postgres-resilience:",
    "postgres-performance:",
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
    fs.readFileSync(QASE_GOVERNANCE_PATH, "utf8"),
  ) as QaseGovernance;
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
