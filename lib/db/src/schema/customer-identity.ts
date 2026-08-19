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
import { customerOnboardings } from "./customer-onboarding";

export const customerIdentityCases = samraCore.table(
  "customer_identity_cases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    externalRef: text("external_ref").notNull(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    onboardingId: uuid("onboarding_id")
      .notNull()
      .references(() => customerOnboardings.id, { onDelete: "restrict" }),
    provider: text("provider").notNull(),
    providerRequestKey: text("provider_request_key").notNull(),
    providerInquiryRef: text("provider_inquiry_ref"),
    state: text("state").notNull(),
    reasonFamily: text("reason_family"),
    version: integer("version").notNull().default(1),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("customer_identity_cases_external_ref_uidx").on(
      table.externalRef,
    ),
    uniqueIndex("customer_identity_cases_onboarding_uidx").on(
      table.onboardingId,
    ),
    uniqueIndex("customer_identity_cases_provider_request_uidx").on(
      table.provider,
      table.providerRequestKey,
    ),
    uniqueIndex("customer_identity_cases_provider_inquiry_uidx")
      .on(table.provider, table.providerInquiryRef)
      .where(sql`${table.providerInquiryRef} is not null`),
    index("customer_identity_cases_customer_idx").on(table.customerId),
    index("customer_identity_cases_state_updated_idx").on(
      table.state,
      table.updatedAt,
    ),
    foreignKey({
      columns: [table.onboardingId, table.customerId],
      foreignColumns: [customerOnboardings.id, customerOnboardings.customerId],
      name: "customer_identity_cases_onboarding_customer_fk",
    }).onDelete("restrict"),
    check(
      "customer_identity_cases_provider_chk",
      sql`${table.provider} = 'persona'`,
    ),
    check(
      "customer_identity_cases_state_chk",
      sql`${table.state} in ('created','pending','review','approved','declined','error')`,
    ),
    check("customer_identity_cases_version_chk", sql`${table.version} > 0`),
    check(
      "customer_identity_cases_request_key_chk",
      sql`${table.providerRequestKey} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "customer_identity_cases_external_ref_chk",
      sql`length(${table.externalRef}) between 8 and 128`,
    ),
    check(
      "customer_identity_cases_provider_inquiry_ref_chk",
      sql`${table.providerInquiryRef} is null or length(${table.providerInquiryRef}) between 1 and 255`,
    ),
    check(
      "customer_identity_cases_reason_family_chk",
      sql`${table.reasonFamily} is null or length(${table.reasonFamily}) between 1 and 64`,
    ),
    check(
      "customer_identity_cases_decision_time_chk",
      sql`(${table.state} in ('approved','declined') and ${table.decidedAt} is not null) or (${table.state} not in ('approved','declined') and ${table.decidedAt} is null)`,
    ),
    check(
      "customer_identity_cases_inquiry_state_chk",
      sql`${table.state} in ('created','error') or ${table.providerInquiryRef} is not null`,
    ),
  ],
);

export const customerIdentityCaseTransitions = samraCore.table(
  "customer_identity_case_transitions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    identityCaseId: uuid("identity_case_id")
      .notNull()
      .references(() => customerIdentityCases.id, { onDelete: "restrict" }),
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
    uniqueIndex("customer_identity_case_transitions_sequence_uidx").on(
      table.identityCaseId,
      table.sequence,
    ),
    uniqueIndex("customer_identity_case_transitions_command_uidx").on(
      table.identityCaseId,
      table.commandKey,
    ),
    index("customer_identity_case_transitions_time_idx").on(
      table.identityCaseId,
      table.occurredAt,
    ),
    check(
      "customer_identity_case_transitions_sequence_chk",
      sql`${table.sequence} > 0`,
    ),
  ],
);

export const customerIdentityProviderEvents = samraCore.table(
  "customer_identity_provider_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    identityCaseId: uuid("identity_case_id")
      .notNull()
      .references(() => customerIdentityCases.id, { onDelete: "restrict" }),
    provider: text("provider").notNull(),
    providerEventRef: text("provider_event_ref").notNull(),
    eventType: text("event_type").notNull(),
    normalizedDecision: text("normalized_decision").notNull(),
    disposition: text("disposition").notNull(),
    payloadDigest: text("payload_digest").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("customer_identity_provider_events_ref_uidx").on(
      table.provider,
      table.providerEventRef,
    ),
    index("customer_identity_provider_events_case_time_idx").on(
      table.identityCaseId,
      table.receivedAt,
    ),
    check(
      "customer_identity_provider_events_provider_chk",
      sql`${table.provider} = 'persona'`,
    ),
    check(
      "customer_identity_provider_events_decision_chk",
      sql`${table.normalizedDecision} in ('pending','review','approved','declined','error')`,
    ),
    check(
      "customer_identity_provider_events_disposition_chk",
      sql`${table.disposition} in ('applied','ignored_stale','conflict')`,
    ),
    check(
      "customer_identity_provider_events_digest_chk",
      sql`${table.payloadDigest} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "customer_identity_provider_events_ref_chk",
      sql`length(${table.providerEventRef}) between 1 and 255`,
    ),
    check(
      "customer_identity_provider_events_type_chk",
      sql`length(${table.eventType}) between 1 and 128`,
    ),
  ],
);

export type CustomerIdentityCase = typeof customerIdentityCases.$inferSelect;
export type NewCustomerIdentityCase = typeof customerIdentityCases.$inferInsert;
export type CustomerIdentityCaseTransition =
  typeof customerIdentityCaseTransitions.$inferSelect;
export type NewCustomerIdentityCaseTransition =
  typeof customerIdentityCaseTransitions.$inferInsert;
export type CustomerIdentityProviderEvent =
  typeof customerIdentityProviderEvents.$inferSelect;
export type NewCustomerIdentityProviderEvent =
  typeof customerIdentityProviderEvents.$inferInsert;
