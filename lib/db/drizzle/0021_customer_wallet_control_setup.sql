LOCK TABLE
  "samra_core"."customer_wallets",
  "samra_core"."customer_onboardings",
  "samra_core"."customer_consents",
  "samra_core"."customer_wallet_provider_mappings"
IN SHARE MODE;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM "samra_core"."customer_wallets" wallet
      JOIN "samra_core"."customer_onboardings" onboarding
        ON onboarding."id" = wallet."onboarding_id"
     WHERE wallet."environment" = 'staging'
       AND wallet."state" = 'ready'
       AND onboarding."state" <> 'wallet_ready'
  ) THEN
    RAISE EXCEPTION 'staging ready wallet has incompatible onboarding state; reconcile before migration'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM "samra_core"."customer_wallets" wallet
     WHERE wallet."environment" = 'staging'
       AND wallet."state" = 'ready'
       AND NOT EXISTS (
         SELECT 1
           FROM "samra_core"."customer_consents" consent
          WHERE consent."id" = wallet."wallet_consent_id"
            AND consent."customer_id" = wallet."customer_id"
            AND consent."onboarding_id" = wallet."onboarding_id"
            AND consent."consent_type" = 'wallet_provisioning'
            AND consent."bundle_version" = 'sandbox-customer-wallet-v1'
            AND consent."document_version" = 'sandbox-customer-wallet-v1'
            AND consent."locale" = 'en-US'
            AND consent."decision" = 'accepted'
       )
  ) THEN
    RAISE EXCEPTION 'staging ready wallet does not reference the exact sandbox wallet consent; reconcile before migration'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM "samra_core"."customer_wallets" wallet
     WHERE wallet."environment" = 'staging'
       AND wallet."state" = 'ready'
       AND (
         (SELECT count(*)
            FROM "samra_core"."customer_wallet_provider_mappings" mapping
           WHERE mapping."wallet_id" = wallet."id") <> 1
         OR
         (SELECT count(*)
            FROM "samra_core"."customer_wallet_provider_mappings" mapping
           WHERE mapping."wallet_id" = wallet."id"
             AND mapping."provider" = wallet."provider"
             AND mapping."configuration_version" = wallet."configuration_version"
             AND mapping."network" = 'evm'
             AND mapping."custody_model" = 'smart-customer-email-recovery'
             AND mapping."public_address" ~ '^0x[0-9a-f]{40}$'
             AND mapping."provider_wallet_ref" = 'evm:' || mapping."public_address") <> 1
       )
  ) THEN
    RAISE EXCEPTION 'staging ready wallet does not have exactly one valid provider mapping; reconcile before migration'
      USING ERRCODE = '23514';
  END IF;
END;
$$;
--> statement-breakpoint
ALTER TABLE "samra_core"."customer_wallets"
  DROP CONSTRAINT "customer_wallets_state_chk",
  DROP CONSTRAINT "customer_wallets_ready_time_chk";
--> statement-breakpoint
ALTER TABLE "samra_core"."customer_wallet_transitions"
  DROP CONSTRAINT "customer_wallet_transitions_state_chk";
--> statement-breakpoint
ALTER TABLE "samra_core"."customer_onboardings"
  DROP CONSTRAINT "customer_onboardings_state_chk";
--> statement-breakpoint
DROP TRIGGER "customer_wallets_controlled_mutation"
  ON "samra_core"."customer_wallets";
--> statement-breakpoint
DROP TRIGGER "customer_onboardings_controlled_mutation"
  ON "samra_core"."customer_onboardings";
--> statement-breakpoint
INSERT INTO "samra_core"."customer_wallet_transitions"
  ("wallet_id", "sequence", "from_state", "to_state", "reason_family", "command_key")
SELECT wallet."id", wallet."version" + 1, 'ready', 'customer_control_setup',
       NULL, 'migration:0021:customer-control-setup'
  FROM "samra_core"."customer_wallets" wallet
 WHERE wallet."environment" = 'staging'
   AND wallet."state" = 'ready';
