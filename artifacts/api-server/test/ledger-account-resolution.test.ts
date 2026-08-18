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

class RollbackAfterAssurance extends Error {}
