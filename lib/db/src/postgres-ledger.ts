import type pg from "pg";
import {
  DomainError,
  type AuditActor,
  type LedgerControlPort,
} from "@workspace/remittance";
import { PostgresPersistenceContext } from "./postgres-persistence";

export type DurableAccountBalance = Readonly<{
  naturalBalanceMinor: bigint;
  activeHoldsMinor: bigint;
  availableMinor: bigint;
}>;

export type LedgerBalanceDrift = Readonly<{
  accountId: string;
  accountCode: string;
  currency: string;
  projectedNaturalMinor: string | null;
  actualNaturalMinor: string;
  projectedActiveHoldsMinor: string | null;
  actualActiveHoldsMinor: string;
  projectedAvailableMinor: string | null;
  actualAvailableMinor: string;
  projectedPostingCount: string | null;
  actualPostingCount: string;
  projectedActiveHoldCount: string | null;
  actualActiveHoldCount: string;
}>;

export type LedgerBalanceRebuildResult = Readonly<{
  id: string;
  commandRef: string;
  actorId: string;
  reason: string;
  state: "completed";
  driftedAccountCount: number;
  requestedAt: string;
  completedAt: string;
}>;

type Queryable = Pick<pg.Pool | pg.PoolClient, "query">;

type LedgerBalanceDriftRow = {
  account_id: string;
  account_code: string;
  currency: string;
  projected_natural_minor: string | null;
  actual_natural_minor: string;
  projected_active_holds_minor: string | null;
  actual_active_holds_minor: string;
  projected_available_minor: string | null;
  actual_available_minor: string;
  projected_posting_count: string | null;
  actual_posting_count: string;
  projected_active_hold_count: string | null;
  actual_active_hold_count: string;
};

