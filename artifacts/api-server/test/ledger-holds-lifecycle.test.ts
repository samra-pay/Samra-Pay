import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  PostgresLedgerControl,
  PostgresLedgerJournalWriter,
  PostgresPersistenceContext,
  createDatabase,
} from "@workspace/db";
import { DomainError } from "@workspace/remittance";

const connectionString = process.env["TEST_DATABASE_URL"];
if (!connectionString) {
  throw new Error(
    "TEST_DATABASE_URL is required for PostgreSQL hold lifecycle tests.",
  );
}

const connection = createDatabase({ connectionString });
const context = new PostgresPersistenceContext(connection.pool);
const journals = new PostgresLedgerJournalWriter(context);
const ledger = new PostgresLedgerControl(context);

test.after(async () => {
  await connection.pool.end();
});

test("CLAUDE-LED-025 Reserve creates an active hold and reduces available balance only", async () => {
  await withinRollback(async () => {
    const account = await createFundedAccount("reserve", 50_000n);
    const transferId = `hold-reserve:${account.fixtureId}`;
    const { holdId } = await reserve({
      transferId,
      accountRef: account.accountRef,
      principalMinor: 10_000n,
    });

    assert.deepEqual(await ledger.getCustomerBalance(account.accountRef), {
      naturalBalanceMinor: 50_000n,
      activeHoldsMinor: 10_000n,
      availableMinor: 40_000n,
    });

    const hold = await context.query().query<{
      state: string;
      terminal_at: Date | null;
      amount_minor: string;
      capture_journals: string;
    }>(
      `SELECT h.state, h.terminal_at, h.amount_minor::text,
              (SELECT count(*) FROM samra_core.ledger_journals
               WHERE business_event_type = 'remittance_capture'
                 AND business_event_id = $2)::text AS capture_journals
       FROM samra_core.ledger_holds h WHERE h.id = $1`,
      [holdId, transferId],
    );
    assert.deepEqual(hold.rows[0], {
      state: "active",
      terminal_at: null,
      amount_minor: "10000",
      capture_journals: "0",
    });
  });
});

test("CLAUDE-LED-026 Capture posts principal and fee and terminates the hold", async () => {
  await withinRollback(async () => {
    const account = await createFundedAccount("capture", 50_000n);
    const transferId = `hold-capture:${account.fixtureId}`;
    const { holdId } = await reserve({
      transferId,
      accountRef: account.accountRef,
      principalMinor: 10_000n,
      feeMinor: 300n,
    });

    await ledger.capture({
      transferId,
      holdId,
      idempotencyKey: `${transferId}:capture`,
    });

    const lifecycle = await context.query().query<{
      state: string;
      terminal_at: Date | null;
      journal_id: string | null;
      event_count: string;
    }>(
      `SELECT h.state, h.terminal_at, max(e.journal_id::text) AS journal_id,
              count(e.id)::text AS event_count
       FROM samra_core.ledger_holds h
       LEFT JOIN samra_core.ledger_hold_events e
         ON e.hold_id = h.id AND e.event_type = 'captured'
       WHERE h.id = $1
       GROUP BY h.id`,
      [holdId],
    );
    assert.equal(lifecycle.rows[0]!.state, "captured");
    assert.ok(lifecycle.rows[0]!.terminal_at instanceof Date);
    assert.ok(lifecycle.rows[0]!.journal_id);
    assert.equal(lifecycle.rows[0]!.event_count, "1");

    const postings = await context.query().query<{
      code: string;
      side: "debit" | "credit";
      amount_minor: string;
    }>(
      `SELECT a.code, p.side, p.amount_minor::text
       FROM samra_core.ledger_postings p
       JOIN samra_core.ledger_accounts a ON a.id = p.account_id
       WHERE p.journal_id = $1
       ORDER BY p.sequence`,
      [lifecycle.rows[0]!.journal_id],
    );
    assert.deepEqual(postings.rows, [
      { code: account.accountCode, side: "debit", amount_minor: "10300" },
      {
        code: "clearing_remittance_principal_usd",
        side: "credit",
        amount_minor: "10000",
      },
      {
        code: "liability_deferred_remittance_fee_usd",
        side: "credit",
        amount_minor: "300",
      },
    ]);
    assert.deepEqual(await ledger.getCustomerBalance(account.accountRef), {
      naturalBalanceMinor: 39_700n,
      activeHoldsMinor: 0n,
      availableMinor: 39_700n,
    });
  });
});

