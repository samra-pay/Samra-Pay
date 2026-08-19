CREATE TABLE "samra_core"."customer_auth_identities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "customer_id" uuid NOT NULL,
  "provider" text DEFAULT 'auth0' NOT NULL,
  "issuer" text NOT NULL,
  "subject" text NOT NULL,
  "state" text DEFAULT 'active' NOT NULL,
  "bound_at" timestamp with time zone DEFAULT now() NOT NULL,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "customer_auth_identities_provider_chk"
    CHECK ("provider" = 'auth0'),
  CONSTRAINT "customer_auth_identities_state_chk"
    CHECK ("state" in ('active','revoked')),
  CONSTRAINT "customer_auth_identities_issuer_chk"
    CHECK (length("issuer") between 9 and 2048),
  CONSTRAINT "customer_auth_identities_subject_chk"
    CHECK (length("subject") between 1 and 255),
  CONSTRAINT "customer_auth_identities_revocation_chk"
    CHECK (("state" = 'active' AND "revoked_at" IS NULL)
      OR ("state" = 'revoked' AND "revoked_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "samra_core"."customer_auth_identities"
  ADD CONSTRAINT "customer_auth_identities_customer_id_customers_id_fk"
  FOREIGN KEY ("customer_id")
  REFERENCES "samra_core"."customers"("id")
  ON DELETE RESTRICT;
--> statement-breakpoint
CREATE UNIQUE INDEX "customer_auth_identities_provider_subject_uidx"
  ON "samra_core"."customer_auth_identities"
  USING btree ("provider", "issuer", "subject");
--> statement-breakpoint
CREATE INDEX "customer_auth_identities_customer_state_idx"
  ON "samra_core"."customer_auth_identities"
  USING btree ("customer_id", "state");
--> statement-breakpoint
CREATE FUNCTION "samra_core"."guard_customer_auth_identity_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'customer authentication identity % cannot be deleted', OLD."id"
      USING ERRCODE = '55000';
  END IF;

  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."customer_id" IS DISTINCT FROM OLD."customer_id"
    OR NEW."provider" IS DISTINCT FROM OLD."provider"
    OR NEW."issuer" IS DISTINCT FROM OLD."issuer"
    OR NEW."subject" IS DISTINCT FROM OLD."subject"
    OR NEW."bound_at" IS DISTINCT FROM OLD."bound_at"
    OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'customer authentication identity % binding is immutable', OLD."id"
      USING ERRCODE = '55000';
  END IF;

  IF OLD."state" = 'revoked' THEN
    RAISE EXCEPTION 'revoked customer authentication identity % is immutable', OLD."id"
      USING ERRCODE = '55000';
  END IF;

  IF NEW."state" = 'active' AND NEW."revoked_at" IS NOT NULL THEN
    RAISE EXCEPTION 'active customer authentication identity cannot have revoked_at'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."state" = 'revoked' AND NEW."revoked_at" IS NULL THEN
    RAISE EXCEPTION 'revoked customer authentication identity requires revoked_at'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "customer_auth_identities_controlled_mutation"
BEFORE UPDATE OR DELETE ON "samra_core"."customer_auth_identities"
FOR EACH ROW EXECUTE FUNCTION "samra_core"."guard_customer_auth_identity_mutation"();
