import test from "node:test";
import assert from "node:assert/strict";
import {
  configuration,
  connection,
  drain,
} from "../../lib/db/src/dev-test-database.mjs";
test("database jobs reject wrong projects, roles, host ranges and TLS downgrade", () => {
  for (const name of ["dev", "test"]) {
    const cfg = configuration({
      SAMRA_DEPLOYMENT_ENVIRONMENT: name,
      GOOGLE_CLOUD_PROJECT: `samra-pay-${name}`,
    });
    const url = `postgresql://${cfg.runtime}:${"x".repeat(64)}@${cfg.prefix}0.3:5432/${cfg.database}?sslmode=verify-ca&sslrootcert=/secrets/ca/server-ca.pem&uselibpqcompat=true`;
    assert.equal(connection(url, cfg.runtime, cfg), url);
    for (const changed of [
      url.replace("verify-ca", "require"),
      url.replace(cfg.prefix, "10.41."),
      url.replace(cfg.runtime, cfg.migration),
      url.replace(cfg.database, "samra_production"),
      url.replace("uselibpqcompat=true", "uselibpqcompat=false"),
      url + "&sslcert=/other",
    ])
      assert.throws(() => connection(changed, cfg.runtime, cfg));
  }
  for (const name of ["staging", "production", ""])
    assert.throws(() =>
      configuration({
        SAMRA_DEPLOYMENT_ENVIRONMENT: name,
        GOOGLE_CLOUD_PROJECT: `samra-pay-${name}`,
      }),
    );
  assert.throws(() =>
    configuration({
      SAMRA_DEPLOYMENT_ENVIRONMENT: "dev",
      GOOGLE_CLOUD_PROJECT: "samra-pay-test",
    }),
  );
});
test("drain refuses each unresolved work category", async () => {
  const empty = {
    active_transfers: 0,
    active_holds: 0,
    unresolved_outbox: 0,
    unresolved_provider_events: 0,
  };
  await drain({ query: async () => ({ rows: [empty] }) });
  for (const key of Object.keys(empty))
    await assert.rejects(
      drain({ query: async () => ({ rows: [{ ...empty, [key]: 1 }] }) }),
    );
});
