CREATE TYPE "samra_core"."workflow_work_state" AS ENUM (
  'pending',
  'processing',
  'retry',
  'completed',
  'failed'
);
--> statement-breakpoint
ALTER TABLE "samra_core"."outbox_events"
  ADD COLUMN "lease_owner" text,
  ADD COLUMN "lease_expires_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "samra_core"."outbox_events"
SET "state" = 'pending', "claimed_at" = NULL
WHERE "state" = 'processing';
--> statement-breakpoint
CREATE INDEX "outbox_events_lease_idx"
  ON "samra_core"."outbox_events" USING btree ("state", "lease_expires_at");
--> statement-breakpoint
ALTER TABLE "samra_core"."outbox_events"
  ADD CONSTRAINT "outbox_events_lease_chk"
  CHECK (("state" = 'processing' AND "lease_owner" IS NOT NULL AND "lease_expires_at" IS NOT NULL)
      OR ("state" <> 'processing' AND "lease_owner" IS NULL AND "lease_expires_at" IS NULL));
--> statement-breakpoint
CREATE TABLE "samra_core"."remittance_workflow_work" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "transfer_id" uuid NOT NULL,
  "transfer_version" integer NOT NULL,
  "state" "samra_core"."workflow_work_state" DEFAULT 'pending' NOT NULL,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "max_attempts" integer DEFAULT 5 NOT NULL,
  "available_at" timestamp with time zone DEFAULT now() NOT NULL,
  "lease_owner" text,
  "lease_expires_at" timestamp with time zone,
  "last_error" text,
  "terminal_reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "remittance_workflow_work_transfer_id_remittance_transfers_id_fk"
    FOREIGN KEY ("transfer_id")
    REFERENCES "samra_core"."remittance_transfers"("id")
    ON DELETE RESTRICT,
  CONSTRAINT "remittance_workflow_work_attempts_chk"
    CHECK ("attempt_count" >= 0 AND "max_attempts" > 0 AND "attempt_count" <= "max_attempts"),
  CONSTRAINT "remittance_workflow_work_lease_chk"
    CHECK (("state" = 'processing' AND "lease_owner" IS NOT NULL AND "lease_expires_at" IS NOT NULL)
        OR ("state" <> 'processing' AND "lease_owner" IS NULL AND "lease_expires_at" IS NULL)),
  CONSTRAINT "remittance_workflow_work_terminal_chk"
    CHECK (("state" = 'failed' AND "terminal_reason" IS NOT NULL)
        OR ("state" <> 'failed' AND "terminal_reason" IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "remittance_workflow_work_transfer_uidx"
  ON "samra_core"."remittance_workflow_work" USING btree ("transfer_id");
--> statement-breakpoint
CREATE INDEX "remittance_workflow_work_dispatch_idx"
  ON "samra_core"."remittance_workflow_work" USING btree ("state", "available_at");
--> statement-breakpoint
CREATE INDEX "remittance_workflow_work_lease_idx"
  ON "samra_core"."remittance_workflow_work" USING btree ("state", "lease_expires_at");
--> statement-breakpoint
