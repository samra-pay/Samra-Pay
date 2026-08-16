import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import pg from "pg";
import {
  DomainError,
  money,
  rational,
  type FakeScenario,
  type InboxDisposition,
  type InboxRecord,
  type OutboxMessage,
  type ProviderEvent,
  type ProviderName,
  type ProviderResourceLink,
  type RemittanceQuote,
  type RemittanceRepository,
  type RemittanceTransfer,
  type RemittanceUnitOfWork,
  type TransferStatusChange,
} from "@workspace/remittance";

type Queryable = Pick<pg.Pool | pg.PoolClient, "query">;

export class PostgresPersistenceContext implements RemittanceUnitOfWork {
  readonly #pool: pg.Pool;
  readonly #transactions = new AsyncLocalStorage<pg.PoolClient>();

  constructor(pool: pg.Pool) {
    this.#pool = pool;
  }

  query(): Queryable {
    return this.#transactions.getStore() ?? this.#pool;
  }

  async run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.#transactions.getStore()) {
      return operation();
    }
    const client = await this.#pool.connect();
    try {
      await client.query("BEGIN");
      const result = await this.#transactions.run(client, operation);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw mapDatabaseError(error);
    } finally {
      client.release();
    }
  }
}

type QuoteRow = {
  external_ref: string;
  actor_ref: string;
  account_ref: string;
  beneficiary_ref: string;
  source_amount_minor: string;
  fee_amount_minor: string;
  total_debit_minor: string;
  destination_amount_minor: string;
  fx_rate_numerator: string;
  fx_rate_denominator: string;
  funding_method: "samra_balance";
  delivery_method: "bank" | "wallet";
  estimated_delivery: string;
  created_at: Date;
  expires_at: Date;
};

type TransferRow = QuoteRow & {
  transfer_internal_id: string;
  transfer_ref: string;
  idempotency_key: string;
  state: string;
  funding_state: string;
  payout_state: string;
  reconciliation_state: string;
  version: number;
  created_at_transfer: Date;
  updated_at: Date;
};

export class PostgresRemittanceRepository implements RemittanceRepository {
  readonly #context: PostgresPersistenceContext;

  constructor(context: PostgresPersistenceContext) {
    this.#context = context;
  }

  async saveQuote(quote: RemittanceQuote): Promise<void> {
    const query = this.#context.query();
    const refs = await resolveRefs(query, quote);
    await query.query(
      `INSERT INTO samra_core.remittance_quotes (
         external_ref, customer_id, product_account_id, beneficiary_id,
         source_currency, destination_currency, source_amount_minor,
         fee_amount_minor, total_debit_minor, destination_amount_minor,
         fx_rate_numerator, fx_rate_denominator, state, pricing_version,
         funding_method, delivery_method, estimated_delivery, expires_at, created_at
       ) VALUES ($1,$2,$3,$4,'USD','ETB',$5,$6,$7,$8,$9,$10,'active',$11,$12,$13,$14,$15,$16)
       ON CONFLICT (external_ref) DO NOTHING`,
      [
        quote.id,
        refs.customerId,
        refs.productAccountId,
        refs.beneficiaryId,
        quote.sourceAmount.amountMinor.toString(),
        quote.feeAmount.amountMinor.toString(),
        quote.debitAmount.amountMinor.toString(),
        quote.recipientAmount.amountMinor.toString(),
        quote.rate.value.numerator.toString(),
        quote.rate.value.denominator.toString(),
        "demo-v1",
        quote.fundingMethod,
        quote.deliveryMethod,
        quote.estimatedDelivery,
        quote.expiresAt,
        quote.createdAt,
      ],
    );
  }

  async getQuote(quoteId: string): Promise<RemittanceQuote | undefined> {
    const result = await this.#context
      .query()
      .query<QuoteRow>(quoteSelectSql, [quoteId]);
    return result.rows[0] ? mapQuote(result.rows[0]) : undefined;
  }

