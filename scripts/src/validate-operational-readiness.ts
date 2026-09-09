#!/usr/bin/env tsx

import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const WORKSPACE_ROOT = path.resolve(import.meta.dirname, "../..");
const CONTRACT_PATH = path.join(
  WORKSPACE_ROOT,
  "docs/operations/operational-readiness.json",
);
const BACKEND_RESILIENCE_WORKFLOW_PATH = path.join(
  WORKSPACE_ROOT,
  ".github/workflows/backend-resilience.yml",
);
const API_PACKAGE_PATH = path.join(
  WORKSPACE_ROOT,
  "artifacts/api-server/package.json",
);
const SCRIPTS_PACKAGE_PATH = path.join(WORKSPACE_ROOT, "scripts/package.json");
const WORKSPACE_PACKAGE_PATH = path.join(WORKSPACE_ROOT, "package.json");

type Pillar = Readonly<{
  id: string;
  state: string;
  evidencePaths: readonly string[];
  blockingConditions: readonly string[];
}>;

type IncidentRole = Readonly<{ id: string; owner: string | null }>;
type Severity = Readonly<{
  id: string;
  meaning: string;
  pageRequiredWhenStaffed: boolean;
}>;
type Runbook = Readonly<{ id: string; path: string }>;
type ServiceObjective = Readonly<{
  id: string;
  indicator: string;
  target: number | null;
  window: string | null;
  alertConfigured: boolean;
}>;
type ProviderState = Readonly<{
  id: string;
  allowNewEconomicCommands: boolean;
}>;
type HardStop = Readonly<{
  id: string;
  state: string;
  condition: string;
}>;

export type OperationalReadinessContract = Readonly<{
  version: number;
  status: string;
  productionApproval: string;
  scope: string;
  pillars: readonly Pillar[];
  telemetry: Readonly<{
    runtimeOutput: string;
    protocol: string;
    transport: string;
    backend: string | null;
    exportState: string;
    collectorEndpointConfigured: boolean;
    browserRuntimeDependencies: readonly string[];
    requiredEventFields: readonly string[];
    allowedMetricDimensions: readonly string[];
    forbiddenData: readonly string[];
    rawBodiesAllowed: boolean;
    customerDataAllowed: boolean;
    unboundedIdentifiersAllowedAsDimensions: boolean;
  }>;
  incidentResponse: Readonly<{
    coverage: string;
    rosterApproved: boolean;
    pagingConfigured: boolean;
    communicationsChannelConfigured: boolean;
    targetsApproved: boolean;
    acknowledgementMinutes: number | null;
    mitigationMinutes: number | null;
    roles: readonly IncidentRole[];
    severities: readonly Severity[];
    runbooks: readonly Runbook[];
  }>;
  serviceLevels: Readonly<{
    status: string;
    telemetrySourceConfigured: boolean;
    errorBudgetsApproved: boolean;
    objectives: readonly ServiceObjective[];
  }>;
  dataRecovery: Readonly<{
    syntheticLogicalRestore: string;
    syntheticEvidencePaths: readonly string[];
    cloudRestore: string;
    backupFreshnessMonitoringConfigured: boolean;
    productionRpoMinutes: number | null;
    productionRtoMinutes: number | null;
    dumpRetentionAllowed: boolean;
    evidenceMayContainCustomerData: boolean;
  }>;
  providerResilience: Readonly<{
    healthSignalConfigured: boolean;
    states: readonly ProviderState[];
    retryPolicy: Readonly<{
      state: string;
      requiresDurableIdempotency: boolean;
      respectsRetryAfter: boolean;
      requiresBoundedBackoffAndJitter: boolean;
    }>;
  }>;
  hardStops: readonly HardStop[];
}>;

type PackageManifest = Readonly<{
  scripts?: Readonly<Record<string, string>>;
}>;

export type OperationalReadinessValidationInputs = Readonly<{
  evidencePathExists: (relativePath: string) => boolean;
  backendResilienceWorkflow: string;
  apiPackage: PackageManifest;
  scriptsPackage: PackageManifest;
  workspacePackage: PackageManifest;
}>;

