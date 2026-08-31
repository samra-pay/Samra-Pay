import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

const EXACT = Object.freeze({
  repositoryName: "Samra-Pay",
  repositoryId: "1335175962",
  activeOwnerLogin: "haileleuld87",
  activeOwnerId: "237485986",
  activeRepository: "haileleuld87/Samra-Pay",
  targetOwnerLogin: "samra-pay",
  targetOwnerId: "320532147",
  targetRepository: "samra-pay/Samra-Pay",
  enterpriseSlug: "samra-pay",
});

const EXPECTED_BLOCKERS = Object.freeze([
  "paid-enterprise-activation",
  "solo-founder-account-recovery-readiness",
  "pre-transfer-backup-and-freeze-readiness",
]);

const EXPECTED_CUTOVER_ORDER = Object.freeze([
  "activate-paid-enterprise",
  "verify-solo-founder-account-recovery-readiness",
  "capture-pre-transfer-inventory-and-backup",
  "freeze-staging-release-environments",
  "transfer-repository",
  "verify-repository-id-and-new-owner-id",
  "switch-repository-authority-contracts",
  "reapply-six-google-workload-identity-boundaries",
  "enforce-solo-founder-protected-environment-controls",
  "reconnect-qase-github-app",
  "audit-branch-actions-environment-and-cloud-controls",
  "run-read-only-release-workflow",
  "resume-authorized-release-operations",
]);

export function readStagingGithubEnterpriseMigration() {
  return JSON.parse(
    readFileSync(
      new URL("./staging-github-enterprise-migration.json", import.meta.url),
      "utf8",
    ),
  );
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function listFiles(path) {
  if (!existsSync(path)) return [];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const child = join(path, entry.name);
    if (entry.isDirectory()) return listFiles(child);
    return statSync(child).isFile() ? [child] : [];
  });
}

export function findOperationalAuthorityReferences(
  root,
  contract = readStagingGithubEnterpriseMigration(),
) {
  const excluded = new Set(
    contract.operationalReferences.migrationControlFiles,
  );
  const needles = [
    contract.repository.activeAuthority.nameWithOwner,
    contract.repository.activeAuthority.ownerId,
  ];
  return contract.operationalReferences.scanRoots
    .flatMap((scanRoot) => listFiles(join(root, scanRoot)))
    .map((path) => ({ path, relativePath: relative(root, path) }))
    .filter(({ relativePath }) => !excluded.has(relativePath))
    .filter(({ path }) => {
      const contents = readFileSync(path, "utf8");
      return needles.some((needle) => contents.includes(needle));
    })
    .map(({ relativePath }) => relativePath)
    .sort();
}

export function findPrematureTargetAuthorityReferences(
  root,
  contract = readStagingGithubEnterpriseMigration(),
) {
  const excluded = new Set(
    contract.operationalReferences.migrationControlFiles,
  );
  const target = contract.repository.targetAuthority;
  return contract.operationalReferences.scanRoots
    .flatMap((scanRoot) => listFiles(join(root, scanRoot)))
    .map((path) => ({ path, relativePath: relative(root, path) }))
    .filter(({ relativePath }) => !excluded.has(relativePath))
    .filter(({ path }) => {
      const contents = readFileSync(path, "utf8");
      return (
        contents.includes(target.nameWithOwner) ||
        contents.includes(target.ownerId)
      );
    })
    .map(({ relativePath }) => relativePath)
    .sort();
}

