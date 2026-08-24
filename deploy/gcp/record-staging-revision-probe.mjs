import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import {
  validateStagingZeroTrafficDeploymentManifest,
  verifyZeroTrafficDeploymentManifest,
} from "./record-staging-zero-traffic-deployment.mjs";
import {
  validateStagingImageVerificationManifest,
  verifyStagingImageVerificationManifest,
} from "./record-staging-image-verification.mjs";
import { STAGING_REVISION_PROBE_CHECKS } from "./validate-staging-revision-probe.mjs";

const SOURCE_REPOSITORY = "haileleuld87/Samra-Pay";
const PROJECT_ID = "samra-pay-staging";
const PROJECT_NUMBER = "934122615631";
const REGION = "us-east4";
const SERVICE = "samra-api";
const JOB = "samra-staging-revision-probe";
const RUNTIME_IDENTITY =
  "samra-revision-probe-staging@samra-pay-staging.iam.gserviceaccount.com";
const WORKFLOW = "Staging verification probe";
const WORKFLOW_PATH = ".github/workflows/staging-verification-probe.yml";
const PROTECTED_ENVIRONMENT = "staging-verification";
const EXECUTION_MODE = "private-exact-revision-http-probe";
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const EXECUTION_PATTERN = /^[a-z][a-z0-9-]{0,62}$/;
const PROBE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,47}$/;

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

function assertSafeEvidence(value, label) {
  assert(
    !/postgres(?:ql)?:\/\/|worf\.replit|12345678|client_secret|api[_-]?key|private[_-]?key|authorization:|bearer\s+|metadata\.google\.internal/i.test(
      typeof value === "string" ? value : JSON.stringify(value),
    ),
    `${label} contains a credential or prohibited endpoint`,
  );
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function validateStagingRevisionProbeResult(
  result,
  expectedRevision,
  expectedProbeId,
) {
  assert(
    result?.schemaVersion === 1 &&
      result.status === "passed" &&
      result.probeId === expectedProbeId &&
      PROBE_ID_PATTERN.test(result.probeId) &&
      [401, 403].includes(result.unauthenticatedStatus) &&
      result.authenticatedHealthStatus === 200 &&
      result.authenticatedReadinessStatus === 200 &&
      HASH_PATTERN.test(result.healthResponseSha256) &&
      HASH_PATTERN.test(result.readinessResponseSha256) &&
      result.observedRevision === expectedRevision &&
      result.serviceAuthenticationObserved === true &&
      result.deployedRevisionNetworkPathObserved === true &&
      result.tokenRecorded === false,
    "Staging revision-probe result failed or drifted",
  );
  assertSafeEvidence(result, "Revision-probe result");
  return result;
}

export function buildStagingRevisionProbeJUnit(result) {
  const tests = [
    {
      id: "STAGING-REVISION-001",
      name: "private service rejects an unauthenticated request and accepts Google identity",
      detail: `anonymous=${result.unauthenticatedStatus}; authenticated=${result.authenticatedHealthStatus}`,
    },
    {
      id: "STAGING-REVISION-002",
      name: "private network path reaches the exact ready revision",
      detail: `readiness=${result.authenticatedReadinessStatus}; revision=${result.observedRevision}`,
    },
  ];
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<testsuites tests="2" failures="0" errors="0" skipped="0">',
    '  <testsuite name="Google Cloud staging deployed revision" tests="2" failures="0" errors="0" skipped="0">',
    ...tests.flatMap((entry) => [
      `    <testcase classname="Google Cloud staging deployed revision" name="${entry.id} ${escapeXml(entry.name)}">`,
      `      <system-out>${escapeXml(entry.detail)}</system-out>`,
      "    </testcase>",
    ]),
    "  </testsuite>",
    "</testsuites>",
    "",
  ].join("\n");
}

