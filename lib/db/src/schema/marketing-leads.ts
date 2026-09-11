import {
  boolean,
  index,
  unique,
  integer,
  jsonb,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { samraCore } from "./enums";
import { marketingWaitlistContacts } from "./marketing";
const time = (name: string) => timestamp(name, { withTimezone: true });
export const marketingLeadProfiles = samraCore.table(
  "marketing_lead_profiles",
  {
    contactId: uuid("contact_id")
      .primaryKey()
      .references(() => marketingWaitlistContacts.id, { onDelete: "restrict" }),
    verifiedAt: time("verified_at"),
    emailActive: boolean("email_active").notNull().default(false),
    adsAllowed: boolean("ads_allowed").notNull().default(false),
    suppressedAt: time("suppressed_at"),
    firstTouch: jsonb("first_touch").notNull().default({}),
    signupTouch: jsonb("signup_touch").notNull().default({}),
    updatedAt: time("updated_at").notNull().defaultNow(),
  },
);
export const marketingLeadChallenges = samraCore.table(
  "marketing_lead_challenges",
  {
    id: uuid("id").primaryKey(),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => marketingLeadProfiles.contactId, {
        onDelete: "restrict",
      }),
    commandHash: text("command_hash").notNull().unique(),
    fingerprint: text("fingerprint").notNull(),
    tokenDigest: text("token_digest").notNull().unique(),
    keyVersion: text("key_version").notNull(),
    noticeVersion: text("notice_version").notNull(),
    adsRequested: boolean("ads_requested").notNull().default(false),
    locale: text("locale").notNull(),
    attribution: jsonb("attribution").notNull().default({}),
    createdAt: time("created_at").notNull().defaultNow(),
    expiresAt: time("expires_at").notNull(),
    consumedAt: time("consumed_at"),
    cancelledAt: time("cancelled_at"),
    sentAt: time("sent_at"),
    leaseId: uuid("lease_id"),
    leaseUntil: time("lease_until"),
    attempts: integer("attempts").notNull().default(0),
  },
  (table) => [
    index("marketing_lead_challenges_contact_created").on(
      table.contactId,
      table.createdAt,
    ),
  ],
);
export const marketingLeadPermissions = samraCore.table(
  "marketing_lead_permissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => marketingLeadProfiles.contactId, {
        onDelete: "restrict",
      }),
    purpose: text("purpose").notNull(),
    granted: boolean("granted").notNull(),
    noticeVersion: text("notice_version").notNull(),
    reason: text("reason").notNull(),
    commandHash: text("command_hash").notNull(),
    occurredAt: time("occurred_at").notNull().defaultNow(),
  },
  (table) => [
    unique("marketing_lead_permissions_contact_id_purpose_command_hash_key").on(
      table.contactId,
      table.purpose,
      table.commandHash,
    ),
  ],
);
export const marketingAudienceRemovals = samraCore.table(
  "marketing_audience_removals",
  {
    contactId: uuid("contact_id")
      .notNull()
      .references(() => marketingLeadProfiles.contactId, {
        onDelete: "restrict",
      }),
    destination: text("destination").notNull(),
    revision: integer("revision").notNull().default(1),
    requestedAt: time("requested_at").notNull().defaultNow(),
    completedRevision: integer("completed_revision").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.contactId, table.destination] })],
);

export const marketingLeadRequests = samraCore.table(
  "marketing_lead_requests",
  {
    commandHash: text("command_hash").primaryKey(),
    fingerprint: text("fingerprint").notNull(),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => marketingLeadProfiles.contactId, {
        onDelete: "restrict",
      }),
    acceptedAt: time("accepted_at").notNull().defaultNow(),
  },
);
