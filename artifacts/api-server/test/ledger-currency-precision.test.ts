import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  PostgresLedgerControl,
  PostgresLedgerJournalWriter,
  PostgresPersistenceContext,
  PostgresRemittanceRepository,
  RandomIdGenerator,
  createDatabase,
} from "@workspace/db";
import { createQuote, type RemittanceQuote } from "@workspace/remittance";
import { DemoRuntime } from "../src/domain/demo-runtime";

const connectionString = process.env["TEST_DATABASE_URL"];
if (!connectionString) {
  throw new Error(
    "TEST_DATABASE_URL is required for PostgreSQL currency and precision tests.",
  );
}

const connection = createDatabase({ connectionString });
const context = new PostgresPersistenceContext(connection.pool);
const journals = new PostgresLedgerJournalWriter(context);
const ledger = new PostgresLedgerControl(context);
const repository = new PostgresRemittanceRepository(context);

test.after(async () => {
  await connection.pool.end();
});

test("CLAUDE-LED-016 Journal cannot mix currencies across legs", async () => {
  const eventId = `currency-mismatch:${randomUUID()}`;
  const etbAccountCode = `assurance_etb:${randomUUID()}`;

  await assert.rejects(
    context.run(async () => {
      const etbAccount = await context.query().query<{ id: string }>(
        `INSERT INTO samra_core.ledger_accounts
         (code, name, account_class, normal_side, currency)
         VALUES ($1,'Synthetic ETB currency guard','liability','credit','ETB')
         RETURNING id`,
        [etbAccountCode],
      );
      const journal = await context.query().query<{ id: string }>(
        `INSERT INTO samra_core.ledger_journals
         (business_event_type, business_event_id, currency, state, description, metadata)
         VALUES ('ledger_assurance',$1,'USD','draft',
                 'Synthetic cross-currency assurance','{}'::jsonb)
         RETURNING id`,
        [eventId],
      );
      await context.query().query(
        `INSERT INTO samra_core.ledger_postings
         (journal_id, account_id, sequence, side, amount_minor)
         SELECT $1::uuid, id, 1, 'debit'::samra_core.ledger_entry_side, 100
         FROM samra_core.ledger_accounts WHERE code = 'control_rain_usd'`,
        [journal.rows[0]!.id],
      );
      await context.query().query(
        `INSERT INTO samra_core.ledger_postings
         (journal_id, account_id, sequence, side, amount_minor)
         VALUES ($1,$2,2,'credit',100)`,
        [journal.rows[0]!.id, etbAccount.rows[0]!.id],
      );
    }),
    postgresError(
      "23514",
      /currency USD does not match account .* currency ETB/,
    ),
  );

  const residue = await connection.pool.query<{
    journal_count: string;
    account_count: string;
  }>(
    `SELECT
       (SELECT count(*) FROM samra_core.ledger_journals
        WHERE business_event_type = 'ledger_assurance'
          AND business_event_id = $1)::text AS journal_count,
       (SELECT count(*) FROM samra_core.ledger_accounts
        WHERE code = $2)::text AS account_count`,
    [eventId, etbAccountCode],
  );
  assert.equal(residue.rows[0]!.journal_count, "0");
  assert.equal(residue.rows[0]!.account_count, "0");
});

test("CLAUDE-LED-017 Large amounts round-trip without precision loss", async () => {
  const eventId = `large-amount:${randomUUID()}`;
  const amountMinor = 999_999_999_999n;

  await withinRollback(async () => {
    const journalId = await journals.post({
      eventType: "ledger_assurance",
      eventId,
      description: "Synthetic large-amount precision assurance",
      postings: [
        ["control_rain_usd", "debit", amountMinor],
        ["clearing_remittance_principal_usd", "credit", amountMinor],
      ],
      metadata: { synthetic: "true", testCase: "CLAUDE-LED-017" },
    });
    const result = await context.query().query<{
      sequence: number;
      amount_minor: string;
    }>(
      `SELECT sequence, amount_minor::text AS amount_minor
       FROM samra_core.ledger_postings
       WHERE journal_id = $1
       ORDER BY sequence`,
      [journalId],
    );

    assert.equal(result.rows.length, 2);
    assert.deepEqual(
      result.rows.map(({ amount_minor }) => BigInt(amount_minor)),
      [amountMinor, amountMinor],
    );
  });

  await assertNoJournalResidue(eventId);
});

