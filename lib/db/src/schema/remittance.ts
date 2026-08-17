import { sql } from "drizzle-orm";
import {
  bigint,
  check,
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
  outboxEventStateEnum,
  providerEventStateEnum,
  providerNameEnum,
  remittanceFundingStateEnum,
  remittancePayoutStateEnum,
  remittanceQuoteStateEnum,
  remittanceTransferStateEnum,
  samraCore,
  transferReconciliationStateEnum,
} from "./enums";
import { ledgerHolds } from "./ledger";
import { beneficiaries, customers, productAccounts } from "./parties";

export const providerResourceLinks = samraCore.table(
  "provider_resource_links",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    provider: providerNameEnum("provider").notNull(),
    resourceType: text("resource_type").notNull(),
    internalResourceId: uuid("internal_resource_id").notNull(),
    providerResourceId: text("provider_resource_id").notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("provider_resource_links_provider_ref_uidx").on(
      table.provider,
      table.resourceType,
      table.providerResourceId,
    ),
    uniqueIndex("provider_resource_links_internal_uidx").on(
      table.provider,
      table.resourceType,
      table.internalResourceId,
    ),
    index("provider_resource_links_internal_idx").on(table.internalResourceId),
  ],
);

export const providerCommandAttempts = samraCore.table(
  "provider_command_attempts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    commandKey: text("command_key").notNull(),
    provider: providerNameEnum("provider").notNull(),
    commandType: text("command_type").notNull(),
    transferId: uuid("transfer_id").notNull(),
    state: text("state").notNull().default("succeeded"),
    attemptCount: integer("attempt_count").notNull().default(1),
    request: jsonb("request").$type<Record<string, unknown>>().notNull(),
    response: jsonb("response").$type<Record<string, unknown>>(),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("provider_command_attempts_key_uidx").on(table.commandKey),
    index("provider_command_attempts_transfer_idx").on(table.transferId),
    check(
      "provider_command_attempts_count_positive_chk",
      sql`${table.attemptCount} > 0`,
    ),
    check(
      "provider_command_attempts_state_chk",
      sql`${table.state} in ('pending', 'succeeded', 'failed')`,
    ),
  ],
);

