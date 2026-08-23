import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { verifyPublicationManifest } from "./record-staging-image-publication.mjs";

export const ZERO_TRAFFIC_SERVICE_NAMES = Object.freeze([
  "samra-api",
  "samra-customer-web",
  "samra-design-system-preview",
]);

const PROJECT_ID = "samra-pay-staging";
const PROJECT_NUMBER = "934122615631";
const REGION = "us-east4";
const SOURCE_REPOSITORY = "haileleuld87/Samra-Pay";
const DEPLOYER_IDENTITY =
  "samra-github-deployer-staging@samra-pay-staging.iam.gserviceaccount.com";
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

function normalizeTraffic(entries, label) {
  assert(Array.isArray(entries), `${label} must be an array`);
  const normalized = entries.map((entry) => {
    assert(
      entry &&
        typeof entry.revision === "string" &&
        REVISION_PATTERN.test(entry.revision) &&
        Number.isInteger(entry.percent) &&
        entry.percent >= 0 &&
        entry.percent <= 100 &&
        (entry.tag === null ||
          (typeof entry.tag === "string" && entry.tag.length > 0)),
      `${label} contains an invalid allocation`,
    );
    return {
      revision: entry.revision,
      percent: entry.percent,
      tag: entry.tag,
    };
  });
  assert(
    new Set(normalized.map((entry) => `${entry.revision}:${entry.tag ?? ""}`))
      .size === normalized.length,
    `${label} contains duplicate allocations`,
  );
  return normalized.sort((left, right) =>
    `${left.revision}:${left.tag ?? ""}`.localeCompare(
      `${right.revision}:${right.tag ?? ""}`,
    ),
  );
}

export function buildStagingZeroTrafficDeploymentManifest(input) {
  const publication = input.publication;
  assert(publication?.status === "published", "Publication is not validated");
  assert(
    ZERO_TRAFFIC_SERVICE_NAMES.includes(input.targetService),
    "Target service is not deployable",
  );
  assert(
    SHA_PATTERN.test(publication.candidateSha),
    "Publication candidate SHA drifted",
  );
  const expectedRevision = `${input.targetService}-${publication.candidateSha.slice(0, 12)}`;
  assert(
    input.revisionName === expectedRevision &&
      REVISION_PATTERN.test(input.revisionName),
    "Revision name must bind the service to the candidate SHA",
  );
  const expectedImage = publication.imageDigests[input.targetService];
  assert(
    input.imageDigest === expectedImage &&
      /@sha256:[0-9a-f]{64}$/.test(expectedImage),
    "Deployment image must match the publication digest",
  );

  const trafficBefore = normalizeTraffic(input.trafficBefore, "Traffic before");
  const trafficAfter = normalizeTraffic(input.trafficAfter, "Traffic after");
  assert(
    JSON.stringify(trafficAfter) === JSON.stringify(trafficBefore),
    "Zero-traffic deployment changed existing traffic",
  );
  assert(
    !trafficAfter.some(
      (entry) =>
        entry.revision === input.revisionName &&
        (entry.percent !== 0 || entry.tag !== null),
    ),
    "Candidate revision received traffic or a traffic tag",
  );

  const githubRunId = input.githubRunId?.trim();
  assert(/^\d+$/.test(githubRunId ?? ""), "GitHub run ID must be numeric");
  const githubRunAttempt = Number.parseInt(input.githubRunAttempt, 10);
  assert(
    Number.isSafeInteger(githubRunAttempt) && githubRunAttempt >= 1,
    "GitHub run attempt must be a positive integer",
  );
  assert(input.githubActor?.trim(), "GitHub actor is required");

  const generatedAt = new Date(input.generatedAt).toISOString();
  const manifest = {
    schemaVersion: 1,
    status: "deployed-zero-traffic",
    environment: "staging",
    dataClassification: "synthetic-only",
    releaseId: publication.releaseId,
    candidateSha: publication.candidateSha,
    sourceRepository: SOURCE_REPOSITORY,
    sourceRef: "refs/heads/main",
    projectId: PROJECT_ID,
    projectNumber: PROJECT_NUMBER,
    region: REGION,
    publication: {
      cloudBuildId: publication.cloudBuildId,
      manifestSha256: normalizeHash(
        input.publicationManifestSha256,
        "Publication manifest hash",
      ),
      imageDigest: expectedImage,
    },
    deployment: {
      service: input.targetService,
      revision: input.revisionName,
      deployerIdentity: input.deployerIdentity,
      configurationSha256: normalizeHash(
        input.configurationSha256,
        "Configuration hash",
      ),
      ingress: "internal-and-cloud-load-balancing",
      defaultServiceUrlDisabled: true,
      publicUnauthenticated: false,
      revisionTag: null,
      candidateTrafficPercent: 0,
      trafficBefore,
      trafficAfter,
    },
    github: {
      repository: SOURCE_REPOSITORY,
      ref: "refs/heads/main",
      eventName: "workflow_dispatch",
      workflow: "Staging zero-traffic deployment",
      workflowPath: ".github/workflows/staging-zero-traffic-deployment.yml",
      protectedEnvironment: "staging-zero-traffic-deployment",
      runId: githubRunId,
      runAttempt: githubRunAttempt,
      runUrl: `https://github.com/${SOURCE_REPOSITORY}/actions/runs/${githubRunId}`,
      actor: input.githubActor.trim(),
    },
    deploymentAuthorized: true,
    trafficAuthorized: false,
    migrationAuthorized: false,
    vendorActivationAuthorized: false,
    generatedAt,
  };
  validateStagingZeroTrafficDeploymentManifest(manifest);
  return Object.freeze(manifest);
}

