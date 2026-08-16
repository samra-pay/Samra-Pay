import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  date,
  index,
  integer,
  jsonb,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  currencyCodeEnum,
  providerNameEnum,
  providerReportStateEnum,
  reconciliationExceptionStateEnum,
  reconciliationResultEnum,
  reconciliationRunStateEnum,
  samraCore,
} from "./enums";

export const providerReports = samraCore.table(
  "provider_reports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    provider: providerNameEnum("provider").notNull(),
    providerReportId: text("provider_report_id").notNull(),
    reportType: text("report_type").notNull(),
    reportDate: date("report_date", { mode: "string" }).notNull(),
    checksum: text("checksum").notNull(),
    storageReference: text("storage_reference"),
    state: providerReportStateEnum("state").notNull().default("received"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    parsedAt: timestamp("parsed_at", { withTimezone: true }),
    failureReason: text("failure_reason"),
  },
  (table) => [
    uniqueIndex("provider_reports_provider_ref_uidx").on(
      table.provider,
      table.providerReportId,
    ),
    uniqueIndex("provider_reports_checksum_uidx").on(
      table.provider,
      table.checksum,
    ),
    index("provider_reports_date_idx").on(table.provider, table.reportDate),
  ],
);

export const reconciliationRuns = samraCore.table(
  "reconciliation_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    externalRef: text("external_ref").notNull(),
    provider: providerNameEnum("provider").notNull(),
    providerReportId: uuid("provider_report_id").references(
      () => providerReports.id,
      { onDelete: "restrict" },
    ),
    state: reconciliationRunStateEnum("state").notNull().default("pending"),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    matchedCount: integer("matched_count").notNull().default(0),
    exceptionCount: integer("exception_count").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    failureReason: text("failure_reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("reconciliation_runs_external_ref_uidx").on(
      table.externalRef,
    ),
    index("reconciliation_runs_provider_period_idx").on(
      table.provider,
      table.periodStart,
      table.periodEnd,
    ),
    index("reconciliation_runs_state_idx").on(table.state, table.createdAt),
    check(
      "reconciliation_runs_period_chk",
      sql`${table.periodEnd} > ${table.periodStart}`,
    ),
    check(
      "reconciliation_runs_counts_nonnegative_chk",
      sql`${table.matchedCount} >= 0 and ${table.exceptionCount} >= 0`,
    ),
  ],
);

export const reconciliationItems = samraCore.table(
  "reconciliation_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => reconciliationRuns.id, { onDelete: "restrict" }),
    matchKey: text("match_key").notNull(),
    result: reconciliationResultEnum("result").notNull(),
    internalResourceType: text("internal_resource_type"),
    internalResourceId: uuid("internal_resource_id"),
    providerResourceId: text("provider_resource_id"),
    internalCurrency: currencyCodeEnum("internal_currency"),
    providerCurrency: currencyCodeEnum("provider_currency"),
    internalAmountMinor: bigint("internal_amount_minor", { mode: "bigint" }),
    providerAmountMinor: bigint("provider_amount_minor", { mode: "bigint" }),
    details: jsonb("details")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("reconciliation_items_run_match_key_uidx").on(
      table.runId,
      table.matchKey,
    ),
    index("reconciliation_items_run_result_idx").on(table.runId, table.result),
    index("reconciliation_items_internal_resource_idx").on(
      table.internalResourceType,
      table.internalResourceId,
    ),
    check(
      "reconciliation_items_internal_amount_nonnegative_chk",
      sql`${table.internalAmountMinor} is null or ${table.internalAmountMinor} >= 0`,
    ),
    check(
      "reconciliation_items_provider_amount_nonnegative_chk",
      sql`${table.providerAmountMinor} is null or ${table.providerAmountMinor} >= 0`,
    ),
  ],
);

export const reconciliationExceptions = samraCore.table(
  "reconciliation_exceptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => reconciliationItems.id, { onDelete: "restrict" }),
    exceptionCode: text("exception_code").notNull(),
    state: reconciliationExceptionStateEnum("state").notNull().default("open"),
    summary: text("summary").notNull(),
    resolutionNote: text("resolution_note"),
    assignedTo: text("assigned_to"),
    openedAt: timestamp("opened_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("reconciliation_exceptions_item_code_uidx").on(
      table.itemId,
      table.exceptionCode,
    ),
    index("reconciliation_exceptions_state_idx").on(
      table.state,
      table.openedAt,
    ),
    check(
      "reconciliation_exceptions_resolution_state_chk",
      sql`(${table.state} in ('resolved', 'ignored') and ${table.resolvedAt} is not null) or (${table.state} in ('open', 'in_review') and ${table.resolvedAt} is null)`,
    ),
  ],
);

export type ProviderReport = typeof providerReports.$inferSelect;
export type NewProviderReport = typeof providerReports.$inferInsert;
export type ReconciliationRun = typeof reconciliationRuns.$inferSelect;
export type NewReconciliationRun = typeof reconciliationRuns.$inferInsert;
export type ReconciliationItem = typeof reconciliationItems.$inferSelect;
export type NewReconciliationItem = typeof reconciliationItems.$inferInsert;
export type ReconciliationException =
  typeof reconciliationExceptions.$inferSelect;
export type NewReconciliationException =
  typeof reconciliationExceptions.$inferInsert;
