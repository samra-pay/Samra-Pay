import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  PostgresLedgerJournalWriter,
  PostgresPersistenceContext,
  createDatabase,
} from "@workspace/db";

const connectionString = process.env["TEST_DATABASE_URL"];
if (!connectionString) {
  throw new Error(
    "TEST_DATABASE_URL is required for PostgreSQL account resolution tests.",
  );
}

const connection = createDatabase({ connectionString });
const context = new PostgresPersistenceContext(connection.pool);
const journals = new PostgresLedgerJournalWriter(context);

test.after(async () => {
  await connection.pool.end();
});

test("CLAUDE-LED-011 Posting resolves to the correct account by code", async () => {
  const eventId = `account-resolution:${randomUUID()}`;
  const rollback = new RollbackAfterAssurance();

  await assert.rejects(
    context.run(async () => {
      const journalId = await journals.post({
        eventType: "ledger_assurance",
        eventId,
        description: "Synthetic account resolution assurance",
        postings: [
          ["control_rain_usd", "debit", 2_500n],
          ["clearing_remittance_principal_usd", "credit", 2_500n],
        ],
        metadata: { synthetic: "true", testCase: "CLAUDE-LED-011" },
      });
      const result = await context.query().query<{ code: string }>(
        `SELECT a.code
         FROM samra_core.ledger_postings p
         JOIN samra_core.ledger_accounts a ON a.id = p.account_id
         WHERE p.journal_id = $1
         ORDER BY p.sequence`,
        [journalId],
      );

      assert.deepEqual(
        result.rows.map(({ code }) => code),
        ["control_rain_usd", "clearing_remittance_principal_usd"],
      );
      throw rollback;
    }),
    (error) => error === rollback,
  );

  const residue = await connection.pool.query<{ count: string }>(
    `SELECT count(*)::text AS count
     FROM samra_core.ledger_journals
     WHERE business_event_type = 'ledger_assurance' AND business_event_id = $1`,
    [eventId],
  );
  assert.equal(residue.rows[0]!.count, "0");
});

test("CLAUDE-LED-012 Posting cannot reference a non-existent account_id", async () => {
  const eventId = `missing-account:${randomUUID()}`;

  await assert.rejects(
    context.run(async () => {
      const journalId = await insertDraftJournal(eventId);
      await context.query().query(
        `INSERT INTO samra_core.ledger_postings
         (journal_id, account_id, sequence, side, amount_minor)
         VALUES ($1,$2,1,'debit',100)`,
        [journalId, randomUUID()],
      );
    }),
    postgresError("23503", /ledger account .* does not exist/),
  );

  await assertNoJournalResidue(eventId);
});

test("CLAUDE-LED-013 Posting cannot exist without a parent journal", async () => {
  const orphanJournalId = randomUUID();
  const account = await connection.pool.query<{ id: string }>(
    `SELECT id FROM samra_core.ledger_accounts WHERE code = 'control_rain_usd'`,
  );
  assert.ok(account.rows[0]);

  await assert.rejects(
    context.run(async () => {
      await context.query().query(
        `INSERT INTO samra_core.ledger_postings
         (journal_id, account_id, sequence, side, amount_minor)
         VALUES ($1,$2,1,'debit',100)`,
        [orphanJournalId, account.rows[0]!.id],
      );
    }),
    postgresError("23503", /ledger journal .* does not exist/),
  );

  const residue = await connection.pool.query<{ count: string }>(
    `SELECT count(*)::text AS count
     FROM samra_core.ledger_postings WHERE journal_id = $1`,
    [orphanJournalId],
  );
  assert.equal(residue.rows[0]!.count, "0");
});

test("CLAUDE-LED-014 Account with postings cannot be deleted", async () => {
  const before = await connection.pool.query<{
    id: string;
    posting_count: string;
  }>(
    `SELECT a.id, count(p.id)::text AS posting_count
     FROM samra_core.ledger_accounts a
     JOIN samra_core.ledger_postings p ON p.account_id = a.id
     WHERE a.code = 'control_rain_usd'
     GROUP BY a.id`,
  );
  assert.ok(before.rows[0]);
  assert.ok(BigInt(before.rows[0]!.posting_count) > 0n);

  await assert.rejects(
    context.run(async () => {
      await context
        .query()
        .query(`DELETE FROM samra_core.ledger_accounts WHERE id = $1`, [
          before.rows[0]!.id,
        ]);
    }),
    postgresError("23503", /violates foreign key constraint/),
  );

  const after = await connection.pool.query<{
    account_count: string;
    posting_count: string;
  }>(
    `SELECT count(DISTINCT a.id)::text AS account_count,
            count(p.id)::text AS posting_count
     FROM samra_core.ledger_accounts a
     LEFT JOIN samra_core.ledger_postings p ON p.account_id = a.id
     WHERE a.id = $1`,
    [before.rows[0]!.id],
  );
  assert.equal(after.rows[0]!.account_count, "1");
  assert.equal(after.rows[0]!.posting_count, before.rows[0]!.posting_count);
});

test("CLAUDE-LED-015 Account codes are unique", async () => {
  await assert.rejects(
    connection.pool.query(
      `INSERT INTO samra_core.ledger_accounts
       (code, name, account_class, normal_side, currency)
       VALUES ('control_rain_usd','Duplicate constraint probe','asset','debit','USD')`,
    ),
    postgresError("23505", /ledger_accounts_code_uidx|duplicate key/),
  );

  const result = await connection.pool.query<{ count: string }>(
    `SELECT count(*)::text AS count
     FROM samra_core.ledger_accounts WHERE code = 'control_rain_usd'`,
  );
  assert.equal(result.rows[0]!.count, "1");
});

async function insertDraftJournal(eventId: string): Promise<string> {
  const journal = await context.query().query<{ id: string }>(
    `INSERT INTO samra_core.ledger_journals
     (business_event_type, business_event_id, currency, state, description, metadata)
     VALUES ('ledger_assurance',$1,'USD','draft',
             'Synthetic account integrity assurance','{}'::jsonb)
     RETURNING id`,
    [eventId],
  );
  return journal.rows[0]!.id;
}

async function assertNoJournalResidue(eventId: string): Promise<void> {
  const residue = await connection.pool.query<{
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
  assert.equal(residue.rows[0]!.journal_count, "0");
  assert.equal(residue.rows[0]!.posting_count, "0");
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
