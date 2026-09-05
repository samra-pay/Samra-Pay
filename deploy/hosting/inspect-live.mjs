import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export const PROJECT = "samra-pay-production";
export const PROJECT_NUMBER = "382465561715";
export const SITE = PROJECT;
const API = "https://firebasehosting.googleapis.com/v1beta1/";
const SITE_NAME = `projects/${PROJECT_NUMBER}/sites/${SITE}`;
const LIVE = `sites/${SITE}/channels/live`;
const VERSION = new RegExp(`^sites/${SITE}/versions/[A-Za-z0-9_-]{1,128}$`);
const RELEASE = new RegExp(
  `^sites/${SITE}/(?:channels/live/)?releases/[A-Za-z0-9_-]{1,128}$`,
);
const MAX_FILES = 10_000;
const MAX_PAGES = 20;
const MAX_RESPONSE_BYTES = 2_000_000;

class InspectionError extends Error {}
function requireValue(condition, message) {
  if (!condition) throw new InspectionError(message);
}
function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
export const digest = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");

// Sort object keys, but preserve array order: Hosting rule order is significant.
export function canonical(value) {
  function encode(item, depth) {
    requireValue(depth <= 50, "JSON nesting exceeds the inspection limit");
    if (item === null || typeof item === "boolean" || typeof item === "string")
      return JSON.stringify(item);
    if (typeof item === "number") {
      requireValue(Number.isFinite(item), "Non-JSON number rejected");
      return JSON.stringify(item);
    }
    if (Array.isArray(item))
      return `[${Array.from(item, (entry) => encode(entry, depth + 1)).join(",")}]`;
    requireValue(
      object(item) &&
        [Object.prototype, null].includes(Object.getPrototypeOf(item)),
      "Non-JSON value rejected",
    );
    return `{${Object.keys(item)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${encode(item[key], depth + 1)}`)
      .join(",")}}`;
  }
  return encode(value, 0);
}

function releaseOf(channel) {
  requireValue(channel.name === LIVE, "Unexpected Hosting channel");
  const release = channel.release;
  requireValue(
    object(release) && RELEASE.test(release.name),
    "Missing or unexpected live release",
  );
  // TYPE_UNSPECIFIED is documented as a released version; SITE_DISABLE is not.
  requireValue(
    [undefined, "TYPE_UNSPECIFIED", "DEPLOY", "ROLLBACK"].includes(
      release.type,
    ),
    "Live site is disabled or has an unsupported release type",
  );
  requireValue(
    object(release.version) && VERSION.test(release.version.name),
    "Live release references an unexpected version",
  );
  requireValue(
    typeof release.releaseTime === "string" &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(
        release.releaseTime,
      ) &&
      Number.isFinite(Date.parse(release.releaseTime)),
    "Invalid live release time",
  );
  requireValue(
    release.message === undefined ||
      (typeof release.message === "string" && release.message.length <= 512),
    "Invalid live release message",
  );
  return release;
}

// Official schema references, checked 2026-09-05:
// https://firebase.google.com/docs/reference/hosting/rest/v1beta1/projects.sites
// https://firebase.google.com/docs/reference/hosting/rest/v1beta1/sites.channels
// https://firebase.google.com/docs/reference/hosting/rest/v1beta1/sites.versions
// https://firebase.google.com/docs/reference/hosting/rest/v1beta1/sites.versions.files/list
// Do not infer live from sites.releases.list: that list also includes previews
// and its API contract does not specify ordering. Channel.release is current.
export async function inspectLive({
  token,
  fetcher = fetch,
  now = () => new Date(),
}) {
  requireValue(
    typeof token === "string" &&
      token.length > 0 &&
      token.length <= 16_384 &&
      !/\s/.test(token),
    "A short-lived access token is required",
  );
  async function get(resource) {
    const url = API + resource;
    let response;
    try {
      response = await fetcher(url, {
        method: "GET",
        redirect: "error",
        signal: AbortSignal.timeout(30_000),
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });
    } catch {
      throw new InspectionError(
        "Hosting read failed; no response body or credential was recorded",
      );
    }
    requireValue(!response.redirected, "Hosting redirects are not permitted");
    requireValue(
      !response.url || response.url === url,
      "Unexpected Hosting response URL",
    );
    requireValue(
      response.status === 200,
      `Hosting read returned HTTP ${Number(response.status) || "error"}`,
    );
    const length = response.headers?.get("content-length");
    requireValue(
      length === null ||
        length === undefined ||
        (/^\d+$/.test(length) && Number(length) <= MAX_RESPONSE_BYTES),
      "Hosting response exceeds the inspection limit",
    );
    let body;
    try {
      // Bound a streamed response before parsing instead of trusting its header.
      const reader = response.body.getReader();
      const chunks = [];
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_RESPONSE_BYTES) {
          await reader.cancel();
          throw new Error("oversize");
        }
        chunks.push(Buffer.from(value));
      }
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw new InspectionError(
        "Hosting response was unreadable or exceeded the inspection limit",
      );
    }
    requireValue(object(body), "Hosting response must be a JSON object");
    return body;
  }
  const site = await get(SITE_NAME);
  requireValue(
    [SITE_NAME, `projects/${PROJECT}/sites/${SITE}`].includes(site.name),
    "Hosting site does not belong to the expected production project",
  );
  requireValue(
    site.defaultUrl === `https://${SITE}.web.app`,
    "Unexpected default Hosting URL",
  );
  const release = releaseOf(await get(LIVE));
  const version = await get(release.version.name);
  requireValue(
    version.name === release.version.name,
    "Hosting version identity mismatch",
  );
  requireValue(
    version.status === "FINALIZED",
    "Live Hosting version is not FINALIZED",
  );
  requireValue(object(version.config), "Live Hosting configuration is missing");
  if (release.version.status !== undefined)
    requireValue(
      release.version.status === version.status,
      "Live release version status mismatch",
    );
  if (release.version.config !== undefined)
    requireValue(
      canonical(release.version.config) === canonical(version.config),
      "Live release configuration mismatch",
    );
  requireValue(
    typeof version.fileCount === "string" &&
      /^[1-9]\d*$/.test(version.fileCount) &&
      Number(version.fileCount) <= MAX_FILES,
    "Invalid or excessive finalized file count",
  );
  const config = JSON.parse(canonical(version.config));
  const paths = new Set();
  const tokens = new Set();
  const files = [];
  let pageToken;
  for (let page = 0; ; page++) {
    requireValue(
      page < MAX_PAGES,
      "Hosting file pagination exceeds the inspection limit",
    );
    const query = new URLSearchParams({ status: "ACTIVE", pageSize: "1000" });
    if (pageToken) query.set("pageToken", pageToken);
    const listing = await get(`${version.name}/files?${query}`);
    const entries = listing.files ?? [];
    requireValue(
      Array.isArray(entries) && entries.length <= 1000,
      "Invalid Hosting file page",
    );
    for (const file of entries) {
      requireValue(
        object(file) &&
          typeof file.path === "string" &&
          file.path.length <= 2048 &&
          /^\/(?:[A-Za-z0-9_-][A-Za-z0-9._-]*\/)*[A-Za-z0-9_-][A-Za-z0-9._-]*$/.test(
            file.path,
          ),
        "Unsafe Hosting file path",
      );
      requireValue(!paths.has(file.path), "Duplicate Hosting file path");
      requireValue(
        typeof file.hash === "string" && /^[a-f0-9]{64}$/.test(file.hash),
        "Invalid Hosting SHA256 hash",
      );
      requireValue(file.status === "ACTIVE", "Hosting file is not ACTIVE");
      paths.add(file.path);
      files.push({ path: file.path, hash: file.hash });
      requireValue(
        files.length <= MAX_FILES,
        "Hosting file count exceeds the inspection limit",
      );
    }
    pageToken = listing.nextPageToken;
    if (pageToken === undefined || pageToken === "") break;
    requireValue(
      typeof pageToken === "string" &&
        pageToken.length <= 4096 &&
        !/[\x00-\x20\x7f]/.test(pageToken),
      "Invalid Hosting pagination token",
    );
    requireValue(!tokens.has(pageToken), "Repeated Hosting pagination token");
    tokens.add(pageToken);
  }
  requireValue(
    files.length === Number(version.fileCount),
    "Hosting file listing is incomplete",
  );
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const ending = releaseOf(await get(LIVE));
  requireValue(
    ending.name === release.name &&
      ending.version.name === version.name &&
      ending.releaseTime === release.releaseTime &&
      ending.type === release.type &&
      (ending.message ?? "") === (release.message ?? ""),
    "Live Hosting release changed during inspection",
  );
  const inspectedAt = now().toISOString();
  return {
    schemaVersion: 1,
    projectId: PROJECT,
    projectNumber: PROJECT_NUMBER,
    site: SITE,
    releaseName: release.name,
    releaseTime: release.releaseTime,
    releaseMessage: release.message ?? "",
    versionName: version.name,
    config,
    configSha256: digest(canonical(config)),
    files,
    filesSha256: digest(canonical(files)),
    inspectedAt,
  };
}

