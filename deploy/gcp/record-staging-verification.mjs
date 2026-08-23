import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import {
  validateStagingZeroTrafficDeploymentManifest,
  verifyZeroTrafficDeploymentManifest,
} from "./record-staging-zero-traffic-deployment.mjs";
import {
  STAGING_TRAFFIC_SERVICES,
  STAGING_VERIFICATION_CHECKS,
} from "./validate-staging-traffic-control.mjs";

const SOURCE_REPOSITORY = "haileleuld87/Samra-Pay";
const PROJECT_ID = "samra-pay-staging";
const PROJECT_NUMBER = "934122615631";
const REGION = "us-east4";
const PROBE_WORKFLOW = "Staging verification probe";
const PROBE_WORKFLOW_PATH = ".github/workflows/staging-verification-probe.yml";
const PROTECTED_ENVIRONMENT = "staging-verification";
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function normalizeHash(value, label) {
  const normalized = value?.trim().toLowerCase();
  assert(HASH_PATTERN.test(normalized ?? ""), `${label} must be SHA-256`);
  return normalized;
}

function normalizeTimestamp(value, label) {
  const normalized = new Date(value).toISOString();
  assert(normalized === value, `${label} must be canonical ISO-8601`);
  return normalized;
}

function validateChecks(checks) {
  assert(
    checks &&
      JSON.stringify(Object.keys(checks)) ===
        JSON.stringify(STAGING_VERIFICATION_CHECKS) &&
      STAGING_VERIFICATION_CHECKS.every((check) => checks[check] === "passed"),
    "All required deployed-revision verification checks must pass",
  );
  return checks;
}

function validateQase(qase) {
  assert(
    qase?.project === "SAMP" &&
      qase.environment === "google-cloud-staging" &&
      qase.status === "passed" &&
      typeof qase.runId === "string" &&
      /^\d+$/.test(qase.runId) &&
      qase.runUrl === `https://app.qase.io/run/SAMP/dashboard/${qase.runId}`,
    "Qase staging evidence drifted or is not passing",
  );
  return qase;
}

function validateProbeGitHub(github) {
  assert(
    github?.repository === SOURCE_REPOSITORY &&
      github.ref === "refs/heads/main" &&
      github.eventName === "workflow_dispatch" &&
      github.workflow === PROBE_WORKFLOW &&
      github.workflowPath === PROBE_WORKFLOW_PATH &&
      github.protectedEnvironment === PROTECTED_ENVIRONMENT &&
      typeof github.runId === "string" &&
      /^\d+$/.test(github.runId) &&
      Number.isSafeInteger(github.runAttempt) &&
      github.runAttempt >= 1 &&
      github.runUrl ===
        `https://github.com/${SOURCE_REPOSITORY}/actions/runs/${github.runId}` &&
      typeof github.actor === "string" &&
      github.actor.trim().length > 0 &&
      github.actor === github.actor.trim(),
    "GitHub verification-probe provenance drifted",
  );
  return github;
}

function assertSafeEvidence(manifest) {
  assert(
    !/postgres(?:ql)?:\/\/|worf\.replit|12345678|client_secret|api[_-]?key|private[_-]?key|authorization:|bearer\s+/i.test(
      JSON.stringify(manifest),
    ),
    "Verification evidence contains a credential or prohibited endpoint",
  );
}

function validateIdentity(manifest, label) {
  assert(
    manifest.schemaVersion === 1 &&
      manifest.status === "passed" &&
      manifest.environment === "staging" &&
      manifest.dataClassification === "synthetic-only" &&
      manifest.sourceRepository === SOURCE_REPOSITORY &&
      manifest.projectId === PROJECT_ID &&
      manifest.projectNumber === PROJECT_NUMBER &&
      manifest.region === REGION &&
      SHA_PATTERN.test(manifest.candidateSha) &&
      manifest.releaseId === `staging-${manifest.candidateSha.slice(0, 12)}` &&
      STAGING_TRAFFIC_SERVICES.includes(manifest.service) &&
      manifest.revision ===
        `${manifest.service}-${manifest.candidateSha.slice(0, 12)}`,
    `${label} identity drifted`,
  );
}