export function validateStagingZeroTrafficDeploymentManifest(manifest) {
  assert(
    manifest.schemaVersion === 1 &&
      manifest.status === "deployed-zero-traffic" &&
      manifest.environment === "staging" &&
      manifest.dataClassification === "synthetic-only",
    "Deployment manifest identity drifted",
  );
  assert(
    SHA_PATTERN.test(manifest.candidateSha) &&
      manifest.releaseId === `staging-${manifest.candidateSha.slice(0, 12)}` &&
      manifest.sourceRepository === SOURCE_REPOSITORY &&
      manifest.sourceRef === "refs/heads/main" &&
      manifest.projectId === PROJECT_ID &&
      manifest.projectNumber === PROJECT_NUMBER &&
      manifest.region === REGION,
    "Deployment release target drifted",
  );
  assert(
    ZERO_TRAFFIC_SERVICE_NAMES.includes(manifest.deployment.service) &&
      manifest.deployment.revision ===
        `${manifest.deployment.service}-${manifest.candidateSha.slice(0, 12)}` &&
      manifest.deployment.deployerIdentity === DEPLOYER_IDENTITY &&
      manifest.deployment.ingress === "internal-and-cloud-load-balancing" &&
      manifest.deployment.defaultServiceUrlDisabled === true &&
      manifest.deployment.publicUnauthenticated === false &&
      manifest.deployment.revisionTag === null &&
      manifest.deployment.candidateTrafficPercent === 0,
    "Zero-traffic deployment boundary drifted",
  );
  normalizeHash(
    manifest.publication.manifestSha256,
    "Publication manifest hash",
  );
  normalizeHash(manifest.deployment.configurationSha256, "Configuration hash");
  assert(
    /^[0-9a-f-]{36}$/.test(manifest.publication.cloudBuildId) &&
      new RegExp(
        `/samra-staging/${manifest.deployment.service}@sha256:[0-9a-f]{64}$`,
      ).test(manifest.publication.imageDigest),
    "Publication provenance drifted",
  );
  const before = normalizeTraffic(
    manifest.deployment.trafficBefore,
    "Traffic before",
  );
  const after = normalizeTraffic(
    manifest.deployment.trafficAfter,
    "Traffic after",
  );
  assert(
    JSON.stringify(before) === JSON.stringify(after),
    "Deployment changed traffic",
  );
  assert(
    !after.some(
      (entry) =>
        entry.revision === manifest.deployment.revision &&
        (entry.percent !== 0 || entry.tag !== null),
    ),
    "Candidate revision received traffic or a tag",
  );
  assert(
    manifest.github.repository === SOURCE_REPOSITORY &&
      manifest.github.ref === "refs/heads/main" &&
      manifest.github.eventName === "workflow_dispatch" &&
      manifest.github.workflow === "Staging zero-traffic deployment" &&
      manifest.github.workflowPath ===
        ".github/workflows/staging-zero-traffic-deployment.yml" &&
      manifest.github.protectedEnvironment ===
        "staging-zero-traffic-deployment" &&
      /^\d+$/.test(manifest.github.runId) &&
      Number.isSafeInteger(manifest.github.runAttempt) &&
      manifest.github.runAttempt >= 1 &&
      manifest.github.runUrl ===
        `https://github.com/${SOURCE_REPOSITORY}/actions/runs/${manifest.github.runId}` &&
      typeof manifest.github.actor === "string" &&
      manifest.github.actor.length > 0,
    "GitHub deployment provenance drifted",
  );
  assert(
    manifest.deploymentAuthorized === true &&
      manifest.trafficAuthorized === false &&
      manifest.migrationAuthorized === false &&
      manifest.vendorActivationAuthorized === false,
    "Deployment evidence exceeded zero-traffic authority",
  );
  assert(
    new Date(manifest.generatedAt).toISOString() === manifest.generatedAt,
    "Deployment timestamp must be ISO-8601",
  );
  assert(
    !/postgres(?:ql)?:\/\/|worf\.replit|12345678|client_secret|api[_-]?key|private[_-]?key/i.test(
      JSON.stringify(manifest),
    ),
    "Deployment evidence contains a credential or prohibited endpoint",
  );
  return manifest;
}

