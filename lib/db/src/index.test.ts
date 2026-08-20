import assert from "node:assert/strict";
import test from "node:test";
import { createDatabase, DATABASE_POOL_DEFAULTS } from "./index";

test("bounds the default database pool for horizontally scaled runtimes", async () => {
  assert.deepEqual(DATABASE_POOL_DEFAULTS, {
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

  const connection = createDatabase({
    connectionString: "postgresql://unused:unused@127.0.0.1:1/unused",
  });
  try {
    assert.equal(connection.pool.options.max, 5);
    assert.equal(connection.pool.options.idleTimeoutMillis, 30_000);
    assert.equal(connection.pool.options.connectionTimeoutMillis, 10_000);
    assert.equal(connection.pool.totalCount, 0);
  } finally {
    await connection.pool.end();
  }
});

test("keeps explicit test pool overrides available", async () => {
  const connection = createDatabase({
    connectionString: "postgresql://unused:unused@127.0.0.1:1/unused",
    poolConfig: { max: 2 },
  });
  try {
    assert.equal(connection.pool.options.max, 2);
    assert.equal(connection.pool.options.idleTimeoutMillis, 30_000);
    assert.equal(connection.pool.totalCount, 0);
  } finally {
    await connection.pool.end();
  }
});