export function validateStagingGithubEnterpriseMigration(
  contract = readStagingGithubEnterpriseMigration(),
  { root } = {},
) {
  assert(contract.schemaVersion === 1, "Unsupported migration schema");
  assert(
    contract.status === "prepared-not-authorized",
    "Enterprise migration must remain prepared but unauthorized",
  );
  assert(
    /^\d{4}-\d{2}-\d{2}$/.test(contract.observedAt),
    "Migration observation date is invalid",
  );

  const { repository, governance, transfer } = contract;
  assert(
    repository.name === EXACT.repositoryName &&
      repository.stableId === EXACT.repositoryId &&
      repository.defaultBranch === "main",
    "Stable repository identity drifted",
  );
  assert(
    JSON.stringify(repository.activeAuthority) ===
      JSON.stringify({
        accountType: "user",
        ownerLogin: EXACT.activeOwnerLogin,
        ownerId: EXACT.activeOwnerId,
        nameWithOwner: EXACT.activeRepository,
        enterpriseBacked: false,
      }),
    "Active personal authority drifted",
  );
  assert(
    JSON.stringify(repository.targetAuthority) ===
      JSON.stringify({
        accountType: "organization",
        ownerLogin: EXACT.targetOwnerLogin,
        ownerId: EXACT.targetOwnerId,
        nameWithOwner: EXACT.targetRepository,
        enterpriseSlug: EXACT.enterpriseSlug,
        enterpriseBacked: true,
      }),
    "Target Enterprise authority drifted",
  );

  assert(
    contract.observedEnterpriseState.billingStatus === "trial" &&
      contract.observedEnterpriseState.billingInformationConfigured === false &&
      contract.observedEnterpriseState.operatingModel === "solo-founder" &&
      contract.observedEnterpriseState.organizationMemberCount === 1 &&
      contract.observedEnterpriseState.organizationOwnerCount === 1 &&
      contract.observedEnterpriseState.accountRecoveryReadiness === "blocked" &&
      contract.observedEnterpriseState.twoFactorAuthenticationEnabled ===
        true &&
      contract.observedEnterpriseState.authenticatorAppConfigured === true &&
      contract.observedEnterpriseState.passkeyOrSecurityKeyConfigured ===
        false &&
      contract.observedEnterpriseState.recoveryCodesGeneratedAndViewed ===
        true &&
      contract.observedEnterpriseState.recoveryCodesExternalStorageVerified ===
        false &&
      contract.observedEnterpriseState.verifiedRecoveryEmailConfigured ===
        true &&
      JSON.stringify(contract.observedEnterpriseState.teams) ===
        JSON.stringify(["developers", "platform-admins", "staging-approvers"]),
    "Observed Enterprise state drifted",
  );
  assert(
    governance.operatingModel === "solo-founder" &&
      governance.minimumActiveOrganizationOwners === 1 &&
      governance.secondOwnerRecommendedWhenQualified === true &&
      governance.placeholderOrSharedOwnerAllowed === false &&
      governance.independentStagingApproverRequired === false &&
      governance.requiredEnvironmentReviewerConfigured === false &&
      governance.selfReviewPreventionEnabled === false &&
      governance.releaseAuthorizationMode ===
        "manual-exact-sha-with-automated-evidence" &&
      governance.requiredAutomatedChecks === true &&
      governance.requiredMainBranchProtection === true &&
      governance.requiredExactWorkflowIdentity === true &&
      governance.requiredImmutableArtifactDigest === true &&
      governance.accountRecovery.minimumAuthenticationMethods === 2 &&
      governance.accountRecovery.passkeyOrSecurityKeyRequired === true &&
      governance.accountRecovery
        .recoveryCodesStoredOutsideDailyDeviceRequired === true &&
      governance.accountRecovery.verifiedRecoveryEmailRequired === true &&
      governance.baseRepositoryPermission === "none" &&
      governance.baseProjectPermission === "none" &&
      governance.memberRepositoryCreationAllowed === false &&
      governance.memberPagesCreationAllowed === false &&
      governance.repositoryAdminCanInviteOutsideCollaborators === false &&
      governance.repositoryAdminCanInstallApps === false &&
      governance.repositoryAdminCanChangeVisibility === false &&
      governance.repositoryAdminCanDeleteOrTransfer === false &&
      governance.repositoryAdminCanRenameProtectedBranches === false &&
      governance.memberTeamCreationAllowed === false &&
      governance.appAccessRequests === "members-only",
    "Organization governance boundary drifted",
  );
  assert(
    JSON.stringify(contract.blockingGates) ===
      JSON.stringify(EXPECTED_BLOCKERS),
    "Migration blockers drifted",
  );
  assert(
    transfer.authorized === false &&
      transfer.releaseFreezeRequired === true &&
      transfer.backupAndInventoryRequired === true &&
      transfer.exactMainShaRequired === true &&
      transfer.stableRepositoryIdMustBeVerifiedAfterTransfer === true &&
      transfer.transferMustPrecedeGoogleTrustCutover === true &&
      transfer.googleTrustMustFailClosedDuringCutover === true &&
      transfer.protectedEnvironmentsMustBeReaudited === true &&
      transfer.branchProtectionMustBeReaudited === true &&
      transfer.qaseGitHubAppMustBeReconnected === true &&
      transfer.readOnlyReleaseWorkflowMustPassBeforePublication === true,
    "Transfer safety boundary drifted",
  );
  assert(
    JSON.stringify(contract.cutoverOrder) ===
      JSON.stringify(EXPECTED_CUTOVER_ORDER),
    "Cutover order drifted",
  );

  const currentFiles = contract.operationalReferences.currentAuthorityFiles;
  assert(
    currentFiles.length === 53 &&
      new Set(currentFiles).size === currentFiles.length &&
      JSON.stringify([...currentFiles].sort()) === JSON.stringify(currentFiles),
    "Current-authority inventory must be sorted, unique, and complete",
  );

  if (root) {
    assert(
      JSON.stringify(findOperationalAuthorityReferences(root, contract)) ===
        JSON.stringify(currentFiles),
      "Operational personal-authority inventory drifted",
    );
    assert(
      findPrematureTargetAuthorityReferences(root, contract).length === 0,
      "Target Enterprise authority appeared before transfer authorization",
    );
  }

  return Object.freeze({
    schemaVersion: 1,
    status: "validated-prepared-not-authorized",
    operatingModel: governance.operatingModel,
    activeRepository: repository.activeAuthority.nameWithOwner,
    targetRepository: repository.targetAuthority.nameWithOwner,
    stableRepositoryId: repository.stableId,
    targetOwnerId: repository.targetAuthority.ownerId,
    accountRecoveryReadiness:
      contract.observedEnterpriseState.accountRecoveryReadiness,
    twoFactorAuthenticationEnabled:
      contract.observedEnterpriseState.twoFactorAuthenticationEnabled,
    passkeyOrSecurityKeyConfigured:
      contract.observedEnterpriseState.passkeyOrSecurityKeyConfigured,
    blockerCount: contract.blockingGates.length,
    currentAuthorityFileCount: currentFiles.length,
    transferAuthorized: false,
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const root = process.argv[2] ?? process.cwd();
    console.log(
      JSON.stringify(
        validateStagingGithubEnterpriseMigration(undefined, { root }),
      ),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Staging GitHub Enterprise migration rejected: ${message}`);
    process.exitCode = 1;
  }
}
