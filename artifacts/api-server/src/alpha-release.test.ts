import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { loadApiRuntimeConfig } from "./config";
import { createApp } from "./app";
import { DemoRuntime } from "./domain/demo-runtime";

const environment = {
  NODE_ENV: "test",
  SAMRA_RELEASE_PROFILE: "alpha-release-1",
  SAMRA_BACKEND_MODE: "demo",
  SAMRA_PERSISTENCE_MODE: "postgres",
  SAMRA_CUSTOMER_AUTH_MODE: "auth0",
  AUTH0_ISSUER_BASE_URL: "https://alpha.samra.test/",
  AUTH0_AUDIENCE: "https://api.samra.test",
};

test("the actual staging deployment selects invite-only access with no financial worker", () => {
  const contract = JSON.parse(
    readFileSync(
      new URL(
        "../../../deploy/gcp/staging-runtime-contract.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const controller = readFileSync(
    new URL(
      "../../../deploy/gcp/deploy-staging-zero-traffic.sh",
      import.meta.url,
    ),
    "utf8",
  );
  const assignment = controller.match(
    /--set-env-vars="([^"]*SAMRA_CUSTOMER_AUTH_MODE=auth0[^"]*)"/u,
  );
  assert.ok(assignment, "Missing API deployment environment");
  const deployedEnvironment = Object.fromEntries(
    assignment[1]!.split(",").map((entry) => {
      const separator = entry.indexOf("=");
      return [entry.slice(0, separator), entry.slice(separator + 1)];
    }),
  );
  for (const candidate of [
    contract.services["samra-api"].environment,
    deployedEnvironment,
  ]) {
    const config = loadApiRuntimeConfig({
      ...candidate,
      AUTH0_ISSUER_BASE_URL: environment.AUTH0_ISSUER_BASE_URL,
      AUTH0_AUDIENCE: environment.AUTH0_AUDIENCE,
    });
    assert.equal(config.releaseProfile, "alpha-release-1");
    assert.equal(config.persistenceMode, "postgres");
    assert.equal(config.runWorker, false);
    assert.equal(config.devControlsEnabled, false);
    assert.equal(config.internalOperationsEnabled, false);
    assert.deepEqual(config.customerIdentityProvider, { mode: "fake" });
    assert.deepEqual(config.customerWalletProvider, { mode: "fake" });
  }
});

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