--> statement-breakpoint
INSERT INTO "samra_core"."customer_onboarding_transitions"
  ("onboarding_id", "sequence", "from_state", "to_state", "reason_family", "command_key")
SELECT onboarding."id", onboarding."version" + 1, 'wallet_ready',
       'wallet_control_setup', NULL, 'migration:0021:wallet-control-setup'
  FROM "samra_core"."customer_onboardings" onboarding
  JOIN "samra_core"."customer_wallets" wallet
    ON wallet."onboarding_id" = onboarding."id"
 WHERE wallet."environment" = 'staging'
   AND wallet."state" = 'ready'
   AND onboarding."state" = 'wallet_ready';
--> statement-breakpoint
UPDATE "samra_core"."customer_wallets"
   SET "state" = 'customer_control_setup',
       "reason_family" = NULL,
       "version" = "version" + 1,
       "ready_at" = NULL,
       "updated_at" = now()
 WHERE "environment" = 'staging'
   AND "state" = 'ready';
--> statement-breakpoint
UPDATE "samra_core"."customer_onboardings" onboarding
   SET "state" = 'wallet_control_setup',
       "latest_completed_step" = 'wallet_created',
       "reason_family" = NULL,
       "version" = onboarding."version" + 1,
       "entered_at" = now(),
       "updated_at" = now()
  FROM "samra_core"."customer_wallets" wallet
 WHERE wallet."onboarding_id" = onboarding."id"
   AND wallet."environment" = 'staging'
   AND wallet."state" = 'customer_control_setup'
   AND onboarding."state" = 'wallet_ready';
--> statement-breakpoint
INSERT INTO "samra_core"."audit_events"
  ("event_key", "actor_type", "actor_id", "action", "entity_type", "entity_id", "metadata")
