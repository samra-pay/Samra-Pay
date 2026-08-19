ALTER TABLE "samra_core"."customers"
  ALTER COLUMN "display_name" DROP NOT NULL,
  ALTER COLUMN "country_code" DROP NOT NULL;
--> statement-breakpoint
CREATE TABLE "samra_core"."customer_onboardings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "customer_id" uuid NOT NULL,
  "state" text NOT NULL,
  "latest_completed_step" text NOT NULL,
  "reason_family" text,
  "version" integer DEFAULT 1 NOT NULL,
  "entered_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "customer_onboardings_state_chk"
    CHECK ("state" in ('not_started','authenticated','consent_pending','identity_in_progress','identity_review','identity_approved','bank_link_pending','bank_matched','wallet_consent_pending','wallet_provisioning','wallet_ready','funding_ready','activated','restricted')),
  CONSTRAINT "customer_onboardings_version_chk" CHECK ("version" > 0),
  CONSTRAINT "customer_onboardings_latest_step_chk"
    CHECK (length("latest_completed_step") between 1 and 64)
);
--> statement-breakpoint
CREATE TABLE "samra_core"."customer_onboarding_transitions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "onboarding_id" uuid NOT NULL,
  "sequence" integer NOT NULL,
  "from_state" text,
  "to_state" text NOT NULL,
  "reason_family" text,
  "command_key" text NOT NULL,
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "customer_onboarding_transitions_sequence_chk"
    CHECK ("sequence" > 0)
);
--> statement-breakpoint
CREATE TABLE "samra_core"."customer_consents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "customer_id" uuid NOT NULL,
  "onboarding_id" uuid NOT NULL,
  "consent_type" text NOT NULL,
  "document_version" text NOT NULL,
  "bundle_version" text NOT NULL,
  "decision" text NOT NULL,
  "locale" text NOT NULL,
  "channel" text DEFAULT 'api' NOT NULL,
  "idempotency_key" text NOT NULL,
  "recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "customer_consents_type_chk"
    CHECK ("consent_type" in ('terms_of_service','privacy_notice','electronic_communications')),
  CONSTRAINT "customer_consents_decision_chk"
    CHECK ("decision" in ('accepted','declined','withdrawn')),
  CONSTRAINT "customer_consents_channel_chk" CHECK ("channel" = 'api'),
  CONSTRAINT "customer_consents_version_chk"
    CHECK (length("document_version") between 1 and 128 AND length("bundle_version") between 1 and 128),
  CONSTRAINT "customer_consents_locale_chk"
    CHECK (length("locale") between 2 and 35),
  CONSTRAINT "customer_consents_idempotency_key_chk"
    CHECK (length("idempotency_key") between 8 and 128)
);
--> statement-breakpoint
ALTER TABLE "samra_core"."customer_onboardings"
  ADD CONSTRAINT "customer_onboardings_customer_id_customers_id_fk"
  FOREIGN KEY ("customer_id") REFERENCES "samra_core"."customers"("id")
  ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "samra_core"."customer_onboarding_transitions"
  ADD CONSTRAINT "customer_onboarding_transitions_onboarding_id_fk"
  FOREIGN KEY ("onboarding_id") REFERENCES "samra_core"."customer_onboardings"("id")
  ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "samra_core"."customer_consents"
  ADD CONSTRAINT "customer_consents_customer_id_customers_id_fk"
  FOREIGN KEY ("customer_id") REFERENCES "samra_core"."customers"("id")
  ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "samra_core"."customer_consents"
  ADD CONSTRAINT "customer_consents_onboarding_id_customer_onboardings_id_fk"
  FOREIGN KEY ("onboarding_id") REFERENCES "samra_core"."customer_onboardings"("id")
  ON DELETE RESTRICT;