const REQUIRED_PILLAR_STATES = {
  telemetry: "specified-not-connected",
  "incident-response": "documented-not-staffed",
  "service-levels": "defined-not-monitored",
  "data-recovery": "synthetic-gate-only",
  "provider-resilience": "runbook-only",
} as const;

const REQUIRED_EVENT_FIELDS = [
  "service",
  "environment",
  "revision",
  "requestId",
  "traceId",
  "event",
  "severity",
  "outcome",
  "durationMs",
] as const;

const REQUIRED_METRIC_DIMENSIONS = [
  "service",
  "environment",
  "revision",
  "event",
  "severity",
  "outcome",
] as const;

const REQUIRED_FORBIDDEN_DATA = [
  "authorization",
  "cookie",
  "password",
  "secret",
  "token",
  "email",
  "phone",
  "bankAccountNumber",
  "walletAddress",
  "customerId",
  "providerPayload",
  "requestBody",
  "responseBody",
] as const;

const REQUIRED_ROLES = [
  "incident-commander",
  "technical-lead",
  "operations-lead",
  "security-lead",
  "communications-lead",
  "scribe",
] as const;

const REQUIRED_RUNBOOKS = {
  "api-outage": "docs/operations/runbooks/api-outage.md",
  "credential-compromise": "docs/operations/runbooks/credential-compromise.md",
  "database-recovery": "docs/operations/runbooks/database-recovery.md",
  "ledger-integrity-breach":
    "docs/operations/runbooks/ledger-integrity-breach.md",
  "provider-unknown": "docs/operations/runbooks/provider-unknown.md",
  "reconciliation-stall": "docs/operations/runbooks/reconciliation-stall.md",
} as const;

const REQUIRED_SERVICE_OBJECTIVES = [
  "api-availability",
  "ledger-integrity",
  "reconciliation-freshness",
  "provider-state-known",
] as const;

const REQUIRED_RECOVERY_EVIDENCE = [
  "artifacts/api-server/test-results/weekly-backup-restore.xml",
  "artifacts/api-server/test-results/weekly-backup-restore.json",
] as const;

const REQUIRED_SCOPE =
  "Repository controls and synthetic non-production rehearsal only. This contract does not activate a telemetry backend, paging, cloud recovery, provider traffic, customer data, deployment, DNS, public traffic, or spend.";

const REQUIRED_HARD_STOPS = {
  "production-evidence":
    "No production-readiness claim until every blocking condition has objective current evidence.",
  "customer-data":
    "No customer data before retention, deletion, access, privacy, and incident controls are approved.",
  "live-provider":
    "No live provider, bank, wallet, or payout traffic before separately reviewed activation and recovery evidence.",
  "cloud-recovery":
    "No Cloud SQL recovery claim before backup freshness and an authorized restore-to-isolated-clone drill pass.",
  "service-level-claims":
    "No production RPO, RTO, availability, or response-time claim before targets and measurement are approved.",
  "incident-coverage":
    "No incident coverage claim before a named roster, staffed rotation, paging route, and drill exist.",
  "telemetry-activation":
    "No telemetry backend, collector endpoint, dashboard, alert route, or retention change without separate authorization.",
  "sensitive-evidence":
    "No credential, PII, financial payload, provider payload, or raw body in logs, traces, metrics, or evidence.",
  "automatic-economic-retry":
    "No automatic economic retry without the same durable idempotency key, bounded classification, and independent evidence.",
  "database-dump":
    "No database dump in retained CI, Qase, support, screenshot, release, or incident evidence.",
} as const;

function assertUnique(values: readonly string[], label: string): void {
  const duplicates = values.filter(
    (value, index) => values.indexOf(value) !== index,
  );
  if (duplicates.length > 0) {
    throw new Error(`${label} contains duplicates: ${duplicates.join(", ")}.`);
  }
}

function assertExactSet(
  actual: readonly string[],
  required: readonly string[],
  label: string,
): void {
  assertUnique(actual, label);
  const missing = required.filter((value) => !actual.includes(value));
  const unexpected = actual.filter((value) => !required.includes(value));
  if (missing.length > 0 || unexpected.length > 0) {
    throw new Error(
      `${label} must be exact; missing [${missing.join(", ")}], unexpected [${unexpected.join(", ")}].`,
    );
  }
}

