import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import {
  findOperationalAuthorityReferences,
  findPrematureTargetAuthorityReferences,
  readStagingGithubEnterpriseMigration,
  validateStagingGithubEnterpriseMigration,
} from "./validate-staging-github-enterprise-migration.mjs";

const root = process.cwd();
const contract = readStagingGithubEnterpriseMigration();

test("validates the prepared but unauthorized Enterprise migration", () => {
  assert.deepEqual(
    validateStagingGithubEnterpriseMigration(contract, { root }),
    {
      schemaVersion: 1,
      status: "validated-prepared-not-authorized",
      operatingModel: "solo-founder",
      activeRepository: contract.repository.activeAuthority.nameWithOwner,
      targetRepository: contract.repository.targetAuthority.nameWithOwner,
      stableRepositoryId: contract.repository.stableId,
      targetOwnerId: contract.repository.targetAuthority.ownerId,
      accountRecoveryReadiness: "blocked",
      twoFactorAuthenticationEnabled: true,
      passkeyOrSecurityKeyConfigured: false,
      blockerCount: 3,
      currentAuthorityFileCount: 69,
      transferAuthorized: false,
    },
  );
});

test("inventories every operational dependency on the personal authority", () => {
  assert.deepEqual(
    findOperationalAuthorityReferences(root, contract),
    contract.operationalReferences.currentAuthorityFiles,
  );
  assert.deepEqual(findPrematureTargetAuthorityReferences(root, contract), []);
});

test("rejects premature transfer authorization and weakened governance", () => {
  for (const mutate of [
    (value) => (value.status = "authorized"),
    (value) => (value.transfer.authorized = true),
    (value) => (value.governance.operatingModel = "multi-operator"),
    (value) => (value.governance.minimumActiveOrganizationOwners = 2),
    (value) => (value.governance.placeholderOrSharedOwnerAllowed = true),
    (value) => (value.governance.independentStagingApproverRequired = true),
    (value) => (value.governance.requiredEnvironmentReviewerConfigured = true),
    (value) => (value.governance.requiredAutomatedChecks = false),
    (value) =>
      (value.governance.accountRecovery.minimumAuthenticationMethods = 1),
    (value) => (value.governance.baseRepositoryPermission = "read"),
    (value) => (value.observedEnterpriseState.billingStatus = "paid"),
    (value) =>
      (value.observedEnterpriseState.twoFactorAuthenticationEnabled = false),
    (value) =>
      (value.observedEnterpriseState.recoveryCodesGeneratedAndViewed = false),
    (value) =>
      (value.observedEnterpriseState.passkeyOrSecurityKeyConfigured = true),
    (value) => value.blockingGates.pop(),
    (value) => value.cutoverOrder.reverse(),
  ]) {
    const changed = structuredClone(contract);
    mutate(changed);
    assert.throws(() => validateStagingGithubEnterpriseMigration(changed));
  }
});

test("runs an offline review without mutating GitHub or Google Cloud", () => {
  const output = execFileSync(
    process.execPath,
    ["deploy/gcp/review-staging-github-enterprise-migration.mjs", "--review"],
    { encoding: "utf8" },
  );
  assert.match(output, /READ-ONLY GITHUB ENTERPRISE MIGRATION REVIEW PASS/);
  assert.match(output, /validated-prepared-not-authorized/);
  assert.match(output, /Operating model: solo-founder/);
  assert.match(
    output,
    /Account recovery: blocked; 2FA: enabled; passkey\/security key: missing/,
  );
  assert.match(output, /Operational authority references inventoried: 69/);
  assert.match(output, /TRANSFER NOT AUTHORIZED/);
  assert.doesNotMatch(output, /APPLIED|TRANSFER COMPLETE|TRUST UPDATED/);
});
