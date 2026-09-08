import assert from "node:assert/strict";
import test from "node:test";
import { loadApiRuntimeConfig } from "./config";
import { createApp } from "./app";
import { DemoRuntime } from "./domain/demo-runtime";

const environment = {
  NODE_ENV: "test",
  SAMRA_RELEASE_PROFILE: "alpha-release-1",
  SAMRA_ALLOWED_ORIGINS: "https://app.samra.test",
  SAMRA_BACKEND_MODE: "demo",
  SAMRA_PERSISTENCE_MODE: "postgres",
  SAMRA_CUSTOMER_AUTH_MODE: "auth0",
  AUTH0_ISSUER_BASE_URL: "https://alpha.samra.test/",
  AUTH0_AUDIENCE: "https://api.samra.test",
};

test("alpha profile disables developer decisions and cannot run financial workers or operations", () => {
  const config = loadApiRuntimeConfig(environment);
  assert.equal(config.releaseProfile, "alpha-release-1");
  assert.equal(config.devControlsEnabled, false);
  assert.equal(config.runWorker, false);
  assert.equal(config.internalOperationsEnabled, false);
  assert.deepEqual(config.customerIdentityProvider, { mode: "fake" });
  assert.deepEqual(config.customerWalletProvider, { mode: "fake" });
  for (const overrides of [
    { SAMRA_RELEASE_PROFILE: "alpha" },
    { SAMRA_BACKEND_MODE: "disabled" },
    { SAMRA_CUSTOMER_AUTH_MODE: "disabled" },
    { SAMRA_PERSISTENCE_MODE: "memory" },
    { SAMRA_RUN_WORKER: "true" },
    { SAMRA_INTERNAL_OPERATIONS_ENABLED: "true" },
    { SAMRA_CUSTOMER_IDENTITY_PROVIDER_MODE: "persona-production" },
    { SAMRA_CUSTOMER_WALLET_PROVIDER_MODE: "crossmint-production" },
  ])
    assert.throws(() => loadApiRuntimeConfig({ ...environment, ...overrides }));
});

test("alpha router fails closed when durable access is not wired", () => {
  assert.throws(
    () => createApp(loadApiRuntimeConfig(environment), new DemoRuntime()),
    /requires durable admission/,
  );
});
