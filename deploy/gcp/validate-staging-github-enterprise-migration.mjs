import { execFileSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  lstatSync,
} from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

const EXACT = Object.freeze({
  repositoryName: "Samra-Pay",
  repositoryId: "1335175962",
  previousOwnerLogin: "haileleuld87",
  previousOwnerId: "237485986",
  previousRepository: "haileleuld87/Samra-Pay",
  targetOwnerLogin: "samra-pay",
  targetOwnerId: "320532147",
  targetRepository: "samra-pay/Samra-Pay",
  enterpriseSlug: "samra-pay",
});

const EXPECTED_BLOCKERS = Object.freeze([
  "google-trust-cutover",
  "integration-and-retention-review",
  "exact-sha-release-evidence",
  "release-resumption-authorization",
]);

const MIGRATION_CONTROL_FILES = [
  "deploy/gcp/review-staging-github-enterprise-migration.mjs",
  "deploy/gcp/staging-github-enterprise-migration.json",
  "deploy/gcp/staging-github-enterprise-migration.test.mjs",
  "deploy/gcp/validate-staging-github-enterprise-migration.mjs",
];
const GENERATED_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".next",
  ".turbo",
  ".cache",
  "coverage",
  "test-results",
  ".expo",
]);

const EXPECTED_CUTOVER_ORDER = Object.freeze([
  "activate-paid-enterprise",
  "verify-solo-founder-account-recovery-readiness",
  "capture-pre-transfer-inventory-and-backup",
  "freeze-staging-release-environments",
  "transfer-repository",
  "verify-repository-id-and-new-owner-id",
  "switch-repository-authority-contracts",
  "reapply-inventoried-google-workload-identity-boundaries",
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
    if (entry.isSymbolicLink()) return [];
    if (entry.isDirectory())
      return GENERATED_DIRECTORIES.has(entry.name) ? [] : listFiles(child);
    return statSync(child).isFile() ? [child] : [];
  });
}

function sourceFiles(root, contract) {
  const excluded = new Set(
    contract.operationalReferences.migrationControlFiles,
  );
  // Respect Git's source boundary so local credentials and generated evidence
  // are never read. Tracked files remain covered even if a rule ignores them.
  const files = existsSync(join(root, ".git"))
    ? execFileSync(
        "git",
        [
          "-C",
          root,
          "ls-files",
          "--cached",
          "--others",
          "--exclude-standard",
          "-z",
        ],
        { encoding: "utf8", timeout: 10_000, maxBuffer: 8 * 1024 * 1024 },
      )
        .split("\0")
        .filter(Boolean)
        .map((path) => join(root, path))
    : contract.operationalReferences.scanRoots.flatMap((scanRoot) =>
        listFiles(join(root, scanRoot)),
      );
  return [...new Set(files)]
    .filter((path) => existsSync(path) && lstatSync(path).isFile())
    .map((path) => ({ path, relativePath: relative(root, path) }))
    .filter(({ relativePath }) => !excluded.has(relativePath))
    .map((file) => ({ ...file, bytes: readFileSync(file.path) }))
    .filter(({ bytes }) => !bytes.includes(0))
    .map(({ relativePath, bytes }) => ({
      relativePath,
      contents: bytes.toString("utf8"),
    }));
}

// Historical evidence is allowed only as an exact, individually recorded line.
// A new operational reference in the same file is still rejected.
function currentLines(file, contract) {
  const historical = new Set(
    contract.operationalReferences.historicalReferences
      .filter((entry) => entry.path === file.relativePath)
      .map((entry) => entry.line),
  );
  return file.contents.split(/\r?\n/).filter((line) => !historical.has(line));
}

export function findOperationalAuthorityReferences(
  root,
  contract = readStagingGithubEnterpriseMigration(),
) {
  const needles = [
    contract.repository.activeAuthority.nameWithOwner,
    contract.repository.activeAuthority.ownerId,
  ];
  return sourceFiles(root, contract)
    .filter((file) =>
      currentLines(file, contract).some((line) =>
        needles.some((needle) => line.replaceAll("\\/", "/").includes(needle)),
      ),
    )
    .map(({ relativePath }) => relativePath)
    .sort();
}

export function findFormerAuthorityReferences(
  root,
  contract = readStagingGithubEnterpriseMigration(),
) {
  return sourceFiles(root, contract)
    .filter((file) =>
      currentLines(file, contract).some((line) => {
        const normalized = line
          .replaceAll("\\/", "/")
          .replace(/(?<=\d)_(?=\d)/g, "");
        return (
          normalized
            .toLowerCase()
            .includes(EXACT.previousRepository.toLowerCase()) ||
          normalized.includes(EXACT.previousOwnerId) ||
          /\bowner(?:Login)?["']?\s*[:=]+\s*["']haileleuld87["']/.test(
            normalized,
          )
        );
      }),
    )
    .map(({ relativePath }) => relativePath)
    .sort();
}

