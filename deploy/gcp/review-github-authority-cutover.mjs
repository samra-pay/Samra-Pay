import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, realpathSync, statSync } from "node:fs";
import { resolve, sep, dirname, basename } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
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
import {
  readStagingImageVerificationContract,
  validateStagingImageVerificationContract,
} from "./validate-staging-image-verification.mjs";
import {
  readStagingRevisionProbeContract,
  validateStagingRevisionProbeContract,
} from "./validate-staging-revision-probe.mjs";
import { MIGRATION } from "./staging-migration-evidence.mjs";
import { migrationProviderTrust } from "./run-staging-migrations.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const authority = readStagingGithubEnterpriseMigration();
const operators = new Set(["me@davidhaile.com", "operator@davidhaile.com"]);
export const FROZEN_WORKFLOW_IDS = [
  350558398, 348676505, 337326131, 340030605, 340878266, 350914431, 340338446,
  340912720, 340328709,
];
export const canonical = (value) =>
  JSON.stringify(value, (_key, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort())
      : item,
  );
export const hash = (value) =>
  createHash("sha256").update(canonical(value)).digest("hex");
const readContract = (read, validate) => {
  const c = read();
  validate(c);
  return c;
};

export function cutoverBoundaries() {
  validateStagingGithubEnterpriseMigration(authority);
  const publication = readContract(
    readStagingGithubFederation,
    validateStagingGithubFederation,
  );
  const production = readContract(
    readProductionFoundationPreflight,
    validateProductionFoundationPreflight,
  );
  const deployment = readContract(
    readStagingZeroTrafficDeployment,
    validateStagingZeroTrafficDeployment,
  );
  const traffic = readContract(
    readStagingTrafficControl,
    validateStagingTrafficControl,
  );
  const image = readContract(
    readStagingImageVerificationContract,
    validateStagingImageVerificationContract,
  );
  const probe = readContract(
    readStagingRevisionProbeContract,
    validateStagingRevisionProbeContract,
  );
  const out = [];
  const add = (
    id,
    projectId,
    projectNumber,
    poolId,
    providerId,
    serviceAccount,
    trust,
  ) =>
    out.push({
      id,
      projectId,
      projectNumber,
      organizationId: publication.googleCloud.organizationId,
      poolId,
      providerId,
      serviceAccount,
      issuerUri: trust.issuerUri,
      attributeMapping: trust.attributeMapping,
      targetCondition: trust.attributeCondition,
      formerCondition: trust.attributeCondition
        .replaceAll(
          authority.repository.activeAuthority.nameWithOwner,
          authority.repository.previousAuthority.nameWithOwner,
        )
        .replaceAll(
          authority.repository.activeAuthority.ownerId,
          authority.repository.previousAuthority.ownerId,
        ),
    });
  for (const [id, c, accountKey] of [
    ["staging-publication", publication, "publisherServiceAccountId"],
    ["staging-zero-traffic", deployment, "deployerServiceAccountId"],
  ]) {
    const g = c.googleCloud;
    add(
      id,
      g.projectId,
      g.projectNumber,
      g.workloadIdentityPoolId,
      g.workloadIdentityProviderId,
      `${g[accountKey]}@${g.projectId}.iam.gserviceaccount.com`,
      c.provider,
    );
  }
  const p = production.googleCloud;
  add(
    "production-preflight",
    p.productionProjectId,
    p.productionProjectNumber,
    p.workloadIdentityPoolId,
    p.workloadIdentityProviderId,
    `${p.auditorServiceAccountId}@${p.productionProjectId}.iam.gserviceaccount.com`,
    production.provider,
  );
  for (const [id, c] of [
    ["staging-image-verification", image],
    ["staging-revision-probe", probe],
  ]) {
    const g = c.googleCloud,
      w = c.workflow,
      repository = c.sourceRepository;
    const condition = `assertion.repository=='${repository}' && assertion.repository_id=='${authority.repository.stableId}' && assertion.repository_owner_id=='${authority.repository.activeAuthority.ownerId}' && assertion.ref=='${w.allowedRef}' && assertion.event_name=='${w.allowedEvent}' && assertion.workflow=='${w.name}' && assertion.workflow_ref=='${repository}/${w.path}@${w.allowedRef}' && assertion.environment=='${w.protectedEnvironment}'`;
    add(
      id,
      g.projectId,
      g.projectNumber,
      g.workloadIdentityPoolId,
      g.workloadIdentityProviderId,
      g.controllerServiceAccount,
      { ...publication.provider, attributeCondition: condition },
    );
  }
  for (const [id, providerKey, accountKey, environmentKey] of [
    [
      "staging-promotion",
      "promotionProviderId",
      "promoterServiceAccountId",
      "promotionEnvironmentCondition",
    ],
    [
      "staging-rollback",
      "rollbackProviderId",
      "rollbackServiceAccountId",
      "rollbackEnvironmentCondition",
    ],
  ]) {
    const g = traffic.googleCloud;
    add(
      id,
      g.projectId,
      g.projectNumber,
      g.workloadIdentityPoolId,
      g[providerKey],
      `${g[accountKey]}@${g.projectId}.iam.gserviceaccount.com`,
      {
        ...traffic.provider,
        attributeCondition: `${traffic.provider.commonCondition} && ${traffic.provider[environmentKey]}`,
      },
    );
  }
  const m = MIGRATION;
  add(
    "staging-migrations",
    m.project,
    m.projectNumber,
    m.pool,
    m.provider,
    m.controller,
    migrationProviderTrust(),
  );
  return out.sort((a, b) => a.id.localeCompare(b.id));
}
const poolName = (b) =>
  `projects/${b.projectNumber}/locations/global/workloadIdentityPools/${b.poolId}`;
