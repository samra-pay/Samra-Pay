import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  PostgresLedgerControl,
  PostgresLedgerJournalWriter,
  PostgresPersistenceContext,
  createDatabase,
  type DurableJournalCommand,
} from "@workspace/db";
import { DomainError, type DomainErrorCode } from "@workspace/remittance";

const connectionString = process.env["TEST_DATABASE_URL"];
if (!connectionString) {
  throw new Error(
    "TEST_DATABASE_URL is required for PostgreSQL ledger assurance tests.",
  );
}

const connection = createDatabase({ connectionString });
const context = new PostgresPersistenceContext(connection.pool);
const journals = new PostgresLedgerJournalWriter(context);
const ledger = new PostgresLedgerControl(context);

test.after(async () => {
  await connection.pool.end();
});

test("CLAUDE-LED-002 Journal with unresolvable account code must be rejected", async () => {
  const eventId = assuranceEventId("unresolvable-account");
  const before = await ledger.getCustomerBalance("demo_usd_account_001");

  await assert.rejects(
    journals.post(
      command(eventId, [
        ["control_rain_usd", "debit", 100n],
        ["missing_ledger_account", "credit", 100n],
      ]),
    ),
    domainError("NOT_FOUND", /missing_ledger_account/),
  );

  await assertNoEventResidue(eventId);
  assert.deepEqual(
    await ledger.getCustomerBalance("demo_usd_account_001"),
    before,
  );
});

test("CLAUDE-LED-006 Single-leg journal must be rejected", async () => {
  const eventId = assuranceEventId("single-leg");

  await assert.rejects(
    journals.post(command(eventId, [["control_rain_usd", "debit", 100n]])),
    domainError("INVALID_ARGUMENT", /at least two postings/),
  );

  await assertNoEventResidue(eventId);
});

test("CLAUDE-LED-003 Journal with unequal debits and credits must be rejected at application layer", async () => {
  const eventId = assuranceEventId("unequal-totals");

  await assert.rejects(
    journals.post(
      command(eventId, [
        ["control_rain_usd", "debit", 100n],
        ["demo_usd_account_001", "credit", 99n],
      ]),
    ),
    domainError("INVALID_ARGUMENT", /debits must equal credits/),
  );

  await assertNoEventResidue(eventId);
});

test("CLAUDE-LED-005 Journal with zero postings must be rejected", async () => {
  const eventId = assuranceEventId("zero-postings");

  await assert.rejects(
    journals.post(command(eventId, [])),
    domainError("INVALID_ARGUMENT", /at least two postings/),
  );

  await assertNoEventResidue(eventId);
});

test("CLAUDE-LED-010 Journal must not reach posted state when any posting insert affects zero rows", async () => {
  const eventId = assuranceEventId("mid-loop-resolution");

  await assert.rejects(
    journals.post(
      command(eventId, [
        ["control_rain_usd", "debit", 100n],
        ["clearing_remittance_principal_usd", "credit", 25n],
        ["missing_mid_loop_account", "debit", 50n],
        ["demo_usd_account_001", "credit", 125n],
      ]),
    ),
    domainError("NOT_FOUND", /missing_mid_loop_account/),
  );

  await assertNoEventResidue(eventId);
});

test("CLAUDE-LED-004 Database must reject an unbalanced journal independently of application code", async () => {
  const eventId = assuranceEventId("database-balance-guard");

  await assert.rejects(
    context.run(async () => {
      const journal = await context.query().query<{ id: string }>(
        `INSERT INTO samra_core.ledger_journals
         (business_event_type, business_event_id, currency, state, description, metadata)
         VALUES ('ledger_assurance',$1,'USD','draft','Database balance guard','{}'::jsonb)
         RETURNING id`,
        [eventId],
      );
      await context.query().query(
        `INSERT INTO samra_core.ledger_postings
         (journal_id, account_id, sequence, side, amount_minor)
         SELECT $1::uuid, id, 1, 'debit'::samra_core.ledger_entry_side, 100
         FROM samra_core.ledger_accounts WHERE code = 'control_rain_usd'
         UNION ALL
         SELECT $1::uuid, id, 2, 'credit'::samra_core.ledger_entry_side, 99
         FROM samra_core.ledger_accounts WHERE code = 'demo_usd_account_001'`,
        [journal.rows[0]!.id],
      );
      await context.query().query(
        `UPDATE samra_core.ledger_journals
         SET state = 'posted', posted_at = now() WHERE id = $1`,
        [journal.rows[0]!.id],
      );
    }),
    /balanced|debit and credit postings/,
  );

  await assertNoEventResidue(eventId);
});

