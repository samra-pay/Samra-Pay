import { createHash, randomUUID } from "node:crypto";
import { DomainError } from "@workspace/remittance";
import type { PostgresPersistenceContext } from "./postgres-persistence";

export const OPERATIONS_CASE_CATEGORIES = Object.freeze([
  "transfer_status",
  "funding",
  "payout",
  "refund",
  "identity",
  "reconciliation",
  "technical",
  "other",
] as const);
export const OPERATIONS_CASE_PRIORITIES = Object.freeze([
  "low",
  "normal",
  "high",
  "urgent",
] as const);
export const OPERATIONS_CASE_STATUSES = Object.freeze([
  "open",
  "in_progress",
  "pending_customer",
  "resolved",
  "closed",
] as const);

export type OperationsCaseCategory =
  (typeof OPERATIONS_CASE_CATEGORIES)[number];
export type OperationsCasePriority =
  (typeof OPERATIONS_CASE_PRIORITIES)[number];
export type OperationsCaseStatus = (typeof OPERATIONS_CASE_STATUSES)[number];

export type OperationsCaseRecord = Readonly<{
  id: string;
  customerId: string | null;
  transferId: string | null;
  title: string;
  category: OperationsCaseCategory;
  priority: OperationsCasePriority;
  status: OperationsCaseStatus;
  assignedTo: string | null;
  assignedToDisplayName: string | null;
  openedBy: string;
  openedByDisplayName: string;
  resolution: string | null;
  dueAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  closedAt: string | null;
}>;

export type OperationsCaseNoteRecord = Readonly<{
  id: string;
  author: string;
  authorDisplayName: string;
  body: string;
  createdAt: string;
}>;

export type OperationsCaseEventRecord = Readonly<{
  id: string;
  eventType: "created" | "updated" | "note_added";
  actor: string;
  actorDisplayName: string;
  detail: Readonly<Record<string, unknown>>;
  createdAt: string;
}>;

export type OperationsCaseDetail = Readonly<{
  case: OperationsCaseRecord;
  notes: readonly OperationsCaseNoteRecord[];
  events: readonly OperationsCaseEventRecord[];
}>;

type CaseRow = {
  id: string;
  external_ref: string;
  customer_ref: string | null;
  transfer_ref: string | null;
  title: string;
  category: OperationsCaseCategory;
  priority: OperationsCasePriority;
  status: OperationsCaseStatus;
  assigned_ref: string | null;
  assigned_display_name: string | null;
  opened_by_ref: string;
  opened_by_display_name: string;
  resolution: string | null;
  due_at: Date | null;
  version: number;
  created_at: Date;
  updated_at: Date;
  resolved_at: Date | null;
  closed_at: Date | null;
};

const CASE_SELECT = `
  SELECT c.id, c.external_ref, customer.external_ref AS customer_ref,
         transfer.external_ref AS transfer_ref, c.title, c.category,
         c.priority, c.status, assigned.external_ref AS assigned_ref,
         assigned.display_name AS assigned_display_name,
         opened.external_ref AS opened_by_ref,
         opened.display_name AS opened_by_display_name,
         c.resolution, c.due_at, c.version, c.created_at, c.updated_at,
         c.resolved_at, c.closed_at
  FROM samra_core.operations_cases c
  LEFT JOIN samra_core.customers customer ON customer.id = c.customer_id
  LEFT JOIN samra_core.remittance_transfers transfer ON transfer.id = c.transfer_id
  LEFT JOIN samra_core.workforce_users assigned ON assigned.id = c.assigned_user_id
  JOIN samra_core.workforce_users opened ON opened.id = c.opened_by_user_id`;

export class PostgresOperationsCaseStore {
  readonly #context: PostgresPersistenceContext;

  constructor(context: PostgresPersistenceContext) {
    this.#context = context;
  }

