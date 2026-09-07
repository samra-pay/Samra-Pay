import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { samraCore } from "./enums";
import { customers } from "./parties";

export const personalFundingAuthorizations = samraCore.table(
  "personal_funding_authorizations",
  {
    pilotId: text("pilot_id").primaryKey(),
    customerId: uuid("customer_id")
      .notNull()
      .unique()
      .references(() => customers.id, { onDelete: "restrict" }),
    environment: text("environment").notNull(),
    walletAddress: text("wallet_address").notNull(),
    providerWalletRef: text("provider_wallet_ref").notNull(),
    maxAmountMinor: bigint("max_amount_minor", { mode: "bigint" }).notNull(),
    evidenceDigest: text("evidence_digest").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "personal_funding_authorizations_pilot_id_check",
      sql`${table.pilotId} = 'personal-funding-pilot'`,
    ),
    check(
      "personal_funding_authorizations_environment_check",
      sql`${table.environment} IN ('staging', 'production')`,
    ),
    check(
      "personal_funding_authorizations_wallet_address_check",
      sql`${table.walletAddress} ~ '^0x[0-9a-f]{40}$' AND ${table.walletAddress} <> '0x0000000000000000000000000000000000000000'`,
    ),
    check(
      "personal_funding_authorizations_provider_wallet_ref_check",
      sql`${table.providerWalletRef} = 'evm:' || ${table.walletAddress}`,
    ),
    check(
      "personal_funding_authorizations_max_amount_minor_check",
      sql`${table.maxAmountMinor} BETWEEN 1 AND 2000`,
    ),
    check(
      "personal_funding_authorizations_evidence_digest_check",
      sql`${table.evidenceDigest} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "personal_funding_authorizations_check",
      sql`${table.expiresAt} > ${table.createdAt}`,
    ),
  ],
);

export const personalFundingOrders = samraCore.table(
  "personal_funding_orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    pilotId: text("pilot_id")
      .notNull()
      .unique()
      .references(() => personalFundingAuthorizations.pilotId, {
        onDelete: "restrict",
      }),
    commandKey: text("command_key").notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    state: text("state").notNull(),
    providerOrderRef: uuid("provider_order_ref").unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "personal_funding_orders_command_key_check",
      sql`${table.commandKey} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "personal_funding_orders_amount_minor_check",
      sql`${table.amountMinor} BETWEEN 1 AND 2000`,
    ),
    check(
      "personal_funding_orders_state_check",
      sql`${table.state} IN ('reserved', 'provider_unknown', 'checkout_created')`,
    ),
    check(
      "personal_funding_orders_check",
      sql`(${table.state} = 'checkout_created') = (${table.providerOrderRef} IS NOT NULL)`,
    ),
  ],
);

export const personalFundingEvents = samraCore.table(
  "personal_funding_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => personalFundingOrders.id, { onDelete: "restrict" }),
    state: text("state").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("personal_funding_events_order_id_state_key").on(
      table.orderId,
      table.state,
    ),
    check(
      "personal_funding_events_state_check",
      sql`${table.state} IN ('reserved', 'provider_unknown', 'checkout_created')`,
    ),
  ],
);