export const providerEvents = samraCore.table(
  "provider_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    provider: providerNameEnum("provider").notNull(),
    providerEventId: text("provider_event_id").notNull(),
    eventType: text("event_type").notNull(),
    state: providerEventStateEnum("state").notNull().default("received"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    relatedResourceType: text("related_resource_type"),
    relatedResourceId: uuid("related_resource_id"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    attemptCount: integer("attempt_count").notNull().default(0),
    lastError: text("last_error"),
  },
  (table) => [
    uniqueIndex("provider_events_provider_event_uidx").on(
      table.provider,
      table.providerEventId,
    ),
    index("provider_events_state_received_idx").on(
      table.state,
      table.receivedAt,
    ),
    index("provider_events_related_resource_idx").on(
      table.relatedResourceType,
      table.relatedResourceId,
    ),
    check(
      "provider_events_attempt_count_nonnegative_chk",
      sql`${table.attemptCount} >= 0`,
    ),
  ],
);

export const outboxEvents = samraCore.table(
  "outbox_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventKey: text("event_key").notNull(),
    aggregateType: text("aggregate_type").notNull(),
    aggregateId: uuid("aggregate_id").notNull(),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    state: outboxEventStateEnum("state").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    availableAt: timestamp("available_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("outbox_events_event_key_uidx").on(table.eventKey),
    index("outbox_events_dispatch_idx").on(table.state, table.availableAt),
    index("outbox_events_lease_idx").on(table.state, table.leaseExpiresAt),
    index("outbox_events_aggregate_idx").on(
      table.aggregateType,
      table.aggregateId,
    ),
    check(
      "outbox_events_attempt_count_nonnegative_chk",
      sql`${table.attemptCount} >= 0`,
    ),
    check(
      "outbox_events_lease_chk",
      sql`(${table.state} = 'processing' and ${table.leaseOwner} is not null and ${table.leaseExpiresAt} is not null) or (${table.state} <> 'processing' and ${table.leaseOwner} is null and ${table.leaseExpiresAt} is null)`,
    ),
  ],
);

export const remittanceQuotes = samraCore.table(
  "remittance_quotes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    externalRef: text("external_ref").notNull(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    productAccountId: uuid("product_account_id")
      .notNull()
      .references(() => productAccounts.id, { onDelete: "restrict" }),
    beneficiaryId: uuid("beneficiary_id")
      .notNull()
      .references(() => beneficiaries.id, { onDelete: "restrict" }),
    sourceCurrency: currencyCodeEnum("source_currency").notNull(),
    destinationCurrency: currencyCodeEnum("destination_currency").notNull(),
    sourceAmountMinor: bigint("source_amount_minor", {
      mode: "bigint",
    }).notNull(),
    feeAmountMinor: bigint("fee_amount_minor", { mode: "bigint" }).notNull(),
    totalDebitMinor: bigint("total_debit_minor", { mode: "bigint" }).notNull(),
    destinationAmountMinor: bigint("destination_amount_minor", {
      mode: "bigint",
    }).notNull(),
    fxRateNumerator: bigint("fx_rate_numerator", {
      mode: "bigint",
    }).notNull(),
    fxRateDenominator: bigint("fx_rate_denominator", {
      mode: "bigint",
    }).notNull(),
    state: remittanceQuoteStateEnum("state").notNull().default("active"),
    pricingVersion: text("pricing_version").notNull(),
    fundingMethod: text("funding_method").notNull(),
    deliveryMethod: text("delivery_method").notNull(),
    estimatedDelivery: text("estimated_delivery").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("remittance_quotes_external_ref_uidx").on(table.externalRef),
    index("remittance_quotes_customer_created_idx").on(
      table.customerId,
      table.createdAt,
    ),
    index("remittance_quotes_expiry_state_idx").on(
      table.expiresAt,
      table.state,
    ),
    check(
      "remittance_quotes_source_amount_positive_chk",
      sql`${table.sourceAmountMinor} > 0`,
    ),
    check(
      "remittance_quotes_fee_amount_nonnegative_chk",
      sql`${table.feeAmountMinor} >= 0`,
    ),
    check(
      "remittance_quotes_total_debit_chk",
      sql`${table.totalDebitMinor} = ${table.sourceAmountMinor} + ${table.feeAmountMinor}`,
    ),
    check(
      "remittance_quotes_destination_amount_positive_chk",
      sql`${table.destinationAmountMinor} > 0`,
    ),
    check(
      "remittance_quotes_rate_positive_chk",
      sql`${table.fxRateNumerator} > 0 and ${table.fxRateDenominator} > 0`,
    ),
    check(
      "remittance_quotes_currency_pair_chk",
      sql`${table.sourceCurrency} <> ${table.destinationCurrency}`,
    ),
    check(
      "remittance_quotes_funding_method_chk",
      sql`${table.fundingMethod} = 'samra_balance'`,
    ),
    check(
      "remittance_quotes_delivery_method_chk",
      sql`${table.deliveryMethod} in ('bank', 'wallet')`,
    ),
  ],
);