test("CLAUDE-LED-027 Release restores available balance without posting a journal", async () => {
  await withinRollback(async () => {
    const account = await createFundedAccount("release", 50_000n);
    const transferId = `hold-release:${account.fixtureId}`;
    const { holdId } = await reserve({
      transferId,
      accountRef: account.accountRef,
      principalMinor: 10_000n,
    });

    await ledger.release({
      transferId,
      holdId,
      idempotencyKey: `${transferId}:release`,
    });

    assert.deepEqual(await ledger.getCustomerBalance(account.accountRef), {
      naturalBalanceMinor: 50_000n,
      activeHoldsMinor: 0n,
      availableMinor: 50_000n,
    });
    const state = await context.query().query<{
      state: string;
      terminal_at: Date | null;
      release_events: string;
      release_journals: string;
    }>(
      `SELECT h.state, h.terminal_at,
              (SELECT count(*) FROM samra_core.ledger_hold_events
               WHERE hold_id = $1 AND event_type = 'released'
                 AND journal_id IS NULL)::text AS release_events,
              (SELECT count(*) FROM samra_core.ledger_journals
               WHERE business_event_id = $2)::text AS release_journals
       FROM samra_core.ledger_holds h WHERE h.id = $1`,
      [holdId, transferId],
    );
    assert.equal(state.rows[0]!.state, "released");
    assert.ok(state.rows[0]!.terminal_at instanceof Date);
    assert.equal(state.rows[0]!.release_events, "1");
    assert.equal(state.rows[0]!.release_journals, "0");
  });
});

test("CLAUDE-LED-028 Double capture of the same hold is idempotent", async () => {
  await withinRollback(async () => {
    const account = await createFundedAccount("double-capture", 50_000n);
    const transferId = `hold-double-capture:${account.fixtureId}`;
    const { holdId } = await reserve({
      transferId,
      accountRef: account.accountRef,
      principalMinor: 10_000n,
      feeMinor: 300n,
    });
    const command = {
      transferId,
      holdId,
      idempotencyKey: `${transferId}:capture`,
    };

    await ledger.capture(command);
    await ledger.capture(command);

    const persisted = await context.query().query<{
      journal_count: string;
      posting_count: string;
      event_count: string;
      hold_state: string;
    }>(
      `SELECT
         (SELECT count(*) FROM samra_core.ledger_journals
          WHERE business_event_type = 'remittance_capture'
            AND business_event_id = $2)::text AS journal_count,
         (SELECT count(*) FROM samra_core.ledger_postings p
          JOIN samra_core.ledger_journals j ON j.id = p.journal_id
          WHERE j.business_event_type = 'remittance_capture'
            AND j.business_event_id = $2)::text AS posting_count,
         (SELECT count(*) FROM samra_core.ledger_hold_events
          WHERE hold_id = $1 AND event_type = 'captured')::text AS event_count,
         (SELECT state::text FROM samra_core.ledger_holds
          WHERE id = $1) AS hold_state`,
      [holdId, transferId],
    );
    assert.deepEqual(persisted.rows[0], {
      journal_count: "1",
      posting_count: "3",
      event_count: "1",
      hold_state: "captured",
    });
  });
});

