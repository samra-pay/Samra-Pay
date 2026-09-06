import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  cutoverBoundaries,
  FROZEN_WORKFLOW_IDS,
  reviewCutoverSnapshot,
  verifyCutoverSnapshots,
  captureCutoverSnapshot,
  hash,
} from "./review-github-authority-cutover.mjs";
import { readStagingGithubEnterpriseMigration } from "./validate-staging-github-enterprise-migration.mjs";

const authority = readStagingGithubEnterpriseMigration().repository;
const boundaries = cutoverBoundaries();
const sha = "a".repeat(40);
const now = Date.parse("2026-09-05T12:00:00.000Z");
const poolName = (b) =>
  `projects/${b.projectNumber}/locations/global/workloadIdentityPools/${b.poolId}`;
const providerName = (b) => `${poolName(b)}/providers/${b.providerId}`;
function fixture(
  id = "staging-publication",
  capturedAt = new Date(now).toISOString(),
) {
  const b = boundaries.find((b) => b.id === id);
  const principalSuffix =
    id === "staging-promotion"
      ? "attribute.environment/staging-traffic-promotion"
      : id === "staging-rollback"
        ? "attribute.environment/staging-traffic-rollback"
        : `attribute.repository_id/${authority.stableId}`;
  return {
    schemaVersion: 1,
    boundaryId: id,
    capturedAt,
    candidateSha: sha,
    sourceTreeClean: true,
    operator: "me@davidhaile.com",
    activeAccount: "me@davidhaile.com",
    impersonation: false,
    github: {
      repository: authority.activeAuthority.nameWithOwner,
      repositoryId: authority.stableId,
      ownerId: authority.activeAuthority.ownerId,
      private: true,
      mainSha: sha,
      workflows: FROZEN_WORKFLOW_IDS.map((id) => ({
        id,
        state: "disabled_manually",
      })),
    },
    project: {
      projectId: b.projectId,
      projectNumber: b.projectNumber,
      lifecycleState: "ACTIVE",
      parent: { type: "organization", id: b.organizationId },
    },
    projectPolicy: { version: 1, etag: "project-etag", bindings: [] },
    pool: { name: poolName(b), state: "ACTIVE" },
    providers: boundaries
      .filter(
        (item) => item.projectId === b.projectId && item.poolId === b.poolId,
      )
      .map((item) => ({
        name: providerName(item),
        state: "ACTIVE",
        attributeMapping: structuredClone(item.attributeMapping),
        attributeCondition: item.formerCondition,
        oidc: { issuerUri: item.issuerUri },
      })),
    serviceAccount: {
      email: b.serviceAccount,
      uniqueId: "synthetic-controller",
    },
    serviceAccountPolicy: {
      etag: "controller-etag",
      bindings: [
        {
          role: "roles/iam.workloadIdentityUser",
          members: [
            `principalSet://iam.googleapis.com/${poolName(b)}/${principalSuffix}`,
          ],
        },
      ],
    },
    userManagedKeys: [],
  };
}
const review = (s) => reviewCutoverSnapshot(s, { now });

test("traffic review requires distinct operation principals in the shared pool", () => {
  for (const [id, otherEnvironment] of [
    ["staging-promotion", "staging-traffic-rollback"],
    ["staging-rollback", "staging-traffic-promotion"],
  ]) {
    const correct = fixture(id);
    assert.equal(review(correct).boundaryId, id);
    const b = boundaries.find((item) => item.id === id);
    for (const suffix of [
      `attribute.environment/${otherEnvironment}`,
      `attribute.repository_id/${authority.stableId}`,
      "attribute.environment/*",
    ]) {
      const changed = structuredClone(correct);
      changed.serviceAccountPolicy.bindings[0].members = [
        `principalSet://iam.googleapis.com/${poolName(b)}/${suffix}`,
      ];
      assert.throws(() => review(changed), /exact federation binding/);
    }
  }
});

function updated(s) {
  const out = structuredClone(s),
    b = boundaries.find((b) => b.id === s.boundaryId);
  out.providers.find((p) => p.name === providerName(b)).attributeCondition =
    b.targetCondition;
  return out;
}

