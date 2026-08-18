import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  PostgresLedgerControl,
  PostgresLedgerJournalWriter,
  PostgresPersistenceContext,
  createDatabase,
} from "@workspace/db";

const connectionString = process.env["TEST_DATABASE_URL"];
if (!connectionString) {
  throw new Error(
    "TEST_DATABASE_URL is required for PostgreSQL balance computation tests.",
  );
}

const connection = createDatabase({ connectionString });
const context = new PostgresPersistenceContext(connection.pool);
const journals = new PostgresLedgerJournalWriter(context);
const ledger = new PostgresLedgerControl(context);

test.after(async () => {
  await connection.pool.end();
});

test("CLAUDE-LED-040 Account balance equals aggregated postings on the correct normal side", async () => {
  await withinRollback(async () => {
    const account = await createFundedAccount("normal-side", 50_000n);

    await journals.post({
      eventType: "ledger_assurance_capture",
      eventId: account.fixtureId,
      description: "Synthetic balance capture",
      postings: [
        [account.accountCode, "debit", 10_300n],
        ["clearing_remittance_principal_usd", "credit", 10_000n],
        ["liability_deferred_remittance_fee_usd", "credit", 300n],
      ],
      metadata: { synthetic: "true", testCase: "CLAUDE-LED-040" },
    });
    await journals.post({
      eventType: "ledger_assurance_refund",
      eventId: account.fixtureId,
      description: "Synthetic balance refund",
      postings: [
        ["clearing_remittance_principal_usd", "debit", 10_000n],
        ["liability_deferred_remittance_fee_usd", "debit", 300n],
        [account.accountCode, "credit", 10_300n],
      ],
      metadata: { synthetic: "true", testCase: "CLAUDE-LED-040" },
    });

    const computed = await ledger.getCustomerBalance(account.accountRef);
    const manual = await context.query().query<{ balance_minor: string }>(
      `SELECT COALESCE(sum(
         CASE WHEN p.side = a.normal_side THEN p.amount_minor ELSE -p.amount_minor END
       ), 0)::text AS balance_minor
       FROM samra_core.ledger_accounts a
       LEFT JOIN samra_core.ledger_postings p ON p.account_id = a.id
       LEFT JOIN samra_core.ledger_journals j
         ON j.id = p.journal_id AND j.state IN ('posted','reversed')
       WHERE a.code = $1
       GROUP BY a.id`,
      [account.accountCode],
    );

    assert.equal(computed.naturalBalanceMinor, 50_000n);
    assert.equal(BigInt(manual.rows[0]!.balance_minor), 50_000n);
    assert.equal(
      computed.naturalBalanceMinor,
      BigInt(manual.rows[0]!.balance_minor),
    );
  });
});

test("CLAUDE-LED-041 Balance includes posted journals only", async () => {
  await withinRollback(async () => {
    const account = await createFundedAccount("posted-only", 50_000n);
    const journal = await context.query().query<{ id: string }>(
      `INSERT INTO samra_core.ledger_journals
       (business_event_type, business_event_id, currency, state, description, metadata)
       VALUES ('ledger_assurance_draft',$1,'USD','draft',
               'Synthetic draft balance journal','{"synthetic":true}'::jsonb)
       RETURNING id`,
      [account.fixtureId],
    );
    await context.query().query(
      `INSERT INTO samra_core.ledger_postings
       (journal_id, account_id, sequence, side, amount_minor)
       SELECT $1::uuid, id, 1, 'debit'::samra_core.ledger_entry_side, 1000
       FROM samra_core.ledger_accounts WHERE code = $2
       UNION ALL
       SELECT $1::uuid, id, 2, 'credit'::samra_core.ledger_entry_side, 1000
       FROM samra_core.ledger_accounts WHERE code = 'control_rain_usd'`,
      [journal.rows[0]!.id, account.accountCode],
    );

    assert.equal(
      (await ledger.getCustomerBalance(account.accountRef)).naturalBalanceMinor,
      50_000n,
    );

    await context.query().query(
      `UPDATE samra_core.ledger_journals
       SET state = 'posted', posted_at = now()
       WHERE id = $1 AND state = 'draft'`,
      [journal.rows[0]!.id],
    );

    assert.equal(
      (await ledger.getCustomerBalance(account.accountRef)).naturalBalanceMinor,
      49_000n,
    );
  });
});

test("CLAUDE-LED-042 Available balance equals posted balance minus active holds", async () => {
  await withinRollback(async () => {
    const account = await createFundedAccount("available-balance", 50_000n);
    const transferId = `balance-hold:${account.fixtureId}`;
    const { holdId } = await ledger.reserve({
      transferId,
      accountId: account.accountRef,
      amountMinor: 10_000n,
      principalAmountMinor: 10_000n,
      feeAmountMinor: 0n,
      currency: "USD",
      idempotencyKey: `reserve:${account.fixtureId}`,
    });

    assert.deepEqual(await ledger.getCustomerBalance(account.accountRef), {
      naturalBalanceMinor: 50_000n,
      activeHoldsMinor: 10_000n,
      availableMinor: 40_000n,
    });

    await ledger.release({
      transferId,
      holdId,
      idempotencyKey: `release:${account.fixtureId}`,
    });

    assert.deepEqual(await ledger.getCustomerBalance(account.accountRef), {
      naturalBalanceMinor: 50_000n,
      activeHoldsMinor: 0n,
      availableMinor: 50_000n,
    });
  });
});

async function createFundedAccount(label: string, openingMinor: bigint) {
  const fixtureId = `${label}:${randomUUID()}`;
  const accountRef = `assurance_product:${fixtureId}`;
  const accountCode = `assurance_liability:${fixtureId}`;
  const product = await context.query().query<{ id: string }>(
    `INSERT INTO samra_core.product_accounts
     (customer_id, external_ref, kind, currency)
     SELECT id, $1, 'domestic_cash', 'USD'
     FROM samra_core.customers WHERE external_ref = 'demo_customer_001'
     RETURNING id`,
    [accountRef],
  );
  assert.equal(product.rowCount, 1);
  await context.query().query(
    `INSERT INTO samra_core.ledger_accounts
     (code, name, account_class, normal_side, currency, product_account_id)
     VALUES ($1,$2,'liability','credit','USD',$3)`,
    [accountCode, `Synthetic assurance ${label}`, product.rows[0]!.id],
  );
  await journals.post({
    eventType: "ledger_assurance_opening",
    eventId: fixtureId,
    description: "Synthetic assurance opening balance",
    postings: [
      ["control_rain_usd", "debit", openingMinor],
      [accountCode, "credit", openingMinor],
    ],
    metadata: { synthetic: "true", fixtureId },
  });
  return { fixtureId, accountRef, accountCode };
}

async function withinRollback(operation: () => Promise<void>): Promise<void> {
  const rollback = new RollbackAfterAssurance();
  await assert.rejects(
    context.run(async () => {
      await operation();
      throw rollback;
    }),
    (error) => error === rollback,
  );
}

class RollbackAfterAssurance extends Error {}
