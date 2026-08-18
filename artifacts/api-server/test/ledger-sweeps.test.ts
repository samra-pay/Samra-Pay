import assert from "node:assert/strict";
import test from "node:test";
import { createDatabase } from "@workspace/db";

const connectionString = process.env["TEST_DATABASE_URL"];
if (!connectionString) {
  throw new Error(
    "TEST_DATABASE_URL is required for PostgreSQL ledger sweep tests.",
  );
}

const connection = createDatabase({ connectionString });

test.after(async () => {
  await connection.pool.end();
});

test("CLAUDE-LED-050 Structural sweep detects orphan and single-leg journals", async () => {
  const result = await connection.pool.query<{
    orphan_or_draft_postings: string;
    underspecified_journals: string;
    empty_journals: string;
  }>(
    `SELECT
       (SELECT count(*) FROM samra_core.ledger_postings p
        LEFT JOIN samra_core.ledger_journals j ON j.id = p.journal_id
        WHERE j.id IS NULL OR j.state = 'draft')::text AS orphan_or_draft_postings,
       (SELECT count(*) FROM (
          SELECT j.id
          FROM samra_core.ledger_journals j
          LEFT JOIN samra_core.ledger_postings p ON p.journal_id = j.id
          WHERE j.state IN ('posted', 'reversed')
          GROUP BY j.id
          HAVING count(p.id) < 2 OR count(DISTINCT p.account_id) < 2
        ) invalid)::text AS underspecified_journals,
       (SELECT count(*) FROM samra_core.ledger_journals j
        WHERE j.state IN ('posted', 'reversed')
          AND NOT EXISTS (
            SELECT 1 FROM samra_core.ledger_postings p WHERE p.journal_id = j.id
          ))::text AS empty_journals`,
  );
  assert.deepEqual(result.rows[0], {
    orphan_or_draft_postings: "0",
    underspecified_journals: "0",
    empty_journals: "0",
  });
});

test("CLAUDE-LED-048 No posted journal is unbalanced after a full suite run", async () => {
  const result = await connection.pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM (
       SELECT j.id
       FROM samra_core.ledger_journals j
       JOIN samra_core.ledger_postings p ON p.journal_id = j.id
       WHERE j.state IN ('posted', 'reversed')
       GROUP BY j.id
       HAVING COALESCE(sum(p.amount_minor) FILTER (WHERE p.side = 'debit'), 0)
          <> COALESCE(sum(p.amount_minor) FILTER (WHERE p.side = 'credit'), 0)
     ) unbalanced`,
  );
  assert.equal(result.rows[0]!.count, "0");
});

test("CLAUDE-LED-049 Global trial balance nets to zero across all accounts", async () => {
  const result = await connection.pool.query<{ trial_balance: string }>(
    `SELECT COALESCE(sum(
       CASE p.side WHEN 'debit' THEN p.amount_minor ELSE -p.amount_minor END
     ), 0)::text AS trial_balance
     FROM samra_core.ledger_postings p
     JOIN samra_core.ledger_journals j ON j.id = p.journal_id
     WHERE j.state IN ('posted', 'reversed')`,
  );
  assert.equal(result.rows[0]!.trial_balance, "0");
});

test("CLAUDE-LED-051 Hold sweep detects over-held accounts and incomplete terminal states", async () => {
  const result = await connection.pool.query<{
    holds_without_posted_balance: string;
    overheld_accounts: string;
    incomplete_terminal_holds: string;
  }>(
    `SELECT
       (SELECT count(*)
        FROM samra_core.ledger_holds h
        WHERE h.state = 'active'
          AND NOT EXISTS (
            SELECT 1
            FROM samra_core.ledger_postings p
            JOIN samra_core.ledger_journals j ON j.id = p.journal_id
            WHERE p.account_id = h.ledger_account_id
              AND j.state IN ('posted', 'reversed')
          ))::text AS holds_without_posted_balance,
       (SELECT count(*) FROM (
          SELECT h.ledger_account_id
          FROM samra_core.ledger_holds h
          JOIN samra_core.ledger_accounts a ON a.id = h.ledger_account_id
          WHERE h.state = 'active' AND NOT a.allow_negative_available
          GROUP BY h.ledger_account_id, a.normal_side
          HAVING sum(h.amount_minor) > (
            SELECT COALESCE(sum(
              CASE WHEN p.side = a.normal_side THEN p.amount_minor ELSE -p.amount_minor END
            ), 0)
            FROM samra_core.ledger_postings p
            JOIN samra_core.ledger_journals j ON j.id = p.journal_id
            WHERE p.account_id = h.ledger_account_id
              AND j.state IN ('posted', 'reversed')
          )
        ) overheld)::text AS overheld_accounts,
       (SELECT count(*) FROM samra_core.ledger_holds
        WHERE state <> 'active' AND terminal_at IS NULL)::text AS incomplete_terminal_holds`,
  );
  assert.deepEqual(result.rows[0], {
    holds_without_posted_balance: "0",
    overheld_accounts: "0",
    incomplete_terminal_holds: "0",
  });
});

test("Materialized balance sweep matches journal and active-hold truth", async () => {
  const result = await connection.pool.query<{ count: string }>(
    `SELECT count(*)::text AS count
     FROM samra_core.ledger_account_balance_truth truth
     FULL OUTER JOIN samra_core.ledger_account_balances projection
       ON projection.account_id = truth.account_id
     WHERE projection.account_id IS NULL OR truth.account_id IS NULL
       OR projection.currency IS DISTINCT FROM truth.currency
       OR projection.natural_balance_minor IS DISTINCT FROM truth.natural_balance_minor
       OR projection.active_holds_minor IS DISTINCT FROM truth.active_holds_minor
       OR projection.available_balance_minor IS DISTINCT FROM truth.available_balance_minor
       OR projection.applied_posting_count IS DISTINCT FROM truth.applied_posting_count
       OR projection.active_hold_count IS DISTINCT FROM truth.active_hold_count`,
  );
  assert.equal(result.rows[0]!.count, "0");
});
