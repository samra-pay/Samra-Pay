import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import {
  buildWalletReview,
  reviewWalletRepository,
  REVIEW_FILES,
} from "./prepare-staging-wallet-review.mjs";

const candidateSha = "a".repeat(40);
const read = (path) => readFileSync(path, "utf8");
const build = (readCommittedFile = read) =>
  buildWalletReview({ candidateSha, readCommittedFile });

test("packet records source restrictions without claiming cloud readiness", () => {
  const packet = build();
  assert.equal(packet.candidateSha, candidateSha);
  assert.equal(packet.migrations.length, 22);
  assert.equal(
    packet.observedRepositoryControls.apiDeploymentStatus,
    "requires-governed-migration-evidence",
  );
  assert.equal(packet.observedRepositoryControls.apiWorkerSetting, "false");
  assert.equal(
    packet.observedRepositoryControls.bootstrapUsesLatestSecretVersion,
    false,
  );
  assert.equal(
    packet.observedRepositoryControls.migrationProducerStatus,
    "implemented-execution-and-federation-not-authorized",
  );
  assert.equal(packet.status, "prepared-review-only");
  assert.equal(packet.deploymentAuthorized, false);
  assert.equal(packet.deploymentEligibilityEvaluated, false);
  assert.equal(packet.liveCloudInspected, false);
  for (const key of [
    "imageDigests",
    "secretVersions",
    "cloudMigrationExecution",
    "cloudDeployment",
    "customerWalletProvisioning",
    "approvedIncrementalSpendUsd",
  ]) {
    assert.equal(packet[key], null);
  }
});

test("source and migration hashes change when committed migration bytes change", () => {
  const before = build();
  const after = build(
    (path) =>
      read(path) +
      (path.endsWith("0021_customer_wallet_control_setup.sql")
        ? "\n-- reviewed amendment\n"
        : ""),
  );
  assert.notEqual(before.sourceInventorySha256, after.sourceInventorySha256);
  assert.notEqual(
    before.migrations.at(-1).sha256,
    after.migrations.at(-1).sha256,
  );
  assert.deepEqual(
    before.migrations.slice(0, -1),
    after.migrations.slice(0, -1),
  );
  assert.deepEqual(build(), before);
});

test("rejects missing, empty, reordered and path-traversing migrations", () => {
  assert.throws(
    () =>
      build((path) =>
        path.endsWith("0020_marketing_activation.sql") ? "" : read(path),
      ),
    /empty/,
  );
  for (const change of [
    // Removing the required wallet migration must still fail as later migrations are added.
    (journal) => journal.entries.splice(17),
    (journal) => {
      journal.entries[0].tag = "../../outside";
    },
    (journal) => journal.entries.reverse(),
  ]) {
    assert.throws(() =>
      build((path) => {
        if (!path.endsWith("_journal.json")) return read(path);
        const journal = JSON.parse(read(path));
        change(journal);
        return JSON.stringify(journal);
      }),
    );
  }
});

test("hashes file contents without copying possible credentials into the packet", () => {
  const marker = "DO_NOT_PRINT_TEST_CREDENTIAL";
  const packet = build(
    (path) => read(path) + (path.endsWith("config.ts") ? marker : ""),
  );
  assert.equal(JSON.stringify(packet).includes(marker), false);
});

test("a changed repository control never becomes deployment authorization", () => {
  const packet = build((path) => {
    if (!path.endsWith("staging-zero-traffic-deployment.json"))
      return read(path);
    const contract = JSON.parse(read(path));
    contract.services["samra-api"].executionStatus = "some-future-status";
    return JSON.stringify(contract);
  });
  assert.equal(
    packet.observedRepositoryControls.apiDeploymentStatus,
    "some-future-status",
  );
  assert.equal(packet.deploymentAuthorized, false);
  assert.equal(packet.deploymentEligibilityEvaluated, false);
});

test("repository review binds a clean checkout to exact committed bytes", () => {
  const cwd = mkdtempSync(join(tmpdir(), "samra-wallet-packet-"));
  const git = (...args) =>
    execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  try {
    for (const path of [
      ...REVIEW_FILES,
      ...build().migrations.map((entry) => entry.path),
    ]) {
      mkdirSync(dirname(join(cwd, path)), { recursive: true });
      writeFileSync(join(cwd, path), read(path));
    }
    git("init", "-q");
    git("add", ".");
    git(
      "-c",
      "user.name=Packet Test",
      "-c",
      "user.email=packet@example.invalid",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "-qm",
      "fixture",
    );
    const expectedSha = git("rev-parse", "HEAD");
    const packet = reviewWalletRepository({ cwd, expectedSha });
    assert.equal(packet.candidateSha, expectedSha);
    assert.deepEqual(packet.files, build().files);
    assert.throws(
      () => reviewWalletRepository({ cwd, expectedSha: "main" }),
      /full lowercase/,
    );
    assert.throws(
      () => reviewWalletRepository({ cwd, expectedSha: candidateSha }),
      /does not match/,
    );
    writeFileSync(join(cwd, "untracked.txt"), "unfinished work");
    assert.throws(
      () => reviewWalletRepository({ cwd, expectedSha }),
      /local changes/,
    );
    rmSync(join(cwd, "untracked.txt"));
    writeFileSync(join(cwd, REVIEW_FILES[1]), "changed lockfile");
    assert.throws(
      () => reviewWalletRepository({ cwd, expectedSha }),
      /local changes/,
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
