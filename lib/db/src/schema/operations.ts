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
import { samraCore, workflowWorkStateEnum } from "./enums";
import { remittanceTransfers } from "./remittance";

export const remittanceWorkflowWork = samraCore.table(
  "remittance_workflow_work",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    transferId: uuid("transfer_id")
      .notNull()
      .references(() => remittanceTransfers.id, { onDelete: "restrict" }),
    transferVersion: integer("transfer_version").notNull(),
    state: workflowWorkStateEnum("state").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    availableAt: timestamp("available_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    lastError: text("last_error"),
    terminalReason: text("terminal_reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("remittance_workflow_work_transfer_uidx").on(table.transferId),
    index("remittance_workflow_work_dispatch_idx").on(
      table.state,
      table.availableAt,
    ),
    index("remittance_workflow_work_lease_idx").on(
      table.state,
      table.leaseExpiresAt,
    ),
    check(
      "remittance_workflow_work_attempts_chk",
      sql`${table.attemptCount} >= 0 and ${table.maxAttempts} > 0 and ${table.attemptCount} <= ${table.maxAttempts}`,
    ),
    check(
      "remittance_workflow_work_lease_chk",
      sql`(${table.state} = 'processing' and ${table.leaseOwner} is not null and ${table.leaseExpiresAt} is not null) or (${table.state} <> 'processing' and ${table.leaseOwner} is null and ${table.leaseExpiresAt} is null)`,
    ),
    check(
      "remittance_workflow_work_terminal_chk",
      sql`(${table.state} = 'failed' and ${table.terminalReason} is not null) or (${table.state} <> 'failed' and ${table.terminalReason} is null)`,
    ),
  ],
);

export type RemittanceWorkflowWork = typeof remittanceWorkflowWork.$inferSelect;
export type NewRemittanceWorkflowWork =
  typeof remittanceWorkflowWork.$inferInsert;