  async listCases(
    input: Readonly<{
      status?: OperationsCaseStatus;
      priority?: OperationsCasePriority;
      assignedTo?: string;
      search?: string;
      limit: number;
    }>,
  ): Promise<readonly OperationsCaseRecord[]> {
    const result = await this.#context.query().query<CaseRow>(
      `${CASE_SELECT}
       WHERE ($1::text IS NULL OR c.status = $1)
         AND ($2::text IS NULL OR c.priority = $2)
         AND ($3::text IS NULL OR assigned.external_ref = $3)
         AND ($4::text IS NULL OR c.external_ref ILIKE '%' || $4 || '%'
              OR c.title ILIKE '%' || $4 || '%'
              OR customer.external_ref ILIKE '%' || $4 || '%'
              OR transfer.external_ref ILIKE '%' || $4 || '%')
       ORDER BY CASE c.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1
                    WHEN 'normal' THEN 2 ELSE 3 END,
                c.due_at ASC NULLS LAST, c.updated_at DESC
       LIMIT $5`,
      [
        input.status ?? null,
        input.priority ?? null,
        input.assignedTo ?? null,
        input.search ?? null,
        input.limit,
      ],
    );
    return Object.freeze(result.rows.map(mapCase));
  }

  async getCase(caseRef: string): Promise<OperationsCaseDetail> {
    const result = await this.#context
      .query()
      .query<CaseRow>(`${CASE_SELECT} WHERE c.external_ref = $1`, [caseRef]);
    const row = result.rows[0];
    if (!row) throw notFound(caseRef);
    const [notes, events] = await Promise.all([
      this.#context.query().query<{
        id: string;
        author_ref: string;
        author_display_name: string;
        body: string;
        created_at: Date;
      }>(
        `SELECT n.id, author.external_ref AS author_ref,
                author.display_name AS author_display_name,
                n.body, n.created_at
         FROM samra_core.operations_case_notes n
         JOIN samra_core.workforce_users author ON author.id = n.author_user_id
         WHERE n.case_id = $1 ORDER BY n.created_at, n.id`,
        [row.id],
      ),
      this.#context.query().query<{
        id: string;
        event_type: "created" | "updated" | "note_added";
        actor_ref: string;
        actor_display_name: string;
        detail: Record<string, unknown>;
        created_at: Date;
      }>(
        `SELECT e.id, e.event_type, actor.external_ref AS actor_ref,
                actor.display_name AS actor_display_name,
                e.detail, e.created_at
         FROM samra_core.operations_case_events e
         JOIN samra_core.workforce_users actor ON actor.id = e.actor_user_id
         WHERE e.case_id = $1 ORDER BY e.created_at, e.id`,
        [row.id],
      ),
    ]);
    return Object.freeze({
      case: mapCase(row),
      notes: Object.freeze(
        notes.rows.map((note) =>
          Object.freeze({
            id: note.id,
            author: note.author_ref,
            authorDisplayName: note.author_display_name,
            body: note.body,
            createdAt: note.created_at.toISOString(),
          }),
        ),
      ),
      events: Object.freeze(
        events.rows.map((event) =>
          Object.freeze({
            id: event.id,
            eventType: event.event_type,
            actor: event.actor_ref,
            actorDisplayName: event.actor_display_name,
            detail: Object.freeze(event.detail),
            createdAt: event.created_at.toISOString(),
          }),
        ),
      ),
    });
  }

  async createCase(
    input: Readonly<{
      operatorUserId: string;
      operatorRef: string;
      idempotencyKey: string;
      customerId?: string;
      transferId?: string;
      title: string;
      category: OperationsCaseCategory;
      priority: OperationsCasePriority;
      assignedTo?: string;
      dueAt?: Date;
    }>,
  ): Promise<OperationsCaseDetail> {
    if (!input.title.trim()) {
      throw new DomainError("INVALID_ARGUMENT", "The case title is required.");
    }
    const requestHash = fingerprint({
      customerId: input.customerId ?? null,
      transferId: input.transferId ?? null,
      title: input.title.trim(),
      category: input.category,
      priority: input.priority,
      assignedTo: input.assignedTo ?? null,
      dueAt: input.dueAt?.toISOString() ?? null,
    });
    return this.#context.run(async () => {
      const replay = await this.#beginCommand(
        input.operatorUserId,
        input.idempotencyKey,
        requestHash,
        "create",
      );
      if (replay) return this.getCase(replay);
      const refs = await this.#resolveSubject(
        input.customerId,
        input.transferId,
      );
      const assignedId = input.assignedTo
        ? await this.#resolveWorkforceUser(input.assignedTo)
        : null;
      const caseRef = `case_${randomUUID().replaceAll("-", "")}`;
      const inserted = await this.#context.query().query<{ id: string }>(
        `INSERT INTO samra_core.operations_cases
         (external_ref, customer_id, transfer_id, title, category, priority,
          assigned_user_id, opened_by_user_id, due_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [
          caseRef,
          refs.customerId,
          refs.transferId,
          input.title.trim(),
          input.category,
          input.priority,
          assignedId,
          input.operatorUserId,
          input.dueAt ?? null,
        ],
      );
      const caseId = inserted.rows[0]!.id;
      await this.#recordMutation({
        caseId,
        caseRef,
        operatorUserId: input.operatorUserId,
        operatorRef: input.operatorRef,
        eventType: "created",
        detail: { status: "open", priority: input.priority },
        auditAction: "operations_case_created",
      });
      await this.#finishCommand(
        input.operatorUserId,
        input.idempotencyKey,
        requestHash,
        "create",
        caseId,
        1,
      );
      return this.getCase(caseRef);
    });
  }

  async updateCase(
    input: Readonly<{
      operatorUserId: string;
      operatorRef: string;
      idempotencyKey: string;
      caseRef: string;
      expectedVersion: number;
      status?: OperationsCaseStatus;
      priority?: OperationsCasePriority;
      assignedTo?: string | null;
      dueAt?: Date | null;
      resolution?: string | null;
    }>,
  ): Promise<OperationsCaseDetail> {
    if (
      input.status === undefined &&
      input.priority === undefined &&
      input.assignedTo === undefined &&
      input.dueAt === undefined &&
      input.resolution === undefined
    ) {
      throw new DomainError(
        "INVALID_ARGUMENT",
        "At least one case field must be changed.",
      );
    }
    const requestHash = fingerprint({
      caseRef: input.caseRef,
      expectedVersion: input.expectedVersion,
      status: input.status ?? null,
      priority: input.priority ?? null,
      assignedTo:
        input.assignedTo === undefined ? "__unchanged__" : input.assignedTo,
      dueAt:
        input.dueAt === undefined
          ? "__unchanged__"
          : (input.dueAt?.toISOString() ?? null),
      resolution:
        input.resolution === undefined ? "__unchanged__" : input.resolution,
    });
    return this.#context.run(async () => {
      const replay = await this.#beginCommand(
        input.operatorUserId,
        input.idempotencyKey,
        requestHash,
        "update",
      );
      if (replay) return this.getCase(replay);
      const current = await this.#context.query().query<{
        id: string;
        status: OperationsCaseStatus;
        priority: OperationsCasePriority;
        assigned_user_id: string | null;
        due_at: Date | null;
        resolution: string | null;
        version: number;
      }>(
        `SELECT id, status, priority, assigned_user_id, due_at, resolution, version
         FROM samra_core.operations_cases WHERE external_ref = $1 FOR UPDATE`,
        [input.caseRef],
      );
      const row = current.rows[0];
      if (!row) throw notFound(input.caseRef);
      if (row.version !== input.expectedVersion) {
        throw new DomainError(
          "CONFLICT",
          "The case changed after it was loaded. Refresh before retrying.",
          {
            expectedVersion: String(input.expectedVersion),
            actualVersion: String(row.version),
          },
        );
      }
      if (row.status === "closed") {
        throw new DomainError(
          "INVALID_TRANSITION",
          "Closed cases cannot be changed.",
        );
      }
      const status = input.status ?? row.status;
      assertTransition(row.status, status);
      const resolution =
        status === "resolved" || status === "closed"
          ? (input.resolution ?? row.resolution)?.trim() || null
          : null;
      if ((status === "resolved" || status === "closed") && !resolution) {
        throw new DomainError(
          "INVALID_ARGUMENT",
          "A resolution is required before resolving or closing a case.",
        );
      }
      const assignedId =
        input.assignedTo === undefined
          ? row.assigned_user_id
          : input.assignedTo === null
            ? null
            : await this.#resolveWorkforceUser(input.assignedTo);
      const version = row.version + 1;
      await this.#context.query().query(
        `UPDATE samra_core.operations_cases
         SET status = $2, priority = $3, assigned_user_id = $4, due_at = $5,
             resolution = $6, version = $7, updated_at = now(),
             resolved_at = CASE WHEN $2 = 'resolved' THEN COALESCE(resolved_at, now())
                                WHEN $2 NOT IN ('resolved','closed') THEN NULL
                                ELSE resolved_at END,
             closed_at = CASE WHEN $2 = 'closed' THEN COALESCE(closed_at, now())
                              ELSE NULL END
         WHERE id = $1`,
        [
          row.id,
          status,
          input.priority ?? row.priority,
          assignedId,
          input.dueAt === undefined ? row.due_at : input.dueAt,
          resolution,
          version,
        ],
      );
      const changes = compactChanges({
        status: input.status,
        priority: input.priority,
        assignedTo: input.assignedTo,
        dueAt:
          input.dueAt === undefined
            ? undefined
            : (input.dueAt?.toISOString() ?? null),
        resolution: input.resolution,
      });
      await this.#recordMutation({
        caseId: row.id,
        caseRef: input.caseRef,
        operatorUserId: input.operatorUserId,
        operatorRef: input.operatorRef,
        eventType: "updated",
        detail: { ...changes, fromVersion: row.version, toVersion: version },
        auditAction: "operations_case_updated",
      });
      await this.#finishCommand(
        input.operatorUserId,
        input.idempotencyKey,
        requestHash,
        "update",
        row.id,
        version,
      );
      return this.getCase(input.caseRef);
    });
  }

  async addNote(
    input: Readonly<{
      operatorUserId: string;
      operatorRef: string;
      idempotencyKey: string;
      caseRef: string;
      body: string;
    }>,
  ): Promise<OperationsCaseDetail> {
    const body = input.body.trim();
    if (!body) {
      throw new DomainError("INVALID_ARGUMENT", "The case note is required.");
    }
    const requestHash = fingerprint({ caseRef: input.caseRef, body });
    return this.#context.run(async () => {
      const replay = await this.#beginCommand(
        input.operatorUserId,
        input.idempotencyKey,
        requestHash,
        "add_note",
      );
      if (replay) return this.getCase(replay);
      const current = await this.#context.query().query<{
        id: string;
        status: OperationsCaseStatus;
        version: number;
      }>(
        `SELECT id, status, version FROM samra_core.operations_cases
         WHERE external_ref = $1 FOR UPDATE`,
        [input.caseRef],
      );
      const row = current.rows[0];
      if (!row) throw notFound(input.caseRef);
      if (row.status === "closed") {
        throw new DomainError(
          "INVALID_TRANSITION",
          "Closed cases cannot receive new notes.",
        );
      }
      await this.#context.query().query(
        `INSERT INTO samra_core.operations_case_notes
         (case_id, author_user_id, body) VALUES ($1,$2,$3)`,
        [row.id, input.operatorUserId, body],
      );
      const version = row.version + 1;
      await this.#context.query().query(
        `UPDATE samra_core.operations_cases
         SET version = $2, updated_at = now() WHERE id = $1`,
        [row.id, version],
      );
      await this.#recordMutation({
        caseId: row.id,
        caseRef: input.caseRef,
        operatorUserId: input.operatorUserId,
        operatorRef: input.operatorRef,
        eventType: "note_added",
        detail: { noteLength: body.length, toVersion: version },
        auditAction: "operations_case_note_added",
      });
      await this.#finishCommand(
        input.operatorUserId,
        input.idempotencyKey,
        requestHash,
        "add_note",
        row.id,
        version,
      );
      return this.getCase(input.caseRef);
    });
  }

  async #beginCommand(
    operatorUserId: string,
    key: string,
    requestHash: string,
    commandType: "create" | "update" | "add_note",
  ): Promise<string | undefined> {
    await this.#context
      .query()
      .query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [
        `${operatorUserId}:${key}`,
      ]);
    const existing = await this.#context.query().query<{
      request_hash: string;
      command_type: string;
      case_ref: string;
    }>(
      `SELECT command.request_hash, command.command_type,
              case_record.external_ref AS case_ref
       FROM samra_core.operations_case_commands command
       JOIN samra_core.operations_cases case_record ON case_record.id = command.case_id
       WHERE command.operator_user_id = $1 AND command.idempotency_key = $2`,
      [operatorUserId, key],
    );
    const replay = existing.rows[0];
    if (!replay) return undefined;
    if (
      replay.request_hash !== requestHash ||
      replay.command_type !== commandType
    ) {
      throw new DomainError(
        "CONFLICT",
        "The idempotency key was already used for a different case command.",
      );
    }
    return replay.case_ref;
  }

  async #finishCommand(
    operatorUserId: string,
    key: string,
    requestHash: string,
    commandType: "create" | "update" | "add_note",
    caseId: string,
    resultVersion: number,
  ): Promise<void> {
    await this.#context.query().query(
      `INSERT INTO samra_core.operations_case_commands
       (operator_user_id, idempotency_key, request_hash, command_type,
        case_id, result_version)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [operatorUserId, key, requestHash, commandType, caseId, resultVersion],
    );
  }

  async #resolveSubject(
    customerRef?: string,
    transferRef?: string,
  ): Promise<Readonly<{ customerId: string; transferId: string | null }>> {
    if (transferRef) {
      const result = await this.#context.query().query<{
        transfer_id: string;
        customer_id: string;
        customer_ref: string;
      }>(
        `SELECT transfer.id AS transfer_id, customer.id AS customer_id,
                customer.external_ref AS customer_ref
         FROM samra_core.remittance_transfers transfer
         JOIN samra_core.customers customer ON customer.id = transfer.customer_id
         WHERE transfer.external_ref = $1`,
        [transferRef],
      );
      const row = result.rows[0];
      if (!row) {
        throw new DomainError(
          "NOT_FOUND",
          "The referenced transfer was not found.",
        );
      }
      if (customerRef && customerRef !== row.customer_ref) {
        throw new DomainError(
          "INVALID_ARGUMENT",
          "The transfer does not belong to the referenced customer.",
        );
      }
      return Object.freeze({
        customerId: row.customer_id,
        transferId: row.transfer_id,
      });
    }
    if (!customerRef) {
      throw new DomainError(
        "INVALID_ARGUMENT",
        "A customer or transfer reference is required.",
      );
    }
    const customer = await this.#context
      .query()
      .query<{ id: string }>(
        `SELECT id FROM samra_core.customers WHERE external_ref = $1`,
        [customerRef],
      );
    if (!customer.rows[0]) {
      throw new DomainError(
        "NOT_FOUND",
        "The referenced customer was not found.",
      );
    }
    return Object.freeze({ customerId: customer.rows[0].id, transferId: null });
  }

  async #resolveWorkforceUser(externalRef: string): Promise<string> {
    const result = await this.#context.query().query<{ id: string }>(
      `SELECT id FROM samra_core.workforce_users
       WHERE external_ref = $1 AND state = 'active'`,
      [externalRef],
    );
    if (!result.rows[0]) {
      throw new DomainError(
        "NOT_FOUND",
        "The assigned workforce identity was not found or is disabled.",
      );
    }
    return result.rows[0].id;
  }

  async #recordMutation(
    input: Readonly<{
      caseId: string;
      caseRef: string;
      operatorUserId: string;
      operatorRef: string;
      eventType: "created" | "updated" | "note_added";
      detail: Readonly<Record<string, unknown>>;
      auditAction: string;
    }>,
  ): Promise<void> {
    const eventId = randomUUID();
    await this.#context.query().query(
      `INSERT INTO samra_core.operations_case_events
       (id, case_id, event_type, actor_user_id, detail)
       VALUES ($1,$2,$3,$4,$5::jsonb)`,
      [
        eventId,
        input.caseId,
        input.eventType,
        input.operatorUserId,
        JSON.stringify(input.detail),
      ],
    );
    await this.#context.query().query(
      `INSERT INTO samra_core.audit_events
       (event_key, actor_type, actor_id, action, entity_type, entity_id, metadata)
       VALUES ($1,'operator',$2,$3,'operations_case',$4,$5::jsonb)`,
      [
        `operations_case:${input.caseRef}:${eventId}`,
        input.operatorRef,
        input.auditAction,
        input.caseRef,
        JSON.stringify(input.detail),
      ],
    );
  }
}

