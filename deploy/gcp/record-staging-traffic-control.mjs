import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { verifyZeroTrafficDeploymentManifest } from "./record-staging-zero-traffic-deployment.mjs";
import {
  STAGING_TRAFFIC_SERVICES,
  STAGING_VERIFICATION_CHECKS,
} from "./validate-staging-traffic-control.mjs";

const SOURCE_REPOSITORY = "haileleuld87/Samra-Pay";
const PROJECT_ID = "samra-pay-staging";
const PROJECT_NUMBER = "934122615631";
const REGION = "us-east4";
const PROMOTER =
  "samra-github-promoter-staging@samra-pay-staging.iam.gserviceaccount.com";
const ROLLBACK_OPERATOR =
  "samra-github-rollback-staging@samra-pay-staging.iam.gserviceaccount.com";
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const REVISION_PATTERN = /^[a-z]([a-z0-9-]{0,61}[a-z0-9])?$/;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function normalizeHash(value, label) {
  const normalized = value?.trim().toLowerCase();
  assert(HASH_PATTERN.test(normalized ?? ""), `${label} must be SHA-256`);
  return normalized;
}

function normalizeRun(value, label) {
  const normalized = value?.trim();
  assert(/^\d+$/.test(normalized ?? ""), `${label} must be numeric`);
  return normalized;
}

function normalizeAttempt(value) {
  const attempt = Number.parseInt(value, 10);
  assert(
    Number.isSafeInteger(attempt) && attempt >= 1,
    "GitHub run attempt must be positive",
  );
  return attempt;
}

function normalizeTimestamp(value, label) {
  const normalized = new Date(value).toISOString();
  assert(normalized === value, `${label} must be canonical ISO-8601`);
  return normalized;
}

export function normalizeStagingTraffic(entries, label = "Traffic") {
  assert(Array.isArray(entries), `${label} must be an array`);
  const normalized = entries.map((entry) => {
    const revision = entry?.revision ?? entry?.revisionName;
    const tag = entry?.tag ?? null;
    assert(
      typeof revision === "string" &&
        REVISION_PATTERN.test(revision) &&
        Number.isInteger(entry.percent) &&
        entry.percent >= 0 &&
        entry.percent <= 100 &&
        tag === null &&
        entry.latestRevision !== true,
      `${label} contains an invalid, tagged, or floating allocation`,
    );
    return { revision, percent: entry.percent, tag: null };
  });
  assert(
    new Set(normalized.map(({ revision }) => revision)).size ===
      normalized.length,
    `${label} contains duplicate revisions`,
  );
  assert(
    normalized.reduce((sum, entry) => sum + entry.percent, 0) === 100,
    `${label} must total exactly 100 percent`,
  );
  return normalized.sort((left, right) =>
    left.revision.localeCompare(right.revision),
  );
}

function assertSingleRevisionTraffic(entries, revision, label) {
  const normalized = normalizeStagingTraffic(entries, label);
  assert(
    normalized.length === 1 &&
      normalized[0].revision === revision &&
      normalized[0].percent === 100,
    `${label} must route exactly 100 percent to ${revision}`,
  );
  return normalized;
}

function validateReleaseIdentity(manifest) {
  assert(
    manifest.schemaVersion === 1 &&
      manifest.environment === "staging" &&
      manifest.dataClassification === "synthetic-only" &&
      SHA_PATTERN.test(manifest.candidateSha) &&
      SHA_PATTERN.test(manifest.controllerSha) &&
      manifest.releaseId === `staging-${manifest.candidateSha.slice(0, 12)}` &&
      manifest.sourceRepository === SOURCE_REPOSITORY &&
      manifest.projectId === PROJECT_ID &&
      manifest.projectNumber === PROJECT_NUMBER &&
      manifest.region === REGION &&
      STAGING_TRAFFIC_SERVICES.includes(manifest.service),
    "Traffic evidence release identity drifted",
  );
}