type LedgerBalanceRebuildRow = {
  id: string;
  command_ref: string;
  actor_id: string;
  reason: string;
  state: string;
  drifted_account_count: number | null;
  requested_at: Date;
  completed_at: Date | null;
};

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
  auditActor?: AuditActor;
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
    return readCustomerBalance(this.#context.query(), accountRef);
  }

  async reserve(input: {
    transferId: string;
    accountId: string;
    amountMinor: bigint;
    principalAmountMinor: bigint;
    feeAmountMinor: bigint;
    currency: "USD";
    idempotencyKey: string;
    auditActor?: AuditActor;
  }): Promise<{ holdId: string }> {
    return this.#context.run(async () => {
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

      // The account lock serializes balance checks and hold creation. Re-check
      // the business event after waiting so an idempotent retry does not fail
      // an available-balance check against its own committed hold.
      const replay = await this.findHoldId(input.transferId);
      if (replay) return { holdId: replay };

      // Pass the already locked transaction client explicitly. This makes it
      // impossible for the balance read to drift onto another pooled
      // connection while the account lock is held.
      const balance = await readCustomerBalance(query, input.accountId);
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
      await recordLedgerAudit(query, {
        eventKey: `ledger:hold:${holdId}:reserved`,
        actor: auditActor(input.auditActor),
        action: "ledger_hold_reserved",
        entityType: "ledger_hold",
        entityId: holdId,
        correlationId: input.transferId,
        metadata: {
          transferId: input.transferId,
          amountMinor: input.amountMinor.toString(),
          currency: input.currency,
        },
      });
      return { holdId };
    });
  }

  async capture(input: {
    transferId: string;
    holdId: string;
    idempotencyKey: string;
    auditActor?: AuditActor;
  }): Promise<void> {
    await this.#context.run(async () => {
      const record = await this.#holdRecord(
        input.transferId,
        input.holdId,
        true,
      );
      if (record.state === "captured") return;
      if (record.state !== "active") {
        throw new DomainError(
          "CONFLICT",
          "Only an active hold can be captured.",
          { holdId: input.holdId, holdState: record.state },
        );
      }
      // Retire the locked hold before posting the matching debit. Otherwise
      // the database available-balance guard counts both the active hold and
      // the capture debit during this transaction. The transaction boundary
      // makes this safe: a journal failure rolls the hold back to active.
      const captured = await this.#context.query().query(
        `UPDATE samra_core.ledger_holds
         SET state = 'captured', terminal_at = now(), updated_at = now()
         WHERE id = $1 AND state = 'active'`,
        [input.holdId],
      );
      if (captured.rowCount !== 1) {
        throw new DomainError(
          "CONFLICT",
          "The hold could not transition from active to captured.",
          { holdId: input.holdId },
        );
      }
      const journalId = await this.#journals.post({
        eventType: "remittance_capture",
        eventId: input.transferId,
        description: "Capture remittance principal and deferred fee",
        postings: [
          [record.accountCode, "debit", record.principal + record.fee],
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
        auditActor: auditActor(input.auditActor),
      });
      await saveHoldEvent(
        this.#context.query(),
        input.holdId,
        "captured",
        journalId,
      );
      await recordLedgerAudit(this.#context.query(), {
        eventKey: `ledger:hold:${input.holdId}:captured`,
        actor: auditActor(input.auditActor),
        action: "ledger_hold_captured",
        entityType: "ledger_hold",
        entityId: input.holdId,
        correlationId: input.transferId,
        metadata: { transferId: input.transferId, journalId },
      });
    });
  }

  async release(input: {
    transferId: string;
    holdId: string;
    idempotencyKey: string;
    auditActor?: AuditActor;
  }): Promise<void> {
    await this.#context.run(async () => {
      const record = await this.#holdRecord(
        input.transferId,
        input.holdId,
        true,
      );
      if (record.state === "released") return;
      if (record.state !== "active") {
        throw new DomainError(
          "CONFLICT",
          "Only an active hold can be released.",
          { holdId: input.holdId, holdState: record.state },
        );
      }
      const released = await this.#context.query().query(
        `UPDATE samra_core.ledger_holds
         SET state = 'released', terminal_at = now(), updated_at = now()
         WHERE id = $1 AND state = 'active'`,
        [input.holdId],
      );
      if (released.rowCount !== 1) {
        throw new DomainError(
          "CONFLICT",
          "The hold could not transition from active to released.",
          { holdId: input.holdId },
        );
      }
      await saveHoldEvent(
        this.#context.query(),
        input.holdId,
        "released",
        null,
        input.idempotencyKey,
      );
      await recordLedgerAudit(this.#context.query(), {
        eventKey: `ledger:hold:${input.holdId}:released`,
        actor: auditActor(input.auditActor),
        action: "ledger_hold_released",
        entityType: "ledger_hold",
        entityId: input.holdId,
        correlationId: input.transferId,
        metadata: {
          transferId: input.transferId,
          reason: input.idempotencyKey,
        },
      });
    });
  }

  async settlePrincipal(input: {
    transferId: string;
    amountMinor: bigint;
    currency: "USD";
    idempotencyKey: string;
    auditActor?: AuditActor;
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
      auditActor: auditActor(input.auditActor),
    });
  }

  async recognizeFee(input: {
    transferId: string;
    amountMinor: bigint;
    currency: "USD";
    idempotencyKey: string;
    auditActor?: AuditActor;
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
      auditActor: auditActor(input.auditActor),
    });
  }

  async refund(input: {
    transferId: string;
    amountMinor: bigint;
    currency: "USD";
    idempotencyKey: string;
    auditActor?: AuditActor;
  }): Promise<void> {
    await this.#context.run(async () => {
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
      if (originals.rows.length === 0) {
        throw new DomainError(
          "CONFLICT",
          "The transfer has no posted ledger movement to refund.",
          { transferId: input.transferId },
        );
      }
      for (const original of originals.rows) {
        const reversalId = await reverseJournal(
          this.#context.query(),
          original.id,
          input.transferId,
          input.idempotencyKey,
        );
        await recordLedgerAudit(this.#context.query(), {
          eventKey: `ledger:journal:${reversalId}:reversed`,
          actor: auditActor(input.auditActor),
          action: "ledger_journal_reversed",
          entityType: "ledger_journal",
          entityId: reversalId,
          correlationId: input.transferId,
          metadata: {
            transferId: input.transferId,
            originalJournalId: original.id,
          },
        });
      }
    });
  }

  async #holdRecord(transferId: string, holdId?: string, lock = false) {
    const result = await this.#context.query().query<{
      id: string;
      principal: string;
      fee: string;
      state: "active" | "captured" | "released";
      account_code: string;
    }>(
      `SELECT h.id, h.metadata->>'principalAmountMinor' AS principal,
              h.metadata->>'feeAmountMinor' AS fee, h.state,
              a.code AS account_code
       FROM samra_core.ledger_holds h
       JOIN samra_core.ledger_accounts a ON a.id = h.ledger_account_id
       WHERE h.business_event_type = 'remittance_transfer'
         AND h.business_event_id = $1 AND ($2::uuid IS NULL OR h.id = $2)
       ${lock ? "FOR UPDATE OF h" : ""}`,
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
      state: row.state,
      accountCode: row.account_code,
    };
  }
}

