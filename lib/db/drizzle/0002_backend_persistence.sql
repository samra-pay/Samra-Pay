ALTER TABLE "samra_core"."remittance_quotes"
  ADD COLUMN "external_ref" text NOT NULL,
  ADD COLUMN "funding_method" text DEFAULT 'samra_balance' NOT NULL,
  ADD COLUMN "delivery_method" text DEFAULT 'bank' NOT NULL,
  ADD COLUMN "estimated_delivery" text DEFAULT 'Same day' NOT NULL;
--> statement-breakpoint
ALTER TABLE "samra_core"."remittance_transfers"
  ADD COLUMN "demo_scenario" text DEFAULT 'HAPPY_PATH' NOT NULL;
--> statement-breakpoint
ALTER TABLE "samra_core"."ledger_holds"
  ADD COLUMN "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "samra_core"."reconciliation_runs"
  ADD COLUMN "external_ref" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "samra_core"."audit_events"
  ADD COLUMN "event_key" text NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "remittance_quotes_external_ref_uidx"
  ON "samra_core"."remittance_quotes" USING btree ("external_ref");
--> statement-breakpoint
CREATE UNIQUE INDEX "reconciliation_runs_external_ref_uidx"
  ON "samra_core"."reconciliation_runs" USING btree ("external_ref");
--> statement-breakpoint
CREATE UNIQUE INDEX "audit_events_event_key_uidx"
  ON "samra_core"."audit_events" USING btree ("event_key");
--> statement-breakpoint
ALTER TABLE "samra_core"."remittance_quotes"
  ADD CONSTRAINT "remittance_quotes_funding_method_chk"
  CHECK ("funding_method" = 'samra_balance');
--> statement-breakpoint
ALTER TABLE "samra_core"."remittance_quotes"
  ADD CONSTRAINT "remittance_quotes_delivery_method_chk"
  CHECK ("delivery_method" IN ('bank', 'wallet'));
--> statement-breakpoint
ALTER TABLE "samra_core"."remittance_transfers"
  ADD CONSTRAINT "remittance_transfers_demo_scenario_chk"
  CHECK ("demo_scenario" IN (
    'HAPPY_PATH',
    'CALIZA_REJECTION',
    'CHAPA_FAILURE',
    'SETTLEMENT_REFUND',
    'TIMEOUT_RETRY',
    'DUPLICATE_EVENT',
    'OUT_OF_ORDER_EVENT',
    'RECONCILIATION_AMOUNT_MISMATCH',
    'MISSING_REPORT_LINE'
  ));
--> statement-breakpoint
CREATE TABLE "samra_core"."provider_command_attempts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "command_key" text NOT NULL,
  "provider" "samra_core"."provider_name" NOT NULL,
  "command_type" text NOT NULL,
  "transfer_id" uuid NOT NULL,
  "state" text DEFAULT 'succeeded' NOT NULL,
  "attempt_count" integer DEFAULT 1 NOT NULL,
  "request" jsonb NOT NULL,
  "response" jsonb,
  "last_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "provider_command_attempts_transfer_fk"
    FOREIGN KEY ("transfer_id")
    REFERENCES "samra_core"."remittance_transfers"("id")
    ON DELETE RESTRICT,
  CONSTRAINT "provider_command_attempts_count_positive_chk"
    CHECK ("attempt_count" > 0),
  CONSTRAINT "provider_command_attempts_state_chk"
    CHECK ("state" IN ('pending', 'succeeded', 'failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "provider_command_attempts_key_uidx"
  ON "samra_core"."provider_command_attempts" USING btree ("command_key");
--> statement-breakpoint
CREATE INDEX "provider_command_attempts_transfer_idx"
  ON "samra_core"."provider_command_attempts" USING btree ("transfer_id");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "samra_core"."validate_posted_journal"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  posting_count integer;
  debit_total numeric;
  credit_total numeric;
  currency_mismatch_count integer;
BEGIN
  IF NEW."state" IN ('posted', 'reversed')
     AND (TG_OP = 'INSERT' OR OLD."state" IS DISTINCT FROM NEW."state") THEN
    SELECT
      count(*),
      COALESCE(sum(CASE WHEN p."side" = 'debit' THEN p."amount_minor" ELSE 0 END), 0),
      COALESCE(sum(CASE WHEN p."side" = 'credit' THEN p."amount_minor" ELSE 0 END), 0),
      count(*) FILTER (WHERE a."currency" <> NEW."currency")
    INTO posting_count, debit_total, credit_total, currency_mismatch_count
    FROM "samra_core"."ledger_postings" p
    JOIN "samra_core"."ledger_accounts" a ON a."id" = p."account_id"
    WHERE p."journal_id" = NEW."id";

    IF posting_count < 2 OR debit_total <> credit_total THEN
      RAISE EXCEPTION 'ledger journal % is not balanced', NEW."id"
        USING ERRCODE = '23514';
    END IF;
    IF currency_mismatch_count > 0 THEN
      RAISE EXCEPTION 'ledger journal % contains a currency mismatch', NEW."id"
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "ledger_journals_validate_posted_trg"
  BEFORE INSERT OR UPDATE OF "state"
  ON "samra_core"."ledger_journals"
  FOR EACH ROW
  EXECUTE FUNCTION "samra_core"."validate_posted_journal"();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "samra_core"."validate_spendable_hold"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  ledger_product_account_id uuid;
  ledger_currency "samra_core"."currency_code";
  ledger_class "samra_core"."ledger_account_class";
  product_kind "samra_core"."product_account_kind";
  product_state "samra_core"."record_state";
BEGIN
  SELECT
    la."product_account_id",
    la."currency",
    la."account_class",
    pa."kind",
    pa."state"
  INTO
    ledger_product_account_id,
    ledger_currency,
    ledger_class,
    product_kind,
    product_state
  FROM "samra_core"."ledger_accounts" la
  LEFT JOIN "samra_core"."product_accounts" pa
    ON pa."id" = la."product_account_id"
  WHERE la."id" = NEW."ledger_account_id";

  IF ledger_product_account_id IS NULL
     OR ledger_product_account_id <> NEW."product_account_id"
     OR ledger_currency <> NEW."currency"
     OR ledger_class <> 'liability'
     OR product_kind NOT IN ('domestic_cash', 'remittance')
     OR product_state <> 'active' THEN
    RAISE EXCEPTION 'hold must target an active spendable product liability account'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "ledger_holds_validate_spendable_trg"
  BEFORE INSERT OR UPDATE OF "product_account_id", "ledger_account_id", "currency"
  ON "samra_core"."ledger_holds"
  FOR EACH ROW
  EXECUTE FUNCTION "samra_core"."validate_spendable_hold"();
