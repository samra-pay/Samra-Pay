import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("missing API stops revision-probe setup before any IAM mutation", async () => {
  const directory = await mkdtemp(join(tmpdir(), "samra-probe-preflight-"));
  const log = join(directory, "calls.jsonl");
  try {
    await writeFile(
      join(directory, "git"),
      `#!/usr/bin/env node
if (process.argv.includes('rev-parse')) console.log('a'.repeat(40));
else if (!process.argv.includes('status')) process.exit(98);
`,
      { mode: 0o700 },
    );
    await writeFile(
      join(directory, "gcloud"),
      `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.SAMRA_TEST_CLOUD_CALLS, JSON.stringify(args) + '\\n');
if (args.join(' ') === 'config get-value account') console.log('operator@davidhaile.com');
else if (args.join(' ') === 'config get-value project') console.log('samra-pay-staging');
else if (args[0] === 'projects' && args[1] === 'describe')
  console.log(args.includes('--format=value(projectNumber)') ? '934122615631' : '993968777863');
else if (args.slice(0, 4).join(' ') === 'run services describe samra-api') {
  console.error('Synthetic API service is missing'); process.exit(1);
} else { console.error('Unexpected cloud command'); process.exit(98); }
`,
      { mode: 0o700 },
    );
    const result = spawnSync(
      "bash",
      ["deploy/gcp/activate-staging-revision-probe-federation.sh", "--apply"],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${directory}:${process.env.PATH}`,
          SAMRA_TEST_CLOUD_CALLS: log,
          SAMRA_GCP_OPERATOR_ACCOUNT: "operator@davidhaile.com",
          SAMRA_GCP_EXPECTED_SHA: "a".repeat(40),
          SAMRA_GCP_REVISION_PROBE_FEDERATION_APPLY:
            "AUTHORIZED_STAGING_REVISION_PROBE_FEDERATION",
        },
      },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Synthetic API service is missing/);
    const calls = (await readFile(log, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.deepEqual(calls.at(-1).slice(0, 4), [
      "run",
      "services",
      "describe",
      "samra-api",
    ]);
    assert.ok(
      calls.every(
        (args) =>
          !args.some((arg) =>
            [
              "create",
              "create-oidc",
              "enable",
              "add-iam-policy-binding",
            ].includes(arg),
          ),
      ),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