/**
 * Operational controls for the rebuildable balance projection.
 *
 * Journals and holds remain the source of truth. Every drift sweep records an
 * immutable audit event, while a rebuild is executed by a database trigger so
 * projection correction and its operator evidence commit atomically.
 */
export class PostgresLedgerBalanceProjection {
  readonly #context: PostgresPersistenceContext;

  constructor(context: PostgresPersistenceContext) {
    this.#context = context;
  }

  async verify(
    input: Readonly<{
      sweepRef: string;
      actorType: "system" | "operator";
      actorId: string;
    }>,
  ): Promise<readonly LedgerBalanceDrift[]> {
    const sweepRef = requiredText(input.sweepRef, "Balance sweep reference");
    const actorId = requiredText(input.actorId, "Balance sweep actor");
    return this.#context.run(async () => {
      const query = this.#context.query();
      const result = await query.query<LedgerBalanceDriftRow>(
        ledgerBalanceDriftSql,
      );
      const drift = result.rows.map(mapLedgerBalanceDrift);
      const metadata = {
        driftedAccountCount: drift.length,
        accountCodes: drift.slice(0, 20).map((entry) => entry.accountCode),
      };
      const eventKey = `ledger:balance-sweep:${sweepRef}`;
      const inserted = await query.query(
        `INSERT INTO samra_core.audit_events
         (event_key, actor_type, actor_id, action, entity_type, entity_id,
          correlation_id, metadata)
         VALUES ($1,$2,$3,$4,'ledger_balance_projection',$5,$5,$6::jsonb)
         ON CONFLICT (event_key) DO NOTHING`,
        [
          eventKey,
          input.actorType,
          actorId,
          drift.length === 0
            ? "ledger_balance_projection_verified"
            : "ledger_balance_projection_drift_detected",
          sweepRef,
          JSON.stringify(metadata),
        ],
      );
      if (inserted.rowCount === 0) {
        const replay = await query.query<{
          actor_type: string;
          actor_id: string | null;
          action: string;
          metadata: { driftedAccountCount?: number };
        }>(
          `SELECT actor_type, actor_id, action, metadata
           FROM samra_core.audit_events WHERE event_key = $1`,
          [eventKey],
        );
        const expectedAction =
          drift.length === 0
            ? "ledger_balance_projection_verified"
            : "ledger_balance_projection_drift_detected";
        const existing = replay.rows[0];
        if (
          !existing ||
          existing.actor_type !== input.actorType ||
          existing.actor_id !== actorId ||
          existing.action !== expectedAction ||
          existing.metadata.driftedAccountCount !== drift.length
        ) {
          throw new DomainError(
            "CONFLICT",
            "The balance sweep reference was already used with different evidence.",
            { sweepRef },
          );
        }
      }
      return Object.freeze(drift);
    });
  }

  async rebuild(
    input: Readonly<{
      commandRef: string;
      operatorId: string;
      reason: string;
    }>,
  ): Promise<LedgerBalanceRebuildResult> {
    const commandRef = requiredText(
      input.commandRef,
      "Balance rebuild command reference",
    );
    const operatorId = requiredText(
      input.operatorId,
      "Balance rebuild operator",
    );
    const reason = input.reason.trim();
    if (reason.length < 20) {
      throw new DomainError(
        "INVALID_ARGUMENT",
        "A balance rebuild reason of at least 20 characters is required.",
      );
    }
    return this.#context.run(async () => {
      const query = this.#context.query();
      const inserted = await query.query(
        `INSERT INTO samra_core.ledger_balance_rebuild_commands
         (command_ref, actor_id, reason)
         VALUES ($1,$2,$3)
         ON CONFLICT (command_ref) DO NOTHING`,
        [commandRef, operatorId, reason],
      );
      const result = await query.query<LedgerBalanceRebuildRow>(
        `SELECT id, command_ref, actor_id, reason, state,
                drifted_account_count, requested_at, completed_at
         FROM samra_core.ledger_balance_rebuild_commands
         WHERE command_ref = $1`,
        [commandRef],
      );
      const command = result.rows[0];
      if (!command) {
        throw new DomainError(
          "CONFLICT",
          "The balance rebuild command could not be recovered.",
          { commandRef },
        );
      }
      if (
        inserted.rowCount === 0 &&
        (command.actor_id !== operatorId || command.reason !== reason)
      ) {
        throw new DomainError(
          "CONFLICT",
          "The balance rebuild reference was already used with different evidence.",
          { commandRef },
        );
      }
      if (
        command.state !== "completed" ||
        command.drifted_account_count === null ||
        command.completed_at === null
      ) {
        throw new DomainError(
          "CONFLICT",
          "The balance rebuild did not complete atomically.",
          { commandRef },
        );
      }
      return mapLedgerBalanceRebuild(command);
    });
  }
}

