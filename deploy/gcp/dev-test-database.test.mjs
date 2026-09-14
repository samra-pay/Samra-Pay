import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  attestMigrationHistory,
  configuration,
  connection,
  drain,
  loadExpectedMigrationHistory,
  migrateDatabase,
  validateMigrationHistory,
} from "../../lib/db/src/dev-test-database.mjs";

const databaseRows = (history) =>
  history.map(({ createdAt, hash }) => ({ created_at: createdAt, hash }));

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

test("migration attestation loads the exact current journal and SQL hashes", async () => {
  const expected = await loadExpectedMigrationHistory();
  assert.equal(expected.length, 22);
  assert.equal(expected[0].tag, "0000_samra_core_foundation");
  assert.equal(expected.at(-1).tag, "0021_customer_wallet_control_setup");
  assert(
    expected.every(
      ({ createdAt, hash }, position) =>
        /^\d+$/.test(createdAt) &&
        /^[a-f0-9]{64}$/.test(hash) &&
        (position === 0 || +createdAt > +expected[position - 1].createdAt),
    ),
  );
  assert(Object.isFrozen(expected));
  assert(expected.every(Object.isFrozen));
});

test("pre-migration attestation accepts only an exact journal prefix", async () => {
  const expected = await loadExpectedMigrationHistory();
  const empty = validateMigrationHistory([], expected, "before");
  assert.deepEqual(empty, {
    status: "validated",
    phase: "before",
    migrationCount: 0,
    current: false,
  });

  const through0018 = databaseRows(expected.slice(0, 19));
  assert.deepEqual(validateMigrationHistory(through0018, expected, "before"), {
    status: "validated",
    phase: "before",
    migrationCount: 19,
    current: false,
  });
  assert.equal(
    validateMigrationHistory(databaseRows(expected), expected, "before")
      .current,
    true,
  );
});

test("post-migration attestation requires every current journal entry", async () => {
  const expected = await loadExpectedMigrationHistory();
  assert.deepEqual(
    validateMigrationHistory(databaseRows(expected), expected, "after"),
    {
      status: "validated",
      phase: "after",
      migrationCount: expected.length,
      current: true,
    },
  );
  assert.throws(
    () =>
      validateMigrationHistory(
        databaseRows(expected.slice(0, -1)),
        expected,
        "after",
      ),
    /incomplete after migration/,
  );
});

test("migration attestation rejects missing, reordered, drifted and future rows", async () => {
  const expected = await loadExpectedMigrationHistory();
  const current = databaseRows(expected);

  assert.throws(
    () =>
      validateMigrationHistory(
        [...current.slice(0, 4), ...current.slice(5)],
        expected,
        "before",
      ),
    /missing or out of order at position 5/,
  );

  const reordered = current.map((row) => ({ ...row }));
  [reordered[4], reordered[5]] = [reordered[5], reordered[4]];
  assert.throws(
    () => validateMigrationHistory(reordered, expected, "before"),
    /missing or out of order at position 5/,
  );

  const drifted = current.map((row) => ({ ...row }));
  drifted[18].hash = drifted[18].hash.replace(/^./, (value) =>
    value === "0" ? "1" : "0",
  );
  assert.throws(
    () => validateMigrationHistory(drifted, expected, "before"),
    /hash drifted for 0018_alpha_release_admission/,
  );

  const malformed = current.map((row) => ({ ...row }));
  malformed[0].hash = "not-a-sha256";
  assert.throws(
    () => validateMigrationHistory(malformed, expected, "before"),
    /invalid hash at position 1/,
  );

  assert.throws(
    () =>
      validateMigrationHistory(
        [...current, { created_at: "9999999999999", hash: "f".repeat(64) }],
        expected,
        "before",
      ),
    /unrecognized future migration/,
  );
});

