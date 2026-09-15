import assert from "node:assert/strict";
import test from "node:test";
import {
  readCustomerProductEnvironments,
  validateCustomerProductEnvironments,
} from "./validate-customer-product-environments.mjs";

const contract = readCustomerProductEnvironments();

test("validates the complete customer product promotion boundary", () => {
  assert.deepEqual(validateCustomerProductEnvironments(contract), {
    schemaVersion: 1,
    status: "validated",
    cloudEnvironmentCount: 4,
    releaseStageCount: 8,
    productionReleaseAuthorized: false,
    realMoneyAuthorized: false,
  });
});

test("keeps public marketing separate from the customer application", () => {
  assert.equal(contract.publicSurface.marketingRemainsIndependent, true);
  assert.equal(contract.publicSurface.marketingReplacementAuthorized, false);
  assert.notEqual(
    contract.publicSurface.marketingOrigin,
    contract.publicSurface.customerApplicationOrigin,
  );
});

test("rejects project, mobile, release-order and authorization drift", () => {
  for (const mutate of [
    (value) => (value.cloudEnvironments.test.projectId = "samra-pay-dev"),
    (value) =>
      (value.cloudEnvironments.staging.apiAudience =
        "https://api.samrapay.com"),
    (value) => (value.cloudEnvironments.test.providerClass = "sandbox-only"),
    (value) => value.releaseSequence.reverse(),
    (value) => (value.releaseSequence[6].environment = "test"),
    (value) => (value.publicSurface.marketingReplacementAuthorized = true),
    (value) =>
      (value.productionCustomerRelease.customerTrafficAuthorized = true),
    (value) => (value.productionCustomerRelease.realMoneyAuthorized = true),
    (value) => (value.isolationRules.productionDataCopiedDownAllowed = true),
  ]) {
    const changed = structuredClone(contract);
    mutate(changed);
    assert.throws(() => validateCustomerProductEnvironments(changed));
  }
});

test("requires identity and wallet proof before any money-movement pilot", () => {
  const ids = contract.releaseSequence.map(({ id }) => id);
  assert.ok(
    ids.indexOf("invited-identity-wallet-alpha") <
      ids.indexOf("limited-money-movement-pilot"),
  );
  assert.deepEqual(contract.productionCustomerRelease.alphaCapabilities, [
    "login",
    "identity-verification",
    "wallet-creation",
  ]);
  assert.ok(
    contract.productionCustomerRelease.alphaExcludedCapabilities.includes(
      "transfers",
    ),
  );
});