export function extractStagingRevisionProbeResultFromLogs(
  entries,
  executionName,
  expectedRevision,
  expectedProbeId,
) {
  assert(
    Array.isArray(entries) && entries.length > 0,
    "No revision-probe logs found",
  );
  assert(
    EXECUTION_PATTERN.test(executionName),
    "Probe execution name is invalid",
  );
  const payloads = entries
    .map((entry) => {
      assert(
        entry?.resource?.type === "cloud_run_job" &&
          entry.resource.labels?.job_name === JOB &&
          entry.labels?.execution_name === executionName &&
          entry.logName?.endsWith("/logs/run.googleapis.com%2Fstdout") &&
          typeof entry.textPayload === "string",
        "Revision-probe log escaped the restricted execution boundary",
      );
      return entry;
    })
    .sort((left, right) =>
      `${left.timestamp ?? ""}`.localeCompare(`${right.timestamp ?? ""}`),
    )
    .flatMap((entry) => entry.textPayload.split("\n"))
    .map((line) => line.trim())
    .filter(Boolean);
  assert(
    payloads.length === 1,
    "Revision-probe stdout must contain exactly one result",
  );
  const prefix = "SAMRA_REVISION_PROBE_RESULT=";
  assert(
    payloads[0].startsWith(prefix),
    "Revision-probe result marker is missing",
  );
  const result = JSON.parse(payloads[0].slice(prefix.length));
  return validateStagingRevisionProbeResult(
    result,
    expectedRevision,
    expectedProbeId,
  );
}

function validateGitHub(github) {
  assert(
    github?.repository === SOURCE_REPOSITORY &&
      github.ref === "refs/heads/main" &&
      github.eventName === "workflow_dispatch" &&
      github.workflow === WORKFLOW &&
      github.workflowPath === WORKFLOW_PATH &&
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
    "Revision-probe GitHub provenance drifted",
  );
  return github;
}

export function validateStagingRevisionProbeManifest(manifest) {
  assert(
    manifest?.schemaVersion === 1 &&
      manifest.status === "passed" &&
      manifest.environment === "staging" &&
      manifest.dataClassification === "synthetic-only" &&
      manifest.sourceRepository === SOURCE_REPOSITORY &&
      manifest.projectId === PROJECT_ID &&
      manifest.projectNumber === PROJECT_NUMBER &&
      manifest.region === REGION &&
      manifest.service === SERVICE &&
      SHA_PATTERN.test(manifest.candidateSha) &&
      manifest.releaseId === `staging-${manifest.candidateSha.slice(0, 12)}` &&
      manifest.revision ===
        `${SERVICE}-${manifest.candidateSha.slice(0, 12)}` &&
      typeof manifest.imageDigest === "string" &&
      manifest.imageDigest.endsWith(`@sha256:${manifest.imageDigestSha256}`) &&
      HASH_PATTERN.test(manifest.imageDigestSha256),
    "Revision-probe release identity drifted",
  );
  assert(
    manifest.execution?.mode === EXECUTION_MODE &&
      PROBE_ID_PATTERN.test(manifest.execution.probeId) &&
      EXECUTION_PATTERN.test(manifest.execution.jobExecutionId) &&
      manifest.execution.runtimeServiceAccount === RUNTIME_IDENTITY &&
      HASH_PATTERN.test(manifest.execution.resultSha256) &&
      HASH_PATTERN.test(manifest.execution.junitSha256),
    "Revision-probe execution identity drifted",
  );
  assert(
    JSON.stringify(manifest.checks) ===
      JSON.stringify(
        Object.fromEntries(
          STAGING_REVISION_PROBE_CHECKS.map((check) => [check, "passed"]),
        ),
      ),
    "Revision-probe checks are incomplete",
  );
  assert(
    [401, 403].includes(manifest.observations.unauthenticatedStatus) &&
      manifest.observations.authenticatedHealthStatus === 200 &&
      manifest.observations.authenticatedReadinessStatus === 200 &&
      manifest.observations.observedRevision === manifest.revision &&
      HASH_PATTERN.test(manifest.observations.healthResponseSha256) &&
      HASH_PATTERN.test(manifest.observations.readinessResponseSha256) &&
      manifest.observations.tokenRecorded === false,
    "Revision-probe observations drifted",
  );
  assert(
    manifest.routing?.candidateTrafficPercentBefore === 0 &&
      manifest.routing.candidateTrafficPercentDuring === 0 &&
      manifest.routing.candidateTrafficPercentAfter === 0 &&
      manifest.routing.exactRevisionTagTemporarilyApplied === true &&
      manifest.routing.defaultServiceUrlTemporarilyEnabled === true &&
      manifest.routing.ingressChanged === false &&
      manifest.routing.publicAccessChanged === false &&
      manifest.routing.runtimeTemplateChanged === false &&
      HASH_PATTERN.test(manifest.routing.boundaryBeforeSha256) &&
      manifest.routing.boundaryAfterSha256 ===
        manifest.routing.boundaryBeforeSha256 &&
      manifest.routing.tagRemoved === true &&
      manifest.routing.defaultServiceUrlDisabledAfter === true,
    "Revision-probe service boundary was not exactly restored",
  );
  assert(
    HASH_PATTERN.test(manifest.evidence.zeroTrafficDeploymentManifestSha256) &&
      HASH_PATTERN.test(manifest.evidence.imageVerificationManifestSha256) &&
      manifest.evidence.junitSha256 === manifest.execution.junitSha256,
    "Revision-probe evidence hashes drifted",
  );
  validateGitHub(manifest.github);
  assert(
    manifest.serviceAuthenticationObserved === true &&
      manifest.deployedRevisionNetworkPathObserved === true &&
      manifest.trafficPercentageChanged === false &&
      manifest.customerDataUsed === false &&
      manifest.secretValuesRecorded === false &&
      manifest.vendorActivationAuthorized === false &&
      manifest.productionAuthorized === false,
    "Revision-probe evidence exceeded its authority",
  );
  normalizeTimestamp(manifest.generatedAt, "Revision-probe timestamp");
  assertSafeEvidence(manifest, "Revision-probe manifest");
  return manifest;
}