const providerName = (b) => `${poolName(b)}/providers/${b.providerId}`;
const boundary = (id) => {
  const b = cutoverBoundaries().find((item) => item.id === id);
  assert(b, "Unknown cutover boundary");
  return b;
};

export function reviewCutoverSnapshot(s, { now = Date.now() } = {}) {
  const b = boundary(s?.boundaryId);
  const captured = Date.parse(s.capturedAt);
  assert(
    s.schemaVersion === 1 &&
      Number.isFinite(captured) &&
      captured <= now &&
      now - captured <= 15 * 60_000,
    "Snapshot must be current, at most fifteen minutes old",
  );
  assert(
    typeof s.candidateSha === "string" &&
      /^[0-9a-f]{40}$/.test(s.candidateSha) &&
      s.sourceTreeClean === true,
    "Exact clean source SHA required",
  );
  assert(
    operators.has(s.operator) &&
      s.activeAccount === s.operator &&
      s.impersonation === false,
    "Named human operator required; impersonation prohibited",
  );
  const a = authority.repository;
  assert(
    s.github.repository === a.activeAuthority.nameWithOwner &&
      s.github.repositoryId === a.stableId &&
      s.github.ownerId === a.activeAuthority.ownerId &&
      s.github.private === true &&
      s.github.mainSha === s.candidateSha,
    "Current private main authority required",
  );
  assert(
    Array.isArray(s.github.workflows) &&
      new Set(s.github.workflows.map((w) => w.id)).size ===
        s.github.workflows.length &&
      FROZEN_WORKFLOW_IDS.every((id) =>
        s.github.workflows.some(
          (w) => w.id === id && w.state === "disabled_manually",
        ),
      ),
    "Release freeze is missing or incomplete",
  );
  assert(
    s.project.projectId === b.projectId &&
      String(s.project.projectNumber) === b.projectNumber &&
      s.project.lifecycleState === "ACTIVE" &&
      s.project.parent?.type === "organization" &&
      String(s.project.parent.id) === b.organizationId,
    "Project boundary drifted",
  );
  assert(
    s.pool.name === poolName(b) &&
      s.pool.state === "ACTIVE" &&
      s.pool.disabled !== true,
    "Pool is missing, disabled or not the governed pool",
  );
  assert(
    Array.isArray(s.providers) && s.providers.length > 0,
    "Provider inventory is missing",
  );
  const allowed = cutoverBoundaries().filter(
    (item) => item.projectId === b.projectId && item.poolId === b.poolId,
  );
  assert(
    new Set(s.providers.map((p) => p.name)).size === s.providers.length,
    "Duplicate providers",
  );
  for (const p of s.providers) {
    const expected = allowed.find((item) => providerName(item) === p.name);
    assert(
      expected &&
        p.state === "ACTIVE" &&
        p.disabled !== true &&
        p.oidc?.issuerUri === expected.issuerUri &&
        (p.oidc.allowedAudiences === undefined ||
          (Array.isArray(p.oidc.allowedAudiences) &&
            p.oidc.allowedAudiences.length === 0)) &&
        !p.oidc.jwksJson &&
        canonical(p.attributeMapping) === canonical(expected.attributeMapping),
      "Unexpected provider, issuer, audience, mapping or state",
    );
    assert(
      [expected.formerCondition, expected.targetCondition].includes(
        p.attributeCondition,
      ),
      "Provider condition is not an exact former or target boundary",
    );
  }
  const p = s.providers.find((p) => p.name === providerName(b));
  assert(p, "Selected provider is missing; bootstrap is a separate decision");
  assert(
    s.serviceAccount.email === b.serviceAccount &&
      s.serviceAccount.disabled !== true &&
      Array.isArray(s.userManagedKeys) &&
      s.userManagedKeys.length === 0,
    "Existing keyless controller required",
  );
  assert(
    Array.isArray(s.projectPolicy.bindings) &&
      Array.isArray(s.serviceAccountPolicy.bindings),
    "Complete IAM snapshots required",
  );
  // Project grants are inherited by every controller in this project. Even a
  // conditional grant needs a separate effective-access review; this tool must
  // not evaluate CEL or assume an expired-looking condition makes it harmless.
  const inheritedAccessRoles = new Set([
    "roles/iam.serviceAccountTokenCreator",
    "roles/iam.serviceAccountOpenIdTokenCreator",
    "roles/iam.workloadIdentityUser",
    "roles/iam.serviceAccountUser",
  ]);
  assert(
    s.projectPolicy.bindings.every(
      (item) =>
        item &&
        typeof item.role === "string" &&
        Array.isArray(item.members) &&
        item.members.length > 0 &&
        item.members.every((member) => typeof member === "string" && member) &&
        !inheritedAccessRoles.has(item.role),
    ),
    "Project IAM is malformed or grants inherited service-account access; independent IAM remediation required",
  );
  const bindings = s.serviceAccountPolicy.bindings;
  const principal = `principalSet://iam.googleapis.com/${poolName(b)}/attribute.repository_id/${a.stableId}`;
  assert(
    bindings.length === 1 &&
      bindings[0]?.role === "roles/iam.workloadIdentityUser" &&
      !bindings[0].condition &&
      canonical(bindings[0].members) === canonical([principal]),
    "Controller IAM must contain only the exact federation binding",
  );
  const changeNeeded = p.attributeCondition !== b.targetCondition;
  return {
    schemaVersion: 1,
    status: changeNeeded
      ? "reviewed-change-not-authorized"
      : "target-condition-observed-not-release-ready",
    boundaryId: b.id,
    candidateSha: s.candidateSha,
    operator: s.operator,
    expiresAt: new Date(captured + 15 * 60_000).toISOString(),
    snapshotSha256: hash(s),
    changeNeeded,
    cloudApplyAuthorized: false,
    releaseResumptionAuthorized: false,
    beforeCondition: p.attributeCondition,
    targetCondition: b.targetCondition,
    // Argument array is review material only. This module never executes it.
    proposedCommand: changeNeeded
      ? {
          executable: "gcloud",
          args: [
            "iam",
            "workload-identity-pools",
            "providers",
            "update-oidc",
            b.providerId,
            `--project=${b.projectId}`,
            "--location=global",
            `--workload-identity-pool=${b.poolId}`,
            `--account=${s.operator}`,
            `--attribute-condition=${b.targetCondition}`,
          ],
        }
      : null,
    independentFullIamAuditRequired: true,
  };
}

