import assert from "node:assert/strict";
import {
  copyFile,
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { run } from "./bundle.mjs";

test(
  "actual public build survives packaging, isolated reconstruction and trusted budgets",
  { skip: process.env.SAMRA_PREVIEW_BUILD_SMOKE !== "true" },
  async () => {
    const identity = {
      sha: "a".repeat(40),
      pr: 147,
      runId: 123,
      runAttempt: 1,
    };
    await run("pack", {
      PREVIEW_SHA: identity.sha,
      PREVIEW_PR: "147",
      GITHUB_RUN_ID: "123",
      GITHUB_RUN_ATTEMPT: "1",
    });
    const root = await mkdtemp(path.join(os.tmpdir(), "samra-preview-build-"));
    await mkdir(path.join(root, "download"));
    await copyFile(
      "tmp/public-site-preview/bundle.json",
      path.join(root, "download/bundle.json"),
    );
    await writeFile(path.join(root, "identity.json"), JSON.stringify(identity));
    await run("verify", { PREVIEW_ROOT: root });
    const report = JSON.parse(
      await readFile(path.join(root, "budgets.json"), "utf8"),
    );
    assert.equal(report.status, "passed");
    assert.equal(report.results.length, 12);
    assert.equal(report.candidateSha, identity.sha);
    await assert.rejects(run("verify", { PREVIEW_ROOT: root }), /EEXIST/);
  },
);