export async function runCli(
  argv,
  {
    run = execFileSync,
    inspect = inspectLive,
    save = writeFile,
    print = console.log,
  } = {},
) {
  requireValue(
    argv.length === 4,
    "Usage: inspect-live.mjs --operator EMAIL --output PATH",
  );
  const options = new Map();
  for (let i = 0; i < argv.length; i += 2) {
    requireValue(
      ["--operator", "--output"].includes(argv[i]) && !options.has(argv[i]),
      "Unknown or duplicate inspection option",
    );
    options.set(argv[i], argv[i + 1]);
  }
  const operator = options.get("--operator");
  const output = options.get("--output");
  requireValue(
    typeof operator === "string" &&
      /^[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(operator),
    "An explicit operator email is required",
  );
  requireValue(
    typeof output === "string" && output.length > 0 && !output.includes("\0"),
    "An output path is required",
  );
  function gcloud(args) {
    try {
      return run("gcloud", args, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 30_000,
        maxBuffer: 64_000,
      }).trim();
    } catch {
      throw new InspectionError(
        "Existing gcloud authentication is unavailable; no login or configuration change was attempted",
      );
    }
  }
  requireValue(
    gcloud([
      "auth",
      "list",
      "--filter=status:ACTIVE",
      "--format=value(account)",
      "--quiet",
    ]) === operator,
    "Active Google account does not match the requested operator",
  );
  const impersonation = gcloud([
    "config",
    "get-value",
    "auth/impersonate_service_account",
    "--quiet",
  ]);
  requireValue(
    ["", "(unset)"].includes(impersonation),
    "Configured impersonation is not allowed for operator inspection",
  );
  const token = gcloud([
    "auth",
    "print-access-token",
    `--account=${operator}`,
    "--quiet",
  ]);
  const snapshot = await inspect({ token });
  await save(output, `${JSON.stringify(snapshot, null, 2)}\n`, {
    flag: "wx",
    mode: 0o600,
  });
  print(
    `Read-only Hosting snapshot: ${snapshot.releaseName}; ${snapshot.files.length} files; configuration ${snapshot.configSha256}`,
  );
  return snapshot;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runCli(process.argv.slice(2)).catch((error) => {
    console.error(
      error instanceof InspectionError
        ? error.message
        : "Hosting inspection failed; no cloud changes were made",
    );
    process.exitCode = 1;
  });
}
