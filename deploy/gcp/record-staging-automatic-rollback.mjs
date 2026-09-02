import { createHash } from "node:crypto";
import { lstat, mkdir, open, readFile, unlink } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { validateObservedInfrastructure } from "./record-staging-rollback-verification.mjs";
import { validateStagingVerificationManifest } from "./record-staging-verification.mjs";
import { validateStagingZeroTrafficDeploymentManifest } from "./record-staging-zero-traffic-deployment.mjs";

const SOURCE_REPOSITORY = "haileleuld87/Samra-Pay";
const PROJECT_ID = "samra-pay-staging";
const PROJECT_NUMBER = "934122615631";
const REGION = "us-east4";
const PROMOTER =
  "samra-github-promoter-staging@samra-pay-staging.iam.gserviceaccount.com";
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const REVISION_PATTERN = /^[a-z]([a-z0-9-]{0,61}[a-z0-9])?$/;
const FAILURE_STAGES = Object.freeze([
  "traffic-mutation",
  "post-promotion-snapshot",
  "post-promotion-assertion",
  "promotion-evidence-recording",
]);

const EVENT_KEYS = Object.freeze([
  "applicationVerification",
  "automaticRollbackExecuted",
  "candidateSha",
  "controllerSha",
  "dataClassification",
  "environment",
  "failedRevision",
  "failureStage",
  "fullRecoveryClaimed",
  "generatedAt",
  "github",
  "operatorIdentity",
  "postRollbackVerificationRequired",
  "postRollbackVerificationStatus",
  "projectId",
  "projectNumber",
  "rebuildExecuted",
  "region",
  "releaseId",
  "restoredRevision",
  "schemaVersion",
  "service",
  "sourceEvidence",
  "sourceRepository",
  "status",
  "trafficAfterRollback",
  "trafficBeforePromotion",
  "trigger",
  "vendorActivationAuthorized",
]);

