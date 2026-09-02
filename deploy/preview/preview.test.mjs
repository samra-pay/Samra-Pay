import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  allowedPath,
  digest,
  REPOSITORY,
  REPOSITORY_ID,
  validateBundle,
} from "./bundle.mjs";
import {
  BUILD_WORKFLOW,
  COMMENT_MARKER,
  currentSource,
  downloadArtifact,
  postComment,
  selectArtifact,
  validateSource,
} from "./github.mjs";
import { hostingConfig, previewUrl, publishPreview, SITE } from "./publish.mjs";

const identity = { sha: "a".repeat(40), pr: 147, runId: 123, runAttempt: 1 };
const file = (name, contents) => ({
  path: name,
  content: Buffer.from(contents).toString("base64"),
  sha256: digest(Buffer.from(contents)),
});
const bundle = () => ({
  schemaVersion: 1,
  repositoryId: REPOSITORY_ID,
  ...identity,
  files: [file("index.html", "<html>preview</html>")],
});
function fixtures() {
  const repo = { id: REPOSITORY_ID, full_name: REPOSITORY };
  return {
    run: {
      id: 123,
      run_attempt: 1,
      event: "pull_request",
      status: "completed",
      conclusion: "success",
      repository: repo,
      head_repository: repo,
      workflow_id: 99,
      path: BUILD_WORKFLOW,
      head_sha: identity.sha,
      pull_requests: [{ number: 147 }],
    },
    pr: {
      number: 147,
      state: "open",
      base: { ref: "main", repo },
      head: { sha: identity.sha, repo },
      author_association: "OWNER",
      user: { type: "User" },
    },
    workflow: { id: 99, path: BUILD_WORKFLOW },
  };
}
const artifact = () => ({
  id: 567,
  name: "public-site-preview-123-1",
  expired: false,
  size_in_bytes: 400,
  digest: `sha256:${"b".repeat(64)}`,
  workflow_run: {
    id: 123,
    head_sha: identity.sha,
    repository_id: REPOSITORY_ID,
    head_repository_id: REPOSITORY_ID,
  },
});

test("accepts exact bounded static bundle and known asset types", () => {
  assert.equal(validateBundle(bundle(), identity).size, 1);
  for (const name of [
    "manifest.webmanifest",
    "assets/home-123.js",
    "assets/hero-640-test.avif",
    "icons/icon-123.png",
    "og-preview-d3a3e08f63.png",
  ])
    assert(allowedPath(name));
});

test("rejects traversal, dotfiles, executable scripts, secrets and source maps", () => {
  for (const name of [
    "../index.html",
    "/index.html",
    "assets/../../x.js",
    ".env",
    "firebase.json",
    "assets/a.js.map",
    "samra-runtime-config.js",
    "assets/a.sh",
    "assets/a.jpg",
    "assets/a\\b.js",
    "index.html\n",
    "__proto__",
  ]) {
    const changed = bundle();
    changed.files[0].path = name;
    assert.throws(() => validateBundle(changed, identity), undefined, name);
  }
});

test("rejects missing identity, mismatched SHA, attempt, schema and digests", () => {
  for (const mutate of [
    (b) => (b.sha = "b".repeat(40)),
    (b) => b.runAttempt++,
    (b) => b.pr++,
    (b) => b.schemaVersion++,
    (b) => b.repositoryId++,
    (b) => (b.files[0].sha256 = "0".repeat(64)),
    (b) => (b.files[0].content += "\n"),
    (b) => b.files.push(b.files[0]),
    (b) => (b.files = []),
    (b) => (b.files[0] = file("assets/a.png", "x".repeat(200_001))),
    (b) => (b.files[0] = file("index.html", "x".repeat(1_000_001))),
  ]) {
    const changed = bundle();
    mutate(changed);
    assert.throws(() => validateBundle(changed, identity));
  }
});

test("accepts one successful same-repo human PR build on exact current head", () => {
  const { run, pr, workflow } = fixtures();
  assert.deepEqual(validateSource(run, pr, workflow, 123, 1), identity);
});

