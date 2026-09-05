ALTER TABLE "samra_core"."customer_wallets"
  DROP CONSTRAINT "customer_wallets_environment_chk";
--> statement-breakpoint
ALTER TABLE "samra_core"."customer_wallets"
  ADD CONSTRAINT "customer_wallets_environment_chk" CHECK (
    ("environment" = 'synthetic' AND "configuration_version" = 'crossmint-synthetic-v1') OR
    ("environment" = 'staging' AND "configuration_version" = 'crossmint-sandbox-evm-customer-email-v1')
  );
--> statement-breakpoint
CREATE FUNCTION "samra_core"."guard_customer_wallet_mapping_configuration"()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  wallet "samra_core"."customer_wallets"%ROWTYPE;
BEGIN
  SELECT * INTO wallet FROM "samra_core"."customer_wallets" WHERE "id" = NEW."wallet_id";
  IF NOT FOUND OR NEW."configuration_version" IS DISTINCT FROM wallet."configuration_version" THEN
    RAISE EXCEPTION 'wallet mapping configuration mismatch' USING ERRCODE = '23514';
  END IF;
  IF wallet."environment" = 'synthetic' THEN
    IF NEW."network" <> 'synthetic' OR NEW."custody_model" <> 'synthetic' OR NEW."public_address" IS NOT NULL THEN
      RAISE EXCEPTION 'synthetic wallet mapping configuration mismatch' USING ERRCODE = '23514';
    END IF;
  ELSIF wallet."environment" = 'staging' THEN
    IF NEW."network" <> 'evm' OR NEW."custody_model" <> 'smart-customer-email-recovery'
       OR NEW."public_address" IS NULL OR NEW."public_address" !~ '^0x[0-9a-f]{40}$'
       OR NEW."provider_wallet_ref" <> 'evm:' || NEW."public_address" THEN
      RAISE EXCEPTION 'sandbox wallet mapping configuration mismatch' USING ERRCODE = '23514';
    END IF;
  ELSE
    RAISE EXCEPTION 'wallet environment is not approved' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "customer_wallet_mapping_configuration_guard"
BEFORE INSERT ON "samra_core"."customer_wallet_provider_mappings"
FOR EACH ROW EXECUTE FUNCTION "samra_core"."guard_customer_wallet_mapping_configuration"();