export function validateStagingVerificationProbeManifest(manifest) {
  validateIdentity(manifest, "Verification probe");
  validateChecks(manifest.checks);
  validateQase(manifest.qase);
  validateProbeGitHub(manifest.github);
  assert(
    manifest.exactRevisionObserved === true &&
      manifest.allChecksUsedDeployedRevision === true &&
      manifest.trafficChanged === false &&
      manifest.publicAccessChanged === false &&
      manifest.runtimeConfigurationChanged === false &&
      manifest.customerDataUsed === false &&
      manifest.secretValuesRecorded === false &&
      manifest.vendorActivationAuthorized === false,
    "Verification probe exceeded synthetic evidence-only authority",
  );
  normalizeTimestamp(manifest.generatedAt, "Verification probe timestamp");
  assertSafeEvidence(manifest);
  return manifest;
}

export function validateStagingVerificationManifest(manifest) {
  validateIdentity(manifest, "Verification manifest");
  assert(
    SHA_PATTERN.test(manifest.controllerSha),
    "Verification controller SHA is invalid",
  );
  validateChecks(manifest.checks);
  validateQase(manifest.qase);
  validateProbeGitHub(manifest.probeGitHub);
  assert(
    HASH_PATTERN.test(manifest.evidence.zeroTrafficDeploymentManifestSha256) &&
      HASH_PATTERN.test(manifest.evidence.probeManifestSha256),
    "Verification input evidence hashes are invalid",
  );
  assert(
    manifest.exactRevisionObserved === true &&
      manifest.allChecksUsedDeployedRevision === true &&
      manifest.trafficChanged === false &&
      manifest.publicAccessChanged === false &&
      manifest.runtimeConfigurationChanged === false &&
      manifest.customerDataUsed === false &&
      manifest.secretValuesRecorded === false &&
      manifest.trafficAuthorized === false &&
      manifest.vendorActivationAuthorized === false &&
      manifest.productionAuthorized === false,
    "Verification manifest exceeded evidence-only authority",
  );
  normalizeTimestamp(manifest.generatedAt, "Verification timestamp");
  assertSafeEvidence(manifest);
  return manifest;
}

export function buildStagingVerificationManifest(input) {
  const deployment = validateStagingZeroTrafficDeploymentManifest(
    input.zeroTrafficDeployment,
  );
  const probe = validateStagingVerificationProbeManifest(input.probe);
  assert(
    deployment.candidateSha === probe.candidateSha &&
      deployment.releaseId === probe.releaseId &&
      deployment.deployment.service === probe.service &&
      deployment.deployment.revision === probe.revision,
    "Verification inputs do not describe one exact candidate revision",
  );
  const manifest = {
    schemaVersion: 1,
    status: "passed",
    environment: "staging",
    dataClassification: "synthetic-only",
    releaseId: probe.releaseId,
    candidateSha: probe.candidateSha,
    controllerSha: input.controllerSha?.trim().toLowerCase(),
    sourceRepository: SOURCE_REPOSITORY,
    projectId: PROJECT_ID,
    projectNumber: PROJECT_NUMBER,
    region: REGION,
    service: probe.service,
    revision: probe.revision,
    checks: Object.fromEntries(
      STAGING_VERIFICATION_CHECKS.map((check) => [check, "passed"]),
    ),
    qase: structuredClone(probe.qase),
    evidence: {
      zeroTrafficDeploymentManifestSha256: normalizeHash(
        input.zeroTrafficDeploymentManifestSha256,
        "Zero-traffic deployment manifest hash",
      ),
      probeManifestSha256: normalizeHash(
        input.probeManifestSha256,
        "Verification probe manifest hash",
      ),
    },
    probeGitHub: structuredClone(probe.github),
    exactRevisionObserved: true,
    allChecksUsedDeployedRevision: true,
    trafficChanged: false,
    publicAccessChanged: false,
    runtimeConfigurationChanged: false,
    customerDataUsed: false,
    secretValuesRecorded: false,
    trafficAuthorized: false,
    vendorActivationAuthorized: false,
    productionAuthorized: false,
    generatedAt: input.generatedAt,
  };
  validateStagingVerificationManifest(manifest);
  return manifest;
}

