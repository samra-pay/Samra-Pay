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

test("alpha startup checks its migration and closed-or-open control row without mutating it", async () => {
  for (const ready of [false, true]) {
    let calls = 0;
    const pool = {
      async query(sql: string, params?: readonly unknown[]) {
        calls++;
        assert.match(sql.trim(), /^SELECT/u);
        if (calls === 1) {
          assert.ok(
            JSON.stringify(params).includes("samra_core.alpha_admissions"),
          );
          return { rows: [] };
        }
        return { rows: [{ ready }] };
      },
    } as unknown as Pick<pg.Pool, "query">;
    const check = assertPostgresRuntimeReady(pool, {
      alphaReleaseAdmission: true,
    });
    if (ready) await check;
    else await assert.rejects(check, /alpha admission migration is not ready/);
  }
});
