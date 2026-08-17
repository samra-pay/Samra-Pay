CREATE TABLE "samra_core"."workforce_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workforce_sessions_expiry_chk" CHECK ("samra_core"."workforce_sessions"."expires_at" > "samra_core"."workforce_sessions"."created_at")
);
--> statement-breakpoint
CREATE TABLE "samra_core"."workforce_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_ref" text NOT NULL,
	"login_name" text NOT NULL,
	"display_name" text NOT NULL,
	"role" text NOT NULL,
	"state" text DEFAULT 'active' NOT NULL,
	"password_salt" text NOT NULL,
	"password_hash" text NOT NULL,
	"failed_login_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workforce_users_role_chk" CHECK ("samra_core"."workforce_users"."role" in ('support_readonly','operations_analyst','compliance_readonly','administrator')),
	CONSTRAINT "workforce_users_state_chk" CHECK ("samra_core"."workforce_users"."state" in ('active','disabled')),
	CONSTRAINT "workforce_users_failed_login_count_chk" CHECK ("samra_core"."workforce_users"."failed_login_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "samra_core"."workforce_sessions" ADD CONSTRAINT "workforce_sessions_user_id_workforce_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "samra_core"."workforce_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workforce_sessions_token_hash_uidx" ON "samra_core"."workforce_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "workforce_sessions_user_active_idx" ON "samra_core"."workforce_sessions" USING btree ("user_id","revoked_at","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "workforce_users_external_ref_uidx" ON "samra_core"."workforce_users" USING btree ("external_ref");--> statement-breakpoint
CREATE UNIQUE INDEX "workforce_users_login_name_uidx" ON "samra_core"."workforce_users" USING btree (lower("login_name"));--> statement-breakpoint
CREATE INDEX "workforce_users_role_state_idx" ON "samra_core"."workforce_users" USING btree ("role","state");