function validateGitHubProvenance(github, environment) {
  assert(
    github.repository === SOURCE_REPOSITORY &&
      github.ref === "refs/heads/main" &&
      github.eventName === "workflow_dispatch" &&
      github.workflow === "Staging traffic control" &&
      github.workflowPath === ".github/workflows/staging-traffic-control.yml" &&
      github.protectedEnvironment === environment &&
      /^\d+$/.test(github.runId) &&
      Number.isSafeInteger(github.runAttempt) &&
      github.runAttempt >= 1 &&
      github.runUrl ===
        `https://github.com/${SOURCE_REPOSITORY}/actions/runs/${github.runId}` &&
      typeof github.actor === "string" &&
      github.actor.length > 0,
    "GitHub traffic provenance drifted",
  );
}

function assertSafeEvidence(manifest) {
  assert(
    !/postgres(?:ql)?:\/\/|worf\.replit|12345678|client_secret|api[_-]?key|private[_-]?key|authorization:/i.test(
      JSON.stringify(manifest),
    ),
    "Traffic evidence contains a credential or prohibited endpoint",
  );
}

export function validateStagingVerificationManifest(manifest) {
  assert(
    manifest.schemaVersion === 1 &&
      manifest.status === "passed" &&
      manifest.environment === "staging" &&
      manifest.dataClassification === "synthetic-only" &&
      SHA_PATTERN.test(manifest.candidateSha) &&
      manifest.releaseId === `staging-${manifest.candidateSha.slice(0, 12)}` &&
      STAGING_TRAFFIC_SERVICES.includes(manifest.service) &&
      manifest.revision ===
        `${manifest.service}-${manifest.candidateSha.slice(0, 12)}`,
    "Verification manifest identity drifted",
  );
  assert(
    JSON.stringify(Object.keys(manifest.checks)) ===
      JSON.stringify(STAGING_VERIFICATION_CHECKS) &&
      STAGING_VERIFICATION_CHECKS.every(
        (check) => manifest.checks[check] === "passed",
      ),
    "All required staging verification checks must pass",
  );
  assert(
    manifest.qase.project === "SAMP" &&
      manifest.qase.environment === "google-cloud-staging" &&
      /^\d+$/.test(manifest.qase.runId) &&
      manifest.qase.runUrl ===
        `https://app.qase.io/run/SAMP/dashboard/${manifest.qase.runId}`,
    "Qase staging evidence drifted",
  );
  assert(
    manifest.customerDataUsed === false &&
      manifest.secretValuesRecorded === false,
    "Verification evidence exceeded synthetic authority",
  );
  normalizeTimestamp(manifest.generatedAt, "Verification timestamp");
  assertSafeEvidence(manifest);
  return manifest;
}

function buildGitHub(input, environment) {
  const runId = normalizeRun(input.githubRunId, "GitHub run ID");
  return {
    repository: SOURCE_REPOSITORY,
    ref: "refs/heads/main",
    eventName: "workflow_dispatch",
    workflow: "Staging traffic control",
    workflowPath: ".github/workflows/staging-traffic-control.yml",
    protectedEnvironment: environment,
    runId,
    runAttempt: normalizeAttempt(input.githubRunAttempt),
    runUrl: `https://github.com/${SOURCE_REPOSITORY}/actions/runs/${runId}`,
    actor: input.githubActor?.trim(),
  };
}

