CREATE FUNCTION "samra_core"."guard_remittance_quote_snapshot_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF NEW."id" IS DISTINCT FROM OLD."id"
		OR NEW."external_ref" IS DISTINCT FROM OLD."external_ref"
		OR NEW."customer_id" IS DISTINCT FROM OLD."customer_id"
		OR NEW."product_account_id" IS DISTINCT FROM OLD."product_account_id"
		OR NEW."beneficiary_id" IS DISTINCT FROM OLD."beneficiary_id"
		OR NEW."source_currency" IS DISTINCT FROM OLD."source_currency"
		OR NEW."destination_currency" IS DISTINCT FROM OLD."destination_currency"
		OR NEW."source_amount_minor" IS DISTINCT FROM OLD."source_amount_minor"
		OR NEW."fee_amount_minor" IS DISTINCT FROM OLD."fee_amount_minor"
		OR NEW."total_debit_minor" IS DISTINCT FROM OLD."total_debit_minor"
		OR NEW."destination_amount_minor" IS DISTINCT FROM OLD."destination_amount_minor"
		OR NEW."fx_rate_numerator" IS DISTINCT FROM OLD."fx_rate_numerator"
		OR NEW."fx_rate_denominator" IS DISTINCT FROM OLD."fx_rate_denominator"
		OR NEW."pricing_version" IS DISTINCT FROM OLD."pricing_version"
		OR NEW."funding_method" IS DISTINCT FROM OLD."funding_method"
		OR NEW."delivery_method" IS DISTINCT FROM OLD."delivery_method"
		OR NEW."estimated_delivery" IS DISTINCT FROM OLD."estimated_delivery"
		OR NEW."expires_at" IS DISTINCT FROM OLD."expires_at"
		OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
		RAISE EXCEPTION 'remittance quote % snapshot is immutable', OLD."id"
			USING ERRCODE = '55000';
	END IF;

	RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER "remittance_quotes_snapshot_immutable"
BEFORE UPDATE ON "samra_core"."remittance_quotes"
FOR EACH ROW EXECUTE FUNCTION "samra_core"."guard_remittance_quote_snapshot_mutation"();
