import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { FOUNDATION } from "./staging-migration-foundation.mjs";

// Google IAM limits pool and provider displayName to 32 characters. Service
// account display names have a different limit and are deliberately excluded.
// https://docs.cloud.google.com/iam/docs/reference/rest/v1/projects.locations.workloadIdentityPools
// https://docs.cloud.google.com/iam/docs/reference/rest/v1/projects.locations.workloadIdentityPools.providers
test("all federation creation commands respect Google IAM display-name limits", async () => {
  const files = (await readdir("deploy/gcp")).filter(
    (file) => file.startsWith("activate-") && file.endsWith(".sh"),
  );
  let checked = 0;
  for (const file of files) {
    const source = await readFile(`deploy/gcp/${file}`, "utf8");
    const variables = Object.fromEntries(
      [...source.matchAll(/^([A-Z_]+)="([^"$]*)"$/gm)].map((match) => [
        match[1],
        match[2],
      ]),
    );
    const commands = source.replace(/\\\n\s*/g, " ");
    for (const match of commands.matchAll(
      /gcloud iam workload-identity-pools (?:providers create-oidc|create) [^\n]+/g,
    )) {
      const argument = match[0].match(/--display-name="([^"]+)"/)?.[1];
      assert.ok(argument, `${file}: creation command needs a reviewed name`);
      const variable = argument.match(/^\$\{([A-Z_]+)\}$/)?.[1];
      const name = variable ? variables[variable] : argument;
      assert.ok(
        name && !name.includes("$"),
        `${file}: unresolved display name`,
      );
      assert.ok(
        [...name].length <= 32,
        `${file}: display name exceeds Google IAM's 32-character limit: ${name}`,
      );
      checked += 1;
    }
  }
  assert.ok(checked > 0, "No federation creation commands were checked");
  assert.ok([...FOUNDATION.poolDisplayName].length <= 32);
});
