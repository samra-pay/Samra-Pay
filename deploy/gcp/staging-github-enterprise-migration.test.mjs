import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  findOperationalAuthorityReferences,
  findFormerAuthorityReferences,
  readStagingGithubEnterpriseMigration,
  validateStagingGithubEnterpriseMigration,
} from "./validate-staging-github-enterprise-migration.mjs";

import {
  readStagingGithubFederation,
  validateStagingGithubFederation,
} from "./validate-staging-github-federation.mjs";
import {
  readProductionFoundationPreflight,
  validateProductionFoundationPreflight,
} from "./validate-production-foundation-preflight.mjs";
import {
  readStagingZeroTrafficDeployment,
  validateStagingZeroTrafficDeployment,
} from "./validate-staging-zero-traffic-deployment.mjs";
import {
  readStagingTrafficControl,
  validateStagingTrafficControl,
} from "./validate-staging-traffic-control.mjs";

const root = process.cwd();
const contract = readStagingGithubEnterpriseMigration();

test("validates completed GitHub transfer while cloud and release remain blocked", () => {
  assert.deepEqual(
    validateStagingGithubEnterpriseMigration(contract, { root }),
    {
      schemaVersion: 2,
      status: "validated-github-transferred-cloud-cutover-pending",
      operatingModel: "solo-founder",
      activeRepository: contract.repository.activeAuthority.nameWithOwner,
      targetRepository: contract.repository.targetAuthority.nameWithOwner,
      stableRepositoryId: contract.repository.stableId,
      targetOwnerId: contract.repository.targetAuthority.ownerId,
      accountRecoveryReadiness: "verified",
      twoFactorAuthenticationEnabled: true,
      passkeyOrSecurityKeyConfigured: true,
      blockerCount: 4,
      currentAuthorityFileCount:
        contract.operationalReferences.currentAuthorityFiles.length,
      transferAuthorized: true,
      cloudTrustApplyAuthorized: false,
      releaseResumptionAuthorized: false,
    },
  );
});

test("inventories the entire source tree and rejects remaining personal authority", () => {
  assert.deepEqual(
    findOperationalAuthorityReferences(root, contract),
    contract.operationalReferences.currentAuthorityFiles,
  );
  assert.deepEqual(findFormerAuthorityReferences(root, contract), []);
});

test("rejects wrong authority, premature activation and weakened governance", () => {
  for (const mutate of [
    (value) => (value.status = "authorized"),
    (value) => (value.transfer.authorized = false),
    (value) =>
      (value.repository.activeAuthority = value.repository.previousAuthority),
    (value) => (value.repository.stableId = "1"),
    (value) => (value.repository.activeAuthority.ownerId = "237485986"),
    (value) => (value.cloudTrustCutover.applyAuthorized = true),
    (value) => (value.cloudTrustCutover.liveReadbackVerified = true),
    (value) => (value.cloudTrustCutover.dualOwnerTrustAllowed = true),
    (value) => (value.transfer.releaseResumptionAuthorized = true),
    (value) => (value.transfer.releaseFreezeApplied = false),
    (value) => value.transfer.evidencePaths.pop(),
    (value) => (value.operationalReferences.scanRoots = ["deploy/gcp"]),
    (value) =>
      value.operationalReferences.migrationControlFiles.push(
        "scripts/notion/sync.mjs",
      ),
    (value) => (value.governance.operatingModel = "multi-operator"),
    (value) => (value.governance.minimumActiveOrganizationOwners = 2),
    (value) => (value.governance.placeholderOrSharedOwnerAllowed = true),
    (value) => (value.governance.independentStagingApproverRequired = true),
    (value) => (value.governance.requiredEnvironmentReviewerConfigured = true),
    (value) => (value.governance.requiredAutomatedChecks = false),
    (value) =>
      (value.governance.accountRecovery.minimumAuthenticationMethods = 1),
    (value) => (value.governance.baseRepositoryPermission = "read"),
    (value) => (value.observedEnterpriseState.billingStatus = "trial"),
    (value) =>
      (value.observedEnterpriseState.twoFactorAuthenticationEnabled = false),
    (value) =>
      (value.observedEnterpriseState.recoveryCodesGeneratedAndViewed = false),
    (value) =>
      (value.observedEnterpriseState.passkeyOrSecurityKeyConfigured = false),
    (value) => value.blockingGates.pop(),
    (value) => value.cutoverOrder.reverse(),
  ]) {
    const changed = structuredClone(contract);
    mutate(changed);
    assert.throws(() => validateStagingGithubEnterpriseMigration(changed));
  }
});