export const ledgerCustomerBalanceSql = `
  SELECT
    balance.natural_balance_minor::text AS natural_balance_minor,
    balance.active_holds_minor::text AS active_holds_minor,
    balance.available_balance_minor::text AS available_minor
  FROM samra_core.ledger_accounts la
  JOIN samra_core.product_accounts pa ON pa.id = la.product_account_id
  JOIN samra_core.ledger_account_balances balance ON balance.account_id = la.id
  WHERE pa.external_ref = $1`;

export const ledgerBalanceDriftSql = `
  SELECT truth.account_id, account.code AS account_code, truth.currency::text,
         projection.natural_balance_minor::text AS projected_natural_minor,
         truth.natural_balance_minor::text AS actual_natural_minor,
         projection.active_holds_minor::text AS projected_active_holds_minor,
         truth.active_holds_minor::text AS actual_active_holds_minor,
         projection.available_balance_minor::text AS projected_available_minor,
         truth.available_balance_minor::text AS actual_available_minor,
         projection.applied_posting_count::text AS projected_posting_count,
         truth.applied_posting_count::text AS actual_posting_count,
         projection.active_hold_count::text AS projected_active_hold_count,
         truth.active_hold_count::text AS actual_active_hold_count
  FROM samra_core.ledger_account_balance_truth truth
  JOIN samra_core.ledger_accounts account ON account.id = truth.account_id
  LEFT JOIN samra_core.ledger_account_balances projection
    ON projection.account_id = truth.account_id
  WHERE projection.account_id IS NULL
     OR projection.currency IS DISTINCT FROM truth.currency
     OR projection.natural_balance_minor IS DISTINCT FROM truth.natural_balance_minor
     OR projection.active_holds_minor IS DISTINCT FROM truth.active_holds_minor
     OR projection.available_balance_minor IS DISTINCT FROM truth.available_balance_minor
     OR projection.applied_posting_count IS DISTINCT FROM truth.applied_posting_count
     OR projection.active_hold_count IS DISTINCT FROM truth.active_hold_count
  ORDER BY account.code`;