test("database attestation handles a new database and reads initialized rows in id order", async () => {
  const expected = await loadExpectedMigrationHistory();
  const absentQueries = [];
  const absent = {
    async query(sql) {
      absentQueries.push(sql);
      return { rows: [{ present: false }] };
    },
  };
  assert.equal(
    (await attestMigrationHistory(absent, expected, "before")).migrationCount,
    0,
  );
  await assert.rejects(
    attestMigrationHistory(absent, expected, "after"),
    /incomplete after migration/,
  );
  assert.equal(absentQueries.length, 2);

  const queries = [];
  const initialized = {
    async query(sql) {
      queries.push(sql);
      if (queries.length === 1) return { rows: [{ present: true }] };
      return { rows: databaseRows(expected) };
    },
  };
  assert.equal(
    (await attestMigrationHistory(initialized, expected, "after")).current,
    true,
  );
  assert.match(queries[0], /to_regclass/);
  assert.match(queries[1], /ORDER BY id/);
});

test("migration execution attests the 0018 prefix and the current journal afterward", async () => {
  const expected = await loadExpectedMigrationHistory();
  let rows = databaseRows(expected.slice(0, 19));
  const operations = [];
  const client = {
    async query(sql) {
      if (sql.includes("to_regclass")) {
        operations.push("relation");
        return { rows: [{ present: true }] };
      }
      operations.push("history");
      return { rows };
    },
  };
  const drizzleDatabase = Object.freeze({ kind: "test-database" });
  const result = await migrateDatabase(client, {
    drizzle(value) {
      assert.equal(value, client);
      return drizzleDatabase;
    },
    async migrate(database, options) {
      operations.push("migrate");
      assert.equal(database, drizzleDatabase);
      assert.equal(options.migrationsSchema, "samra_migrations");
      assert.equal(options.migrationsTable, "migration_history");
      assert.match(options.migrationsFolder, /lib\/db\/drizzle\/?$/);
      rows = databaseRows(expected);
    },
  });
  assert.deepEqual(operations, [
    "relation",
    "history",
    "migrate",
    "relation",
    "history",
  ]);
  assert.equal(result.before.migrationCount, 19);
  assert.equal(result.after.migrationCount, 22);
  assert.equal(result.after.current, true);
});

test("migration execution fails when the migrator does not record the full journal", async () => {
  const expected = await loadExpectedMigrationHistory();
  const rows = databaseRows(expected.slice(0, 19));
  const client = {
    async query(sql) {
      return sql.includes("to_regclass")
        ? { rows: [{ present: true }] }
        : { rows };
    },
  };
  await assert.rejects(
    migrateDatabase(client, {
      drizzle: () => ({}),
      migrate: async () => {},
    }),
    /incomplete after migration/,
  );
});

test("migration execution stops before the migrator when existing history drifted", async () => {
  const expected = await loadExpectedMigrationHistory();
  const rows = databaseRows(expected.slice(0, 19));
  rows[18].hash = "0".repeat(64);
  if (rows[18].hash === expected[18].hash) rows[18].hash = "1".repeat(64);
  let migrateCalls = 0;
  const client = {
    async query(sql) {
      return sql.includes("to_regclass")
        ? { rows: [{ present: true }] }
        : { rows };
    },
  };
  await assert.rejects(
    migrateDatabase(client, {
      drizzle: () => ({}),
      migrate: async () => {
        migrateCalls++;
      },
    }),
    /hash drifted for 0018_alpha_release_admission/,
  );
  assert.equal(migrateCalls, 0);
});

test("database CLI does not print credentials or underlying errors", () => {
  const secret = `secret-${"x".repeat(64)}`;
  const script = fileURLToPath(
    new URL("../../lib/db/src/dev-test-database.mjs", import.meta.url),
  );
  const result = spawnSync(process.execPath, [script, "migrate"], {
    encoding: "utf8",
    env: {
      SAMRA_DEPLOYMENT_ENVIRONMENT: "production",
      GOOGLE_CLOUD_PROJECT: "samra-pay-production",
      DATABASE_URL: `postgresql://migration:${secret}@10.0.0.1:5432/db`,
    },
  });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /Dev\/Test database operation failed/);
  assert.doesNotMatch(result.stderr, new RegExp(secret));
  assert.doesNotMatch(result.stderr, /production|AssertionError|DATABASE_URL/);
});
