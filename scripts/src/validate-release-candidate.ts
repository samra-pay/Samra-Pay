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
