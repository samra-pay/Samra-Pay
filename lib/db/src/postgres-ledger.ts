import type pg from "pg";
import { DomainError, type LedgerControlPort } from "@workspace/remittance";
import { PostgresPersistenceContext } from "./postgres-persistence";

export type DurableAccountBalance = Readonly<{
  naturalBalanceMinor: bigint;
  activeHoldsMinor: bigint;
  availableMinor: bigint;
}>;

type Queryable = Pick<pg.Pool | pg.PoolClient, "query">;

export type DurableJournalPosting = readonly [
  accountCode: string,
  side: "debit" | "credit",
  amountMinor: bigint,
];

export type DurableJournalCommand = Readonly<{
  eventType: string;
  eventId: string;
  description: string;
  postings: readonly DurableJournalPosting[];
  metadata: Readonly<Record<string, string>>;
}>;

/**
 * The single PostgreSQL write boundary for ordinary ledger journals.
 *
 * It rejects malformed commands before persistence, verifies that every
 * account code resolves to one active same-currency account, and owns the
 * transaction when the caller is not already inside a larger unit of work.
 * Database triggers remain the independent final guard before a journal can
 * transition from draft to posted.
 */
export class PostgresLedgerJournalWriter {
  readonly #context: PostgresPersistenceContext;

  constructor(context: PostgresPersistenceContext) {
    this.#context = context;
  }

  async post(input: DurableJournalCommand): Promise<string> {
    validateJournalCommand(input);
    return this.#context.run(() => postJournal(this.#context.query(), input));
  }
}

export class PostgresLedgerControl implements LedgerControlPort {
  readonly #context: PostgresPersistenceContext;
  readonly #journals: PostgresLedgerJournalWriter;

  constructor(context: PostgresPersistenceContext) {
    this.#context = context;
    this.#journals = new PostgresLedgerJournalWriter(context);
  }