test("catalog preserves eight separate controller boundaries and seven pools", () => {
  assert.equal(boundaries.length, 8);
  assert.equal(
    new Set(boundaries.map((b) => `${b.projectId}/${b.poolId}`)).size,
    7,
  );
  assert.equal(new Set(boundaries.map((b) => b.serviceAccount)).size, 8);
  assert.equal(
    boundaries.some((b) => b.id.includes("preview")),
    false,
  );
  for (const b of boundaries) {
    assert.ok(
      b.targetCondition.includes(authority.activeAuthority.nameWithOwner),
    );
    assert.ok(b.targetCondition.includes(authority.activeAuthority.ownerId));
    assert.ok(b.targetCondition.includes(authority.stableId));
    assert.ok(b.targetCondition.includes("assertion.workflow_ref=="));
    assert.ok(b.targetCondition.includes("assertion.environment=="));
    assert.ok(
      b.formerCondition.includes(authority.previousAuthority.nameWithOwner),
    );
    assert.equal(
      b.formerCondition.includes(authority.activeAuthority.nameWithOwner),
      false,
    );
  }
});

test("each former boundary yields a condition-only proposal and never apply authority", () => {
  for (const b of boundaries) {
    const snapshot = fixture(b.id),
      report = review(snapshot);
    assert.equal(report.changeNeeded, true);
    assert.equal(report.cloudApplyAuthorized, false);
    assert.equal(report.releaseResumptionAuthorized, false);
    assert.equal(report.snapshotSha256, hash(snapshot));
    assert.deepEqual(report.proposedCommand.args.slice(0, 5), [
      "iam",
      "workload-identity-pools",
      "providers",
      "update-oidc",
      b.providerId,
    ]);
    assert.deepEqual(report.proposedCommand.args.slice(5), [
      `--project=${b.projectId}`,
      "--location=global",
      `--workload-identity-pool=${b.poolId}`,
      "--account=me@davidhaile.com",
      `--attribute-condition=${b.targetCondition}`,
    ]);
    const observed = review(updated(snapshot));
    assert.equal(observed.changeNeeded, false);
    assert.equal(observed.proposedCommand, null);
    assert.equal(observed.independentFullIamAuditRequired, true);
  }
});

test("stale, mismatched, broadened or incomplete snapshots cannot produce a plan", async (t) => {
  const mutations = {
    stale: (s) => {
      s.capturedAt = new Date(now - 900_001).toISOString();
    },
    future: (s) => {
      s.capturedAt = new Date(now + 1).toISOString();
    },
    dirty: (s) => {
      s.sourceTreeClean = false;
    },
    nonExactSha: (s) => {
      s.candidateSha = "main";
    },
    movedMain: (s) => {
      s.github.mainSha = "b".repeat(40);
    },
    formerOwner: (s) => {
      s.github.ownerId = authority.previousAuthority.ownerId;
    },
    wrongAccount: (s) => {
      s.activeAccount = "someone@example.invalid";
    },
    impersonation: (s) => {
      s.impersonation = true;
    },
    publicRepository: (s) => {
      s.github.private = false;
    },
    workflowEnabled: (s) => {
      s.github.workflows[0].state = "active";
    },
    duplicateWorkflow: (s) => {
      s.github.workflows.push({ ...s.github.workflows[0], state: "active" });
    },
    wrongOrganization: (s) => {
      s.project.parent.id = "1";
    },
    projectDeleted: (s) => {
      s.project.lifecycleState = "DELETE_REQUESTED";
    },
    poolDisabled: (s) => {
      s.pool.disabled = true;
    },
    missingProvider: (s) => {
      s.providers = [];
    },
    unexpectedProvider: (s) => {
      s.providers.push({ ...s.providers[0], name: "unexpected" });
    },
    duplicateProvider: (s) => {
      s.providers.push(s.providers[0]);
    },
    dualCondition: (s) => {
      s.providers[0].attributeCondition += " || true";
    },
    wildcardCondition: (s) => {
      s.providers[0].attributeCondition = "assertion.repository.startsWith('')";
    },
    customAudience: (s) => {
      s.providers[0].oidc.allowedAudiences = ["custom"];
    },
    malformedAudience: (s) => {
      s.providers[0].oidc.allowedAudiences = "";
    },
    offlineIssuerKey: (s) => {
      s.providers[0].oidc.jwksJson = "{}";
    },
    changedMapping: (s) => {
      s.providers[0].attributeMapping["google.subject"] = "'anyone'";
    },
    serviceKey: (s) => {
      s.userManagedKeys.push({ name: "synthetic-key" });
    },
    disabledController: (s) => {
      s.serviceAccount.disabled = true;
    },
    missingIam: (s) => {
      delete s.projectPolicy.bindings;
    },
    missingFederation: (s) => {
      s.serviceAccountPolicy.bindings = [];
    },
    extraPrincipal: (s) => {
      s.serviceAccountPolicy.bindings[0].members.push("allUsers");
    },
    extraFederation: (s) => {
      s.serviceAccountPolicy.bindings.push(s.serviceAccountPolicy.bindings[0]);
    },
    conditionalBinding: (s) => {
      s.serviceAccountPolicy.bindings[0].condition = { expression: "true" };
    },
  };
  for (const [name, mutate] of Object.entries(mutations))
    await t.test(name, () => {
      const s = fixture();
      mutate(s);
      assert.throws(() => review(s));
    });
});

