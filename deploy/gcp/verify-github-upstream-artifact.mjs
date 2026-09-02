import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  validateStagingPromotionManifest,
  verifyPromotionManifest,
} from "./record-staging-traffic-control.mjs";

const SOURCE_REPOSITORY = "haileleuld87/Samra-Pay";
const SOURCE_REPOSITORY_ID = "1335175962";
const SOURCE_REPOSITORY_OWNER_ID = "237485986";
const SOURCE_BRANCH = "main";
const SOURCE_REF = `refs/heads/${SOURCE_BRANCH}`;
const API_ROOT = `https://api.github.com/repos/${SOURCE_REPOSITORY}`;
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const INTEGER_PATTERN = /^[1-9][0-9]*$/;
const GITHUB_REQUEST_TIMEOUT_MS = 15_000;
const OUTPUT_PREFIX_KINDS = Object.freeze({
  publication: "staging-image-publication",
  prerequisite: "staging-zero-traffic-deployment",
  zero_traffic: "staging-zero-traffic-deployment",
  image_verification: "staging-image-verification",
  verification: "staging-verification",
  promotion: "staging-traffic-promotion",
});
const SERVICES = new Set([
  "samra-api",
  "samra-customer-web",
  "samra-design-system-preview",
]);

export const UPSTREAM_ARTIFACT_CONTRACTS = Object.freeze({
  "staging-image-publication": Object.freeze({
    workflowName: "Staging image publication",
    workflowPath: ".github/workflows/staging-image-publication.yml",
    serviceRequired: false,
    artifactName: ({ candidateSha, runId, runAttempt }) =>
      `staging-image-publication-${candidateSha}-run-${runId}-attempt-${runAttempt}`,
  }),
  "staging-zero-traffic-deployment": Object.freeze({
    workflowName: "Staging zero-traffic deployment",
    workflowPath: ".github/workflows/staging-zero-traffic-deployment.yml",
    serviceRequired: true,
    artifactName: ({ candidateSha, runId, runAttempt, service }) =>
      `staging-zero-traffic-${service}-${candidateSha}-run-${runId}-attempt-${runAttempt}`,
  }),
  "staging-image-verification": Object.freeze({
    workflowName: "Staging image verification",
    workflowPath: ".github/workflows/staging-image-verification.yml",
    serviceRequired: false,
    artifactName: ({ candidateSha, runId, runAttempt }) =>
      `staging-image-verification-${candidateSha}-run-${runId}-attempt-${runAttempt}`,
  }),
  "staging-verification": Object.freeze({
    workflowName: "Staging verification probe",
    workflowPath: ".github/workflows/staging-verification-probe.yml",
    serviceRequired: false,
    artifactName: ({ candidateSha, runId, runAttempt }) =>
      `staging-verification-${candidateSha}-run-${runId}-attempt-${runAttempt}`,
  }),
  "staging-traffic-promotion": Object.freeze({
    workflowName: "Staging traffic control",
    workflowPath: ".github/workflows/staging-traffic-control.yml",
    serviceRequired: true,
    artifactName: ({ candidateSha, runId, runAttempt, service }) =>
      `staging-traffic-promotion-${service}-${candidateSha}-run-${runId}-attempt-${runAttempt}`,
  }),
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function normalizeCandidateSha(value) {
  const normalized = value?.trim();
  assert(
    SHA_PATTERN.test(normalized ?? ""),
    "Candidate SHA must be a full lowercase Git SHA",
  );
  return normalized;
}

function normalizePositiveInteger(value, label) {
  const normalized = String(value ?? "").trim();
  assert(
    INTEGER_PATTERN.test(normalized),
    `${label} must be a positive integer`,
  );
  const parsed = Number.parseInt(normalized, 10);
  assert(Number.isSafeInteger(parsed), `${label} must be a safe integer`);
  return Object.freeze({ string: normalized, number: parsed });
}

function normalizeIdentity(input) {
  const contract = UPSTREAM_ARTIFACT_CONTRACTS[input.kind];
  assert(contract, `Unsupported upstream artifact kind: ${input.kind}`);
  const candidateSha = normalizeCandidateSha(input.candidateSha);
  const runId = normalizePositiveInteger(input.runId, "Upstream run ID");
  const runAttempt = normalizePositiveInteger(
    input.runAttempt,
    "Upstream run attempt",
  );
  const service = String(input.service ?? "").trim();
  if (contract.serviceRequired) {
    assert(SERVICES.has(service), "Upstream service is not allowlisted");
  } else {
    assert(
      !service,
      `Upstream artifact kind ${input.kind} does not take a service`,
    );
  }
  const artifactName = String(input.artifactName ?? "").trim();
  const expectedArtifactName = contract.artifactName({
    candidateSha,
    runId: runId.string,
    runAttempt: runAttempt.string,
    service,
  });
  assert(
    artifactName === expectedArtifactName,
    "Upstream artifact name does not match the governed identity",
  );
  return Object.freeze({
    kind: input.kind,
    candidateSha,
    runId: runId.string,
    runAttempt: runAttempt.number,
    runAttemptString: runAttempt.string,
    service: service || null,
    artifactName,
    workflowName: contract.workflowName,
    workflowPath: contract.workflowPath,
    workflowRef: `${SOURCE_REPOSITORY}/${contract.workflowPath}@${SOURCE_REF}`,
  });
}

function matchesRepository(repository) {
  return (
    repository?.full_name === SOURCE_REPOSITORY &&
    String(repository.id) === SOURCE_REPOSITORY_ID &&
    String(repository.owner?.id) === SOURCE_REPOSITORY_OWNER_ID
  );
}

export function validateGitHubUpstreamRunMetadata(metadata, input) {
  const identity = normalizeIdentity(input);
  const controllerSha = normalizeCandidateSha(metadata?.head_sha);
  const expectedRunUrl = `https://github.com/${SOURCE_REPOSITORY}/actions/runs/${identity.runId}`;
  assert(
    String(metadata?.id) === identity.runId &&
      metadata.run_attempt === identity.runAttempt &&
      metadata.name === identity.workflowName &&
      metadata.path === identity.workflowPath &&
      metadata.event === "workflow_dispatch" &&
      metadata.head_branch === SOURCE_BRANCH &&
      (identity.kind === "staging-traffic-promotion" ||
        controllerSha === identity.candidateSha) &&
      metadata.status === "completed" &&
      metadata.conclusion === "success" &&
      metadata.html_url === expectedRunUrl &&
      matchesRepository(metadata.repository) &&
      metadata.head_repository?.full_name === SOURCE_REPOSITORY &&
      String(metadata.head_repository?.id) === SOURCE_REPOSITORY_ID &&
      String(metadata.head_repository?.owner?.id) ===
        SOURCE_REPOSITORY_OWNER_ID,
    "GitHub upstream workflow run identity or result drifted",
  );
  return Object.freeze({
    ...identity,
    controllerSha,
    repository: SOURCE_REPOSITORY,
    repositoryId: SOURCE_REPOSITORY_ID,
    repositoryOwnerId: SOURCE_REPOSITORY_OWNER_ID,
    ref: SOURCE_REF,
    event: "workflow_dispatch",
    status: "completed",
    conclusion: "success",
    runUrl: expectedRunUrl,
  });
}

export function validateGitHubUpstreamArtifactMetadata(listing, run) {
  assert(
    listing?.total_count === 1 &&
      Array.isArray(listing.artifacts) &&
      listing.artifacts.length === 1,
    "GitHub upstream run must contain one exact named artifact",
  );
  const artifact = listing.artifacts[0];
  const artifactId = normalizePositiveInteger(
    artifact?.id,
    "Upstream artifact ID",
  );
  const expectedArtifactUrl = `${API_ROOT}/actions/artifacts/${artifactId.string}`;
  assert(
    artifact.name === run.artifactName &&
      artifact.expired === false &&
      Number.isSafeInteger(artifact.size_in_bytes) &&
      artifact.size_in_bytes > 0 &&
      artifact.url === expectedArtifactUrl &&
      artifact.archive_download_url === `${expectedArtifactUrl}/zip` &&
      DIGEST_PATTERN.test(artifact.digest ?? "") &&
      String(artifact.workflow_run?.id) === run.runId &&
      String(artifact.workflow_run?.repository_id) === SOURCE_REPOSITORY_ID &&
      String(artifact.workflow_run?.head_repository_id) ===
        SOURCE_REPOSITORY_ID &&
      artifact.workflow_run?.head_branch === SOURCE_BRANCH &&
      artifact.workflow_run?.head_sha === run.controllerSha,
    "GitHub upstream artifact identity drifted",
  );
  return Object.freeze({
    id: artifactId.string,
    name: artifact.name,
    digest: artifact.digest,
    bytes: artifact.size_in_bytes,
    expired: false,
    url: expectedArtifactUrl,
    archiveDownloadUrl: `${expectedArtifactUrl}/zip`,
  });
}

async function githubRequest(endpoint, token) {
  assert(token, "GITHUB_TOKEN is required to verify upstream evidence");
  const response = await fetch(endpoint, {
    signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS),
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "samra-upstream-artifact-verifier",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  assert(
    response.ok,
    `Unable to read GitHub upstream evidence: HTTP ${response.status}`,
  );
  return response.json();
}

async function fetchRunMetadata(identity, token) {
  return githubRequest(
    `${API_ROOT}/actions/runs/${identity.runId}/attempts/${identity.runAttemptString}`,
    token,
  );
}

export function githubArtifactOutputs(result, prefix) {
  assert(
    Object.hasOwn(OUTPUT_PREFIX_KINDS, prefix) &&
      OUTPUT_PREFIX_KINDS[prefix] === result.kind,
    "GitHub output prefix does not match an allowlisted artifact kind",
  );
  const artifactId = normalizePositiveInteger(
    result.artifact?.id,
    "Verified artifact ID",
  );
  assert(
    DIGEST_PATTERN.test(result.artifact?.digest ?? ""),
    "Verified artifact digest must be an immutable SHA-256 digest",
  );
  const controllerSha = normalizeCandidateSha(result.controllerSha);
  return `${prefix}_artifact_id=${artifactId.string}\n${prefix}_artifact_digest=${result.artifact.digest}\n${prefix}_controller_sha=${controllerSha}\n`;
}

export function validatePromotionUpstreamBinding(manifest, upstream) {
  validateStagingPromotionManifest(manifest);
  assert(
    upstream.kind === "staging-traffic-promotion" &&
      manifest.candidateSha === upstream.candidateSha &&
      manifest.controllerSha === upstream.controllerSha &&
      manifest.service === upstream.service &&
      manifest.github.repository === upstream.repository &&
      manifest.github.ref === upstream.ref &&
      manifest.github.eventName === upstream.event &&
      manifest.github.workflow === upstream.workflowName &&
      manifest.github.workflowPath === upstream.workflowPath &&
      manifest.github.runId === upstream.runId &&
      manifest.github.runAttempt === upstream.runAttempt &&
      manifest.github.runUrl === upstream.runUrl,
    "Downloaded promotion does not match verified GitHub upstream provenance",
  );
  return manifest;
}

async function fetchArtifactListing(identity, token) {
  const artifactName = encodeURIComponent(identity.artifactName);
  return githubRequest(
    `${API_ROOT}/actions/runs/${identity.runId}/artifacts?name=${artifactName}&per_page=100`,
    token,
  );
}

export async function verifyGitHubUpstreamArtifact(input) {
  const identity = normalizeIdentity(input);
  const token = input.token ?? process.env.GITHUB_TOKEN?.trim();
  const runMetadata =
    input.runMetadata ?? (await fetchRunMetadata(identity, token));
  const run = validateGitHubUpstreamRunMetadata(runMetadata, identity);
  const artifactListing =
    input.artifactListing ?? (await fetchArtifactListing(identity, token));
  const artifact = validateGitHubUpstreamArtifactMetadata(artifactListing, run);
  const result = Object.freeze({
    schemaVersion: 1,
    kind: run.kind,
    repository: run.repository,
    repositoryId: run.repositoryId,
    repositoryOwnerId: run.repositoryOwnerId,
    ref: run.ref,
    candidateSha: run.candidateSha,
    controllerSha: run.controllerSha,
    workflowName: run.workflowName,
    workflowPath: run.workflowPath,
    workflowRef: run.workflowRef,
    event: run.event,
    conclusion: run.conclusion,
    runId: run.runId,
    runAttempt: run.runAttempt,
    runUrl: run.runUrl,
    service: run.service,
    artifact,
  });
  if (input.expectedArtifactId !== undefined) {
    assert(
      artifact.id ===
        normalizePositiveInteger(
          input.expectedArtifactId,
          "Expected artifact ID",
        ).string,
      "Verified upstream artifact ID changed after download selection",
    );
  }
  if (input.expectedControllerSha !== undefined) {
    assert(
      run.controllerSha === normalizeCandidateSha(input.expectedControllerSha),
      "Verified upstream controller SHA changed after download selection",
    );
  }
  if (input.promotionManifestPath || input.promotionHashPath) {
    assert(
      input.promotionManifestPath && input.promotionHashPath,
      "Promotion manifest and hash must be supplied together",
    );
    const promotion = await verifyPromotionManifest(
      input.promotionManifestPath,
      input.promotionHashPath,
    );
    validatePromotionUpstreamBinding(promotion, result);
  }
  return result;
}

function parseCliArguments(values) {
  const options = {};
  for (let index = 0; index < values.length; index += 1) {
    const key = values[index];
    const value = values[index + 1];
    assert(
      key?.startsWith("--") && value !== undefined,
      `Invalid option: ${key}`,
    );
    index += 1;
    options[key.slice(2).replaceAll("-", "_")] = value;
  }
  return options;
}

async function readOptionalJson(path) {
  return path ? JSON.parse(await readFile(resolve(path), "utf8")) : undefined;
}

async function runCli() {
  const options = parseCliArguments(process.argv.slice(2));
  const result = await verifyGitHubUpstreamArtifact({
    kind: options.kind,
    candidateSha: options.candidate_sha,
    runId: options.run_id,
    runAttempt: options.run_attempt,
    artifactName: options.artifact_name,
    service: options.service,
    expectedArtifactId: options.expected_artifact_id,
    expectedControllerSha: options.expected_controller_sha,
    promotionManifestPath: options.promotion_manifest,
    promotionHashPath: options.promotion_hash,
    runMetadata: await readOptionalJson(options.run_metadata),
    artifactListing: await readOptionalJson(options.artifact_metadata),
  });
  if (options.output) {
    await mkdir(dirname(resolve(options.output)), { recursive: true });
    await writeFile(
      resolve(options.output),
      `${JSON.stringify(result, null, 2)}\n`,
      {
        encoding: "utf8",
        mode: 0o600,
      },
    );
  }
  if (options.output_prefix) {
    const output = githubArtifactOutputs(result, options.output_prefix);
    assert(
      process.env.GITHUB_OUTPUT,
      "GITHUB_OUTPUT is required for artifact outputs",
    );
    await appendFile(process.env.GITHUB_OUTPUT, output, "utf8");
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runCli().catch((error) => {
    process.stderr.write(
      `GitHub upstream evidence rejected: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
