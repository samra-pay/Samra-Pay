CREATE SCHEMA "samra_core";
--> statement-breakpoint
CREATE TYPE "samra_core"."audit_actor_type" AS ENUM('system', 'customer', 'operator', 'provider');--> statement-breakpoint
CREATE TYPE "samra_core"."beneficiary_rail" AS ENUM('bank_account', 'mobile_wallet');--> statement-breakpoint
CREATE TYPE "samra_core"."currency_code" AS ENUM('USD', 'ETB');--> statement-breakpoint
CREATE TYPE "samra_core"."customer_state" AS ENUM('active', 'suspended', 'closed');--> statement-breakpoint
CREATE TYPE "samra_core"."idempotency_state" AS ENUM('in_progress', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "samra_core"."ledger_account_class" AS ENUM('asset', 'liability', 'equity', 'revenue', 'expense');--> statement-breakpoint
CREATE TYPE "samra_core"."ledger_entry_side" AS ENUM('debit', 'credit');--> statement-breakpoint
CREATE TYPE "samra_core"."ledger_hold_event_type" AS ENUM('created', 'captured', 'released', 'expired');--> statement-breakpoint
CREATE TYPE "samra_core"."ledger_hold_state" AS ENUM('active', 'captured', 'released', 'expired');--> statement-breakpoint
CREATE TYPE "samra_core"."ledger_journal_state" AS ENUM('draft', 'posted', 'reversed');--> statement-breakpoint
CREATE TYPE "samra_core"."outbox_event_state" AS ENUM('pending', 'processing', 'published', 'failed');--> statement-breakpoint
CREATE TYPE "samra_core"."product_account_kind" AS ENUM('domestic_cash', 'remittance');--> statement-breakpoint
CREATE TYPE "samra_core"."provider_event_state" AS ENUM('received', 'deferred', 'processed', 'ignored', 'failed');--> statement-breakpoint
CREATE TYPE "samra_core"."provider_name" AS ENUM('rain', 'caliza', 'chapa');--> statement-breakpoint
CREATE TYPE "samra_core"."provider_report_state" AS ENUM('received', 'parsed', 'failed');--> statement-breakpoint
CREATE TYPE "samra_core"."reconciliation_exception_state" AS ENUM('open', 'in_review', 'resolved', 'ignored');--> statement-breakpoint
CREATE TYPE "samra_core"."reconciliation_result" AS ENUM('matched', 'missing_internal', 'missing_provider', 'amount_mismatch', 'status_mismatch', 'currency_mismatch');--> statement-breakpoint
CREATE TYPE "samra_core"."reconciliation_run_state" AS ENUM('pending', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "samra_core"."record_state" AS ENUM('active', 'disabled', 'closed');--> statement-breakpoint
CREATE TYPE "samra_core"."remittance_quote_state" AS ENUM('active', 'accepted', 'expired', 'cancelled');--> statement-breakpoint
CREATE TYPE "samra_core"."remittance_transfer_state" AS ENUM('created', 'funds_reserved', 'submitted', 'in_transit', 'payout_pending', 'completed', 'failed', 'cancelled', 'refund_pending', 'refunded', 'reversal_pending', 'reversed');--> statement-breakpoint
CREATE TABLE "samra_core"."audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_type" "samra_core"."audit_actor_type" NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"correlation_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "samra_core"."idempotency_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"state" "samra_core"."idempotency_state" DEFAULT 'in_progress' NOT NULL,
	"resource_type" text,
	"resource_id" uuid,
	"response_status" integer,
	"response_body" jsonb,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "idempotency_records_response_status_chk" CHECK ("samra_core"."idempotency_records"."response_status" is null or ("samra_core"."idempotency_records"."response_status" between 100 and 599))
);
--> statement-breakpoint
CREATE TABLE "samra_core"."ledger_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"account_class" "samra_core"."ledger_account_class" NOT NULL,
	"normal_side" "samra_core"."ledger_entry_side" NOT NULL,
	"currency" "samra_core"."currency_code" NOT NULL,
	"product_account_id" uuid,
	"allow_negative_available" boolean DEFAULT false NOT NULL,
	"state" "samra_core"."record_state" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "samra_core"."ledger_hold_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hold_id" uuid NOT NULL,
	"event_type" "samra_core"."ledger_hold_event_type" NOT NULL,
	"journal_id" uuid,
	"reason" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "samra_core"."ledger_holds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_event_type" text NOT NULL,
	"business_event_id" text NOT NULL,
	"product_account_id" uuid NOT NULL,
	"ledger_account_id" uuid NOT NULL,
	"currency" "samra_core"."currency_code" NOT NULL,
	"amount_minor" bigint NOT NULL,
	"state" "samra_core"."ledger_hold_state" DEFAULT 'active' NOT NULL,
	"expires_at" timestamp with time zone,
	"terminal_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_holds_amount_positive_chk" CHECK ("samra_core"."ledger_holds"."amount_minor" > 0),
	CONSTRAINT "ledger_holds_terminal_state_chk" CHECK (("samra_core"."ledger_holds"."state" = 'active' and "samra_core"."ledger_holds"."terminal_at" is null) or ("samra_core"."ledger_holds"."state" <> 'active' and "samra_core"."ledger_holds"."terminal_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "samra_core"."ledger_journals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_event_type" text NOT NULL,
	"business_event_id" text NOT NULL,
	"currency" "samra_core"."currency_code" NOT NULL,
	"state" "samra_core"."ledger_journal_state" DEFAULT 'draft' NOT NULL,
	"description" text NOT NULL,
	"reverses_journal_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"posted_at" timestamp with time zone,
	CONSTRAINT "ledger_journals_posted_at_state_chk" CHECK (("samra_core"."ledger_journals"."state" = 'draft' and "samra_core"."ledger_journals"."posted_at" is null) or ("samra_core"."ledger_journals"."state" in ('posted', 'reversed') and "samra_core"."ledger_journals"."posted_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "samra_core"."ledger_postings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"journal_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"side" "samra_core"."ledger_entry_side" NOT NULL,
	"amount_minor" bigint NOT NULL,
	"memo" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_postings_amount_positive_chk" CHECK ("samra_core"."ledger_postings"."amount_minor" > 0),
	CONSTRAINT "ledger_postings_sequence_positive_chk" CHECK ("samra_core"."ledger_postings"."sequence" > 0)
);
--> statement-breakpoint
CREATE TABLE "samra_core"."beneficiaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"external_ref" text NOT NULL,
	"display_name" text NOT NULL,
	"country_code" varchar(2) NOT NULL,
	"rail" "samra_core"."beneficiary_rail" NOT NULL,
	"payout_reference" text NOT NULL,
	"provider_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"state" "samra_core"."record_state" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "samra_core"."customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_ref" text NOT NULL,
	"display_name" text NOT NULL,
	"country_code" varchar(2) NOT NULL,
	"state" "samra_core"."customer_state" DEFAULT 'active' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "samra_core"."product_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"external_ref" text NOT NULL,
	"kind" "samra_core"."product_account_kind" NOT NULL,
	"currency" "samra_core"."currency_code" NOT NULL,
	"state" "samra_core"."record_state" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "samra_core"."provider_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" "samra_core"."provider_name" NOT NULL,
	"provider_report_id" text NOT NULL,
	"report_type" text NOT NULL,
	"report_date" date NOT NULL,
	"checksum" text NOT NULL,
	"storage_reference" text,
	"state" "samra_core"."provider_report_state" DEFAULT 'received' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"parsed_at" timestamp with time zone,
	"failure_reason" text
);
--> statement-breakpoint
CREATE TABLE "samra_core"."reconciliation_exceptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"exception_code" text NOT NULL,
	"state" "samra_core"."reconciliation_exception_state" DEFAULT 'open' NOT NULL,
	"summary" text NOT NULL,
	"resolution_note" text,
	"assigned_to" text,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reconciliation_exceptions_resolution_state_chk" CHECK (("samra_core"."reconciliation_exceptions"."state" in ('resolved', 'ignored') and "samra_core"."reconciliation_exceptions"."resolved_at" is not null) or ("samra_core"."reconciliation_exceptions"."state" in ('open', 'in_review') and "samra_core"."reconciliation_exceptions"."resolved_at" is null))
);
--> statement-breakpoint
CREATE TABLE "samra_core"."reconciliation_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"match_key" text NOT NULL,
	"result" "samra_core"."reconciliation_result" NOT NULL,
	"internal_resource_type" text,
	"internal_resource_id" uuid,
	"provider_resource_id" text,
	"internal_currency" "samra_core"."currency_code",
	"provider_currency" "samra_core"."currency_code",
	"internal_amount_minor" bigint,
	"provider_amount_minor" bigint,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reconciliation_items_internal_amount_nonnegative_chk" CHECK ("samra_core"."reconciliation_items"."internal_amount_minor" is null or "samra_core"."reconciliation_items"."internal_amount_minor" >= 0),
	CONSTRAINT "reconciliation_items_provider_amount_nonnegative_chk" CHECK ("samra_core"."reconciliation_items"."provider_amount_minor" is null or "samra_core"."reconciliation_items"."provider_amount_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "samra_core"."reconciliation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" "samra_core"."provider_name" NOT NULL,
	"provider_report_id" uuid,
	"state" "samra_core"."reconciliation_run_state" DEFAULT 'pending' NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"matched_count" integer DEFAULT 0 NOT NULL,
	"exception_count" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reconciliation_runs_period_chk" CHECK ("samra_core"."reconciliation_runs"."period_end" > "samra_core"."reconciliation_runs"."period_start"),
	CONSTRAINT "reconciliation_runs_counts_nonnegative_chk" CHECK ("samra_core"."reconciliation_runs"."matched_count" >= 0 and "samra_core"."reconciliation_runs"."exception_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "samra_core"."outbox_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_key" text NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"state" "samra_core"."outbox_event_state" DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbox_events_attempt_count_nonnegative_chk" CHECK ("samra_core"."outbox_events"."attempt_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "samra_core"."provider_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" "samra_core"."provider_name" NOT NULL,
	"provider_event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"state" "samra_core"."provider_event_state" DEFAULT 'received' NOT NULL,
	"payload" jsonb NOT NULL,
	"related_resource_type" text,
	"related_resource_id" uuid,
	"occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	CONSTRAINT "provider_events_attempt_count_nonnegative_chk" CHECK ("samra_core"."provider_events"."attempt_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "samra_core"."provider_resource_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" "samra_core"."provider_name" NOT NULL,
	"resource_type" text NOT NULL,
	"internal_resource_id" uuid NOT NULL,
	"provider_resource_id" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "samra_core"."remittance_quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"product_account_id" uuid NOT NULL,
	"beneficiary_id" uuid NOT NULL,
	"source_currency" "samra_core"."currency_code" NOT NULL,
	"destination_currency" "samra_core"."currency_code" NOT NULL,
	"source_amount_minor" bigint NOT NULL,
	"fee_amount_minor" bigint NOT NULL,
	"total_debit_minor" bigint NOT NULL,
	"destination_amount_minor" bigint NOT NULL,
	"fx_rate_numerator" bigint NOT NULL,
	"fx_rate_denominator" bigint NOT NULL,
	"state" "samra_core"."remittance_quote_state" DEFAULT 'active' NOT NULL,
	"pricing_version" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "remittance_quotes_source_amount_positive_chk" CHECK ("samra_core"."remittance_quotes"."source_amount_minor" > 0),
	CONSTRAINT "remittance_quotes_fee_amount_nonnegative_chk" CHECK ("samra_core"."remittance_quotes"."fee_amount_minor" >= 0),
	CONSTRAINT "remittance_quotes_total_debit_chk" CHECK ("samra_core"."remittance_quotes"."total_debit_minor" = "samra_core"."remittance_quotes"."source_amount_minor" + "samra_core"."remittance_quotes"."fee_amount_minor"),
	CONSTRAINT "remittance_quotes_destination_amount_positive_chk" CHECK ("samra_core"."remittance_quotes"."destination_amount_minor" > 0),
	CONSTRAINT "remittance_quotes_rate_positive_chk" CHECK ("samra_core"."remittance_quotes"."fx_rate_numerator" > 0 and "samra_core"."remittance_quotes"."fx_rate_denominator" > 0),
	CONSTRAINT "remittance_quotes_currency_pair_chk" CHECK ("samra_core"."remittance_quotes"."source_currency" <> "samra_core"."remittance_quotes"."destination_currency")
);
--> statement-breakpoint
CREATE TABLE "samra_core"."remittance_transfer_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transfer_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"from_state" "samra_core"."remittance_transfer_state",
	"to_state" "samra_core"."remittance_transfer_state" NOT NULL,
	"reason" text,
	"provider_event_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "remittance_transfer_status_history_sequence_positive_chk" CHECK ("samra_core"."remittance_transfer_status_history"."sequence" > 0),
	CONSTRAINT "remittance_transfer_status_history_change_chk" CHECK ("samra_core"."remittance_transfer_status_history"."from_state" is null or "samra_core"."remittance_transfer_status_history"."from_state" <> "samra_core"."remittance_transfer_status_history"."to_state")
);
--> statement-breakpoint
CREATE TABLE "samra_core"."remittance_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_ref" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"product_account_id" uuid NOT NULL,
	"beneficiary_id" uuid NOT NULL,
	"quote_id" uuid NOT NULL,
	"hold_id" uuid,
	"state" "samra_core"."remittance_transfer_state" DEFAULT 'created' NOT NULL,
	"source_currency" "samra_core"."currency_code" NOT NULL,
	"destination_currency" "samra_core"."currency_code" NOT NULL,
	"source_amount_minor" bigint NOT NULL,
	"fee_amount_minor" bigint NOT NULL,
	"total_debit_minor" bigint NOT NULL,
	"destination_amount_minor" bigint NOT NULL,
	"failure_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "remittance_transfers_source_amount_positive_chk" CHECK ("samra_core"."remittance_transfers"."source_amount_minor" > 0),
	CONSTRAINT "remittance_transfers_fee_amount_nonnegative_chk" CHECK ("samra_core"."remittance_transfers"."fee_amount_minor" >= 0),
	CONSTRAINT "remittance_transfers_total_debit_chk" CHECK ("samra_core"."remittance_transfers"."total_debit_minor" = "samra_core"."remittance_transfers"."source_amount_minor" + "samra_core"."remittance_transfers"."fee_amount_minor"),
	CONSTRAINT "remittance_transfers_destination_amount_positive_chk" CHECK ("samra_core"."remittance_transfers"."destination_amount_minor" > 0),
	CONSTRAINT "remittance_transfers_currency_pair_chk" CHECK ("samra_core"."remittance_transfers"."source_currency" <> "samra_core"."remittance_transfers"."destination_currency")
);
--> statement-breakpoint
ALTER TABLE "samra_core"."ledger_accounts" ADD CONSTRAINT "ledger_accounts_product_account_id_product_accounts_id_fk" FOREIGN KEY ("product_account_id") REFERENCES "samra_core"."product_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "samra_core"."ledger_hold_events" ADD CONSTRAINT "ledger_hold_events_hold_id_ledger_holds_id_fk" FOREIGN KEY ("hold_id") REFERENCES "samra_core"."ledger_holds"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "samra_core"."ledger_hold_events" ADD CONSTRAINT "ledger_hold_events_journal_id_ledger_journals_id_fk" FOREIGN KEY ("journal_id") REFERENCES "samra_core"."ledger_journals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "samra_core"."ledger_holds" ADD CONSTRAINT "ledger_holds_product_account_id_product_accounts_id_fk" FOREIGN KEY ("product_account_id") REFERENCES "samra_core"."product_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "samra_core"."ledger_holds" ADD CONSTRAINT "ledger_holds_ledger_account_id_ledger_accounts_id_fk" FOREIGN KEY ("ledger_account_id") REFERENCES "samra_core"."ledger_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "samra_core"."ledger_journals" ADD CONSTRAINT "ledger_journals_reverses_journal_id_ledger_journals_id_fk" FOREIGN KEY ("reverses_journal_id") REFERENCES "samra_core"."ledger_journals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "samra_core"."ledger_postings" ADD CONSTRAINT "ledger_postings_journal_id_ledger_journals_id_fk" FOREIGN KEY ("journal_id") REFERENCES "samra_core"."ledger_journals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "samra_core"."ledger_postings" ADD CONSTRAINT "ledger_postings_account_id_ledger_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "samra_core"."ledger_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "samra_core"."beneficiaries" ADD CONSTRAINT "beneficiaries_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "samra_core"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "samra_core"."product_accounts" ADD CONSTRAINT "product_accounts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "samra_core"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "samra_core"."reconciliation_exceptions" ADD CONSTRAINT "reconciliation_exceptions_item_id_reconciliation_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "samra_core"."reconciliation_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "samra_core"."reconciliation_items" ADD CONSTRAINT "reconciliation_items_run_id_reconciliation_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "samra_core"."reconciliation_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "samra_core"."reconciliation_runs" ADD CONSTRAINT "reconciliation_runs_provider_report_id_provider_reports_id_fk" FOREIGN KEY ("provider_report_id") REFERENCES "samra_core"."provider_reports"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "samra_core"."remittance_quotes" ADD CONSTRAINT "remittance_quotes_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "samra_core"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "samra_core"."remittance_quotes" ADD CONSTRAINT "remittance_quotes_product_account_id_product_accounts_id_fk" FOREIGN KEY ("product_account_id") REFERENCES "samra_core"."product_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "samra_core"."remittance_quotes" ADD CONSTRAINT "remittance_quotes_beneficiary_id_beneficiaries_id_fk" FOREIGN KEY ("beneficiary_id") REFERENCES "samra_core"."beneficiaries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "samra_core"."remittance_transfer_status_history" ADD CONSTRAINT "remittance_transfer_status_history_transfer_id_remittance_transfers_id_fk" FOREIGN KEY ("transfer_id") REFERENCES "samra_core"."remittance_transfers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "samra_core"."remittance_transfer_status_history" ADD CONSTRAINT "remittance_transfer_status_history_provider_event_id_provider_events_id_fk" FOREIGN KEY ("provider_event_id") REFERENCES "samra_core"."provider_events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "samra_core"."remittance_transfers" ADD CONSTRAINT "remittance_transfers_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "samra_core"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "samra_core"."remittance_transfers" ADD CONSTRAINT "remittance_transfers_product_account_id_product_accounts_id_fk" FOREIGN KEY ("product_account_id") REFERENCES "samra_core"."product_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "samra_core"."remittance_transfers" ADD CONSTRAINT "remittance_transfers_beneficiary_id_beneficiaries_id_fk" FOREIGN KEY ("beneficiary_id") REFERENCES "samra_core"."beneficiaries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "samra_core"."remittance_transfers" ADD CONSTRAINT "remittance_transfers_quote_id_remittance_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "samra_core"."remittance_quotes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "samra_core"."remittance_transfers" ADD CONSTRAINT "remittance_transfers_hold_id_ledger_holds_id_fk" FOREIGN KEY ("hold_id") REFERENCES "samra_core"."ledger_holds"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_events_entity_time_idx" ON "samra_core"."audit_events" USING btree ("entity_type","entity_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_events_correlation_idx" ON "samra_core"."audit_events" USING btree ("correlation_id");--> statement-breakpoint
CREATE INDEX "audit_events_actor_time_idx" ON "samra_core"."audit_events" USING btree ("actor_type","actor_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_records_scope_key_uidx" ON "samra_core"."idempotency_records" USING btree ("scope","idempotency_key");--> statement-breakpoint
CREATE INDEX "idempotency_records_expiry_idx" ON "samra_core"."idempotency_records" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_accounts_code_uidx" ON "samra_core"."ledger_accounts" USING btree ("code");--> statement-breakpoint
CREATE INDEX "ledger_accounts_product_account_idx" ON "samra_core"."ledger_accounts" USING btree ("product_account_id");--> statement-breakpoint
CREATE INDEX "ledger_accounts_class_currency_idx" ON "samra_core"."ledger_accounts" USING btree ("account_class","currency");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_hold_events_type_uidx" ON "samra_core"."ledger_hold_events" USING btree ("hold_id","event_type");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_hold_events_terminal_uidx" ON "samra_core"."ledger_hold_events" USING btree ("hold_id") WHERE "samra_core"."ledger_hold_events"."event_type" in ('captured', 'released', 'expired');--> statement-breakpoint
CREATE INDEX "ledger_hold_events_hold_time_idx" ON "samra_core"."ledger_hold_events" USING btree ("hold_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_holds_business_event_uidx" ON "samra_core"."ledger_holds" USING btree ("business_event_type","business_event_id");--> statement-breakpoint
CREATE INDEX "ledger_holds_account_state_idx" ON "samra_core"."ledger_holds" USING btree ("ledger_account_id","state");--> statement-breakpoint
CREATE INDEX "ledger_holds_product_account_state_idx" ON "samra_core"."ledger_holds" USING btree ("product_account_id","state");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_journals_business_event_uidx" ON "samra_core"."ledger_journals" USING btree ("business_event_type","business_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_journals_reverses_uidx" ON "samra_core"."ledger_journals" USING btree ("reverses_journal_id") WHERE "samra_core"."ledger_journals"."reverses_journal_id" is not null;--> statement-breakpoint
CREATE INDEX "ledger_journals_created_at_idx" ON "samra_core"."ledger_journals" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ledger_journals_state_idx" ON "samra_core"."ledger_journals" USING btree ("state");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_postings_journal_sequence_uidx" ON "samra_core"."ledger_postings" USING btree ("journal_id","sequence");--> statement-breakpoint
CREATE INDEX "ledger_postings_account_created_at_idx" ON "samra_core"."ledger_postings" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "ledger_postings_journal_idx" ON "samra_core"."ledger_postings" USING btree ("journal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "beneficiaries_customer_external_ref_uidx" ON "samra_core"."beneficiaries" USING btree ("customer_id","external_ref");--> statement-breakpoint
CREATE INDEX "beneficiaries_customer_state_idx" ON "samra_core"."beneficiaries" USING btree ("customer_id","state");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_external_ref_uidx" ON "samra_core"."customers" USING btree ("external_ref");--> statement-breakpoint
CREATE INDEX "customers_state_idx" ON "samra_core"."customers" USING btree ("state");--> statement-breakpoint
CREATE UNIQUE INDEX "product_accounts_external_ref_uidx" ON "samra_core"."product_accounts" USING btree ("external_ref");--> statement-breakpoint
CREATE INDEX "product_accounts_customer_idx" ON "samra_core"."product_accounts" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "product_accounts_customer_state_idx" ON "samra_core"."product_accounts" USING btree ("customer_id","state");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_reports_provider_ref_uidx" ON "samra_core"."provider_reports" USING btree ("provider","provider_report_id");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_reports_checksum_uidx" ON "samra_core"."provider_reports" USING btree ("provider","checksum");--> statement-breakpoint
CREATE INDEX "provider_reports_date_idx" ON "samra_core"."provider_reports" USING btree ("provider","report_date");--> statement-breakpoint
CREATE UNIQUE INDEX "reconciliation_exceptions_item_code_uidx" ON "samra_core"."reconciliation_exceptions" USING btree ("item_id","exception_code");--> statement-breakpoint
CREATE INDEX "reconciliation_exceptions_state_idx" ON "samra_core"."reconciliation_exceptions" USING btree ("state","opened_at");--> statement-breakpoint
CREATE UNIQUE INDEX "reconciliation_items_run_match_key_uidx" ON "samra_core"."reconciliation_items" USING btree ("run_id","match_key");--> statement-breakpoint
CREATE INDEX "reconciliation_items_run_result_idx" ON "samra_core"."reconciliation_items" USING btree ("run_id","result");--> statement-breakpoint
CREATE INDEX "reconciliation_items_internal_resource_idx" ON "samra_core"."reconciliation_items" USING btree ("internal_resource_type","internal_resource_id");--> statement-breakpoint
CREATE INDEX "reconciliation_runs_provider_period_idx" ON "samra_core"."reconciliation_runs" USING btree ("provider","period_start","period_end");--> statement-breakpoint
CREATE INDEX "reconciliation_runs_state_idx" ON "samra_core"."reconciliation_runs" USING btree ("state","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "outbox_events_event_key_uidx" ON "samra_core"."outbox_events" USING btree ("event_key");--> statement-breakpoint
CREATE INDEX "outbox_events_dispatch_idx" ON "samra_core"."outbox_events" USING btree ("state","available_at");--> statement-breakpoint
CREATE INDEX "outbox_events_aggregate_idx" ON "samra_core"."outbox_events" USING btree ("aggregate_type","aggregate_id");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_events_provider_event_uidx" ON "samra_core"."provider_events" USING btree ("provider","provider_event_id");--> statement-breakpoint
CREATE INDEX "provider_events_state_received_idx" ON "samra_core"."provider_events" USING btree ("state","received_at");--> statement-breakpoint
CREATE INDEX "provider_events_related_resource_idx" ON "samra_core"."provider_events" USING btree ("related_resource_type","related_resource_id");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_resource_links_provider_ref_uidx" ON "samra_core"."provider_resource_links" USING btree ("provider","resource_type","provider_resource_id");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_resource_links_internal_uidx" ON "samra_core"."provider_resource_links" USING btree ("provider","resource_type","internal_resource_id");--> statement-breakpoint
CREATE INDEX "provider_resource_links_internal_idx" ON "samra_core"."provider_resource_links" USING btree ("internal_resource_id");--> statement-breakpoint
CREATE INDEX "remittance_quotes_customer_created_idx" ON "samra_core"."remittance_quotes" USING btree ("customer_id","created_at");--> statement-breakpoint
CREATE INDEX "remittance_quotes_expiry_state_idx" ON "samra_core"."remittance_quotes" USING btree ("expires_at","state");--> statement-breakpoint
CREATE UNIQUE INDEX "remittance_transfer_status_history_sequence_uidx" ON "samra_core"."remittance_transfer_status_history" USING btree ("transfer_id","sequence");--> statement-breakpoint
CREATE INDEX "remittance_transfer_status_history_time_idx" ON "samra_core"."remittance_transfer_status_history" USING btree ("transfer_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "remittance_transfers_external_ref_uidx" ON "samra_core"."remittance_transfers" USING btree ("external_ref");--> statement-breakpoint
CREATE UNIQUE INDEX "remittance_transfers_quote_uidx" ON "samra_core"."remittance_transfers" USING btree ("quote_id");--> statement-breakpoint
CREATE UNIQUE INDEX "remittance_transfers_hold_uidx" ON "samra_core"."remittance_transfers" USING btree ("hold_id") WHERE "samra_core"."remittance_transfers"."hold_id" is not null;--> statement-breakpoint
CREATE INDEX "remittance_transfers_customer_created_idx" ON "samra_core"."remittance_transfers" USING btree ("customer_id","created_at");--> statement-breakpoint
CREATE INDEX "remittance_transfers_state_updated_idx" ON "samra_core"."remittance_transfers" USING btree ("state","updated_at");--> statement-breakpoint

-- The Drizzle schema describes storage shape. The following database guards
-- protect accounting invariants that cannot be expressed as row-level checks.
CREATE FUNCTION "samra_core"."reject_append_only_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	RAISE EXCEPTION '% is append-only', TG_TABLE_NAME
		USING ERRCODE = '55000';
END;
$$;--> statement-breakpoint

CREATE TRIGGER "audit_events_append_only"
BEFORE UPDATE OR DELETE ON "samra_core"."audit_events"
FOR EACH ROW EXECUTE FUNCTION "samra_core"."reject_append_only_mutation"();--> statement-breakpoint

CREATE TRIGGER "ledger_hold_events_append_only"
BEFORE UPDATE OR DELETE ON "samra_core"."ledger_hold_events"
FOR EACH ROW EXECUTE FUNCTION "samra_core"."reject_append_only_mutation"();--> statement-breakpoint

CREATE TRIGGER "remittance_transfer_status_history_append_only"
BEFORE UPDATE OR DELETE ON "samra_core"."remittance_transfer_status_history"
FOR EACH ROW EXECUTE FUNCTION "samra_core"."reject_append_only_mutation"();--> statement-breakpoint

CREATE FUNCTION "samra_core"."guard_ledger_account_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "samra_core"."ledger_postings" AS posting
		WHERE posting."account_id" = OLD."id"
	) AND (
		NEW."code" IS DISTINCT FROM OLD."code"
		OR NEW."account_class" IS DISTINCT FROM OLD."account_class"
		OR NEW."normal_side" IS DISTINCT FROM OLD."normal_side"
		OR NEW."currency" IS DISTINCT FROM OLD."currency"
		OR NEW."product_account_id" IS DISTINCT FROM OLD."product_account_id"
		OR NEW."allow_negative_available" IS DISTINCT FROM OLD."allow_negative_available"
	) THEN
		RAISE EXCEPTION 'accounting dimensions cannot change after account % has postings', OLD."id"
			USING ERRCODE = '55000';
	END IF;

	RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER "ledger_accounts_accounting_dimensions_immutable"
BEFORE UPDATE ON "samra_core"."ledger_accounts"
FOR EACH ROW EXECUTE FUNCTION "samra_core"."guard_ledger_account_mutation"();--> statement-breakpoint

CREATE FUNCTION "samra_core"."guard_ledger_posting_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
	journal_state "samra_core"."ledger_journal_state";
	journal_currency "samra_core"."currency_code";
	account_currency "samra_core"."currency_code";
	account_state "samra_core"."record_state";
	target_journal_id uuid;
BEGIN
	target_journal_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."journal_id" ELSE NEW."journal_id" END;

	SELECT journal."state", journal."currency"
	INTO journal_state, journal_currency
	FROM "samra_core"."ledger_journals" AS journal
	WHERE journal."id" = target_journal_id
	FOR UPDATE;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'ledger journal % does not exist', target_journal_id
			USING ERRCODE = '23503';
	END IF;

	IF journal_state <> 'draft' THEN
		RAISE EXCEPTION 'postings for journal % are immutable after posting', target_journal_id
			USING ERRCODE = '55000';
	END IF;

	IF TG_OP = 'DELETE' THEN
		RETURN OLD;
	END IF;

	IF TG_OP = 'UPDATE' AND (
		NEW."id" IS DISTINCT FROM OLD."id"
		OR NEW."journal_id" IS DISTINCT FROM OLD."journal_id"
		OR NEW."created_at" IS DISTINCT FROM OLD."created_at"
	) THEN
		RAISE EXCEPTION 'posting identity, journal, and creation time are immutable'
			USING ERRCODE = '55000';
	END IF;

	SELECT account."currency", account."state"
	INTO account_currency, account_state
	FROM "samra_core"."ledger_accounts" AS account
	WHERE account."id" = NEW."account_id";

	IF NOT FOUND THEN
		RAISE EXCEPTION 'ledger account % does not exist', NEW."account_id"
			USING ERRCODE = '23503';
	END IF;

	IF account_state <> 'active' THEN
		RAISE EXCEPTION 'ledger account % is not active', NEW."account_id"
			USING ERRCODE = '23514';
	END IF;

	IF account_currency <> journal_currency THEN
		RAISE EXCEPTION 'journal % currency % does not match account % currency %',
			target_journal_id, journal_currency, NEW."account_id", account_currency
			USING ERRCODE = '23514';
	END IF;

	RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER "ledger_postings_draft_only"
BEFORE INSERT OR UPDATE OR DELETE ON "samra_core"."ledger_postings"
FOR EACH ROW EXECUTE FUNCTION "samra_core"."guard_ledger_posting_mutation"();--> statement-breakpoint

CREATE FUNCTION "samra_core"."guard_ledger_journal_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
	posting_count integer;
	account_count integer;
	debit_total numeric;
	credit_total numeric;
	account_record record;
	current_balance numeric;
	journal_delta numeric;
	active_holds numeric;
	original_state "samra_core"."ledger_journal_state";
	original_currency "samra_core"."currency_code";
BEGIN
	IF TG_OP = 'INSERT' THEN
		IF NEW."state" <> 'draft' OR NEW."posted_at" IS NOT NULL THEN
			RAISE EXCEPTION 'ledger journals must be created in draft state'
				USING ERRCODE = '23514';
		END IF;
		RETURN NEW;
	END IF;

	IF TG_OP = 'DELETE' THEN
		IF OLD."state" <> 'draft' THEN
			RAISE EXCEPTION 'posted ledger journal % is immutable', OLD."id"
				USING ERRCODE = '55000';
		END IF;
		RETURN OLD;
	END IF;

	IF OLD."state" = 'reversed' THEN
		RAISE EXCEPTION 'reversed ledger journal % is immutable', OLD."id"
			USING ERRCODE = '55000';
	END IF;

	IF OLD."state" = 'posted' THEN
		IF NEW."state" <> 'reversed'
			OR NEW."id" IS DISTINCT FROM OLD."id"
			OR NEW."business_event_type" IS DISTINCT FROM OLD."business_event_type"
			OR NEW."business_event_id" IS DISTINCT FROM OLD."business_event_id"
			OR NEW."currency" IS DISTINCT FROM OLD."currency"
			OR NEW."description" IS DISTINCT FROM OLD."description"
			OR NEW."reverses_journal_id" IS DISTINCT FROM OLD."reverses_journal_id"
			OR NEW."metadata" IS DISTINCT FROM OLD."metadata"
			OR NEW."created_at" IS DISTINCT FROM OLD."created_at"
			OR NEW."posted_at" IS DISTINCT FROM OLD."posted_at"
			OR NOT EXISTS (
				SELECT 1
				FROM "samra_core"."ledger_journals" AS reversal
				WHERE reversal."reverses_journal_id" = OLD."id"
					AND reversal."state" = 'posted'
			) THEN
			RAISE EXCEPTION 'posted ledger journal % can only be marked reversed by its posted reversal journal', OLD."id"
				USING ERRCODE = '55000';
		END IF;
		RETURN NEW;
	END IF;

	IF NEW."state" = 'draft' THEN
		RETURN NEW;
	END IF;

	IF NEW."state" <> 'posted' THEN
		RAISE EXCEPTION 'draft journal % may only transition to posted', NEW."id"
			USING ERRCODE = '23514';
	END IF;

	IF NEW."id" IS DISTINCT FROM OLD."id"
		OR NEW."business_event_type" IS DISTINCT FROM OLD."business_event_type"
		OR NEW."business_event_id" IS DISTINCT FROM OLD."business_event_id"
		OR NEW."currency" IS DISTINCT FROM OLD."currency"
		OR NEW."description" IS DISTINCT FROM OLD."description"
		OR NEW."reverses_journal_id" IS DISTINCT FROM OLD."reverses_journal_id"
		OR NEW."metadata" IS DISTINCT FROM OLD."metadata"
		OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
		RAISE EXCEPTION 'journal % content and posting transition must be separate updates', NEW."id"
			USING ERRCODE = '55000';
	END IF;

	NEW."posted_at" := COALESCE(NEW."posted_at", now());

	SELECT
		count(*),
		count(DISTINCT posting."account_id"),
		COALESCE(sum(posting."amount_minor") FILTER (WHERE posting."side" = 'debit'), 0),
		COALESCE(sum(posting."amount_minor") FILTER (WHERE posting."side" = 'credit'), 0)
	INTO posting_count, account_count, debit_total, credit_total
	FROM "samra_core"."ledger_postings" AS posting
	WHERE posting."journal_id" = NEW."id";

	IF posting_count < 2 OR account_count < 2 OR debit_total <> credit_total THEN
		RAISE EXCEPTION 'journal % must contain balanced debit and credit postings across at least two accounts', NEW."id"
			USING ERRCODE = '23514';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM "samra_core"."ledger_postings" AS posting
		JOIN "samra_core"."ledger_accounts" AS account ON account."id" = posting."account_id"
		WHERE posting."journal_id" = NEW."id"
			AND (account."currency" <> NEW."currency" OR account."state" <> 'active')
	) THEN
		RAISE EXCEPTION 'journal % contains an inactive or cross-currency account', NEW."id"
			USING ERRCODE = '23514';
	END IF;

	IF NEW."reverses_journal_id" IS NOT NULL THEN
		SELECT original."state", original."currency"
		INTO original_state, original_currency
		FROM "samra_core"."ledger_journals" AS original
		WHERE original."id" = NEW."reverses_journal_id"
		FOR UPDATE;

		IF NOT FOUND OR original_state <> 'posted' OR original_currency <> NEW."currency" THEN
			RAISE EXCEPTION 'journal % can only reverse a posted journal in the same currency', NEW."id"
				USING ERRCODE = '23514';
		END IF;

		IF EXISTS (
			WITH original AS (
				SELECT posting."account_id", posting."side", sum(posting."amount_minor") AS amount_minor
				FROM "samra_core"."ledger_postings" AS posting
				WHERE posting."journal_id" = NEW."reverses_journal_id"
				GROUP BY posting."account_id", posting."side"
			), reversal AS (
				SELECT
					posting."account_id",
					CASE posting."side"
						WHEN 'debit' THEN 'credit'::"samra_core"."ledger_entry_side"
						ELSE 'debit'::"samra_core"."ledger_entry_side"
					END AS original_side,
					sum(posting."amount_minor") AS amount_minor
				FROM "samra_core"."ledger_postings" AS posting
				WHERE posting."journal_id" = NEW."id"
				GROUP BY posting."account_id", posting."side"
			)
			SELECT 1
			FROM original
			FULL OUTER JOIN reversal
				ON reversal."account_id" = original."account_id"
				AND reversal."original_side" = original."side"
			WHERE original."amount_minor" IS DISTINCT FROM reversal."amount_minor"
		) THEN
			RAISE EXCEPTION 'journal % is not an exact reversal of journal %', NEW."id", NEW."reverses_journal_id"
				USING ERRCODE = '23514';
		END IF;
	END IF;

	-- Lock every touched account in a deterministic order. This serializes
	-- posting against concurrent holds and other journal postings.
	FOR account_record IN
		SELECT account."id", account."normal_side", account."allow_negative_available"
		FROM "samra_core"."ledger_accounts" AS account
		JOIN (
			SELECT DISTINCT posting."account_id"
			FROM "samra_core"."ledger_postings" AS posting
			WHERE posting."journal_id" = NEW."id"
		) AS touched ON touched."account_id" = account."id"
		ORDER BY account."id"
		FOR UPDATE OF account
	LOOP
		IF NOT account_record."allow_negative_available" THEN
			SELECT COALESCE(sum(
				CASE WHEN posting."side" = account_record."normal_side"
					THEN posting."amount_minor"
					ELSE -posting."amount_minor"
				END
			), 0)
			INTO current_balance
			FROM "samra_core"."ledger_postings" AS posting
			JOIN "samra_core"."ledger_journals" AS journal ON journal."id" = posting."journal_id"
			WHERE posting."account_id" = account_record."id"
				AND journal."state" IN ('posted', 'reversed');

			SELECT COALESCE(sum(
				CASE WHEN posting."side" = account_record."normal_side"
					THEN posting."amount_minor"
					ELSE -posting."amount_minor"
				END
			), 0)
			INTO journal_delta
			FROM "samra_core"."ledger_postings" AS posting
			WHERE posting."journal_id" = NEW."id"
				AND posting."account_id" = account_record."id";

			SELECT COALESCE(sum(hold."amount_minor"), 0)
			INTO active_holds
			FROM "samra_core"."ledger_holds" AS hold
			WHERE hold."ledger_account_id" = account_record."id"
				AND hold."state" = 'active';

			IF current_balance + journal_delta - active_holds < 0 THEN
				RAISE EXCEPTION 'posting journal % would make available balance negative for account %', NEW."id", account_record."id"
					USING ERRCODE = '23514';
			END IF;
		END IF;
	END LOOP;

	RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER "ledger_journals_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "samra_core"."ledger_journals"
FOR EACH ROW EXECUTE FUNCTION "samra_core"."guard_ledger_journal_mutation"();--> statement-breakpoint

CREATE FUNCTION "samra_core"."mark_reversed_journal"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF OLD."state" = 'draft'
		AND NEW."state" = 'posted'
		AND NEW."reverses_journal_id" IS NOT NULL THEN
		UPDATE "samra_core"."ledger_journals"
		SET "state" = 'reversed'
		WHERE "id" = NEW."reverses_journal_id";
	END IF;

	RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER "ledger_journals_mark_reversed"
AFTER UPDATE ON "samra_core"."ledger_journals"
FOR EACH ROW EXECUTE FUNCTION "samra_core"."mark_reversed_journal"();--> statement-breakpoint

CREATE FUNCTION "samra_core"."guard_ledger_hold_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
	account_currency "samra_core"."currency_code";
	account_product_id uuid;
	account_normal_side "samra_core"."ledger_entry_side";
	allow_negative boolean;
	product_currency "samra_core"."currency_code";
	current_balance numeric;
	active_holds numeric;
BEGIN
	IF TG_OP = 'DELETE' THEN
		RAISE EXCEPTION 'ledger holds cannot be deleted; transition the hold state instead'
			USING ERRCODE = '55000';
	END IF;

	IF TG_OP = 'UPDATE' THEN
		IF OLD."state" <> 'active' THEN
			RAISE EXCEPTION 'terminal ledger hold % is immutable', OLD."id"
				USING ERRCODE = '55000';
		END IF;

		IF NEW."id" IS DISTINCT FROM OLD."id"
			OR NEW."business_event_type" IS DISTINCT FROM OLD."business_event_type"
			OR NEW."business_event_id" IS DISTINCT FROM OLD."business_event_id"
			OR NEW."product_account_id" IS DISTINCT FROM OLD."product_account_id"
			OR NEW."ledger_account_id" IS DISTINCT FROM OLD."ledger_account_id"
			OR NEW."currency" IS DISTINCT FROM OLD."currency"
			OR NEW."amount_minor" IS DISTINCT FROM OLD."amount_minor"
			OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
			RAISE EXCEPTION 'ledger hold % accounting fields are immutable', OLD."id"
				USING ERRCODE = '55000';
		END IF;
	ELSIF NEW."state" <> 'active' THEN
		RAISE EXCEPTION 'ledger holds must be created in active state'
			USING ERRCODE = '23514';
	END IF;

	SELECT
		account."currency",
		account."product_account_id",
		account."normal_side",
		account."allow_negative_available"
	INTO account_currency, account_product_id, account_normal_side, allow_negative
	FROM "samra_core"."ledger_accounts" AS account
	WHERE account."id" = NEW."ledger_account_id"
		AND account."state" = 'active'
	FOR UPDATE;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'active ledger account % does not exist', NEW."ledger_account_id"
			USING ERRCODE = '23503';
	END IF;

	SELECT product."currency"
	INTO product_currency
	FROM "samra_core"."product_accounts" AS product
	WHERE product."id" = NEW."product_account_id"
		AND product."state" = 'active';

	IF NOT FOUND
		OR account_product_id IS DISTINCT FROM NEW."product_account_id"
		OR account_currency <> NEW."currency"
		OR product_currency <> NEW."currency" THEN
		RAISE EXCEPTION 'hold %, product account, and ledger account must share ownership and currency', NEW."id"
			USING ERRCODE = '23514';
	END IF;

	IF NEW."state" = 'active' AND NOT allow_negative THEN
		SELECT COALESCE(sum(
			CASE WHEN posting."side" = account_normal_side
				THEN posting."amount_minor"
				ELSE -posting."amount_minor"
			END
		), 0)
		INTO current_balance
		FROM "samra_core"."ledger_postings" AS posting
		JOIN "samra_core"."ledger_journals" AS journal ON journal."id" = posting."journal_id"
		WHERE posting."account_id" = NEW."ledger_account_id"
			AND journal."state" IN ('posted', 'reversed');

		SELECT COALESCE(sum(hold."amount_minor"), 0)
		INTO active_holds
		FROM "samra_core"."ledger_holds" AS hold
		WHERE hold."ledger_account_id" = NEW."ledger_account_id"
			AND hold."state" = 'active'
			AND hold."id" <> NEW."id";

		IF current_balance - active_holds - NEW."amount_minor" < 0 THEN
			RAISE EXCEPTION 'hold % would make available balance negative for account %', NEW."id", NEW."ledger_account_id"
				USING ERRCODE = '23514';
		END IF;
	END IF;

	RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER "ledger_holds_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "samra_core"."ledger_holds"
FOR EACH ROW EXECUTE FUNCTION "samra_core"."guard_ledger_hold_mutation"();
