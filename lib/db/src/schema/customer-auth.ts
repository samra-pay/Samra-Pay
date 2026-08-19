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

export const customerAuthIdentities = samraCore.table(
  "customer_auth_identities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    provider: text("provider").notNull().default("auth0"),
    issuer: text("issuer").notNull(),
    subject: text("subject").notNull(),
    state: text("state").notNull().default("active"),
    boundAt: timestamp("bound_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("customer_auth_identities_provider_subject_uidx").on(
      table.provider,
      table.issuer,
      table.subject,
    ),
    index("customer_auth_identities_customer_state_idx").on(
      table.customerId,
      table.state,
    ),
    check(
      "customer_auth_identities_provider_chk",
      sql`${table.provider} = 'auth0'`,
    ),
    check(
      "customer_auth_identities_state_chk",
      sql`${table.state} in ('active','revoked')`,
    ),
    check(
      "customer_auth_identities_issuer_chk",
      sql`length(${table.issuer}) between 9 and 2048`,
    ),
    check(
      "customer_auth_identities_subject_chk",
      sql`length(${table.subject}) between 1 and 255`,
    ),
    check(
      "customer_auth_identities_revocation_chk",
      sql`(${table.state} = 'active' AND ${table.revokedAt} IS NULL) OR (${table.state} = 'revoked' AND ${table.revokedAt} IS NOT NULL)`,
    ),
  ],
);

export type CustomerAuthIdentity = typeof customerAuthIdentities.$inferSelect;
export type NewCustomerAuthIdentity =
  typeof customerAuthIdentities.$inferInsert;
