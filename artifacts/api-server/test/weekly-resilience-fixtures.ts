import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  PostgresLedgerBalanceProjection,
  PostgresLedgerJournalWriter,
  type PostgresPersistenceContext,
  type createDatabase,
} from "@workspace/db";

export type OpenedDatabase = ReturnType<typeof createDatabase>;

export type FundedAccount = Readonly<{
  accountRef: string;
  accountCode: string;
  productAccountId: string;
  openingMinor: bigint;
}>;

export function requiredPositiveInteger(
  name: string,
  fallback: number,
  maximum: number,
): number {
  const raw = process.env[name];
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${name} must be an integer from 1 through ${maximum}.`);
  }
  return value;
}

export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  if (state === 0) state = 0x6d2b79f5;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
}

export async function prepareFundedAccount(
  context: PostgresPersistenceContext,
  label: string,
  openingMinor: bigint,
): Promise<FundedAccount> {
  const unique = `${label}:${randomUUID()}`;
  const accountRef = `weekly-product:${unique}`;
  const accountCode = `weekly-liability:${unique}`;
  const product = await context.query().query<{ id: string }>(
    `INSERT INTO samra_core.product_accounts
     (customer_id, external_ref, kind, currency)
     SELECT id, $1, 'domestic_cash', 'USD'
     FROM samra_core.customers WHERE external_ref = 'demo_customer_001'
     RETURNING id`,
    [accountRef],
  );
  await context.query().query(
    `INSERT INTO samra_core.ledger_accounts
     (code, name, account_class, normal_side, currency, product_account_id)
     VALUES ($1,$2,'liability','credit','USD',$3)`,
    [accountCode, `Weekly resilience ${label}`, product.rows[0]!.id],
  );
  await new PostgresLedgerJournalWriter(context).post({
    eventType: "weekly_resilience_opening",
    eventId: unique,
    description: "Synthetic weekly resilience opening balance",
    postings: [
      ["control_rain_usd", "debit", openingMinor],
      [accountCode, "credit", openingMinor],
    ],
    metadata: { synthetic: "true", fixtureId: unique },
  });
  return Object.freeze({
    accountRef,
    accountCode,
    productAccountId: product.rows[0]!.id,
    openingMinor,
  });
}

export function reserveCommand(
  fixture: FundedAccount,
  transferId: string,
  principalAmountMinor: bigint,
  feeAmountMinor = 0n,
) {
  return {
    transferId,
    accountId: fixture.accountRef,
    amountMinor: principalAmountMinor + feeAmountMinor,
    principalAmountMinor,
    feeAmountMinor,
    currency: "USD" as const,
    idempotencyKey: `${transferId}:reserve`,
  };
}

export async function assertLedgerHealthy(
  database: OpenedDatabase,
  context: PostgresPersistenceContext,
  sweepRef: string,
): Promise<void> {
  const structural = await database.pool.query<{
    unbalanced_journals: string;
    malformed_holds: string;
    duplicate_terminal_events: string;
    negative_available: string;
  }>(
    `SELECT
       (SELECT count(*) FROM (
          SELECT journal.id
          FROM samra_core.ledger_journals journal
          JOIN samra_core.ledger_postings posting ON posting.journal_id = journal.id
          WHERE journal.state IN ('posted','reversed')
          GROUP BY journal.id
          HAVING sum(CASE WHEN posting.side = 'debit'
                          THEN posting.amount_minor ELSE -posting.amount_minor END) <> 0
       ) broken)::text AS unbalanced_journals,
       (SELECT count(*) FROM samra_core.ledger_holds
        WHERE (state = 'active' AND terminal_at IS NOT NULL)
           OR (state <> 'active' AND terminal_at IS NULL))::text AS malformed_holds,
       (SELECT count(*) FROM (
          SELECT hold_id
          FROM samra_core.ledger_hold_events
          WHERE event_type IN ('captured','released')
          GROUP BY hold_id HAVING count(*) > 1
       ) duplicated)::text AS duplicate_terminal_events,
       (SELECT count(*)
        FROM samra_core.ledger_account_balances balance
        JOIN samra_core.ledger_accounts account ON account.id = balance.account_id
        WHERE account.allow_negative_available = false
          AND balance.available_balance_minor < 0)::text AS negative_available`,
  );
  assert.deepEqual(structural.rows[0], {
    unbalanced_journals: "0",
    malformed_holds: "0",
    duplicate_terminal_events: "0",
    negative_available: "0",
  });
  const drift = await new PostgresLedgerBalanceProjection(context).verify({
    sweepRef,
    actorType: "system",
    actorId: "weekly-backend-resilience",
  });
  assert.deepEqual(drift, []);
}
