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

export const marketingWaitlistContacts = samraCore.table(
  "marketing_waitlist_contacts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull(),
    emailHash: text("email_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("marketing_waitlist_contacts_email_hash_uidx").on(
      table.emailHash,
    ),
    check(
      "marketing_waitlist_contacts_email_chk",
      sql`length(${table.email}) between 3 and 254 and ${table.email} = lower(btrim(${table.email}))`,
    ),
    check(
      "marketing_waitlist_contacts_email_hash_chk",
      sql`${table.emailHash} ~ '^[0-9a-f]{64}$'`,
    ),
  ],
);

export const marketingWaitlistConsentEvents = samraCore.table(
  "marketing_waitlist_consent_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => marketingWaitlistContacts.id, {
        onDelete: "restrict",
      }),
    action: text("action").notNull(),
    noticeVersion: text("notice_version").notNull(),
    locale: text("locale").notNull(),
    commandKey: text("command_key").notNull(),
    requestFingerprint: text("request_fingerprint").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("marketing_waitlist_consent_events_command_uidx").on(
      table.commandKey,
    ),
    index("marketing_waitlist_consent_events_time_idx").on(table.occurredAt),
    check(
      "marketing_waitlist_consent_events_action_chk",
      sql`${table.action} in ('subscribed','unsubscribed')`,
    ),
    check(
      "marketing_waitlist_consent_events_notice_version_chk",
      sql`${table.noticeVersion} ~ '^coming-soon-[0-9]{4}-[0-9]{2}-[0-9]{2}$'`,
    ),
    check(
      "marketing_waitlist_consent_events_locale_chk",
      sql`${table.locale} in ('en','am')`,
    ),
    check(
      "marketing_waitlist_consent_events_command_key_chk",
      sql`${table.commandKey} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "marketing_waitlist_consent_events_request_fingerprint_chk",
      sql`${table.requestFingerprint} ~ '^[0-9a-f]{64}$'`,
    ),
  ],
);

export type MarketingWaitlistContact =
  typeof marketingWaitlistContacts.$inferSelect;
export type MarketingWaitlistConsentEvent =
  typeof marketingWaitlistConsentEvents.$inferSelect;
