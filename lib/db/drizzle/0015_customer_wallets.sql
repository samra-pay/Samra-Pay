ALTER TABLE "samra_core"."customer_consents"
  DROP CONSTRAINT "customer_consents_type_chk";
--> statement-breakpoint
ALTER TABLE "samra_core"."customer_consents"
  ADD CONSTRAINT "customer_consents_type_chk"
  CHECK ("consent_type" in ('terms_of_service','privacy_notice','electronic_communications','wallet_provisioning'));
--> statement-breakpoint
CREATE UNIQUE INDEX "customer_consents_id_customer_onboarding_uidx"
  ON "samra_core"."customer_consents" ("id", "customer_id", "onboarding_id");
--> statement-breakpoint
CREATE TABLE "samra_core"."customer_wallets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "external_ref" text NOT NULL,
  "customer_id" uuid NOT NULL,
  "onboarding_id" uuid NOT NULL,
  "wallet_consent_id" uuid NOT NULL,
  "provider" text NOT NULL,
  "provider_request_key" text NOT NULL,
  "creation_command_key" text NOT NULL,
  "state" text NOT NULL,
  "reason_family" text,
  "asset" text NOT NULL,
  "environment" text NOT NULL,
  "configuration_version" text NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "ready_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "customer_wallets_provider_chk" CHECK ("provider" = 'crossmint'),
  CONSTRAINT "customer_wallets_state_chk"
    CHECK ("state" in ('created','provisioning','ready','restricted','error')),
  CONSTRAINT "customer_wallets_asset_chk" CHECK ("asset" = 'USDC'),
  CONSTRAINT "customer_wallets_environment_chk" CHECK ("environment" = 'synthetic'),
  CONSTRAINT "customer_wallets_provider_request_key_chk"
    CHECK ("provider_request_key" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "customer_wallets_creation_command_key_chk"
    CHECK ("creation_command_key" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "customer_wallets_external_ref_chk"
    CHECK ("external_ref" ~ '^wallet_[0-9a-f]{32}$'),
  CONSTRAINT "customer_wallets_configuration_version_chk"
    CHECK (length("configuration_version") between 1 and 128),
  CONSTRAINT "customer_wallets_reason_family_chk"
    CHECK ("reason_family" IS NULL OR length("reason_family") between 1 and 64),
  CONSTRAINT "customer_wallets_version_chk" CHECK ("version" > 0),
  CONSTRAINT "customer_wallets_ready_time_chk"
    CHECK (("state" <> 'ready' OR "ready_at" IS NOT NULL)
       AND ("ready_at" IS NULL OR "state" in ('ready','restricted')))
);
--> statement-breakpoint
CREATE TABLE "samra_core"."customer_wallet_provider_mappings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "wallet_id" uuid NOT NULL,
  "provider" text NOT NULL,
  "provider_wallet_ref" text NOT NULL,
  "network" text NOT NULL,
  "custody_model" text NOT NULL,
  "public_address" text,
  "configuration_version" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "customer_wallet_provider_mappings_provider_chk"
    CHECK ("provider" = 'crossmint'),
  CONSTRAINT "customer_wallet_provider_mappings_ref_chk"
    CHECK (length("provider_wallet_ref") between 1 and 255),
  CONSTRAINT "customer_wallet_provider_mappings_network_chk"
    CHECK (length("network") between 1 and 64),
  CONSTRAINT "customer_wallet_provider_mappings_custody_chk"
    CHECK (length("custody_model") between 1 and 64),
  CONSTRAINT "customer_wallet_provider_mappings_address_chk"
    CHECK ("public_address" IS NULL OR length("public_address") between 1 and 255),
  CONSTRAINT "customer_wallet_provider_mappings_configuration_chk"
    CHECK (length("configuration_version") between 1 and 128)
);
--> statement-breakpoint
CREATE TABLE "samra_core"."customer_wallet_transitions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "wallet_id" uuid NOT NULL,
  "sequence" integer NOT NULL,
  "from_state" text,
  "to_state" text NOT NULL,
  "reason_family" text,
  "command_key" text NOT NULL,
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "customer_wallet_transitions_sequence_chk" CHECK ("sequence" > 0),
  CONSTRAINT "customer_wallet_transitions_state_chk"
    CHECK ("to_state" in ('created','provisioning','ready','restricted','error')),
  CONSTRAINT "customer_wallet_transitions_reason_chk"
    CHECK ("reason_family" IS NULL OR length("reason_family") between 1 and 64),
  CONSTRAINT "customer_wallet_transitions_command_chk"
    CHECK (length("command_key") between 1 and 255)
);
--> statement-breakpoint
ALTER TABLE "samra_core"."customer_wallets"
  ADD CONSTRAINT "customer_wallets_customer_id_customers_id_fk"
  FOREIGN KEY ("customer_id") REFERENCES "samra_core"."customers"("id")
  ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "samra_core"."customer_wallets"
  ADD CONSTRAINT "customer_wallets_onboarding_id_customer_onboardings_id_fk"
  FOREIGN KEY ("onboarding_id") REFERENCES "samra_core"."customer_onboardings"("id")
  ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "samra_core"."customer_wallets"
  ADD CONSTRAINT "customer_wallets_onboarding_customer_fk"
  FOREIGN KEY ("onboarding_id", "customer_id")
  REFERENCES "samra_core"."customer_onboardings"("id", "customer_id")
  ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "samra_core"."customer_wallets"
  ADD CONSTRAINT "customer_wallets_consent_customer_onboarding_fk"
  FOREIGN KEY ("wallet_consent_id", "customer_id", "onboarding_id")
  REFERENCES "samra_core"."customer_consents"("id", "customer_id", "onboarding_id")
  ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "samra_core"."customer_wallet_provider_mappings"
  ADD CONSTRAINT "customer_wallet_provider_mappings_wallet_id_fk"
  FOREIGN KEY ("wallet_id") REFERENCES "samra_core"."customer_wallets"("id")
  ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "samra_core"."customer_wallet_transitions"
  ADD CONSTRAINT "customer_wallet_transitions_wallet_id_fk"
  FOREIGN KEY ("wallet_id") REFERENCES "samra_core"."customer_wallets"("id")
  ON DELETE RESTRICT;
