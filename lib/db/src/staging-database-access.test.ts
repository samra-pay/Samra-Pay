import assert from "node:assert/strict";
import test from "node:test";
import {
  parseBootstrapPayload,
  STAGING_DATABASE_ACCESS,
} from "./staging-database-access";
import { parseStagingDatabaseAccessActionArguments } from "./staging-database-access-cli-arguments";

const password = "a".repeat(64);
const url = (user: string, host = "10.41.0.3") =>
  `postgresql://${user}:${password}@${host}:5432/samra_staging?sslmode=require`;

test("accepts three distinct, strong staging database identities", () => {
  const payload = parseBootstrapPayload(
    JSON.stringify({
      bootstrapDatabaseUrl: url(STAGING_DATABASE_ACCESS.bootstrapUser),
      migrationDatabaseUrl: url(STAGING_DATABASE_ACCESS.migrationUser),
      runtimeDatabaseUrl: url(STAGING_DATABASE_ACCESS.runtimeUser),
    }),
  );

  assert.equal(
    new URL(payload.runtimeDatabaseUrl).username,
    STAGING_DATABASE_ACCESS.runtimeUser,
  );
  assert.equal(
    new URL(payload.migrationDatabaseUrl).username,
    STAGING_DATABASE_ACCESS.migrationUser,
  );
});

test("rejects weak, shared, cross-instance, and wrong-user credentials", () => {
  const valid = {
    bootstrapDatabaseUrl: url(STAGING_DATABASE_ACCESS.bootstrapUser),
    migrationDatabaseUrl: url(STAGING_DATABASE_ACCESS.migrationUser),
    runtimeDatabaseUrl: url(STAGING_DATABASE_ACCESS.runtimeUser),
  };

  for (const mutate of [
    (value: typeof valid) => {
      value.runtimeDatabaseUrl = value.migrationDatabaseUrl;
    },
    (value: typeof valid) => {
      value.runtimeDatabaseUrl = url("wrong_user");
    },
    (value: typeof valid) => {
      value.runtimeDatabaseUrl =
        "postgresql://samra_runtime_staging:short@10.41.0.3:5432/samra_staging";
    },
    (value: typeof valid) => {
      value.runtimeDatabaseUrl = url(
        STAGING_DATABASE_ACCESS.runtimeUser,
        "10.41.0.4",
      );
    },
    (value: typeof valid) => {
      value.runtimeDatabaseUrl = url(
        STAGING_DATABASE_ACCESS.runtimeUser,
        "34.1.2.3",
      );
    },
    (value: typeof valid) => {
      value.runtimeDatabaseUrl = url(
        STAGING_DATABASE_ACCESS.runtimeUser,
      ).replace("?sslmode=require", "");
    },
  ]) {
    const candidate = structuredClone(valid);
    mutate(candidate);
    assert.throws(() => parseBootstrapPayload(JSON.stringify(candidate)));
  }
});

test("parses direct and pnpm-separated staging access actions", () => {
  assert.equal(
    parseStagingDatabaseAccessActionArguments(["bootstrap"]),
    "bootstrap",
  );
  assert.equal(
    parseStagingDatabaseAccessActionArguments(["--", "audit-runtime"]),
    "audit-runtime",
  );
  assert.throws(() => parseStagingDatabaseAccessActionArguments([]));
  assert.throws(() =>
    parseStagingDatabaseAccessActionArguments(["bootstrap", "finalize"]),
  );
});
