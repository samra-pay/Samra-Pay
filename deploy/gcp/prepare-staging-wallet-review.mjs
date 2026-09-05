import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const SHA = /^[0-9a-f]{40}$/;
const JOURNAL = "lib/db/drizzle/meta/_journal.json";
export const REVIEW_FILES = Object.freeze([
  JOURNAL,
  "pnpm-lock.yaml",
  "artifacts/api-server/src/config.ts",
  "artifacts/api-server/src/domain/crossmint-customer-sandbox.ts",
  "lib/db/src/staging-database-access.ts",
  "deploy/gcp/Dockerfile.api",
  "deploy/gcp/Dockerfile.migrate",
  "deploy/gcp/staging-runtime-contract.json",
  "deploy/gcp/staging-database-access.json",
  "deploy/gcp/activate-staging-database-access.sh",
  "deploy/gcp/staging-zero-traffic-deployment.json",
  "deploy/gcp/staging-release-control-plane.json",
  "deploy/gcp/verify-github-upstream-artifact.mjs",
  "deploy/gcp/run-staging-migrations.mjs",
  "deploy/gcp/staging-migration-evidence.mjs",
  "deploy/gcp/verify-staging-migration-prerequisite.mjs",
  "lib/db/staging-migrate.mjs",
  ".github/workflows/staging-migrations.yml",
  ".github/workflows/staging-zero-traffic-deployment.yml",
  "docs/operations/staging-wallet-deployment-package.md",
]);

// This is a source inventory, never a deployment eligibility verifier. It does
// not accept credentials, operator assertions of live success, or apply flags.
export function buildWalletReview({ candidateSha, readCommittedFile }) {
  assert(SHA.test(candidateSha), "A full lowercase candidate SHA is required");
  const files = new Map(
    REVIEW_FILES.map((path) => [path, readCommittedFile(path)]),
  );
  const json = (path) => JSON.parse(files.get(path).toString("utf8"));
  const journal = json(JOURNAL);
  assert(journal.dialect === "postgresql", "PostgreSQL journal required");
  assert(
    Array.isArray(journal.entries) && journal.entries.length > 0,
    "Migration journal is empty",
  );
  const migrations = journal.entries.map((entry, index) => {
    assert(
      entry.idx === index && /^\d{4}_[a-z0-9_]+$/.test(entry.tag),
      "Migration journal sequence is invalid",
    );
    assert(
      entry.tag.startsWith(`${String(index).padStart(4, "0")}_`),
      "Migration filename order drifted",
    );
    const path = `lib/db/drizzle/${entry.tag}.sql`;
    const content = readCommittedFile(path);
    assert(content.length > 0, "Migration is empty");
    files.set(path, content);
    return { index, path, sha256: sha256(content) };
  });
  assert(
    migrations.some(({ path }) =>
      path.endsWith("/0017_customer_controlled_sandbox_wallets.sql"),
    ),
    "Customer wallet migration 0017 is missing",
  );
  const runtime = json("deploy/gcp/staging-runtime-contract.json");
  const deployment = json("deploy/gcp/staging-zero-traffic-deployment.json");
  const release = json("deploy/gcp/staging-release-control-plane.json");
  const fileHashes = [...files].map(([path, content]) => ({
    path,
    sha256: sha256(content),
  }));
  return {
    schemaVersion: 1,
    status: "prepared-review-only",
    deploymentAuthorized: false,
    deploymentEligibilityEvaluated: false,
    liveCloudInspected: false,
    candidateSha,
    sourceRepository: release.source.repository,
    projectId: "samra-pay-staging",
    projectNumber: "934122615631",
    region: "us-east4",
    sourceInventorySha256: sha256(JSON.stringify(fileHashes)),
    files: fileHashes,
    migrations,
    observedRepositoryControls: {
      dataClassification: runtime.dataClassification,
      apiWorkerSetting:
        runtime.services["samra-api"].environment.SAMRA_RUN_WORKER,
      apiDeploymentStatus: deployment.services["samra-api"].executionStatus,
      migrationProducerStatus:
        release.upstreamArtifactVerification.apiMigrationProducerStatus,
      bootstrapUsesLatestSecretVersion: /:latest/.test(
        files
          .get("deploy/gcp/activate-staging-database-access.sh")
          .toString("utf8"),
      ),
    },
    requiredEvidenceBeforeExecution: [
      "reviewed-main-SHA-and-successful-required-checks",
      "governed-same-SHA-image-publication-and-migration-artifact-identities",
      "fresh-private-SQL-TLS-backup-and-least-privilege-access-audit",
      "pinned-numeric-database-and-restricted-Crossmint-secret-versions",
      "reviewed-one-customer-runtime-and-data-classification-contract",
      "Auth0-issuer-audience-and-authenticated-opaque-customer-mapping",
      "approved-identity-case-and-customer-sandbox-consent",
      "private-invoker-path-with-dual-Google-and-customer-authentication",
      "first-deployment-abort-and-temporary-probe-cleanup-evidence",
      "bounded-expiring-approval-and-complete-incremental-cost-estimate",
    ],
    // A successful local packet build cannot turn an unknown cloud state green.
    imageDigests: null,
    secretVersions: null,
    cloudMigrationExecution: null,
    cloudDeployment: null,
    customerWalletProvisioning: null,
    approvedIncrementalSpendUsd: null,
  };
}

export function reviewWalletRepository({ cwd = process.cwd(), expectedSha }) {
  assert(SHA.test(expectedSha), "A full lowercase candidate SHA is required");
  const git = (args) =>
    execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  assert(
    git(["rev-parse", "HEAD"]).trim() === expectedSha,
    "Checkout does not match the candidate SHA",
  );
  assert(
    git(["status", "--porcelain", "--untracked-files=normal"]).trim() === "",
    "Commit or remove local changes before generating review evidence",
  );
  return buildWalletReview({
    candidateSha: expectedSha,
    readCommittedFile: (path) => git(["show", `${expectedSha}:${path}`]),
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    assert(
      process.argv.length === 4 && process.argv[2] === "--candidate-sha",
      "Usage: node deploy/gcp/prepare-staging-wallet-review.mjs --candidate-sha FULL_GIT_SHA",
    );
    console.log(
      JSON.stringify(
        reviewWalletRepository({ expectedSha: process.argv[3] }),
        null,
        2,
      ),
    );
  } catch {
    // Do not echo Git stderr, file contents, or a mistakenly supplied credential.
    console.error(
      "STOP: review needs --candidate-sha FULL_GIT_SHA, a matching clean checkout, and valid committed package inputs. No cloud action was attempted.",
    );
    process.exitCode = 1;
  }
}