const VERIFICATION_KEYS = Object.freeze([
  "applicationVerification",
  "automaticRollbackEvidence",
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
  "schemaVersion",
  "scope",
  "service",
  "sourceRepository",
  "status",
  "verificationMode",
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
  assert(
    JSON.stringify(Object.keys(value).sort()) ===
      JSON.stringify([...expected].sort()),
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
  assert(/^[1-9]\d*$/.test(normalized), `${label} must be positive`);
  return normalized;
}

function normalizeRunAttempt(value, label) {
  const serialized = String(value ?? "").trim();
  assert(/^[1-9]\d*$/.test(serialized), `${label} must be positive`);
  const normalized = Number(serialized);
  assert(Number.isSafeInteger(normalized), `${label} must be safe`);
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

function assertSafeEvidence(value) {
  assert(
    !/postgres(?:ql)?:\/\/|authorization\s*:|bearer\s+[a-z0-9._~-]+|client[_-]?secret|api[_-]?key|private[_-]?key|access[_-]?token|password/i.test(
      JSON.stringify(value),
    ),
    "Automatic rollback evidence contains a credential or prohibited endpoint",
  );
}

function validateTraffic(value, revision, label) {
  assert(Array.isArray(value) && value.length === 1, `${label} must be exact`);
  assertExactKeys(value[0], ["percent", "revision", "tag"], `${label} entry`);
  assert(
    value[0].revision === revision &&
      value[0].percent === 100 &&
      value[0].tag === null,
    `${label} must route 100 percent to ${revision}`,
  );
  return [{ revision, percent: 100, tag: null }];
}

export function normalizeControllerTrafficSnapshot(value, label) {
  assert(Array.isArray(value) && value.length === 1, `${label} must be exact`);
  assertExactKeys(
    value[0],
    ["latestRevision", "percent", "revision", "tag"],
    `${label} controller entry`,
  );
  assert(
    value[0].latestRevision === false,
    `${label} must explicitly reject a floating latest revision`,
  );
  return validateTraffic(
    [
      {
        revision: value[0].revision,
        percent: value[0].percent,
        tag: value[0].tag,
      },
    ],
    value[0].revision,
    label,
  );
}

function buildGitHub(input) {
  const runId = normalizeRunId(input.githubRunId, "GitHub run ID");
  return {
    repository: SOURCE_REPOSITORY,
    ref: "refs/heads/main",
    eventName: "workflow_dispatch",
    workflow: "Staging traffic control",
    workflowPath: ".github/workflows/staging-traffic-control.yml",
    protectedEnvironment: "staging-traffic-promotion",
    runId,
    runAttempt: normalizeRunAttempt(
      input.githubRunAttempt,
      "GitHub run attempt",
    ),
    runUrl: `https://github.com/${SOURCE_REPOSITORY}/actions/runs/${runId}`,
    actor: input.githubActor?.trim(),
  };
}

function validateGitHub(github) {
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
      github.protectedEnvironment === "staging-traffic-promotion" &&
      /^[1-9]\d*$/.test(github.runId) &&
      Number.isSafeInteger(github.runAttempt) &&
      github.runAttempt >= 1 &&
      github.runUrl ===
        `https://github.com/${SOURCE_REPOSITORY}/actions/runs/${github.runId}` &&
      typeof github.actor === "string" &&
      github.actor.length > 0,
    "GitHub automatic rollback identity drifted",
  );
}

function assertSourceLineage(deployment, verification) {
  validateStagingZeroTrafficDeploymentManifest(deployment);
  validateStagingVerificationManifest(verification);
  assert(
    deployment.candidateSha === verification.candidateSha &&
      deployment.releaseId === verification.releaseId &&
      deployment.deployment.service === verification.service &&
      deployment.deployment.revision === verification.revision,
    "Automatic rollback sources do not describe one candidate revision",
  );
}

export function buildStagingAutomaticRollbackManifest(input) {
  assertSourceLineage(input.zeroTrafficDeployment, input.verification);
  const deployment = input.zeroTrafficDeployment;
  const failedRevision = deployment.deployment.revision;
  const restoredRevision = input.restoredRevision?.trim();
  assert(
    REVISION_PATTERN.test(restoredRevision ?? "") &&
      restoredRevision !== failedRevision &&
      restoredRevision.startsWith(`${deployment.deployment.service}-`),
    "Automatic rollback target is invalid",
  );
  assert(
    FAILURE_STAGES.includes(input.failureStage),
    "Automatic rollback failure stage is invalid",
  );
  const github = buildGitHub(input);
  const manifest = {
    schemaVersion: 1,
    status: "automatically-rolled-back-pending-post-verification",
    trigger: "failed-staging-promotion-control",
    failureStage: input.failureStage,
    environment: "staging",
    dataClassification: "synthetic-only",
    releaseId: deployment.releaseId,
    candidateSha: deployment.candidateSha,
    controllerSha: normalizeSha(input.controllerSha, "Controller SHA"),
    sourceRepository: SOURCE_REPOSITORY,
    projectId: PROJECT_ID,
    projectNumber: PROJECT_NUMBER,
    region: REGION,
    service: deployment.deployment.service,
    failedRevision,
    restoredRevision,
    sourceEvidence: {
      zeroTrafficDeploymentManifestSha256: normalizeHash(
        input.zeroTrafficDeploymentManifestSha256,
        "Zero-traffic manifest hash",
      ),
      stagingVerificationManifestSha256: normalizeHash(
        input.verificationManifestSha256,
        "Staging verification manifest hash",
      ),
    },
    trafficBeforePromotion: validateTraffic(
      input.trafficBeforePromotion,
      restoredRevision,
      "Traffic before promotion",
    ),
    trafficAfterRollback: validateTraffic(
      input.trafficAfterRollback,
      restoredRevision,
      "Traffic after automatic rollback",
    ),
    github,
    operatorIdentity: input.operatorIdentity,
    automaticRollbackExecuted: true,
    rebuildExecuted: false,
    postRollbackVerificationRequired: true,
    postRollbackVerificationStatus: "pending",
    applicationVerification: {
      status: "not-executed",
      applicationProbe: "not-executed",
      ledgerInvariantCheck: "not-executed",
      reconciliationCheck: "not-executed",
    },
    vendorActivationAuthorized: false,
    fullRecoveryClaimed: false,
    generatedAt: normalizeTimestamp(input.generatedAt, "Rollback timestamp"),
  };
  validateStagingAutomaticRollbackManifest(manifest);
  return Object.freeze(manifest);
}

export function validateStagingAutomaticRollbackManifest(manifest) {
  assertExactKeys(manifest, EVENT_KEYS, "Automatic rollback manifest");
  assert(
    manifest.schemaVersion === 1 &&
      manifest.status ===
        "automatically-rolled-back-pending-post-verification" &&
      manifest.trigger === "failed-staging-promotion-control" &&
      FAILURE_STAGES.includes(manifest.failureStage) &&
      manifest.environment === "staging" &&
      manifest.dataClassification === "synthetic-only" &&
      manifest.sourceRepository === SOURCE_REPOSITORY &&
      manifest.projectId === PROJECT_ID &&
      manifest.projectNumber === PROJECT_NUMBER &&
      manifest.region === REGION,
    "Automatic rollback identity or scope drifted",
  );
  assert(
    SHA_PATTERN.test(manifest.candidateSha) &&
      SHA_PATTERN.test(manifest.controllerSha) &&
      manifest.releaseId === `staging-${manifest.candidateSha.slice(0, 12)}` &&
      manifest.failedRevision ===
        `${manifest.service}-${manifest.candidateSha.slice(0, 12)}` &&
      REVISION_PATTERN.test(manifest.restoredRevision) &&
      manifest.restoredRevision.startsWith(`${manifest.service}-`) &&
      manifest.restoredRevision !== manifest.failedRevision,
    "Automatic rollback revision identity drifted",
  );
  assertExactKeys(
    manifest.sourceEvidence,
    [
      "stagingVerificationManifestSha256",
      "zeroTrafficDeploymentManifestSha256",
    ],
    "Automatic rollback source evidence",
  );
  normalizeHash(
    manifest.sourceEvidence.zeroTrafficDeploymentManifestSha256,
    "Zero-traffic manifest hash",
  );
  normalizeHash(
    manifest.sourceEvidence.stagingVerificationManifestSha256,
    "Staging verification manifest hash",
  );
  validateTraffic(
    manifest.trafficBeforePromotion,
    manifest.restoredRevision,
    "Traffic before promotion",
  );
  validateTraffic(
    manifest.trafficAfterRollback,
    manifest.restoredRevision,
    "Traffic after automatic rollback",
  );
  validateGitHub(manifest.github);
  assertExactKeys(
    manifest.applicationVerification,
    [
      "applicationProbe",
      "ledgerInvariantCheck",
      "reconciliationCheck",
      "status",
    ],
    "Automatic rollback application verification boundary",
  );
  assert(
    manifest.operatorIdentity === PROMOTER &&
      manifest.automaticRollbackExecuted === true &&
      manifest.rebuildExecuted === false &&
      manifest.postRollbackVerificationRequired === true &&
      manifest.postRollbackVerificationStatus === "pending" &&
      Object.values(manifest.applicationVerification).every(
        (value) => value === "not-executed",
      ) &&
      manifest.vendorActivationAuthorized === false &&
      manifest.fullRecoveryClaimed === false,
    "Automatic rollback evidence exceeded authority",
  );
  normalizeTimestamp(manifest.generatedAt, "Rollback timestamp");
  assertSafeEvidence(manifest);
  return manifest;
}

export function buildStagingAutomaticRollbackVerificationManifest(input) {
  validateStagingAutomaticRollbackManifest(input.automaticRollback);
  const rollback = input.automaticRollback;
  validateObservedInfrastructure(input.observedInfrastructure, rollback);
  const generatedAt = normalizeTimestamp(
    input.generatedAt,
    "Verification timestamp",
  );
  assert(
    generatedAt > rollback.generatedAt,
    "Verification must be generated after automatic rollback evidence",
  );
  const manifest = {
    schemaVersion: 1,
    status: "infrastructure-verified-application-pending",
    scope: "automatic-post-rollback-infrastructure-only",
    environment: "staging",
    dataClassification: "synthetic-only",
    releaseId: rollback.releaseId,
    candidateSha: rollback.candidateSha,
    sourceRepository: SOURCE_REPOSITORY,
    projectId: PROJECT_ID,
    projectNumber: PROJECT_NUMBER,
    region: REGION,
    service: rollback.service,
    failedRevision: rollback.failedRevision,
    restoredRevision: rollback.restoredRevision,
    automaticRollbackEvidence: {
      manifestSha256: normalizeHash(
        input.automaticRollbackManifestSha256,
        "Automatic rollback manifest hash",
      ),
      status: rollback.status,
      trigger: rollback.trigger,
      failureStage: rollback.failureStage,
      githubRunId: rollback.github.runId,
      githubRunAttempt: rollback.github.runAttempt,
      controllerSha: rollback.controllerSha,
      generatedAt: rollback.generatedAt,
    },
    infrastructure: structuredClone(input.observedInfrastructure),
    applicationVerification: structuredClone(rollback.applicationVerification),
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
  validateStagingAutomaticRollbackVerificationManifest(manifest);
  return Object.freeze(manifest);
}

export function validateStagingAutomaticRollbackVerificationManifest(manifest) {
  assertExactKeys(
    manifest,
    VERIFICATION_KEYS,
    "Automatic rollback verification manifest",
  );
  assert(
    manifest.schemaVersion === 1 &&
      manifest.status === "infrastructure-verified-application-pending" &&
      manifest.scope === "automatic-post-rollback-infrastructure-only" &&
      manifest.environment === "staging" &&
      manifest.dataClassification === "synthetic-only" &&
      manifest.sourceRepository === SOURCE_REPOSITORY &&
      manifest.projectId === PROJECT_ID &&
      manifest.projectNumber === PROJECT_NUMBER &&
      manifest.region === REGION,
    "Automatic rollback verification scope drifted",
  );
  assertExactKeys(
    manifest.automaticRollbackEvidence,
    [
      "controllerSha",
      "failureStage",
      "generatedAt",
      "githubRunAttempt",
      "githubRunId",
      "manifestSha256",
      "status",
      "trigger",
    ],
    "Automatic rollback lineage",
  );
  normalizeHash(
    manifest.automaticRollbackEvidence.manifestSha256,
    "Automatic rollback manifest hash",
  );
  assert(
    manifest.automaticRollbackEvidence.status ===
      "automatically-rolled-back-pending-post-verification" &&
      manifest.automaticRollbackEvidence.trigger ===
        "failed-staging-promotion-control" &&
      FAILURE_STAGES.includes(
        manifest.automaticRollbackEvidence.failureStage,
      ) &&
      manifest.automaticRollbackEvidence.githubRunId ===
        manifest.github.runId &&
      manifest.automaticRollbackEvidence.githubRunAttempt ===
        manifest.github.runAttempt &&
      manifest.automaticRollbackEvidence.controllerSha ===
        manifest.controllerSha,
    "Automatic rollback verification lineage drifted",
  );
  normalizeTimestamp(
    manifest.automaticRollbackEvidence.generatedAt,
    "Automatic rollback timestamp",
  );
  assert(
    SHA_PATTERN.test(manifest.candidateSha) &&
      manifest.releaseId === `staging-${manifest.candidateSha.slice(0, 12)}` &&
      manifest.failedRevision ===
        `${manifest.service}-${manifest.candidateSha.slice(0, 12)}` &&
      manifest.restoredRevision !== manifest.failedRevision &&
      manifest.infrastructure.service === manifest.service &&
      manifest.infrastructure.restoredRevision === manifest.restoredRevision,
    "Automatic rollback verification release identity drifted",
  );
  validateObservedInfrastructure(manifest.infrastructure, manifest);
  validateGitHub(manifest.github);
  assert(
    SHA_PATTERN.test(manifest.controllerSha) &&
      manifest.controllerIdentity === PROMOTER,
    "Automatic rollback controller identity drifted",
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
    ) &&
      manifest.verificationMode === "read-only" &&
      Object.values(manifest.mutations).every(
        (value) => value === "not-executed",
      ) &&
      manifest.fullRecoveryClaimed === false,
    "Automatic rollback verification overclaimed recovery",
  );
  assertExactKeys(
    manifest.mutations,
    ["configuration", "deployment", "rebuild", "traffic"],
    "Automatic rollback verification mutations",
  );
  normalizeSha(manifest.controllerSha, "Controller SHA");
  normalizeTimestamp(manifest.generatedAt, "Verification timestamp");
  assert(
    manifest.generatedAt > manifest.automaticRollbackEvidence.generatedAt,
    "Verification must follow automatic rollback evidence",
  );
  assertSafeEvidence(manifest);
  return manifest;
}

export function validateAutomaticRollbackVerificationAgainstEvent(
  verification,
  rollback,
  rollbackManifestSha256,
) {
  validateStagingAutomaticRollbackManifest(rollback);
  validateStagingAutomaticRollbackVerificationManifest(verification);
  assert(
    verification.automaticRollbackEvidence.manifestSha256 ===
      normalizeHash(
        rollbackManifestSha256,
        "Automatic rollback manifest hash",
      ) &&
      verification.releaseId === rollback.releaseId &&
      verification.candidateSha === rollback.candidateSha &&
      verification.service === rollback.service &&
      verification.failedRevision === rollback.failedRevision &&
      verification.restoredRevision === rollback.restoredRevision &&
      verification.automaticRollbackEvidence.status === rollback.status &&
      verification.automaticRollbackEvidence.trigger === rollback.trigger &&
      verification.automaticRollbackEvidence.failureStage ===
        rollback.failureStage &&
      verification.automaticRollbackEvidence.generatedAt ===
        rollback.generatedAt &&
      JSON.stringify(verification.github) === JSON.stringify(rollback.github) &&
      verification.controllerSha === rollback.controllerSha &&
      verification.controllerIdentity === rollback.operatorIdentity,
    "Automatic rollback verification does not match the exact rollback event",
  );
  return verification;
}

async function readRegularFile(filePath, label) {
  const metadata = await lstat(filePath);
  assert(
    metadata.isFile() && !metadata.isSymbolicLink(),
    `${label} must be a regular file`,
  );
  return readFile(filePath, "utf8");
}

async function readStrictHashedManifest(
  manifestPath,
  hashPath,
  validate,
  label,
) {
  assert(
    resolve(manifestPath) !== resolve(hashPath),
    `${label} paths must differ`,
  );
  const [serialized, hashRecord] = await Promise.all([
    readRegularFile(manifestPath, `${label} manifest`),
    readRegularFile(hashPath, `${label} sidecar`),
  ]);
  const actual = createHash("sha256").update(serialized).digest("hex");
  assert(
    hashRecord === `${actual}  ${basename(manifestPath)}\n`,
    `${label} sidecar does not match exact bytes and filename`,
  );
  const manifest = JSON.parse(serialized);
  validate(manifest);
  return { manifest, manifestSha256: actual };
}

async function writeExclusivePair(manifest, manifestPath, hashPath, validate) {
  validate(manifest);
  assert(
    resolve(manifestPath) !== resolve(hashPath),
    "Output paths must differ",
  );
  const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
  const hash = createHash("sha256").update(serialized).digest("hex");
  await Promise.all([
    mkdir(dirname(manifestPath), { recursive: true }),
    mkdir(dirname(hashPath), { recursive: true }),
  ]);
  let manifestHandle;
  let hashHandle;
  try {
    manifestHandle = await open(manifestPath, "wx", 0o600);
    hashHandle = await open(hashPath, "wx", 0o600);
    await manifestHandle.writeFile(serialized, "utf8");
    await hashHandle.writeFile(`${hash}  ${basename(manifestPath)}\n`, "utf8");
  } catch (error) {
    await Promise.allSettled([manifestHandle?.close(), hashHandle?.close()]);
    await Promise.allSettled([
      manifestHandle ? unlink(manifestPath) : Promise.resolve(),
      hashHandle ? unlink(hashPath) : Promise.resolve(),
    ]);
    throw error;
  }
  await Promise.all([manifestHandle.close(), hashHandle.close()]);
  return hash;
}

export async function writeAutomaticRollbackManifest(
  manifest,
  manifestPath,
  hashPath,
) {
  return writeExclusivePair(
    manifest,
    manifestPath,
    hashPath,
    validateStagingAutomaticRollbackManifest,
  );
}

export async function writeAutomaticRollbackVerificationManifest(
  manifest,
  manifestPath,
  hashPath,
) {
  return writeExclusivePair(
    manifest,
    manifestPath,
    hashPath,
    validateStagingAutomaticRollbackVerificationManifest,
  );
}

export async function verifyAutomaticRollbackEvidence(
  rollbackManifestPath,
  rollbackHashPath,
  verificationManifestPath,
  verificationHashPath,
) {
  const [rollback, verification] = await Promise.all([
    readStrictHashedManifest(
      rollbackManifestPath,
      rollbackHashPath,
      validateStagingAutomaticRollbackManifest,
      "Automatic rollback",
    ),
    readStrictHashedManifest(
      verificationManifestPath,
      verificationHashPath,
      validateStagingAutomaticRollbackVerificationManifest,
      "Automatic rollback verification",
    ),
  ]);
  validateAutomaticRollbackVerificationAgainstEvent(
    verification.manifest,
    rollback.manifest,
    rollback.manifestSha256,
  );
  return Object.freeze({
    rollback: rollback.manifest,
    rollbackManifestSha256: rollback.manifestSha256,
    verification: verification.manifest,
    verificationManifestSha256: verification.manifestSha256,
  });
}

function parseCliArguments(values) {
  assert(values.length % 2 === 0, "Every option must have a value");
  const options = {};
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    assert(key?.startsWith("--"), `Invalid option: ${key}`);
    const normalized = key.slice(2).replaceAll("-", "_");
    assert(!(normalized in options), `Duplicate option: ${key}`);
    options[normalized] = values[index + 1];
  }
  return options;
}

async function runCli() {
  const options = parseCliArguments(process.argv.slice(2));
  const [deployment, verification, trafficBefore, trafficAfter, observed] =
    await Promise.all([
      readStrictHashedManifest(
        options.zero_traffic_manifest,
        options.zero_traffic_hash,
        validateStagingZeroTrafficDeploymentManifest,
        "Zero-traffic deployment",
      ),
      readStrictHashedManifest(
        options.verification_manifest,
        options.verification_hash,
        validateStagingVerificationManifest,
        "Staging verification",
      ),
      readRegularFile(options.traffic_before, "Traffic before").then((value) =>
        normalizeControllerTrafficSnapshot(JSON.parse(value), "Traffic before"),
      ),
      readRegularFile(options.traffic_after, "Traffic after").then((value) =>
        normalizeControllerTrafficSnapshot(JSON.parse(value), "Traffic after"),
      ),
      readRegularFile(
        options.observed_infrastructure,
        "Observed infrastructure",
      ).then(JSON.parse),
    ]);
  const rollbackGeneratedAt = new Date().toISOString();
  const rollback = buildStagingAutomaticRollbackManifest({
    zeroTrafficDeployment: deployment.manifest,
    zeroTrafficDeploymentManifestSha256: deployment.manifestSha256,
    verification: verification.manifest,
    verificationManifestSha256: verification.manifestSha256,
    restoredRevision: options.restored_revision,
    failureStage: options.failure_stage,
    trafficBeforePromotion: trafficBefore,
    trafficAfterRollback: trafficAfter,
    controllerSha: options.controller_sha,
    operatorIdentity: options.operator_identity,
    githubRunId: options.github_run_id,
    githubRunAttempt: options.github_run_attempt,
    githubActor: options.github_actor,
    generatedAt: rollbackGeneratedAt,
  });
  const rollbackHash = await writeAutomaticRollbackManifest(
    rollback,
    options.rollback_output,
    options.rollback_hash_output,
  );
  const verificationGeneratedAt = new Date(
    Math.max(Date.now(), new Date(rollback.generatedAt).getTime() + 1),
  ).toISOString();
  const postVerification = buildStagingAutomaticRollbackVerificationManifest({
    automaticRollback: rollback,
    automaticRollbackManifestSha256: rollbackHash,
    observedInfrastructure: observed,
    generatedAt: verificationGeneratedAt,
  });
  const verificationHash = await writeAutomaticRollbackVerificationManifest(
    postVerification,
    options.verification_output,
    options.verification_hash_output,
  );
  await verifyAutomaticRollbackEvidence(
    options.rollback_output,
    options.rollback_hash_output,
    options.verification_output,
    options.verification_hash_output,
  );
  process.stdout.write(
    `${JSON.stringify({ status: postVerification.status, scope: postVerification.scope, releaseId: rollback.releaseId, service: rollback.service, rollbackSha256: rollbackHash, verificationSha256: verificationHash })}\n`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runCli().catch((error) => {
    process.stderr.write(
      `Unable to record automatic staging rollback: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