  async isQuoteConsumed(quoteId: string): Promise<boolean> {
    const result = await this.#context.query().query<{ state: string }>(
      `SELECT state FROM samra_core.remittance_quotes
       WHERE external_ref = $1 FOR UPDATE`,
      [quoteId],
    );
    return result.rows[0]?.state === "accepted";
  }

  async markQuoteConsumed(quoteId: string, transferId: string): Promise<void> {
    const result = await this.#context.query().query(
      `UPDATE samra_core.remittance_quotes
       SET state = 'accepted', accepted_at = now()
       WHERE external_ref = $1 AND state = 'active'`,
      [quoteId],
    );
    if (result.rowCount === 0) {
      const existing = await this.getTransfer(transferId);
      if (!existing) {
        throw new DomainError(
          "QUOTE_ALREADY_USED",
          "The quote has already been consumed by another transfer.",
          { quoteId },
        );
      }
    }
  }

  async saveTransfer(transfer: RemittanceTransfer): Promise<void> {
    const query = this.#context.query();
    const refs = await resolveRefs(query, transfer.quote);
    const quoteId = await resolveInternalId(
      query,
      "remittance_quotes",
      transfer.quote.id,
    );
    const hold = await query.query<{ id: string }>(
      `SELECT id FROM samra_core.ledger_holds
       WHERE business_event_type = 'remittance_transfer' AND business_event_id = $1`,
      [transfer.id],
    );
    const existing = await query.query<{
      id: string;
      version: number;
      state: string;
      funding_state: string;
      payout_state: string;
      reconciliation_state: string;
    }>(
      `SELECT id, version, state, funding_state, payout_state, reconciliation_state
       FROM samra_core.remittance_transfers
       WHERE external_ref = $1 FOR UPDATE`,
      [transfer.id],
    );
    let internalId: string;
    if (!existing.rows[0]) {
      const inserted = await query.query<{ id: string }>(
        `INSERT INTO samra_core.remittance_transfers (
           external_ref, customer_id, product_account_id, beneficiary_id, quote_id,
           hold_id, state, funding_state, payout_state, reconciliation_state,
           version, source_currency, destination_currency, source_amount_minor,
           fee_amount_minor, total_debit_minor, destination_amount_minor,
           created_at, updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'USD','ETB',$12,$13,$14,$15,$16,$17)
         RETURNING id`,
        [
          transfer.id,
          refs.customerId,
          refs.productAccountId,
          refs.beneficiaryId,
          quoteId,
          hold.rows[0]?.id ?? null,
          transfer.state.toLowerCase(),
          transfer.fundingState.toLowerCase(),
          transfer.payoutState.toLowerCase(),
          transfer.reconciliationState.toLowerCase(),
          transfer.version,
          transfer.quote.sourceAmount.amountMinor.toString(),
          transfer.quote.feeAmount.amountMinor.toString(),
          transfer.quote.debitAmount.amountMinor.toString(),
          transfer.quote.recipientAmount.amountMinor.toString(),
          transfer.createdAt,
          transfer.updatedAt,
        ],
      );
      internalId = inserted.rows[0]!.id;
    } else {
      if (existing.rows[0].version > transfer.version) {
        throw new DomainError(
          "CONFLICT",
          "A stale transfer version cannot replace a newer version.",
          { transferId: transfer.id },
        );
      }
      if (
        existing.rows[0].version === transfer.version &&
        (existing.rows[0].state !== transfer.state.toLowerCase() ||
          existing.rows[0].funding_state !==
            transfer.fundingState.toLowerCase() ||
          existing.rows[0].payout_state !==
            transfer.payoutState.toLowerCase() ||
          existing.rows[0].reconciliation_state !==
            transfer.reconciliationState.toLowerCase())
      ) {
        throw new DomainError(
          "CONFLICT",
          "Concurrent work produced a conflicting transfer version.",
          { transferId: transfer.id, version: String(transfer.version) },
        );
      }
      internalId = existing.rows[0].id;
      await query.query(
        `UPDATE samra_core.remittance_transfers SET
           hold_id = COALESCE($2, hold_id), state = $3, funding_state = $4,
           payout_state = $5, reconciliation_state = $6, version = $7,
           updated_at = $8, completed_at = CASE WHEN $3 IN ('completed','refunded','reversed','cancelled','failed') THEN $8 ELSE completed_at END
         WHERE id = $1`,
        [
          internalId,
          hold.rows[0]?.id ?? null,
          transfer.state.toLowerCase(),
          transfer.fundingState.toLowerCase(),
          transfer.payoutState.toLowerCase(),
          transfer.reconciliationState.toLowerCase(),
          transfer.version,
          transfer.updatedAt,
        ],
      );
    }

    for (const status of transfer.statusHistory) {
      await saveStatus(query, internalId, status);
    }
    for (const link of transfer.providerLinks) {
      await saveProviderLink(query, internalId, link);
    }
    await query.query(
      `INSERT INTO samra_core.audit_events
       (event_key, actor_type, actor_id, action, entity_type, entity_id, correlation_id, metadata, occurred_at)
       VALUES ($1,'customer',$2,'transfer_state_saved','remittance_transfer',$3,$3,$4::jsonb,$5)
       ON CONFLICT (event_key) DO NOTHING`,
      [
        `transfer:${transfer.id}:version:${transfer.version}`,
        transfer.actorId,
        transfer.id,
        JSON.stringify({
          state: transfer.state,
          fundingState: transfer.fundingState,
          payoutState: transfer.payoutState,
          reconciliationState: transfer.reconciliationState,
        }),
        transfer.updatedAt,
      ],
    );
  }

  async getTransfer(
    transferId: string,
  ): Promise<RemittanceTransfer | undefined> {
    const rows = await this.#context
      .query()
      .query<TransferRow>(`${transferSelectSql} WHERE t.external_ref = $1`, [
        transferId,
      ]);
    return rows.rows[0] ? this.#hydrateTransfer(rows.rows[0]) : undefined;
  }

  async listTransfers(actorId: string): Promise<readonly RemittanceTransfer[]> {
    const rows = await this.#context
      .query()
      .query<TransferRow>(
        `${transferSelectSql} WHERE c.external_ref = $1 ORDER BY t.created_at DESC`,
        [actorId],
      );
    return Object.freeze(
      await Promise.all(rows.rows.map((row) => this.#hydrateTransfer(row))),
    );
  }

  async findIdempotentTransfer(actorId: string, idempotencyKey: string) {
    const query = this.#context.query();
    await query.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
      `${actorId}:create:${idempotencyKey}`,
    ]);
    const result = await query.query<{
      quote_ref: string;
      transfer_ref: string;
    }>(
      `SELECT r.response_body->>'quoteId' AS quote_ref, t.external_ref AS transfer_ref
       FROM samra_core.idempotency_records r
       JOIN samra_core.remittance_transfers t ON t.id = r.resource_id
       WHERE r.scope = $1 AND r.idempotency_key = $2 AND r.state = 'succeeded'`,
      [`${actorId}:create-transfer`, idempotencyKey],
    );
    const row = result.rows[0];
    if (!row) return undefined;
    const transfer = await this.getTransfer(row.transfer_ref);
    return transfer
      ? Object.freeze({ quoteId: row.quote_ref, transfer })
      : undefined;
  }

  async bindIdempotencyKey(
    actorId: string,
    idempotencyKey: string,
    quoteId: string,
    transferId: string,
  ): Promise<void> {
    await this.#bindIdempotency(
      `${actorId}:create-transfer`,
      idempotencyKey,
      quoteId,
      transferId,
      { quoteId, transferId },
    );
  }

  async findIdempotentCancellation(actorId: string, idempotencyKey: string) {
    const query = this.#context.query();
    await query.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
      `${actorId}:cancel:${idempotencyKey}`,
    ]);
    const result = await query.query<{ transfer_ref: string }>(
      `SELECT t.external_ref AS transfer_ref
       FROM samra_core.idempotency_records r
       JOIN samra_core.remittance_transfers t ON t.id = r.resource_id
       WHERE r.scope = $1 AND r.idempotency_key = $2 AND r.state = 'succeeded'`,
      [`${actorId}:cancel-transfer`, idempotencyKey],
    );
    const row = result.rows[0];
    if (!row) return undefined;
    const transfer = await this.getTransfer(row.transfer_ref);
    return transfer
      ? Object.freeze({ transferId: row.transfer_ref, transfer })
      : undefined;
  }

  async bindCancellationIdempotencyKey(
    actorId: string,
    idempotencyKey: string,
    transferId: string,
  ): Promise<void> {
    await this.#bindIdempotency(
      `${actorId}:cancel-transfer`,
      idempotencyKey,
      transferId,
      transferId,
      { transferId },
    );
  }

  async appendOutbox(message: OutboxMessage): Promise<void> {
    const transferId = await resolveInternalId(
      this.#context.query(),
      "remittance_transfers",
      message.aggregateId,
    );
    await this.#context.query().query(
      `INSERT INTO samra_core.outbox_events
       (event_key, aggregate_type, aggregate_id, event_type, payload, state, available_at, created_at)
       VALUES ($1,$2,$3,$4,$5::jsonb,'pending',$6,$6)
       ON CONFLICT (event_key) DO NOTHING`,
      [
        message.id,
        message.aggregateType,
        transferId,
        message.type,
        JSON.stringify(message.payload),
        message.occurredAt,
      ],
    );
  }

  async listOutbox(): Promise<readonly OutboxMessage[]> {
    const result = await this.#context.query().query<{
      event_key: string;
      aggregate_type: "REMITTANCE_TRANSFER";
      transfer_ref: string;
      event_type: OutboxMessage["type"];
      created_at: Date;
      payload: Record<string, string>;
    }>(
      `SELECT o.event_key, o.aggregate_type, t.external_ref AS transfer_ref,
              o.event_type, o.created_at, o.payload
       FROM samra_core.outbox_events o
       JOIN samra_core.remittance_transfers t ON t.id = o.aggregate_id
       ORDER BY o.created_at, o.event_key`,
    );
    return Object.freeze(
      result.rows.map((row) =>
        Object.freeze({
          id: row.event_key,
          aggregateType: row.aggregate_type,
          aggregateId: row.transfer_ref,
          type: row.event_type,
          occurredAt: row.created_at.toISOString(),
          payload: Object.freeze(row.payload),
        }),
      ),
    );
  }

  async appendInboxRecords(records: readonly InboxRecord[]): Promise<void> {
    for (const record of records) {
      const query = this.#context.query();
      const transferId = await resolveInternalId(
        query,
        "remittance_transfers",
        record.event.transferId,
      );
      const state = inboxState(record.disposition);
      await query.query(
        `INSERT INTO samra_core.provider_events (
           provider, provider_event_id, event_type, state, payload,
           related_resource_type, related_resource_id, occurred_at,
           received_at, processed_at, attempt_count
         ) VALUES ($1,$2,$3,$4,$5::jsonb,'remittance_transfer',$6,$7,$8,$9,1)
         ON CONFLICT (provider, provider_event_id) DO UPDATE SET
           state = CASE
             WHEN EXCLUDED.state = 'processed' THEN 'processed'::samra_core.provider_event_state
             ELSE samra_core.provider_events.state
           END,
           processed_at = CASE WHEN EXCLUDED.state = 'processed' THEN EXCLUDED.processed_at ELSE samra_core.provider_events.processed_at END,
           attempt_count = samra_core.provider_events.attempt_count + 1`,
        [
          record.event.provider.toLowerCase(),
          record.event.providerEventId,
          record.event.kind,
          state,
          JSON.stringify(record.event.payload),
          transferId,
          record.event.occurredAt,
          record.recordedAt,
          state === "processed" ? record.recordedAt : null,
        ],
      );
    }
  }

  async listInbox(transferId?: string): Promise<readonly InboxRecord[]> {
    const result = await this.#context.query().query<{
      provider: string;
      provider_event_id: string;
      event_type: ProviderEvent["kind"];
      state: string;
      payload: Record<string, string>;
      transfer_ref: string;
      occurred_at: Date;
      received_at: Date;
    }>(
      `SELECT e.provider, e.provider_event_id, e.event_type, e.state, e.payload,
              t.external_ref AS transfer_ref, e.occurred_at, e.received_at
       FROM samra_core.provider_events e
       JOIN samra_core.remittance_transfers t ON t.id = e.related_resource_id
       WHERE ($1::text IS NULL OR t.external_ref = $1)
       ORDER BY e.received_at, e.provider_event_id`,
      [transferId ?? null],
    );
    return Object.freeze(
      result.rows.map((row) => {
        const event = Object.freeze({
          provider: row.provider.toUpperCase() as ProviderName,
          providerEventId: row.provider_event_id,
          transferId: row.transfer_ref,
          kind: row.event_type,
          occurredAt: row.occurred_at.toISOString(),
          payload: Object.freeze(row.payload),
        });
        return Object.freeze({
          key: `${event.provider}:${event.providerEventId}`,
          event,
          disposition: inboxDisposition(row.state),
          recordedAt: row.received_at.toISOString(),
        });
      }),
    );
  }

  async saveFakeScenario(
    transferId: string,
    scenario: FakeScenario,
  ): Promise<void> {
    await this.#context.query().query(
      `UPDATE samra_core.remittance_transfers SET demo_scenario = $2
       WHERE external_ref = $1`,
      [transferId, scenario],
    );
  }

  async getFakeScenario(transferId: string): Promise<FakeScenario> {
    const result = await this.#context
      .query()
      .query<{ demo_scenario: FakeScenario }>(
        `SELECT demo_scenario FROM samra_core.remittance_transfers WHERE external_ref = $1`,
        [transferId],
      );
    return result.rows[0]?.demo_scenario ?? "HAPPY_PATH";
  }

  async #bindIdempotency(
    scope: string,
    idempotencyKey: string,
    requestHash: string,
    transferRef: string,
    response: Record<string, string>,
  ): Promise<void> {
    const transferId = await resolveInternalId(
      this.#context.query(),
      "remittance_transfers",
      transferRef,
    );
    await this.#context.query().query(
      `INSERT INTO samra_core.idempotency_records (
         scope, idempotency_key, request_hash, state, resource_type,
         resource_id, response_status, response_body, completed_at, expires_at
       ) VALUES ($1,$2,$3,'succeeded','remittance_transfer',$4,201,$5::jsonb,now(),now() + interval '30 days')
       ON CONFLICT (scope, idempotency_key) DO UPDATE SET
         state = 'succeeded', resource_id = EXCLUDED.resource_id,
         response_status = EXCLUDED.response_status,
         response_body = EXCLUDED.response_body, completed_at = EXCLUDED.completed_at
       WHERE samra_core.idempotency_records.request_hash = EXCLUDED.request_hash`,
      [
        scope,
        idempotencyKey,
        requestHash,
        transferId,
        JSON.stringify(response),
      ],
    );
  }

  async #hydrateTransfer(row: TransferRow): Promise<RemittanceTransfer> {
    const query = this.#context.query();
    const [history, links, idempotency] = await Promise.all([
      query.query<{
        sequence: number;
        from_state: string | null;
        to_state: string;
        reason: string;
        occurred_at: Date;
      }>(
        `SELECT sequence, from_state, to_state, reason, occurred_at
         FROM samra_core.remittance_transfer_status_history
         WHERE transfer_id = $1 ORDER BY sequence`,
        [row.transfer_internal_id],
      ),
      query.query<{
        provider: string;
        resource_type: string;
        provider_resource_id: string;
        created_at: Date;
      }>(
        `SELECT provider, resource_type, provider_resource_id, created_at
         FROM samra_core.provider_resource_links
         WHERE internal_resource_id = $1 ORDER BY created_at, provider_resource_id`,
        [row.transfer_internal_id],
      ),
      query.query<{ idempotency_key: string }>(
        `SELECT idempotency_key FROM samra_core.idempotency_records
         WHERE resource_id = $1 AND scope = $2 AND state = 'succeeded'
         ORDER BY completed_at LIMIT 1`,
        [row.transfer_internal_id, `${row.actor_ref}:create-transfer`],
      ),
    ]);
    return Object.freeze({
      id: row.transfer_ref,
      actorId: row.actor_ref,
      idempotencyKey:
        idempotency.rows[0]?.idempotency_key ?? "durable-recovered",
      quote: mapQuote(row),
      state: row.state.toUpperCase() as RemittanceTransfer["state"],
      fundingState:
        row.funding_state.toUpperCase() as RemittanceTransfer["fundingState"],
      payoutState:
        row.payout_state.toUpperCase() as RemittanceTransfer["payoutState"],
      reconciliationState:
        row.reconciliation_state.toUpperCase() as RemittanceTransfer["reconciliationState"],
      providerLinks: Object.freeze(
        links.rows.map((link) =>
          Object.freeze({
            provider: link.provider.toUpperCase(),
            resourceType: link.resource_type,
            providerResourceId: link.provider_resource_id,
            createdAt: link.created_at.toISOString(),
          } as ProviderResourceLink),
        ),
      ),
      statusHistory: Object.freeze(
        history.rows.map((status) =>
          Object.freeze({
            sequence: status.sequence,
            from: status.from_state?.toUpperCase() ?? null,
            to: status.to_state.toUpperCase(),
            reason: status.reason,
            occurredAt: status.occurred_at.toISOString(),
          } as TransferStatusChange),
        ),
      ),
      version: row.version,
      createdAt: row.created_at_transfer.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    });
  }
}

