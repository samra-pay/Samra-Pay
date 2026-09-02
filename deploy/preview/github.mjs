import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  digest,
  MAX_BUNDLE_BYTES,
  positive,
  REPOSITORY,
  REPOSITORY_ID,
  sha,
} from "./bundle.mjs";

export const BUILD_WORKFLOW = ".github/workflows/public-site-preview-build.yml";
export const COMMENT_MARKER = "<!-- samra-public-site-preview -->";

export function githubClient(token, fetcher = fetch) {
  assert(token, "Missing GitHub token");
  return async (resource, { method = "GET", body } = {}) => {
    assert(resource.startsWith("/") && !resource.startsWith("//"));
    const response = await fetcher(
      `https://api.github.com/repos/${REPOSITORY}${resource}`,
      {
        method,
        redirect: "error",
        signal: AbortSignal.timeout(30_000),
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
    );
    assert(response.ok, `GitHub request failed (${response.status})`);
    return response.json();
  };
}

export function validateSource(run, pr, workflow, runId, attempt) {
  assert(
    positive(runId) && positive(attempt),
    "Invalid upstream run identifier",
  );
  assert.equal(run.id, Number(runId));
  assert.equal(run.run_attempt, Number(attempt), "Run attempt changed");
  assert.equal(run.status, "completed");
  assert.equal(run.conclusion, "success");
  assert.equal(run.event, "pull_request");
  assert.equal(run.repository?.id, REPOSITORY_ID);
  assert.equal(run.repository?.full_name, REPOSITORY);
  assert.equal(run.head_repository?.id, REPOSITORY_ID, "Forks are build-only");
  assert.equal(workflow.path, BUILD_WORKFLOW);
  assert.equal(workflow.id, run.workflow_id);
  assert.equal(run.path, BUILD_WORKFLOW);
  assert.equal(run.pull_requests?.length, 1, "Ambiguous PR association");
  assert.equal(run.pull_requests[0].number, pr.number);
  assert.equal(pr.state, "open", "PR closed; do not publish");
  assert.equal(pr.base?.ref, "main");
  assert.equal(pr.base?.repo?.id, REPOSITORY_ID);
  assert.equal(pr.head?.repo?.id, REPOSITORY_ID);
  assert(
    ["OWNER", "MEMBER", "COLLABORATOR"].includes(pr.author_association),
    "Untrusted PR author",
  );
  assert.equal(pr.user?.type, "User", "Bot PRs are build-only");
  assert(sha(run.head_sha), "Invalid source SHA");
  assert.equal(
    pr.head.sha,
    run.head_sha,
    "PR advanced; stale preview rejected",
  );
  return {
    sha: run.head_sha,
    pr: pr.number,
    runId: run.id,
    runAttempt: run.run_attempt,
  };
}

export async function currentSource(api, runId, attempt, trustedSha) {
  assert(
    positive(runId) && positive(attempt) && sha(trustedSha),
    "Invalid run or trusted SHA",
  );
  const run = await api(`/actions/runs/${runId}`);
  assert.equal(run.pull_requests?.length, 1, "No unambiguous PR for build");
  const number = run.pull_requests[0].number;
  assert(positive(number), "Invalid PR number");
  const [pr, workflow] = await Promise.all([
    api(`/pulls/${number}`),
    api(`/actions/workflows/${run.workflow_id}`),
  ]);
  const identity = validateSource(run, pr, workflow, runId, attempt);
  // A PR cannot replace the producer workflow and then request a privileged publish.
  const [trusted, candidate] = await Promise.all([
    api(`/contents/${BUILD_WORKFLOW}?ref=${trustedSha}`),
    api(`/contents/${BUILD_WORKFLOW}?ref=${identity.sha}`),
  ]);
  assert(
    trusted.type === "file" && trusted.sha === candidate.sha,
    "Build workflow changed; merge controls before previewing site edits",
  );
  return { ...identity, trustedSha };
}

export function selectArtifact(artifacts, identity) {
  const name = `public-site-preview-${identity.runId}-${identity.runAttempt}`;
  const matches = artifacts.filter((item) => item.name === name);
  assert.equal(matches.length, 1, "Missing or ambiguous preview artifact");
  const artifact = matches[0];
  assert(
    positive(artifact.id) && !artifact.expired,
    "Invalid or expired artifact",
  );
  assert(
    artifact.size_in_bytes > 0 && artifact.size_in_bytes <= MAX_BUNDLE_BYTES,
    "Artifact too large",
  );
  assert.equal(artifact.workflow_run?.id, identity.runId);
  assert.equal(artifact.workflow_run?.head_sha, identity.sha);
  assert.equal(artifact.workflow_run?.repository_id, REPOSITORY_ID);
  assert.equal(artifact.workflow_run?.head_repository_id, REPOSITORY_ID);
  assert(
    /^sha256:[a-f0-9]{64}$/.test(artifact.digest),
    "Missing immutable archive digest",
  );
  return artifact;
}

async function boundedBytes(response, maximum) {
  assert(
    response.ok && response.body,
    `Artifact download failed (${response.status})`,
  );
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    assert(size <= maximum, "Artifact download exceeds limit");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function downloadArtifact(artifact, root, token, fetcher = fetch) {
  const redirect = await fetcher(
    `https://api.github.com/repos/${REPOSITORY}/actions/artifacts/${artifact.id}/zip`,
    {
      redirect: "manual",
      signal: AbortSignal.timeout(30_000),
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
    },
  );
  assert.equal(
    redirect.status,
    302,
    "Artifact endpoint did not return a download redirect",
  );
  const url = new URL(redirect.headers.get("location"));
  assert(
    url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      (url.hostname.endsWith(".blob.core.windows.net") ||
        url.hostname.endsWith(".githubusercontent.com")),
    "Unexpected artifact storage host",
  );
  // Never forward the GitHub credential to signed object storage.
  const archive = await boundedBytes(
    await fetcher(url, {
      redirect: "error",
      signal: AbortSignal.timeout(60_000),
    }),
    MAX_BUNDLE_BYTES,
  );
  assert.equal(
    `sha256:${digest(archive)}`,
    artifact.digest,
    "Archive digest mismatch",
  );
  const archivePath = path.join(root, "artifact.zip");
  await writeFile(archivePath, archive, { flag: "wx" });
  const names = execFileSync("unzip", ["-Z1", archivePath], {
    encoding: "utf8",
    maxBuffer: 16_384,
    timeout: 10_000,
  });
  assert.equal(
    names.trim(),
    "bundle.json",
    "Archive must contain only bundle.json",
  );
  // Stream one named entry into memory. Never extract archive paths to disk.
  const bundle = execFileSync("unzip", ["-p", archivePath, "bundle.json"], {
    maxBuffer: MAX_BUNDLE_BYTES,
    timeout: 10_000,
  });
  await mkdir(path.join(root, "download"));
  await writeFile(path.join(root, "download/bundle.json"), bundle, {
    flag: "wx",
  });
}

export async function postComment(api, identity, body) {
  const comments = [];
  for (let page = 1; page <= 10; page++) {
    const batch = await api(
      `/issues/${identity.pr}/comments?per_page=100&page=${page}`,
    );
    comments.push(...batch);
    if (batch.length < 100) break;
    assert(page < 10, "Too many PR comments; refusing ambiguous update");
  }
  const existing = comments.filter(
    (comment) =>
      comment.user?.login === "github-actions[bot]" &&
      comment.user?.type === "Bot" &&
      comment.body?.startsWith(COMMENT_MARKER),
  );
  assert(existing.length <= 1, "Multiple preview comments");
  const text = `${COMMENT_MARKER}\n${body}`;
  return existing.length
    ? api(`/issues/comments/${existing[0].id}`, {
        method: "PATCH",
        body: { body: text },
      })
    : api(`/issues/${identity.pr}/comments`, {
        method: "POST",
        body: { body: text },
      });
}

async function verify(env = process.env) {
  assert(
    env.GITHUB_EVENT_NAME === "workflow_run" &&
      env.GITHUB_REF === "refs/heads/main",
    "Trusted workflow_run on main required",
  );
  assert.equal(env.GITHUB_REPOSITORY, REPOSITORY);
  assert(
    positive(env.PREVIEW_PROJECT_NUMBER) &&
      !["382465561715", "934122615631"].includes(env.PREVIEW_PROJECT_NUMBER),
    "An isolated preview project is required",
  );
  assert(env.PREVIEW_ROOT, "Missing preview root");
  const api = githubClient(env.GITHUB_TOKEN);
  const identity = await currentSource(
    api,
    env.PREVIEW_RUN_ID,
    env.PREVIEW_RUN_ATTEMPT,
    env.GITHUB_SHA,
  );
  const response = await api(
    `/actions/runs/${identity.runId}/artifacts?per_page=100`,
  );
  assert(response.total_count <= 100, "Unexpected artifact count");
  const artifact = selectArtifact(response.artifacts, identity);
  await mkdir(env.PREVIEW_ROOT); // must not exist from any previous run
  await downloadArtifact(artifact, env.PREVIEW_ROOT, env.GITHUB_TOKEN);
  await writeFile(
    path.join(env.PREVIEW_ROOT, "identity.json"),
    JSON.stringify(
      { ...identity, artifactId: artifact.id, archiveDigest: artifact.digest },
      null,
      2,
    ),
  );
  console.log(
    `Verified PR ${identity.pr}, SHA ${identity.sha}, run ${identity.runId}/${identity.runAttempt}`,
  );
  if (env.GITHUB_STEP_SUMMARY)
    await appendFile(
      env.GITHUB_STEP_SUMMARY,
      `Verified static preview source: PR #${identity.pr}, commit \`${identity.sha}\`.\n`,
    );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  assert.equal(process.argv[2], "verify");
  verify().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
