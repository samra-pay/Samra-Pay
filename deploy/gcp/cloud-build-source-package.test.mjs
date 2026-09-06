import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  constants,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");

test("Cloud Build validation runs inside the filtered upload without Git or credentials", () => {
  const folder = mkdtempSync(join(tmpdir(), "samra-cloud-build-package-"));
  const filter = join(folder, "filter");
  const source = join(folder, "source");
  const bin = join(folder, "bin");
  try {
    mkdirSync(source);
    mkdirSync(bin);
    execFileSync("git", ["init", "--quiet", filter]);

    // gcloudignore uses Git ignore patterns. Expand the one reviewed include
    // and let Git evaluate those patterns in a disposable filtering fixture.
    const patterns = read(".gcloudignore");
    assert.deepEqual(patterns.match(/^#!include:.*$/gm), [
      "#!include:.dockerignore",
    ]);
    writeFileSync(
      join(filter, ".git", "info", "exclude"),
      patterns.replace("#!include:.dockerignore", read(".dockerignore")),
    );
    const files = execFileSync(
      "git",
      ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
      { cwd: root, encoding: "utf8" },
    )
      .split("\0")
      .filter(Boolean);
    const forbidden = [
      ".git/config",
      ".env",
      ".env.production",
      ".npmrc",
      "gha-creds-synthetic-fixture.json",
      "credentials-synthetic-fixture.json",
      "work/synthetic-fixture.txt",
      "node_modules/synthetic-fixture/index.js",
      "attached_assets/unreviewed-synthetic-fixture.png",
      ".github/workflows/staging-image-publication.yml",
      ".github/workflows/release-candidate.yml",
    ];
    const checked = spawnSync(
      "git",
      ["-C", filter, "check-ignore", "--no-index", "--stdin", "-z"],
      {
        input: [...new Set([...files, ...forbidden])].join("\0") + "\0",
        encoding: "utf8",
      },
    );
    assert.equal(checked.status, 0, checked.stderr);
    const excluded = new Set(checked.stdout.split("\0").filter(Boolean));
    for (const path of forbidden) assert.ok(excluded.has(path), path);
    for (const path of files) {
      if (excluded.has(path)) continue;
      assert.ok(!path.startsWith("/") && !path.split("/").includes(".."));
      const original = join(root, path);
      assert.ok(
        lstatSync(original).isFile(),
        `Unsupported upload entry: ${path}`,
      );
      const destination = join(source, path);
      mkdirSync(dirname(destination), { recursive: true });
      copyFileSync(original, destination, constants.COPYFILE_FICLONE);
    }
    assert.ok(
      existsSync(join(source, ".github/workflows/container-portability.yml")),
    );
    for (const path of forbidden)
      assert.ok(!existsSync(join(source, path)), path);

    const cloudBuild = read("deploy/gcp/cloudbuild.yaml");
    const section = cloudBuild
      .split("  - id: platform-contract-tests\n")[1]
      .split("  - id: build-api\n")[0];
    const command = section.match(/^        pnpm run (test:[\w-]+)$/m)?.[1];
    assert.equal(command, "test:gcp-build-source");
    const manifest = JSON.parse(
      readFileSync(join(source, "package.json"), "utf8"),
    );
    const args = manifest.scripts[command].split(" ");
    assert.deepEqual(args, [
      "node",
      "--test",
      "deploy/gcp/build-inputs.test.mjs",
      "deploy/gcp/container-contract.test.mjs",
    ]);
    assert.match(
      section,
      /node artifacts\/samra-pay-ds\/scripts\/check-source-boundary\.mjs/,
    );
    assert.match(section, /pnpm run typecheck/);

    // The runtime validation must not inherit host Git, gcloud, credentials,
    // installed workspace dependencies, or the parent repository's metadata.
    symlinkSync(process.execPath, join(bin, "node"));
    for (const commandArgs of [
      ["artifacts/samra-pay-ds/scripts/check-source-boundary.mjs"],
      args.slice(1),
    ]) {
      const result = spawnSync(process.execPath, commandArgs, {
        cwd: source,
        env: { PATH: bin, GIT_CEILING_DIRECTORIES: folder },
        encoding: "utf8",
        timeout: 60_000,
        maxBuffer: 1024 * 1024,
      });
      assert.equal(result.status, 0, result.stdout + result.stderr);
      if (commandArgs[0] === "--test")
        assert.match(result.stdout, /(?:#|ℹ) fail 0/);
    }
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test("the complete platform suite remains required before Cloud Build authentication", () => {
  for (const path of [
    ".github/workflows/ci.yml",
    ".github/workflows/release-candidate.yml",
  ])
    assert.match(read(path), /pnpm run test:gcp-platform/);
  const publication = read(".github/workflows/staging-image-publication.yml");
  const lineage = publication.indexOf(
    "Verify release-candidate lineage before Google authentication",
  );
  const authentication = publication.indexOf(
    "Obtain short-lived Google credentials",
  );
  assert.ok(lineage >= 0 && authentication > lineage);
  const manifest = JSON.parse(read("package.json"));
  assert.equal(
    manifest.scripts["test:gcp-platform"],
    "node --test deploy/gcp/*.test.mjs",
  );
});
