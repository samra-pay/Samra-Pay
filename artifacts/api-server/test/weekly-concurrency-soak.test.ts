import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  PostgresLedgerControl,
  PostgresPersistenceContext,
  createDatabase,
} from "@workspace/db";
import {
  assertLedgerHealthy,
  prepareFundedAccount,
  requiredPositiveInteger,
  reserveCommand,
} from "./weekly-resilience-fixtures";

const connectionString = process.env["TEST_DATABASE_URL"];
if (!connectionString) {
  throw new Error(
    "TEST_DATABASE_URL is required for the weekly concurrency soak.",
  );
}

const rounds = requiredPositiveInteger("WEEKLY_CONCURRENCY_ROUNDS", 24, 100);
const contenders = 8;
const connections = Array.from({ length: contenders }, () =>
  createDatabase({ connectionString, poolConfig: { max: 2 } }),
);
const controlConnection = createDatabase({ connectionString });
const controlContext = new PostgresPersistenceContext(controlConnection.pool);

test.after(async () => {
  await Promise.all([
    ...connections.map(({ pool }) => pool.end()),
    controlConnection.pool.end(),
  ]);
});

test("RESILIENCE-WEEKLY-001 concurrent reserve and terminal races remain atomic under soak", async () => {
  for (let round = 0; round < rounds; round += 1) {
    const fixture = await prepareFundedAccount(
      controlContext,
      `concurrency-${round}`,
      50_000n,
    );
    const attempts = await Promise.allSettled(
      connections.map(async (connection, contender) => {
        const transferId = `weekly-race:${round}:${contender}:${randomUUID()}`;
        const ledger = new PostgresLedgerControl(
          new PostgresPersistenceContext(connection.pool),
        );
        const hold = await ledger.reserve(
          reserveCommand(fixture, transferId, fixture.openingMinor),
        );
        return { transferId, holdId: hold.holdId };
      }),
    );
    const winners = attempts.filter(
      (
        attempt,
      ): attempt is PromiseFulfilledResult<{
        transferId: string;
        holdId: string;
      }> => attempt.status === "fulfilled",
    );
    assert.equal(
      winners.length,
      1,
      `round ${round} admitted more than one reserve`,
    );
    for (const rejection of attempts.filter(
      (attempt): attempt is PromiseRejectedResult =>
        attempt.status === "rejected",
    )) {
      assert.match(String(rejection.reason), /insufficient available funds/i);
    }

    const winner = winners[0]!.value;
    const terminalAttempts = await Promise.allSettled(
      connections.map((connection, contender) => {
        const ledger = new PostgresLedgerControl(
          new PostgresPersistenceContext(connection.pool),
        );
        return contender % 2 === 0
          ? ledger.capture({
              transferId: winner.transferId,
              holdId: winner.holdId,
              idempotencyKey: `${winner.transferId}:capture`,
            })
          : ledger.release({
              transferId: winner.transferId,
              holdId: winner.holdId,
              idempotencyKey: `${winner.transferId}:release`,
            });
      }),
    );
    assert.ok(
      terminalAttempts.some((attempt) => attempt.status === "fulfilled"),
      `round ${round} produced no terminal winner`,
    );

    const persisted = await controlConnection.pool.query<{
      state: "captured" | "released";
      hold_count: string;
      terminal_events: string;
      capture_journals: string;
    }>(
      `SELECT hold.state,
              (SELECT count(*) FROM samra_core.ledger_holds candidate
               WHERE candidate.product_account_id = hold.product_account_id)::text
                AS hold_count,
              (SELECT count(*) FROM samra_core.ledger_hold_events event
               WHERE event.hold_id = hold.id
                 AND event.event_type IN ('captured','released'))::text
                AS terminal_events,
              (SELECT count(*) FROM samra_core.ledger_journals journal
               WHERE journal.business_event_type = 'remittance_capture'
                 AND journal.business_event_id = $1)::text AS capture_journals
       FROM samra_core.ledger_holds hold
       WHERE hold.id = $2`,
      [winner.transferId, winner.holdId],
    );
    assert.equal(persisted.rows[0]!.hold_count, "1");
    assert.equal(persisted.rows[0]!.terminal_events, "1");
    assert.equal(
      persisted.rows[0]!.capture_journals,
      persisted.rows[0]!.state === "captured" ? "1" : "0",
    );
    const balance = await new PostgresLedgerControl(
      controlContext,
    ).getCustomerBalance(fixture.accountRef);
    assert.equal(balance.activeHoldsMinor, 0n);
    assert.equal(
      balance.naturalBalanceMinor,
      persisted.rows[0]!.state === "captured" ? 0n : fixture.openingMinor,
    );
  }

  await assertLedgerHealthy(
    controlConnection,
    controlContext,
    `weekly-concurrency:${randomUUID()}`,
  );
});
