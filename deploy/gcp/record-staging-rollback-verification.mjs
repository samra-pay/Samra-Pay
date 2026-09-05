import { createHash } from "node:crypto";
import { lstat, mkdir, open, readFile, unlink } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { validateStagingRollbackManifest } from "./record-staging-traffic-control.mjs";
import { STAGING_TRAFFIC_SERVICES } from "./validate-staging-traffic-control.mjs";

const SOURCE_REPOSITORY = "samra-pay/Samra-Pay";
const PROJECT_ID = "samra-pay-staging";
const PROJECT_NUMBER = "934122615631";
const REGION = "us-east4";
const ROLLBACK_CONTROLLER_IDENTITY =
  "samra-github-rollback-staging@samra-pay-staging.iam.gserviceaccount.com";
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const REVISION_PATTERN = /^[a-z]([a-z0-9-]{0,61}[a-z0-9])?$/;

const TOP_LEVEL_KEYS = Object.freeze([
  "appendOnly",
  "applicationVerification",
  "candidateSha",
  "controllerIdentity",
  "controllerSha",
  "dataClassification",
  "environment",
  "failedRevision",
  "fullRecoveryClaimed",
  "generatedAt",
  "github",
  "infrastructure",
  "mutations",
  "projectId",
  "projectNumber",
  "region",
  "releaseId",
  "restoredRevision",
  "rollbackEvidence",
  "schemaVersion",
  "scope",
  "service",
  "sourceRepository",
  "status",
  "verificationMode",
]);
const OBSERVED_INFRASTRUCTURE_KEYS = Object.freeze([
  "defaultServiceUrlDisabled",
  "imageDigest",
  "ingress",
  "projectId",
  "publicIamAbsent",
  "region",
  "restoredRevision",
  "revisionReady",
  "service",
  "traffic",
]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertPlainObject(value, label) {
  assert(
    value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      (Object.getPrototypeOf(value) === Object.prototype ||
        Object.getPrototypeOf(value) === null),
    `${label} must be a plain object`,
  );
}

function assertExactKeys(value, expected, label) {
  assertPlainObject(value, label);
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  assert(
    JSON.stringify(actual) === JSON.stringify(required),
    `${label} fields drifted`,
  );
}

function normalizeHash(value, label) {
  const normalized = value?.trim().toLowerCase();
  assert(HASH_PATTERN.test(normalized ?? ""), `${label} must be SHA-256`);
  return normalized;
}

function normalizeSha(value, label) {
  const normalized = value?.trim().toLowerCase();
  assert(SHA_PATTERN.test(normalized ?? ""), `${label} must be a git SHA`);
  return normalized;
}

function normalizeRunId(value, label) {
  const normalized = String(value ?? "").trim();
  assert(/^\d+$/.test(normalized), `${label} must be numeric`);
  return normalized;
}

function normalizeRunAttempt(value, label) {
  const serialized = String(value ?? "").trim();
  assert(/^\d+$/.test(serialized), `${label} must be numeric`);
  const normalized = Number(serialized);
  assert(
    Number.isSafeInteger(normalized) && normalized >= 1,
    `${label} must be positive`,
  );
  return normalized;
}

function normalizeTimestamp(value, label) {
  assert(typeof value === "string", `${label} must be a string`);
  let normalized;
  try {
    normalized = new Date(value).toISOString();
  } catch {
    throw new Error(`${label} must be canonical ISO-8601`);
  }
  assert(normalized === value, `${label} must be canonical ISO-8601`);
  return normalized;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assertSafeEvidence(value) {
  const serialized = JSON.stringify(value);
  assert(
    !/postgres(?:ql)?:\/\/|authorization\s*:|bearer\s+[a-z0-9._~-]+|client[_-]?secret|api[_-]?key|private[_-]?key|access[_-]?token|password/i.test(
      serialized,
    ),
    "Rollback verification evidence contains a credential or prohibited endpoint",
  );
}

function validateTraffic(traffic, restoredRevision) {
  assert(Array.isArray(traffic), "Observed traffic must be an array");
  assert(
    traffic.length === 1,
    "Observed traffic must contain exactly one allocation",
  );
  const [entry] = traffic;
  assertExactKeys(entry, ["percent", "revision", "tag"], "Traffic entry");
  assert(
    entry.revision === restoredRevision &&
      entry.percent === 100 &&
      entry.tag === null,
    `Observed traffic must route exactly 100 percent to ${restoredRevision} without a tag`,
  );
  return [{ revision: entry.revision, percent: 100, tag: null }];
}

function validateGitHubIdentity(github) {
  assertExactKeys(
    github,
    [
      "actor",
      "eventName",
      "protectedEnvironment",
      "ref",
      "repository",
      "runAttempt",
      "runId",
      "runUrl",
      "workflow",
      "workflowPath",
    ],
    "GitHub identity",
  );
  assert(
    github.repository === SOURCE_REPOSITORY &&
      github.ref === "refs/heads/main" &&
      github.eventName === "workflow_dispatch" &&
      github.workflow === "Staging traffic control" &&
      github.workflowPath === ".github/workflows/staging-traffic-control.yml" &&
      github.protectedEnvironment === "staging-traffic-rollback" &&
      /^\d+$/.test(github.runId) &&
      Number.isSafeInteger(github.runAttempt) &&
      github.runAttempt >= 1 &&
      github.runUrl ===
        `https://github.com/${SOURCE_REPOSITORY}/actions/runs/${github.runId}` &&
      typeof github.actor === "string" &&
      github.actor.length > 0,
    "GitHub rollback verification identity drifted",
  );
}

export function validateObservedInfrastructure(observed, rollback) {
  assertExactKeys(
    observed,
    OBSERVED_INFRASTRUCTURE_KEYS,
    "Observed infrastructure",
  );
  assert(
    observed.projectId === PROJECT_ID &&
      observed.region === REGION &&
      observed.service === rollback.service &&
      observed.restoredRevision === rollback.restoredRevision &&
      REVISION_PATTERN.test(observed.restoredRevision) &&
      observed.restoredRevision.startsWith(`${observed.service}-`),
    "Observed rollback target identity drifted",
  );
  validateTraffic(observed.traffic, observed.restoredRevision);
  const immutableImagePattern = new RegExp(
    `^${REGION}-docker\\.pkg\\.dev/${PROJECT_ID}/samra-staging/${escapeRegExp(observed.service)}@sha256:[0-9a-f]{64}$`,
  );
  assert(
    observed.revisionReady === true &&
      immutableImagePattern.test(observed.imageDigest) &&
      observed.ingress === "internal-and-cloud-load-balancing" &&
      observed.defaultServiceUrlDisabled === true &&
      observed.publicIamAbsent === true,
    "Observed rollback infrastructure is not ready, immutable, and private",
  );
}

function assertSameRollbackIdentity(rollback, expected, actualManifestSha256) {
  assertExactKeys(
    expected,
    [
      "controllerSha",
      "githubActor",
      "githubRunAttempt",
      "githubRunId",
      "manifestSha256",
    ],
    "Expected rollback identity",
  );
  assert(
    normalizeHash(
      expected.manifestSha256,
      "Expected rollback manifest hash",
    ) === actualManifestSha256,
    "Rollback manifest does not match the expected hash",
  );
  assert(
    normalizeRunId(expected.githubRunId, "Expected GitHub run ID") ===
      rollback.github.runId &&
      normalizeRunAttempt(
        expected.githubRunAttempt,
        "Expected GitHub run attempt",
      ) === rollback.github.runAttempt &&
      normalizeSha(expected.controllerSha, "Expected controller SHA") ===
        rollback.controllerSha &&
      expected.githubActor?.trim() === rollback.github.actor,
    "Rollback evidence belongs to a different GitHub run, attempt, controller, or actor",
  );
}

function validateRollbackLineage(manifest, rollback, rollbackManifestSha256) {
  validateStagingRollbackManifest(rollback);
  const expectedHash = normalizeHash(
    rollbackManifestSha256,
    "Rollback manifest hash",
  );
  assert(
    manifest.releaseId === rollback.releaseId &&
      manifest.candidateSha === rollback.candidateSha &&
      manifest.failedRevision === rollback.failedRevision &&
      manifest.restoredRevision === rollback.restoredRevision &&
      manifest.service === rollback.service &&
      manifest.rollbackEvidence.manifestSha256 === expectedHash &&
      manifest.rollbackEvidence.status === rollback.status &&
      manifest.rollbackEvidence.githubRunId === rollback.github.runId &&
      manifest.rollbackEvidence.githubRunAttempt ===
        rollback.github.runAttempt &&
      manifest.rollbackEvidence.controllerSha === rollback.controllerSha &&
      manifest.rollbackEvidence.generatedAt === rollback.generatedAt &&
      JSON.stringify(manifest.github) === JSON.stringify(rollback.github) &&
      manifest.controllerSha === rollback.controllerSha &&
      manifest.controllerIdentity === rollback.operatorIdentity,
    "Rollback verification lineage does not match the exact rollback evidence",
  );
  assert(
    manifest.generatedAt > rollback.generatedAt,
    "Rollback verification must be generated after the rollback record",
  );
  return manifest;
}

export function buildStagingRollbackVerificationManifest(input) {
  const rollback = input.rollback;
  validateStagingRollbackManifest(rollback);
  const rollbackManifestSha256 = normalizeHash(
    input.rollbackManifestSha256,
    "Rollback manifest hash",
  );
  assert(
    normalizeRunId(input.githubRunId, "GitHub run ID") ===
      rollback.github.runId &&
      normalizeRunAttempt(input.githubRunAttempt, "GitHub run attempt") ===
        rollback.github.runAttempt &&
      normalizeSha(input.controllerSha, "Controller SHA") ===
        rollback.controllerSha &&
      input.githubActor?.trim() === rollback.github.actor &&
      input.controllerIdentity === rollback.operatorIdentity &&
      input.controllerIdentity === ROLLBACK_CONTROLLER_IDENTITY,
    "Post-rollback verification must run in the exact rollback controller identity",
  );
  validateObservedInfrastructure(input.observedInfrastructure, rollback);
  const generatedAt = normalizeTimestamp(
    input.generatedAt,
    "Rollback verification timestamp",
  );
  const manifest = {
    schemaVersion: 1,
    status: "infrastructure-verified-application-pending",
    scope: "post-rollback-infrastructure-only",
    environment: "staging",
    dataClassification: "synthetic-only",
    appendOnly: true,
    releaseId: rollback.releaseId,
    candidateSha: rollback.candidateSha,
    sourceRepository: SOURCE_REPOSITORY,
    projectId: PROJECT_ID,
    projectNumber: PROJECT_NUMBER,
    region: REGION,
    service: rollback.service,
    failedRevision: rollback.failedRevision,
    restoredRevision: rollback.restoredRevision,
    rollbackEvidence: {
      manifestSha256: rollbackManifestSha256,
      status: rollback.status,
      githubRunId: rollback.github.runId,
      githubRunAttempt: rollback.github.runAttempt,
      controllerSha: rollback.controllerSha,
      generatedAt: rollback.generatedAt,
    },
    infrastructure: {
      projectId: input.observedInfrastructure.projectId,
      region: input.observedInfrastructure.region,
      service: input.observedInfrastructure.service,
      restoredRevision: input.observedInfrastructure.restoredRevision,
      traffic: validateTraffic(
        input.observedInfrastructure.traffic,
        rollback.restoredRevision,
      ),
      revisionReady: input.observedInfrastructure.revisionReady,
      imageDigest: input.observedInfrastructure.imageDigest,
      ingress: input.observedInfrastructure.ingress,
      defaultServiceUrlDisabled:
        input.observedInfrastructure.defaultServiceUrlDisabled,
      publicIamAbsent: input.observedInfrastructure.publicIamAbsent,
    },
    applicationVerification: {
      status: "not-executed",
      applicationProbe: "not-executed",
      ledgerInvariantCheck: "not-executed",
      reconciliationCheck: "not-executed",
    },
    github: structuredClone(rollback.github),
    controllerSha: rollback.controllerSha,
    controllerIdentity: rollback.operatorIdentity,
    verificationMode: "read-only",
    mutations: {
      rebuild: "not-executed",
      deployment: "not-executed",
      traffic: "not-executed",
      configuration: "not-executed",
    },
    fullRecoveryClaimed: false,
    generatedAt,
  };
  validateStagingRollbackVerificationManifest(manifest);
  validateRollbackLineage(manifest, rollback, rollbackManifestSha256);
  return Object.freeze(manifest);
}

export function validateStagingRollbackVerificationManifest(manifest) {
  assertExactKeys(manifest, TOP_LEVEL_KEYS, "Rollback verification manifest");
  assert(
    manifest.schemaVersion === 1 &&
      manifest.status === "infrastructure-verified-application-pending" &&
      manifest.scope === "post-rollback-infrastructure-only" &&
      manifest.environment === "staging" &&
      manifest.dataClassification === "synthetic-only" &&
      manifest.appendOnly === true,
    "Rollback verification scope or status overclaims recovery",
  );
  assert(
    SHA_PATTERN.test(manifest.candidateSha) &&
      manifest.releaseId === `staging-${manifest.candidateSha.slice(0, 12)}` &&
      manifest.sourceRepository === SOURCE_REPOSITORY &&
      manifest.projectId === PROJECT_ID &&
      manifest.projectNumber === PROJECT_NUMBER &&
      manifest.region === REGION &&
      STAGING_TRAFFIC_SERVICES.includes(manifest.service) &&
      manifest.failedRevision ===
        `${manifest.service}-${manifest.candidateSha.slice(0, 12)}` &&
      REVISION_PATTERN.test(manifest.restoredRevision) &&
      manifest.restoredRevision.startsWith(`${manifest.service}-`) &&
      manifest.restoredRevision !== manifest.failedRevision,
    "Rollback verification release identity drifted",
  );
  assertExactKeys(
    manifest.rollbackEvidence,
    [
      "controllerSha",
      "generatedAt",
      "githubRunAttempt",
      "githubRunId",
      "manifestSha256",
      "status",
    ],
    "Rollback evidence lineage",
  );
  normalizeHash(
    manifest.rollbackEvidence.manifestSha256,
    "Rollback evidence manifest hash",
  );
  assert(
    manifest.rollbackEvidence.status ===
      "rolled-back-pending-post-verification" &&
      /^\d+$/.test(manifest.rollbackEvidence.githubRunId) &&
      Number.isSafeInteger(manifest.rollbackEvidence.githubRunAttempt) &&
      manifest.rollbackEvidence.githubRunAttempt >= 1 &&
      SHA_PATTERN.test(manifest.rollbackEvidence.controllerSha),
    "Rollback evidence identity drifted",
  );
  normalizeTimestamp(
    manifest.rollbackEvidence.generatedAt,
    "Rollback evidence timestamp",
  );

  assertExactKeys(
    manifest.infrastructure,
    OBSERVED_INFRASTRUCTURE_KEYS,
    "Verified infrastructure",
  );
  assert(
    manifest.infrastructure.projectId === manifest.projectId &&
      manifest.infrastructure.region === manifest.region &&
      manifest.infrastructure.service === manifest.service &&
      manifest.infrastructure.restoredRevision === manifest.restoredRevision,
    "Verified infrastructure target drifted",
  );
  validateTraffic(manifest.infrastructure.traffic, manifest.restoredRevision);
  const immutableImagePattern = new RegExp(
    `^${REGION}-docker\\.pkg\\.dev/${PROJECT_ID}/samra-staging/${escapeRegExp(manifest.service)}@sha256:[0-9a-f]{64}$`,
  );
  assert(
    manifest.infrastructure.revisionReady === true &&
      immutableImagePattern.test(manifest.infrastructure.imageDigest) &&
      manifest.infrastructure.ingress === "internal-and-cloud-load-balancing" &&
      manifest.infrastructure.defaultServiceUrlDisabled === true &&
      manifest.infrastructure.publicIamAbsent === true,
    "Rollback infrastructure verification failed closed",
  );

  assertExactKeys(
    manifest.applicationVerification,
    [
      "applicationProbe",
      "ledgerInvariantCheck",
      "reconciliationCheck",
      "status",
    ],
    "Application verification boundary",
  );
  assert(
    Object.values(manifest.applicationVerification).every(
      (value) => value === "not-executed",
    ),
    "Application, ledger, and reconciliation checks must remain not-executed",
  );
  validateGitHubIdentity(manifest.github);
  assert(
    manifest.github.runId === manifest.rollbackEvidence.githubRunId &&
      manifest.github.runAttempt ===
        manifest.rollbackEvidence.githubRunAttempt &&
      manifest.controllerSha === manifest.rollbackEvidence.controllerSha &&
      manifest.controllerIdentity === ROLLBACK_CONTROLLER_IDENTITY,
    "Rollback controller identity drifted",
  );
  assertExactKeys(
    manifest.mutations,
    ["configuration", "deployment", "rebuild", "traffic"],
    "Verification mutations",
  );
  assert(
    manifest.verificationMode === "read-only" &&
      Object.values(manifest.mutations).every(
        (value) => value === "not-executed",
      ) &&
      manifest.fullRecoveryClaimed === false,
    "Rollback verification performed a mutation or overclaimed recovery",
  );
  normalizeSha(manifest.controllerSha, "Controller SHA");
  normalizeTimestamp(manifest.generatedAt, "Rollback verification timestamp");
  assertSafeEvidence(manifest);
  return manifest;
}

export function validateRollbackVerificationAgainstRollback(
  manifest,
  rollback,
  rollbackManifestSha256,
) {
  validateStagingRollbackVerificationManifest(manifest);
  return validateRollbackLineage(manifest, rollback, rollbackManifestSha256);
}

async function readRegularFile(path, label) {
  const metadata = await lstat(path);
  assert(
    metadata.isFile() && !metadata.isSymbolicLink(),
    `${label} must be a regular file`,
  );
  return readFile(path, "utf8");
}

async function readStrictHashedManifest(
  manifestPath,
  hashPath,
  validate,
  label,
) {
  assert(
    resolve(manifestPath) !== resolve(hashPath),
    `${label} manifest and sidecar paths must differ`,
  );
  const [serialized, hashRecord] = await Promise.all([
    readRegularFile(manifestPath, `${label} manifest`),
    readRegularFile(hashPath, `${label} hash sidecar`),
  ]);
  const actual = createHash("sha256").update(serialized).digest("hex");
  assert(
    hashRecord === `${actual}  ${basename(manifestPath)}\n`,
    `${label} hash sidecar does not match the exact manifest bytes and filename`,
  );
  let manifest;
  try {
    manifest = JSON.parse(serialized);
  } catch {
    throw new Error(`${label} manifest must be valid JSON`);
  }
  validate(manifest);
  return { manifest, manifestSha256: actual };
}

export async function verifyExactRollbackEvidence(
  manifestPath,
  hashPath,
  expectedIdentity,
) {
  const verified = await readStrictHashedManifest(
    manifestPath,
    hashPath,
    validateStagingRollbackManifest,
    "Rollback",
  );
  assertSameRollbackIdentity(
    verified.manifest,
    {
      ...expectedIdentity,
    },
    verified.manifestSha256,
  );
  return verified;
}

async function writeExclusiveFilePair(
  manifestPath,
  hashPath,
  serialized,
  hashRecord,
) {
  assert(
    resolve(manifestPath) !== resolve(hashPath),
    "Rollback verification manifest and sidecar paths must differ",
  );
  await Promise.all([
    mkdir(dirname(manifestPath), { recursive: true }),
    mkdir(dirname(hashPath), { recursive: true }),
  ]);
  let manifestHandle;
  let hashHandle;
  try {
    manifestHandle = await open(manifestPath, "wx", 0o600);
    try {
      hashHandle = await open(hashPath, "wx", 0o600);
    } catch (error) {
      await manifestHandle.close();
      manifestHandle = undefined;
      await unlink(manifestPath);
      throw error;
    }
    await manifestHandle.writeFile(serialized, "utf8");
    await hashHandle.writeFile(hashRecord, "utf8");
  } catch (error) {
    await Promise.allSettled([manifestHandle?.close(), hashHandle?.close()]);
    await Promise.allSettled([
      manifestHandle ? unlink(manifestPath) : Promise.resolve(),
      hashHandle ? unlink(hashPath) : Promise.resolve(),
    ]);
    throw error;
  }
  await Promise.all([manifestHandle.close(), hashHandle.close()]);
}

export async function writeRollbackVerificationManifest(
  manifest,
  manifestPath,
  hashPath,
) {
  validateStagingRollbackVerificationManifest(manifest);
  const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
  const hash = createHash("sha256").update(serialized).digest("hex");
  await writeExclusiveFilePair(
    manifestPath,
    hashPath,
    serialized,
    `${hash}  ${basename(manifestPath)}\n`,
  );
  return hash;
}

export async function verifyRollbackVerificationManifest(
  manifestPath,
  hashPath,
  rollbackManifestPath,
  rollbackHashPath,
  expectedRollbackIdentity,
) {
  const rollback = await verifyExactRollbackEvidence(
    rollbackManifestPath,
    rollbackHashPath,
    expectedRollbackIdentity,
  );
  const verification = await readStrictHashedManifest(
    manifestPath,
    hashPath,
    validateStagingRollbackVerificationManifest,
    "Rollback verification",
  );
  validateRollbackLineage(
    verification.manifest,
    rollback.manifest,
    rollback.manifestSha256,
  );
  return verification;
}

function parseCliArguments(values) {
  assert(values.length % 2 === 0, "Every option must have a value");
  const options = {};
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    assert(key?.startsWith("--"), `Invalid option: ${key}`);
    const normalized = key.slice(2).replaceAll("-", "_");
    assert(!(normalized in options), `Duplicate option: ${key}`);
    options[normalized] = value;
  }
  return options;
}

async function runCli() {
  const options = parseCliArguments(process.argv.slice(2));
  const rollback = await verifyExactRollbackEvidence(
    options.rollback_manifest,
    options.rollback_hash,
    {
      manifestSha256: options.rollback_manifest_sha256,
      githubRunId: options.github_run_id,
      githubRunAttempt: options.github_run_attempt,
      controllerSha: options.controller_sha,
      githubActor: options.github_actor,
    },
  );
  const observedInfrastructure = JSON.parse(
    await readRegularFile(
      options.observed_infrastructure,
      "Observed infrastructure",
    ),
  );
  const manifest = buildStagingRollbackVerificationManifest({
    rollback: rollback.manifest,
    rollbackManifestSha256: rollback.manifestSha256,
    observedInfrastructure,
    controllerSha: options.controller_sha,
    controllerIdentity: options.controller_identity,
    githubRunId: options.github_run_id,
    githubRunAttempt: options.github_run_attempt,
    githubActor: options.github_actor,
    generatedAt: options.generated_at ?? new Date().toISOString(),
  });
  const hash = await writeRollbackVerificationManifest(
    manifest,
    options.output,
    options.hash_output,
  );
  process.stdout.write(
    `${JSON.stringify({
      status: manifest.status,
      scope: manifest.scope,
      releaseId: manifest.releaseId,
      service: manifest.service,
      sha256: hash,
    })}\n`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runCli().catch((error) => {
    process.stderr.write(
      `Unable to record staging rollback verification: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
