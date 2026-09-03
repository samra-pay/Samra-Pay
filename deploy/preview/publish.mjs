import assert from "node:assert/strict";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import { digest, positive, validateBundle } from "./bundle.mjs";
import { currentSource, githubClient, postComment } from "./github.mjs";

export const PROJECT = "samra-pay-previews";
export const SITE = PROJECT;
const API = "https://firebasehosting.googleapis.com/v1beta1/";
const MAX_AGE = "public,max-age=31536000,immutable";
const NO_CACHE = "no-cache,no-store,must-revalidate";
const PREVIEW_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'none'; manifest-src 'self'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'; object-src 'none'; upgrade-insecure-requests";
const ANALYTICS_CONNECTIONS =
  "https://www.google-analytics.com https://region1.google-analytics.com https://www.googletagmanager.com";

function withoutPublicAnalytics(csp) {
  const restricted = csp
    .replace(
      "script-src 'self' https://www.googletagmanager.com/gtag/js;",
      "script-src 'self';",
    )
    .replace(
      `img-src 'self' data: ${ANALYTICS_CONNECTIONS};`,
      "img-src 'self' data:;",
    )
    .replace(`connect-src ${ANALYTICS_CONNECTIONS};`, "connect-src 'none';");
  assert.equal(
    restricted,
    PREVIEW_CSP,
    "Review any other CSP change before publishing previews",
  );
  return restricted;
}
const ROUTES = [
  "/",
  "/features",
  "/cards",
  "/values",
  "/faq",
  "/blog",
  "/privacy",
  "/terms",
];

export function previewUrl(value, pr) {
  assert(positive(pr));
  const url = new URL(value);
  assert(
    url.protocol === "https:" &&
      !url.port &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      url.pathname === "/",
    "Invalid preview URL",
  );
  assert(
    new RegExp(`^${SITE}--pr-${pr}-[a-z0-9]+\\.web\\.app$`).test(url.hostname),
    "URL is not the exact PR preview channel",
  );
  return url.origin;
}

export function hostingConfig(firebase) {
  const hosting = firebase.hosting;
  assert(hosting && !Array.isArray(hosting));
  assert.deepEqual(Object.keys(firebase), ["hosting"]);
  assert.deepEqual(
    Object.keys(hosting).sort(),
    ["headers", "ignore", "public", "rewrites", "trailingSlash"].sort(),
    "Review new hosting configuration fields before using previews",
  );
  assert.equal(hosting.public, "artifacts/samra-pay/dist/public");
  assert.equal(hosting.trailingSlash, false);
  assert.deepEqual(
    hosting.rewrites,
    [{ source: "**", destination: "/index.html" }],
    "Only static rewrites are allowed",
  );
  const headers = hosting.headers.map((rule) => {
    assert(
      Boolean(rule.source) !== Boolean(rule.regex),
      "Exactly one header matcher required",
    );
    return {
      ...(rule.source ? { glob: rule.source } : { regex: rule.regex }),
      headers: Object.fromEntries(
        rule.headers.map(({ key, value }) => [
          key,
          key === "Content-Security-Policy"
            ? withoutPublicAnalytics(value)
            : value,
        ]),
      ),
    };
  });
  assert(
    headers.some(
      (rule) =>
        rule.glob === "**" &&
        rule.headers["Content-Security-Policy"]?.includes("connect-src 'none'"),
    ),
    "Preview must remain static with no backend connections",
  );
  // Preserve security/cache headers; previews additionally block all analytics
  // and suppress indexing, regardless of a visitor's saved consent.
  headers.push({
    glob: "**",
    headers: { "X-Robots-Tag": "noindex, nofollow, nosnippet" },
  });
  return {
    headers,
    rewrites: [{ glob: "**", path: "/index.html" }],
    trailingSlashBehavior: "REMOVE",
  };
}

