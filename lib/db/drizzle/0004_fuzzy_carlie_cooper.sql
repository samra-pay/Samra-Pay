ALTER TABLE "samra_core"."beneficiaries" ADD COLUMN "city" text;--> statement-breakpoint
ALTER TABLE "samra_core"."beneficiaries" ADD COLUMN "bank_id" varchar(32);--> statement-breakpoint
ALTER TABLE "samra_core"."beneficiaries" ADD COLUMN "bank_account_number" varchar(24);--> statement-breakpoint
ALTER TABLE "samra_core"."beneficiaries" ADD COLUMN "wallet_id" varchar(32);--> statement-breakpoint
ALTER TABLE "samra_core"."beneficiaries" ADD COLUMN "wallet_phone_number" varchar(13);--> statement-breakpoint
ALTER TABLE "samra_core"."beneficiaries" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
UPDATE "samra_core"."beneficiaries"
SET "city" = CASE
      WHEN "external_ref" = 'beneficiary_wallet_001' THEN 'Hawassa'
      WHEN "external_ref" = 'beneficiary_actor_b_001' THEN 'Bahir Dar'
      ELSE 'Addis Ababa'
    END,
    "bank_id" = CASE WHEN "rail" = 'bank_account' THEN 'cbe' ELSE NULL END,
    "bank_account_number" = CASE WHEN "rail" = 'bank_account' THEN '100000006789' ELSE NULL END,
    "wallet_id" = CASE WHEN "rail" = 'mobile_wallet' THEN 'telebirr' ELSE NULL END,
    "wallet_phone_number" = CASE WHEN "rail" = 'mobile_wallet' THEN '+251911114321' ELSE NULL END;--> statement-breakpoint
ALTER TABLE "samra_core"."beneficiaries" ALTER COLUMN "city" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "samra_core"."beneficiaries" ADD CONSTRAINT "beneficiaries_delivery_details_check" CHECK ((
        ("samra_core"."beneficiaries"."rail" = 'bank_account' AND "samra_core"."beneficiaries"."bank_id" IS NOT NULL AND "samra_core"."beneficiaries"."bank_account_number" IS NOT NULL AND "samra_core"."beneficiaries"."wallet_id" IS NULL AND "samra_core"."beneficiaries"."wallet_phone_number" IS NULL)
        OR
        ("samra_core"."beneficiaries"."rail" = 'mobile_wallet' AND "samra_core"."beneficiaries"."wallet_id" IS NOT NULL AND "samra_core"."beneficiaries"."wallet_phone_number" IS NOT NULL AND "samra_core"."beneficiaries"."bank_id" IS NULL AND "samra_core"."beneficiaries"."bank_account_number" IS NULL)
      ));