test("CLAUDE-LED-018 FX conversion is deterministic and uses exact rational arithmetic", async () => {
  const deterministicInput = {
    id: "quote_currency_precision_assurance",
    actorId: "demo_customer_001",
    sourceAccountId: "demo_usd_account_001",
    beneficiaryId: "beneficiary_bank_001",
    sourceAmountMinor: 10_000n,
    fundingMethod: "samra_balance" as const,
    deliveryMethod: "bank" as const,
    createdAt: new Date("2026-08-18T00:00:00.000Z"),
  };
  const expected = quoteEconomicsBytes(createQuote(deterministicInput));
  assert.equal(
    expected,
    JSON.stringify({
      sourceAmountMinor: "10000",
      feeAmountMinor: "300",
      totalDebitMinor: "10300",
      destinationAmountMinor: "1800000",
      rateNumerator: "180",
      rateDenominator: "1",
      sourceCurrency: "USD",
      destinationCurrency: "ETB",
    }),
  );
  for (let index = 0; index < 1_000; index += 1) {
    assert.equal(
      quoteEconomicsBytes(createQuote(deterministicInput)),
      expected,
    );
  }

  let quoteId = "";
  let transferId = "";
  await withinRollback(async () => {
    const runtime = new DemoRuntime({
      repository,
      ledger,
      unitOfWork: context,
      ids: new RandomIdGenerator(),
    });
    const quote = await runtime.service.createQuote({
      actorId: "demo_customer_001",
      sourceAccountId: "demo_usd_account_001",
      beneficiaryId: "beneficiary_bank_001",
      sourceAmountMinor: 10_000n,
      fundingMethod: "samra_balance",
      deliveryMethod: "bank",
    });
    quoteId = quote.id;
    assert.equal(quoteEconomicsBytes(quote), expected);

    const transfer = await runtime.service.createTransfer({
      actorId: "demo_customer_001",
      quoteId,
      idempotencyKey: `currency-precision:${randomUUID()}`,
    });
    transferId = transfer.id;

    const before = await persistedQuoteSnapshot(quoteId);
    assert.deepEqual(before, {
      source_amount_minor: "10000",
      fee_amount_minor: "300",
      total_debit_minor: "10300",
      destination_amount_minor: "1800000",
      fx_rate_numerator: "180",
      fx_rate_denominator: "1",
      source_currency: "USD",
      destination_currency: "ETB",
      state: "accepted",
      transfer_source_amount_minor: "10000",
      transfer_fee_amount_minor: "300",
      transfer_total_debit_minor: "10300",
      transfer_destination_amount_minor: "1800000",
    });

    await context.query().query("SAVEPOINT quote_immutability_probe");
    await assert.rejects(
      context.query().query(
        `UPDATE samra_core.remittance_quotes
         SET fee_amount_minor = fee_amount_minor + 1,
             total_debit_minor = total_debit_minor + 1
         WHERE external_ref = $1`,
        [quoteId],
      ),
      postgresError("55000", /remittance quote .* snapshot is immutable/),
    );
    await context
      .query()
      .query("ROLLBACK TO SAVEPOINT quote_immutability_probe");

    assert.deepEqual(await persistedQuoteSnapshot(quoteId), before);
    assert.equal(
      quoteEconomicsBytes(
        (await runtime.service.getTransfer("demo_customer_001", transferId))
          .quote,
      ),
      expected,
    );
  });

  const residue = await connection.pool.query<{
    quote_count: string;
    transfer_count: string;
    hold_count: string;
  }>(
    `SELECT
       (SELECT count(*) FROM samra_core.remittance_quotes
        WHERE external_ref = $1)::text AS quote_count,
       (SELECT count(*) FROM samra_core.remittance_transfers
        WHERE external_ref = $2)::text AS transfer_count,
       (SELECT count(*) FROM samra_core.ledger_holds
        WHERE business_event_id = $2)::text AS hold_count`,
    [quoteId, transferId],
  );
  assert.equal(residue.rows[0]!.quote_count, "0");
  assert.equal(residue.rows[0]!.transfer_count, "0");
  assert.equal(residue.rows[0]!.hold_count, "0");
});