test("rejects failed, stale, closed, fork, bot, ambiguous and wrong-workflow runs", () => {
  for (const mutate of [
    (f) => (f.run.conclusion = "failure"),
    (f) => (f.run.status = "in_progress"),
    (f) => (f.run.event = "push"),
    (f) => f.run.run_attempt++,
    (f) => (f.run.head_repository = { id: 1 }),
    (f) => (f.run.repository = { id: 1 }),
    (f) => (f.pr.state = "closed"),
    (f) => (f.pr.head.sha = "b".repeat(40)),
    (f) => (f.pr.author_association = "CONTRIBUTOR"),
    (f) => (f.pr.user.type = "Bot"),
    (f) => (f.pr.base.ref = "feature"),
    (f) => (f.workflow.path = "another.yml"),
    (f) => (f.run.pull_requests = []),
    (f) => f.run.pull_requests.push({ number: 148 }),
    (f) => (f.run.path = "another.yml"),
  ]) {
    const f = fixtures();
    mutate(f);
    assert.throws(() => validateSource(f.run, f.pr, f.workflow, 123, 1));
  }
});

test("trusted producer comparison blocks changed PR workflow", async () => {
  const f = fixtures();
  const api = async (url) =>
    url.startsWith("/actions/runs/")
      ? f.run
      : url.startsWith("/pulls/")
        ? f.pr
        : url.startsWith("/actions/workflows/")
          ? f.workflow
          : {
              type: "file",
              sha: url.endsWith(identity.sha) ? "changed" : "trusted",
            };
  await assert.rejects(
    currentSource(api, 123, 1, "c".repeat(40)),
    /Build workflow changed/,
  );
});

test("artifact identity is run-, attempt-, repository-, SHA- and digest-bound", () => {
  assert.equal(selectArtifact([artifact()], identity).id, 567);
  for (const mutate of [
    (a) => (a.expired = true),
    (a) => (a.size_in_bytes = 9_000_000),
    (a) => (a.digest = null),
    (a) => (a.workflow_run.head_sha = "c".repeat(40)),
    (a) => (a.workflow_run.repository_id = 1),
    (a) => (a.name = "public-site-preview-123-2"),
  ]) {
    const changed = artifact();
    mutate(changed);
    assert.throws(() => selectArtifact([changed], identity));
  }
  assert.throws(() => selectArtifact([artifact(), artifact()], identity));
});

test("archive download verifies SHA256, sends token only to GitHub, and never extracts paths", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "samra-preview-archive-"));
  const input = path.join(root, "input");
  await mkdir(input);
  await writeFile(path.join(input, "bundle.json"), JSON.stringify(bundle()));
  const zip = execFileSync("zip", ["-q", "-", "bundle.json"], { cwd: input });
  const a = artifact();
  a.digest = `sha256:${digest(zip)}`;
  const fetcher = async (url, options) => {
    if (String(url).startsWith("https://api.github.com/")) {
      assert.equal(options.headers.Authorization, "Bearer test-token");
      return new Response(null, {
        status: 302,
        headers: { location: "https://test.blob.core.windows.net/artifact" },
      });
    }
    assert.equal(options.headers, undefined);
    return new Response(zip);
  };
  await downloadArtifact(a, root, "test-token", fetcher);
  assert.equal(
    await readFile(path.join(root, "download/bundle.json"), "utf8"),
    JSON.stringify(bundle()),
  );
  a.digest = `sha256:${"0".repeat(64)}`;
  await assert.rejects(
    downloadArtifact(a, root, "test-token", fetcher),
    /Archive digest mismatch/,
  );
});

test("rejects artifact storage redirects to untrusted hosts before forwarding anything", async () => {
  await assert.rejects(
    downloadArtifact(
      artifact(),
      "/unused",
      "test-token",
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: "https://evil.example/zip" },
        }),
    ),
    /Unexpected artifact storage host/,
  );
});

test("production configuration and every security header are preserved; only previews get noindex", async () => {
  const firebase = JSON.parse(await readFile("firebase.json", "utf8"));
  const result = hostingConfig(firebase);
  assert.equal(result.trailingSlashBehavior, "REMOVE");
  assert.deepEqual(result.rewrites, [{ glob: "**", path: "/index.html" }]);
  for (const rule of firebase.hosting.headers) {
    assert(
      result.headers.some(
        (candidate) =>
          (candidate.glob ?? candidate.regex) === (rule.source ?? rule.regex) &&
          JSON.stringify(candidate.headers) ===
            JSON.stringify(
              Object.fromEntries(
                rule.headers.map(({ key, value }) => [key, value]),
              ),
            ),
      ),
    );
  }
  assert.equal(
    result.headers.at(-1).headers["X-Robots-Tag"],
    "noindex, nofollow, nosnippet",
  );
  firebase.hosting.rewrites.push({
    source: "/api/**",
    run: { serviceId: "api" },
  });
  assert.throws(() => hostingConfig(firebase));
});