async function writeHashedManifest(manifest, manifestPath, hashPath) {
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

async function verifyHashedManifest(manifestPath, hashPath, validator, label) {
  const [serialized, hashRecord] = await Promise.all([
    readFile(manifestPath, "utf8"),
    readFile(hashPath, "utf8"),
  ]);
  const expectedHash = hashRecord.trim().split(/\s+/)[0];
  const actualHash = createHash("sha256").update(serialized).digest("hex");
  assert(expectedHash === actualHash, `${label} manifest hash does not match`);
  const manifest = JSON.parse(serialized);
  validator(manifest);
  return manifest;
}

export async function writeStagingVerificationProbeManifest(
  manifest,
  manifestPath,
  hashPath,
) {
  validateStagingVerificationProbeManifest(manifest);
  return writeHashedManifest(manifest, manifestPath, hashPath);
}

export async function verifyStagingVerificationProbeManifest(
  manifestPath,
  hashPath,
) {
  return verifyHashedManifest(
    manifestPath,
    hashPath,
    validateStagingVerificationProbeManifest,
    "Verification probe",
  );
}

export async function writeStagingVerificationManifest(
  manifest,
  manifestPath,
  hashPath,
) {
  validateStagingVerificationManifest(manifest);
  return writeHashedManifest(manifest, manifestPath, hashPath);
}

export async function verifyStagingVerificationManifest(
  manifestPath,
  hashPath,
) {
  return verifyHashedManifest(
    manifestPath,
    hashPath,
    validateStagingVerificationManifest,
    "Verification",
  );
}

function parseArguments(values) {
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

function required(options, name) {
  assert(options[name], `Missing --${name.replaceAll("_", "-")}`);
  return options[name];
}

async function main(values) {
  const [command, ...rawOptions] =
    values[0] === "--" ? values.slice(1) : values;
  const options = parseArguments(rawOptions);
  if (command === "build") {
    const zeroTrafficDeployment = await verifyZeroTrafficDeploymentManifest(
      required(options, "zero_traffic_manifest"),
      required(options, "zero_traffic_hash"),
    );
    const probe = await verifyStagingVerificationProbeManifest(
      required(options, "probe_manifest"),
      required(options, "probe_hash"),
    );
    const manifest = buildStagingVerificationManifest({
      zeroTrafficDeployment,
      zeroTrafficDeploymentManifestSha256: normalizeHash(
        (await readFile(required(options, "zero_traffic_hash"), "utf8"))
          .trim()
          .split(/\s+/)[0],
        "Zero-traffic deployment manifest hash",
      ),
      probe,
      probeManifestSha256: normalizeHash(
        (await readFile(required(options, "probe_hash"), "utf8"))
          .trim()
          .split(/\s+/)[0],
        "Verification probe manifest hash",
      ),
      controllerSha: required(options, "controller_sha"),
      generatedAt: options.generated_at ?? new Date().toISOString(),
    });
    const hash = await writeStagingVerificationManifest(
      manifest,
      required(options, "output"),
      required(options, "hash_output"),
    );
    process.stdout.write(`${JSON.stringify({ status: "passed", hash })}\n`);
    return;
  }
  if (command === "verify") {
    const manifest = await verifyStagingVerificationManifest(
      required(options, "manifest"),
      required(options, "hash"),
    );
    process.stdout.write(
      `${JSON.stringify({
        status: manifest.status,
        candidateSha: manifest.candidateSha,
        service: manifest.service,
        revision: manifest.revision,
        qaseRunId: manifest.qase.runId,
      })}\n`,
    );
    return;
  }
  throw new Error("Usage: record-staging-verification.mjs <build|verify> ...");
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
