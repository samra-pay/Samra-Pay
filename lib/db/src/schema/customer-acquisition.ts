import { sql } from "drizzle-orm";
import {
  check,
  index,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { samraCore } from "./enums";
import { customers } from "./parties";

export const customerAcquisitionSessions = samraCore.table(
  "customer_acquisition_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    externalRef: text("external_ref").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("customer_acquisition_sessions_external_ref_uidx").on(
      table.externalRef,
    ),
    index("customer_acquisition_sessions_expiry_idx").on(table.expiresAt),
    check(
      "customer_acquisition_sessions_external_ref_chk",
      sql`${table.externalRef} ~ '^acq_[0-9a-f]{32}$'`,
    ),
    check(
      "customer_acquisition_sessions_expiry_chk",
      sql`${table.expiresAt} > ${table.createdAt}`,
    ),
  ],
);

export const customerAcquisitionEvents = samraCore.table(
  "customer_acquisition_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => customerAcquisitionSessions.id, {
        onDelete: "restrict",
      }),
    commandKey: text("command_key").notNull(),
    requestFingerprint: text("request_fingerprint").notNull(),
    eventType: text("event_type").notNull(),
    platform: text("platform").notNull(),
    channel: text("channel").notNull(),
    source: text("source"),
    medium: text("medium"),
    campaign: text("campaign"),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("customer_acquisition_events_session_command_uidx").on(
      table.sessionId,
      table.commandKey,
    ),
    index("customer_acquisition_events_session_time_idx").on(
      table.sessionId,
      table.occurredAt,
    ),
    index("customer_acquisition_events_channel_time_idx").on(
      table.channel,
      table.occurredAt,
    ),
    check(
      "customer_acquisition_events_type_chk",
      sql`${table.eventType} in ('landing_view','app_open','quote_started','quote_completed','signup_started')`,
    ),
    check(
      "customer_acquisition_events_platform_chk",
      sql`${table.platform} in ('web','mobile')`,
    ),
    check(
      "customer_acquisition_events_channel_chk",
      sql`${table.channel} in ('direct','organic_search','organic_social','paid_search','paid_social','referral','email','partner','offline','unknown')`,
    ),
    check(
      "customer_acquisition_events_command_key_chk",
      sql`${table.commandKey} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "customer_acquisition_events_request_fingerprint_chk",
      sql`${table.requestFingerprint} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "customer_acquisition_events_dimensions_chk",
      sql`(${table.source} is null or ${table.source} ~ '^[a-z0-9][a-z0-9._-]{0,63}$') and (${table.medium} is null or ${table.medium} ~ '^[a-z0-9][a-z0-9._-]{0,63}$') and (${table.campaign} is null or ${table.campaign} ~ '^[a-z0-9][a-z0-9._-]{0,63}$')`,
    ),
  ],
);

export const customerAcquisitionLinks = samraCore.table(
  "customer_acquisition_links",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => customerAcquisitionSessions.id, {
        onDelete: "restrict",
      }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    commandKey: text("command_key").notNull(),
    linkedAt: timestamp("linked_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("customer_acquisition_links_session_uidx").on(
      table.sessionId,
    ),
    index("customer_acquisition_links_customer_time_idx").on(
      table.customerId,
      table.linkedAt,
    ),
    check(
      "customer_acquisition_links_command_key_chk",
      sql`${table.commandKey} ~ '^[0-9a-f]{64}$'`,
    ),
  ],
);

export type CustomerAcquisitionSession =
  typeof customerAcquisitionSessions.$inferSelect;
export type NewCustomerAcquisitionSession =
  typeof customerAcquisitionSessions.$inferInsert;
export type CustomerAcquisitionEvent =
  typeof customerAcquisitionEvents.$inferSelect;
export type NewCustomerAcquisitionEvent =
  typeof customerAcquisitionEvents.$inferInsert;
export type CustomerAcquisitionLink =
  typeof customerAcquisitionLinks.$inferSelect;
export type NewCustomerAcquisitionLink =
  typeof customerAcquisitionLinks.$inferInsert;
