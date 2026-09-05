import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

// Exercise the packaged CLI and its imports without credentials or a database.
// Missing arguments must reach its usage check, rather than fail to load.
const result = spawnSync(
  process.execPath,
  ["--import", "tsx", "src/staging-database-access-cli.ts"],
  {
    cwd: new URL("../../lib/db/", import.meta.url),
    env: { NODE_ENV: "production" },
    encoding: "utf8",
    timeout: 10_000,
  },
);

assert.ifError(result.error);
assert.equal(result.status, 1, result.stderr);
assert.match(
  result.stderr,
  /Error: Usage: staging-database-access-cli\.ts <bootstrap\|finalize\|audit-migration\|audit-runtime>/,
);
console.log("STAGING DATABASE ACCESS RUNTIME PASS");
