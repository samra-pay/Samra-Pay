CREATE TABLE "samra_core"."operations_case_commands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operator_user_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"command_type" text NOT NULL,
	"case_id" uuid NOT NULL,
	"result_version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "operations_case_commands_type_chk" CHECK ("samra_core"."operations_case_commands"."command_type" in ('create','update','add_note')),
	CONSTRAINT "operations_case_commands_version_chk" CHECK ("samra_core"."operations_case_commands"."result_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "samra_core"."operations_case_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "operations_case_events_type_chk" CHECK ("samra_core"."operations_case_events"."event_type" in ('created','updated','note_added'))
);
--> statement-breakpoint
CREATE TABLE "samra_core"."operations_case_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "operations_case_notes_body_chk" CHECK (length(btrim("samra_core"."operations_case_notes"."body")) between 1 and 4000)
);
--> statement-breakpoint
CREATE TABLE "samra_core"."operations_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_ref" text NOT NULL,
	"customer_id" uuid,
	"transfer_id" uuid,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"assigned_user_id" uuid,
	"opened_by_user_id" uuid NOT NULL,
	"resolution" text,
	"due_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	CONSTRAINT "operations_cases_reference_chk" CHECK ("samra_core"."operations_cases"."customer_id" is not null or "samra_core"."operations_cases"."transfer_id" is not null),
	CONSTRAINT "operations_cases_category_chk" CHECK ("samra_core"."operations_cases"."category" in ('transfer_status','funding','payout','refund','identity','reconciliation','technical','other')),
	CONSTRAINT "operations_cases_priority_chk" CHECK ("samra_core"."operations_cases"."priority" in ('low','normal','high','urgent')),
	CONSTRAINT "operations_cases_status_chk" CHECK ("samra_core"."operations_cases"."status" in ('open','in_progress','pending_customer','resolved','closed')),
	CONSTRAINT "operations_cases_version_chk" CHECK ("samra_core"."operations_cases"."version" > 0),
	CONSTRAINT "operations_cases_resolution_chk" CHECK (("samra_core"."operations_cases"."status" in ('resolved','closed') and "samra_core"."operations_cases"."resolution" is not null and length(btrim("samra_core"."operations_cases"."resolution")) > 0) or ("samra_core"."operations_cases"."status" not in ('resolved','closed') and "samra_core"."operations_cases"."resolution" is null))
);
--> statement-breakpoint
ALTER TABLE "samra_core"."operations_case_commands" ADD CONSTRAINT "operations_case_commands_operator_user_id_workforce_users_id_fk" FOREIGN KEY ("operator_user_id") REFERENCES "samra_core"."workforce_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "samra_core"."operations_case_commands" ADD CONSTRAINT "operations_case_commands_case_id_operations_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "samra_core"."operations_cases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "samra_core"."operations_case_events" ADD CONSTRAINT "operations_case_events_case_id_operations_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "samra_core"."operations_cases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "samra_core"."operations_case_events" ADD CONSTRAINT "operations_case_events_actor_user_id_workforce_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "samra_core"."workforce_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "samra_core"."operations_case_notes" ADD CONSTRAINT "operations_case_notes_case_id_operations_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "samra_core"."operations_cases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "samra_core"."operations_case_notes" ADD CONSTRAINT "operations_case_notes_author_user_id_workforce_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "samra_core"."workforce_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "samra_core"."operations_cases" ADD CONSTRAINT "operations_cases_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "samra_core"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "samra_core"."operations_cases" ADD CONSTRAINT "operations_cases_transfer_id_remittance_transfers_id_fk" FOREIGN KEY ("transfer_id") REFERENCES "samra_core"."remittance_transfers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "samra_core"."operations_cases" ADD CONSTRAINT "operations_cases_assigned_user_id_workforce_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "samra_core"."workforce_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "samra_core"."operations_cases" ADD CONSTRAINT "operations_cases_opened_by_user_id_workforce_users_id_fk" FOREIGN KEY ("opened_by_user_id") REFERENCES "samra_core"."workforce_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "operations_case_commands_operator_key_uidx" ON "samra_core"."operations_case_commands" USING btree ("operator_user_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "operations_case_commands_case_idx" ON "samra_core"."operations_case_commands" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "operations_case_events_case_idx" ON "samra_core"."operations_case_events" USING btree ("case_id","created_at");--> statement-breakpoint
CREATE INDEX "operations_case_notes_case_idx" ON "samra_core"."operations_case_notes" USING btree ("case_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "operations_cases_external_ref_uidx" ON "samra_core"."operations_cases" USING btree ("external_ref");--> statement-breakpoint
CREATE INDEX "operations_cases_queue_idx" ON "samra_core"."operations_cases" USING btree ("status","priority","due_at");--> statement-breakpoint
CREATE INDEX "operations_cases_assignee_idx" ON "samra_core"."operations_cases" USING btree ("assigned_user_id","status");--> statement-breakpoint
CREATE INDEX "operations_cases_customer_idx" ON "samra_core"."operations_cases" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "operations_cases_transfer_idx" ON "samra_core"."operations_cases" USING btree ("transfer_id");