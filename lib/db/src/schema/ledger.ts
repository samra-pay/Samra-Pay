import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import {
  currencyCodeEnum,
  idempotencyStateEnum,
  ledgerAccountClassEnum,
  ledgerEntrySideEnum,
  ledgerHoldEventTypeEnum,
  ledgerHoldStateEnum,
  ledgerJournalStateEnum,
  recordStateEnum,
  samraCore,
} from "./enums";
import { productAccounts } from "./parties";

export const ledgerAccounts = samraCore.table(
  "ledger_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    accountClass: ledgerAccountClassEnum("account_class").notNull(),
    normalSide: ledgerEntrySideEnum("normal_side").notNull(),
    currency: currencyCodeEnum("currency").notNull(),
    productAccountId: uuid("product_account_id").references(
      () => productAccounts.id,
      { onDelete: "restrict" },
    ),
    allowNegativeAvailable: boolean("allow_negative_available")
      .notNull()
      .default(false),
    state: recordStateEnum("state").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("ledger_accounts_code_uidx").on(table.code),
    index("ledger_accounts_product_account_idx").on(table.productAccountId),
    index("ledger_accounts_class_currency_idx").on(
      table.accountClass,
      table.currency,
    ),
  ],
);

export const ledgerJournals = samraCore.table(
  "ledger_journals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessEventType: text("business_event_type").notNull(),
    businessEventId: text("business_event_id").notNull(),
    currency: currencyCodeEnum("currency").notNull(),
    state: ledgerJournalStateEnum("state").notNull().default("draft"),
    description: text("description").notNull(),
    reversesJournalId: uuid("reverses_journal_id").references(
      (): AnyPgColumn => ledgerJournals.id,
      { onDelete: "restrict" },
    ),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    postedAt: timestamp("posted_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("ledger_journals_business_event_uidx").on(
      table.businessEventType,
      table.businessEventId,
    ),
    uniqueIndex("ledger_journals_reverses_uidx")
      .on(table.reversesJournalId)
      .where(sql`${table.reversesJournalId} is not null`),
    index("ledger_journals_created_at_idx").on(table.createdAt),
    index("ledger_journals_state_idx").on(table.state),
    check(
      "ledger_journals_posted_at_state_chk",
      sql`(${table.state} = 'draft' and ${table.postedAt} is null) or (${table.state} in ('posted', 'reversed') and ${table.postedAt} is not null)`,
    ),
  ],
);

export const ledgerPostings = samraCore.table(
  "ledger_postings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    journalId: uuid("journal_id")
      .notNull()
      .references(() => ledgerJournals.id, { onDelete: "restrict" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => ledgerAccounts.id, { onDelete: "restrict" }),
    sequence: integer("sequence").notNull(),
    side: ledgerEntrySideEnum("side").notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    memo: text("memo"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("ledger_postings_journal_sequence_uidx").on(
      table.journalId,
      table.sequence,
    ),
    index("ledger_postings_account_created_at_idx").on(
      table.accountId,
      table.createdAt,
    ),
    index("ledger_postings_journal_idx").on(table.journalId),
    check("ledger_postings_amount_positive_chk", sql`${table.amountMinor} > 0`),
    check("ledger_postings_sequence_positive_chk", sql`${table.sequence} > 0`),
  ],
);

export const ledgerHolds = samraCore.table(
  "ledger_holds",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessEventType: text("business_event_type").notNull(),
    businessEventId: text("business_event_id").notNull(),
    productAccountId: uuid("product_account_id")
      .notNull()
      .references(() => productAccounts.id, { onDelete: "restrict" }),
    ledgerAccountId: uuid("ledger_account_id")
      .notNull()
      .references(() => ledgerAccounts.id, { onDelete: "restrict" }),
    currency: currencyCodeEnum("currency").notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    state: ledgerHoldStateEnum("state").notNull().default("active"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    terminalAt: timestamp("terminal_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
  },
  (table) => [
    uniqueIndex("ledger_holds_business_event_uidx").on(
      table.businessEventType,
      table.businessEventId,
    ),
    index("ledger_holds_account_state_idx").on(
      table.ledgerAccountId,
      table.state,
    ),
    index("ledger_holds_product_account_state_idx").on(
      table.productAccountId,
      table.state,
    ),
    check("ledger_holds_amount_positive_chk", sql`${table.amountMinor} > 0`),
    check(
      "ledger_holds_terminal_state_chk",
      sql`(${table.state} = 'active' and ${table.terminalAt} is null) or (${table.state} <> 'active' and ${table.terminalAt} is not null)`,
    ),
  ],
);

export const ledgerHoldEvents = samraCore.table(
  "ledger_hold_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    holdId: uuid("hold_id")
      .notNull()
      .references(() => ledgerHolds.id, { onDelete: "restrict" }),
    eventType: ledgerHoldEventTypeEnum("event_type").notNull(),
    journalId: uuid("journal_id").references(() => ledgerJournals.id, {
      onDelete: "restrict",
    }),
    reason: text("reason"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("ledger_hold_events_type_uidx").on(
      table.holdId,
      table.eventType,
    ),
    uniqueIndex("ledger_hold_events_terminal_uidx")
      .on(table.holdId)
      .where(sql`${table.eventType} in ('captured', 'released', 'expired')`),
    index("ledger_hold_events_hold_time_idx").on(
      table.holdId,
      table.occurredAt,
    ),
  ],
);

export const idempotencyRecords = samraCore.table(
  "idempotency_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    scope: text("scope").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),
    state: idempotencyStateEnum("state").notNull().default("in_progress"),
    resourceType: text("resource_type"),
    resourceId: uuid("resource_id"),
    responseStatus: integer("response_status"),
    responseBody: jsonb("response_body").$type<Record<string, unknown>>(),
    errorCode: text("error_code"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("idempotency_records_scope_key_uidx").on(
      table.scope,
      table.idempotencyKey,
    ),
    index("idempotency_records_expiry_idx").on(table.expiresAt),
    check(
      "idempotency_records_response_status_chk",
      sql`${table.responseStatus} is null or (${table.responseStatus} between 100 and 599)`,
    ),
  ],
);

export type LedgerAccount = typeof ledgerAccounts.$inferSelect;
export type NewLedgerAccount = typeof ledgerAccounts.$inferInsert;
export type LedgerJournal = typeof ledgerJournals.$inferSelect;
export type NewLedgerJournal = typeof ledgerJournals.$inferInsert;
export type LedgerPosting = typeof ledgerPostings.$inferSelect;
export type NewLedgerPosting = typeof ledgerPostings.$inferInsert;
export type LedgerHold = typeof ledgerHolds.$inferSelect;
export type NewLedgerHold = typeof ledgerHolds.$inferInsert;
export type LedgerHoldEvent = typeof ledgerHoldEvents.$inferSelect;
export type NewLedgerHoldEvent = typeof ledgerHoldEvents.$inferInsert;
export type IdempotencyRecord = typeof idempotencyRecords.$inferSelect;
export type NewIdempotencyRecord = typeof idempotencyRecords.$inferInsert;
