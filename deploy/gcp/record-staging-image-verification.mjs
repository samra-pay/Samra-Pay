import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import {
  validateStagingZeroTrafficDeploymentManifest,
  verifyZeroTrafficDeploymentManifest,
} from "./record-staging-zero-traffic-deployment.mjs";
import {
  STAGING_IMAGE_VERIFICATION_CHECKS,
  STAGING_IMAGE_VERIFICATION_EXCLUSIONS,
} from "./validate-staging-image-verification.mjs";

const SOURCE_REPOSITORY = "samra-pay/Samra-Pay";
const PROJECT_ID = "samra-pay-staging";
const PROJECT_NUMBER = "934122615631";
const REGION = "us-east4";
const SERVICE = "samra-api";
const IMAGE_PREFIX = `${REGION}-docker.pkg.dev/${PROJECT_ID}/samra-staging/${SERVICE}@sha256:`;
const RUNTIME_IDENTITY =
  "samra-verifier-staging@samra-pay-staging.iam.gserviceaccount.com";
const STATUS = "passed-not-promotion-eligible";
const EXECUTION_MODE = "exact-image-private-job";
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const DIGEST_PATTERN = /@sha256:[0-9a-f]{64}$/;
const SYNTHETIC_RUN_PATTERN = /^[a-z0-9][a-z0-9-]{0,47}$/;
const EXECUTION_ID_PATTERN = /^[a-z][a-z0-9-]{0,62}$/;
const VERIFICATION_JOB = "samra-staging-image-verifier";
const EXPECTED_TEST_IDS = Object.freeze(
  Array.from(
    { length: 9 },
    (_, index) => `SYNTH-DAILY-${String(index + 1).padStart(3, "0")}`,
  ),
);

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

function validatePassedChecks(checks) {
  assert(
    checks &&
      JSON.stringify(Object.keys(checks)) ===
        JSON.stringify(STAGING_IMAGE_VERIFICATION_CHECKS) &&
      STAGING_IMAGE_VERIFICATION_CHECKS.every(
        (check) => checks[check] === "passed",
      ),
    "All exact-image synthetic checks must pass in contract order",
  );
  return checks;
}

function validateRevisionAttestation(attestation) {
  assert(
    attestation &&
      JSON.stringify(Object.keys(attestation)) ===
        JSON.stringify([
          "ready",
          "exactImageDigest",
          "privateIngress",
          "defaultServiceUrlDisabled",
          "publicIamAbsent",
        ]) &&
      Object.values(attestation).every((value) => value === true),
    "Exact revision attestation is incomplete or failed",
  );
  return attestation;
}

function validateExecution(execution) {
  assert(
    execution?.mode === EXECUTION_MODE &&
      SYNTHETIC_RUN_PATTERN.test(execution.syntheticRunId) &&
      EXECUTION_ID_PATTERN.test(execution.jobExecutionId) &&
      execution.testCount === 9 &&
      HASH_PATTERN.test(execution.junitSha256) &&
      execution.runtimeServiceAccount === RUNTIME_IDENTITY &&
      typeof execution.databaseSecretVersion === "string" &&
      /^[1-9]\d*$/.test(execution.databaseSecretVersion),
    "Exact-image synthetic execution identity drifted",
  );
  return execution;
}

function assertSafeEvidence(manifest) {
  assert(
    !/postgres(?:ql)?:\/\/|worf\.replit|12345678|client_secret|api[_-]?key|private[_-]?key|authorization:|bearer\s+|versions\/latest/i.test(
      JSON.stringify(manifest),
    ),
    "Image-verification evidence contains a credential or unsafe endpoint",
  );
}

function decodeXml(value) {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

export function validateStagingVerificationJUnit(junit) {
  assert(typeof junit === "string" && junit.length > 0, "JUnit is empty");
  assert(
    !/postgres(?:ql)?:\/\/|worf\.replit|12345678|client_secret|api[_-]?key|private[_-]?key|authorization:|bearer\s+/i.test(
      junit,
    ),
    "JUnit contains a credential or unsafe endpoint",
  );
  assert(
    /<testsuites\b/.test(junit) && /<\/testsuites>/.test(junit),
    "JUnit does not contain one complete testsuites document",
  );
  assert(
    !/<(?:failure|error|skipped)\b/.test(junit),
    "JUnit contains a failed, errored, or skipped test",
  );
  const names = [...junit.matchAll(/<testcase\b[^>]*\bname="([^"]+)"/g)].map(
    (match) => decodeXml(match[1]),
  );
  assert(names.length === 9, "JUnit must contain exactly nine test cases");
  for (const id of EXPECTED_TEST_IDS) {
    assert(
      names.filter((name) => name.startsWith(`${id} `)).length === 1,
      `JUnit must contain exactly one ${id} test case`,
    );
  }
  const junitSha256 = createHash("sha256").update(junit).digest("hex");
  return Object.freeze({
    testCount: 9,
    junitSha256,
    imageChecks: Object.freeze(
      Object.fromEntries(
        STAGING_IMAGE_VERIFICATION_CHECKS.map((check) => [check, "passed"]),
      ),
    ),
  });
}