  async findHoldId(transferId: string): Promise<string | undefined> {
    const result = await this.#context.query().query<{ id: string }>(
      `SELECT id FROM samra_core.ledger_holds
       WHERE business_event_type = 'remittance_transfer' AND business_event_id = $1`,
      [transferId],
    );
    return result.rows[0]?.id;
  }

  async getCustomerBalance(accountRef: string): Promise<DurableAccountBalance> {
    const result = await this.#context.query().query<{
      natural_balance_minor: string;
      active_holds_minor: string;
      available_minor: string;
    }>(balanceSql, [accountRef]);
    const row = result.rows[0];
    if (!row) {
      throw new DomainError("NOT_FOUND", "The source account was not found.");
    }
    return Object.freeze({
      naturalBalanceMinor: BigInt(row.natural_balance_minor),
      activeHoldsMinor: BigInt(row.active_holds_minor),
      availableMinor: BigInt(row.available_minor),
    });
  }

  async reserve(input: {
    transferId: string;
    accountId: string;
    amountMinor: bigint;
    principalAmountMinor: bigint;
    feeAmountMinor: bigint;
    currency: "USD";
    idempotencyKey: string;
  }): Promise<{ holdId: string }> {
    if (
      input.amountMinor !==
      input.principalAmountMinor + input.feeAmountMinor
    ) {
      throw new DomainError(
        "INVALID_ARGUMENT",
        "Transfer debit must equal principal plus fee.",
      );
    }
    const query = this.#context.query();
    const existing = await this.findHoldId(input.transferId);
    if (existing) return { holdId: existing };

    const account = await query.query<{
      ledger_id: string;
      product_id: string;
    }>(
      `SELECT la.id AS ledger_id, pa.id AS product_id
       FROM samra_core.ledger_accounts la
       JOIN samra_core.product_accounts pa ON pa.id = la.product_account_id
       WHERE pa.external_ref = $1 AND la.currency = $2 AND la.state = 'active'
       FOR UPDATE OF la`,
      [input.accountId, input.currency],
    );
    if (!account.rows[0]) {
      throw new DomainError("NOT_FOUND", "The source account was not found.");
    }
    const balance = await this.getCustomerBalance(input.accountId);
    if (balance.availableMinor < input.amountMinor) {
      throw new DomainError(
        "INSUFFICIENT_FUNDS",
        "The account has insufficient available funds.",
      );
    }
    const inserted = await query.query<{ id: string }>(
      `INSERT INTO samra_core.ledger_holds (
         business_event_type, business_event_id, product_account_id,
         ledger_account_id, currency, amount_minor, state, metadata
       ) VALUES ('remittance_transfer',$1,$2,$3,$4,$5,'active',$6::jsonb)
       ON CONFLICT (business_event_type, business_event_id) DO UPDATE
         SET business_event_id = EXCLUDED.business_event_id
       RETURNING id`,
      [
        input.transferId,
        account.rows[0].product_id,
        account.rows[0].ledger_id,
        input.currency,
        input.amountMinor.toString(),
        JSON.stringify({
          principalAmountMinor: input.principalAmountMinor.toString(),
          feeAmountMinor: input.feeAmountMinor.toString(),
          idempotencyKey: input.idempotencyKey,
        }),
      ],
    );
    const holdId = inserted.rows[0]!.id;
    await query.query(
      `INSERT INTO samra_core.ledger_hold_events (hold_id, event_type, reason)
       VALUES ($1,'created','remittance_reserved')
       ON CONFLICT DO NOTHING`,
      [holdId],
    );
    return { holdId };
  }

  async capture(input: {
    transferId: string;
    holdId: string;
    idempotencyKey: string;
  }): Promise<void> {
    const record = await this.#holdRecord(input.transferId, input.holdId);
    const journalId = await this.#journals.post({
      eventType: "remittance_capture",
      eventId: input.transferId,
      description: "Capture remittance principal and deferred fee",
      postings: [
        ["demo_usd_account_001", "debit", record.principal + record.fee],
        ["clearing_remittance_principal_usd", "credit", record.principal],
        ...(record.fee > 0n
          ? [
              [
                "liability_deferred_remittance_fee_usd",
                "credit",
                record.fee,
              ] as const,
            ]
          : []),
      ],
      metadata: {
        transferId: input.transferId,
        idempotencyKey: input.idempotencyKey,
      },
    });
    await this.#context.query().query(
      `UPDATE samra_core.ledger_holds
       SET state = 'captured', terminal_at = COALESCE(terminal_at, now()), updated_at = now()
       WHERE id = $1 AND state = 'active'`,
      [input.holdId],
    );
    await saveHoldEvent(
      this.#context.query(),
      input.holdId,
      "captured",
      journalId,
    );
  }

  async release(input: {
    transferId: string;
    holdId: string;
    idempotencyKey: string;
  }): Promise<void> {
    await this.#holdRecord(input.transferId, input.holdId);
    await this.#context.query().query(
      `UPDATE samra_core.ledger_holds
       SET state = 'released', terminal_at = COALESCE(terminal_at, now()), updated_at = now()
       WHERE id = $1 AND state = 'active'`,
      [input.holdId],
    );
    await saveHoldEvent(
      this.#context.query(),
      input.holdId,
      "released",
      null,
      input.idempotencyKey,
    );
  }

  async settlePrincipal(input: {
    transferId: string;
    amountMinor: bigint;
    currency: "USD";
    idempotencyKey: string;
  }): Promise<void> {
    const record = await this.#holdRecord(input.transferId);
    if (record.principal !== input.amountMinor) {
      throw new DomainError(
        "CONFLICT",
        "Settlement amount does not match captured principal.",
      );
    }
    await this.#journals.post({
      eventType: "remittance_settlement",
      eventId: input.transferId,
      description: "Settle remittance principal from Rain control funds",
      postings: [
        ["clearing_remittance_principal_usd", "debit", input.amountMinor],
        ["control_rain_usd", "credit", input.amountMinor],
      ],
      metadata: {
        transferId: input.transferId,
        idempotencyKey: input.idempotencyKey,
      },
    });
  }

  async recognizeFee(input: {
    transferId: string;
    amountMinor: bigint;
    currency: "USD";
    idempotencyKey: string;
  }): Promise<void> {
    const record = await this.#holdRecord(input.transferId);
    if (record.fee !== input.amountMinor) {
      throw new DomainError(
        "CONFLICT",
        "Recognized fee does not match the quote snapshot.",
      );
    }
    if (input.amountMinor === 0n) return;
    await this.#journals.post({
      eventType: "remittance_fee_recognition",
      eventId: input.transferId,
      description: "Recognize remittance fee after successful payout",
      postings: [
        ["liability_deferred_remittance_fee_usd", "debit", input.amountMinor],
        ["revenue_remittance_fee_usd", "credit", input.amountMinor],
      ],
      metadata: {
        transferId: input.transferId,
        idempotencyKey: input.idempotencyKey,
      },
    });
  }

  async refund(input: {
    transferId: string;
    amountMinor: bigint;
    currency: "USD";
    idempotencyKey: string;
  }): Promise<void> {
    const record = await this.#holdRecord(input.transferId);
    if (input.amountMinor !== record.principal + record.fee) {
      throw new DomainError(
        "CONFLICT",
        "Refund amount does not match the original debit.",
      );
    }
    const originals = await this.#context.query().query<{ id: string }>(
      `SELECT id FROM samra_core.ledger_journals
       WHERE business_event_id = $1
         AND business_event_type IN ('remittance_capture','remittance_settlement','remittance_fee_recognition')
       ORDER BY CASE business_event_type
         WHEN 'remittance_fee_recognition' THEN 1
         WHEN 'remittance_settlement' THEN 2 ELSE 3 END`,
      [input.transferId],
    );
    for (const original of originals.rows) {
      await reverseJournal(
        this.#context.query(),
        original.id,
        input.transferId,
        input.idempotencyKey,
      );
    }
  }

  async #holdRecord(transferId: string, holdId?: string) {
    const result = await this.#context.query().query<{
      id: string;
      principal: string;
      fee: string;
    }>(
      `SELECT id, metadata->>'principalAmountMinor' AS principal,
              metadata->>'feeAmountMinor' AS fee
       FROM samra_core.ledger_holds
       WHERE business_event_type = 'remittance_transfer'
         AND business_event_id = $1 AND ($2::uuid IS NULL OR id = $2)`,
      [transferId, holdId ?? null],
    );
    const row = result.rows[0];
    if (!row) {
      throw new DomainError(
        "CONFLICT",
        `Missing ledger accounting record for ${transferId}.`,
      );
    }
    return {
      id: row.id,
      principal: BigInt(row.principal),
      fee: BigInt(row.fee),
    };
  }
}