export function validateStagingGithubEnterpriseMigration(
  contract = readStagingGithubEnterpriseMigration(),
  { root } = {},
) {
  assert(contract.schemaVersion === 2, "Unsupported migration schema");
  assert(
    contract.status === "github-transferred-cloud-cutover-pending",
    "GitHub transfer must remain distinct from pending cloud cutover",
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
    JSON.stringify(repository.previousAuthority) ===
      JSON.stringify({
        accountType: "user",
        ownerLogin: EXACT.previousOwnerLogin,
        ownerId: EXACT.previousOwnerId,
        nameWithOwner: EXACT.previousRepository,
        enterpriseBacked: false,
      }),
    "Historical personal authority drifted",
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
    JSON.stringify(repository.activeAuthority) ===
      JSON.stringify(repository.targetAuthority),
    "Active repository must use the verified Enterprise owner",
  );

  assert(
    contract.observedEnterpriseState.billingStatus === "paid" &&
      contract.observedEnterpriseState.billingInformationConfigured === true &&
      contract.observedEnterpriseState.operatingModel === "solo-founder" &&
      contract.observedEnterpriseState.organizationMemberCount === 1 &&
      contract.observedEnterpriseState.organizationOwnerCount === 1 &&
      contract.observedEnterpriseState.accountRecoveryReadiness ===
        "verified" &&
      contract.observedEnterpriseState.twoFactorAuthenticationEnabled ===
        true &&
      contract.observedEnterpriseState.authenticatorAppConfigured === true &&
      contract.observedEnterpriseState.passkeyOrSecurityKeyConfigured ===
        true &&
      contract.observedEnterpriseState.recoveryCodesGeneratedAndViewed ===
        true &&
      contract.observedEnterpriseState.recoveryCodesExternalStorageVerified ===
        true &&
      contract.observedEnterpriseState.recoveryCodesExternalStorageEvidence ===
        "user-attestation-2026-09-05" &&
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
    transfer.authorized === true &&
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
    transfer.status === "completed" &&
      transfer.reviewedMainSha === "33bbad186e1f44e175aa6e7b910bc67918830d14" &&
      transfer.mainRulesetId === 22344977 &&
      transfer.releaseFreezeApplied === true &&
      transfer.releaseResumptionAuthorized === false,
    "Completed transfer evidence and release freeze are required",
  );
  assert(
    JSON.stringify(contract.cloudTrustCutover) ===
      JSON.stringify({
        status: "pending",
        applyAuthorized: false,
        liveReadbackVerified: false,
        dualOwnerTrustAllowed: false,
      }),
    "Cloud trust must remain pending, unapproved and single-owner",
  );
  const evidencePaths = [
    "docs/operations/enterprise-transfer-2026-09-05.md",
    "docs/operations/evidence/2026-09-05-merge-authority.json",
    "docs/operations/evidence/2026-09-05-main-ruleset.json",
    "docs/operations/evidence/2026-09-05-transfer-checks.json",
  ];
  assert(
    JSON.stringify(transfer.evidencePaths) === JSON.stringify(evidencePaths),
    "Transfer evidence paths drifted",
  );
  assert(
    JSON.stringify(contract.cutoverOrder) ===
      JSON.stringify(EXPECTED_CUTOVER_ORDER),
    "Cutover order drifted",
  );

  const currentFiles = contract.operationalReferences.currentAuthorityFiles;
  assert(
    currentFiles.length > 0 &&
      new Set(currentFiles).size === currentFiles.length &&
      JSON.stringify([...currentFiles].sort()) === JSON.stringify(currentFiles),
    "Current-authority inventory must be sorted, unique, and complete",
  );
  assert(
    JSON.stringify(contract.operationalReferences.scanRoots) === '["."]' &&
      JSON.stringify(contract.operationalReferences.migrationControlFiles) ===
        JSON.stringify(MIGRATION_CONTROL_FILES),
    "Authority scan must cover the entire source repository",
  );
  const historical = contract.operationalReferences.historicalReferences;
  assert(
    Array.isArray(historical) &&
      historical.every(
        (entry) =>
          typeof entry.path === "string" &&
          typeof entry.line === "string" &&
          !entry.line.includes("\n") &&
          !entry.line.includes("\r") &&
          entry.reason?.trim(),
      ) &&
      new Set(
        historical.map((entry) => JSON.stringify([entry.path, entry.line])),
      ).size === historical.length,
    "Historical authority references must be explicit and unique",
  );

  if (root) {
    assert(
      JSON.stringify(findOperationalAuthorityReferences(root, contract)) ===
        JSON.stringify(currentFiles),
      "Operational Enterprise-authority inventory drifted",
    );
    assert(
      findFormerAuthorityReferences(root, contract).length === 0,
      "Former personal authority remains in operational source",
    );
    const sources = new Map(
      sourceFiles(root, contract).map((file) => [
        file.relativePath,
        file.contents,
      ]),
    );
    assert(
      historical.every((entry) =>
        sources.get(entry.path)?.split(/\r?\n/).includes(entry.line),
      ),
      "Historical authority exception no longer matches its exact source line",
    );
    assert(
      evidencePaths.every((path) => existsSync(join(root, path))),
      "Transfer evidence is missing",
    );
    const evidence = JSON.parse(
      readFileSync(join(root, evidencePaths[1]), "utf8"),
    );
    assert(
      evidence.status === "enforced" &&
        evidence.repository === EXACT.targetRepository &&
        evidence.repositoryId === EXACT.repositoryId &&
        evidence.ownerId === EXACT.targetOwnerId &&
        evidence.expectedSha === transfer.reviewedMainSha &&
        evidence.permanentRulesetId === transfer.mainRulesetId,
      "Transfer evidence identity does not match the recorded transfer",
    );
  }

  return Object.freeze({
    schemaVersion: 2,
    status: "validated-github-transferred-cloud-cutover-pending",
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
    transferAuthorized: true,
    cloudTrustApplyAuthorized: false,
    releaseResumptionAuthorized: false,
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
