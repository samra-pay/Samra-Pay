import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  PostgresLedgerJournalWriter,
  PostgresPersistenceContext,
  createDatabase,
  type DurableJournalCommand,
} from "@workspace/db";
import { DomainError } from "@workspace/remittance";

const connectionString = process.env["TEST_DATABASE_URL"];
if (!connectionString) {
  throw new Error(
    "TEST_DATABASE_URL is required for PostgreSQL ledger idempotency tests.",
  );
}

const connection = createDatabase({ connectionString });
const context = new PostgresPersistenceContext(connection.pool);
const journals = new PostgresLedgerJournalWriter(context);

test.after(async () => {
  await connection.pool.end();
});

test("CLAUDE-LED-020 Repeated post of the same business event returns the original journal", async () => {
  const eventId = `T-100:${randomUUID()}`;
  const rollback = new RollbackAfterAssurance();

  await assert.rejects(
    context.run(async () => {
      const input: DurableJournalCommand = {
        eventType: "remittance_capture",
        eventId,
        description: "Synthetic idempotent journal",
        postings: [
          ["demo_usd_account_001", "debit", 1_000n],
          ["clearing_remittance_principal_usd", "credit", 1_000n],
        ],
        metadata: { synthetic: "true", testCase: "CLAUDE-LED-020" },
      };

      const firstId = await journals.post(input);
      const replayId = await journals.post(input);
      assert.equal(replayId, firstId);

      const persisted = await context.query().query<{
        journal_count: string;
        posting_count: string;
      }>(
        `SELECT count(DISTINCT j.id)::text AS journal_count,
                count(p.id)::text AS posting_count
         FROM samra_core.ledger_journals j
         LEFT JOIN samra_core.ledger_postings p ON p.journal_id = j.id
         WHERE j.business_event_type = $1 AND j.business_event_id = $2`,
        [input.eventType, input.eventId],
      );
      assert.deepEqual(persisted.rows[0], {
        journal_count: "1",
        posting_count: "2",
      });

      await assert.rejects(
        journals.post({
          ...input,
          postings: [
            ["demo_usd_account_001", "debit", 1_001n],
            ["clearing_remittance_principal_usd", "credit", 1_001n],
          ],
        }),
        (error: unknown) => {
          assert.ok(error instanceof DomainError);
          assert.equal(error.code, "CONFLICT");
          assert.match(error.message, /different journal command/);
          return true;
        },
      );

      throw rollback;
    }),
    (error) => error === rollback,
  );

  const residue = await connection.pool.query<{ count: string }>(
    `SELECT count(*)::text AS count
     FROM samra_core.ledger_journals
     WHERE business_event_type = 'remittance_capture' AND business_event_id = $1`,
    [eventId],
  );
  assert.equal(residue.rows[0]!.count, "0");
});

class RollbackAfterAssurance extends Error {}
