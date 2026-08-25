import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  readStagingGithubEnterpriseMigration,
  readStagingPublicReadiness,
  validateStagingPublicReadiness,
} from "./validate-staging-public-readiness.mjs";

const root = process.cwd();
const contract = readStagingPublicReadiness();

function changed(mutate) {
  const copy = structuredClone(contract);
  mutate(copy);
  return copy;
}

test("validates portable public-edge, observability, and acquisition readiness", () => {
  assert.deepEqual(validateStagingPublicReadiness(contract, { root }), {
    schemaVersion: 1,
    status: "validated-prepared-not-authorized",
    stableRepositoryId: "1335175962",
    repositoryTransferRequiresInfrastructureRebuild: false,
    publicHost: "STAGING_CUSTOMER_HOST",
    directApiPublic: false,
    operationsPortalPublic: false,
    observabilityAlertCount: 6,
    activeCampaignCount: 0,
    activationAuthorized: false,
  });
});

test("uses only stable repository identity and delegates mutable authority", () => {
  const migration = readStagingGithubEnterpriseMigration();
  const source = readFileSync(
    "deploy/gcp/staging-public-readiness.json",
    "utf8",
  );

  assert.match(source, new RegExp(migration.repository.stableId, "u"));
  for (const authority of [
    migration.repository.activeAuthority.nameWithOwner,
    migration.repository.activeAuthority.ownerId,
    migration.repository.targetAuthority.nameWithOwner,
    migration.repository.targetAuthority.ownerId,
  ]) {
    assert.doesNotMatch(source, new RegExp(authority.replace("/", "\\/"), "u"));
  }
  assert.equal(
    contract.portability.repositoryTransferRequiresInfrastructureRebuild,
    false,
  );
  assert.equal(contract.portability.replitRequired, false);
});

test("keeps only customer web public while API and workforce surfaces stay private", () => {
  assert.equal(contract.publicEdge.routing.customerWeb.allowed, true);
  assert.equal(contract.publicEdge.routing.sameOriginApiProxy.allowed, true);
  assert.equal(contract.publicEdge.routing.directApi.allowed, false);
  assert.equal(contract.publicEdge.routing.operationsPortal.allowed, false);
  assert.equal(contract.publicEdge.routing.designSystemPreview.allowed, false);
  assert.equal(
    contract.publicEdge.customerWebRuntimeDelta.apiRemainsIamAuthenticated,
    true,
  );
  assert.equal(
    contract.publicEdge.customerWebRuntimeDelta
      .activationRequiresSeparateReviewedChange,
    true,
  );
});

test("separates synthetic public health from private API verification", () => {
  assert.deepEqual(contract.observability.publicProbe.expectedJson, {
    status: "ok",
  });
  assert.equal(
    contract.observability.publicProbe.realProviderCallAllowed,
    false,
  );
  assert.equal(
    contract.observability.publicProbe.customerRecordCreationAllowed,
    false,
  );
  assert.equal(
    contract.observability.privateProbe.requiresServiceIdentity,
    true,
  );
  assert.equal(
    new Set(contract.observability.alerts.map(({ id }) => id)).size,
    6,
  );
  assert.ok(contract.observability.forbiddenLogFields.includes("customer PII"));
});

test("keeps owned acquisition telemetry disabled until governance and abuse gates pass", () => {
  assert.equal(contract.acquisitionActivation.activationAuthorized, false);
  assert.equal(contract.acquisitionActivation.vendorIndependent, true);
  assert.equal(contract.acquisitionActivation.marketingExportAuthorized, false);
  assert.deepEqual(contract.acquisitionActivation.activeCampaigns, []);
  assert.equal(
    contract.acquisitionActivation.ownedMilestone,
    "fifth-completed-remittance",
  );
  assert.equal(
    contract.acquisitionActivation.serverMilestonesDerivedFromCanonicalRecords,
    true,
  );
});

test("rejects premature, public, unmonitored, or vendor-coupled activation drift", () => {
  for (const mutate of [
    (value) => (value.activationAuthorized = true),
    (value) => (value.publicEdge.dnsMutationAuthorized = true),
    (value) => (value.publicEdge.trafficActivationAuthorized = true),
    (value) => (value.publicEdge.routing.directApi.allowed = true),
    (value) => (value.publicEdge.routing.operationsPortal.allowed = true),
    (value) =>
      (value.publicEdge.customerWebRuntimeDelta.defaultServiceUrlDisabled = false),
    (value) =>
      (value.publicEdge.customerWebRuntimeDelta.apiRemainsIamAuthenticated = false),
    (value) =>
      (value.publicEdge.security.cloudArmorRequiredBeforeTraffic = false),
    (value) => (value.publicEdge.security.requestBodyLimitImplemented = false),
    (value) => (value.publicEdge.security.requestBodyLimitBytes = 10_000_000),
    (value) => (value.observability.activationAuthorized = true),
    (value) => value.observability.alerts.pop(),
    (value) => (value.observability.publicProbe.realProviderCallAllowed = true),
    (value) => (value.acquisitionActivation.activationAuthorized = true),
    (value) =>
      (value.acquisitionActivation.activeCampaigns = ["unapproved_campaign"]),
    (value) => (value.acquisitionActivation.marketingExportAuthorized = true),
    (value) => (value.portability.replitRequired = true),
    (value) =>
      (value.portability.repositoryTransferRequiresInfrastructureRebuild = true),
    (value) => (value.costBoundary.incrementalMonthlyEstimateApproved = true),
  ]) {
    assert.throws(() => validateStagingPublicReadiness(changed(mutate)));
  }
});

test("runs an offline review with no mutation command", () => {
  const output = execFileSync(
    process.execPath,
    ["deploy/gcp/validate-staging-public-readiness.mjs"],
    { cwd: root, encoding: "utf8" },
  );
  assert.match(output, /validated-prepared-not-authorized/u);
  assert.match(
    output,
    /PUBLIC READINESS REVIEW PASS — NO CLOUD, DNS, OR VENDOR CHANGES/u,
  );
});