test("read-back accepts only the selected condition change and keeps release blocked", () => {
  const before = fixture("staging-promotion"),
    after = updated(before);
  const result = verifyCutoverSnapshots(before, after, { now });
  assert.equal(result.status, "consistent-post-cutover-snapshots");
  assert.equal(result.signedCloudAttestation, false);
  assert.equal(result.releaseResumptionAuthorized, false);
  assert.equal(result.changed, true);
  assert.equal(verifyCutoverSnapshots(after, after, { now }).changed, false);
  assert.throws(
    () => verifyCutoverSnapshots(before, before, { now }),
    /former authority/,
  );
  for (const mutate of [
    (s) => {
      s.projectPolicy.bindings.push({
        role: "roles/owner",
        members: ["user:extra@example.invalid"],
      });
    },
    (s) => {
      s.serviceAccountPolicy.etag = "changed";
    },
    (s) => {
      s.candidateSha = "b".repeat(40);
      s.github.mainSha = s.candidateSha;
    },
    (s) => {
      s.operator = s.activeAccount = "operator@davidhaile.com";
    },
    (s) => {
      const rollback = boundaries.find((b) => b.id === "staging-rollback");
      s.providers.find(
        (p) => p.name === providerName(rollback),
      ).attributeCondition = rollback.targetCondition;
    },
  ]) {
    const changed = structuredClone(after);
    mutate(changed);
    assert.throws(() => verifyCutoverSnapshots(before, changed, { now }));
  }
});

test("project-wide service-account access cannot produce a cutover proposal", () => {
  for (const id of ["staging-publication", "production-preflight"]) {
    for (const role of [
      "roles/iam.serviceAccountTokenCreator",
      "roles/iam.serviceAccountOpenIdTokenCreator",
      "roles/iam.workloadIdentityUser",
      "roles/iam.serviceAccountUser",
    ]) {
      for (const condition of [undefined, { expression: "false" }]) {
        const snapshot = fixture(id);
        snapshot.projectPolicy.bindings.push({
          role,
          members: ["serviceAccount:synthetic-sdk@example.invalid"],
          ...(condition ? { condition } : {}),
        });
        assert.throws(
          () => review(snapshot),
          /inherited service-account access/,
        );
        assert.throws(
          () => verifyCutoverSnapshots(snapshot, updated(snapshot), { now }),
          /inherited service-account access/,
        );
      }
    }
  }
});

test("an exact federation binding cannot conceal another direct controller grant", () => {
  for (const role of [
    "roles/iam.serviceAccountTokenCreator",
    "roles/iam.serviceAccountUser",
    "roles/iam.serviceAccountAdmin",
    "projects/synthetic/roles/customSigner",
  ]) {
    const snapshot = fixture();
    snapshot.serviceAccountPolicy.bindings.push({
      role,
      members: ["user:synthetic@example.invalid"],
    });
    assert.throws(() => review(snapshot), /only the exact federation binding/);
  }
});