export const remittanceTransfers = samraCore.table(
  "remittance_transfers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    externalRef: text("external_ref").notNull(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    productAccountId: uuid("product_account_id")
      .notNull()
      .references(() => productAccounts.id, { onDelete: "restrict" }),
    beneficiaryId: uuid("beneficiary_id")
      .notNull()
      .references(() => beneficiaries.id, { onDelete: "restrict" }),
    quoteId: uuid("quote_id")
      .notNull()
      .references(() => remittanceQuotes.id, { onDelete: "restrict" }),
    holdId: uuid("hold_id").references(() => ledgerHolds.id, {
      onDelete: "restrict",
    }),
    state: remittanceTransferStateEnum("state").notNull().default("created"),
    fundingState: remittanceFundingStateEnum("funding_state")
      .notNull()
      .default("unreserved"),
    payoutState: remittancePayoutStateEnum("payout_state")
      .notNull()
      .default("not_submitted"),
    reconciliationState: transferReconciliationStateEnum("reconciliation_state")
      .notNull()
      .default("not_started"),
    version: integer("version").notNull().default(1),
    demoScenario: text("demo_scenario").notNull().default("HAPPY_PATH"),
    sourceCurrency: currencyCodeEnum("source_currency").notNull(),
    destinationCurrency: currencyCodeEnum("destination_currency").notNull(),
    sourceAmountMinor: bigint("source_amount_minor", {
      mode: "bigint",
    }).notNull(),
    feeAmountMinor: bigint("fee_amount_minor", { mode: "bigint" }).notNull(),
    totalDebitMinor: bigint("total_debit_minor", { mode: "bigint" }).notNull(),
    destinationAmountMinor: bigint("destination_amount_minor", {
      mode: "bigint",
    }).notNull(),
    failureCode: text("failure_code"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("remittance_transfers_external_ref_uidx").on(table.externalRef),
    uniqueIndex("remittance_transfers_quote_uidx").on(table.quoteId),
    uniqueIndex("remittance_transfers_hold_uidx")
      .on(table.holdId)
      .where(sql`${table.holdId} is not null`),
    index("remittance_transfers_customer_created_idx").on(
      table.customerId,
      table.createdAt,
    ),
    index("remittance_transfers_state_updated_idx").on(
      table.state,
      table.updatedAt,
    ),
    check(
      "remittance_transfers_source_amount_positive_chk",
      sql`${table.sourceAmountMinor} > 0`,
    ),
    check(
      "remittance_transfers_fee_amount_nonnegative_chk",
      sql`${table.feeAmountMinor} >= 0`,
    ),
    check(
      "remittance_transfers_total_debit_chk",
      sql`${table.totalDebitMinor} = ${table.sourceAmountMinor} + ${table.feeAmountMinor}`,
    ),
    check(
      "remittance_transfers_destination_amount_positive_chk",
      sql`${table.destinationAmountMinor} > 0`,
    ),
    check(
      "remittance_transfers_currency_pair_chk",
      sql`${table.sourceCurrency} <> ${table.destinationCurrency}`,
    ),
    check(
      "remittance_transfers_version_positive_chk",
      sql`${table.version} > 0`,
    ),
  ],
);

export const remittanceTransferStatusHistory = samraCore.table(
  "remittance_transfer_status_history",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    transferId: uuid("transfer_id")
      .notNull()
      .references(() => remittanceTransfers.id, { onDelete: "restrict" }),
    sequence: integer("sequence").notNull(),
    fromState: remittanceTransferStateEnum("from_state"),
    toState: remittanceTransferStateEnum("to_state").notNull(),
    reason: text("reason"),
    providerEventId: uuid("provider_event_id").references(
      () => providerEvents.id,
      { onDelete: "restrict" },
    ),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("remittance_transfer_status_history_sequence_uidx").on(
      table.transferId,
      table.sequence,
    ),
    index("remittance_transfer_status_history_time_idx").on(
      table.transferId,
      table.occurredAt,
    ),
    check(
      "remittance_transfer_status_history_sequence_positive_chk",
      sql`${table.sequence} > 0`,
    ),
    check(
      "remittance_transfer_status_history_change_chk",
      sql`${table.fromState} is null or ${table.fromState} <> ${table.toState}`,
    ),
  ],
);

export type ProviderResourceLink = typeof providerResourceLinks.$inferSelect;
export type NewProviderResourceLink = typeof providerResourceLinks.$inferInsert;
export type ProviderCommandAttempt =
  typeof providerCommandAttempts.$inferSelect;
export type NewProviderCommandAttempt =
  typeof providerCommandAttempts.$inferInsert;
export type ProviderEvent = typeof providerEvents.$inferSelect;
export type NewProviderEvent = typeof providerEvents.$inferInsert;
export type OutboxEvent = typeof outboxEvents.$inferSelect;
export type NewOutboxEvent = typeof outboxEvents.$inferInsert;
export type RemittanceQuote = typeof remittanceQuotes.$inferSelect;
export type NewRemittanceQuote = typeof remittanceQuotes.$inferInsert;
export type RemittanceTransfer = typeof remittanceTransfers.$inferSelect;
export type NewRemittanceTransfer = typeof remittanceTransfers.$inferInsert;
export type RemittanceTransferStatus =
  typeof remittanceTransferStatusHistory.$inferSelect;
export type NewRemittanceTransferStatus =
  typeof remittanceTransferStatusHistory.$inferInsert;
