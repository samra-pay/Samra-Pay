import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  buildOperationalReadinessReport,
  requireProductionReadiness,
} from "../../scripts/src/validate-operational-readiness.ts";

const read = (path) => readFileSync(path, "utf8");
const contract = JSON.parse(read("docs/operations/operational-readiness.json"));
const inputs = {
  evidencePathExists: existsSync,
  backendResilienceWorkflow: read(".github/workflows/backend-resilience.yml"),
  apiPackage: JSON.parse(read("artifacts/api-server/package.json")),
  scriptsPackage: JSON.parse(read("scripts/package.json")),
  workspacePackage: JSON.parse(read("package.json")),
};
const provenance = {
  candidateSha: "a".repeat(40),
  checkedOutSha: "a".repeat(40),
  sourceTreeClean: true,
  observedAt: "2026-09-05T00:00:00.000Z",
};

test("readiness evidence retains every blocker and cannot be overwritten by caller fields", () => {
  const report = buildOperationalReadinessReport(contract, inputs, {
    ...provenance,
    productionReady: true,
    deploymentAuthorized: true,
  });
  assert.equal(report.productionReady, false);
  assert.equal(report.deploymentAuthorized, false);
  assert.equal(report.status, "production-blocked");
  assert.equal(report.pillars.length, 5);
  assert.deepEqual(report.hardStops, contract.hardStops);
  assert.match(report.contractSha256, /^[0-9a-f]{64}$/);
  assert.equal(
    buildOperationalReadinessReport(contract, inputs, {
      ...provenance,
      sourceTreeClean: false,
    }).evidenceEligible,
    false,
  );
});

test("wrong SHA, malformed provenance and unsupported approval never produce readiness evidence", () => {
  for (const change of [
    { candidateSha: "main" },
    { checkedOutSha: "b".repeat(40) },
    { observedAt: "yesterday" },
    { sourceTreeClean: "true" },
  ])
    assert.throws(() =>
      buildOperationalReadinessReport(contract, inputs, {
        ...provenance,
        ...change,
      }),
    );
  assert.throws(
    () => requireProductionReadiness(contract, inputs),
    /claim rejected/,
  );
  assert.throws(() =>
    requireProductionReadiness(
      { ...contract, productionApproval: "approved" },
      inputs,
    ),
  );
  assert.throws(() =>
    requireProductionReadiness({ ...contract, hardStops: [] }, inputs),
  );
});

test("CLI binds evidence to checkout, refuses overwrite and rejects a production-ready claim", () => {
  const folder = mkdtempSync(join(tmpdir(), "samra-readiness-report-"));
  const output = join(folder, "report.json");
  const sha = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  const script = "scripts/src/validate-operational-readiness.ts";
  try {
    execFileSync(process.execPath, [
      script,
      "--report",
      output,
      "--candidate-sha",
      sha,
    ]);
    assert.equal(JSON.parse(read(output)).candidateSha, sha);
    assert.throws(() =>
      execFileSync(
        process.execPath,
        [script, "--report", output, "--candidate-sha", sha],
        { stdio: "pipe" },
      ),
    );
    const claim = spawnSync(
      process.execPath,
      [script, "--claim", "production-ready"],
      { encoding: "utf8" },
    );
    assert.equal(claim.status, 2);
    assert.match(claim.stderr, /operational readiness remains blocked/);
    for (const args of [
      ["--unknown"],
      ["--report", output],
      ["--claim", "staging-ready"],
    ]) {
      assert.equal(
        spawnSync(process.execPath, [script, ...args], { encoding: "utf8" })
          .status,
        1,
      );
    }
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test("required CI creates and retains commit-bound readiness evidence before the build", () => {
  const workflow = read(".github/workflows/ci.yml");
  const start = workflow.indexOf(
    "      - name: Record operational readiness without production approval",
  );
  const end = workflow.indexOf("      - name: Typecheck workspace", start);
  assert.ok(start > 0 && end > start);
  const steps = workflow.slice(start, end);
  assert.match(steps, /node scripts\/src\/validate-operational-readiness\.ts/);
  assert.match(steps, /--candidate-sha "\$\{GITHUB_SHA\}" --require-clean/);
  assert.match(steps, /if-no-files-found: error/);
  assert.match(steps, /path: tmp\/operational-readiness\.json/);
  assert.doesNotMatch(steps, /continue-on-error:|\sif:/);
});
