import assert from "node:assert/strict";
import test from "node:test";

import {
  assertMinorUnits,
  parseSamraDataMode,
  selectSamraDataSource,
  type SamraDataSource,
} from "./index.ts";

function fakeSource(name: string): SamraDataSource {
  const never = async (): Promise<never> => {
    throw new Error("not exercised");
  };

  return {
    async getCurrentCustomer() {
      return { id: name, displayName: name, synthetic: true };
    },
    listAccounts: never,
    listActivity: never,
    listBeneficiaries: never,
    getRemittanceOptions: never,
    createQuote: never,
    createTransfer: never,
    getTransfer: never,
    listTransfers: never,
    cancelTransfer: never,
  };
}

test("missing data-mode variables preserve the current mock default", () => {
  assert.equal(parseSamraDataMode(undefined, "VITE_SAMRA_DATA_MODE"), "mock");
  assert.equal(parseSamraDataMode("", "VITE_SAMRA_DATA_MODE"), "mock");
});

test("known data modes are accepted and unknown values fail clearly", () => {
  assert.equal(parseSamraDataMode("api", "VITE_SAMRA_DATA_MODE"), "api");
  assert.equal(parseSamraDataMode("mock", "VITE_SAMRA_DATA_MODE"), "mock");
  assert.throws(
    () => parseSamraDataMode("mixed", "VITE_SAMRA_DATA_MODE"),
    /must be "mock" or "api"/,
  );
});

test("API mode never silently falls back to mock data", () => {
  const mock = fakeSource("mock");
  assert.throws(
    () => selectSamraDataSource("api", { mock }),
    /no API data source is configured/,
  );
});

test("selection returns only the explicitly requested source", async () => {
  const mock = fakeSource("mock");
  const api = fakeSource("api");

  assert.equal(
    (await selectSamraDataSource("mock", { mock, api }).getCurrentCustomer())
      .id,
    "mock",
  );
  assert.equal(
    (await selectSamraDataSource("api", { mock, api }).getCurrentCustomer()).id,
    "api",
  );
});

test("money strings reject decimals, signs and unsafe number formats", () => {
  assert.equal(assertMinorUnits("0"), "0");
  assert.equal(assertMinorUnits("425000"), "425000");
  for (const invalid of ["", "-1", "+1", "01", "1.00", "1e3"]) {
    assert.throws(() => assertMinorUnits(invalid));
  }
});