function assertRepositoryEvidencePath(
  relativePath: string,
  label: string,
  pathExists: (relativePath: string) => boolean,
): void {
  if (
    path.isAbsolute(relativePath) ||
    relativePath.split(/[\\/]/u).includes("..") ||
    path.posix.normalize(relativePath) !== relativePath ||
    !pathExists(relativePath)
  ) {
    throw new Error(`${label} has unavailable evidence path ${relativePath}.`);
  }
}

function indentation(line: string): number {
  return line.length - line.trimStart().length;
}

function assertCanonicalWorkflowMappingSyntax(workflow: string): void {
  const controlKeys = [
    "if",
    "continue-on-error",
    "run",
    "uses",
    "with",
    "env",
    "path",
    "if-no-files-found",
    "runs-on",
  ].join("|");
  const alternateControlKey = new RegExp(
    `^\\s*(?:["'](?:${controlKeys})["']|<<)\\s*:|^\\s*\\?|^\\s*(?:!!|!<)`,
    "u",
  );
  const offendingLine = workflow
    .split("\n")
    .find(
      (line) =>
        !line.trimStart().startsWith("#") && alternateControlKey.test(line),
    );
  if (offendingLine) {
    throw new Error(
      "Backend resilience workflow must use canonical unquoted mapping keys without YAML merge, explicit-key, or tag syntax.",
    );
  }
}

function exactBlock(
  source: string,
  marker: string,
  nextMarker: RegExp,
  label: string,
): string {
  const lines = source.split("\n");
  const starts = lines.flatMap((line, index) =>
    line === marker ? [index] : [],
  );
  if (starts.length !== 1) {
    throw new Error(`${label} must appear exactly once.`);
  }
  const start = starts[0]!;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (nextMarker.test(lines[index]!)) {
      end = index;
      break;
    }
  }
  return lines.slice(start + 1, end).join("\n");
}

function readJob(workflow: string, name: string): string {
  return exactBlock(
    workflow,
    `  ${name}:`,
    /^  [a-zA-Z0-9_-]+:\s*$/u,
    `Workflow job ${name}`,
  );
}

function readNamedStep(job: string, name: string): string {
  return exactBlock(
    job,
    `      - name: ${name}`,
    /^      - name: /u,
    `Workflow step ${name}`,
  );
}

function optionalScalar(
  source: string,
  indent: number,
  key: string,
): string | undefined {
  const prefix = " ".repeat(indent);
  const expression = new RegExp(
    `^${prefix}${key.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}:\\s*(.*?)\\s*$`,
    "u",
  );
  const matches = source
    .split("\n")
    .flatMap((line) => expression.exec(line)?.[1] ?? [])
    .map((value) => value.replace(/\s+#.*$/u, "").trimEnd());
  if (matches.length > 1) {
    throw new Error(
      `${key} must appear at most once at indentation ${indent}.`,
    );
  }
  return matches[0];
}

function scalar(source: string, indent: number, key: string): string {
  const value = optionalScalar(source, indent, key);
  if (value === undefined) {
    throw new Error(`${key} is missing at indentation ${indent}.`);
  }
  return value;
}

function nestedSection(source: string, indent: number, key: string): string {
  const marker = `${" ".repeat(indent)}${key}:`;
  const lines = source.split("\n");
  const starts = lines.flatMap((line, index) =>
    line === marker ? [index] : [],
  );
  if (starts.length !== 1) {
    throw new Error(
      `${key} must appear exactly once at indentation ${indent}.`,
    );
  }
  const start = starts[0]!;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (line.trim() && indentation(line) <= indent) {
      end = index;
      break;
    }
  }
  return lines.slice(start + 1, end).join("\n");
}

function literalLines(source: string, indent: number, key: string): string[] {
  const marker = `${" ".repeat(indent)}${key}: |`;
  const lines = source.split("\n");
  const starts = lines.flatMap((line, index) =>
    line === marker ? [index] : [],
  );
  if (starts.length !== 1) {
    throw new Error(`${key} literal must appear exactly once.`);
  }
  const start = starts[0]!;
  const values: string[] = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (line.trim() && indentation(line) <= indent) break;
    const value = line.trim();
    if (value && !value.startsWith("#")) values.push(value);
  }
  return values;
}