async function readCustomerBalance(
  query: Queryable,
  accountRef: string,
): Promise<DurableAccountBalance> {
  const result = await query.query<{
    natural_balance_minor: string;
    active_holds_minor: string;
    available_minor: string;
  }>(ledgerCustomerBalanceSql, [accountRef]);
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

async function postJournal(
  query: Queryable,
  input: DurableJournalCommand,
): Promise<string> {
  const journal = await query.query<{ id: string }>(
    `INSERT INTO samra_core.ledger_journals
     (business_event_type, business_event_id, currency, state, description, metadata)
     VALUES ($1,$2,'USD','draft',$3,$4::jsonb)
     ON CONFLICT (business_event_type, business_event_id) DO NOTHING
     RETURNING id`,
    [
      input.eventType,
      input.eventId,
      input.description,
      JSON.stringify(input.metadata),
    ],
  );
  const journalId = journal.rows[0]?.id;
  if (!journalId) {
    return resolveJournalReplay(query, input);
  }
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
  await recordLedgerAudit(query, {
    eventKey: `ledger:journal:${journalId}:posted`,
    actor: auditActor(input.auditActor),
    action: "ledger_journal_posted",
    entityType: "ledger_journal",
    entityId: journalId,
    correlationId: input.metadata["transferId"] ?? input.eventId,
    metadata: {
      businessEventType: input.eventType,
      businessEventId: input.eventId,
    },
  });
  return journalId;
}

async function resolveJournalReplay(
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
  if (!existingJournal) {
    throw new DomainError(
      "CONFLICT",
      "The ledger business event conflict could not be resolved.",
      { eventType: input.eventType, eventId: input.eventId },
    );
  }
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
): Promise<string> {
  const journal = await query.query<{ id: string }>(
    `INSERT INTO samra_core.ledger_journals
     (business_event_type, business_event_id, currency, state, description,
      reverses_journal_id, metadata)
     SELECT 'remittance_refund_reversal', $2::text || ':' || id::text, currency, 'draft',
            'Refund reversal for transfer ' || $2::text, id,
            jsonb_build_object('transferId',$2::text,'idempotencyKey',$3::text)
     FROM samra_core.ledger_journals
     WHERE id = $1::uuid AND state IN ('posted','reversed')
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [originalId, transferId, idempotencyKey],
  );
  const reversalId = journal.rows[0]?.id;
  if (!reversalId) {
    const replay = await query.query<{ id: string }>(
      `SELECT id FROM samra_core.ledger_journals
       WHERE reverses_journal_id = $1`,
      [originalId],
    );
    if (replay.rows[0]) return replay.rows[0].id;
    throw new DomainError(
      "CONFLICT",
      "The original posted journal could not be reversed.",
      { originalJournalId: originalId },
    );
  }
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
  return reversalId;
}

async function saveHoldEvent(
  query: Queryable,
  holdId: string,
  eventType: "captured" | "released",
  journalId: string | null,
  reason = "remittance_accounting",
): Promise<void> {
  await query.query(
    `INSERT INTO samra_core.ledger_hold_events
     (hold_id, event_type, journal_id, reason) VALUES ($1,$2,$3,$4)
     ON CONFLICT (hold_id, event_type) DO NOTHING`,
    [holdId, eventType, journalId, reason],
  );
}

type LedgerAuditInput = Readonly<{
  eventKey: string;
  actor: AuditActor;
  action: string;
  entityType: string;
  entityId: string;
  correlationId: string;
  metadata: Readonly<Record<string, string>>;
}>;

function auditActor(actor?: AuditActor): AuditActor {
  return actor ?? { actorType: "system", actorId: "ledger-control" };
}

async function recordLedgerAudit(
  query: Queryable,
  input: LedgerAuditInput,
): Promise<void> {
  await query.query(
    `INSERT INTO samra_core.audit_events
     (event_key, actor_type, actor_id, action, entity_type, entity_id,
      correlation_id, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
     ON CONFLICT (event_key) DO NOTHING`,
    [
      input.eventKey,
      input.actor.actorType,
      input.actor.actorId,
      input.action,
      input.entityType,
      input.entityId,
      input.correlationId,
      JSON.stringify(input.metadata),
    ],
  );
}

function requiredText(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new DomainError("INVALID_ARGUMENT", `${label} is required.`);
  }
  return normalized;
}

function mapLedgerBalanceDrift(row: LedgerBalanceDriftRow): LedgerBalanceDrift {
  return Object.freeze({
    accountId: row.account_id,
    accountCode: row.account_code,
    currency: row.currency,
    projectedNaturalMinor: row.projected_natural_minor,
    actualNaturalMinor: row.actual_natural_minor,
    projectedActiveHoldsMinor: row.projected_active_holds_minor,
    actualActiveHoldsMinor: row.actual_active_holds_minor,
    projectedAvailableMinor: row.projected_available_minor,
    actualAvailableMinor: row.actual_available_minor,
    projectedPostingCount: row.projected_posting_count,
    actualPostingCount: row.actual_posting_count,
    projectedActiveHoldCount: row.projected_active_hold_count,
    actualActiveHoldCount: row.actual_active_hold_count,
  });
}

function mapLedgerBalanceRebuild(
  row: LedgerBalanceRebuildRow,
): LedgerBalanceRebuildResult {
  return Object.freeze({
    id: row.id,
    commandRef: row.command_ref,
    actorId: row.actor_id,
    reason: row.reason,
    state: "completed",
    driftedAccountCount: row.drifted_account_count!,
    requestedAt: row.requested_at.toISOString(),
    completedAt: row.completed_at!.toISOString(),
  });
}
