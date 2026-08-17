import assert from "node:assert/strict";
import test from "node:test";
import { loadApiRuntimeConfig } from "./config";

test("internal operations are default-off and require the explicit safe demo boundary", () => {
  const disabled = loadApiRuntimeConfig({ NODE_ENV: "test" });
  assert.equal(disabled.internalOperationsEnabled, false);

  const enabled = loadApiRuntimeConfig({
    NODE_ENV: "test",
    SAMRA_BACKEND_MODE: "demo",
    SAMRA_PROVIDER_MODE: "fake",
    SAMRA_PERSISTENCE_MODE: "postgres",
    SAMRA_INTERNAL_OPERATIONS_ENABLED: "true",
  });
  assert.equal(enabled.internalOperationsEnabled, true);
});

test("internal operations cannot be enabled in memory or production mode", () => {
  assert.throws(
    () =>
      loadApiRuntimeConfig({
        NODE_ENV: "test",
        SAMRA_BACKEND_MODE: "demo",
        SAMRA_PROVIDER_MODE: "fake",
        SAMRA_PERSISTENCE_MODE: "memory",
        SAMRA_INTERNAL_OPERATIONS_ENABLED: "true",
      }),
    /requires non-production demo\/fake mode with PostgreSQL persistence/,
  );
  assert.throws(
    () =>
      loadApiRuntimeConfig({
        NODE_ENV: "production",
        SAMRA_BACKEND_MODE: "demo",
        SAMRA_PROVIDER_MODE: "fake",
        SAMRA_PERSISTENCE_MODE: "postgres",
        SAMRA_INTERNAL_OPERATIONS_ENABLED: "true",
      }),
    /requires non-production demo\/fake mode with PostgreSQL persistence/,
  );
});
