import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("native session controls preserve ingress, drain and revision boundaries", () => {
  const result = spawnSync(
    "python3",
    ["-B", "deploy/gcp/dev-test-session-tests.py"],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
test("optimized Python cannot bypass activation validation", () => {
  const result = spawnSync(
    "python3",
    ["-B", "-O", "deploy/gcp/activate-dev-test.py", "--help"],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Activation stopped/);
});