export async function writeZeroTrafficDeploymentManifest(
  manifest,
  manifestPath,
  hashPath,
) {
  validateStagingZeroTrafficDeploymentManifest(manifest);
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

export async function verifyZeroTrafficDeploymentManifest(
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
    "Deployment manifest hash does not match",
  );
  const manifest = JSON.parse(serialized);
  validateStagingZeroTrafficDeploymentManifest(manifest);
  return manifest;
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
  const options = parseCliArguments(process.argv.slice(2));
  const publication = await verifyPublicationManifest(
    options.publication_manifest,
    options.publication_hash,
  );
  const [publicationHashRecord, trafficBefore, trafficAfter] =
    await Promise.all([
      readFile(options.publication_hash, "utf8"),
      readFile(options.traffic_before, "utf8").then(JSON.parse),
      readFile(options.traffic_after, "utf8").then(JSON.parse),
    ]);
  const manifest = buildStagingZeroTrafficDeploymentManifest({
    publication,
    publicationManifestSha256: publicationHashRecord.trim().split(/\s+/)[0],
    targetService: options.target_service,
    revisionName: options.revision_name,
    imageDigest: options.image_digest,
    deployerIdentity: options.deployer_identity,
    configurationSha256: options.configuration_sha256,
    trafficBefore,
    trafficAfter,
    githubRunId: options.github_run_id,
    githubRunAttempt: options.github_run_attempt,
    githubActor: options.github_actor,
    generatedAt: options.generated_at ?? new Date().toISOString(),
  });
  const hash = await writeZeroTrafficDeploymentManifest(
    manifest,
    options.output,
    options.hash_output,
  );
  process.stdout.write(
    `${JSON.stringify({ status: "recorded", releaseId: manifest.releaseId, service: manifest.deployment.service, revision: manifest.deployment.revision, sha256: hash })}\n`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runCli().catch((error) => {
    process.stderr.write(
      `Unable to record staging zero-traffic deployment: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