--> statement-breakpoint
CREATE UNIQUE INDEX "customer_onboardings_customer_uidx"
  ON "samra_core"."customer_onboardings" ("customer_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "customer_onboardings_id_customer_uidx"
  ON "samra_core"."customer_onboardings" ("id", "customer_id");
--> statement-breakpoint
CREATE INDEX "customer_onboardings_state_updated_idx"
  ON "samra_core"."customer_onboardings" ("state", "updated_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "customer_onboarding_transitions_sequence_uidx"
  ON "samra_core"."customer_onboarding_transitions" ("onboarding_id", "sequence");
--> statement-breakpoint
CREATE UNIQUE INDEX "customer_onboarding_transitions_command_uidx"
  ON "samra_core"."customer_onboarding_transitions" ("onboarding_id", "command_key");
--> statement-breakpoint
CREATE INDEX "customer_onboarding_transitions_time_idx"
  ON "samra_core"."customer_onboarding_transitions" ("onboarding_id", "occurred_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "customer_consents_customer_command_type_uidx"
  ON "samra_core"."customer_consents" ("customer_id", "idempotency_key", "consent_type");
--> statement-breakpoint
CREATE INDEX "customer_consents_customer_type_time_idx"
  ON "samra_core"."customer_consents" ("customer_id", "consent_type", "recorded_at");
--> statement-breakpoint
ALTER TABLE "samra_core"."customer_consents"
  ADD CONSTRAINT "customer_consents_onboarding_customer_fk"
  FOREIGN KEY ("onboarding_id", "customer_id")
  REFERENCES "samra_core"."customer_onboardings"("id", "customer_id")
  ON DELETE RESTRICT;
--> statement-breakpoint
CREATE FUNCTION "samra_core"."guard_customer_onboarding_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'customer onboarding % cannot be deleted', OLD."id"
      USING ERRCODE = '55000';
  END IF;

  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."customer_id" IS DISTINCT FROM OLD."customer_id"
    OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'customer onboarding % identity is immutable', OLD."id"
      USING ERRCODE = '55000';
  END IF;

  IF NEW."version" <> OLD."version" + 1 THEN
    RAISE EXCEPTION 'customer onboarding % version must increment by one', OLD."id"
      USING ERRCODE = '40001';
  END IF;

  IF NEW."state" = OLD."state" AND NEW."entered_at" IS DISTINCT FROM OLD."entered_at" THEN
    RAISE EXCEPTION 'entered_at changes only when onboarding state changes'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."state" <> OLD."state" AND NOT (
    (OLD."state" = 'not_started' AND NEW."state" IN ('authenticated','restricted')) OR
    (OLD."state" = 'authenticated' AND NEW."state" IN ('consent_pending','restricted')) OR
    (OLD."state" = 'consent_pending' AND NEW."state" IN ('identity_in_progress','restricted')) OR
    (OLD."state" = 'identity_in_progress' AND NEW."state" IN ('identity_review','identity_approved','restricted')) OR
    (OLD."state" = 'identity_review' AND NEW."state" IN ('identity_approved','restricted')) OR
    (OLD."state" = 'identity_approved' AND NEW."state" IN ('bank_link_pending','wallet_consent_pending','restricted')) OR
    (OLD."state" = 'bank_link_pending' AND NEW."state" IN ('bank_matched','restricted')) OR
    (OLD."state" = 'bank_matched' AND NEW."state" IN ('wallet_consent_pending','restricted')) OR
    (OLD."state" = 'wallet_consent_pending' AND NEW."state" IN ('wallet_provisioning','restricted')) OR
    (OLD."state" = 'wallet_provisioning' AND NEW."state" IN ('wallet_ready','restricted')) OR
    (OLD."state" = 'wallet_ready' AND NEW."state" IN ('funding_ready','restricted')) OR
    (OLD."state" = 'funding_ready' AND NEW."state" IN ('activated','restricted')) OR
    (OLD."state" = 'activated' AND NEW."state" = 'restricted')
  ) THEN
    RAISE EXCEPTION 'invalid customer onboarding transition from % to %', OLD."state", NEW."state"
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "customer_onboardings_controlled_mutation"
BEFORE UPDATE OR DELETE ON "samra_core"."customer_onboardings"
FOR EACH ROW EXECUTE FUNCTION "samra_core"."guard_customer_onboarding_mutation"();
--> statement-breakpoint
CREATE FUNCTION "samra_core"."guard_append_only_customer_onboarding_evidence"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% rows are append-only', TG_TABLE_NAME
    USING ERRCODE = '55000';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "customer_onboarding_transitions_append_only"
BEFORE UPDATE OR DELETE ON "samra_core"."customer_onboarding_transitions"
FOR EACH ROW EXECUTE FUNCTION "samra_core"."guard_append_only_customer_onboarding_evidence"();
--> statement-breakpoint
CREATE TRIGGER "customer_consents_append_only"
BEFORE UPDATE OR DELETE ON "samra_core"."customer_consents"
FOR EACH ROW EXECUTE FUNCTION "samra_core"."guard_append_only_customer_onboarding_evidence"();