const balanceSql = `
  SELECT
    COALESCE(SUM(CASE WHEN j.id IS NULL THEN 0
      WHEN p.side = la.normal_side THEN p.amount_minor ELSE -p.amount_minor END), 0)::text
      AS natural_balance_minor,
    COALESCE((SELECT SUM(h.amount_minor) FROM samra_core.ledger_holds h
      WHERE h.ledger_account_id = la.id AND h.state = 'active'), 0)::text
      AS active_holds_minor,
    (COALESCE(SUM(CASE WHEN j.id IS NULL THEN 0
      WHEN p.side = la.normal_side THEN p.amount_minor ELSE -p.amount_minor END), 0)
      - COALESCE((SELECT SUM(h.amount_minor) FROM samra_core.ledger_holds h
        WHERE h.ledger_account_id = la.id AND h.state = 'active'), 0))::text
      AS available_minor
  FROM samra_core.ledger_accounts la
  JOIN samra_core.product_accounts pa ON pa.id = la.product_account_id
  LEFT JOIN samra_core.ledger_postings p ON p.account_id = la.id
  LEFT JOIN samra_core.ledger_journals j ON j.id = p.journal_id AND j.state IN ('posted','reversed')
  WHERE pa.external_ref = $1
  GROUP BY la.id`;