export function buildStagingRevisionProbeManifest(input) {
  const deployment = validateStagingZeroTrafficDeploymentManifest(
    input.zeroTrafficDeployment,
  );
  const imageVerification = validateStagingImageVerificationManifest(
    input.imageVerification,
  );
  assert(
    deployment.deployment.service === SERVICE,
    "Probe supports only the API",
  );
  assert(
    input.revision === deployment.deployment.revision &&
      input.revision === imageVerification.revision &&
      input.imageDigest === deployment.publication.imageDigest &&
      input.imageDigest === imageVerification.imageDigest &&
      deployment.candidateSha === imageVerification.candidateSha &&
      deployment.releaseId === imageVerification.releaseId &&
      imageVerification.status === "passed-not-promotion-eligible" &&
      imageVerification.promotionEligible === false,
    "Probe observation does not match the independently verified image and deployment evidence",
  );
  const result = validateStagingRevisionProbeResult(
    input.result,
    deployment.deployment.revision,
    input.probeId,
  );
  const manifest = {
    schemaVersion: 1,
    status: "passed",
    environment: "staging",
    dataClassification: "synthetic-only",
    releaseId: deployment.releaseId,
    candidateSha: deployment.candidateSha,
    sourceRepository: SOURCE_REPOSITORY,
    projectId: PROJECT_ID,
    projectNumber: PROJECT_NUMBER,
    region: REGION,
    service: SERVICE,
    revision: deployment.deployment.revision,
    imageDigest: deployment.publication.imageDigest,
    imageDigestSha256: deployment.publication.imageDigest.split("@sha256:")[1],
    execution: {
      mode: EXECUTION_MODE,
      probeId: input.probeId,
      jobExecutionId: input.jobExecutionId,
      runtimeServiceAccount: input.runtimeServiceAccount,
      resultSha256: normalizeHash(input.resultSha256, "Probe result hash"),
      junitSha256: normalizeHash(input.junitSha256, "Probe JUnit hash"),
    },
    checks: Object.fromEntries(
      STAGING_REVISION_PROBE_CHECKS.map((check) => [check, "passed"]),
    ),
    observations: {
      unauthenticatedStatus: result.unauthenticatedStatus,
      authenticatedHealthStatus: result.authenticatedHealthStatus,
      authenticatedReadinessStatus: result.authenticatedReadinessStatus,
      healthResponseSha256: result.healthResponseSha256,
      readinessResponseSha256: result.readinessResponseSha256,
      observedRevision: result.observedRevision,
      tokenRecorded: false,
    },
    routing: structuredClone(input.routing),
    evidence: {
      zeroTrafficDeploymentManifestSha256: normalizeHash(
        input.zeroTrafficDeploymentManifestSha256,
        "Zero-traffic deployment manifest hash",
      ),
      imageVerificationManifestSha256: normalizeHash(
        input.imageVerificationManifestSha256,
        "Image-verification manifest hash",
      ),
      junitSha256: normalizeHash(input.junitSha256, "Probe JUnit hash"),
    },
    github: structuredClone(input.github),
    serviceAuthenticationObserved: true,
    deployedRevisionNetworkPathObserved: true,
    trafficPercentageChanged: false,
    customerDataUsed: false,
    secretValuesRecorded: false,
    vendorActivationAuthorized: false,
    productionAuthorized: false,
    generatedAt: input.generatedAt,
  };
  validateStagingRevisionProbeManifest(manifest);
  return Object.freeze(manifest);
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

export async function writeStagingRevisionProbeManifest(
  manifest,
  manifestPath,
  hashPath,
) {
  validateStagingRevisionProbeManifest(manifest);
  return writeHashedManifest(manifest, manifestPath, hashPath);
}

export async function verifyStagingRevisionProbeManifest(
  manifestPath,
  hashPath,
) {
  const [serialized, hashRecord] = await Promise.all([
    readFile(manifestPath, "utf8"),
    readFile(hashPath, "utf8"),
  ]);
  const expectedHash = hashRecord.trim().split(/\s+/)[0];
  const actualHash = createHash("sha256").update(serialized).digest("hex");
  assert(
    expectedHash === actualHash,
    "Revision-probe manifest hash does not match",
  );
  const manifest = JSON.parse(serialized);
  validateStagingRevisionProbeManifest(manifest);
  return manifest;
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
  if (command === "extract-result") {
    const result = extractStagingRevisionProbeResultFromLogs(
      JSON.parse(await readFile(required(options, "logs"), "utf8")),
      required(options, "execution"),
      required(options, "expected_revision"),
      required(options, "probe_id"),
    );
    const resultSerialized = `${JSON.stringify(result)}\n`;
    const junit = buildStagingRevisionProbeJUnit(result);
    await Promise.all([
      mkdir(dirname(required(options, "observation")), { recursive: true }),
      mkdir(dirname(required(options, "junit")), { recursive: true }),
    ]);
    await Promise.all([
      writeFile(required(options, "observation"), resultSerialized, "utf8"),
      writeFile(required(options, "junit"), junit, "utf8"),
    ]);
    process.stdout.write(
      `${JSON.stringify({
        status: "passed",
        resultSha256: createHash("sha256")
          .update(resultSerialized)
          .digest("hex"),
        junitSha256: createHash("sha256").update(junit).digest("hex"),
      })}\n`,
    );
    return;
  }
  if (command === "build") {
    const zeroTrafficManifestPath = required(options, "zero_traffic_manifest");
    const zeroTrafficHashPath = required(options, "zero_traffic_hash");
    const imageManifestPath = required(options, "image_manifest");
    const imageHashPath = required(options, "image_hash");
    const zeroTrafficDeployment = await verifyZeroTrafficDeploymentManifest(
      zeroTrafficManifestPath,
      zeroTrafficHashPath,
    );
    const imageVerification = await verifyStagingImageVerificationManifest(
      imageManifestPath,
      imageHashPath,
    );
    const input = JSON.parse(
      await readFile(required(options, "input"), "utf8"),
    );
    const manifest = buildStagingRevisionProbeManifest({
      ...input,
      zeroTrafficDeployment,
      imageVerification,
      zeroTrafficDeploymentManifestSha256: normalizeHash(
        (await readFile(zeroTrafficHashPath, "utf8")).trim().split(/\s+/)[0],
        "Zero-traffic deployment manifest hash",
      ),
      imageVerificationManifestSha256: normalizeHash(
        (await readFile(imageHashPath, "utf8")).trim().split(/\s+/)[0],
        "Image-verification manifest hash",
      ),
    });
    const hash = await writeStagingRevisionProbeManifest(
      manifest,
      required(options, "output"),
      required(options, "hash_output"),
    );
    process.stdout.write(`${JSON.stringify({ status: "passed", hash })}\n`);
    return;
  }
  if (command === "verify") {
    const manifest = await verifyStagingRevisionProbeManifest(
      required(options, "manifest"),
      required(options, "hash"),
    );
    process.stdout.write(
      `${JSON.stringify({
        status: manifest.status,
        candidateSha: manifest.candidateSha,
        revision: manifest.revision,
      })}\n`,
    );
    return;
  }
  throw new Error(
    "Usage: record-staging-revision-probe.mjs <extract-result|build|verify> ...",
  );
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