function logEntryOrder(left, right) {
  return `${left.timestamp ?? ""}`.localeCompare(`${right.timestamp ?? ""}`);
}

export function extractStagingVerificationJUnitFromLogs(
  entries,
  executionName,
) {
  assert(
    Array.isArray(entries) && entries.length > 0,
    "No verifier logs found",
  );
  assert(
    EXECUTION_ID_PATTERN.test(executionName),
    "Verifier execution name is invalid",
  );
  const payloads = entries
    .map((entry) => {
      assert(
        entry?.resource?.type === "cloud_run_job" &&
          entry.resource.labels?.job_name === VERIFICATION_JOB &&
          entry.labels?.execution_name === executionName &&
          entry.logName?.endsWith("/logs/run.googleapis.com%2Fstdout") &&
          typeof entry.textPayload === "string",
        "Verifier log entry escaped the restricted execution boundary",
      );
      return entry;
    })
    .sort(logEntryOrder)
    .map((entry) => entry.textPayload);
  const joined = payloads.join("\n");
  const start = joined.indexOf("<testsuites");
  const end = joined.lastIndexOf("</testsuites>");
  assert(start >= 0 && end >= start, "Verifier logs do not contain JUnit");
  const prefix = joined.slice(0, start).trim();
  const suffix = joined.slice(end + "</testsuites>".length).trim();
  assert(
    (prefix === "" ||
      /^<\?xml\s+version="1\.0"\s+encoding="utf-8"\?>$/i.test(prefix)) &&
      suffix === "",
    "Verifier stdout contains non-JUnit data",
  );
  const documentStart = prefix === "" ? start : joined.indexOf("<?xml");
  const junit = `${joined.slice(documentStart, end + "</testsuites>".length)}\n`;
  validateStagingVerificationJUnit(junit);
  return junit;
}

export function validateStagingImageVerificationManifest(manifest) {
  assert(
    manifest.schemaVersion === 1 &&
      manifest.status === STATUS &&
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
      manifest.imageDigest.startsWith(IMAGE_PREFIX) &&
      HASH_PATTERN.test(manifest.imageDigest.slice(IMAGE_PREFIX.length)),
    "Image-verification release identity drifted",
  );
  validateRevisionAttestation(manifest.revisionAttestation);
  validateExecution(manifest.execution);
  validatePassedChecks(manifest.imageChecks);
  assert(
    JSON.stringify(manifest.excludedPromotionChecks) ===
      JSON.stringify(
        Object.fromEntries(
          STAGING_IMAGE_VERIFICATION_EXCLUSIONS.map((check) => [
            check,
            "not-executed",
          ]),
        ),
      ),
    "Excluded promotion checks must remain explicitly unexecuted",
  );
  assert(
    HASH_PATTERN.test(manifest.evidence.zeroTrafficDeploymentManifestSha256) &&
      manifest.evidence.junitSha256 === manifest.execution.junitSha256,
    "Image-verification evidence hashes drifted",
  );
  assert(
    manifest.promotionEligible === false &&
      manifest.allChecksUsedDeployedRevision === false &&
      manifest.deployedRevisionNetworkPathObserved === false &&
      manifest.serviceAuthenticationObserved === false &&
      manifest.trafficChanged === false &&
      manifest.publicAccessChanged === false &&
      manifest.runtimeConfigurationChanged === false &&
      manifest.customerDataUsed === false &&
      manifest.secretValuesRecorded === false &&
      manifest.vendorActivationAuthorized === false &&
      manifest.productionAuthorized === false,
    "Image-verification evidence exceeded partial synthetic authority",
  );
  normalizeTimestamp(manifest.generatedAt, "Image-verification timestamp");
  assertSafeEvidence(manifest);
  return manifest;
}

