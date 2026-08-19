import assert from "node:assert/strict";
import test from "node:test";
import { loadApiRuntimeConfig } from "./config";

test("internal operations are default-off and require the explicit safe demo boundary", () => {
  const disabled = loadApiRuntimeConfig({ NODE_ENV: "test" });
  assert.equal(disabled.internalOperationsEnabled, false);
  assert.deepEqual(disabled.customerAuth, { mode: "disabled" });

  const enabled = loadApiRuntimeConfig({
    NODE_ENV: "test",
    SAMRA_BACKEND_MODE: "demo",
    SAMRA_PROVIDER_MODE: "fake",
    SAMRA_PERSISTENCE_MODE: "postgres",
    SAMRA_INTERNAL_OPERATIONS_ENABLED: "true",
  });
  assert.equal(enabled.internalOperationsEnabled, true);
});

test("Auth0 customer mode is explicit, PostgreSQL-backed, and locked to an exact RS256 issuer and audience", () => {
  const config = loadApiRuntimeConfig({
    NODE_ENV: "test",
    SAMRA_BACKEND_MODE: "demo",
    SAMRA_PROVIDER_MODE: "fake",
    SAMRA_PERSISTENCE_MODE: "postgres",
    SAMRA_CUSTOMER_AUTH_MODE: "auth0",
    AUTH0_ISSUER_BASE_URL: "https://samra-test.us.auth0.com",
    AUTH0_AUDIENCE: "https://api.samrapay.test",
  });
  assert.deepEqual(config.customerAuth, {
    mode: "auth0",
    issuerBaseUrl: "https://samra-test.us.auth0.com/",
    audience: "https://api.samrapay.test",
    tokenSigningAlgorithm: "RS256",
  });
});

test("Auth0 customer mode fails closed on unsafe runtime or incomplete trust configuration", () => {
  assert.throws(
    () =>
      loadApiRuntimeConfig({
        NODE_ENV: "test",
        SAMRA_BACKEND_MODE: "demo",
        SAMRA_PERSISTENCE_MODE: "memory",
        SAMRA_CUSTOMER_AUTH_MODE: "auth0",
        AUTH0_ISSUER_BASE_URL: "https://samra-test.us.auth0.com/",
        AUTH0_AUDIENCE: "https://api.samrapay.test",
      }),
    /requires demo backend mode with PostgreSQL persistence/,
  );
  assert.throws(
    () =>
      loadApiRuntimeConfig({
        NODE_ENV: "test",
        SAMRA_BACKEND_MODE: "demo",
        SAMRA_PERSISTENCE_MODE: "postgres",
        SAMRA_CUSTOMER_AUTH_MODE: "auth0",
        AUTH0_ISSUER_BASE_URL: "http://samra-test.us.auth0.com/",
        AUTH0_AUDIENCE: "https://api.samrapay.test",
      }),
    /must be an HTTPS origin/,
  );
  assert.throws(
    () =>
      loadApiRuntimeConfig({
        NODE_ENV: "test",
        SAMRA_BACKEND_MODE: "demo",
        SAMRA_PERSISTENCE_MODE: "postgres",
        SAMRA_CUSTOMER_AUTH_MODE: "auth0",
        AUTH0_ISSUER_BASE_URL: "https://samra-test.us.auth0.com/tenant",
        AUTH0_AUDIENCE: "https://api.samrapay.test",
      }),
    /without credentials, a path, query, or fragment/,
  );
  assert.throws(
    () =>
      loadApiRuntimeConfig({
        NODE_ENV: "test",
        SAMRA_BACKEND_MODE: "demo",
        SAMRA_PERSISTENCE_MODE: "postgres",
        SAMRA_CUSTOMER_AUTH_MODE: "auth0",
        AUTH0_ISSUER_BASE_URL: "https://samra-test.us.auth0.com/",
      }),
    /AUTH0_AUDIENCE is required/,
  );
  assert.throws(
    () =>
      loadApiRuntimeConfig({
        NODE_ENV: "test",
        SAMRA_BACKEND_MODE: "demo",
        SAMRA_PERSISTENCE_MODE: "postgres",
        SAMRA_CUSTOMER_AUTH_MODE: "auth0",
        AUTH0_ISSUER_BASE_URL: "https://samra-test.us.auth0.com/",
        AUTH0_AUDIENCE: "https://api.samrapay.test unexpected",
      }),
    /exact API identifier without whitespace/,
  );
  assert.throws(
    () =>
      loadApiRuntimeConfig({
        NODE_ENV: "test",
        SAMRA_CUSTOMER_AUTH_MODE: "other",
      }),
    /must be "disabled" or "auth0"/,
  );
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