--> statement-breakpoint
CREATE UNIQUE INDEX "customer_wallets_external_ref_uidx"
  ON "samra_core"."customer_wallets" ("external_ref");
--> statement-breakpoint
CREATE UNIQUE INDEX "customer_wallets_customer_uidx"
  ON "samra_core"."customer_wallets" ("customer_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "customer_wallets_onboarding_uidx"
  ON "samra_core"."customer_wallets" ("onboarding_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "customer_wallets_provider_request_uidx"
  ON "samra_core"."customer_wallets" ("provider", "provider_request_key");
--> statement-breakpoint
CREATE INDEX "customer_wallets_state_updated_idx"
  ON "samra_core"."customer_wallets" ("state", "updated_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "customer_wallet_provider_mappings_wallet_uidx"
  ON "samra_core"."customer_wallet_provider_mappings" ("wallet_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "customer_wallet_provider_mappings_provider_ref_uidx"
  ON "samra_core"."customer_wallet_provider_mappings" ("provider", "provider_wallet_ref");
--> statement-breakpoint
CREATE UNIQUE INDEX "customer_wallet_transitions_sequence_uidx"
  ON "samra_core"."customer_wallet_transitions" ("wallet_id", "sequence");
--> statement-breakpoint
CREATE UNIQUE INDEX "customer_wallet_transitions_command_uidx"
  ON "samra_core"."customer_wallet_transitions" ("wallet_id", "command_key");
--> statement-breakpoint
CREATE INDEX "customer_wallet_transitions_time_idx"
  ON "samra_core"."customer_wallet_transitions" ("wallet_id", "occurred_at");
--> statement-breakpoint
CREATE FUNCTION "samra_core"."guard_customer_wallet_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'customer wallet % cannot be deleted', OLD."id"
      USING ERRCODE = '55000';
  END IF;

  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."external_ref" IS DISTINCT FROM OLD."external_ref"
    OR NEW."customer_id" IS DISTINCT FROM OLD."customer_id"
    OR NEW."onboarding_id" IS DISTINCT FROM OLD."onboarding_id"
    OR NEW."wallet_consent_id" IS DISTINCT FROM OLD."wallet_consent_id"
    OR NEW."provider" IS DISTINCT FROM OLD."provider"
    OR NEW."provider_request_key" IS DISTINCT FROM OLD."provider_request_key"
    OR NEW."creation_command_key" IS DISTINCT FROM OLD."creation_command_key"
    OR NEW."asset" IS DISTINCT FROM OLD."asset"
    OR NEW."environment" IS DISTINCT FROM OLD."environment"
    OR NEW."configuration_version" IS DISTINCT FROM OLD."configuration_version"
    OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'customer wallet % identity is immutable', OLD."id"
      USING ERRCODE = '55000';
  END IF;

  IF NEW."version" <> OLD."version" + 1 THEN
    RAISE EXCEPTION 'customer wallet % version must increment by one', OLD."id"
      USING ERRCODE = '40001';
  END IF;

  IF NEW."state" = OLD."state" OR NOT (
    (OLD."state" = 'created' AND NEW."state" IN ('provisioning','error','restricted')) OR
    (OLD."state" = 'provisioning' AND NEW."state" IN ('ready','error','restricted')) OR
    (OLD."state" = 'error' AND NEW."state" IN ('provisioning','ready','restricted')) OR
    (OLD."state" = 'ready' AND NEW."state" = 'restricted')
  ) THEN
    RAISE EXCEPTION 'invalid customer wallet transition from % to %', OLD."state", NEW."state"
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "customer_wallets_controlled_mutation"
BEFORE UPDATE OR DELETE ON "samra_core"."customer_wallets"
FOR EACH ROW EXECUTE FUNCTION "samra_core"."guard_customer_wallet_mutation"();
--> statement-breakpoint
CREATE TRIGGER "customer_wallet_provider_mappings_append_only"
BEFORE UPDATE OR DELETE ON "samra_core"."customer_wallet_provider_mappings"
FOR EACH ROW EXECUTE FUNCTION "samra_core"."guard_append_only_customer_onboarding_evidence"();
--> statement-breakpoint
CREATE TRIGGER "customer_wallet_transitions_append_only"
BEFORE UPDATE OR DELETE ON "samra_core"."customer_wallet_transitions"
FOR EACH ROW EXECUTE FUNCTION "samra_core"."guard_append_only_customer_onboarding_evidence"();
