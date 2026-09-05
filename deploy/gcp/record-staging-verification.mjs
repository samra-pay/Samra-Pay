import {
  validateOptionalQaseReporting,
  qaseReportingFromEnvironment,
} from "./qase-reporting.mjs";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import {
  validateStagingImageVerificationManifest,
  verifyStagingImageVerificationManifest,
} from "./record-staging-image-verification.mjs";
import {
  validateStagingRevisionProbeManifest,
  verifyStagingRevisionProbeManifest,
} from "./record-staging-revision-probe.mjs";
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
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const IMAGE_CHECKS = Object.freeze([
  "readiness",
  "restart",
  "ledger",
  "reconciliation",
  "audit",
  "failureVisibility",
]);
const PROBE_CHECKS = Object.freeze([
  "serviceAuthentication",
  "deployedRevisionNetworkPath",
]);

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
    "All required staging verification checks must pass",
  );
  return checks;
}

function validateQase(qase) {
  assert(
    qase?.project === "SAMP" &&
      qase.environment === "google-cloud-staging" &&
      qase.policy === "optional",
    "Combined Qase staging reporting identity drifted",
  );
  validateOptionalQaseReporting(qase.reporting, qase.runId, qase.runUrl);
  const uploaded = qase.reporting.outcomes.qase_upload === "success";
  assert(
    qase.imageJUnitIncluded === uploaded &&
      qase.probeJUnitIncluded === uploaded,
    "Combined Qase staging upload coverage drifted",
  );
  return qase;
}

function assertSafeEvidence(manifest) {
  assert(
    !/postgres(?:ql)?:\/\/|worf\.replit|12345678|client_secret|api[_-]?key|private[_-]?key|authorization:|bearer\s+|versions\/latest/i.test(
      JSON.stringify(manifest),
    ),
    "Verification evidence contains a credential or prohibited endpoint",
  );
}

function validateIdentity(manifest) {
  assert(
    manifest.schemaVersion === 2 &&
      manifest.status === "passed" &&
      manifest.environment === "staging" &&
      manifest.dataClassification === "synthetic-only" &&
      manifest.sourceRepository === SOURCE_REPOSITORY &&
      manifest.projectId === PROJECT_ID &&
      manifest.projectNumber === PROJECT_NUMBER &&
      manifest.region === REGION &&
      SHA_PATTERN.test(manifest.candidateSha) &&
      SHA_PATTERN.test(manifest.controllerSha) &&
      manifest.releaseId === `staging-${manifest.candidateSha.slice(0, 12)}` &&
      STAGING_TRAFFIC_SERVICES.includes(manifest.service) &&
      manifest.revision ===
        `${manifest.service}-${manifest.candidateSha.slice(0, 12)}` &&
      typeof manifest.imageDigest === "string" &&
      /@sha256:[0-9a-f]{64}$/.test(manifest.imageDigest),
    "Verification release identity drifted",
  );
}

export function validateStagingVerificationManifest(manifest) {
  validateIdentity(manifest);
  validateChecks(manifest.checks);
  validateQase(manifest.qase);
  assert(
    JSON.stringify(manifest.evidenceCoverage) ===
      JSON.stringify({
        exactImagePrivateDatabaseJob: IMAGE_CHECKS,
        exactDeployedRevisionPrivateHttpProbe: PROBE_CHECKS,
      }),
    "Verification evidence coverage drifted",
  );
  assert(
    HASH_PATTERN.test(manifest.evidence.zeroTrafficDeploymentManifestSha256) &&
      HASH_PATTERN.test(manifest.evidence.imageVerificationManifestSha256) &&
      HASH_PATTERN.test(manifest.evidence.probeManifestSha256),
    "Verification input evidence hashes are invalid",
  );
  assert(
    manifest.exactCandidateArtifactVerified === true &&
      manifest.exactRevisionObserved === true &&
      manifest.allChecksUsedDeployedRevision === false &&
      manifest.serviceAuthenticationObserved === true &&
      manifest.deployedRevisionNetworkPathObserved === true &&
      manifest.temporaryRoutingRestored === true &&
      manifest.trafficPercentageChanged === false &&
      manifest.publicAccessChanged === false &&
      manifest.runtimeTemplateChanged === false &&
      manifest.customerDataUsed === false &&
      manifest.secretValuesRecorded === false &&
      manifest.trafficPromotionAuthorized === false &&
      manifest.vendorActivationAuthorized === false &&
      manifest.productionAuthorized === false,
    "Verification manifest exceeded combined evidence-only authority",
  );
  assert(
    manifest.probeGitHub?.repository === SOURCE_REPOSITORY &&
      manifest.probeGitHub.ref === "refs/heads/main" &&
      manifest.probeGitHub.eventName === "workflow_dispatch" &&
      manifest.probeGitHub.workflow === "Staging verification probe" &&
      manifest.probeGitHub.workflowPath ===
        ".github/workflows/staging-verification-probe.yml" &&
      manifest.probeGitHub.protectedEnvironment === "staging-verification" &&
      typeof manifest.probeGitHub.runId === "string" &&
      /^\d+$/.test(manifest.probeGitHub.runId) &&
      Number.isSafeInteger(manifest.probeGitHub.runAttempt) &&
      manifest.probeGitHub.runAttempt >= 1 &&
      manifest.probeGitHub.runUrl ===
        `https://github.com/${SOURCE_REPOSITORY}/actions/runs/${manifest.probeGitHub.runId}` &&
      typeof manifest.probeGitHub.actor === "string" &&
      manifest.probeGitHub.actor.length > 0 &&
      manifest.probeGitHub.actor === manifest.probeGitHub.actor.trim(),
    "Verification probe provenance drifted",
  );
  normalizeTimestamp(manifest.generatedAt, "Verification timestamp");
  assertSafeEvidence(manifest);
  return manifest;
}

