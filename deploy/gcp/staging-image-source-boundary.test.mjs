import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const gcloudIgnore = await readFile(".gcloudignore", "utf8");
const dockerIgnore = await readFile(".dockerignore", "utf8");
const controller = await readFile(
  "deploy/gcp/publish-staging-images.sh",
  "utf8",
);

test("uses one explicit Cloud Build upload boundary", () => {
  assert.equal(
    gcloudIgnore,
    ".gcloudignore\n.gitignore\n#!include:.dockerignore\n!.gcloudignore\n!/.github/\n/.github/*\n!/.github/workflows/\n/.github/workflows/*\n!/.github/workflows/container-portability.yml\n",
  );
  assert.ok(controller.includes('--ignore-file="${ROOT_DIR}/.gcloudignore"'));
  assert.equal(
    controller.match(/--ignore-file=/g)?.length,
    1,
    "the build must have exactly one explicit upload boundary",
  );
});

test("excludes credentials, local state, dependencies, and unreviewed assets", () => {
  for (const pattern of [
    ".git",
    ".github",
    ".gcloudignore",
    ".replit",
    ".cache",
    ".turbo",
    "**/node_modules",
    "**/dist",
    "**/test-results",
    "**/coverage",
    "attached_assets/*",
    "work",
    "*.log",
    ".env",
    ".env.*",
    ".npmrc",
    "*.pem",
    "*.key",
    "*.p12",
    "*.pfx",
    "credentials*.json",
    "service-account*.json",
  ]) {
    assert.ok(dockerIgnore.split("\n").includes(pattern), pattern);
  }
});

test("discloses every durable first-build side effect before authorization", () => {
  const disclosure = controller.indexOf(
    "creates a Cloud Build record,\nstores logs and provenance, may create or reuse Google-managed source-staging",
  );
  const authorization = controller.indexOf(
    '[[ "${SAMRA_GCP_IMAGE_BUILD_APPLY}" == "${AUTHORIZATION}" ]]',
  );
  assert.ok(disclosure >= 0);
  assert.ok(authorization > disclosure);
  assert.match(
    controller,
    /Cloud Build staging storage, records, logs, and provenance may remain/,
  );
});