export function buildStagingImageVerificationManifest(input) {
  const deployment = validateStagingZeroTrafficDeploymentManifest(
    input.zeroTrafficDeployment,
  );
  assert(
    deployment.deployment.service === SERVICE,
    "Image verification supports only the staging API",
  );
  assert(
    input.imageDigest === deployment.publication.imageDigest &&
      DIGEST_PATTERN.test(input.imageDigest),
    "Executed image must match the zero-traffic deployment digest",
  );
  assert(
    input.revision === deployment.deployment.revision,
    "Attested revision must match the zero-traffic deployment",
  );
  const junitSha256 = normalizeHash(input.junitSha256, "JUnit hash");
  const manifest = {
    schemaVersion: 1,
    status: STATUS,
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
    revisionAttestation: structuredClone(input.revisionAttestation),
    execution: {
      mode: EXECUTION_MODE,
      syntheticRunId: input.syntheticRunId,
      jobExecutionId: input.jobExecutionId,
      testCount: 9,
      junitSha256,
      runtimeServiceAccount: input.runtimeServiceAccount,
      databaseSecretVersion: input.databaseSecretVersion,
    },
    imageChecks: structuredClone(input.imageChecks),
    excludedPromotionChecks: Object.fromEntries(
      STAGING_IMAGE_VERIFICATION_EXCLUSIONS.map((check) => [
        check,
        "not-executed",
      ]),
    ),
    evidence: {
      zeroTrafficDeploymentManifestSha256: normalizeHash(
        input.zeroTrafficDeploymentManifestSha256,
        "Zero-traffic deployment manifest hash",
      ),
      junitSha256,
    },
    promotionEligible: false,
    allChecksUsedDeployedRevision: false,
    deployedRevisionNetworkPathObserved: false,
    serviceAuthenticationObserved: false,
    trafficChanged: false,
    publicAccessChanged: false,
    runtimeConfigurationChanged: false,
    customerDataUsed: false,
    secretValuesRecorded: false,
    vendorActivationAuthorized: false,
    productionAuthorized: false,
    generatedAt: input.generatedAt,
  };
  validateStagingImageVerificationManifest(manifest);
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

export async function writeStagingImageVerificationManifest(
  manifest,
  manifestPath,
  hashPath,
) {
  validateStagingImageVerificationManifest(manifest);
  return writeHashedManifest(manifest, manifestPath, hashPath);
}

export async function verifyStagingImageVerificationManifest(
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
    "Image-verification manifest hash does not match",
  );
  const manifest = JSON.parse(serialized);
  validateStagingImageVerificationManifest(manifest);
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
  if (command === "build") {
    const zeroTrafficManifestPath = required(options, "zero_traffic_manifest");
    const zeroTrafficHashPath = required(options, "zero_traffic_hash");
    const zeroTrafficDeployment = await verifyZeroTrafficDeploymentManifest(
      zeroTrafficManifestPath,
      zeroTrafficHashPath,
    );
    const observation = JSON.parse(
      await readFile(required(options, "observation"), "utf8"),
    );
    const manifest = buildStagingImageVerificationManifest({
      zeroTrafficDeployment,
      zeroTrafficDeploymentManifestSha256: normalizeHash(
        (await readFile(zeroTrafficHashPath, "utf8")).trim().split(/\s+/)[0],
        "Zero-traffic deployment manifest hash",
      ),
      ...observation,
    });
    const hash = await writeStagingImageVerificationManifest(
      manifest,
      required(options, "output"),
      required(options, "hash_output"),
    );
    process.stdout.write(
      `${JSON.stringify({ status: manifest.status, hash })}\n`,
    );
    return;
  }
  if (command === "verify") {
    const manifest = await verifyStagingImageVerificationManifest(
      required(options, "manifest"),
      required(options, "hash"),
    );
    process.stdout.write(
      `${JSON.stringify({
        status: manifest.status,
        candidateSha: manifest.candidateSha,
        service: manifest.service,
        revision: manifest.revision,
        promotionEligible: manifest.promotionEligible,
      })}\n`,
    );
    return;
  }
  if (command === "extract-junit") {
    const output = required(options, "output");
    const junit = extractStagingVerificationJUnitFromLogs(
      JSON.parse(await readFile(required(options, "logs"), "utf8")),
      required(options, "execution"),
    );
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, junit, "utf8");
    process.stdout.write(
      `${JSON.stringify(validateStagingVerificationJUnit(junit))}\n`,
    );
    return;
  }
  throw new Error(
    "Usage: record-staging-image-verification.mjs <build|verify|extract-junit> ...",
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