const quoteSelectSql = `
  SELECT q.external_ref, c.external_ref AS actor_ref,
         pa.external_ref AS account_ref, b.external_ref AS beneficiary_ref,
         q.source_amount_minor, q.fee_amount_minor, q.total_debit_minor,
         q.destination_amount_minor, q.fx_rate_numerator, q.fx_rate_denominator,
         q.funding_method, q.delivery_method, q.estimated_delivery,
         q.created_at, q.expires_at
  FROM samra_core.remittance_quotes q
  JOIN samra_core.customers c ON c.id = q.customer_id
  JOIN samra_core.product_accounts pa ON pa.id = q.product_account_id
  JOIN samra_core.beneficiaries b ON b.id = q.beneficiary_id
  WHERE q.external_ref = $1`;

const transferSelectSql = `
  SELECT t.id AS transfer_internal_id, t.external_ref AS transfer_ref,
         ''::text AS idempotency_key, t.state, t.funding_state, t.payout_state,
         t.reconciliation_state, t.version, t.created_at AS created_at_transfer,
         t.updated_at, q.external_ref, c.external_ref AS actor_ref,
         pa.external_ref AS account_ref, b.external_ref AS beneficiary_ref,
         q.source_amount_minor, q.fee_amount_minor, q.total_debit_minor,
         q.destination_amount_minor, q.fx_rate_numerator, q.fx_rate_denominator,
         q.funding_method, q.delivery_method, q.estimated_delivery,
         q.created_at, q.expires_at
  FROM samra_core.remittance_transfers t
  JOIN samra_core.remittance_quotes q ON q.id = t.quote_id
  JOIN samra_core.customers c ON c.id = t.customer_id
  JOIN samra_core.product_accounts pa ON pa.id = t.product_account_id
  JOIN samra_core.beneficiaries b ON b.id = t.beneficiary_id`;