async function postJournal(
  query: Queryable,
  input: DurableJournalCommand,
): Promise<string> {
  const existing = await query.query<{
    id: string;
    state: string;
    description: string;
    metadata: Record<string, string>;
  }>(
    `SELECT id, state, description, metadata
     FROM samra_core.ledger_journals
     WHERE business_event_type = $1 AND business_event_id = $2`,
    [input.eventType, input.eventId],
  );
  const existingJournal = existing.rows[0];
  if (existingJournal) {
    if (!["posted", "reversed"].includes(existingJournal.state)) {
      throw new DomainError(
        "CONFLICT",
        "The ledger business event already has an incomplete journal.",
        { eventType: input.eventType, eventId: input.eventId },
      );
    }
    const existingPostings = await query.query<{
      account_code: string;
      side: "debit" | "credit";
      amount_minor: string;
    }>(
      `SELECT a.code AS account_code, p.side, p.amount_minor::text AS amount_minor
       FROM samra_core.ledger_postings p
       JOIN samra_core.ledger_accounts a ON a.id = p.account_id
       WHERE p.journal_id = $1
       ORDER BY p.sequence`,
      [existingJournal.id],
    );
    if (
      existingJournal.description !== input.description ||
      !sameStringRecord(existingJournal.metadata, input.metadata) ||
      existingPostings.rows.length !== input.postings.length ||
      existingPostings.rows.some((posting, index) => {
        const expected = input.postings[index];
        return (
          !expected ||
          posting.account_code !== expected[0] ||
          posting.side !== expected[1] ||
          BigInt(posting.amount_minor) !== expected[2]
        );
      })
    ) {
      throw new DomainError(
        "CONFLICT",
        "The ledger business event was already used with a different journal command.",
        { eventType: input.eventType, eventId: input.eventId },
      );
    }
    return existingJournal.id;
  }
  const journal = await query.query<{ id: string }>(
    `INSERT INTO samra_core.ledger_journals
     (business_event_type, business_event_id, currency, state, description, metadata)
     VALUES ($1,$2,'USD','draft',$3,$4::jsonb) RETURNING id`,
    [
      input.eventType,
      input.eventId,
      input.description,
      JSON.stringify(input.metadata),
    ],
  );
  const journalId = journal.rows[0]!.id;
  for (const [index, posting] of input.postings.entries()) {
    const inserted = await query.query(
      `INSERT INTO samra_core.ledger_postings
       (journal_id, account_id, sequence, side, amount_minor)
       SELECT $1, id, $2, $3, $4
       FROM samra_core.ledger_accounts
       WHERE code = $5 AND currency = 'USD' AND state = 'active'`,
      [journalId, index + 1, posting[1], posting[2].toString(), posting[0]],
    );
    if (inserted.rowCount !== 1) {
      throw new DomainError(
        "NOT_FOUND",
        `Active USD ledger account ${posting[0]} was not found.`,
        { accountCode: posting[0] },
      );
    }
  }
  const posted = await query.query(
    `UPDATE samra_core.ledger_journals SET state = 'posted', posted_at = now()
     WHERE id = $1 AND state = 'draft'`,
    [journalId],
  );
  if (posted.rowCount !== 1) {
    throw new DomainError(
      "CONFLICT",
      "The ledger journal could not transition from draft to posted.",
      { journalId },
    );
  }
  return journalId;
}

function sameStringRecord(
  left: Readonly<Record<string, string>>,
  right: Readonly<Record<string, string>>,
): boolean {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) =>
        key === rightKeys[index] && left[key] === right[rightKeys[index]!],
    )
  );
}