function assertWorkflowBinding(
  workflow: string,
  apiPackage: OperationalReadinessValidationInputs["apiPackage"],
): void {
  assertCanonicalWorkflowMappingSyntax(workflow);
  const script = apiPackage.scripts?.["test:weekly-backup-restore:junit"];
  const requiredScript =
    "node test/run-with-junit.mjs test-results/weekly-backup-restore.xml 'Synthetic PostgreSQL backup and restore' test/weekly-backup-restore.test.ts 'Weekly Backend Resilience'";
  if (script !== requiredScript) {
    throw new Error("API package backup-and-restore JUnit script drifted.");
  }

  const resilienceJob = readJob(workflow, "resilience");
  if (scalar(resilienceJob, 4, "runs-on") !== "ubuntu-24.04") {
    throw new Error(
      "Backend resilience must use the pinned ubuntu-24.04 runner label.",
    );
  }
  if (
    optionalScalar(resilienceJob, 4, "if") !== undefined ||
    optionalScalar(resilienceJob, 4, "continue-on-error") !== undefined
  ) {
    throw new Error(
      "Backend resilience job cannot be skipped or non-blocking.",
    );
  }
  const jobEnvironment = nestedSection(resilienceJob, 4, "env");
  const requiredProfile =
    "postgresql://samra_resilience:samra_resilience@127.0.0.1:5432/samra_resilience";
  if (scalar(jobEnvironment, 6, "TEST_DATABASE_URL") !== requiredProfile) {
    throw new Error(
      `Backend resilience workflow requires disposable profile ${requiredProfile}.`,
    );
  }

  const runStep = readNamedStep(
    resilienceJob,
    "Run synthetic backup and restore rehearsal",
  );
  if (scalar(runStep, 8, "if") !== "${{ !cancelled() }}") {
    throw new Error(
      "Recovery rehearsal must run after prior non-cancelled failures.",
    );
  }
  if (
    scalar(runStep, 8, "run") !==
    "pnpm --filter @workspace/api-server run test:weekly-backup-restore:junit"
  ) {
    throw new Error("Recovery rehearsal step has a missing or inert command.");
  }
  if (optionalScalar(runStep, 8, "continue-on-error") !== undefined) {
    throw new Error("Weekly recovery rehearsal cannot continue on error.");
  }
  const recoveryEnvironment = nestedSection(runStep, 8, "env");
  const requiredEnvironment = {
    SAMRA_DISPOSABLE_BACKUP_RESTORE_CONFIRMATION:
      "I_UNDERSTAND_THIS_DROPS_DISPOSABLE_LOCAL_DATABASES",
    SAMRA_POSTGRES_CLIENT_IMAGE:
      "postgres:16@sha256:f1c3376c26f2609ab9f29f71f824103fe2fcd8ee0346485cb6122a4f93df6f94",
    SAMRA_RECOVERY_CANDIDATE_SHA: "${{ github.sha }}",
    WEEKLY_BACKUP_RESTORE_RESULTS_PATH:
      "test-results/weekly-backup-restore.json",
  } as const;
  for (const [key, expected] of Object.entries(requiredEnvironment)) {
    if (scalar(recoveryEnvironment, 10, key) !== expected) {
      throw new Error(`Recovery rehearsal environment ${key} drifted.`);
    }
  }

  const junitUpload = readNamedStep(
    resilienceJob,
    "Preserve weekly resilience evidence",
  );
  const junitWith = nestedSection(junitUpload, 8, "with");
  if (
    scalar(junitUpload, 8, "if") !== "always()" ||
    scalar(junitUpload, 8, "uses") !==
      "actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a" ||
    optionalScalar(junitUpload, 8, "continue-on-error") !== undefined ||
    !literalLines(junitWith, 10, "path").includes(
      "artifacts/api-server/test-results/weekly-backup-restore.xml",
    ) ||
    scalar(junitWith, 10, "if-no-files-found") !== "error"
  ) {
    throw new Error("Weekly recovery JUnit evidence must fail closed.");
  }

  const jsonUpload = readNamedStep(
    resilienceJob,
    "Preserve synthetic recovery evidence",
  );
  const jsonWith = nestedSection(jsonUpload, 8, "with");
  if (
    scalar(jsonUpload, 8, "if") !== "always()" ||
    scalar(jsonUpload, 8, "uses") !==
      "actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a" ||
    optionalScalar(jsonUpload, 8, "continue-on-error") !== undefined ||
    scalar(jsonWith, 10, "path") !==
      "artifacts/api-server/test-results/weekly-backup-restore.json" ||
    scalar(jsonWith, 10, "if-no-files-found") !== "error"
  ) {
    throw new Error("Synthetic recovery evidence upload must fail closed.");
  }
  if (/\.dump(?:\s|$)/mu.test(workflow)) {
    throw new Error(
      "Backend resilience workflow must never retain a database dump.",
    );
  }

  const evidenceJob = readJob(workflow, "test-evidence");
  const evidenceValidation = readNamedStep(
    evidenceJob,
    "Validate weekly resilience JUnit payloads",
  );
  if (
    optionalScalar(evidenceValidation, 8, "if") !== undefined ||
    optionalScalar(evidenceValidation, 8, "continue-on-error") !== undefined
  ) {
    throw new Error("Recovery evidence validation cannot be skipped.");
  }
  const evidenceCommands = literalLines(evidenceValidation, 8, "run");
  const requiredEvidenceCommands = [
    "for report in \\",
    "test-results/weekly-concurrency-soak.xml \\",
    "test-results/weekly-randomized-ledger.xml \\",
    "test-results/weekly-fault-injection.xml \\",
    "test-results/weekly-migration-compatibility.xml \\",
    "test-results/weekly-backup-restore.xml",
    "do",
    'test -s "$report"',
    "grep -q '<testsuite ' \"$report\"",
    "grep -q '<testcase ' \"$report\"",
    "done",
  ];
  if (
    JSON.stringify(evidenceCommands) !==
    JSON.stringify(requiredEvidenceCommands)
  ) {
    throw new Error(
      "Evidence validation is missing executable weekly recovery JUnit checks.",
    );
  }
}

