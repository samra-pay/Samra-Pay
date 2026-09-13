import {
  boolean,
  index,
  integer,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { samraCore } from "./enums";
import { marketingLeadProfiles } from "./marketing-leads";
const time = (name: string) => timestamp(name, { withTimezone: true });
export const marketingProviderEvents = samraCore.table(
  "marketing_provider_events",
  {
    eventHash: text("event_hash").primaryKey(),
    payloadHash: text("payload_hash").notNull(),
    eventType: text("event_type").notNull(),
    receivedAt: time("received_at").notNull().defaultNow(),
  },
);
export const marketingRequestLimits = samraCore.table(
  "marketing_request_limits",
  {
    bucket: text("bucket").primaryKey(),
    windowStart: time("window_start").notNull(),
    requests: integer("requests").notNull(),
  },
);
export const marketingEmailSuppressions = samraCore.table(
  "marketing_email_suppressions",
  {
    emailHash: text("email_hash").primaryKey(),
    reason: text("reason").notNull(),
    recordedAt: time("recorded_at").notNull().defaultNow(),
  },
);
export const marketingAudienceSync = samraCore.table(
  "marketing_audience_sync",
  {
    contactId: uuid("contact_id")
      .notNull()
      .references(() => marketingLeadProfiles.contactId, {
        onDelete: "restrict",
      }),
    destination: text("destination").notNull(),
    desiredMember: boolean("desired_member").notNull(),
    revision: integer("revision").notNull().default(1),
    acknowledgedRevision: integer("acknowledged_revision").notNull().default(0),
    submittedRevision: integer("submitted_revision"),
    submittedMember: boolean("submitted_member"),
    requestId: text("request_id"),
    state: text("state").notNull().default("idle"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: time("next_attempt_at").notNull().defaultNow(),
    updatedAt: time("updated_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.contactId, t.destination] }),
    index("marketing_audience_sync_ready").on(t.state, t.nextAttemptAt),
  ],
);
export const marketingAudienceReconciliations = samraCore.table(
  "marketing_audience_reconciliations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contactId: uuid("contact_id").notNull(),
    destination: text("destination").notNull(),
    submittedRevision: integer("submitted_revision").notNull(),
    disposition: text("disposition").notNull(),
    evidenceDigest: text("evidence_digest").notNull(),
    recordedAt: time("recorded_at").notNull().defaultNow(),
  },
);
