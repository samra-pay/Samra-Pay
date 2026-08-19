CREATE TABLE "samra_core"."customer_acquisition_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "external_ref" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "customer_acquisition_sessions_external_ref_chk"
    CHECK ("external_ref" ~ '^acq_[0-9a-f]{32}$'),
  CONSTRAINT "customer_acquisition_sessions_expiry_chk"
    CHECK ("expires_at" > "created_at")
);
--> statement-breakpoint
CREATE TABLE "samra_core"."customer_acquisition_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "session_id" uuid NOT NULL,
  "command_key" text NOT NULL,
  "request_fingerprint" text NOT NULL,
  "event_type" text NOT NULL,
  "platform" text NOT NULL,
  "channel" text NOT NULL,
  "source" text,
  "medium" text,
  "campaign" text,
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "customer_acquisition_events_type_chk"
    CHECK ("event_type" in ('landing_view','app_open','quote_started','quote_completed','signup_started')),
  CONSTRAINT "customer_acquisition_events_platform_chk"
    CHECK ("platform" in ('web','mobile')),
  CONSTRAINT "customer_acquisition_events_channel_chk"
    CHECK ("channel" in ('direct','organic_search','organic_social','paid_search','paid_social','referral','email','partner','offline','unknown')),
  CONSTRAINT "customer_acquisition_events_command_key_chk"
    CHECK ("command_key" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "customer_acquisition_events_request_fingerprint_chk"
    CHECK ("request_fingerprint" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "customer_acquisition_events_dimensions_chk"
    CHECK (("source" is null or "source" ~ '^[a-z0-9][a-z0-9._-]{0,63}$') and ("medium" is null or "medium" ~ '^[a-z0-9][a-z0-9._-]{0,63}$') and ("campaign" is null or "campaign" ~ '^[a-z0-9][a-z0-9._-]{0,63}$'))
);
--> statement-breakpoint
CREATE TABLE "samra_core"."customer_acquisition_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "session_id" uuid NOT NULL,
  "customer_id" uuid NOT NULL,
  "command_key" text NOT NULL,
  "linked_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "customer_acquisition_links_command_key_chk"
    CHECK ("command_key" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "samra_core"."customer_acquisition_events"
  ADD CONSTRAINT "customer_acquisition_events_session_id_fk"
  FOREIGN KEY ("session_id")
  REFERENCES "samra_core"."customer_acquisition_sessions"("id")
  ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "samra_core"."customer_acquisition_links"
  ADD CONSTRAINT "customer_acquisition_links_session_id_fk"
  FOREIGN KEY ("session_id")
  REFERENCES "samra_core"."customer_acquisition_sessions"("id")
  ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "samra_core"."customer_acquisition_links"
  ADD CONSTRAINT "customer_acquisition_links_customer_id_fk"
  FOREIGN KEY ("customer_id")
  REFERENCES "samra_core"."customers"("id")
  ON DELETE RESTRICT;
--> statement-breakpoint
CREATE UNIQUE INDEX "customer_acquisition_sessions_external_ref_uidx"
  ON "samra_core"."customer_acquisition_sessions" ("external_ref");
--> statement-breakpoint
CREATE INDEX "customer_acquisition_sessions_expiry_idx"
  ON "samra_core"."customer_acquisition_sessions" ("expires_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "customer_acquisition_events_session_command_uidx"
  ON "samra_core"."customer_acquisition_events" ("session_id", "command_key");
--> statement-breakpoint
CREATE INDEX "customer_acquisition_events_session_time_idx"
  ON "samra_core"."customer_acquisition_events" ("session_id", "occurred_at");
--> statement-breakpoint
CREATE INDEX "customer_acquisition_events_channel_time_idx"
  ON "samra_core"."customer_acquisition_events" ("channel", "occurred_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "customer_acquisition_links_session_uidx"
  ON "samra_core"."customer_acquisition_links" ("session_id");
--> statement-breakpoint
CREATE INDEX "customer_acquisition_links_customer_time_idx"
  ON "samra_core"."customer_acquisition_links" ("customer_id", "linked_at");
--> statement-breakpoint
CREATE FUNCTION "samra_core"."guard_append_only_customer_acquisition"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% records are append-only', TG_TABLE_NAME
    USING ERRCODE = '55000';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "customer_acquisition_sessions_append_only"
BEFORE UPDATE OR DELETE ON "samra_core"."customer_acquisition_sessions"
FOR EACH ROW EXECUTE FUNCTION "samra_core"."guard_append_only_customer_acquisition"();
--> statement-breakpoint
CREATE TRIGGER "customer_acquisition_events_append_only"
BEFORE UPDATE OR DELETE ON "samra_core"."customer_acquisition_events"
FOR EACH ROW EXECUTE FUNCTION "samra_core"."guard_append_only_customer_acquisition"();
--> statement-breakpoint
CREATE TRIGGER "customer_acquisition_links_append_only"
BEFORE UPDATE OR DELETE ON "samra_core"."customer_acquisition_links"
FOR EACH ROW EXECUTE FUNCTION "samra_core"."guard_append_only_customer_acquisition"();