test("CLAUDE-LED-030 Reserve cannot exceed available balance including existing holds", async () => {
  await withinRollback(async () => {
    const account = await createFundedAccount("reserve-boundary", 10_000n);

    await assert.rejects(
      reserve({
        transferId: `hold-over:${account.fixtureId}`,
        accountRef: account.accountRef,
        principalMinor: 15_000n,
      }),
      insufficientFunds,
    );

    await reserve({
      transferId: `hold-exact:${account.fixtureId}`,
      accountRef: account.accountRef,
      principalMinor: 10_000n,
    });
    assert.equal(
      (await ledger.getCustomerBalance(account.accountRef)).availableMinor,
      0n,
    );

    await assert.rejects(
      reserve({
        transferId: `hold-penny:${account.fixtureId}`,
        accountRef: account.accountRef,
        principalMinor: 1n,
      }),
      insufficientFunds,
    );

    const active = await context.query().query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM samra_core.ledger_holds h
       JOIN samra_core.product_accounts a ON a.id = h.product_account_id
       WHERE a.external_ref = $1 AND h.state = 'active'`,
      [account.accountRef],
    );
    assert.equal(active.rows[0]!.count, "1");
  });
});

test("CLAUDE-LED-029 Capture of an already-released hold must be rejected before any journal is posted", async () => {
  await withinRollback(async () => {
    const account = await createFundedAccount("released-capture", 50_000n);
    const transferId = `hold-released-capture:${account.fixtureId}`;
    const { holdId } = await reserve({
      transferId,
      accountRef: account.accountRef,
      principalMinor: 10_000n,
      feeMinor: 300n,
    });
    await ledger.release({
      transferId,
      holdId,
      idempotencyKey: `${transferId}:release`,
    });

    await assert.rejects(
      ledger.capture({
        transferId,
        holdId,
        idempotencyKey: `${transferId}:capture`,
      }),
      (error: unknown) => {
        assert.ok(error instanceof DomainError);
        assert.equal(error.code, "CONFLICT");
        assert.match(error.message, /active hold can be captured/);
        return true;
      },
    );

    const persisted = await context.query().query<{
      hold_state: string;
      capture_journals: string;
      captured_events: string;
    }>(
      `SELECT
         (SELECT state::text FROM samra_core.ledger_holds
          WHERE id = $1) AS hold_state,
         (SELECT count(*) FROM samra_core.ledger_journals
          WHERE business_event_type = 'remittance_capture'
            AND business_event_id = $2)::text AS capture_journals,
         (SELECT count(*) FROM samra_core.ledger_hold_events
          WHERE hold_id = $1 AND event_type = 'captured')::text AS captured_events`,
      [holdId, transferId],
    );
    assert.deepEqual(persisted.rows[0], {
      hold_state: "released",
      capture_journals: "0",
      captured_events: "0",
    });
  });
});

async function reserve(input: {
  transferId: string;
  accountRef: string;
  principalMinor: bigint;
  feeMinor?: bigint;
}) {
  const feeMinor = input.feeMinor ?? 0n;
  return ledger.reserve({
    transferId: input.transferId,
    accountId: input.accountRef,
    amountMinor: input.principalMinor + feeMinor,
    principalAmountMinor: input.principalMinor,
    feeAmountMinor: feeMinor,
    currency: "USD",
    idempotencyKey: `${input.transferId}:reserve`,
  });
}

async function createFundedAccount(label: string, openingMinor: bigint) {
  const fixtureId = `${label}:${randomUUID()}`;
  const accountRef = `hold_product:${fixtureId}`;
  const accountCode = `hold_liability:${fixtureId}`;
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
    [accountCode, `Synthetic hold assurance ${label}`, product.rows[0]!.id],
  );
  await journals.post({
    eventType: "ledger_hold_assurance_opening",
    eventId: fixtureId,
    description: "Synthetic hold assurance opening balance",
    postings: [
      ["control_rain_usd", "debit", openingMinor],
      [accountCode, "credit", openingMinor],
    ],
    metadata: { synthetic: "true", fixtureId },
  });
  return { fixtureId, accountRef, accountCode };
}

function insufficientFunds(error: unknown): boolean {
  assert.ok(error instanceof DomainError);
  assert.equal(error.code, "INSUFFICIENT_FUNDS");
  return true;
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
