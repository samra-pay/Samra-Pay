import { sql } from "drizzle-orm";
import {
  check,
  index,
  jsonb,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import {
  beneficiaryRailEnum,
  currencyCodeEnum,
  customerStateEnum,
  productAccountKindEnum,
  recordStateEnum,
  samraCore,
} from "./enums";

export const customers = samraCore.table(
  "customers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    externalRef: text("external_ref").notNull(),
    displayName: text("display_name"),
    countryCode: varchar("country_code", { length: 2 }),
    state: customerStateEnum("state").notNull().default("active"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("customers_external_ref_uidx").on(table.externalRef),
    index("customers_state_idx").on(table.state),
  ],
);

export const productAccounts = samraCore.table(
  "product_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    externalRef: text("external_ref").notNull(),
    kind: productAccountKindEnum("kind").notNull(),
    currency: currencyCodeEnum("currency").notNull(),
    state: recordStateEnum("state").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("product_accounts_external_ref_uidx").on(table.externalRef),
    index("product_accounts_customer_idx").on(table.customerId),
    index("product_accounts_customer_state_idx").on(
      table.customerId,
      table.state,
    ),
  ],
);

export const beneficiaries = samraCore.table(
  "beneficiaries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    externalRef: text("external_ref").notNull(),
    displayName: text("display_name").notNull(),
    city: text("city").notNull(),
    countryCode: varchar("country_code", { length: 2 }).notNull(),
    rail: beneficiaryRailEnum("rail").notNull(),
    payoutReference: text("payout_reference").notNull(),
    bankId: varchar("bank_id", { length: 32 }),
    bankAccountNumber: varchar("bank_account_number", { length: 24 }),
    walletId: varchar("wallet_id", { length: 32 }),
    walletPhoneNumber: varchar("wallet_phone_number", { length: 13 }),
    providerMetadata: jsonb("provider_metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    state: recordStateEnum("state").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("beneficiaries_customer_external_ref_uidx").on(
      table.customerId,
      table.externalRef,
    ),
    index("beneficiaries_customer_state_idx").on(table.customerId, table.state),
    check(
      "beneficiaries_delivery_details_check",
      sql`(
        (${table.rail} = 'bank_account' AND ${table.bankId} IS NOT NULL AND ${table.bankAccountNumber} IS NOT NULL AND ${table.walletId} IS NULL AND ${table.walletPhoneNumber} IS NULL)
        OR
        (${table.rail} = 'mobile_wallet' AND ${table.walletId} IS NOT NULL AND ${table.walletPhoneNumber} IS NOT NULL AND ${table.bankId} IS NULL AND ${table.bankAccountNumber} IS NULL)
      )`,
    ),
  ],
);

export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
export type ProductAccount = typeof productAccounts.$inferSelect;
export type NewProductAccount = typeof productAccounts.$inferInsert;
export type Beneficiary = typeof beneficiaries.$inferSelect;
export type NewBeneficiary = typeof beneficiaries.$inferInsert;
