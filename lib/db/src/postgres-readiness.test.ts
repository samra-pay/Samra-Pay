import assert from "node:assert/strict";
import test from "node:test";
import type pg from "pg";
import { assertPostgresRuntimeReady } from "./postgres-readiness";

test("sandbox startup requires its validated constraint and enabled mapping guard", async () => {
  for (const ready of [false, undefined, true]) {
    let calls = 0;
    const pool = {
      async query() {
        calls++;
        return {
          rows: calls === 1 ? [] : ready === undefined ? [] : [{ ready }],
        };
      },
    } as unknown as Pick<pg.Pool, "query">;
    const check = assertPostgresRuntimeReady(pool, {
      customerControlledSandboxWallets: true,
    });
    if (ready === true) await check;
    else await assert.rejects(check, /sandbox wallet migration is not ready/);
    assert.equal(calls, 2);
  }
});

test("default synthetic startup does not require the sandbox migration", async () => {
  let calls = 0;
  const pool = {
    async query() {
      calls++;
      return { rows: [] };
    },
  } as unknown as Pick<pg.Pool, "query">;
  await assertPostgresRuntimeReady(pool);
  assert.equal(calls, 1);
});
