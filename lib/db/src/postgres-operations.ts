import type { PostgresPersistenceContext } from "./postgres-persistence";

const ACTIONABLE_TRANSFER_SQL = `
  t.state IN ('submitted','in_transit','payout_pending','refund_pending','reversal_pending')
  OR (t.state = 'completed' AND t.demo_scenario = 'SETTLEMENT_REFUND')`;

export type WorkflowClaim = Readonly<{
  id: string;
  transferId: string;
  actorId: string;
  transferVersion: number;
  transferState: string;
  scenario: string;
  attemptCount: number;
  maxAttempts: number;
}>;

export type ClaimedOutboxEvent = Readonly<{
  id: string;
  eventKey: string;
  aggregateId: string;
  eventType: string;
  payload: Readonly<Record<string, unknown>>;
  attemptCount: number;
}>;

export type WorkflowSettlement = Readonly<{
  claimId: string;
  workerId: string;
  transferVersion: number;
  actionable: boolean;
  progressed: boolean;
  retryAt: Date;
}>;

export type OperationsSummary = Readonly<{
  generatedAt: string;
  customers: Readonly<Record<string, number>>;
  transfers: Readonly<Record<string, number>>;
  workflow: Readonly<Record<string, number>>;
  outbox: Readonly<Record<string, number>>;
  providerEvents: Readonly<Record<string, number>>;
  openReconciliationExceptions: number;
}>;

export type OperationsCustomerListItem = Readonly<{
  id: string;
  displayName: string;
  countryCode: string;
  status: string;
  accountCount: number;
  beneficiaryCount: number;
  transferCount: number;
  completedTransferCount: number;
  sourceCurrency: string;
  totalSentMinor: string;
  lastTransferAt: string | null;
  createdAt: string;
}>;

export type OperationsTransferListItem = Readonly<{
  id: string;
  customerId: string;
  beneficiaryDisplay: string;
  status: string;
  fundingStatus: string;
  payoutStatus: string;
  reconciliationStatus: string;
  sourceCurrency: string;
  sourceAmountMinor: string;
  feeAmountMinor: string;
  totalDebitMinor: string;
  destinationCurrency: string;
  destinationAmountMinor: string;
  workflowState: string | null;
  workflowAttempts: number | null;
  workflowLastError: string | null;
  createdAt: string;
  updatedAt: string;
}>;

export type OperationsReconciliationException = Readonly<{
  id: string;
  runId: string;
  transferId: string | null;
  code: string;
  state: string;
  summary: string;
  assignedTo: string | null;
  openedAt: string;
  updatedAt: string;
}>;

export type OperationsAuditEvent = Readonly<{
  id: string;
  eventKey: string;
  actorType: string;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  correlationId: string | null;
  metadata: Readonly<Record<string, unknown>>;
  occurredAt: string;
}>;

export class PostgresOperationsStore {
  readonly #context: PostgresPersistenceContext;

  constructor(context: PostgresPersistenceContext) {
    this.#context = context;
  }