test("detects stale authority outside deploy roots and in escaped URL expressions", () => {
  const fixture = mkdtempSync(join(tmpdir(), "samra-authority-scan-"));
  try {
    const files = [
      "artifacts/api-server/test/recovery.ts",
      "lib/new-owner.ts",
      "scripts/notion/url.mjs",
      "root-control.json",
    ];
    for (const [index, file] of files.entries()) {
      mkdirSync(join(fixture, file, ".."), { recursive: true });
      writeFileSync(
        join(fixture, file),
        index === 2
          ? "const url = /haileleuld87\\/Samra-Pay/;"
          : 'const repo = "haileleuld87/Samra-Pay";',
      );
    }
    assert.deepEqual(
      findFormerAuthorityReferences(fixture, contract),
      [...files].sort(),
    );
    writeFileSync(
      join(fixture, "root-control.json"),
      '{"ownerId":237_485_986}',
    );
    assert.ok(
      findFormerAuthorityReferences(fixture, contract).includes(
        "root-control.json",
      ),
    );
    writeFileSync(
      join(fixture, "root-control.json"),
      '{"owner":"haileleuld87"}',
    );
    assert.ok(
      findFormerAuthorityReferences(fixture, contract).includes(
        "root-control.json",
      ),
    );
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("historical lines do not exempt new executable authority in the same file", () => {
  const fixture = mkdtempSync(join(tmpdir(), "samra-authority-history-"));
  try {
    const changed = structuredClone(contract);
    const line =
      "[Past run](https://github.com/haileleuld87/Samra-Pay/actions/runs/123)";
    changed.operationalReferences.historicalReferences = [
      { path: "record.md", line, reason: "Dated evidence" },
    ];
    writeFileSync(join(fixture, "record.md"), line + "\n");
    assert.deepEqual(findFormerAuthorityReferences(fixture, changed), []);
    writeFileSync(
      join(fixture, "record.md"),
      line + '\nconst repo = "haileleuld87/Samra-Pay";\n',
    );
    assert.deepEqual(findFormerAuthorityReferences(fixture, changed), [
      "record.md",
    ]);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("runs an offline review without mutating GitHub or Google Cloud", () => {
  const output = execFileSync(
    process.execPath,
    ["deploy/gcp/review-staging-github-enterprise-migration.mjs", "--review"],
    { encoding: "utf8" },
  );
  assert.match(output, /READ-ONLY GITHUB ENTERPRISE MIGRATION REVIEW PASS/);
  assert.match(output, /validated-github-transferred-cloud-cutover-pending/);
  assert.match(output, /Operating model: solo-founder/);
  assert.match(
    output,
    /Account recovery: verified; 2FA: enabled; passkey\/security key: configured/,
  );
  assert.match(
    output,
    /Operational authority references inventoried: [1-9][0-9]*/,
  );
  assert.match(
    output,
    /RECORDED GITHUB TRANSFER COMPLETE; CLOUD CUTOVER PENDING/,
  );
  assert.match(output, /CLOUD APPLY AND RELEASE RESUMPTION NOT AUTHORIZED/);
  assert.doesNotMatch(output, /APPLIED|TRUST UPDATED/);
});

test("federation contracts reject former-owner, wildcard and dual-owner trust", () => {
  for (const [read, validate, conditionKey] of [
    [
      readStagingGithubFederation,
      validateStagingGithubFederation,
      "attributeCondition",
    ],
    [
      readProductionFoundationPreflight,
      validateProductionFoundationPreflight,
      "attributeCondition",
    ],
    [
      readStagingZeroTrafficDeployment,
      validateStagingZeroTrafficDeployment,
      "attributeCondition",
    ],
    [
      readStagingTrafficControl,
      validateStagingTrafficControl,
      "commonCondition",
    ],
  ]) {
    const expected = read();
    assert.doesNotThrow(() => validate(expected));
    for (const mutate of [
      (value) => {
        value.github.owner = contract.repository.previousAuthority.ownerLogin;
      },
      (value) => {
        value.github.repositoryOwnerId =
          contract.repository.previousAuthority.ownerId;
      },
      (value) => {
        value.provider[conditionKey] = "true";
      },
      (value) => {
        value.provider[conditionKey] +=
          " || assertion.repository_owner_id=='237485986'";
      },
      (value) => {
        value.provider[conditionKey] = value.provider[conditionKey].replace(
          "refs/heads/main",
          "refs/heads/*",
        );
      },
      (value) => {
        value.provider[conditionKey] = value.provider[conditionKey].replace(
          "workflow_dispatch",
          "pull_request",
        );
      },
    ]) {
      const changed = structuredClone(expected);
      mutate(changed);
      assert.throws(() => validate(changed), read.name);
    }
  }
});

test("Git inventory excludes ignored local data but still covers tracked and new source", () => {
  const fixture = mkdtempSync(join(tmpdir(), "samra-authority-git-"));
  try {
    execFileSync("git", ["init", "--quiet", fixture]);
    writeFileSync(join(fixture, ".gitignore"), ".env\ntmp/\n");
    writeFileSync(join(fixture, ".env"), "REPO=haileleuld87/Samra-Pay");
    mkdirSync(join(fixture, "tmp"));
    writeFileSync(
      join(fixture, "tmp/evidence.json"),
      '{"repository":"samra-pay/Samra-Pay"}',
    );
    assert.deepEqual(findFormerAuthorityReferences(fixture, contract), []);
    assert.deepEqual(findOperationalAuthorityReferences(fixture, contract), []);
    writeFileSync(
      join(fixture, "source.mjs"),
      'const repo="haileleuld87/Samra-Pay";',
    );
    assert.deepEqual(findFormerAuthorityReferences(fixture, contract), [
      "source.mjs",
    ]);
    execFileSync("git", ["-C", fixture, "add", "--force", "tmp/evidence.json"]);
    assert.deepEqual(findOperationalAuthorityReferences(fixture, contract), [
      "tmp/evidence.json",
    ]);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("release evidence does not enter Git authority inventory or hide source", () => {
  const fixture = mkdtempSync(join(tmpdir(), "samra-authority-release-"));
  try {
    execFileSync("git", ["init", "--quiet", fixture]);
    writeFileSync(
      join(fixture, ".gitignore"),
      readFileSync(join(root, ".gitignore")),
    );
    // These reports exist before the release workflow's GCP quality tests.
    const reports = [
      "artifacts/release-candidate/release-candidate-identity.json",
      "artifacts/release-candidate/security/trivy-license-policy.json",
      "artifacts/release-candidate/security/trivy-secrets-misconfiguration.json",
      "artifacts/release-candidate/security/trivy-vulnerabilities.json",
    ];
    const contents = JSON.stringify({
      repository: contract.repository.activeAuthority.nameWithOwner,
      previousRepository: contract.repository.previousAuthority.nameWithOwner,
    });
    for (const report of reports) {
      mkdirSync(join(fixture, report, ".."), { recursive: true });
      writeFileSync(join(fixture, report), contents);
    }
    const scans = [
      findOperationalAuthorityReferences,
      findFormerAuthorityReferences,
    ];
    for (const scan of scans) assert.deepEqual(scan(fixture, contract), []);

    // Only the root evidence directory is ignored, not application source.
    const source = "artifacts/api-server/src/release-candidate/control.json";
    mkdirSync(join(fixture, source, ".."), { recursive: true });
    writeFileSync(join(fixture, source), contents);
    for (const scan of scans) {
      assert.deepEqual(scan(fixture, contract), [source]);
    }

    // A tracked file must stay in scope even under an ignored directory.
    execFileSync("git", ["-C", fixture, "add", "--force", reports[0]]);
    for (const scan of scans) {
      assert.deepEqual(scan(fixture, contract), [source, reports[0]].sort());
    }
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