export function buildStagingPromotionManifest(input) {
  const deployment = input.zeroTrafficDeployment;
  const verification = input.verification;
  assert(
    deployment?.status === "deployed-zero-traffic",
    "Zero-traffic deployment is not validated",
  );
  validateStagingVerificationManifest(verification);
  assert(
    deployment.candidateSha === verification.candidateSha &&
      deployment.releaseId === verification.releaseId &&
      deployment.deployment.service === verification.service &&
      deployment.deployment.revision === verification.revision,
    "Promotion evidence does not describe one candidate revision",
  );
  const priorRevision = input.priorRevision;
  const candidateRevision = deployment.deployment.revision;
  assert(
    REVISION_PATTERN.test(priorRevision ?? "") &&
      priorRevision !== candidateRevision,
    "Promotion requires a distinct recorded prior revision",
  );
  const trafficBefore = assertSingleRevisionTraffic(
    input.trafficBefore,
    priorRevision,
    "Traffic before promotion",
  );
  const trafficAfter = assertSingleRevisionTraffic(
    input.trafficAfter,
    candidateRevision,
    "Traffic after promotion",
  );
  assert(
    input.operatorIdentity === PROMOTER,
    "Promotion must use the dedicated promoter identity",
  );
  const manifest = {
    schemaVersion: 1,
    status: "promoted",
    environment: "staging",
    dataClassification: "synthetic-only",
    releaseId: deployment.releaseId,
    candidateSha: deployment.candidateSha,
    controllerSha: input.controllerSha,
    sourceRepository: SOURCE_REPOSITORY,
    projectId: PROJECT_ID,
    projectNumber: PROJECT_NUMBER,
    region: REGION,
    service: deployment.deployment.service,
    candidateRevision,
    imageDigest: deployment.publication.imageDigest,
    zeroTrafficDeploymentManifestSha256: normalizeHash(
      input.zeroTrafficDeploymentManifestSha256,
      "Zero-traffic deployment manifest hash",
    ),
    verification: {
      manifestSha256: normalizeHash(
        input.verificationManifestSha256,
        "Verification manifest hash",
      ),
      qaseProject: verification.qase.project,
      qaseEnvironment: verification.qase.environment,
      qaseRunId: verification.qase.runId,
      qaseRunUrl: verification.qase.runUrl,
      checks: verification.checks,
    },
    trafficBefore,
    trafficAfter,
    rollbackTarget: {
      revision: priorRevision,
      traffic: trafficBefore,
    },
    github: buildGitHub(input, "staging-traffic-promotion"),
    operatorIdentity: input.operatorIdentity,
    promotionAuthorized: true,
    rollbackExecuted: false,
    initialActivation: false,
    vendorActivationAuthorized: false,
    generatedAt: normalizeTimestamp(input.generatedAt, "Promotion timestamp"),
  };
  validateStagingPromotionManifest(manifest);
  return Object.freeze(manifest);
}

export function validateStagingPromotionManifest(manifest) {
  validateReleaseIdentity(manifest);
  assert(manifest.status === "promoted", "Promotion status drifted");
  assert(
    manifest.candidateRevision ===
      `${manifest.service}-${manifest.candidateSha.slice(0, 12)}` &&
      new RegExp(
        `/samra-staging/${manifest.service}@sha256:[0-9a-f]{64}$`,
      ).test(manifest.imageDigest),
    "Promoted revision or image provenance drifted",
  );
  normalizeHash(
    manifest.zeroTrafficDeploymentManifestSha256,
    "Zero-traffic deployment manifest hash",
  );
  normalizeHash(
    manifest.verification.manifestSha256,
    "Verification manifest hash",
  );
  assert(
    manifest.verification.qaseProject === "SAMP" &&
      manifest.verification.qaseEnvironment === "google-cloud-staging" &&
      /^\d+$/.test(manifest.verification.qaseRunId) &&
      manifest.verification.qaseRunUrl ===
        `https://app.qase.io/run/SAMP/dashboard/${manifest.verification.qaseRunId}` &&
      JSON.stringify(Object.keys(manifest.verification.checks)) ===
        JSON.stringify(STAGING_VERIFICATION_CHECKS) &&
      STAGING_VERIFICATION_CHECKS.every(
        (check) => manifest.verification.checks[check] === "passed",
      ),
    "Promotion verification evidence drifted",
  );
  const before = assertSingleRevisionTraffic(
    manifest.trafficBefore,
    manifest.rollbackTarget.revision,
    "Traffic before promotion",
  );
  const after = assertSingleRevisionTraffic(
    manifest.trafficAfter,
    manifest.candidateRevision,
    "Traffic after promotion",
  );
  assert(
    manifest.rollbackTarget.revision !== manifest.candidateRevision &&
      JSON.stringify(before) ===
        JSON.stringify(
          normalizeStagingTraffic(
            manifest.rollbackTarget.traffic,
            "Rollback target traffic",
          ),
        ) &&
      after[0].percent === 100,
    "Promotion rollback target drifted",
  );
  validateGitHubProvenance(manifest.github, "staging-traffic-promotion");
  assert(
    manifest.operatorIdentity === PROMOTER &&
      manifest.promotionAuthorized === true &&
      manifest.rollbackExecuted === false &&
      manifest.initialActivation === false &&
      manifest.vendorActivationAuthorized === false,
    "Promotion evidence exceeded authority",
  );
  normalizeTimestamp(manifest.generatedAt, "Promotion timestamp");
  assertSafeEvidence(manifest);
  return manifest;
}