  async claimWorkflowBatch(
    input: Readonly<{
      workerId: string;
      limit: number;
      now: Date;
      leaseMilliseconds: number;
    }>,
  ): Promise<readonly WorkflowClaim[]> {
    return this.#context.run(async () => {
      const query = this.#context.query();
      await query.query(
        `UPDATE samra_core.remittance_workflow_work
         SET state = CASE WHEN attempt_count >= max_attempts
                          THEN 'failed'::samra_core.workflow_work_state
                          ELSE 'retry'::samra_core.workflow_work_state END,
             terminal_reason = CASE WHEN attempt_count >= max_attempts
                                    THEN 'LEASE_EXPIRED_AT_RETRY_LIMIT' ELSE NULL END,
             last_error = 'WORKER_LEASE_EXPIRED', lease_owner = NULL,
             lease_expires_at = NULL, updated_at = $1
         WHERE state = 'processing' AND lease_expires_at <= $1`,
        [input.now],
      );
      await query.query(
        `INSERT INTO samra_core.remittance_workflow_work
           (transfer_id, transfer_version, state, available_at, created_at, updated_at)
         SELECT t.id, t.version, 'pending', $1, $1, $1
         FROM samra_core.remittance_transfers t
         WHERE (${ACTIONABLE_TRANSFER_SQL})
         ON CONFLICT (transfer_id) DO UPDATE SET
           transfer_version = EXCLUDED.transfer_version,
           state = 'pending', attempt_count = 0, available_at = EXCLUDED.available_at,
           lease_owner = NULL, lease_expires_at = NULL, last_error = NULL,
           terminal_reason = NULL, updated_at = EXCLUDED.updated_at
         WHERE samra_core.remittance_workflow_work.transfer_version < EXCLUDED.transfer_version
           AND samra_core.remittance_workflow_work.state <> 'processing'`,
        [input.now],
      );
      const leaseExpiresAt = new Date(
        input.now.getTime() + input.leaseMilliseconds,
      );
      const result = await query.query<{
        id: string;
        transfer_ref: string;
        actor_ref: string;
        transfer_version: number;
        transfer_state: string;
        demo_scenario: string;
        attempt_count: number;
        max_attempts: number;
      }>(
        `WITH candidates AS (
           SELECT w.id
           FROM samra_core.remittance_workflow_work w
           WHERE w.state IN ('pending','retry')
             AND w.available_at <= $1
             AND w.attempt_count < w.max_attempts
           ORDER BY w.available_at, w.created_at, w.id
           FOR UPDATE SKIP LOCKED
           LIMIT $2
         ), claimed AS (
           UPDATE samra_core.remittance_workflow_work w
           SET state = 'processing', attempt_count = w.attempt_count + 1,
               lease_owner = $3, lease_expires_at = $4, updated_at = $1
           FROM candidates c
           WHERE w.id = c.id
           RETURNING w.*
         )
         SELECT c.id, t.external_ref AS transfer_ref,
                customer.external_ref AS actor_ref,
                c.transfer_version, t.state AS transfer_state,
                t.demo_scenario, c.attempt_count, c.max_attempts
         FROM claimed c
         JOIN samra_core.remittance_transfers t ON t.id = c.transfer_id
         JOIN samra_core.customers customer ON customer.id = t.customer_id
         ORDER BY c.available_at, c.created_at, c.id`,
        [input.now, input.limit, input.workerId, leaseExpiresAt],
      );
      return Object.freeze(
        result.rows.map((row) =>
          Object.freeze({
            id: row.id,
            transferId: row.transfer_ref,
            actorId: row.actor_ref,
            transferVersion: row.transfer_version,
            transferState: row.transfer_state,
            scenario: row.demo_scenario,
            attemptCount: row.attempt_count,
            maxAttempts: row.max_attempts,
          }),
        ),
      );
    });
  }

  async settleWorkflowClaim(input: WorkflowSettlement): Promise<void> {
    const result = await this.#context.query().query(
      `UPDATE samra_core.remittance_workflow_work
       SET transfer_version = $3,
           state = CASE
             WHEN NOT $4 THEN 'completed'::samra_core.workflow_work_state
             WHEN $5 THEN 'pending'::samra_core.workflow_work_state
             ELSE 'retry'::samra_core.workflow_work_state END,
           attempt_count = CASE WHEN $5 THEN 0 ELSE attempt_count END,
           available_at = $6, lease_owner = NULL, lease_expires_at = NULL,
           last_error = CASE WHEN $4 AND NOT $5 THEN 'NO_STATE_PROGRESS' ELSE NULL END,
           terminal_reason = NULL, updated_at = now()
       WHERE id = $1 AND state = 'processing' AND lease_owner = $2`,
      [
        input.claimId,
        input.workerId,
        input.transferVersion,
        input.actionable,
        input.progressed,
        input.retryAt,
      ],
    );
    if (result.rowCount !== 1) {
      throw new Error("The workflow lease was lost before settlement.");
    }
  }

  async failWorkflowClaim(
    input: Readonly<{
      claimId: string;
      workerId: string;
      error: string;
      retryAt: Date;
    }>,
  ): Promise<void> {
    const result = await this.#context.query().query(
      `UPDATE samra_core.remittance_workflow_work
       SET state = CASE WHEN attempt_count >= max_attempts
                        THEN 'failed'::samra_core.workflow_work_state
                        ELSE 'retry'::samra_core.workflow_work_state END,
           available_at = $4,
           terminal_reason = CASE WHEN attempt_count >= max_attempts
                                  THEN 'RETRY_EXHAUSTED' ELSE NULL END,
           last_error = left($3, 2000), lease_owner = NULL,
           lease_expires_at = NULL, updated_at = now()
       WHERE id = $1 AND state = 'processing' AND lease_owner = $2`,
      [input.claimId, input.workerId, input.error, input.retryAt],
    );
    if (result.rowCount !== 1) {
      throw new Error("The workflow lease was lost before failure handling.");
    }
  }

  async claimOutboxBatch(
    input: Readonly<{
      workerId: string;
      limit: number;
      now: Date;
      leaseMilliseconds: number;
    }>,
  ): Promise<readonly ClaimedOutboxEvent[]> {
    return this.#context.run(async () => {
      const query = this.#context.query();
      await query.query(
        `UPDATE samra_core.outbox_events
         SET state = 'pending', claimed_at = NULL, lease_owner = NULL,
             lease_expires_at = NULL, last_error = 'OUTBOX_LEASE_EXPIRED'
         WHERE state = 'processing' AND lease_expires_at <= $1`,
        [input.now],
      );
      const leaseExpiresAt = new Date(
        input.now.getTime() + input.leaseMilliseconds,
      );
      const result = await query.query<{
        id: string;
        event_key: string;
        transfer_ref: string;
        event_type: string;
        payload: Record<string, unknown>;
        attempt_count: number;
      }>(
        `WITH candidates AS (
           SELECT id FROM samra_core.outbox_events
           WHERE state = 'pending' AND available_at <= $1
           ORDER BY available_at, created_at, id
           FOR UPDATE SKIP LOCKED
           LIMIT $2
         ), claimed AS (
           UPDATE samra_core.outbox_events o
           SET state = 'processing', attempt_count = o.attempt_count + 1,
               claimed_at = $1, lease_owner = $3, lease_expires_at = $4
           FROM candidates c WHERE o.id = c.id RETURNING o.*
         )
         SELECT c.id, c.event_key, t.external_ref AS transfer_ref,
                c.event_type, c.payload, c.attempt_count
         FROM claimed c
         JOIN samra_core.remittance_transfers t ON t.id = c.aggregate_id
         ORDER BY c.created_at, c.id`,
        [input.now, input.limit, input.workerId, leaseExpiresAt],
      );
      return Object.freeze(
        result.rows.map((row) =>
          Object.freeze({
            id: row.id,
            eventKey: row.event_key,
            aggregateId: row.transfer_ref,
            eventType: row.event_type,
            payload: Object.freeze(row.payload),
            attemptCount: row.attempt_count,
          }),
        ),
      );
    });
  }

  async markOutboxPublished(
    input: Readonly<{
      eventId: string;
      workerId: string;
      publishedAt: Date;
    }>,
  ): Promise<void> {
    const result = await this.#context.query().query(
      `UPDATE samra_core.outbox_events
       SET state = 'published', published_at = $3, lease_owner = NULL,
           lease_expires_at = NULL, last_error = NULL
       WHERE id = $1 AND state = 'processing' AND lease_owner = $2`,
      [input.eventId, input.workerId, input.publishedAt],
    );
    if (result.rowCount !== 1) {
      throw new Error("The outbox lease was lost before publication.");
    }
  }

  async failOutbox(
    input: Readonly<{
      eventId: string;
      workerId: string;
      error: string;
      retryAt: Date;
      maxAttempts: number;
    }>,
  ): Promise<void> {
    const result = await this.#context.query().query(
      `UPDATE samra_core.outbox_events
       SET state = CASE WHEN attempt_count >= $5
                        THEN 'failed'::samra_core.outbox_event_state
                        ELSE 'pending'::samra_core.outbox_event_state END,
           available_at = $4, lease_owner = NULL, lease_expires_at = NULL,
           last_error = left($3, 2000)
       WHERE id = $1 AND state = 'processing' AND lease_owner = $2`,
      [
        input.eventId,
        input.workerId,
        input.error,
        input.retryAt,
        input.maxAttempts,
      ],
    );
    if (result.rowCount !== 1) {
      throw new Error("The outbox lease was lost before failure handling.");
    }
  }

  async recordAudit(
    input: Readonly<{
      eventKey: string;
      actorType: "system" | "customer" | "operator" | "provider";
      actorId?: string;
      action: string;
      entityType: string;
      entityId: string;
      correlationId?: string;
      metadata?: Readonly<Record<string, unknown>>;
      occurredAt?: Date;
    }>,
  ): Promise<void> {
    await this.#context.query().query(
      `INSERT INTO samra_core.audit_events
       (event_key, actor_type, actor_id, action, entity_type, entity_id,
        correlation_id, metadata, occurred_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)
       ON CONFLICT (event_key) DO NOTHING`,
      [
        input.eventKey,
        input.actorType,
        input.actorId ?? null,
        input.action,
        input.entityType,
        input.entityId,
        input.correlationId ?? null,
        JSON.stringify(input.metadata ?? {}),
        input.occurredAt ?? new Date(),
      ],
    );
  }

  async operationsSummary(now = new Date()): Promise<OperationsSummary> {
    const result = await this.#context.query().query<{
      transfers: Record<string, number>;
      customers: Record<string, number>;
      workflow: Record<string, number>;
      outbox: Record<string, number>;
      provider_events: Record<string, number>;
      open_exceptions: number;
    }>(
      `SELECT
         (SELECT COALESCE(jsonb_object_agg(state, count), '{}'::jsonb)
          FROM (SELECT state::text, count(*)::int AS count
                FROM samra_core.customers GROUP BY state) x) AS customers,
         (SELECT COALESCE(jsonb_object_agg(state, count), '{}'::jsonb)
          FROM (SELECT state::text, count(*)::int AS count
                FROM samra_core.remittance_transfers GROUP BY state) x) AS transfers,
         (SELECT COALESCE(jsonb_object_agg(state, count), '{}'::jsonb)
          FROM (SELECT state::text, count(*)::int AS count
                FROM samra_core.remittance_workflow_work GROUP BY state) x) AS workflow,
         (SELECT COALESCE(jsonb_object_agg(state, count), '{}'::jsonb)
          FROM (SELECT state::text, count(*)::int AS count
                FROM samra_core.outbox_events GROUP BY state) x) AS outbox,
         (SELECT COALESCE(jsonb_object_agg(state, count), '{}'::jsonb)
          FROM (SELECT state::text, count(*)::int AS count
                FROM samra_core.provider_events GROUP BY state) x) AS provider_events,
         (SELECT count(*)::int FROM samra_core.reconciliation_exceptions
          WHERE state IN ('open','in_review')) AS open_exceptions`,
    );
    const row = result.rows[0]!;
    return Object.freeze({
      generatedAt: now.toISOString(),
      customers: Object.freeze(row.customers),
      transfers: Object.freeze(row.transfers),
      workflow: Object.freeze(row.workflow),
      outbox: Object.freeze(row.outbox),
      providerEvents: Object.freeze(row.provider_events),
      openReconciliationExceptions: row.open_exceptions,
    });
  }

  async listOperationsCustomers(
    input: Readonly<{ search?: string; limit: number }>,
  ): Promise<readonly OperationsCustomerListItem[]> {
    const result = await this.#context.query().query<{
      customer_ref: string;
      display_name: string;
      country_code: string;
      state: string;
      account_count: number;
      beneficiary_count: number;
      transfer_count: number;
      completed_transfer_count: number;
      total_sent_minor: string;
      last_transfer_at: Date | null;
      created_at: Date;
    }>(
      `SELECT c.external_ref AS customer_ref, c.display_name, c.country_code,
              c.state::text,
              (SELECT count(*)::int FROM samra_core.product_accounts a
               WHERE a.customer_id = c.id) AS account_count,
              (SELECT count(*)::int FROM samra_core.beneficiaries b
               WHERE b.customer_id = c.id AND b.deleted_at IS NULL)
                AS beneficiary_count,
              (SELECT count(*)::int FROM samra_core.remittance_transfers t
               WHERE t.customer_id = c.id) AS transfer_count,
              (SELECT count(*)::int FROM samra_core.remittance_transfers t
               WHERE t.customer_id = c.id AND t.state = 'completed')
                AS completed_transfer_count,
              (SELECT COALESCE(sum(t.total_debit_minor), 0)::text
               FROM samra_core.remittance_transfers t
               WHERE t.customer_id = c.id AND t.source_currency = 'USD')
                AS total_sent_minor,
              (SELECT max(t.created_at) FROM samra_core.remittance_transfers t
               WHERE t.customer_id = c.id) AS last_transfer_at,
              c.created_at
       FROM samra_core.customers c
       WHERE ($1::text IS NULL OR c.external_ref ILIKE '%' || $1 || '%'
              OR c.display_name ILIKE '%' || $1 || '%')
       ORDER BY c.created_at DESC, c.external_ref DESC
       LIMIT $2`,
      [input.search ?? null, input.limit],
    );
    return Object.freeze(
      result.rows.map((row) =>
        Object.freeze({
          id: row.customer_ref,
          displayName: row.display_name,
          countryCode: row.country_code,
          status: row.state,
          accountCount: row.account_count,
          beneficiaryCount: row.beneficiary_count,
          transferCount: row.transfer_count,
          completedTransferCount: row.completed_transfer_count,
          sourceCurrency: "USD",
          totalSentMinor: row.total_sent_minor,
          lastTransferAt: row.last_transfer_at?.toISOString() ?? null,
          createdAt: row.created_at.toISOString(),
        }),
      ),
    );
  }

  async listOperationsTransfers(
    input: Readonly<{
      status?: string;
      search?: string;
      limit: number;
    }>,
  ): Promise<readonly OperationsTransferListItem[]> {
    const result = await this.#context.query().query<{
      transfer_ref: string;
      customer_ref: string;
      beneficiary_display: string;
      state: string;
      funding_state: string;
      payout_state: string;
      reconciliation_state: string;
      source_currency: string;
      source_amount_minor: string;
      fee_amount_minor: string;
      total_debit_minor: string;
      destination_currency: string;
      destination_amount_minor: string;
      workflow_state: string | null;
      attempt_count: number | null;
      last_error: string | null;
      created_at: Date;
      updated_at: Date;
    }>(
      `SELECT t.external_ref AS transfer_ref, c.external_ref AS customer_ref,
              b.display_name AS beneficiary_display, t.state, t.funding_state,
              t.payout_state, t.reconciliation_state, t.source_currency,
              t.source_amount_minor, t.fee_amount_minor, t.total_debit_minor,
              t.destination_currency, t.destination_amount_minor,
              w.state AS workflow_state, w.attempt_count, w.last_error,
              t.created_at, t.updated_at
       FROM samra_core.remittance_transfers t
       JOIN samra_core.customers c ON c.id = t.customer_id
       JOIN samra_core.beneficiaries b ON b.id = t.beneficiary_id
       LEFT JOIN samra_core.remittance_workflow_work w ON w.transfer_id = t.id
       WHERE ($1::text IS NULL OR t.state::text = $1)
         AND ($2::text IS NULL OR t.external_ref ILIKE '%' || $2 || '%'
              OR c.external_ref ILIKE '%' || $2 || '%'
              OR b.display_name ILIKE '%' || $2 || '%')
       ORDER BY t.created_at DESC, t.external_ref DESC
       LIMIT $3`,
      [input.status ?? null, input.search ?? null, input.limit],
    );
    return Object.freeze(result.rows.map(mapTransferListItem));
  }

  async getOperationsTransfer(
    transferId: string,
  ): Promise<Record<string, unknown> | undefined> {
    const normalized = transferId.trim();
    if (!normalized) return undefined;
    const internal = await this.#context
      .query()
      .query<{ id: string }>(
        `SELECT id FROM samra_core.remittance_transfers WHERE external_ref = $1`,
        [normalized],
      );
    const internalRow =
      internal.rows.length === 0
        ? await this.#context
            .query()
            .query<{ id: string }>(
              `SELECT id FROM samra_core.remittance_transfers WHERE id = $1::uuid`,
              [normalized],
            )
        : internal;
    if (internalRow.rows.length === 0) return undefined;
    const internalId = internalRow.rows[0]!.id;
    const transferResult = await this.#context.query().query<{
      transfer_ref: string;
      customer_ref: string;
      beneficiary_display: string;
      state: string;
      funding_state: string;
      payout_state: string;
      reconciliation_state: string;
      source_currency: string;
      source_amount_minor: string;
      fee_amount_minor: string;
      total_debit_minor: string;
      destination_currency: string;
      destination_amount_minor: string;
      workflow_state: string | null;
      attempt_count: number | null;
      last_error: string | null;
      created_at: Date;
      updated_at: Date;
    }>(`SELECT t.external_ref AS transfer_ref, c.external_ref AS customer_ref,
              b.display_name AS beneficiary_display, t.state, t.funding_state,
              t.payout_state, t.reconciliation_state, t.source_currency,
              t.source_amount_minor, t.fee_amount_minor, t.total_debit_minor,
              t.destination_currency, t.destination_amount_minor,
              w.state AS workflow_state, w.attempt_count, w.last_error,
              t.created_at, t.updated_at
       FROM samra_core.remittance_transfers t
       JOIN samra_core.customers c ON c.id = t.customer_id
       JOIN samra_core.beneficiaries b ON b.id = t.beneficiary_id
       LEFT JOIN samra_core.remittance_workflow_work w ON w.transfer_id = t.id
      WHERE t.id = $1`, [internalId]);
    const transferRow = transferResult.rows[0];
    const [history, providerLinks, providerEvents, outbox, audit, exceptions] =
      await Promise.all([
        this.#context.query().query(
          `SELECT sequence, from_state, to_state, reason, occurred_at
           FROM samra_core.remittance_transfer_status_history
           WHERE transfer_id = $1 ORDER BY sequence`,
          [internalId],
        ),
        this.#context.query().query(
          `SELECT provider, resource_type, provider_resource_id, created_at
           FROM samra_core.provider_resource_links
           WHERE internal_resource_id = $1 ORDER BY created_at`,
          [internalId],
        ),
        this.#context.query().query(
          `SELECT provider, provider_event_id, event_type, state, attempt_count,
                  last_error, occurred_at, received_at, processed_at
           FROM samra_core.provider_events
           WHERE related_resource_id = $1 ORDER BY received_at`,
          [internalId],
        ),
        this.#context.query().query(
          `SELECT event_key, event_type, state, attempt_count, available_at,
                  published_at, last_error, created_at
           FROM samra_core.outbox_events
           WHERE aggregate_id = $1 ORDER BY created_at`,
          [internalId],
        ),
        this.listAuditEvents({ entityId: transferId, limit: 200 }),
        this.#context.query().query(
          `SELECT e.id, r.external_ref AS run_id, e.exception_code, e.state,
                  e.summary, e.assigned_to, e.opened_at, e.updated_at
           FROM samra_core.reconciliation_exceptions e
           JOIN samra_core.reconciliation_items i ON i.id = e.item_id
           JOIN samra_core.reconciliation_runs r ON r.id = i.run_id
           WHERE i.internal_resource_id = $1 ORDER BY e.opened_at DESC`,
          [internalId],
        ),
      ]);
    if (transferRow === undefined) return undefined;
    return Object.freeze({
      transfer: Object.freeze(
        mapTransferListItem({
          transfer_ref: transferRow.transfer_ref,
          customer_ref: transferRow.customer_ref,
          beneficiary_display: transferRow.beneficiary_display,
          state: transferRow.state,
          funding_state: transferRow.funding_state,
          payout_state: transferRow.payout_state,
          reconciliation_state: transferRow.reconciliation_state,
          source_currency: transferRow.source_currency,
          source_amount_minor: transferRow.source_amount_minor,
          fee_amount_minor: transferRow.fee_amount_minor,
          total_debit_minor: transferRow.total_debit_minor,
          destination_currency: transferRow.destination_currency,
          destination_amount_minor: transferRow.destination_amount_minor,
          workflow_state: transferRow.workflow_state,
          attempt_count: transferRow.attempt_count,
          last_error: transferRow.last_error,
          created_at: transferRow.created_at,
          updated_at: transferRow.updated_at,
        }),
      ),
      timeline: Object.freeze(history.rows.map(normalizeDates)),
      providerLinks: Object.freeze(providerLinks.rows.map(normalizeDates)),
      providerEvents: Object.freeze(providerEvents.rows.map(normalizeDates)),
      outbox: Object.freeze(outbox.rows.map(normalizeDates)),
      audit,
      reconciliationExceptions: Object.freeze(
        exceptions.rows.map(normalizeDates),
      ),
    });
  }

  async listReconciliationExceptions(
    limit: number,
  ): Promise<readonly OperationsReconciliationException[]> {
    const result = await this.#context.query().query<{
      id: string;
      run_id: string;
      transfer_ref: string | null;
      exception_code: string;
      state: string;
      summary: string;
      assigned_to: string | null;
      opened_at: Date;
      updated_at: Date;
    }>(
      `SELECT e.id, r.external_ref AS run_id, t.external_ref AS transfer_ref,
              e.exception_code, e.state, e.summary, e.assigned_to,
              e.opened_at, e.updated_at
       FROM samra_core.reconciliation_exceptions e
       JOIN samra_core.reconciliation_items i ON i.id = e.item_id
       JOIN samra_core.reconciliation_runs r ON r.id = i.run_id
       LEFT JOIN samra_core.remittance_transfers t ON t.id = i.internal_resource_id
       ORDER BY CASE WHEN e.state IN ('open','in_review') THEN 0 ELSE 1 END,
                e.opened_at DESC LIMIT $1`,
      [limit],
    );
    return Object.freeze(
      result.rows.map((row) =>
        Object.freeze({
          id: row.id,
          runId: row.run_id,
          transferId: row.transfer_ref,
          code: row.exception_code,
          state: row.state,
          summary: row.summary,
          assignedTo: row.assigned_to,
          openedAt: row.opened_at.toISOString(),
          updatedAt: row.updated_at.toISOString(),
        }),
      ),
    );
  }

  async listAuditEvents(
    input: Readonly<{
      entityId?: string;
      actorId?: string;
      limit: number;
    }>,
  ): Promise<readonly OperationsAuditEvent[]> {
    const result = await this.#context.query().query<{
      id: string;
      event_key: string;
      actor_type: string;
      actor_id: string | null;
      action: string;
      entity_type: string;
      entity_id: string;
      correlation_id: string | null;
      metadata: Record<string, unknown>;
      occurred_at: Date;
    }>(
      `SELECT id, event_key, actor_type, actor_id, action, entity_type,
              entity_id, correlation_id, metadata, occurred_at
       FROM samra_core.audit_events
       WHERE ($1::text IS NULL OR entity_id = $1)
         AND ($2::text IS NULL OR actor_id = $2)
       ORDER BY occurred_at DESC, id DESC LIMIT $3`,
      [input.entityId ?? null, input.actorId ?? null, input.limit],
    );
    return Object.freeze(
      result.rows.map((row) =>
        Object.freeze({
          id: row.id,
          eventKey: row.event_key,
          actorType: row.actor_type,
          actorId: row.actor_id,
          action: row.action,
          entityType: row.entity_type,
          entityId: row.entity_id,
          correlationId: row.correlation_id,
          metadata: Object.freeze(row.metadata),
          occurredAt: row.occurred_at.toISOString(),
        }),
      ),
    );
  }
}

