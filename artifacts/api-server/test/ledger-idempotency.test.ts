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
  type DurableJournalCommand,
} from "@workspace/db";
import { DomainError } from "@workspace/remittance";
import { DemoRuntime } from "../src/domain/demo-runtime";

const connectionString = process.env["TEST_DATABASE_URL"];
if (!connectionString) {
  throw new Error(
    "TEST_DATABASE_URL is required for PostgreSQL ledger idempotency tests.",
  );
}

const connections = new Set<ReturnType<typeof createDatabase>>();

function openConnection(max?: number) {
  const opened = createDatabase({
    connectionString,
    ...(max ? { poolConfig: { max } } : {}),
  });
  connections.add(opened);
  return opened;
}

const connection = openConnection();
const context = new PostgresPersistenceContext(connection.pool);
const journals = new PostgresLedgerJournalWriter(context);

test.after(async () => {
  await Promise.all(
    [...connections].map(async (opened) => {
      connections.delete(opened);
      await opened.pool.end();
    }),
  );
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

test("CLAUDE-LED-024 Distinct business events with identical payloads both post", async () => {
  const firstEventId = `T-200:${randomUUID()}`;
  const secondEventId = `T-201:${randomUUID()}`;

  await withinRollback(async () => {
    const common = {
      eventType: "ledger_assurance",
      description: "Synthetic identical-payload journal",
      postings: [
        ["control_rain_usd", "debit", 2_400n],
        ["clearing_remittance_principal_usd", "credit", 2_400n],
      ],
      metadata: { synthetic: "true", testCase: "CLAUDE-LED-024" },
    } as const;
    const firstId = await journals.post({
      ...common,
      eventId: firstEventId,
    });
    const secondId = await journals.post({
      ...common,
      eventId: secondEventId,
    });
    assert.notEqual(firstId, secondId);

    const persisted = await context.query().query<{
      business_event_id: string;
      posting_count: string;
      delta: string;
    }>(
      `SELECT j.business_event_id,
              count(p.id)::text AS posting_count,
              sum(CASE WHEN p.side = 'debit' THEN p.amount_minor
                       ELSE -p.amount_minor END)::text AS delta
       FROM samra_core.ledger_journals j
       JOIN samra_core.ledger_postings p ON p.journal_id = j.id
       WHERE j.business_event_type = 'ledger_assurance'
         AND j.business_event_id = ANY($1::text[])
       GROUP BY j.id, j.business_event_id
       ORDER BY j.business_event_id`,
      [[firstEventId, secondEventId]],
    );
    assert.deepEqual(persisted.rows, [
      {
        business_event_id: firstEventId,
        posting_count: "2",
        delta: "0",
      },
      {
        business_event_id: secondEventId,
        posting_count: "2",
        delta: "0",
      },
    ]);
  });

  await assertNoJournalResidue([firstEventId, secondEventId]);
});

test("CLAUDE-LED-023 Hold events are idempotent per hold and event type", async () => {
  const transferId = `hold-event-idempotency:${randomUUID()}`;
  let holdId = "";

  await withinRollback(async () => {
    const ledger = new PostgresLedgerControl(context);
    const reserved = await ledger.reserve({
      transferId,
      accountId: "demo_usd_account_001",
      amountMinor: 1_000n,
      principalAmountMinor: 1_000n,
      feeAmountMinor: 0n,
      currency: "USD",
      idempotencyKey: `${transferId}:reserve`,
    });
    holdId = reserved.holdId;
    const capture = {
      transferId,
      holdId,
      idempotencyKey: `${transferId}:capture`,
    };
    await ledger.capture(capture);
    await ledger.capture(capture);

    const persisted = await context.query().query<{
      captured_events: string;
      capture_journals: string;
      capture_postings: string;
      hold_state: string;
    }>(
      `SELECT
         (SELECT count(*) FROM samra_core.ledger_hold_events
          WHERE hold_id = $1 AND event_type = 'captured')::text AS captured_events,
         (SELECT count(*) FROM samra_core.ledger_journals
          WHERE business_event_type = 'remittance_capture'
            AND business_event_id = $2)::text AS capture_journals,
         (SELECT count(*) FROM samra_core.ledger_postings p
          JOIN samra_core.ledger_journals j ON j.id = p.journal_id
          WHERE j.business_event_type = 'remittance_capture'
            AND j.business_event_id = $2)::text AS capture_postings,
         (SELECT state::text FROM samra_core.ledger_holds WHERE id = $1) AS hold_state`,
      [holdId, transferId],
    );
    assert.deepEqual(persisted.rows[0], {
      captured_events: "1",
      capture_journals: "1",
      capture_postings: "2",
      hold_state: "captured",
    });
  });

  const residue = await connection.pool.query<{
    hold_count: string;
    journal_count: string;
  }>(
    `SELECT
       (SELECT count(*) FROM samra_core.ledger_holds WHERE id = $1)::text AS hold_count,
       (SELECT count(*) FROM samra_core.ledger_journals
        WHERE business_event_type = 'remittance_capture'
          AND business_event_id = $2)::text AS journal_count`,
    [holdId, transferId],
  );
  assert.deepEqual(residue.rows[0], {
    hold_count: "0",
    journal_count: "0",
  });
});

test("CLAUDE-LED-022 Client retry after timeout does not double-move funds", async () => {
  const first = createRuntime();
  const restarted = createRuntime();
  const idempotencyKey = `timeout-retry:${randomUUID()}`;

  try {
    const before = await first.runtime.accountResponse();
    const quote = await first.runtime.service.createQuote({
      actorId: "demo_customer_001",
      sourceAccountId: "demo_usd_account_001",
      beneficiaryId: "beneficiary_bank_001",
      sourceAmountMinor: 10_000n,
      fundingMethod: "samra_balance",
      deliveryMethod: "bank",
    });
    const committed = await first.runtime.service.createTransfer({
      actorId: "demo_customer_001",
      quoteId: quote.id,
      idempotencyKey,
    });

    // Model a response lost after commit by discarding the first runtime and
    // retrying the same client command through a fresh pool and runtime.
    await closeConnection(first.connection);
    const replay = await restarted.runtime.service.createTransfer({
      actorId: "demo_customer_001",
      quoteId: quote.id,
      idempotencyKey,
    });
    assert.equal(replay.id, committed.id);

    const after = await restarted.runtime.accountResponse();
    assert.equal(after.bookBalance.minorUnits, before.bookBalance.minorUnits);
    assert.equal(
      BigInt(before.availableBalance.minorUnits) -
        BigInt(after.availableBalance.minorUnits),
      quote.debitAmount.amountMinor,
    );

    const persisted = await restarted.connection.pool.query<{
      transfer_count: string;
      hold_count: string;
      held_minor: string;
      idempotency_count: string;
      outbox_count: string;
    }>(
      `SELECT
         (SELECT count(*) FROM samra_core.remittance_transfers
          WHERE external_ref = $1)::text AS transfer_count,
         (SELECT count(*) FROM samra_core.ledger_holds
          WHERE business_event_type = 'remittance_transfer'
            AND business_event_id = $1)::text AS hold_count,
         (SELECT COALESCE(sum(amount_minor), 0) FROM samra_core.ledger_holds
          WHERE business_event_type = 'remittance_transfer'
            AND business_event_id = $1)::text AS held_minor,
         (SELECT count(*) FROM samra_core.idempotency_records
          WHERE scope = 'demo_customer_001:create-transfer'
            AND idempotency_key = $2)::text AS idempotency_count,
         (SELECT count(*) FROM samra_core.outbox_events o
          JOIN samra_core.remittance_transfers t ON t.id = o.aggregate_id
          WHERE t.external_ref = $1)::text AS outbox_count`,
      [committed.id, idempotencyKey],
    );
    assert.deepEqual(persisted.rows[0], {
      transfer_count: "1",
      hold_count: "1",
      held_minor: quote.debitAmount.amountMinor.toString(),
      idempotency_count: "1",
      outbox_count: "3",
    });
  } finally {
    await closeConnection(first.connection);
    await closeConnection(restarted.connection);
  }
});

test("CLAUDE-LED-021 Concurrent identical posts produce exactly one journal", async () => {
  const eventId = `concurrent-identical:${randomUUID()}`;
  const input: DurableJournalCommand = {
    eventType: "ledger_assurance",
    eventId,
    description: "Synthetic concurrent idempotent journal",
    postings: [
      ["control_rain_usd", "debit", 2_100n],
      ["clearing_remittance_principal_usd", "credit", 2_100n],
    ],
    metadata: { synthetic: "true", testCase: "CLAUDE-LED-021" },
  };
  const callers = Array.from({ length: 20 }, () => {
    const opened = openConnection(1);
    return {
      connection: opened,
      writer: new PostgresLedgerJournalWriter(
        new PostgresPersistenceContext(opened.pool),
      ),
    };
  });

  try {
    const journalIds = await Promise.all(
      callers.map(({ writer }) => writer.post(input)),
    );
    assert.equal(journalIds.length, 20);
    assert.equal(new Set(journalIds).size, 1);

    const persisted = await connection.pool.query<{
      journal_count: string;
      posting_count: string;
      debit_total: string;
      credit_total: string;
    }>(
      `SELECT count(DISTINCT j.id)::text AS journal_count,
              count(p.id)::text AS posting_count,
              sum(p.amount_minor) FILTER (WHERE p.side = 'debit')::text AS debit_total,
              sum(p.amount_minor) FILTER (WHERE p.side = 'credit')::text AS credit_total
       FROM samra_core.ledger_journals j
       JOIN samra_core.ledger_postings p ON p.journal_id = j.id
       WHERE j.business_event_type = $1 AND j.business_event_id = $2`,
      [input.eventType, input.eventId],
    );
    assert.deepEqual(persisted.rows[0], {
      journal_count: "1",
      posting_count: "2",
      debit_total: "2100",
      credit_total: "2100",
    });
  } finally {
    await Promise.all(
      callers.map(({ connection: opened }) => closeConnection(opened)),
    );
  }
});

function createRuntime() {
  const opened = openConnection();
  const runtimeContext = new PostgresPersistenceContext(opened.pool);
  return {
    connection: opened,
    runtime: new DemoRuntime({
      repository: new PostgresRemittanceRepository(runtimeContext),
      ledger: new PostgresLedgerControl(runtimeContext),
      unitOfWork: runtimeContext,
      ids: new RandomIdGenerator(),
    }),
  };
}

async function closeConnection(
  opened: ReturnType<typeof createDatabase>,
): Promise<void> {
  if (connections.delete(opened)) {
    await opened.pool.end();
  }
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

async function assertNoJournalResidue(eventIds: readonly string[]) {
  const residue = await connection.pool.query<{
    journal_count: string;
    posting_count: string;
  }>(
    `SELECT count(DISTINCT j.id)::text AS journal_count,
            count(p.id)::text AS posting_count
     FROM samra_core.ledger_journals j
     LEFT JOIN samra_core.ledger_postings p ON p.journal_id = j.id
     WHERE j.business_event_type = 'ledger_assurance'
       AND j.business_event_id = ANY($1::text[])`,
    [eventIds],
  );
  assert.deepEqual(residue.rows[0], {
    journal_count: "0",
    posting_count: "0",
  });
}

class RollbackAfterAssurance extends Error {}
