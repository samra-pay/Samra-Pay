import { sql } from "drizzle-orm";
import {
  check,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { samraCore } from "./enums";
import { customers } from "./parties";

export const alphaReleaseControls = samraCore.table(
  "alpha_release_controls",
  {
    releaseId: text("release_id").primaryKey(),
    admissionLimit: smallint("admission_limit").notNull().default(0),
  },
  (table) => [
    check(
      "alpha_release_controls_release_id_check",
      sql`${table.releaseId} = 'alpha-release-1'`,
    ),
    check(
      "alpha_release_controls_admission_limit_check",
      sql`${table.admissionLimit} IN (0, 1, 5, 25, 100)`,
    ),
  ],
);

export const alphaInvitations = samraCore.table(
  "alpha_invitations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    issuer: text("issuer").notNull(),
    subject: text("subject").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("alpha_invitations_issuer_subject_key").on(
      table.issuer,
      table.subject,
    ),
    check(
      "alpha_invitations_issuer_check",
      sql`length(${table.issuer}) BETWEEN 9 AND 2048`,
    ),
    check(
      "alpha_invitations_subject_check",
      sql`length(${table.subject}) BETWEEN 1 AND 255`,
    ),
  ],
);

export const alphaAdmissions = samraCore.table(
  "alpha_admissions",
  {
    slot: smallint("slot").primaryKey(),
    invitationId: uuid("invitation_id")
      .notNull()
      .unique()
      .references(() => alphaInvitations.id, { onDelete: "restrict" }),
    customerId: uuid("customer_id")
      .notNull()
      .unique()
      .references(() => customers.id, { onDelete: "restrict" }),
    admittedAt: timestamp("admitted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check("alpha_admissions_slot_check", sql`${table.slot} BETWEEN 1 AND 100`),
  ],
);