export function buildStagingVerificationManifest(input) {
  const deployment = validateStagingZeroTrafficDeploymentManifest(
    input.zeroTrafficDeployment,
  );
  const image = validateStagingImageVerificationManifest(
    input.imageVerification,
  );
  const probe = validateStagingRevisionProbeManifest(input.probe);
  assert(
    image?.status === "passed-not-promotion-eligible" &&
      image.promotionEligible === false &&
      IMAGE_CHECKS.every((check) => image.imageChecks?.[check] === "passed"),
    "Exact-image verification evidence is incomplete",
  );
  assert(
    deployment.candidateSha === image.candidateSha &&
      deployment.candidateSha === probe.candidateSha &&
      deployment.releaseId === image.releaseId &&
      deployment.releaseId === probe.releaseId &&
      deployment.deployment.service === image.service &&
      deployment.deployment.service === probe.service &&
      deployment.deployment.revision === image.revision &&
      deployment.deployment.revision === probe.revision &&
      deployment.publication.imageDigest === image.imageDigest &&
      deployment.publication.imageDigest === probe.imageDigest,
    "Verification inputs do not describe one exact candidate artifact and revision",
  );
  const manifest = {
    schemaVersion: 2,
    status: "passed",
    environment: "staging",
    dataClassification: "synthetic-only",
    releaseId: deployment.releaseId,
    candidateSha: deployment.candidateSha,
    controllerSha: input.controllerSha?.trim().toLowerCase(),
    sourceRepository: SOURCE_REPOSITORY,
    projectId: PROJECT_ID,
    projectNumber: PROJECT_NUMBER,
    region: REGION,
    service: probe.service,
    revision: probe.revision,
    imageDigest: probe.imageDigest,
    checks: Object.fromEntries(
      STAGING_VERIFICATION_CHECKS.map((check) => [check, "passed"]),
    ),
    evidenceCoverage: {
      exactImagePrivateDatabaseJob: IMAGE_CHECKS,
      exactDeployedRevisionPrivateHttpProbe: PROBE_CHECKS,
    },
    qase: structuredClone(input.qase),
    evidence: {
      zeroTrafficDeploymentManifestSha256: normalizeHash(
        input.zeroTrafficDeploymentManifestSha256,
        "Zero-traffic deployment manifest hash",
      ),
      imageVerificationManifestSha256: normalizeHash(
        input.imageVerificationManifestSha256,
        "Image-verification manifest hash",
      ),
      probeManifestSha256: normalizeHash(
        input.probeManifestSha256,
        "Revision-probe manifest hash",
      ),
    },
    probeGitHub: structuredClone(probe.github),
    exactCandidateArtifactVerified: true,
    exactRevisionObserved: true,
    allChecksUsedDeployedRevision: false,
    serviceAuthenticationObserved: true,
    deployedRevisionNetworkPathObserved: true,
    temporaryRoutingRestored: true,
    trafficPercentageChanged: false,
    publicAccessChanged: false,
    runtimeTemplateChanged: false,
    customerDataUsed: false,
    secretValuesRecorded: false,
    trafficPromotionAuthorized: false,
    vendorActivationAuthorized: false,
    productionAuthorized: false,
    generatedAt: input.generatedAt,
  };
  validateStagingVerificationManifest(manifest);
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
  const [serialized, hashRecord] = await Promise.all([
    readFile(manifestPath, "utf8"),
    readFile(hashPath, "utf8"),
  ]);
  const expectedHash = hashRecord.trim().split(/\s+/)[0];
  const actualHash = createHash("sha256").update(serialized).digest("hex");
  assert(
    expectedHash === actualHash,
    "Verification manifest hash does not match",
  );
  const manifest = JSON.parse(serialized);
  validateStagingVerificationManifest(manifest);
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

async function readHash(path, label) {
  return normalizeHash(
    (await readFile(path, "utf8")).trim().split(/\s+/)[0],
    label,
  );
}

async function main(values) {
  const [command, ...rawOptions] =
    values[0] === "--" ? values.slice(1) : values;
  const options = parseArguments(rawOptions);
  if (command === "build") {
    const zeroTrafficManifestPath = required(options, "zero_traffic_manifest");
    const zeroTrafficHashPath = required(options, "zero_traffic_hash");
    const imageManifestPath = required(options, "image_manifest");
    const imageHashPath = required(options, "image_hash");
    const probeManifestPath = required(options, "probe_manifest");
    const probeHashPath = required(options, "probe_hash");
    const qase = qaseReportingFromEnvironment();
    const manifest = buildStagingVerificationManifest({
      zeroTrafficDeployment: await verifyZeroTrafficDeploymentManifest(
        zeroTrafficManifestPath,
        zeroTrafficHashPath,
      ),
      zeroTrafficDeploymentManifestSha256: await readHash(
        zeroTrafficHashPath,
        "Zero-traffic deployment manifest hash",
      ),
      imageVerification: await verifyStagingImageVerificationManifest(
        imageManifestPath,
        imageHashPath,
      ),
      imageVerificationManifestSha256: await readHash(
        imageHashPath,
        "Image-verification manifest hash",
      ),
      probe: await verifyStagingRevisionProbeManifest(
        probeManifestPath,
        probeHashPath,
      ),
      probeManifestSha256: await readHash(
        probeHashPath,
        "Revision-probe manifest hash",
      ),
      controllerSha: required(options, "controller_sha"),
      qase: {
        project: "SAMP",
        environment: "google-cloud-staging",
        policy: "optional",
        ...qase,
        imageJUnitIncluded: qase.reporting.outcomes.qase_upload === "success",
        probeJUnitIncluded: qase.reporting.outcomes.qase_upload === "success",
      },
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