export function verifyCutoverSnapshots(before, after, options) {
  const plan = reviewCutoverSnapshot(before, options);
  const result = reviewCutoverSnapshot(after, options);
  assert(
    plan.boundaryId === result.boundaryId &&
      plan.candidateSha === result.candidateSha &&
      plan.operator === result.operator &&
      Date.parse(after.capturedAt) >= Date.parse(before.capturedAt),
    "Snapshot lineage or order differs",
  );
  assert(
    !result.changeNeeded,
    "Post-cutover provider still uses former authority",
  );
  const b = boundary(plan.boundaryId);
  const invariant = (s) => ({
    project: s.project,
    projectPolicy: s.projectPolicy,
    pool: s.pool,
    providers: s.providers.map((p) =>
      p.name === providerName(b)
        ? { ...p, attributeCondition: b.targetCondition }
        : p,
    ),
    serviceAccount: s.serviceAccount,
    serviceAccountPolicy: s.serviceAccountPolicy,
    userManagedKeys: s.userManagedKeys,
  });
  assert(
    canonical(invariant(before)) === canonical(invariant(after)),
    "Cloud state changed outside the selected attribute condition",
  );
  return {
    schemaVersion: 1,
    status: "consistent-post-cutover-snapshots",
    boundaryId: b.id,
    candidateSha: plan.candidateSha,
    beforeSha256: hash(before),
    afterSha256: hash(after),
    changed: plan.changeNeeded,
    signedCloudAttestation: false,
    independentFullIamAuditRequired: true,
    releaseResumptionAuthorized: false,
  };
}

