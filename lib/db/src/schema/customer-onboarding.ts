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

export const customerOnboardings = samraCore.table(
  "customer_onboardings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    state: text("state").notNull(),
    latestCompletedStep: text("latest_completed_step").notNull(),
    reasonFamily: text("reason_family"),
    version: integer("version").notNull().default(1),
    enteredAt: timestamp("entered_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("customer_onboardings_customer_uidx").on(table.customerId),
    uniqueIndex("customer_onboardings_id_customer_uidx").on(
      table.id,
      table.customerId,
    ),
    index("customer_onboardings_state_updated_idx").on(
      table.state,
      table.updatedAt,
    ),
    check(
      "customer_onboardings_state_chk",
      sql`${table.state} in ('not_started','authenticated','consent_pending','identity_in_progress','identity_review','identity_approved','bank_link_pending','bank_matched','wallet_consent_pending','wallet_provisioning','wallet_ready','funding_ready','activated','restricted')`,
    ),
    check("customer_onboardings_version_chk", sql`${table.version} > 0`),
    check(
      "customer_onboardings_latest_step_chk",
      sql`length(${table.latestCompletedStep}) between 1 and 64`,
    ),
  ],
);

export const customerOnboardingTransitions = samraCore.table(
  "customer_onboarding_transitions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    onboardingId: uuid("onboarding_id")
      .notNull()
      .references(() => customerOnboardings.id, { onDelete: "restrict" }),
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
    uniqueIndex("customer_onboarding_transitions_sequence_uidx").on(
      table.onboardingId,
      table.sequence,
    ),
    uniqueIndex("customer_onboarding_transitions_command_uidx").on(
      table.onboardingId,
      table.commandKey,
    ),
    index("customer_onboarding_transitions_time_idx").on(
      table.onboardingId,
      table.occurredAt,
    ),
    check(
      "customer_onboarding_transitions_sequence_chk",
      sql`${table.sequence} > 0`,
    ),
  ],
);

export const customerConsents = samraCore.table(
  "customer_consents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    onboardingId: uuid("onboarding_id")
      .notNull()
      .references(() => customerOnboardings.id, { onDelete: "restrict" }),
    consentType: text("consent_type").notNull(),
    documentVersion: text("document_version").notNull(),
    bundleVersion: text("bundle_version").notNull(),
    decision: text("decision").notNull(),
    locale: text("locale").notNull(),
    channel: text("channel").notNull().default("api"),
    idempotencyKey: text("idempotency_key").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("customer_consents_customer_command_type_uidx").on(
      table.customerId,
      table.idempotencyKey,
      table.consentType,
    ),
    foreignKey({
      columns: [table.onboardingId, table.customerId],
      foreignColumns: [customerOnboardings.id, customerOnboardings.customerId],
      name: "customer_consents_onboarding_customer_fk",
    }).onDelete("restrict"),
    index("customer_consents_customer_type_time_idx").on(
      table.customerId,
      table.consentType,
      table.recordedAt,
    ),
    check(
      "customer_consents_type_chk",
      sql`${table.consentType} in ('terms_of_service','privacy_notice','electronic_communications')`,
    ),
    check(
      "customer_consents_decision_chk",
      sql`${table.decision} in ('accepted','declined','withdrawn')`,
    ),
    check("customer_consents_channel_chk", sql`${table.channel} = 'api'`),
    check(
      "customer_consents_version_chk",
      sql`length(${table.documentVersion}) between 1 and 128 and length(${table.bundleVersion}) between 1 and 128`,
    ),
    check(
      "customer_consents_locale_chk",
      sql`length(${table.locale}) between 2 and 35`,
    ),
    check(
      "customer_consents_idempotency_key_chk",
      sql`length(${table.idempotencyKey}) between 8 and 128`,
    ),
  ],
);

export type CustomerOnboarding = typeof customerOnboardings.$inferSelect;
export type NewCustomerOnboarding = typeof customerOnboardings.$inferInsert;
export type CustomerOnboardingTransition =
  typeof customerOnboardingTransitions.$inferSelect;
export type NewCustomerOnboardingTransition =
  typeof customerOnboardingTransitions.$inferInsert;
export type CustomerConsent = typeof customerConsents.$inferSelect;
export type NewCustomerConsent = typeof customerConsents.$inferInsert;
