import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { samraCore } from "./enums";

export const workforceUsers = samraCore.table(
  "workforce_users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    externalRef: text("external_ref").notNull(),
    loginName: text("login_name").notNull(),
    displayName: text("display_name").notNull(),
    role: text("role").notNull(),
    state: text("state").notNull().default("active"),
    passwordSalt: text("password_salt").notNull(),
    passwordHash: text("password_hash").notNull(),
    failedLoginCount: integer("failed_login_count").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("workforce_users_external_ref_uidx").on(table.externalRef),
    uniqueIndex("workforce_users_login_name_uidx").on(
      sql`lower(${table.loginName})`,
    ),
    index("workforce_users_role_state_idx").on(table.role, table.state),
    check(
      "workforce_users_role_chk",
      sql`${table.role} in ('support_readonly','operations_analyst','compliance_readonly','administrator')`,
    ),
    check(
      "workforce_users_state_chk",
      sql`${table.state} in ('active','disabled')`,
    ),
    check(
      "workforce_users_failed_login_count_chk",
      sql`${table.failedLoginCount} >= 0`,
    ),
  ],
);

export const workforceSessions = samraCore.table(
  "workforce_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => workforceUsers.id, { onDelete: "restrict" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("workforce_sessions_token_hash_uidx").on(table.tokenHash),
    index("workforce_sessions_user_active_idx").on(
      table.userId,
      table.revokedAt,
      table.expiresAt,
    ),
    check(
      "workforce_sessions_expiry_chk",
      sql`${table.expiresAt} > ${table.createdAt}`,
    ),
  ],
);

export type WorkforceUser = typeof workforceUsers.$inferSelect;
export type NewWorkforceUser = typeof workforceUsers.$inferInsert;
export type WorkforceSession = typeof workforceSessions.$inferSelect;
export type NewWorkforceSession = typeof workforceSessions.$inferInsert;