function execute(file, args) {
  try {
    return execFileSync(file, args, {
      encoding: "utf8",
      timeout: 30_000,
      maxBuffer: 4 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        GH_DEBUG: "",
        GH_PROMPT_DISABLED: "1",
        CLOUDSDK_CORE_DISABLE_PROMPTS: "1",
      },
    }).trim();
  } catch {
    throw new Error(
      `${file} metadata read failed; no resource absence or cutover success inferred`,
    );
  }
}

export function captureCutoverSnapshot(
  { boundaryId, candidateSha, operator },
  run = execute,
) {
  const capturedAt = new Date().toISOString();
  const b = boundary(boundaryId);
  assert(operators.has(operator), "Unapproved operator identity");
  assert(
    /^[0-9a-f]{40}$/.test(candidateSha ?? "") &&
      run("git", ["-C", root, "rev-parse", "HEAD"]) === candidateSha &&
      run("git", ["-C", root, "status", "--porcelain"]) === "",
    "Capture requires exact clean checked-out source",
  );
  const json = (file, args) => {
    const output = run(file, args);
    try {
      return JSON.parse(output);
    } catch {
      throw new Error(`${file} returned malformed metadata; capture stopped`);
    }
  };
  const active = json("gcloud", [
    "auth",
    "list",
    "--filter=status:ACTIVE",
    "--format=json",
  ]);
  assert(
    active.length === 1 && active[0].account === operator,
    "Active cloud account differs from named operator",
  );
  assert(
    ["", "(unset)"].includes(
      run("gcloud", [
        "config",
        "get-value",
        "auth/impersonate_service_account",
      ]),
    ),
    "Impersonated capture prohibited",
  );
  const repo = authority.repository.activeAuthority.nameWithOwner;
  const metadata = json("gh", ["api", `repos/${repo}`]);
  const main = json("gh", ["api", `repos/${repo}/branches/main`]);
  const pages = json("gh", [
    "api",
    `repos/${repo}/actions/workflows?per_page=100`,
    "--paginate",
    "--slurp",
  ]);
  assert(
    Array.isArray(pages) &&
      pages.every((page) => Array.isArray(page.workflows)),
    "Incomplete workflow inventory",
  );
  const gcloud = (...args) =>
    json("gcloud", [
      ...args,
      `--project=${b.projectId}`,
      `--account=${operator}`,
      "--format=json",
    ]);
  const snapshot = {
    schemaVersion: 1,
    boundaryId,
    candidateSha,
    operator,
    activeAccount: operator,
    impersonation: false,
    sourceTreeClean: true,
    github: {
      repository: metadata.full_name,
      repositoryId: String(metadata.id),
      ownerId: String(metadata.owner.id),
      private: metadata.private,
      mainSha: main.commit.sha,
      workflows: pages
        .flatMap((page) => page.workflows)
        .map(({ id, state }) => ({ id, state })),
    },
    project: gcloud("projects", "describe", b.projectId),
    projectPolicy: gcloud("projects", "get-iam-policy", b.projectId),
    pool: gcloud(
      "iam",
      "workload-identity-pools",
      "describe",
      b.poolId,
      "--location=global",
    ),
    providers: gcloud(
      "iam",
      "workload-identity-pools",
      "providers",
      "list",
      "--location=global",
      `--workload-identity-pool=${b.poolId}`,
    ),
    serviceAccount: gcloud(
      "iam",
      "service-accounts",
      "describe",
      b.serviceAccount,
    ),
    serviceAccountPolicy: gcloud(
      "iam",
      "service-accounts",
      "get-iam-policy",
      b.serviceAccount,
    ),
    userManagedKeys: gcloud(
      "iam",
      "service-accounts",
      "keys",
      "list",
      `--iam-account=${b.serviceAccount}`,
      "--managed-by=user",
    ),
    capturedAt,
  };
  reviewCutoverSnapshot(snapshot);
  return snapshot;
}

