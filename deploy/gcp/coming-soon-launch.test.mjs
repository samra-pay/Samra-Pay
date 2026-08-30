import assert from "node:assert/strict";
import test from "node:test";
import {
  readComingSoonLaunch,
  validateComingSoonLaunch,
} from "./validate-coming-soon-launch.mjs";

test("validates the review-only coming-soon launch boundary", () => {
  assert.deepEqual(validateComingSoonLaunch(), {
    schemaVersion: 1,
    status: "validated-review-only",
    launchPhase: "production-coming-soon",
    publicRouteCount: 1,
    deploymentAuthorized: false,
    dnsAuthorized: false,
  });
});

test("rejects staging reuse, public product APIs, and unapproved DNS", () => {
  for (const mutate of [
    (value) => (value.productionBoundary.projectId = "samra-pay-staging"),
    (value) =>
      value.services["samra-customer-web"].publicApiRoutes.push(
        "GET /api/v1/me",
      ),
    (value) => (value.data.stagingDatabaseReuseAllowed = true),
    (value) => (value.dnsCutover.changesAuthorized = true),
  ]) {
    const contract = structuredClone(readComingSoonLaunch());
    mutate(contract);
    assert.throws(() => validateComingSoonLaunch(contract));
  }
});

test("rejects vendor activation and lost rollback controls", () => {
  const contract = structuredClone(readComingSoonLaunch());
  contract.services["samra-api"].environment.SAMRA_CUSTOMER_AUTH_MODE = "auth0";
  assert.throws(() => validateComingSoonLaunch(contract), /vendors dormant/);

  const rollbackDrift = structuredClone(readComingSoonLaunch());
  rollbackDrift.release.priorRevisionRequired = false;
  assert.throws(() => validateComingSoonLaunch(rollbackDrift), /rollback/);
});
