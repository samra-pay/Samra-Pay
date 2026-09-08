import assert from "node:assert/strict";
import test from "node:test";
import { loadApiRuntimeConfig } from "./config";

test("internal operations are default-off and require the explicit safe demo boundary", () => {
  const disabled = loadApiRuntimeConfig({ NODE_ENV: "test" });
  assert.equal(disabled.internalOperationsEnabled, false);
  assert.deepEqual(disabled.customerAuth, { mode: "disabled" });
  assert.deepEqual(disabled.customerIdentityProvider, { mode: "fake" });

  const enabled = loadApiRuntimeConfig({
    NODE_ENV: "test",
    SAMRA_BACKEND_MODE: "demo",
    SAMRA_PROVIDER_MODE: "fake",
    SAMRA_PERSISTENCE_MODE: "postgres",
    SAMRA_INTERNAL_OPERATIONS_ENABLED: "true",
  });
  assert.equal(enabled.internalOperationsEnabled, true);
});

test("Persona sandbox mode is explicit, Auth0-bound, PostgreSQL-backed, and rotation ready", () => {
  const config = loadApiRuntimeConfig({
    NODE_ENV: "production",
    SAMRA_BACKEND_MODE: "demo",
    SAMRA_PROVIDER_MODE: "fake",
    SAMRA_PERSISTENCE_MODE: "postgres",
    SAMRA_CUSTOMER_AUTH_MODE: "auth0",
    AUTH0_ISSUER_BASE_URL: "https://samra-test.us.auth0.com",
    AUTH0_AUDIENCE: "https://api.samrapay.test",
    SAMRA_CUSTOMER_IDENTITY_PROVIDER_MODE: "persona-sandbox",
    PERSONA_API_KEY: "persona_sandbox_test_key_123456789",
    PERSONA_INQUIRY_TEMPLATE_ID: "itmpl_AbCdEf123456",
    PERSONA_ENVIRONMENT_ID: "env_AbCdEf123456",
    PERSONA_WEBHOOK_SECRET: "current_webhook_secret_123456",
    PERSONA_WEBHOOK_SECRET_PREVIOUS: "previous_webhook_secret_123456",
  });
  assert.deepEqual(config.customerIdentityProvider, {
    mode: "persona-sandbox",
    apiKey: "persona_sandbox_test_key_123456789",
    inquiryTemplateId: "itmpl_AbCdEf123456",
    environmentId: "env_AbCdEf123456",
    webhookSecrets: [
      "current_webhook_secret_123456",
      "previous_webhook_secret_123456",
    ],
    apiVersion: "2025-10-27",
  });
});

