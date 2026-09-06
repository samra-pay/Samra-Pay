import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { inspectPublicBuild } from "../../artifacts/samra-pay/scripts/check-public-build.mjs";
import { evaluateExperienceBudgets } from "../../scripts/src/validate-experience-budgets.ts";

export const REPOSITORY = "samra-pay/Samra-Pay";
export const REPOSITORY_ID = 1335175962;
export const PUBLIC_DIR = "artifacts/samra-pay/dist/public";
export const MAX_BUNDLE_BYTES = 8_000_000;
export const digest = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");
export const sha = (value) => /^[a-f0-9]{40}$/.test(value ?? "");
export const positive = (value) =>
  /^[1-9][0-9]*$/.test(String(value)) && Number.isSafeInteger(Number(value));

export function allowedPath(file) {
  // No credentials, config, source maps, archives, dotfiles or executable scripts.
  return /^(?:index\.html|robots\.txt|sitemap\.xml|manifest\.webmanifest|og-preview-[a-f0-9]{10}\.png|icons\/[A-Za-z0-9_-]+\.png|assets\/[A-Za-z0-9_-]+\.(?:js|css|avif|webp|svg))$/.test(
    file,
  );
}

export function validateBundle(bundle, identity) {
  assert.equal(bundle.schemaVersion, 1);
  assert.equal(bundle.repositoryId, REPOSITORY_ID);
  for (const key of ["sha", "pr", "runId", "runAttempt"]) {
    assert.equal(bundle[key], identity[key], `Preview ${key} mismatch`);
  }
  assert(
    sha(bundle.sha) &&
      [bundle.pr, bundle.runId, bundle.runAttempt].every(positive),
    "Invalid preview identity",
  );
  assert(
    Array.isArray(bundle.files) &&
      bundle.files.length > 0 &&
      bundle.files.length <= 512,
    "Invalid file count",
  );
  const files = new Map();
  let total = 0;
  for (const file of bundle.files) {
    assert(
      allowedPath(file.path) && !files.has(file.path),
      "Unsafe or duplicate public path",
    );
    assert(
      typeof file.content === "string" && file.content.length <= 1_400_000,
      "Invalid encoded file",
    );
    const bytes = Buffer.from(file.content, "base64");
    assert.equal(bytes.toString("base64"), file.content, "Noncanonical base64");
    assert.equal(digest(bytes), file.sha256, "File digest mismatch");
    assert(bytes.length > 0 && bytes.length <= 1_000_000, "Invalid file size");
    if (/\.(avif|webp|png|svg)$/.test(file.path))
      assert(bytes.length <= 200_000, "Image exceeds 200 KB");
    total += bytes.length;
    assert(total <= 5_000_000, "Preview exceeds 5 MB total");
    files.set(file.path, bytes);
  }
  assert(files.has("index.html"), "Missing entry HTML");
  return files;
}

async function list(directory, prefix = "") {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    assert(!entry.isSymbolicLink(), "Symlinks are not public assets");
    const relative = prefix + entry.name;
    if (entry.isDirectory())
      files.push(
        ...(await list(path.join(directory, entry.name), `${relative}/`)),
      );
    else {
      assert(
        entry.isFile() && allowedPath(relative),
        `Unexpected public asset: ${relative}`,
      );
      const bytes = await readFile(path.join(directory, entry.name));
      files.push({
        path: relative,
        content: bytes.toString("base64"),
        sha256: digest(bytes),
      });
    }
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

export async function checkPublic(directory, workspaceRoot, candidateSha) {
  assert.deepEqual(
    await inspectPublicBuild(directory),
    [],
    "Public bundle boundary failed",
  );
  const contract = JSON.parse(
    await readFile(
      new URL("../../docs/testing/experience-budgets.json", import.meta.url),
      "utf8",
    ),
  );
  const budgets = contract.budgets.filter(
    (budget) =>
      budget.directory === PUBLIC_DIR ||
      budget.directory.startsWith(`${PUBLIC_DIR}/`),
  );
  assert(budgets.length >= 12, "Missing public experience budgets");
  const report = await evaluateExperienceBudgets(
    { ...contract, budgets },
    workspaceRoot,
    { candidateSha, generatedAt: new Date().toISOString() },
  );
  assert.equal(
    report.status,
    "passed",
    JSON.stringify(report.results.filter((item) => item.status !== "passed")),
  );
  return report;
}

export async function run(mode, env = process.env) {
  if (mode === "pack") {
    const bundle = {
      schemaVersion: 1,
      repositoryId: REPOSITORY_ID,
      sha: env.PREVIEW_SHA,
      pr: Number(env.PREVIEW_PR),
      runId: Number(env.GITHUB_RUN_ID),
      runAttempt: Number(env.GITHUB_RUN_ATTEMPT),
      files: await list(PUBLIC_DIR),
    };
    validateBundle(bundle, bundle);
    await checkPublic(PUBLIC_DIR, process.cwd(), bundle.sha);
    const json = JSON.stringify(bundle);
    assert(Buffer.byteLength(json) <= MAX_BUNDLE_BYTES, "Bundle too large");
    await mkdir("tmp/public-site-preview", { recursive: true });
    await writeFile("tmp/public-site-preview/bundle.json", json);
    console.log(
      `Packaged ${bundle.files.length} files for PR ${bundle.pr} at ${bundle.sha}`,
    );
  } else {
    assert.equal(mode, "verify");
    assert(env.PREVIEW_ROOT, "Missing isolated preview root");
    const identity = JSON.parse(
      await readFile(path.join(env.PREVIEW_ROOT, "identity.json"), "utf8"),
    );
    const download = path.join(env.PREVIEW_ROOT, "download");
    assert.deepEqual(
      await readdir(download),
      ["bundle.json"],
      "Artifact contains unexpected files",
    );
    const stat = await lstat(path.join(download, "bundle.json"));
    assert(
      stat.isFile() && !stat.isSymbolicLink() && stat.size <= MAX_BUNDLE_BYTES,
      "Invalid artifact file",
    );
    const contents = await readFile(path.join(download, "bundle.json"));
    const files = validateBundle(JSON.parse(contents), identity);
    const workspace = path.join(env.PREVIEW_ROOT, "validated");
    // This directory must be new: stale or attacker-created paths are rejected.
    await mkdir(workspace);
    for (const [file, bytes] of files) {
      const target = path.join(workspace, PUBLIC_DIR, file);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, bytes, { flag: "wx" });
    }
    const report = await checkPublic(
      path.join(workspace, PUBLIC_DIR),
      workspace,
      identity.sha,
    );
    await writeFile(
      path.join(env.PREVIEW_ROOT, "budgets.json"),
      JSON.stringify(report, null, 2),
    );
    await writeFile(
      path.join(env.PREVIEW_ROOT, "bundle.sha256"),
      digest(contents),
    );
    console.log(
      `Trusted validation passed for PR ${identity.pr} at ${identity.sha}`,
    );
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  run(process.argv[2]).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
