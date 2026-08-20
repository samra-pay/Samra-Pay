#!/usr/bin/env tsx

import * as fs from "node:fs";
import * as path from "node:path";

const WORKSPACE_ROOT = path.resolve(import.meta.dirname, "../..");
const POLICY_PATH = path.join(
  WORKSPACE_ROOT,
  "docs/testing/testing-cadence.json",
);
const DOCUMENTATION_PATH = path.join(
  WORKSPACE_ROOT,
  "docs/testing/testing-strategy.md",
);

type RiskTier = Readonly<{
  id: string;
  meaning: string;
  requiredCadences: readonly string[];
  manualOverrideAllowed: boolean;
}>;

type Cadence = Readonly<{
  id: string;
  workflow: string;
  trigger: "pull_request" | "push:main" | "schedule" | "workflow_dispatch";
  cron?: string;
  maximumMinutes: number;
  requiredJobs: readonly string[];
  qaseEnvironment: string;
}>;

type Surface = Readonly<{
  id: string;
  risk: string;
  paths: readonly string[];
  cadences: readonly string[];
}>;

export type TestingCadencePolicy = Readonly<{
  version: number;
  authority: Readonly<{
    merge: string;
    traceability: string;
    financialTruth: string;
    manualEvidence: string;
  }>;
  riskTiers: readonly RiskTier[];
  cadences: readonly Cadence[];
  surfaces: readonly Surface[];
  stopConditions: readonly string[];
  boundaries: readonly string[];
}>;

function assertUnique(values: readonly string[], label: string): void {
  const duplicates = values.filter(
    (value, index) => values.indexOf(value) !== index,
  );
  if (duplicates.length > 0) {
    throw new Error(`${label} contains duplicates: ${duplicates.join(", ")}`);
  }
}

function escapeRegularExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function triggerBranches(workflow: string, trigger: string): readonly string[] {
  const triggerMatch = new RegExp(`^  ${trigger}:\\s*$`, "m").exec(workflow);
  if (!triggerMatch || triggerMatch.index === undefined) return [];

  const remainder = workflow.slice(triggerMatch.index + triggerMatch[0].length);
  const nextTrigger = /^  [a-zA-Z0-9_-]+:\s*$/m.exec(remainder);
  const section = nextTrigger
    ? remainder.slice(0, nextTrigger.index)
    : remainder;
  const lines = section.split("\n");
  const branchesIndex = lines.findIndex((line) => line === "    branches:");
  if (branchesIndex === -1) return [];

  const branches: string[] = [];
  for (const line of lines.slice(branchesIndex + 1)) {
    const branch = /^      -\s+(.+?)\s*$/.exec(line);
    if (!branch) break;
    branches.push(branch[1]!.replace(/^['\"]|['\"]$/g, ""));
  }
  return branches;
}

function assertWorkflowJob(
  workflow: string,
  job: string,
  cadence: string,
): void {
  const jobDeclaration = new RegExp(
    `^  ${escapeRegularExpression(job)}:\\s*$`,
    "m",
  );
  if (!jobDeclaration.test(workflow)) {
    throw new Error(`${cadence} requires missing workflow job ${job}.`);
  }
}

function assertTrigger(cadence: Cadence, workflow: string): void {
  if (
    cadence.trigger === "pull_request" &&
    !workflow.includes("pull_request:")
  ) {
    throw new Error(`${cadence.id} workflow is missing pull_request.`);
  }
  if (
    cadence.trigger === "push:main" &&
    (!workflow.includes("push:") || !workflow.includes("      - main"))
  ) {
    throw new Error(`${cadence.id} workflow is missing the main push trigger.`);
  }
  if (
    cadence.trigger === "workflow_dispatch" &&
    !workflow.includes("workflow_dispatch:")
  ) {
    throw new Error(`${cadence.id} workflow is missing workflow_dispatch.`);
  }
  if (cadence.trigger !== "schedule") return;

  if (!cadence.cron) {
    throw new Error(`${cadence.id} must declare its cron schedule.`);
  }
  if (!workflow.includes(`- cron: "${cadence.cron}"`)) {
    throw new Error(
      `${cadence.id} workflow does not implement ${cadence.cron}.`,
    );
  }
  const minute = cadence.cron.split(" ")[0];
  if (minute === "0") {
    throw new Error(`${cadence.id} must not run at the top of the hour.`);
  }
}

export function validateTestingCadence(
  policy: TestingCadencePolicy,
  workflows: Readonly<Record<string, string>>,
  documentation: string,
): void {
  if (policy.version !== 1) {
    throw new Error("Testing cadence policy version must be 1.");
  }
  if (
    policy.authority.merge !== "GitHub Actions" ||
    policy.authority.traceability !== "Qase" ||
    !policy.authority.financialTruth.includes("PostgreSQL")
  ) {
    throw new Error("Testing authorities are incomplete or unsafe.");
  }

  const legacyNodeAction =
    /(?:actions\/(?:checkout@v[1-6]|setup-node@v[1-6]|upload-artifact@v[1-6]|download-artifact@v[1-7])|pnpm\/action-setup@v[1-5])\b/;
  for (const [workflowPath, workflow] of Object.entries(workflows)) {
    const match = legacyNodeAction.exec(workflow);
    if (match) {
      throw new Error(
        `${workflowPath} uses legacy GitHub action ${match[0]}; use the Node 24 release.`,
      );
    }
  }

  assertUnique(
    policy.riskTiers.map(({ id }) => id),
    "Risk tier IDs",
  );
  assertUnique(
    policy.cadences.map(({ id }) => id),
    "Cadence IDs",
  );
  assertUnique(
    policy.surfaces.map(({ id }) => id),
    "Surface IDs",
  );

  const riskIds = new Set(policy.riskTiers.map(({ id }) => id));
  for (const requiredRisk of ["P0", "P1", "P2"]) {
    if (!riskIds.has(requiredRisk)) {
      throw new Error(`Testing policy is missing risk tier ${requiredRisk}.`);
    }
  }

  const cadenceIds = new Set(policy.cadences.map(({ id }) => id));
  for (const requiredCadence of [
    "pull-request",
    "main",
    "daily",
    "weekly-ledger",
    "weekly-resilience",
    "release",
  ]) {
    if (!cadenceIds.has(requiredCadence)) {
      throw new Error(`Testing policy is missing cadence ${requiredCadence}.`);
    }
  }

  for (const risk of policy.riskTiers) {
    if (!risk.meaning.trim() || risk.requiredCadences.length === 0) {
      throw new Error(`${risk.id} must define meaning and required cadences.`);
    }
    for (const cadence of risk.requiredCadences) {
      if (!cadenceIds.has(cadence)) {
        throw new Error(`${risk.id} references unknown cadence ${cadence}.`);
      }
    }
  }

  const p0 = policy.riskTiers.find(({ id }) => id === "P0")!;
  for (const cadence of ["pull-request", "main", "daily", "release"]) {
    if (!p0.requiredCadences.includes(cadence)) {
      throw new Error(`P0 must require the ${cadence} cadence.`);
    }
  }
  if (p0.manualOverrideAllowed) {
    throw new Error("P0 cannot allow manual override.");
  }

  for (const cadence of policy.cadences) {
    if (cadence.maximumMinutes <= 0 || cadence.requiredJobs.length === 0) {
      throw new Error(`${cadence.id} must define runtime and required jobs.`);
    }
    if (cadence.qaseEnvironment !== "github-ci-postgres") {
      throw new Error(
        `${cadence.id} must use the disposable PostgreSQL Qase environment.`,
      );
    }
    const workflow = workflows[cadence.workflow];
    if (!workflow) {
      throw new Error(
        `${cadence.id} references unread workflow ${cadence.workflow}.`,
      );
    }
    assertTrigger(cadence, workflow);
    for (const job of cadence.requiredJobs) {
      assertWorkflowJob(workflow, job, cadence.id);
    }
    if (
      !workflow.includes("QASE_TESTOPS_ENVIRONMENT") ||
      !workflow.includes("environment: ${{ env.QASE_TESTOPS_ENVIRONMENT }}")
    ) {
      throw new Error(
        `${cadence.id} workflow is missing Qase environment attribution.`,
      );
    }
  }

  const ciWorkflow = workflows[".github/workflows/ci.yml"]!;
  const featurePushBranches = triggerBranches(ciWorkflow, "push").filter(
    (branch) => branch !== "main",
  );
  if (featurePushBranches.length > 0) {
    throw new Error(
      `CI feature-branch push triggers duplicate pull-request evidence: ${featurePushBranches.join(", ")}.`,
    );
  }
  const qaseRunSourceLine = ciWorkflow
    .split("\n")
    .find((line) => line.includes("QASE_RUN_SOURCE:"));
  if (
    !qaseRunSourceLine ||
    !/^\s*QASE_RUN_SOURCE:\s+"\$\{\{.+\}\}"\s*$/.test(qaseRunSourceLine)
  ) {
    throw new Error(
      "CI QASE_RUN_SOURCE expression must be fully quoted so YAML preserves hash characters.",
    );
  }
  for (const requiredControl of [
    "pnpm run test:testing-cadence",
    "pnpm run test:release-contract",
    "pnpm run test:gcp-platform",
    "pnpm run test:experience-budgets",
    "customer-experience-budgets",
    "Samra Pay daily backend acceptance",
    "if: github.event_name == 'schedule' || inputs.run_commercial == 'true'",
  ]) {
    if (!ciWorkflow.includes(requiredControl)) {
      throw new Error(
        `CI workflow is missing required control ${requiredControl}.`,
      );
    }
  }
  if (!/run_commercial:[\s\S]*?default: "true"/.test(ciWorkflow)) {
    throw new Error(
      "Release dispatch must include the commercial gate by default.",
    );
  }

  const resilienceWorkflow =
    workflows[".github/workflows/backend-resilience.yml"]!;
  const resilienceReportActionCount = (
    resilienceWorkflow.match(/uses:\s+qase-tms\/gh-actions\/report@v1/g) ?? []
  ).length;
  if (resilienceReportActionCount !== 1) {
    throw new Error(
      `Weekly resilience must upload its Qase evidence in one batch; found ${resilienceReportActionCount} report actions.`,
    );
  }
  for (const requiredControl of [
    "id: qase-upload-resilience",
    "path: test-results",
    "qase-upload-resilience.outcome == 'success'",
  ]) {
    if (!resilienceWorkflow.includes(requiredControl)) {
      throw new Error(
        `Weekly resilience workflow is missing batch control ${requiredControl}.`,
      );
    }
  }
  for (const duplicateTrigger of [
    '      - "docs/testing/**"',
    '      - "scripts/src/validate-testing-cadence*"',
  ]) {
    if (resilienceWorkflow.includes(duplicateTrigger)) {
      throw new Error(
        `Weekly resilience PR trigger duplicates CI governance coverage: ${duplicateTrigger.trim()}.`,
      );
    }
  }

  const allPaths: string[] = [];
  for (const surface of policy.surfaces) {
    const risk = policy.riskTiers.find(({ id }) => id === surface.risk);
    if (!risk) {
      throw new Error(`${surface.id} references unknown risk ${surface.risk}.`);
    }
    if (surface.paths.length === 0 || surface.cadences.length === 0) {
      throw new Error(`${surface.id} must define paths and cadences.`);
    }
    for (const cadence of surface.cadences) {
      if (!cadenceIds.has(cadence)) {
        throw new Error(`${surface.id} references unknown cadence ${cadence}.`);
      }
    }
    for (const cadence of risk.requiredCadences) {
      if (!surface.cadences.includes(cadence)) {
        throw new Error(
          `${surface.id} does not satisfy ${surface.risk} cadence ${cadence}.`,
        );
      }
    }
    for (const pathPattern of surface.paths) {
      if (!pathPattern.trim()) {
        throw new Error(`${surface.id} contains an empty path pattern.`);
      }
      allPaths.push(pathPattern);
    }
  }
  assertUnique(allPaths, "Governed path patterns");

  if (policy.stopConditions.length < 6 || policy.boundaries.length < 4) {
    throw new Error(
      "Testing policy must preserve stop conditions and boundaries.",
    );
  }
  if (
    !policy.stopConditions.some(
      (condition) =>
        condition.includes("artifact") && condition.includes("raw or gzip"),
    )
  ) {
    throw new Error(
      "Testing policy must stop on experience budget regressions.",
    );
  }
  for (const requiredDocumentation of [
    "testing-cadence.json",
    "06:17 UTC",
    "github-ci-postgres",
    "Merge and release stop conditions",
    "Replit",
  ]) {
    if (!documentation.includes(requiredDocumentation)) {
      throw new Error(`Testing strategy is missing ${requiredDocumentation}.`);
    }
  }
}

function main(): void {
  const policy = JSON.parse(
    fs.readFileSync(POLICY_PATH, "utf8"),
  ) as TestingCadencePolicy;
  const workflowDirectory = path.join(WORKSPACE_ROOT, ".github/workflows");
  const workflowPaths = fs
    .readdirSync(workflowDirectory)
    .filter(
      (filename) => filename.endsWith(".yml") || filename.endsWith(".yaml"),
    )
    .map((filename) => `.github/workflows/${filename}`);
  const workflows = Object.fromEntries(
    workflowPaths.map((relativePath) => [
      relativePath,
      fs.readFileSync(path.join(WORKSPACE_ROOT, relativePath), "utf8"),
    ]),
  );
  validateTestingCadence(
    policy,
    workflows,
    fs.readFileSync(DOCUMENTATION_PATH, "utf8"),
  );
  console.log(
    `Testing cadence valid: ${policy.riskTiers.length} risk tiers, ${policy.cadences.length} cadences, ${policy.surfaces.length} product surfaces.`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) main();