function mapQuote(row: QuoteRow): RemittanceQuote {
  return Object.freeze({
    id: row.external_ref,
    actorId: row.actor_ref,
    sourceAccountId: row.account_ref,
    beneficiaryId: row.beneficiary_ref,
    sourceAmount: money(BigInt(row.source_amount_minor), "USD"),
    feeAmount: money(BigInt(row.fee_amount_minor), "USD"),
    debitAmount: money(BigInt(row.total_debit_minor), "USD"),
    recipientAmount: money(BigInt(row.destination_amount_minor), "ETB"),
    rate: Object.freeze({
      sourceCurrency: "USD" as const,
      destinationCurrency: "ETB" as const,
      value: rational(
        BigInt(row.fx_rate_numerator),
        BigInt(row.fx_rate_denominator),
      ),
    }),
    fundingMethod: row.funding_method,
    deliveryMethod: row.delivery_method,
    estimatedDelivery: row.estimated_delivery,
    createdAt: row.created_at.toISOString(),
    expiresAt: row.expires_at.toISOString(),
  });
}

async function resolveRefs(query: Queryable, quote: RemittanceQuote) {
  const result = await query.query<{
    customer_id: string;
    product_account_id: string;
    beneficiary_id: string;
  }>(
    `SELECT c.id AS customer_id, pa.id AS product_account_id, b.id AS beneficiary_id
     FROM samra_core.customers c
     JOIN samra_core.product_accounts pa ON pa.customer_id = c.id AND pa.external_ref = $2
     JOIN samra_core.beneficiaries b ON b.customer_id = c.id AND b.external_ref = $3
     WHERE c.external_ref = $1`,
    [quote.actorId, quote.sourceAccountId, quote.beneficiaryId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new DomainError(
      "NOT_FOUND",
      "Seeded demo account data was not found.",
    );
  }
  return {
    customerId: row.customer_id,
    productAccountId: row.product_account_id,
    beneficiaryId: row.beneficiary_id,
  };
}

async function resolveInternalId(
  query: Queryable,
  table: "remittance_quotes" | "remittance_transfers",
  externalRef: string,
): Promise<string> {
  const result = await query.query<{ id: string }>(
    `SELECT id FROM samra_core.${table} WHERE external_ref = $1`,
    [externalRef],
  );
  if (!result.rows[0]) {
    throw new DomainError(
      "NOT_FOUND",
      `Durable ${table} record was not found.`,
    );
  }
  return result.rows[0].id;
}

async function saveStatus(
  query: Queryable,
  transferId: string,
  status: TransferStatusChange,
): Promise<void> {
  await query.query(
    `INSERT INTO samra_core.remittance_transfer_status_history
     (transfer_id, sequence, from_state, to_state, reason, occurred_at)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (transfer_id, sequence) DO NOTHING`,
    [
      transferId,
      status.sequence,
      status.from?.toLowerCase() ?? null,
      status.to.toLowerCase(),
      status.reason,
      status.occurredAt,
    ],
  );
}

async function saveProviderLink(
  query: Queryable,
  transferId: string,
  link: ProviderResourceLink,
): Promise<void> {
  await query.query(
    `INSERT INTO samra_core.provider_resource_links
     (provider, resource_type, internal_resource_id, provider_resource_id, created_at)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (provider, resource_type, internal_resource_id) DO NOTHING`,
    [
      link.provider.toLowerCase(),
      link.resourceType,
      transferId,
      link.providerResourceId,
      link.createdAt,
    ],
  );
  await query.query(
    `INSERT INTO samra_core.provider_command_attempts
     (command_key, provider, command_type, transfer_id, request, response)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb)
     ON CONFLICT (command_key) DO NOTHING`,
    [
      `${link.provider}:${link.resourceType}:${link.providerResourceId}`,
      link.provider.toLowerCase(),
      link.resourceType,
      transferId,
      JSON.stringify({ transferId }),
      JSON.stringify({ providerResourceId: link.providerResourceId }),
    ],
  );
}

function inboxState(disposition: InboxDisposition) {
  return disposition === "PROCESSED"
    ? "processed"
    : disposition === "DEFERRED"
      ? "deferred"
      : disposition === "IGNORED"
        ? "ignored"
        : "received";
}

function inboxDisposition(state: string): InboxDisposition {
  return state === "processed"
    ? "PROCESSED"
    : state === "deferred"
      ? "DEFERRED"
      : state === "ignored"
        ? "IGNORED"
        : "DUPLICATE";
}

function mapDatabaseError(error: unknown): unknown {
  if (!(error instanceof Error)) return error;
  const code = (error as Error & { code?: string }).code;
  if (code === "23505" || code === "40001" || code === "40P01") {
    return new DomainError(
      "CONFLICT",
      "The operation conflicted with concurrent work.",
    );
  }
  return error;
}

export class RandomIdGenerator {
  next(prefix: "quote" | "transfer" | "outbox"): string {
    return `${prefix}_${randomUUID()}`;
  }
}