function assertPackageWiring(
  inputs: OperationalReadinessValidationInputs,
): void {
  if (
    inputs.scriptsPackage.scripts?.["validate-operational-readiness"] !==
    "tsx ./src/validate-operational-readiness.ts"
  ) {
    throw new Error("Scripts package operational-readiness command drifted.");
  }
  if (
    inputs.workspacePackage.scripts?.["test:operational-readiness"] !==
    "pnpm --filter @workspace/scripts run validate-operational-readiness"
  ) {
    throw new Error("Workspace operational-readiness command drifted.");
  }
}

export function validateOperationalReadiness(
  contract: OperationalReadinessContract,
  inputs: OperationalReadinessValidationInputs,
): void {
  if (
    contract.version !== 1 ||
    contract.status !== "prepared-not-approved" ||
    contract.productionApproval !== "blocked"
  ) {
    throw new Error(
      "Operational readiness must remain version 1, prepared-not-approved, and production-blocked.",
    );
  }
  if (contract.scope !== REQUIRED_SCOPE) {
    throw new Error(
      "Operational readiness scope must remain synthetic, non-production, and non-activating.",
    );
  }

  assertExactSet(
    contract.pillars.map(({ id }) => id),
    Object.keys(REQUIRED_PILLAR_STATES),
    "Operational pillar IDs",
  );
  for (const pillar of contract.pillars) {
    if (
      pillar.state !==
      REQUIRED_PILLAR_STATES[pillar.id as keyof typeof REQUIRED_PILLAR_STATES]
    ) {
      throw new Error(`${pillar.id} has an unsafe or overstated state.`);
    }
    if (
      pillar.evidencePaths.length === 0 ||
      pillar.blockingConditions.length === 0 ||
      pillar.blockingConditions.some((condition) => !condition.trim())
    ) {
      throw new Error(
        `${pillar.id} requires evidence paths and blocking conditions.`,
      );
    }
    assertUnique(pillar.evidencePaths, `${pillar.id} evidence paths`);
    for (const evidencePath of pillar.evidencePaths) {
      assertRepositoryEvidencePath(
        evidencePath,
        pillar.id,
        inputs.evidencePathExists,
      );
    }
  }

  const telemetry = contract.telemetry;
  if (
    telemetry.runtimeOutput !== "structured-json-stdout" ||
    telemetry.protocol !== "otlp" ||
    telemetry.transport !== "http/protobuf" ||
    telemetry.backend !== null ||
    telemetry.exportState !== "disabled-not-authorized" ||
    telemetry.collectorEndpointConfigured ||
    telemetry.browserRuntimeDependencies.length !== 0
  ) {
    throw new Error(
      "Telemetry must remain structured JSON stdout with vendor-neutral OTLP future-only, disconnected, and disabled without browser dependencies.",
    );
  }
  assertExactSet(
    telemetry.requiredEventFields,
    REQUIRED_EVENT_FIELDS,
    "Telemetry event fields",
  );
  assertExactSet(
    telemetry.allowedMetricDimensions,
    REQUIRED_METRIC_DIMENSIONS,
    "Telemetry metric dimensions",
  );
  for (const forbidden of REQUIRED_FORBIDDEN_DATA) {
    if (!telemetry.forbiddenData.includes(forbidden)) {
      throw new Error(`Telemetry must forbid ${forbidden}.`);
    }
  }
  const unsafeDimensions = telemetry.allowedMetricDimensions.filter((field) =>
    [
      "requestId",
      "traceId",
      "customerId",
      "userId",
      "providerReference",
      "email",
      "phone",
    ].includes(field),
  );
  if (
    unsafeDimensions.length > 0 ||
    telemetry.rawBodiesAllowed ||
    telemetry.customerDataAllowed ||
    telemetry.unboundedIdentifiersAllowedAsDimensions
  ) {
    throw new Error(
      `Telemetry payload or cardinality boundary is unsafe: ${unsafeDimensions.join(", ") || "raw, customer, or unbounded data"}.`,
    );
  }

  const incident = contract.incidentResponse;
  if (
    incident.coverage !== "absent" ||
    incident.rosterApproved ||
    incident.pagingConfigured ||
    incident.communicationsChannelConfigured ||
    incident.targetsApproved ||
    incident.acknowledgementMinutes !== null ||
    incident.mitigationMinutes !== null
  ) {
    throw new Error(
      "Incident response must not claim unstaffed coverage, routing, or targets.",
    );
  }
  assertExactSet(
    incident.roles.map(({ id }) => id),
    REQUIRED_ROLES,
    "Incident role IDs",
  );
  if (incident.roles.some(({ owner }) => owner !== null)) {
    throw new Error(
      "Incident roles must remain unassigned until a roster is approved.",
    );
  }
  assertExactSet(
    incident.severities.map(({ id }) => id),
    ["SEV0", "SEV1", "SEV2", "SEV3"],
    "Incident severity IDs",
  );
  for (const severity of incident.severities) {
    if (!severity.meaning.trim()) {
      throw new Error(`${severity.id} requires a meaning.`);
    }
    const shouldPage = severity.id === "SEV0" || severity.id === "SEV1";
    if (severity.pageRequiredWhenStaffed !== shouldPage) {
      throw new Error(`${severity.id} has an unsafe future paging policy.`);
    }
  }
  assertExactSet(
    incident.runbooks.map(({ id }) => id),
    Object.keys(REQUIRED_RUNBOOKS),
    "Incident runbook IDs",
  );
  for (const runbook of incident.runbooks) {
    const requiredPath =
      REQUIRED_RUNBOOKS[runbook.id as keyof typeof REQUIRED_RUNBOOKS];
    if (runbook.path !== requiredPath) {
      throw new Error(`${runbook.id} must use governed path ${requiredPath}.`);
    }
    assertRepositoryEvidencePath(
      runbook.path,
      runbook.id,
      inputs.evidencePathExists,
    );
  }

  const serviceLevels = contract.serviceLevels;
  if (
    serviceLevels.status !== "definitions-only" ||
    serviceLevels.telemetrySourceConfigured ||
    serviceLevels.errorBudgetsApproved
  ) {
    throw new Error(
      "Service levels must remain definitions-only without telemetry or approved error budgets.",
    );
  }
  assertExactSet(
    serviceLevels.objectives.map(({ id }) => id),
    REQUIRED_SERVICE_OBJECTIVES,
    "Service objective IDs",
  );
  for (const objective of serviceLevels.objectives) {
    if (
      !objective.indicator.trim() ||
      objective.target !== null ||
      objective.window !== null ||
      objective.alertConfigured
    ) {
      throw new Error(
        `${objective.id} must not claim an unapproved target, window, or alert.`,
      );
    }
  }

  const recovery = contract.dataRecovery;
  if (
    recovery.syntheticLogicalRestore !== "configured-ci-only" ||
    recovery.cloudRestore !== "not-tested" ||
    recovery.backupFreshnessMonitoringConfigured ||
    recovery.productionRpoMinutes !== null ||
    recovery.productionRtoMinutes !== null ||
    recovery.dumpRetentionAllowed ||
    recovery.evidenceMayContainCustomerData
  ) {
    throw new Error(
      "Recovery must not claim cloud proof, freshness monitoring, RPO/RTO, dump retention, or customer-data evidence.",
    );
  }
  assertExactSet(
    recovery.syntheticEvidencePaths,
    REQUIRED_RECOVERY_EVIDENCE,
    "Synthetic recovery evidence paths",
  );

  const provider = contract.providerResilience;
  if (provider.healthSignalConfigured) {
    throw new Error("Provider health must remain unconfigured in this slice.");
  }
  assertExactSet(
    provider.states.map(({ id }) => id),
    ["healthy", "degraded", "unavailable", "misconfigured", "unknown"],
    "Provider state IDs",
  );
  for (const state of provider.states) {
    if (state.allowNewEconomicCommands !== (state.id === "healthy")) {
      throw new Error(`${state.id} has an unsafe economic-command decision.`);
    }
  }
  const retry = provider.retryPolicy;
  if (
    retry.state !== "not-authorized" ||
    !retry.requiresDurableIdempotency ||
    !retry.respectsRetryAfter ||
    !retry.requiresBoundedBackoffAndJitter
  ) {
    throw new Error(
      "Provider retry must remain unauthorized and require durable, bounded controls.",
    );
  }

  assertExactSet(
    contract.hardStops.map(({ id }) => id),
    Object.keys(REQUIRED_HARD_STOPS),
    "Operational hard-stop IDs",
  );
  for (const hardStop of contract.hardStops) {
    const requiredCondition =
      REQUIRED_HARD_STOPS[hardStop.id as keyof typeof REQUIRED_HARD_STOPS];
    if (
      hardStop.state !== "blocked" ||
      hardStop.condition !== requiredCondition
    ) {
      throw new Error(
        `${hardStop.id} must remain blocked with its exact governed condition.`,
      );
    }
  }

  assertWorkflowBinding(inputs.backendResilienceWorkflow, inputs.apiPackage);
  assertPackageWiring(inputs);
}

