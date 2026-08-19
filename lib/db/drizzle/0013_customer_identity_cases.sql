CREATE TABLE "samra_core"."customer_identity_cases" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "external_ref" text NOT NULL,
  "customer_id" uuid NOT NULL,
  "onboarding_id" uuid NOT NULL,
  "provider" text NOT NULL,
  "provider_request_key" text NOT NULL,
  "provider_inquiry_ref" text,
  "state" text NOT NULL,
  "reason_family" text,
  "version" integer DEFAULT 1 NOT NULL,
  "decided_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "customer_identity_cases_provider_chk"
    CHECK ("provider" = 'persona'),
  CONSTRAINT "customer_identity_cases_state_chk"
    CHECK ("state" in ('created','pending','review','approved','declined','error')),
  CONSTRAINT "customer_identity_cases_version_chk" CHECK ("version" > 0),
  CONSTRAINT "customer_identity_cases_request_key_chk"
    CHECK ("provider_request_key" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "customer_identity_cases_external_ref_chk"
    CHECK (length("external_ref") between 8 and 128),
  CONSTRAINT "customer_identity_cases_provider_inquiry_ref_chk"
    CHECK ("provider_inquiry_ref" IS NULL OR length("provider_inquiry_ref") between 1 and 255),
  CONSTRAINT "customer_identity_cases_reason_family_chk"
    CHECK ("reason_family" IS NULL OR length("reason_family") between 1 and 64),
  CONSTRAINT "customer_identity_cases_decision_time_chk"
    CHECK (("state" in ('approved','declined') AND "decided_at" IS NOT NULL)
       OR ("state" not in ('approved','declined') AND "decided_at" IS NULL)),
  CONSTRAINT "customer_identity_cases_inquiry_state_chk"
    CHECK ("state" in ('created','error') OR "provider_inquiry_ref" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "samra_core"."customer_identity_case_transitions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "identity_case_id" uuid NOT NULL,
  "sequence" integer NOT NULL,
  "from_state" text,
  "to_state" text NOT NULL,
  "reason_family" text,
  "command_key" text NOT NULL,
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "customer_identity_case_transitions_sequence_chk"
    CHECK ("sequence" > 0)
);
--> statement-breakpoint
CREATE TABLE "samra_core"."customer_identity_provider_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "identity_case_id" uuid NOT NULL,
  "provider" text NOT NULL,
  "provider_event_ref" text NOT NULL,
  "event_type" text NOT NULL,
  "normalized_decision" text NOT NULL,
  "disposition" text NOT NULL,
  "payload_digest" text NOT NULL,
  "received_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "customer_identity_provider_events_provider_chk"
    CHECK ("provider" = 'persona'),
  CONSTRAINT "customer_identity_provider_events_decision_chk"
    CHECK ("normalized_decision" in ('pending','review','approved','declined','error')),
  CONSTRAINT "customer_identity_provider_events_disposition_chk"
    CHECK ("disposition" in ('applied','ignored_stale','conflict')),
  CONSTRAINT "customer_identity_provider_events_digest_chk"
    CHECK ("payload_digest" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "customer_identity_provider_events_ref_chk"
    CHECK (length("provider_event_ref") between 1 and 255),
  CONSTRAINT "customer_identity_provider_events_type_chk"
    CHECK (length("event_type") between 1 and 128)
);
--> statement-breakpoint
ALTER TABLE "samra_core"."customer_identity_cases"
  ADD CONSTRAINT "customer_identity_cases_customer_id_customers_id_fk"
  FOREIGN KEY ("customer_id") REFERENCES "samra_core"."customers"("id")
  ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "samra_core"."customer_identity_cases"
  ADD CONSTRAINT "customer_identity_cases_onboarding_id_customer_onboardings_id_fk"
  FOREIGN KEY ("onboarding_id") REFERENCES "samra_core"."customer_onboardings"("id")
  ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "samra_core"."customer_identity_cases"
  ADD CONSTRAINT "customer_identity_cases_onboarding_customer_fk"
  FOREIGN KEY ("onboarding_id", "customer_id")
  REFERENCES "samra_core"."customer_onboardings"("id", "customer_id")
  ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "samra_core"."customer_identity_case_transitions"
  ADD CONSTRAINT "customer_identity_case_transitions_identity_case_id_fk"
  FOREIGN KEY ("identity_case_id") REFERENCES "samra_core"."customer_identity_cases"("id")
  ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "samra_core"."customer_identity_provider_events"
  ADD CONSTRAINT "customer_identity_provider_events_identity_case_id_fk"
  FOREIGN KEY ("identity_case_id") REFERENCES "samra_core"."customer_identity_cases"("id")
  ON DELETE RESTRICT;
--> statement-breakpoint
CREATE UNIQUE INDEX "customer_identity_cases_external_ref_uidx"
  ON "samra_core"."customer_identity_cases" ("external_ref");
--> statement-breakpoint
CREATE UNIQUE INDEX "customer_identity_cases_onboarding_uidx"
  ON "samra_core"."customer_identity_cases" ("onboarding_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "customer_identity_cases_provider_request_uidx"
  ON "samra_core"."customer_identity_cases" ("provider", "provider_request_key");
--> statement-breakpoint
CREATE UNIQUE INDEX "customer_identity_cases_provider_inquiry_uidx"
  ON "samra_core"."customer_identity_cases" ("provider", "provider_inquiry_ref")
  WHERE "provider_inquiry_ref" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX "customer_identity_cases_customer_idx"
  ON "samra_core"."customer_identity_cases" ("customer_id");
--> statement-breakpoint
CREATE INDEX "customer_identity_cases_state_updated_idx"
  ON "samra_core"."customer_identity_cases" ("state", "updated_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "customer_identity_case_transitions_sequence_uidx"
  ON "samra_core"."customer_identity_case_transitions" ("identity_case_id", "sequence");
--> statement-breakpoint
CREATE UNIQUE INDEX "customer_identity_case_transitions_command_uidx"
  ON "samra_core"."customer_identity_case_transitions" ("identity_case_id", "command_key");
--> statement-breakpoint
CREATE INDEX "customer_identity_case_transitions_time_idx"
  ON "samra_core"."customer_identity_case_transitions" ("identity_case_id", "occurred_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "customer_identity_provider_events_ref_uidx"
  ON "samra_core"."customer_identity_provider_events" ("provider", "provider_event_ref");
--> statement-breakpoint
CREATE INDEX "customer_identity_provider_events_case_time_idx"
  ON "samra_core"."customer_identity_provider_events" ("identity_case_id", "received_at");
--> statement-breakpoint
CREATE FUNCTION "samra_core"."guard_customer_identity_case_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'customer identity case % cannot be deleted', OLD."id"
      USING ERRCODE = '55000';
  END IF;

  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."external_ref" IS DISTINCT FROM OLD."external_ref"
    OR NEW."customer_id" IS DISTINCT FROM OLD."customer_id"
    OR NEW."onboarding_id" IS DISTINCT FROM OLD."onboarding_id"
    OR NEW."provider" IS DISTINCT FROM OLD."provider"
    OR NEW."provider_request_key" IS DISTINCT FROM OLD."provider_request_key"
    OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'customer identity case % identity is immutable', OLD."id"
      USING ERRCODE = '55000';
  END IF;

  IF OLD."provider_inquiry_ref" IS NOT NULL
    AND NEW."provider_inquiry_ref" IS DISTINCT FROM OLD."provider_inquiry_ref" THEN
    RAISE EXCEPTION 'customer identity case % provider inquiry is immutable', OLD."id"
      USING ERRCODE = '55000';
  END IF;

  IF NEW."version" <> OLD."version" + 1 THEN
    RAISE EXCEPTION 'customer identity case % version must increment by one', OLD."id"
      USING ERRCODE = '40001';
  END IF;

  IF NEW."state" = OLD."state" OR NOT (
    (OLD."state" = 'created' AND NEW."state" IN ('pending','error')) OR
    (OLD."state" = 'pending' AND NEW."state" IN ('review','approved','declined','error')) OR
    (OLD."state" = 'review' AND NEW."state" IN ('approved','declined','error')) OR
    (OLD."state" = 'error' AND NEW."state" IN ('pending','review','approved','declined'))
  ) THEN
    RAISE EXCEPTION 'invalid customer identity case transition from % to %', OLD."state", NEW."state"
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "customer_identity_cases_controlled_mutation"
BEFORE UPDATE OR DELETE ON "samra_core"."customer_identity_cases"
FOR EACH ROW EXECUTE FUNCTION "samra_core"."guard_customer_identity_case_mutation"();
--> statement-breakpoint
CREATE TRIGGER "customer_identity_case_transitions_append_only"
BEFORE UPDATE OR DELETE ON "samra_core"."customer_identity_case_transitions"
FOR EACH ROW EXECUTE FUNCTION "samra_core"."guard_append_only_customer_onboarding_evidence"();
--> statement-breakpoint
CREATE TRIGGER "customer_identity_provider_events_append_only"
BEFORE UPDATE OR DELETE ON "samra_core"."customer_identity_provider_events"
FOR EACH ROW EXECUTE FUNCTION "samra_core"."guard_append_only_customer_onboarding_evidence"();