function mapCase(row: CaseRow): OperationsCaseRecord {
  return Object.freeze({
    id: row.external_ref,
    customerId: row.customer_ref,
    transferId: row.transfer_ref,
    title: row.title,
    category: row.category,
    priority: row.priority,
    status: row.status,
    assignedTo: row.assigned_ref,
    assignedToDisplayName: row.assigned_display_name,
    openedBy: row.opened_by_ref,
    openedByDisplayName: row.opened_by_display_name,
    resolution: row.resolution,
    dueAt: row.due_at?.toISOString() ?? null,
    version: row.version,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    resolvedAt: row.resolved_at?.toISOString() ?? null,
    closedAt: row.closed_at?.toISOString() ?? null,
  });
}

function assertTransition(
  from: OperationsCaseStatus,
  to: OperationsCaseStatus,
): void {
  if (from === to) return;
  const allowed: Readonly<
    Record<OperationsCaseStatus, readonly OperationsCaseStatus[]>
  > = {
    open: ["in_progress"],
    in_progress: ["pending_customer", "resolved"],
    pending_customer: ["in_progress", "resolved"],
    resolved: ["in_progress", "closed"],
    closed: [],
  };
  if (!allowed[from].includes(to)) {
    throw new DomainError(
      "INVALID_TRANSITION",
      `A case cannot transition from ${from} to ${to}.`,
    );
  }
}

function fingerprint(value: Readonly<Record<string, unknown>>): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function compactChanges(
  value: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(value).filter(([, item]) => item !== undefined),
    ),
  );
}

function notFound(caseRef: string): DomainError {
  return new DomainError("NOT_FOUND", "The operations case was not found.", {
    caseRef,
  });
}