test("CLAUDE-LED-001 Balanced two-leg journal posts and both legs persist", async () => {
  const eventId = assuranceEventId("balanced-baseline");
  const rollback = new RollbackAfterAssurance();

  await assert.rejects(
    context.run(async () => {
      const journalId = await journals.post(
        command(eventId, [
          ["control_rain_usd", "debit", 123n],
          ["demo_usd_account_001", "credit", 123n],
        ]),
      );
      const result = await context.query().query<{
        state: string;
        posted_at: Date | null;
        posting_count: string;
        debit_total: string;
        credit_total: string;
      }>(
        `SELECT j.state, j.posted_at,
                count(p.id)::text AS posting_count,
                COALESCE(sum(p.amount_minor) FILTER (WHERE p.side = 'debit'), 0)::text AS debit_total,
                COALESCE(sum(p.amount_minor) FILTER (WHERE p.side = 'credit'), 0)::text AS credit_total
         FROM samra_core.ledger_journals j
         JOIN samra_core.ledger_postings p ON p.journal_id = j.id
         WHERE j.id = $1
         GROUP BY j.id`,
        [journalId],
      );
      assert.equal(result.rows[0]!.state, "posted");
      assert.ok(result.rows[0]!.posted_at);
      assert.equal(result.rows[0]!.posting_count, "2");
      assert.equal(result.rows[0]!.debit_total, "123");
      assert.equal(result.rows[0]!.credit_total, "123");
      throw rollback;
    }),
    (error) => error === rollback,
  );

  await assertNoEventResidue(eventId);
});

test("CLAUDE-LED-009 Multi-leg journal posts all legs with contiguous sequence", async () => {
  const eventId = assuranceEventId("multi-leg-baseline");
  const rollback = new RollbackAfterAssurance();

  await assert.rejects(
    context.run(async () => {
      const journalId = await journals.post(
        command(eventId, [
          ["demo_usd_account_001", "debit", 10_000n],
          ["demo_usd_account_001", "debit", 300n],
          ["clearing_remittance_principal_usd", "credit", 10_000n],
          ["liability_deferred_remittance_fee_usd", "credit", 300n],
        ]),
      );
      const result = await context.query().query<{
        sequence: number;
        side: "debit" | "credit";
        amount_minor: string;
      }>(
        `SELECT sequence, side, amount_minor::text AS amount_minor
         FROM samra_core.ledger_postings
         WHERE journal_id = $1
         ORDER BY sequence`,
        [journalId],
      );

      assert.deepEqual(
        result.rows.map(({ sequence }) => sequence),
        [1, 2, 3, 4],
      );
      assert.equal(
        result.rows
          .filter(({ side }) => side === "debit")
          .reduce((total, row) => total + BigInt(row.amount_minor), 0n),
        10_300n,
      );
      assert.equal(
        result.rows
          .filter(({ side }) => side === "credit")
          .reduce((total, row) => total + BigInt(row.amount_minor), 0n),
        10_300n,
      );
      throw rollback;
    }),
    (error) => error === rollback,
  );

  await assertNoEventResidue(eventId);
});

test("CLAUDE-LED-007 Zero-amount posting is rejected by database constraint", async () => {
  await assertDatabaseAmountRejected("zero-amount", 0n);
});

test("CLAUDE-LED-008 Negative-amount posting is rejected by database constraint", async () => {
  await assertDatabaseAmountRejected("negative-amount", -100n);
});

function command(
  eventId: string,
  postings: DurableJournalCommand["postings"],
): DurableJournalCommand {
  return {
    eventType: "ledger_assurance",
    eventId,
    description: `Synthetic ledger assurance event ${eventId}`,
    postings,
    metadata: { synthetic: "true", testCase: eventId.split(":")[0]! },
  };
}

function assuranceEventId(caseId: string): string {
  return `${caseId}:${randomUUID()}`;
}

function domainError(code: DomainErrorCode, message: RegExp) {
  return (error: unknown): boolean => {
    assert.ok(error instanceof DomainError);
    assert.equal(error.code, code);
    assert.match(error.message, message);
    return true;
  };
}

async function assertNoEventResidue(eventId: string): Promise<void> {
  const result = await connection.pool.query<{
    journal_count: string;
    posting_count: string;
  }>(
    `SELECT
       count(DISTINCT j.id)::text AS journal_count,
       count(p.id)::text AS posting_count
     FROM samra_core.ledger_journals j
     LEFT JOIN samra_core.ledger_postings p ON p.journal_id = j.id
     WHERE j.business_event_type = 'ledger_assurance' AND j.business_event_id = $1`,
    [eventId],
  );
  assert.equal(result.rows[0]!.journal_count, "0");
  assert.equal(result.rows[0]!.posting_count, "0");
}

async function assertDatabaseAmountRejected(
  label: string,
  amountMinor: bigint,
): Promise<void> {
  const eventId = assuranceEventId(label);

  await assert.rejects(
    context.run(async () => {
      const journal = await context.query().query<{ id: string }>(
        `INSERT INTO samra_core.ledger_journals
         (business_event_type, business_event_id, currency, state, description, metadata)
         VALUES ('ledger_assurance',$1,'USD','draft',
                 'Database amount constraint assurance','{}'::jsonb)
         RETURNING id`,
        [eventId],
      );
      await context.query().query(
        `INSERT INTO samra_core.ledger_postings
         (journal_id, account_id, sequence, side, amount_minor)
         SELECT $1::uuid, id, 1, 'debit'::samra_core.ledger_entry_side, $2::bigint
         FROM samra_core.ledger_accounts WHERE code = 'control_rain_usd'
         UNION ALL
         SELECT $1::uuid, id, 2, 'credit'::samra_core.ledger_entry_side, $2::bigint
         FROM samra_core.ledger_accounts WHERE code = 'demo_usd_account_001'`,
        [journal.rows[0]!.id, amountMinor.toString()],
      );
    }),
    postgresError("23514", /ledger_postings_amount_positive_chk/),
  );

  await assertNoEventResidue(eventId);
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