function readSnapshot(path) {
  assert(
    statSync(path).size <= 4 * 1024 * 1024,
    "Snapshot exceeds metadata size bound",
  );
  const bytes = readFileSync(path);
  assert(
    bytes.length <= 4 * 1024 * 1024,
    "Snapshot exceeds metadata size bound",
  );
  return JSON.parse(bytes.toString("utf8"));
}
function cli(args) {
  if (args[0] === "catalog" && args.length === 1)
    return {
      status: "offline-inventory-not-cloud-observation",
      boundaries: cutoverBoundaries(),
    };
  if (args[0] === "review" && args.length === 2)
    return reviewCutoverSnapshot(readSnapshot(args[1]));
  if (args[0] === "verify" && args.length === 3)
    return verifyCutoverSnapshots(readSnapshot(args[1]), readSnapshot(args[2]));
  if (args[0] === "capture" && args.length === 5) {
    const [, boundaryId, candidateSha, operator, output] = args;
    const target = resolve(
      realpathSync(dirname(resolve(output))),
      basename(output),
    );
    const repositoryRoot = realpathSync(root);
    assert(
      !target.startsWith(repositoryRoot + sep) && target !== repositoryRoot,
      "Keep raw cloud metadata outside the repository",
    );
    const snapshot = captureCutoverSnapshot({
      boundaryId,
      candidateSha,
      operator,
    });
    writeFileSync(target, JSON.stringify(snapshot, null, 2) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
    return reviewCutoverSnapshot(snapshot);
  }
  throw new Error(
    "Usage: review-github-authority-cutover.mjs catalog | capture <boundary> <main-sha> <operator> <outside-repo-file> | review <snapshot> | verify <before> <after>. No apply mode exists.",
  );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    console.log(JSON.stringify(cli(process.argv.slice(2)), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