export function buildStagingRollbackManifest(input) {
  const promotion = input.promotion;
  validateStagingPromotionManifest(promotion);
  assert(
    input.operatorIdentity === ROLLBACK_OPERATOR,
    "Rollback must use the dedicated rollback identity",
  );
  const reason = input.reason?.trim();
  assert(
    reason && reason.length >= 12 && reason.length <= 500,
    "Rollback reason must be 12 to 500 characters",
  );
  const trafficBefore = assertSingleRevisionTraffic(
    input.trafficBefore,
    promotion.candidateRevision,
    "Traffic before rollback",
  );
  const trafficAfter = assertSingleRevisionTraffic(
    input.trafficAfter,
    promotion.rollbackTarget.revision,
    "Traffic after rollback",
  );
  const manifest = {
    schemaVersion: 1,
    status: "rolled-back-pending-post-verification",
    environment: "staging",
    dataClassification: "synthetic-only",
    releaseId: promotion.releaseId,
    candidateSha: promotion.candidateSha,
    controllerSha: input.controllerSha,
    sourceRepository: SOURCE_REPOSITORY,
    projectId: PROJECT_ID,
    projectNumber: PROJECT_NUMBER,
    region: REGION,
    service: promotion.service,
    failedRevision: promotion.candidateRevision,
    restoredRevision: promotion.rollbackTarget.revision,
    promotionManifestSha256: normalizeHash(
      input.promotionManifestSha256,
      "Promotion manifest hash",
    ),
    reason,
    trafficBefore,
    trafficAfter,
    github: buildGitHub(input, "staging-traffic-rollback"),
    operatorIdentity: input.operatorIdentity,
    rollbackAuthorized: true,
    rebuildExecuted: false,
    postRollbackVerificationRequired: true,
    postRollbackVerificationStatus: "pending",
    vendorActivationAuthorized: false,
    generatedAt: normalizeTimestamp(input.generatedAt, "Rollback timestamp"),
  };
  validateStagingRollbackManifest(manifest);
  return Object.freeze(manifest);
}

export function validateStagingRollbackManifest(manifest) {
  validateReleaseIdentity(manifest);
  assert(
    manifest.status === "rolled-back-pending-post-verification" &&
      manifest.failedRevision ===
        `${manifest.service}-${manifest.candidateSha.slice(0, 12)}` &&
      REVISION_PATTERN.test(manifest.restoredRevision) &&
      manifest.restoredRevision !== manifest.failedRevision,
    "Rollback revision identity drifted",
  );
  normalizeHash(manifest.promotionManifestSha256, "Promotion manifest hash");
  assert(
    typeof manifest.reason === "string" &&
      manifest.reason.length >= 12 &&
      manifest.reason.length <= 500,
    "Rollback reason drifted",
  );
  assertSingleRevisionTraffic(
    manifest.trafficBefore,
    manifest.failedRevision,
    "Traffic before rollback",
  );
  assertSingleRevisionTraffic(
    manifest.trafficAfter,
    manifest.restoredRevision,
    "Traffic after rollback",
  );
  validateGitHubProvenance(manifest.github, "staging-traffic-rollback");
  assert(
    manifest.operatorIdentity === ROLLBACK_OPERATOR &&
      manifest.rollbackAuthorized === true &&
      manifest.rebuildExecuted === false &&
      manifest.postRollbackVerificationRequired === true &&
      manifest.postRollbackVerificationStatus === "pending" &&
      manifest.vendorActivationAuthorized === false,
    "Rollback evidence exceeded authority",
  );
  normalizeTimestamp(manifest.generatedAt, "Rollback timestamp");
  assertSafeEvidence(manifest);
  return manifest;
}