export function buildOperationalReadinessReport(
  contract: OperationalReadinessContract,
  inputs: OperationalReadinessValidationInputs,
  provenance: Readonly<{
    candidateSha: string;
    checkedOutSha: string;
    sourceTreeClean: boolean;
    observedAt: string;
  }>,
) {
  validateOperationalReadiness(contract, inputs);
  if (
    typeof provenance.candidateSha !== "string" ||
    !/^[0-9a-f]{40}$/.test(provenance.candidateSha) ||
    provenance.candidateSha !== provenance.checkedOutSha ||
    typeof provenance.sourceTreeClean !== "boolean" ||
    !Number.isFinite(Date.parse(provenance.observedAt))
  ) {
    throw new Error(
      "Readiness report requires exact checked-out SHA and timestamp.",
    );
  }
  return {
    schemaVersion: 1,
    status: "production-blocked",
    productionReady: false,
    deploymentAuthorized: false,
    candidateSha: provenance.candidateSha,
    checkedOutSha: provenance.checkedOutSha,
    sourceTreeClean: provenance.sourceTreeClean,
    observedAt: provenance.observedAt,
    evidenceEligible: provenance.sourceTreeClean,
    contractPath: "docs/operations/operational-readiness.json",
    contractSha256: createHash("sha256")
      .update(JSON.stringify(contract))
      .digest("hex"),
    contractHashEncoding: "JSON.stringify UTF-8",
    productionApproval: contract.productionApproval,
    pillars: contract.pillars.map(
      ({ id, state, blockingConditions, evidencePaths }) => ({
        id,
        state,
        blockingConditions,
        evidencePaths,
      }),
    ),
    hardStops: contract.hardStops,
  } as const;
}