export async function publishPreview({
  files,
  identity,
  config,
  projectNumber,
  token,
  assertCurrent,
  fetcher = fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  record = async () => {},
}) {
  assert(
    positive(identity.pr) &&
      positive(projectNumber) &&
      !["382465561715", "934122615631"].includes(String(projectNumber)),
    "Isolated project required",
  );
  assert(token && typeof assertCurrent === "function");
  const site = `sites/${SITE}`;
  const channel = `${site}/channels/pr-${identity.pr}`;
  async function request(resource, method = "GET", body, allowMissing = false) {
    // All mutation paths are constructed here from validated numeric identities.
    assert(
      resource.startsWith(`${site}/`) ||
        resource === `projects/${projectNumber}/sites/${SITE}`,
      "Request outside preview site",
    );
    assert(
      !resource.includes("/channels/live") &&
        !resource.startsWith(`${site}/releases`),
      "Live releases forbidden",
    );
    const response = await fetcher(API + resource, {
      method,
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (allowMissing && response.status === 404) return null;
    assert(response.ok, `Firebase preview request failed (${response.status})`);
    return response.json();
  }
  await assertCurrent();
  const siteState = await request(`projects/${projectNumber}/sites/${SITE}`);
  assert(
    [
      `projects/${projectNumber}/sites/${SITE}`,
      `projects/${PROJECT}/sites/${SITE}`,
    ].includes(siteState.name),
    "Preview site project mismatch",
  );
  const settings = {
    expireTime: new Date(Date.now() + 7 * 86400_000).toISOString(),
    retainedReleaseCount: 2,
  };
  const existing = await request(channel, "GET", undefined, true);
  const channelState = existing
    ? await request(
        `${channel}?updateMask=expireTime,retainedReleaseCount`,
        "PATCH",
        settings,
      )
    : await request(
        `${site}/channels?channelId=pr-${identity.pr}`,
        "POST",
        settings,
      );
  assert.equal(channelState.name, channel);
  const expiry = Date.parse(channelState.expireTime);
  assert(
    Number.isFinite(expiry) &&
      expiry > Date.now() + 6 * 86400_000 &&
      expiry <= Date.now() + 8 * 86400_000,
    "Preview channel expiration was not applied",
  );
  const url = previewUrl(channelState.url, identity.pr);
  const version = await request(`${site}/versions`, "POST", { config });
  assert(
    new RegExp(`^${site}/versions/[a-zA-Z0-9_-]+$`).test(version.name),
    "Unexpected version resource",
  );
  const uploads = new Map();
  const hashes = {};
  for (const [file, bytes] of files) {
    const compressed = gzipSync(bytes, { level: 9 });
    const hash = digest(compressed);
    hashes[`/${file}`] = hash;
    uploads.set(hash, compressed);
  }
  const populated = await request(`${version.name}:populateFiles`, "POST", {
    files: hashes,
  });
  const uploadUrl = `https://upload-firebasehosting.googleapis.com/upload/${version.name}/files`;
  assert.equal(populated.uploadUrl, uploadUrl, "Untrusted upload destination");
  const required = populated.uploadRequiredHashes ?? [];
  assert(
    Array.isArray(required) && required.every((hash) => uploads.has(hash)),
    "Unknown upload hash",
  );
  for (let offset = 0; offset < required.length; offset += 4) {
    await Promise.all(
      required.slice(offset, offset + 4).map(async (hash) => {
        const response = await fetcher(`${uploadUrl}/${hash}`, {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(30_000),
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/octet-stream",
          },
          body: uploads.get(hash),
        });
        assert(response.ok, `Preview file upload failed (${response.status})`);
      }),
    );
  }
  const finalized = await request(
    `${version.name}?updateMask=status`,
    "PATCH",
    { status: "FINALIZED" },
  );
  assert.equal(finalized.status, "FINALIZED");
  await assertCurrent();
  const release = await request(
    `${channel}/releases?versionName=${encodeURIComponent(version.name)}`,
    "POST",
    { message: `PR ${identity.pr} static preview ${identity.sha}` },
  );
  assert.equal(release.version?.name, version.name, "Release/version mismatch");
  assert(
    release.name?.startsWith(`${channel}/releases/`),
    "Unexpected release channel",
  );
  const evidence = {
    ...identity,
    project: PROJECT,
    site: SITE,
    channel,
    url,
    version: version.name,
    release: release.name,
    expires: channelState.expireTime,
    status: "published-awaiting-verification",
  };
  await record(evidence);
  // Edge propagation can lag finalization. Retry reads only; never redeploy to fix a cached response.
  let verified = false;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      for (const route of ROUTES) {
        const response = await fetcher(url + route, {
          redirect: "error",
          signal: AbortSignal.timeout(15_000),
        });
        assert.equal(response.status, 200);
        assert.equal(response.headers.get("cache-control"), NO_CACHE);
        assert(response.headers.get("x-robots-tag")?.includes("noindex"));
        assert.equal(
          digest(Buffer.from(await response.arrayBuffer())),
          digest(files.get("index.html")),
          "Route bytes have not propagated",
        );
      }
      verified = true;
      break;
    } catch (error) {
      if (attempt === 5) throw error;
      await sleep(5000);
    }
  }
  assert(verified);
  for (const [file, bytes] of files) {
    const response = await fetcher(`${url}/${file}`, {
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
    assert.equal(response.status, 200);
    assert.equal(
      digest(Buffer.from(await response.arrayBuffer())),
      digest(bytes),
      `Served asset mismatch: ${file}`,
    );
    if (/^(assets\/|icons\/|og-preview-)/.test(file))
      assert.equal(response.headers.get("cache-control"), MAX_AGE);
  }
  await assertCurrent();
  evidence.status = "verified";
  evidence.verifiedAt = new Date().toISOString();
  await record(evidence);
  return evidence;
}

async function main(env = process.env) {
  const root = env.PREVIEW_ROOT;
  assert(
    root &&
      env.GITHUB_EVENT_NAME === "workflow_run" &&
      env.GITHUB_REF === "refs/heads/main",
  );
  const identity = JSON.parse(
    await readFile(path.join(root, "identity.json"), "utf8"),
  );
  const bundle = await readFile(path.join(root, "download/bundle.json"));
  assert.equal(
    digest(bundle),
    await readFile(path.join(root, "bundle.sha256"), "utf8"),
    "Validated bundle changed",
  );
  const files = validateBundle(JSON.parse(bundle), identity);
  const config = hostingConfig(
    JSON.parse(await readFile("firebase.json", "utf8")),
  );
  const api = githubClient(env.GITHUB_TOKEN);
  const assertCurrent = async () => {
    const current = await currentSource(
      api,
      identity.runId,
      identity.runAttempt,
      env.GITHUB_SHA,
    );
    for (const key of ["sha", "pr", "runId", "runAttempt", "trustedSha"])
      assert.equal(current[key], identity[key]);
  };
  const evidence = await publishPreview({
    files,
    identity,
    config,
    projectNumber: env.PREVIEW_PROJECT_NUMBER,
    token: env.PREVIEW_ACCESS_TOKEN,
    assertCurrent,
    record: (data) =>
      writeFile(path.join(root, "release.json"), JSON.stringify(data, null, 2)),
  });
  const body = `### Samra Pay site preview\n\n[Open preview](${evidence.url})\n\nCommit: \`${identity.sha}\`\n\nExpires: ${evidence.expires}. Updates when an eligible build passes. If a newer build fails, this link still represents the commit shown above.\n\nStatic informational site only. Publicly shareable review URL; no login or data collection. Production is unchanged. Approval and the exact-SHA production release remain separate.\n\n[Build evidence](https://github.com/haileleuld87/Samra-Pay/actions/runs/${identity.runId})`;
  await postComment(api, identity, body);
  if (env.GITHUB_STEP_SUMMARY)
    await appendFile(env.GITHUB_STEP_SUMMARY, `${body}\n`);
  console.log(`Verified preview: ${evidence.url} (${identity.sha})`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