async function writeHashedManifest(manifest, manifestPath, hashPath, validate) {
  validate(manifest);
  const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
  const hash = createHash("sha256").update(serialized).digest("hex");
  await Promise.all([
    mkdir(dirname(manifestPath), { recursive: true }),
    mkdir(dirname(hashPath), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(manifestPath, serialized, "utf8"),
    writeFile(hashPath, `${hash}  ${basename(manifestPath)}\n`, "utf8"),
  ]);
  return hash;
}

async function verifyHashedManifest(manifestPath, hashPath, validate) {
  const [serialized, hashRecord] = await Promise.all([
    readFile(manifestPath, "utf8"),
    readFile(hashPath, "utf8"),
  ]);
  const expected = hashRecord.trim().split(/\s+/)[0];
  const actual = createHash("sha256").update(serialized).digest("hex");
  assert(expected === actual, "Traffic manifest hash does not match");
  const manifest = JSON.parse(serialized);
  validate(manifest);
  return manifest;
}

export async function writePromotionManifest(manifest, manifestPath, hashPath) {
  return writeHashedManifest(
    manifest,
    manifestPath,
    hashPath,
    validateStagingPromotionManifest,
  );
}

export async function verifyPromotionManifest(manifestPath, hashPath) {
  return verifyHashedManifest(
    manifestPath,
    hashPath,
    validateStagingPromotionManifest,
  );
}

export async function writeRollbackManifest(manifest, manifestPath, hashPath) {
  return writeHashedManifest(
    manifest,
    manifestPath,
    hashPath,
    validateStagingRollbackManifest,
  );
}

export async function verifyRollbackManifest(manifestPath, hashPath) {
  return verifyHashedManifest(
    manifestPath,
    hashPath,
    validateStagingRollbackManifest,
  );
}

export async function verifyVerificationManifest(manifestPath, hashPath) {
  return verifyHashedManifest(
    manifestPath,
    hashPath,
    validateStagingVerificationManifest,
  );
}

function parseCliArguments(values) {
  const options = {};
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    assert(
      key?.startsWith("--") && value !== undefined,
      `Invalid option: ${key}`,
    );
    options[key.slice(2).replaceAll("-", "_")] = value;
  }
  return options;
}

async function runCli() {
  const operation = process.argv[2];
  assert(
    operation === "promote" || operation === "rollback",
    "First argument must be promote or rollback",
  );
  const options = parseCliArguments(process.argv.slice(3));
  const trafficBefore = await readFile(options.traffic_before, "utf8").then(
    JSON.parse,
  );
  const trafficAfter = await readFile(options.traffic_after, "utf8").then(
    JSON.parse,
  );
  let manifest;
  let hash;
  if (operation === "promote") {
    const zeroTrafficDeployment = await verifyZeroTrafficDeploymentManifest(
      options.zero_traffic_manifest,
      options.zero_traffic_hash,
    );
    const verification = await verifyVerificationManifest(
      options.verification_manifest,
      options.verification_hash,
    );
    const [zeroHash, verificationHash] = await Promise.all([
      readFile(options.zero_traffic_hash, "utf8"),
      readFile(options.verification_hash, "utf8"),
    ]);
    manifest = buildStagingPromotionManifest({
      zeroTrafficDeployment,
      zeroTrafficDeploymentManifestSha256: zeroHash.trim().split(/\s+/)[0],
      verification,
      verificationManifestSha256: verificationHash.trim().split(/\s+/)[0],
      controllerSha: options.controller_sha,
      priorRevision: options.prior_revision,
      trafficBefore,
      trafficAfter,
      operatorIdentity: options.operator_identity,
      githubRunId: options.github_run_id,
      githubRunAttempt: options.github_run_attempt,
      githubActor: options.github_actor,
      generatedAt: options.generated_at ?? new Date().toISOString(),
    });
    hash = await writePromotionManifest(
      manifest,
      options.output,
      options.hash_output,
    );
  } else {
    const promotion = await verifyPromotionManifest(
      options.promotion_manifest,
      options.promotion_hash,
    );
    const promotionHash = await readFile(options.promotion_hash, "utf8");
    manifest = buildStagingRollbackManifest({
      promotion,
      promotionManifestSha256: promotionHash.trim().split(/\s+/)[0],
      controllerSha: options.controller_sha,
      reason: options.reason,
      trafficBefore,
      trafficAfter,
      operatorIdentity: options.operator_identity,
      githubRunId: options.github_run_id,
      githubRunAttempt: options.github_run_attempt,
      githubActor: options.github_actor,
      generatedAt: options.generated_at ?? new Date().toISOString(),
    });
    hash = await writeRollbackManifest(
      manifest,
      options.output,
      options.hash_output,
    );
  }
  process.stdout.write(
    `${JSON.stringify({ status: "recorded", operation, releaseId: manifest.releaseId, service: manifest.service, sha256: hash })}\n`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runCli().catch((error) => {
    process.stderr.write(
      `Unable to record staging traffic control: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
