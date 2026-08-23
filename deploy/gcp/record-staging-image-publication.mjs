import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname } from "node:path";

export const STAGING_IMAGE_NAMES = Object.freeze([
  "samra-api",
  "samra-customer-web",
  "samra-operations-web",
  "samra-design-system-preview",
  "samra-migrations",
]);

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const BUILD_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PROJECT_ID = "samra-pay-staging";
const PROJECT_NUMBER = "934122615631";
const REGION = "us-east4";
const REPOSITORY = "samra-staging";
const SOURCE_REPOSITORY = "haileleuld87/Samra-Pay";
const IMAGE_BASE = `${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}`;
const BUILD_SERVICE_ACCOUNT =
  "samra-cloud-build-staging@samra-pay-staging.iam.gserviceaccount.com";
const ALLOWED_PUBLISHERS = new Set([
  "me@davidhaile.com",
  "samra-github-staging@samra-pay-staging.iam.gserviceaccount.com",
]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function normalizeSha(value, label) {
  const normalized = value?.trim().toLowerCase();
  assert(SHA_PATTERN.test(normalized ?? ""), `${label} must be a full Git SHA`);
  return normalized;
}

function normalizeOptional(value) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function parseImageArguments(values) {
  const images = {};
  for (const value of values) {
    const separator = value.indexOf("=");
    assert(separator > 0, "Image evidence must use name=digest format");
    const name = value.slice(0, separator);
    const digest = value.slice(separator + 1);
    assert(
      STAGING_IMAGE_NAMES.includes(name),
      `Unknown staging image: ${name}`,
    );
    assert(images[name] === undefined, `Duplicate staging image: ${name}`);
    images[name] = digest;
  }
  assert(
    JSON.stringify(Object.keys(images)) === JSON.stringify(STAGING_IMAGE_NAMES),
    "All five staging images must be recorded in contract order",
  );
  return Object.freeze(images);
}

export function buildStagingImagePublicationManifest(input) {
  const candidateSha = normalizeSha(input.candidateSha, "Candidate SHA");
  const gitTreeSha = normalizeSha(input.gitTreeSha, "Git tree SHA");
  assert(input.projectId === PROJECT_ID, "Project ID drifted");
  assert(input.projectNumber === PROJECT_NUMBER, "Project number drifted");
  assert(input.region === REGION, "Region drifted");
  assert(input.repository === REPOSITORY, "Artifact repository drifted");
  assert(
    input.sourceRepository === SOURCE_REPOSITORY,
    "Source repository drifted",
  );
  assert(
    BUILD_ID_PATTERN.test(input.cloudBuildId),
    "Cloud Build ID must be a lowercase UUID",
  );
  assert(
    input.buildServiceAccount === BUILD_SERVICE_ACCOUNT,
    "Build service account drifted",
  );
  assert(
    ALLOWED_PUBLISHERS.has(input.publisherIdentity),
    "Publisher identity is not reviewed",
  );

  const imageDigests = {};
  for (const name of STAGING_IMAGE_NAMES) {
    const digest = input.imageDigests[name];
    const expectedPrefix = `${IMAGE_BASE}/${name}@sha256:`;
    assert(
      typeof digest === "string" &&
        digest.startsWith(expectedPrefix) &&
        DIGEST_PATTERN.test(digest.slice(expectedPrefix.length)),
      `${name} must resolve to its exact immutable staging digest`,
    );
    imageDigests[name] = digest;
  }
  assert(
    JSON.stringify(Object.keys(input.imageDigests)) ===
      JSON.stringify(STAGING_IMAGE_NAMES),
    "Image digest set or order drifted",
  );

  const githubRunId = normalizeOptional(input.githubRunId);
  const githubRunAttempt = githubRunId
    ? Number.parseInt(input.githubRunAttempt, 10)
    : null;
  const githubActor = normalizeOptional(input.githubActor);
  if (githubRunId) {
    assert(/^\d+$/.test(githubRunId), "GitHub run ID must be numeric");
    assert(
      Number.isSafeInteger(githubRunAttempt) && githubRunAttempt >= 1,
      "GitHub run attempt must be a positive integer",
    );
    assert(githubActor, "GitHub actor is required for workflow publication");
  }

  const generatedAt = new Date(input.generatedAt).toISOString();
  const manifest = {
    schemaVersion: 1,
    status: "published",
    environment: "staging",
    dataClassification: "synthetic-only",
    releaseId: `staging-${candidateSha.slice(0, 12)}`,
    candidateSha,
    gitTreeSha,
    sourceRepository: SOURCE_REPOSITORY,
    sourceRef: "refs/heads/main",
    projectId: PROJECT_ID,
    projectNumber: PROJECT_NUMBER,
    region: REGION,
    artifactRepository: REPOSITORY,
    cloudBuildId: input.cloudBuildId,
    cloudBuildUrl: `https://console.cloud.google.com/cloud-build/builds;region=${REGION}/${input.cloudBuildId}?project=${PROJECT_NUMBER}`,
    publisherIdentity: input.publisherIdentity,
    buildServiceAccount: BUILD_SERVICE_ACCOUNT,
    github: githubRunId
      ? {
          repository: SOURCE_REPOSITORY,
          ref: "refs/heads/main",
          eventName: "workflow_dispatch",
          workflow: "Staging image publication",
          workflowPath: ".github/workflows/staging-image-publication.yml",
          protectedEnvironment: "staging-image-publication",
          runId: githubRunId,
          runAttempt: githubRunAttempt,
          runUrl: `https://github.com/${SOURCE_REPOSITORY}/actions/runs/${githubRunId}`,
          actor: githubActor,
        }
      : null,
    imageDigests,
    deploymentAuthorized: false,
    trafficAuthorized: false,
    vendorActivationAuthorized: false,
    generatedAt,
  };
  validateStagingImagePublicationManifest(manifest);
  return Object.freeze(manifest);
}

export function validateStagingImagePublicationManifest(manifest) {
  assert(
    manifest.schemaVersion === 1 &&
      manifest.status === "published" &&
      manifest.environment === "staging" &&
      manifest.dataClassification === "synthetic-only",
    "Publication manifest identity drifted",
  );
  assert(
    manifest.releaseId === `staging-${manifest.candidateSha.slice(0, 12)}`,
    "Release ID does not match candidate SHA",
  );
  normalizeSha(manifest.candidateSha, "Candidate SHA");
  normalizeSha(manifest.gitTreeSha, "Git tree SHA");
  assert(
    manifest.projectId === PROJECT_ID &&
      manifest.projectNumber === PROJECT_NUMBER &&
      manifest.region === REGION &&
      manifest.artifactRepository === REPOSITORY &&
      manifest.sourceRepository === SOURCE_REPOSITORY &&
      manifest.sourceRef === "refs/heads/main",
    "Publication target drifted",
  );
  assert(
    BUILD_ID_PATTERN.test(manifest.cloudBuildId) &&
      manifest.cloudBuildUrl ===
        `https://console.cloud.google.com/cloud-build/builds;region=${REGION}/${manifest.cloudBuildId}?project=${PROJECT_NUMBER}`,
    "Cloud Build evidence drifted",
  );
  assert(
    ALLOWED_PUBLISHERS.has(manifest.publisherIdentity) &&
      manifest.buildServiceAccount === BUILD_SERVICE_ACCOUNT,
    "Publication identity drifted",
  );
  parseImageArguments(
    STAGING_IMAGE_NAMES.map(
      (name) => `${name}=${manifest.imageDigests[name] ?? ""}`,
    ),
  );
  for (const name of STAGING_IMAGE_NAMES) {
    const prefix = `${IMAGE_BASE}/${name}@sha256:`;
    assert(
      manifest.imageDigests[name].startsWith(prefix) &&
        DIGEST_PATTERN.test(manifest.imageDigests[name].slice(prefix.length)),
      `${name} digest drifted`,
    );
  }
  if (manifest.github !== null) {
    assert(
      manifest.github.repository === SOURCE_REPOSITORY &&
        manifest.github.ref === "refs/heads/main" &&
        manifest.github.eventName === "workflow_dispatch" &&
        manifest.github.workflow === "Staging image publication" &&
        manifest.github.workflowPath ===
          ".github/workflows/staging-image-publication.yml" &&
        manifest.github.protectedEnvironment === "staging-image-publication" &&
        /^\d+$/.test(manifest.github.runId) &&
        Number.isSafeInteger(manifest.github.runAttempt) &&
        manifest.github.runAttempt >= 1 &&
        manifest.github.runUrl ===
          `https://github.com/${SOURCE_REPOSITORY}/actions/runs/${manifest.github.runId}` &&
        typeof manifest.github.actor === "string" &&
        manifest.github.actor.length > 0,
      "GitHub publication provenance drifted",
    );
  }
  assert(
    manifest.deploymentAuthorized === false &&
      manifest.trafficAuthorized === false &&
      manifest.vendorActivationAuthorized === false,
    "Image publication cannot authorize deployment, traffic, or vendors",
  );
  assert(
    new Date(manifest.generatedAt).toISOString() === manifest.generatedAt,
    "Publication timestamp must be ISO-8601",
  );
  assert(
    !/postgres(?:ql)?:\/\/|worf\.replit|12345678|client_secret|api[_-]?key/i.test(
      JSON.stringify(manifest),
    ),
    "Publication evidence contains a credential or prohibited endpoint",
  );
  return manifest;
}

export async function writePublicationManifest(
  manifest,
  manifestPath,
  hashPath,
) {
  validateStagingImagePublicationManifest(manifest);
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

export async function verifyPublicationManifest(manifestPath, hashPath) {
  const [serialized, hashRecord] = await Promise.all([
    readFile(manifestPath, "utf8"),
    readFile(hashPath, "utf8"),
  ]);
  const expectedHash = hashRecord.trim().split(/\s+/)[0];
  const actualHash = createHash("sha256").update(serialized).digest("hex");
  assert(
    expectedHash === actualHash,
    "Publication manifest hash does not match",
  );
  const manifest = JSON.parse(serialized);
  validateStagingImagePublicationManifest(manifest);
  return manifest;
}

function parseCliArguments(values) {
  const options = { images: [] };
  for (let index = 0; index < values.length; index += 1) {
    const key = values[index];
    const value = values[index + 1];
    assert(
      key?.startsWith("--") && value !== undefined,
      `Invalid option: ${key}`,
    );
    index += 1;
    if (key === "--image") {
      options.images.push(value);
    } else {
      options[key.slice(2).replaceAll("-", "_")] = value;
    }
  }
  return options;
}

async function runCli() {
  const options = parseCliArguments(process.argv.slice(2));
  const imageDigests = parseImageArguments(options.images);
  const manifest = buildStagingImagePublicationManifest({
    candidateSha: options.candidate_sha,
    gitTreeSha: options.git_tree_sha,
    projectId: options.project_id,
    projectNumber: options.project_number,
    region: options.region,
    repository: options.repository,
    sourceRepository: options.source_repository,
    cloudBuildId: options.cloud_build_id,
    publisherIdentity: options.publisher_identity,
    buildServiceAccount: options.build_service_account,
    githubRunId: options.github_run_id,
    githubRunAttempt: options.github_run_attempt,
    githubActor: options.github_actor,
    generatedAt: options.generated_at ?? new Date().toISOString(),
    imageDigests,
  });
  const output = options.output;
  const hashOutput = options.hash_output;
  assert(output && hashOutput, "Output and hash-output paths are required");
  const hash = await writePublicationManifest(manifest, output, hashOutput);
  process.stdout.write(
    `${JSON.stringify({ status: "recorded", releaseId: manifest.releaseId, manifest: output, sha256: hash })}\n`,
  );
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  runCli().catch((error) => {
    process.stderr.write(
      `Unable to record staging image publication: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