function validateJournalCommand(input: DurableJournalCommand): void {
  if (
    input.eventType.trim().length === 0 ||
    input.eventId.trim().length === 0 ||
    input.description.trim().length === 0
  ) {
    throw new DomainError(
      "INVALID_ARGUMENT",
      "Ledger event type, event ID, and description are required.",
    );
  }
  if (input.postings.length < 2) {
    throw new DomainError(
      "INVALID_ARGUMENT",
      "A ledger journal requires at least two postings.",
    );
  }

  let debitTotal = 0n;
  let creditTotal = 0n;
  const accountCodes = new Set<string>();
  for (const [accountCode, side, amountMinor] of input.postings) {
    if (accountCode.trim().length === 0 || amountMinor <= 0n) {
      throw new DomainError(
        "INVALID_ARGUMENT",
        "Every ledger posting requires an account code and a positive amount.",
      );
    }
    accountCodes.add(accountCode);
    if (side === "debit") debitTotal += amountMinor;
    else creditTotal += amountMinor;
  }
  if (accountCodes.size < 2) {
    throw new DomainError(
      "INVALID_ARGUMENT",
      "A ledger journal must affect at least two accounts.",
    );
  }
  if (debitTotal !== creditTotal) {
    throw new DomainError(
      "INVALID_ARGUMENT",
      "Ledger journal debits must equal credits.",
      {
        debitTotalMinor: debitTotal.toString(),
        creditTotalMinor: creditTotal.toString(),
      },
    );
  }
}

async function reverseJournal(
  query: Queryable,
  originalId: string,
  transferId: string,
  idempotencyKey: string,
): Promise<void> {
  const existing = await query.query(
    `SELECT id FROM samra_core.ledger_journals WHERE reverses_journal_id = $1`,
    [originalId],
  );
  if (existing.rows[0]) return;
  const journal = await query.query<{ id: string }>(
    `INSERT INTO samra_core.ledger_journals
     (business_event_type, business_event_id, currency, state, description,
      reverses_journal_id, metadata)
     SELECT 'remittance_refund_reversal', $2::text || ':' || id::text, currency, 'draft',
            'Refund reversal for transfer ' || $2::text, id,
            jsonb_build_object('transferId',$2::text,'idempotencyKey',$3::text)
     FROM samra_core.ledger_journals WHERE id = $1::uuid RETURNING id`,
    [originalId, transferId, idempotencyKey],
  );
  const reversalId = journal.rows[0]!.id;
  await query.query(
    `INSERT INTO samra_core.ledger_postings
     (journal_id, account_id, sequence, side, amount_minor, memo)
     SELECT $1, account_id, sequence,
            CASE side WHEN 'debit' THEN 'credit'::samra_core.ledger_entry_side
                      ELSE 'debit'::samra_core.ledger_entry_side END,
            amount_minor, 'Reversal: ' || COALESCE(memo, '')
     FROM samra_core.ledger_postings WHERE journal_id = $2`,
    [reversalId, originalId],
  );
  await query.query(
    `UPDATE samra_core.ledger_journals SET state = 'posted', posted_at = now()
     WHERE id = $1`,
    [reversalId],
  );
}

async function saveHoldEvent(
  query: Queryable,
  holdId: string,
  eventType: "captured" | "released",
  journalId: string | null,
  reason = "remittance_accounting",
): Promise<void> {
  const exists = await query.query(
    `SELECT id FROM samra_core.ledger_hold_events
     WHERE hold_id = $1 AND event_type = $2`,
    [holdId, eventType],
  );
  if (exists.rows[0]) return;
  await query.query(
    `INSERT INTO samra_core.ledger_hold_events
     (hold_id, event_type, journal_id, reason) VALUES ($1,$2,$3,$4)`,
    [holdId, eventType, journalId, reason],
  );
}