test("CLAUDE-LED-019 Zero-fee capture omits the fee leg and remains balanced", async () => {
  const transferId = `zero-fee-capture:${randomUUID()}`;

  await withinRollback(async () => {
    const { holdId } = await ledger.reserve({
      transferId,
      accountId: "demo_usd_account_001",
      amountMinor: 10_000n,
      principalAmountMinor: 10_000n,
      feeAmountMinor: 0n,
      currency: "USD",
      idempotencyKey: `${transferId}:reserve`,
    });
    await ledger.capture({
      transferId,
      holdId,
      idempotencyKey: `${transferId}:capture`,
    });

    const result = await context.query().query<{
      state: string;
      posting_count: string;
      debit_total: string;
      credit_total: string;
      deferred_fee_posting_count: string;
      hold_state: string;
    }>(
      `SELECT j.state,
              count(p.id)::text AS posting_count,
              sum(p.amount_minor) FILTER (WHERE p.side = 'debit')::text AS debit_total,
              sum(p.amount_minor) FILTER (WHERE p.side = 'credit')::text AS credit_total,
              count(p.id) FILTER (
                WHERE a.code = 'liability_deferred_remittance_fee_usd'
              )::text AS deferred_fee_posting_count,
              h.state AS hold_state
       FROM samra_core.ledger_journals j
       JOIN samra_core.ledger_postings p ON p.journal_id = j.id
       JOIN samra_core.ledger_accounts a ON a.id = p.account_id
       JOIN samra_core.ledger_hold_events he ON he.journal_id = j.id
       JOIN samra_core.ledger_holds h ON h.id = he.hold_id
       WHERE j.business_event_type = 'remittance_capture'
         AND j.business_event_id = $1
       GROUP BY j.id, h.id`,
      [transferId],
    );

    assert.deepEqual(result.rows[0], {
      state: "posted",
      posting_count: "2",
      debit_total: "10000",
      credit_total: "10000",
      deferred_fee_posting_count: "0",
      hold_state: "captured",
    });
  });

  const residue = await connection.pool.query<{
    journal_count: string;
    hold_count: string;
  }>(
    `SELECT
       (SELECT count(*) FROM samra_core.ledger_journals
        WHERE business_event_type = 'remittance_capture'
          AND business_event_id = $1)::text AS journal_count,
       (SELECT count(*) FROM samra_core.ledger_holds
        WHERE business_event_type = 'remittance_transfer'
          AND business_event_id = $1)::text AS hold_count`,
    [transferId],
  );
  assert.equal(residue.rows[0]!.journal_count, "0");
  assert.equal(residue.rows[0]!.hold_count, "0");
});

type PersistedQuoteSnapshot = Readonly<{
  source_amount_minor: string;
  fee_amount_minor: string;
  total_debit_minor: string;
  destination_amount_minor: string;
  fx_rate_numerator: string;
  fx_rate_denominator: string;
  source_currency: string;
  destination_currency: string;
  state: string;
  transfer_source_amount_minor: string;
  transfer_fee_amount_minor: string;
  transfer_total_debit_minor: string;
  transfer_destination_amount_minor: string;
}>;

async function persistedQuoteSnapshot(
  quoteId: string,
): Promise<PersistedQuoteSnapshot> {
  const result = await context.query().query<PersistedQuoteSnapshot>(
    `SELECT q.source_amount_minor::text AS source_amount_minor,
            q.fee_amount_minor::text AS fee_amount_minor,
            q.total_debit_minor::text AS total_debit_minor,
            q.destination_amount_minor::text AS destination_amount_minor,
            q.fx_rate_numerator::text AS fx_rate_numerator,
            q.fx_rate_denominator::text AS fx_rate_denominator,
            q.source_currency::text AS source_currency,
            q.destination_currency::text AS destination_currency,
            q.state::text AS state,
            t.source_amount_minor::text AS transfer_source_amount_minor,
            t.fee_amount_minor::text AS transfer_fee_amount_minor,
            t.total_debit_minor::text AS transfer_total_debit_minor,
            t.destination_amount_minor::text AS transfer_destination_amount_minor
     FROM samra_core.remittance_quotes q
     JOIN samra_core.remittance_transfers t ON t.quote_id = q.id
     WHERE q.external_ref = $1`,
    [quoteId],
  );
  assert.ok(result.rows[0]);
  return result.rows[0];
}

function quoteEconomicsBytes(quote: RemittanceQuote): string {
  return JSON.stringify({
    sourceAmountMinor: quote.sourceAmount.amountMinor.toString(),
    feeAmountMinor: quote.feeAmount.amountMinor.toString(),
    totalDebitMinor: quote.debitAmount.amountMinor.toString(),
    destinationAmountMinor: quote.recipientAmount.amountMinor.toString(),
    rateNumerator: quote.rate.value.numerator.toString(),
    rateDenominator: quote.rate.value.denominator.toString(),
    sourceCurrency: quote.rate.sourceCurrency,
    destinationCurrency: quote.rate.destinationCurrency,
  });
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

async function assertNoJournalResidue(eventId: string): Promise<void> {
  const result = await connection.pool.query<{
    journal_count: string;
    posting_count: string;
  }>(
    `SELECT count(DISTINCT j.id)::text AS journal_count,
            count(p.id)::text AS posting_count
     FROM samra_core.ledger_journals j
     LEFT JOIN samra_core.ledger_postings p ON p.journal_id = j.id
     WHERE j.business_event_type = 'ledger_assurance'
       AND j.business_event_id = $1`,
    [eventId],
  );
  assert.equal(result.rows[0]!.journal_count, "0");
  assert.equal(result.rows[0]!.posting_count, "0");
}

function postgresError(code: string, message: RegExp) {
  return (error: unknown): boolean => {
    assert.ok(error instanceof Error);
    assert.equal((error as Error & { code?: string }).code, code);
    assert.match(error.message, message);
    return true;
  };
}

class RollbackAfterAssurance extends Error {}