SELECT 'customer-wallet:' || wallet."id"::text || ':version:' || wallet."version"::text,
       'system', 'database-migration',
       'customer_wallet_customer_control_setup_required',
       'customer_wallet', wallet."id"::text,
       jsonb_build_object(
         'source', 'migration_0021',
         'priorState', 'ready',
         'resultingState', 'customer_control_setup',
         'customerControlSetupRequired', true
       )
  FROM "samra_core"."customer_wallets" wallet
 WHERE wallet."environment" = 'staging'
   AND wallet."state" = 'customer_control_setup'
   AND EXISTS (
     SELECT 1
       FROM "samra_core"."customer_wallet_transitions" transition
      WHERE transition."wallet_id" = wallet."id"
        AND transition."sequence" = wallet."version"
        AND transition."command_key" = 'migration:0021:customer-control-setup'
   );
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "samra_core"."guard_customer_wallet_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'customer wallet % cannot be deleted', OLD."id"
      USING ERRCODE = '55000';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW."state" <> 'created' THEN
      RAISE EXCEPTION 'customer wallet must be inserted in created state'
        USING ERRCODE = '23514';
    END IF;

    IF (
      SELECT count(DISTINCT consent."consent_type")
        FROM "samra_core"."customer_consents" consent
       WHERE consent."customer_id" = NEW."customer_id"
         AND consent."onboarding_id" = NEW."onboarding_id"
         AND consent."consent_type" IN
             ('terms_of_service','privacy_notice','electronic_communications')
         AND consent."bundle_version" = 'alpha-non-production-v2'
         AND consent."document_version" = 'alpha-non-production-v2'
         AND consent."locale" = 'en-US'
         AND consent."decision" = 'accepted'
    ) <> 3 THEN
      RAISE EXCEPTION 'customer wallet creation requires the current onboarding consent bundle'
        USING ERRCODE = '23514';
    END IF;

    IF NOT EXISTS (
      SELECT 1
        FROM "samra_core"."customer_consents" consent
       WHERE consent."id" = NEW."wallet_consent_id"
         AND consent."customer_id" = NEW."customer_id"
         AND consent."onboarding_id" = NEW."onboarding_id"
         AND consent."consent_type" = 'wallet_provisioning'
         AND consent."bundle_version" = CASE
               WHEN NEW."environment" = 'synthetic'
                 THEN 'alpha-wallet-non-production-v2'
               ELSE 'sandbox-customer-wallet-v2'
             END
         AND consent."document_version" = CASE
               WHEN NEW."environment" = 'synthetic'
                 THEN 'alpha-wallet-non-production-v2'
               ELSE 'sandbox-customer-wallet-v2'
             END
         AND consent."locale" = 'en-US'
         AND consent."decision" = 'accepted'
    ) THEN
      RAISE EXCEPTION 'customer wallet creation requires the exact current wallet disclosure'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
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

  IF NEW."state" IN ('customer_control_setup','ready') AND (
    SELECT count(DISTINCT consent."consent_type")
      FROM "samra_core"."customer_consents" consent
     WHERE consent."customer_id" = OLD."customer_id"
       AND consent."onboarding_id" = OLD."onboarding_id"
       AND consent."consent_type" IN
           ('terms_of_service','privacy_notice','electronic_communications')
       AND consent."bundle_version" = 'alpha-non-production-v2'
       AND consent."document_version" = 'alpha-non-production-v2'
       AND consent."locale" = 'en-US'
       AND consent."decision" = 'accepted'
  ) <> 3 THEN
    RAISE EXCEPTION 'wallet capability transitions require the current onboarding consent bundle'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."state" IN ('customer_control_setup','ready') AND NOT EXISTS (
    SELECT 1
      FROM "samra_core"."customer_consents" consent
     WHERE consent."customer_id" = OLD."customer_id"
       AND consent."onboarding_id" = OLD."onboarding_id"
       AND consent."consent_type" = 'wallet_provisioning'
       AND consent."bundle_version" = CASE
             WHEN OLD."environment" = 'synthetic'
               THEN 'alpha-wallet-non-production-v2'
             ELSE 'sandbox-customer-wallet-v2'
           END
       AND consent."document_version" = CASE
             WHEN OLD."environment" = 'synthetic'
               THEN 'alpha-wallet-non-production-v2'
             ELSE 'sandbox-customer-wallet-v2'
           END
       AND consent."locale" = 'en-US'
       AND consent."decision" = 'accepted'
  ) THEN
    RAISE EXCEPTION 'wallet capability transitions require the exact current wallet disclosure'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."state" = 'customer_control_setup' AND NOT EXISTS (
    SELECT 1
      FROM "samra_core"."customer_wallet_provider_mappings" mapping
     WHERE mapping."wallet_id" = OLD."id"
       AND OLD."environment" = 'staging'
       AND mapping."provider" = OLD."provider"
       AND mapping."configuration_version" = OLD."configuration_version"
       AND mapping."network" = 'evm'
       AND mapping."custody_model" = 'smart-customer-email-recovery'
       AND mapping."public_address" ~ '^0x[0-9a-f]{40}$'
       AND mapping."provider_wallet_ref" = 'evm:' || mapping."public_address"
  ) THEN
    RAISE EXCEPTION 'customer control setup requires a valid staging wallet mapping'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."state" = 'ready' AND NOT EXISTS (
    SELECT 1
      FROM "samra_core"."customer_wallet_provider_mappings" mapping
     WHERE mapping."wallet_id" = OLD."id"
       AND OLD."environment" = 'synthetic'
       AND mapping."provider" = OLD."provider"
       AND mapping."configuration_version" = OLD."configuration_version"
       AND mapping."network" = 'synthetic'
       AND mapping."custody_model" = 'synthetic'
       AND mapping."public_address" IS NULL
  ) THEN
    RAISE EXCEPTION 'wallet readiness requires a valid synthetic wallet mapping'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."state" = OLD."state" OR NOT (
    (OLD."state" = 'created' AND NEW."state" IN ('provisioning','error','restricted')) OR
    (OLD."state" = 'provisioning' AND NEW."state" IN ('error','restricted')) OR
    (OLD."state" = 'provisioning' AND OLD."environment" = 'synthetic' AND NEW."state" = 'ready') OR
    (OLD."state" = 'provisioning' AND OLD."environment" = 'staging' AND NEW."state" = 'customer_control_setup') OR
    (OLD."state" = 'error' AND NEW."state" IN ('provisioning','restricted')) OR
    (OLD."state" = 'error' AND OLD."environment" = 'synthetic' AND NEW."state" = 'ready') OR
    (OLD."state" = 'error' AND OLD."environment" = 'staging' AND NEW."state" = 'customer_control_setup') OR
    (OLD."state" = 'customer_control_setup' AND OLD."environment" = 'staging' AND NEW."state" = 'restricted') OR
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
BEFORE INSERT OR UPDATE OR DELETE ON "samra_core"."customer_wallets"
FOR EACH ROW EXECUTE FUNCTION "samra_core"."guard_customer_wallet_mutation"();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "samra_core"."guard_customer_onboarding_mutation"()
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

  IF OLD."state" = 'wallet_provisioning'
    AND NEW."state" = 'wallet_control_setup'
    AND NOT EXISTS (
      SELECT 1
        FROM "samra_core"."customer_wallets" wallet
       WHERE wallet."onboarding_id" = OLD."id"
         AND wallet."customer_id" = OLD."customer_id"
         AND wallet."environment" = 'staging'
         AND wallet."state" = 'customer_control_setup'
    ) THEN
    RAISE EXCEPTION 'wallet control setup requires a matching staging wallet state'
      USING ERRCODE = '23514';
  END IF;

  IF OLD."state" = 'wallet_provisioning'
    AND NEW."state" = 'wallet_ready'
    AND NOT EXISTS (
      SELECT 1
        FROM "samra_core"."customer_wallets" wallet
       WHERE wallet."onboarding_id" = OLD."id"
         AND wallet."customer_id" = OLD."customer_id"
         AND wallet."environment" = 'synthetic'
         AND wallet."state" = 'ready'
    ) THEN
    RAISE EXCEPTION 'wallet-ready onboarding requires a matching synthetic wallet state'
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
    (OLD."state" = 'wallet_provisioning' AND NEW."state" IN ('wallet_control_setup','wallet_ready','restricted')) OR
    (OLD."state" = 'wallet_control_setup' AND NEW."state" = 'restricted') OR
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
ALTER TABLE "samra_core"."customer_wallets"
  ADD CONSTRAINT "customer_wallets_state_chk"
    CHECK ("state" in ('created','provisioning','customer_control_setup','ready','restricted','error')),
  ADD CONSTRAINT "customer_wallets_customer_control_setup_chk"
    CHECK ("state" <> 'customer_control_setup' OR "environment" = 'staging'),
  ADD CONSTRAINT "customer_wallets_ready_time_chk"
    CHECK (("state" <> 'ready' OR "ready_at" IS NOT NULL)
       AND ("ready_at" IS NULL OR "state" in ('ready','restricted')));
--> statement-breakpoint
ALTER TABLE "samra_core"."customer_wallet_transitions"
  ADD CONSTRAINT "customer_wallet_transitions_state_chk"
    CHECK ("to_state" in ('created','provisioning','customer_control_setup','ready','restricted','error'));
--> statement-breakpoint
ALTER TABLE "samra_core"."customer_onboardings"
  ADD CONSTRAINT "customer_onboardings_state_chk"
    CHECK ("state" in ('not_started','authenticated','consent_pending','identity_in_progress','identity_review','identity_approved','bank_link_pending','bank_matched','wallet_consent_pending','wallet_provisioning','wallet_control_setup','wallet_ready','funding_ready','activated','restricted'));
