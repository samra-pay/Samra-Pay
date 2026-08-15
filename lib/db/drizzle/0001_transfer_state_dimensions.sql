CREATE TYPE "samra_core"."remittance_funding_state" AS ENUM('unreserved', 'reserved', 'captured', 'released', 'refund_pending', 'refunded');--> statement-breakpoint
CREATE TYPE "samra_core"."remittance_payout_state" AS ENUM('not_submitted', 'submitted', 'processing', 'paid', 'failed', 'reversed');--> statement-breakpoint
CREATE TYPE "samra_core"."transfer_reconciliation_state" AS ENUM('not_started', 'pending', 'matched', 'exception', 'resolved');--> statement-breakpoint
ALTER TABLE "samra_core"."remittance_transfers" ADD COLUMN "funding_state" "samra_core"."remittance_funding_state" DEFAULT 'unreserved' NOT NULL;--> statement-breakpoint
ALTER TABLE "samra_core"."remittance_transfers" ADD COLUMN "payout_state" "samra_core"."remittance_payout_state" DEFAULT 'not_submitted' NOT NULL;--> statement-breakpoint
ALTER TABLE "samra_core"."remittance_transfers" ADD COLUMN "reconciliation_state" "samra_core"."transfer_reconciliation_state" DEFAULT 'not_started' NOT NULL;--> statement-breakpoint
ALTER TABLE "samra_core"."remittance_transfers" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "samra_core"."remittance_transfers" ADD CONSTRAINT "remittance_transfers_version_positive_chk" CHECK ("samra_core"."remittance_transfers"."version" > 0);