test("Persona sandbox mode fails closed on incomplete, production, or unsafe trust configuration", () => {
  const base = {
    NODE_ENV: "production",
    SAMRA_BACKEND_MODE: "demo",
    SAMRA_PROVIDER_MODE: "fake",
    SAMRA_PERSISTENCE_MODE: "postgres",
    SAMRA_CUSTOMER_AUTH_MODE: "auth0",
    AUTH0_ISSUER_BASE_URL: "https://samra-test.us.auth0.com",
    AUTH0_AUDIENCE: "https://api.samrapay.test",
    SAMRA_CUSTOMER_IDENTITY_PROVIDER_MODE: "persona-sandbox",
    PERSONA_API_KEY: "persona_sandbox_test_key_123456789",
    PERSONA_INQUIRY_TEMPLATE_ID: "itmpl_AbCdEf123456",
    PERSONA_ENVIRONMENT_ID: "env_AbCdEf123456",
    PERSONA_WEBHOOK_SECRET: "current_webhook_secret_123456",
  } as const;
  assert.throws(
    () =>
      loadApiRuntimeConfig({
        ...base,
        SAMRA_CUSTOMER_AUTH_MODE: "disabled",
      }),
    /requires Auth0 customer mode with PostgreSQL persistence/,
  );
  assert.throws(
    () =>
      loadApiRuntimeConfig({
        ...base,
        PERSONA_API_KEY: "persona_production_must_not_be_accepted",
      }),
    /must be a Persona sandbox key/,
  );
  assert.throws(
    () =>
      loadApiRuntimeConfig({
        ...base,
        PERSONA_WEBHOOK_SECRET_PREVIOUS: "current_webhook_secret_123456",
      }),
    /must be different during rotation/,
  );
  assert.throws(
    () =>
      loadApiRuntimeConfig({
        ...base,
        SAMRA_CUSTOMER_IDENTITY_PROVIDER_MODE: "persona-production",
      }),
    /production mode is not implemented/,
  );
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

test("API origins deny by default and accept only canonical bare HTTPS origins", () => {
  for (const value of [undefined, "", "   "]) {
    assert.deepEqual(
      loadApiRuntimeConfig({ SAMRA_ALLOWED_ORIGINS: value }).allowedOrigins,
      [],
    );
  }
  assert.deepEqual(
    loadApiRuntimeConfig({ SAMRA_ALLOWED_ORIGINS: "https://app.samra.test" })
      .allowedOrigins,
    ["https://app.samra.test"],
  );
  assert.deepEqual(
    loadApiRuntimeConfig({
      SAMRA_ALLOWED_ORIGINS:
        "https://app.samra.test, https://ops.samra.test:8443",
    }).allowedOrigins,
    ["https://app.samra.test", "https://ops.samra.test:8443"],
  );
  for (const origin of [
    "http://app.samra.test",
    "https://app.samra.test/path",
    "https://app.samra.test/",
    "https://user:pass@app.samra.test",
    "https://app.samra.test?x=1",
    "https://app.samra.test#x",
    "https://app.samra.test?",
    "null",
    "*",
    "app.samra.test",
    "https://app.samra.test,",
    "https://app.samra.test/../",
  ]) {
    assert.throws(
      () => loadApiRuntimeConfig({ SAMRA_ALLOWED_ORIGINS: origin }),
      /SAMRA_ALLOWED_ORIGINS/,
    );
  }
});

test("Alpha Release 1 requires at least one allowed origin", () => {
  const alpha = {
    SAMRA_RELEASE_PROFILE: "alpha-release-1",
    SAMRA_BACKEND_MODE: "demo",
    SAMRA_PERSISTENCE_MODE: "postgres",
    SAMRA_CUSTOMER_AUTH_MODE: "auth0",
    AUTH0_ISSUER_BASE_URL: "https://auth.samra.test",
    AUTH0_AUDIENCE: "https://api.samra.test",
  };
  for (const origin of [undefined, ""]) {
    assert.throws(
      () => loadApiRuntimeConfig({ ...alpha, SAMRA_ALLOWED_ORIGINS: origin }),
      /requires at least one SAMRA_ALLOWED_ORIGINS/,
    );
  }
  assert.equal(
    loadApiRuntimeConfig({
      ...alpha,
      SAMRA_ALLOWED_ORIGINS: "https://app.samra.test",
    }).releaseProfile,
    "alpha-release-1",
  );
});

test("proxy trust defaults off and requires explicit bounded IPs or CIDRs", () => {
  for (const value of [undefined, "", "false"]) {
    assert.equal(
      loadApiRuntimeConfig({ SAMRA_TRUSTED_PROXIES: value }).trustedProxies,
      false,
    );
  }
  assert.deepEqual(
    loadApiRuntimeConfig({
      SAMRA_TRUSTED_PROXIES: "127.0.0.1, 10.20.0.0/24, ::1, fd00::/64",
    }).trustedProxies,
    ["127.0.0.1", "10.20.0.0/24", "::1", "fd00::/64"],
  );
  for (const value of [
    "true",
    "1",
    "loopback",
    "*",
    "0.0.0.0/0",
    "::/0",
    "10.0.0.0/33",
    "::1/129",
    "::1/",
    "127.0.0.1,",
    "10.0.0.1/24/3",
  ]) {
    assert.throws(
      () => loadApiRuntimeConfig({ SAMRA_TRUSTED_PROXIES: value }),
      /SAMRA_TRUSTED_PROXIES/,
    );
  }
});