test("malformed project IAM is rejected without treating it as no access", () => {
  for (const binding of [
    null,
    {},
    { role: "roles/viewer" },
    { role: "roles/viewer", members: [] },
    { role: "roles/viewer", members: [null] },
  ]) {
    const snapshot = fixture();
    snapshot.projectPolicy.bindings.push(binding);
    assert.throws(() => review(snapshot), /Project IAM is malformed/);
  }
});

test("unrelated project grants still require an independent full IAM audit", () => {
  const snapshot = fixture();
  snapshot.projectPolicy.bindings.push({
    role: "roles/viewer",
    members: ["user:synthetic@example.invalid"],
  });
  assert.equal(review(snapshot).independentFullIamAuditRequired, true);
});

test("capture invokes metadata reads only and binds the active human, main and freeze", () => {
  const s = fixture("staging-publication", new Date().toISOString());
  const calls = [];
  const run = (file, args) => {
    calls.push([file, ...args]);
    if (file === "git") return args.includes("rev-parse") ? sha : "";
    if (file === "gh") {
      if (args[1].includes("/branches/"))
        return JSON.stringify({ commit: { sha } });
      if (args.includes("--paginate"))
        return JSON.stringify([{ workflows: s.github.workflows }]);
      return JSON.stringify({
        full_name: s.github.repository,
        id: Number(s.github.repositoryId),
        owner: { id: Number(s.github.ownerId) },
        private: true,
      });
    }
    const cmd = args.join(" ");
    if (args[0] === "auth") return JSON.stringify([{ account: s.operator }]);
    if (args[0] === "config") return "(unset)";
    const result = cmd.startsWith("projects describe")
      ? s.project
      : cmd.startsWith("projects get-iam-policy")
        ? s.projectPolicy
        : cmd.startsWith("iam workload-identity-pools describe")
          ? s.pool
          : cmd.startsWith("iam workload-identity-pools providers list")
            ? s.providers
            : cmd.startsWith("iam service-accounts describe")
              ? s.serviceAccount
              : cmd.startsWith("iam service-accounts get-iam-policy")
                ? s.serviceAccountPolicy
                : cmd.startsWith("iam service-accounts keys list")
                  ? s.userManagedKeys
                  : undefined;
    assert.notEqual(result, undefined, `Unexpected command ${cmd}`);
    assert.ok(args.includes(`--account=${s.operator}`));
    assert.ok(args.includes(`--project=${s.project.projectId}`));
    return JSON.stringify(result);
  };
  const snapshot = captureCutoverSnapshot(
    { boundaryId: s.boundaryId, candidateSha: sha, operator: s.operator },
    run,
  );
  assert.equal(snapshot.github.mainSha, sha);
  assert.equal(snapshot.sourceTreeClean, true);
  assert.equal(
    calls.some((args) =>
      args.some((arg) =>
        /update-oidc|set-iam-policy|secrets|versions.*access|enable|create|delete/.test(
          arg,
        ),
      ),
    ),
    false,
  );
  const failure = new Error("synthetic metadata read failure");
  assert.throws(
    () =>
      captureCutoverSnapshot(
        { boundaryId: s.boundaryId, candidateSha: sha, operator: s.operator },
        () => {
          throw failure;
        },
      ),
    (error) => error === failure,
  );
});

test("CLI has no apply mode and refuses raw metadata within the repository", () => {
  const script = "deploy/gcp/review-github-authority-cutover.mjs";
  const apply = spawnSync(process.execPath, [script, "apply"], {
    encoding: "utf8",
  });
  assert.equal(apply.status, 1);
  assert.match(apply.stderr, /No apply mode exists/);
  const capture = spawnSync(
    process.execPath,
    [
      script,
      "capture",
      "staging-publication",
      sha,
      "me@davidhaile.com",
      "raw-snapshot.json",
    ],
    { encoding: "utf8" },
  );
  assert.equal(capture.status, 1);
  assert.match(capture.stderr, /outside the repository/);
});
