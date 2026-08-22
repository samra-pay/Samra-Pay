import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { samraCore } from "./enums";
import { customers } from "./parties";
import { customerConsents, customerOnboardings } from "./customer-onboarding";

export const customerWallets = samraCore.table(
  "customer_wallets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    externalRef: text("external_ref").notNull(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    onboardingId: uuid("onboarding_id")
      .notNull()
      .references(() => customerOnboardings.id, { onDelete: "restrict" }),
    walletConsentId: uuid("wallet_consent_id")
      .notNull()
      .references(() => customerConsents.id, { onDelete: "restrict" }),
    provider: text("provider").notNull(),
    providerRequestKey: text("provider_request_key").notNull(),
    creationCommandKey: text("creation_command_key").notNull(),
    state: text("state").notNull(),
    reasonFamily: text("reason_family"),
    asset: text("asset").notNull(),
    environment: text("environment").notNull(),
    configurationVersion: text("configuration_version").notNull(),
    version: integer("version").notNull().default(1),
    readyAt: timestamp("ready_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("customer_wallets_external_ref_uidx").on(table.externalRef),
    uniqueIndex("customer_wallets_customer_uidx").on(table.customerId),
    uniqueIndex("customer_wallets_onboarding_uidx").on(table.onboardingId),
    uniqueIndex("customer_wallets_provider_request_uidx").on(
      table.provider,
      table.providerRequestKey,
    ),
    index("customer_wallets_state_updated_idx").on(
      table.state,
      table.updatedAt,
    ),
    foreignKey({
      columns: [table.onboardingId, table.customerId],
      foreignColumns: [customerOnboardings.id, customerOnboardings.customerId],
      name: "customer_wallets_onboarding_customer_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.walletConsentId, table.customerId, table.onboardingId],
      foreignColumns: [
        customerConsents.id,
        customerConsents.customerId,
        customerConsents.onboardingId,
      ],
      name: "customer_wallets_consent_customer_onboarding_fk",
    }).onDelete("restrict"),
    check(
      "customer_wallets_provider_chk",
      sql`${table.provider} = 'crossmint'`,
    ),
    check(
      "customer_wallets_state_chk",
      sql`${table.state} in ('created','provisioning','ready','restricted','error')`,
    ),
    check("customer_wallets_asset_chk", sql`${table.asset} = 'USDC'`),
    check(
      "customer_wallets_environment_chk",
      sql`${table.environment} = 'synthetic'`,
    ),
    check(
      "customer_wallets_provider_request_key_chk",
      sql`${table.providerRequestKey} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "customer_wallets_creation_command_key_chk",
      sql`${table.creationCommandKey} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "customer_wallets_external_ref_chk",
      sql`${table.externalRef} ~ '^wallet_[0-9a-f]{32}$'`,
    ),
    check(
      "customer_wallets_configuration_version_chk",
      sql`length(${table.configurationVersion}) between 1 and 128`,
    ),
    check(
      "customer_wallets_reason_family_chk",
      sql`${table.reasonFamily} is null or length(${table.reasonFamily}) between 1 and 64`,
    ),
    check("customer_wallets_version_chk", sql`${table.version} > 0`),
    check(
      "customer_wallets_ready_time_chk",
      sql`(${table.state} <> 'ready' or ${table.readyAt} is not null) and (${table.readyAt} is null or ${table.state} in ('ready','restricted'))`,
    ),
  ],
);

export const customerWalletProviderMappings = samraCore.table(
  "customer_wallet_provider_mappings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    walletId: uuid("wallet_id")
      .notNull()
      .references(() => customerWallets.id, { onDelete: "restrict" }),
    provider: text("provider").notNull(),
    providerWalletRef: text("provider_wallet_ref").notNull(),
    network: text("network").notNull(),
    custodyModel: text("custody_model").notNull(),
    publicAddress: text("public_address"),
    configurationVersion: text("configuration_version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("customer_wallet_provider_mappings_wallet_uidx").on(
      table.walletId,
    ),
    uniqueIndex("customer_wallet_provider_mappings_provider_ref_uidx").on(
      table.provider,
      table.providerWalletRef,
    ),
    check(
      "customer_wallet_provider_mappings_provider_chk",
      sql`${table.provider} = 'crossmint'`,
    ),
    check(
      "customer_wallet_provider_mappings_ref_chk",
      sql`length(${table.providerWalletRef}) between 1 and 255`,
    ),
    check(
      "customer_wallet_provider_mappings_network_chk",
      sql`length(${table.network}) between 1 and 64`,
    ),
    check(
      "customer_wallet_provider_mappings_custody_chk",
      sql`length(${table.custodyModel}) between 1 and 64`,
    ),
    check(
      "customer_wallet_provider_mappings_address_chk",
      sql`${table.publicAddress} is null or length(${table.publicAddress}) between 1 and 255`,
    ),
    check(
      "customer_wallet_provider_mappings_configuration_chk",
      sql`length(${table.configurationVersion}) between 1 and 128`,
    ),
  ],
);

export const customerWalletTransitions = samraCore.table(
  "customer_wallet_transitions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    walletId: uuid("wallet_id")
      .notNull()
      .references(() => customerWallets.id, { onDelete: "restrict" }),
    sequence: integer("sequence").notNull(),
    fromState: text("from_state"),
    toState: text("to_state").notNull(),
    reasonFamily: text("reason_family"),
    commandKey: text("command_key").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("customer_wallet_transitions_sequence_uidx").on(
      table.walletId,
      table.sequence,
    ),
    uniqueIndex("customer_wallet_transitions_command_uidx").on(
      table.walletId,
      table.commandKey,
    ),
    index("customer_wallet_transitions_time_idx").on(
      table.walletId,
      table.occurredAt,
    ),
    check(
      "customer_wallet_transitions_sequence_chk",
      sql`${table.sequence} > 0`,
    ),
    check(
      "customer_wallet_transitions_state_chk",
      sql`${table.toState} in ('created','provisioning','ready','restricted','error')`,
    ),
    check(
      "customer_wallet_transitions_reason_chk",
      sql`${table.reasonFamily} is null or length(${table.reasonFamily}) between 1 and 64`,
    ),
    check(
      "customer_wallet_transitions_command_chk",
      sql`length(${table.commandKey}) between 1 and 255`,
    ),
  ],
);

export type CustomerWallet = typeof customerWallets.$inferSelect;
export type NewCustomerWallet = typeof customerWallets.$inferInsert;
export type CustomerWalletProviderMapping =
  typeof customerWalletProviderMappings.$inferSelect;
export type NewCustomerWalletProviderMapping =
  typeof customerWalletProviderMappings.$inferInsert;
export type CustomerWalletTransition =
  typeof customerWalletTransitions.$inferSelect;
export type NewCustomerWalletTransition =
  typeof customerWalletTransitions.$inferInsert;
