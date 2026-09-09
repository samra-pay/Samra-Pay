import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
const sha = "a".repeat(40);
function run(project, source = sha, failBuild = false) {
  const dir = mkdtempSync(path.join(tmpdir(), "samra-build-contract-"));
  try {
    const log = path.join(dir, "calls");
    writeFileSync(
      path.join(dir, "docker"),
      '#!/usr/bin/env node\nconst fs=require("fs");fs.appendFileSync(process.env.CALL_LOG,JSON.stringify(process.argv.slice(2))+"\\n");if(process.env.FAIL_BUILD==="true" && process.argv[2]==="build") process.exit(1);\n',
      { mode: 0o755 },
    );
    const result = spawnSync(
      "bash",
      ["deploy/gcp/publish-dev-test-images.sh"],
      {
        env: {
          ...process.env,
          PATH: `${dir}:${process.env.PATH}`,
          BUILD_PROJECT: project,
          SOURCE_SHA: source,
          CALL_LOG: log,
          FAIL_BUILD: String(failBuild),
        },
        encoding: "utf8",
      },
    );
    let calls = [];
    try {
      calls = readFileSync(log, "utf8").trim().split("\n").map(JSON.parse);
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    return { status: result.status, calls };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
test("publication rejects non-synthetic projects and mutable refs before Docker access", () => {
  for (const project of [
    "samra-pay-staging",
    "samra-pay-production",
    "other",
    "",
  ]) {
    const result = run(project);
    assert.equal(result.status, 64);
    assert.deepEqual(result.calls, []);
  }
  for (const source of ["main", "latest", "a".repeat(39), "A".repeat(40), ""]) {
    const result = run("samra-pay-dev", source);
    assert.equal(result.status, 64);
    assert.deepEqual(result.calls, []);
  }
});
test("each environment publishes only its three labeled runtime images and customer build", () => {
  for (const env of ["dev", "test"]) {
    const result = run(`samra-pay-${env}`);
    assert.equal(result.status, 0);
    assert.equal(result.calls.length, 6);
    const names = ["api", "customer-web", "migrations"];
    for (let i = 0; i < 3; i++) {
      const build = result.calls[i * 2];
      const ref = `us-east4-docker.pkg.dev/samra-pay-${env}/samra-${env}/samra-${names[i]}:${sha}`;
      assert.equal(build[0], "build");
      assert.ok(build.includes(`--tag=${ref}`));
      assert.ok(
        build.includes(`--label=org.opencontainers.image.revision=${sha}`),
      );
      assert.equal(build.includes("SAMRA_WEB_SURFACE=legacy"), i === 1);
      assert.deepEqual(result.calls[i * 2 + 1], ["push", ref]);
    }
  }
});
test("failed builds do not push or proceed to another image", () => {
  const result = run("samra-pay-dev", sha, true);
  assert.equal(result.status, 1);
  assert.equal(result.calls.length, 1);
  assert.equal(result.calls[0][0], "build");
});
