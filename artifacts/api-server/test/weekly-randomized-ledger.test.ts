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
  seededRandom,
} from "./weekly-resilience-fixtures";

const connectionString = process.env["TEST_DATABASE_URL"];
if (!connectionString) {
  throw new Error(
    "TEST_DATABASE_URL is required for randomized ledger testing.",
  );
}

const steps = requiredPositiveInteger("WEEKLY_RANDOM_STEPS", 96, 500);
const seed = requiredPositiveInteger("WEEKLY_RANDOM_SEED", 23063, 0xffffffff);
const random = seededRandom(seed);
const database = createDatabase({ connectionString, poolConfig: { max: 8 } });
const context = new PostgresPersistenceContext(database.pool);
const ledger = new PostgresLedgerControl(context);

test.after(async () => database.pool.end());

test("RESILIENCE-WEEKLY-002 seeded randomized sequences match the reference balance model", async () => {
  const openingMinor = BigInt(steps * 6_000);
  const fixture = await prepareFundedAccount(
    context,
    `randomized-seed-${seed}`,
    openingMinor,
  );
  let expectedNaturalMinor = openingMinor;
  const transferIds: string[] = [];

  for (let index = 0; index < steps; index += 1) {
    const totalMinor = BigInt(100 + (random() % 4_901));
    const feeMinor = BigInt(random() % 101);
    const principalMinor = totalMinor - feeMinor;
    assert.ok(principalMinor > 0n);
    assert.ok(expectedNaturalMinor >= totalMinor);
    const transferId = `weekly-random:${seed}:${index}:${randomUUID()}`;
    transferIds.push(transferId);
    const command = reserveCommand(
      fixture,
      transferId,
      principalMinor,
      feeMinor,
    );
    const hold = await ledger.reserve(command);
    for (let replay = 0; replay < random() % 3; replay += 1) {
      assert.deepEqual(await ledger.reserve(command), hold);
    }

    const outcome = random() % 4;
    if (outcome === 0) {
      const release = {
        transferId,
        holdId: hold.holdId,
        idempotencyKey: `${transferId}:release`,
      };
      await ledger.release(release);
      await ledger.release(release);
    } else {
      const capture = {
        transferId,
        holdId: hold.holdId,
        idempotencyKey: `${transferId}:capture`,
      };
      await ledger.capture(capture);
      await ledger.capture(capture);
      expectedNaturalMinor -= totalMinor;

      if (outcome >= 2) {
        const settlement = {
          transferId,
          amountMinor: principalMinor,
          currency: "USD" as const,
          idempotencyKey: `${transferId}:settle`,
        };
        await ledger.settlePrincipal(settlement);
        await ledger.settlePrincipal(settlement);
        if (feeMinor > 0n) {
          const recognition = {
            transferId,
            amountMinor: feeMinor,
            currency: "USD" as const,
            idempotencyKey: `${transferId}:fee`,
          };
          await ledger.recognizeFee(recognition);
          await ledger.recognizeFee(recognition);
        }
      }

      if (outcome === 3) {
        const refund = {
          transferId,
          amountMinor: totalMinor,
          currency: "USD" as const,
          idempotencyKey: `${transferId}:refund`,
        };
        await ledger.refund(refund);
        await ledger.refund(refund);
        expectedNaturalMinor += totalMinor;
      }
    }

    if ((index + 1) % 12 === 0) {
      assert.deepEqual(await ledger.getCustomerBalance(fixture.accountRef), {
        naturalBalanceMinor: expectedNaturalMinor,
        activeHoldsMinor: 0n,
        availableMinor: expectedNaturalMinor,
      });
    }
  }

  assert.deepEqual(await ledger.getCustomerBalance(fixture.accountRef), {
    naturalBalanceMinor: expectedNaturalMinor,
    activeHoldsMinor: 0n,
    availableMinor: expectedNaturalMinor,
  });
  const evidence = await database.pool.query<{
    covered_transfers: string;
    active_holds: string;
  }>(
    `SELECT
       (SELECT count(DISTINCT correlation_id)
        FROM samra_core.audit_events
        WHERE correlation_id = ANY($1::text[])
          AND action IN ('ledger_hold_reserved','ledger_hold_captured',
                         'ledger_hold_released','ledger_journal_reversed'))::text
         AS covered_transfers,
       (SELECT count(*) FROM samra_core.ledger_holds
        WHERE business_event_id = ANY($1::text[]) AND state = 'active')::text
         AS active_holds`,
    [transferIds],
  );
  assert.deepEqual(evidence.rows[0], {
    covered_transfers: String(steps),
    active_holds: "0",
  });
  await assertLedgerHealthy(
    database,
    context,
    `weekly-randomized:${seed}:${randomUUID()}`,
  );
});