function mapTransferListItem(row: {
  transfer_ref: string;
  customer_ref: string;
  beneficiary_display: string;
  state: string;
  funding_state: string;
  payout_state: string;
  reconciliation_state: string;
  source_currency: string;
  source_amount_minor: string;
  fee_amount_minor: string;
  total_debit_minor: string;
  destination_currency: string;
  destination_amount_minor: string;
  workflow_state: string | null;
  attempt_count: number | null;
  last_error: string | null;
  created_at: Date;
  updated_at: Date;
}): OperationsTransferListItem {
  return Object.freeze({
    id: row.transfer_ref,
    customerId: row.customer_ref,
    beneficiaryDisplay: row.beneficiary_display,
    status: row.state,
    fundingStatus: row.funding_state,
    payoutStatus: row.payout_state,
    reconciliationStatus: row.reconciliation_state,
    sourceCurrency: row.source_currency,
    sourceAmountMinor: row.source_amount_minor,
    feeAmountMinor: row.fee_amount_minor,
    totalDebitMinor: row.total_debit_minor,
    destinationCurrency: row.destination_currency,
    destinationAmountMinor: row.destination_amount_minor,
    workflowState: row.workflow_state,
    workflowAttempts: row.attempt_count,
    workflowLastError: row.last_error,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  });
}

function normalizeDates(
  row: Record<string, unknown>,
): Readonly<Record<string, unknown>> {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        camelCase(key),
        value instanceof Date ? value.toISOString() : value,
      ]),
    ),
  );
}

function camelCase(value: string): string {
  return value.replace(/_([a-z])/g, (_match, letter: string) =>
    letter.toUpperCase(),
  );
}