test("preview URL rejects live, production, wrong PR and off-domain destinations", () => {
  assert.equal(
    previewUrl(`https://${SITE}--pr-147-abc123.web.app`, 147),
    `https://${SITE}--pr-147-abc123.web.app`,
  );
  for (const url of [
    "https://www.samrapay.com",
    `https://${SITE}.web.app`,
    `https://${SITE}--pr-148-abc.web.app`,
    `https://${SITE}--pr-147-abc.web.app.evil.example`,
    `https://${SITE}--pr-147-abc.web.app/?x=1`,
  ])
    assert.throws(() => previewUrl(url, 147));
});

function hostingMock({
  existing = false,
  failUpload = false,
  evilUpload = false,
  staleRoot = false,
} = {}) {
  const calls = [];
  const files = new Map([
    ["index.html", Buffer.from("<html>preview</html>")],
    ["assets/home-123.js", Buffer.from("export default 1")],
  ]);
  const version = `sites/${SITE}/versions/abc123`;
  const channel = `sites/${SITE}/channels/pr-147`;
  const url = `https://${SITE}--pr-147-abcd.web.app`;
  const channelState = {
    name: channel,
    url,
    expireTime: new Date(Date.now() + 7 * 86400_000).toISOString(),
  };
  let hashes = [];
  let rootFailed = false;
  const fetcher = async (target, options = {}) => {
    const request = String(target);
    calls.push({ url: request, ...options });
    const json = (data, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    if (request.startsWith(url)) {
      assert.equal(
        options.headers,
        undefined,
        "Never send cloud credentials to hosted content",
      );
      const route = new URL(request).pathname;
      const body = files.get(route.slice(1)) ?? files.get("index.html");
      if (staleRoot && !rootFailed) {
        rootFailed = true;
        return new Response("stale");
      }
      return new Response(body, {
        headers: {
          "cache-control": route.startsWith("/assets/")
            ? "public,max-age=31536000,immutable"
            : "no-cache,no-store,must-revalidate",
          "x-robots-tag": "noindex, nofollow, nosnippet",
        },
      });
    }
    assert.equal(options.headers.Authorization, "Bearer test-token");
    if (request.includes("/projects/123456789/sites/"))
      return json({ name: `projects/123456789/sites/${SITE}` });
    if (request.endsWith(channel) && options.method === "GET")
      return existing ? json(channelState) : json({}, 404);
    if (
      request.includes("/channels?") ||
      request.includes(`${channel}?updateMask`)
    )
      return json(channelState);
    if (request.endsWith("/versions")) return json({ name: version });
    if (request.endsWith(":populateFiles")) {
      hashes = Object.values(JSON.parse(options.body).files);
      return json({
        uploadRequiredHashes: hashes,
        uploadUrl: evilUpload
          ? "https://evil.example/files"
          : `https://upload-firebasehosting.googleapis.com/upload/${version}/files`,
      });
    }
    if (request.startsWith("https://upload-firebasehosting.googleapis.com/"))
      return new Response("", { status: failUpload ? 403 : 200 });
    if (request.includes("?updateMask=status"))
      return json({ status: "FINALIZED" });
    if (request.includes(`${channel}/releases?`))
      return json({
        name: `${channel}/releases/1234`,
        version: { name: version },
      });
    throw new Error(`Unexpected test request ${request}`);
  };
  return { calls, files, fetcher };
}

for (const existing of [false, true])
  test(`publishes ${existing ? "updated" : "new"} preview, verifies bytes and never targets live`, async () => {
    const m = hostingMock({ existing, staleRoot: true });
    let guards = 0;
    let retries = 0;
    const evidence = await publishPreview({
      ...m,
      identity,
      config: {},
      projectNumber: "123456789",
      token: "test-token",
      assertCurrent: async () => {
        guards++;
      },
      sleep: async () => {
        retries++;
      },
    });
    assert.equal(evidence.status, "verified");
    assert.equal(guards, 3);
    assert.equal(retries, 1);
    const writes = m.calls.filter((call) =>
      ["POST", "PATCH"].includes(call.method),
    );
    assert(
      writes.every(
        (call) =>
          !call.url.includes("samra-pay-production") &&
          !call.url.includes("/channels/live"),
      ),
    );
    assert.equal(
      writes.filter((call) => call.url.includes("/releases?")).length,
      1,
    );
    assert.equal(
      JSON.parse(
        writes.find(
          (call) =>
            call.url.includes("/channels?") ||
            call.url.includes("updateMask=expireTime"),
        ).body,
      ).retainedReleaseCount,
      2,
    );
  });

test("upload failure and malicious upload URL never finalize or release", async () => {
  for (const options of [{ failUpload: true }, { evilUpload: true }]) {
    const m = hostingMock(options);
    await assert.rejects(
      publishPreview({
        ...m,
        identity,
        config: {},
        projectNumber: "123456789",
        token: "test-token",
        assertCurrent: async () => {},
      }),
    );
    assert(
      !m.calls.some(
        (call) =>
          call.url.includes("updateMask=status") ||
          call.url.includes("/releases?"),
      ),
    );
  }
});

test("PR changed during upload blocks release", async () => {
  const m = hostingMock();
  let checks = 0;
  await assert.rejects(
    publishPreview({
      ...m,
      identity,
      config: {},
      projectNumber: "123456789",
      token: "test-token",
      assertCurrent: async () => {
        if (++checks === 2) throw new Error("PR advanced");
      },
    }),
    /PR advanced/,
  );
  assert(!m.calls.some((call) => call.url.includes("/releases?")));
});

test("production and staging project numbers rejected before network", async () => {
  for (const projectNumber of [
    "382465561715",
    "934122615631",
    "",
    "123/../../live",
  ]) {
    await assert.rejects(
      publishPreview({
        files: new Map(),
        identity,
        config: {},
        projectNumber,
        token: "x",
        assertCurrent: async () => assert.fail("must reject first"),
      }),
    );
  }
});

test("comment upsert changes only this workflow's bot comment", async () => {
  for (const existing of [false, true]) {
    const writes = [];
    const api = async (url, options) => {
      if (options) {
        writes.push({ url, ...options });
        return {};
      }
      return [
        { id: 1, body: COMMENT_MARKER, user: { login: "human", type: "User" } },
        ...(existing
          ? [
              {
                id: 2,
                body: COMMENT_MARKER,
                user: { login: "github-actions[bot]", type: "Bot" },
              },
            ]
          : []),
      ];
    };
    await postComment(api, identity, "verified preview");
    assert.equal(writes[0].method, existing ? "PATCH" : "POST");
    assert.equal(
      writes[0].url,
      existing ? "/issues/comments/2" : "/issues/147/comments",
    );
  }
});

test("workflows isolate credentials, pin actions, and never deploy on merge", async () => {
  const build = await readFile(BUILD_WORKFLOW, "utf8");
  const publish = await readFile(
    ".github/workflows/public-site-preview-publish.yml",
    "utf8",
  );
  assert.doesNotMatch(
    build,
    /id-token:|secrets\.|google-github-actions\/auth|pull_request_target/,
  );
  assert.match(build, /persist-credentials: false/);
  assert.match(publish, /workflow_run:/);
  assert.doesNotMatch(
    publish,
    /pull_request_target:|\n  push:|pnpm install|firebase deploy|hosting:clone|credentials_json/,
  );
  assert.match(publish, /SAMRA_PUBLIC_PREVIEWS_ENABLED == 'true'/);
  assert.match(publish, /ref: \$\{\{ github.sha \}\}/);
  assert.match(publish, /environment: public-site-preview/);
  assert.match(publish, /cancel-in-progress: false/);
  assert(
    publish.indexOf("bundle.mjs verify") <
      publish.indexOf("google-github-actions/auth"),
  );
  assert.match(publish, /create_credentials_file: false/);
  for (const source of [build, publish]) {
    for (const match of source.matchAll(/uses: ([^\s#]+)/g))
      assert.match(match[1], /@[a-f0-9]{40}$/);
  }
});