export function requireProductionReadiness(
  contract: OperationalReadinessContract,
  inputs: OperationalReadinessValidationInputs,
): void {
  // Consult the governed source contract, never a caller-supplied green report.
  validateOperationalReadiness(contract, inputs);
  if (
    contract.productionApproval !== "approved" ||
    contract.hardStops.some((stop) => stop.state === "blocked") ||
    contract.pillars.some((pillar) => pillar.blockingConditions.length > 0)
  ) {
    throw new Error(
      "Production-ready claim rejected: operational readiness remains blocked.",
    );
  }
}

function main(): void {
  const options = new Map<string, string>();
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index++) {
    const key = args[index]!;
    if (
      !["--report", "--candidate-sha", "--claim", "--require-clean"].includes(
        key,
      ) ||
      options.has(key)
    ) {
      throw new Error("Unknown or duplicate readiness argument.");
    }
    const value = key === "--require-clean" ? "true" : args[++index];
    if (!value || value.startsWith("--"))
      throw new Error("Missing readiness argument value.");
    options.set(key, value);
  }
  if (options.has("--claim") && options.get("--claim") !== "production-ready") {
    throw new Error("Unsupported readiness claim.");
  }
  if (
    !options.has("--report") &&
    (options.has("--candidate-sha") || options.has("--require-clean"))
  ) {
    throw new Error("Candidate and clean-tree flags require a report.");
  }
  const contract = JSON.parse(
    fs.readFileSync(CONTRACT_PATH, "utf8"),
  ) as OperationalReadinessContract;
  const apiPackage = JSON.parse(
    fs.readFileSync(API_PACKAGE_PATH, "utf8"),
  ) as OperationalReadinessValidationInputs["apiPackage"];
  const scriptsPackage = JSON.parse(
    fs.readFileSync(SCRIPTS_PACKAGE_PATH, "utf8"),
  ) as OperationalReadinessValidationInputs["scriptsPackage"];
  const workspacePackage = JSON.parse(
    fs.readFileSync(WORKSPACE_PACKAGE_PATH, "utf8"),
  ) as OperationalReadinessValidationInputs["workspacePackage"];
  const inputs: OperationalReadinessValidationInputs = {
    evidencePathExists: (relativePath) =>
      fs.existsSync(path.join(WORKSPACE_ROOT, relativePath)),
    backendResilienceWorkflow: fs.readFileSync(
      BACKEND_RESILIENCE_WORKFLOW_PATH,
      "utf8",
    ),
    apiPackage,
    scriptsPackage,
    workspacePackage,
  };
  validateOperationalReadiness(contract, inputs);
  if (options.has("--report")) {
    const git = (args: string[]) =>
      execFileSync("git", ["-C", WORKSPACE_ROOT, ...args], {
        encoding: "utf8",
        timeout: 10_000,
        maxBuffer: 2 * 1024 * 1024,
      }).trim();
    const clean =
      git(["status", "--porcelain", "--untracked-files=normal"]) === "";
    if (options.has("--require-clean") && !clean)
      throw new Error("Readiness evidence requires a clean source tree.");
    const report = buildOperationalReadinessReport(contract, inputs, {
      candidateSha: options.get("--candidate-sha") ?? "",
      checkedOutSha: git(["rev-parse", "HEAD"]),
      sourceTreeClean: clean,
      observedAt: new Date().toISOString(),
    });
    const output = path.resolve(WORKSPACE_ROOT, options.get("--report")!);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
  }
  if (options.has("--claim")) {
    try {
      requireProductionReadiness(contract, inputs);
    } catch (error) {
      console.error(
        error instanceof Error ? error.message : "Readiness claim rejected.",
      );
      process.exitCode = 2;
      return;
    }
  }
  console.log(
    `Operational readiness valid: ${contract.pillars.length} bounded pillars; production remains ${contract.productionApproval}.`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  try {
    main();
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Readiness validation failed.",
    );
    process.exitCode = 1;
  }
}
