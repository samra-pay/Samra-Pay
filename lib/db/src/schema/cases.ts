import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { samraCore } from "./enums";
import { customers } from "./parties";
import { remittanceTransfers } from "./remittance";
import { workforceUsers } from "./workforce";

export const operationsCases = samraCore.table(
  "operations_cases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    externalRef: text("external_ref").notNull(),
    customerId: uuid("customer_id").references(() => customers.id, {
      onDelete: "restrict",
    }),
    transferId: uuid("transfer_id").references(() => remittanceTransfers.id, {
      onDelete: "restrict",
    }),
    title: text("title").notNull(),
    category: text("category").notNull(),
    priority: text("priority").notNull().default("normal"),
    status: text("status").notNull().default("open"),
    assignedUserId: uuid("assigned_user_id").references(
      () => workforceUsers.id,
      { onDelete: "restrict" },
    ),
    openedByUserId: uuid("opened_by_user_id")
      .notNull()
      .references(() => workforceUsers.id, { onDelete: "restrict" }),
    resolution: text("resolution"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("operations_cases_external_ref_uidx").on(table.externalRef),
    index("operations_cases_queue_idx").on(
      table.status,
      table.priority,
      table.dueAt,
    ),
    index("operations_cases_assignee_idx").on(
      table.assignedUserId,
      table.status,
    ),
    index("operations_cases_customer_idx").on(table.customerId),
    index("operations_cases_transfer_idx").on(table.transferId),
    check(
      "operations_cases_reference_chk",
      sql`${table.customerId} is not null or ${table.transferId} is not null`,
    ),
    check(
      "operations_cases_category_chk",
      sql`${table.category} in ('transfer_status','funding','payout','refund','identity','reconciliation','technical','other')`,
    ),
    check(
      "operations_cases_priority_chk",
      sql`${table.priority} in ('low','normal','high','urgent')`,
    ),
    check(
      "operations_cases_status_chk",
      sql`${table.status} in ('open','in_progress','pending_customer','resolved','closed')`,
    ),
    check("operations_cases_version_chk", sql`${table.version} > 0`),
    check(
      "operations_cases_resolution_chk",
      sql`(${table.status} in ('resolved','closed') and ${table.resolution} is not null and length(btrim(${table.resolution})) > 0) or (${table.status} not in ('resolved','closed') and ${table.resolution} is null)`,
    ),
  ],
);

export const operationsCaseNotes = samraCore.table(
  "operations_case_notes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => operationsCases.id, { onDelete: "restrict" }),
    authorUserId: uuid("author_user_id")
      .notNull()
      .references(() => workforceUsers.id, { onDelete: "restrict" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("operations_case_notes_case_idx").on(table.caseId, table.createdAt),
    check(
      "operations_case_notes_body_chk",
      sql`length(btrim(${table.body})) between 1 and 4000`,
    ),
  ],
);

export const operationsCaseEvents = samraCore.table(
  "operations_case_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => operationsCases.id, { onDelete: "restrict" }),
    eventType: text("event_type").notNull(),
    actorUserId: uuid("actor_user_id")
      .notNull()
      .references(() => workforceUsers.id, { onDelete: "restrict" }),
    detail: jsonb("detail")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("operations_case_events_case_idx").on(table.caseId, table.createdAt),
    check(
      "operations_case_events_type_chk",
      sql`${table.eventType} in ('created','updated','note_added')`,
    ),
  ],
);

export const operationsCaseCommands = samraCore.table(
  "operations_case_commands",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    operatorUserId: uuid("operator_user_id")
      .notNull()
      .references(() => workforceUsers.id, { onDelete: "restrict" }),
    idempotencyKey: text("idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),
    commandType: text("command_type").notNull(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => operationsCases.id, { onDelete: "restrict" }),
    resultVersion: integer("result_version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("operations_case_commands_operator_key_uidx").on(
      table.operatorUserId,
      table.idempotencyKey,
    ),
    index("operations_case_commands_case_idx").on(table.caseId),
    check(
      "operations_case_commands_type_chk",
      sql`${table.commandType} in ('create','update','add_note')`,
    ),
    check(
      "operations_case_commands_version_chk",
      sql`${table.resultVersion} > 0`,
    ),
  ],
);

export type OperationsCase = typeof operationsCases.$inferSelect;
export type OperationsCaseNote = typeof operationsCaseNotes.$inferSelect;
export type OperationsCaseEvent = typeof operationsCaseEvents.$inferSelect;
