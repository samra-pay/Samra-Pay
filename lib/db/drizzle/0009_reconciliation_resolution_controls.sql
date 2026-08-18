ALTER TABLE "samra_core"."reconciliation_exceptions"
  ADD COLUMN "resolved_by" text,
  ADD COLUMN "resolution_journal_id" uuid,
  ADD COLUMN "resolution_idempotency_key" text;
--> statement-breakpoint
ALTER TABLE "samra_core"."reconciliation_exceptions"
  ADD CONSTRAINT "reconciliation_exceptions_resolution_journal_id_ledger_journals_id_fk"
  FOREIGN KEY ("resolution_journal_id")
  REFERENCES "samra_core"."ledger_journals"("id")
  ON DELETE RESTRICT;
--> statement-breakpoint
CREATE UNIQUE INDEX "reconciliation_exceptions_resolution_journal_uidx"
  ON "samra_core"."reconciliation_exceptions" USING btree ("resolution_journal_id");
--> statement-breakpoint
ALTER TABLE "samra_core"."reconciliation_exceptions"
  ADD CONSTRAINT "reconciliation_exceptions_resolution_evidence_chk"
  CHECK (
    ("state" = 'resolved'
      AND "resolution_note" IS NOT NULL
      AND length(trim("resolution_note")) >= 20
      AND "assigned_to" IS NOT NULL
      AND "assigned_to" = "resolved_by"
      AND "resolved_by" IS NOT NULL
      AND "resolution_journal_id" IS NOT NULL
      AND "resolution_idempotency_key" IS NOT NULL)
    OR
    ("state" <> 'resolved'
      AND "resolved_by" IS NULL
      AND "resolution_journal_id" IS NULL
      AND "resolution_idempotency_key" IS NULL)
  );
--> statement-breakpoint
CREATE TABLE "samra_core"."reconciliation_exception_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "exception_id" uuid NOT NULL,
  "sequence" integer NOT NULL,
  "from_state" "samra_core"."reconciliation_exception_state" NOT NULL,
  "to_state" "samra_core"."reconciliation_exception_state" NOT NULL,
  "actor_type" text DEFAULT 'operator' NOT NULL,
  "actor_id" text NOT NULL,
  "decision" text NOT NULL,
  "reason" text NOT NULL,
  "resolving_journal_id" uuid NOT NULL,
  "idempotency_key" text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "reconciliation_exception_events_exception_id_reconciliation_exceptions_id_fk"
    FOREIGN KEY ("exception_id")
    REFERENCES "samra_core"."reconciliation_exceptions"("id")
    ON DELETE RESTRICT,
  CONSTRAINT "reconciliation_exception_events_journal_id_ledger_journals_id_fk"
    FOREIGN KEY ("resolving_journal_id")
    REFERENCES "samra_core"."ledger_journals"("id")
    ON DELETE RESTRICT,
  CONSTRAINT "reconciliation_exception_events_actor_chk"
    CHECK ("actor_type" = 'operator'),
  CONSTRAINT "reconciliation_exception_events_decision_chk"
    CHECK ("decision" = 'resolved_with_journal'),
  CONSTRAINT "reconciliation_exception_events_reason_chk"
    CHECK (length(trim("reason")) >= 20)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "reconciliation_exception_events_sequence_uidx"
  ON "samra_core"."reconciliation_exception_events"
  USING btree ("exception_id", "sequence");
--> statement-breakpoint
CREATE UNIQUE INDEX "reconciliation_exception_events_idempotency_uidx"
  ON "samra_core"."reconciliation_exception_events"
  USING btree ("exception_id", "idempotency_key");
--> statement-breakpoint
CREATE INDEX "reconciliation_exception_events_occurred_idx"
  ON "samra_core"."reconciliation_exception_events"
  USING btree ("exception_id", "occurred_at");
--> statement-breakpoint
CREATE FUNCTION "samra_core"."guard_reconciliation_item_evidence_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'reconciliation item % evidence is immutable', OLD."id"
    USING ERRCODE = '55000';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "reconciliation_items_evidence_immutable"
BEFORE UPDATE OR DELETE ON "samra_core"."reconciliation_items"
FOR EACH ROW EXECUTE FUNCTION "samra_core"."guard_reconciliation_item_evidence_mutation"();
--> statement-breakpoint
CREATE FUNCTION "samra_core"."guard_reconciliation_exception_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'reconciliation exception % cannot be deleted', OLD."id"
      USING ERRCODE = '55000';
  END IF;

  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."item_id" IS DISTINCT FROM OLD."item_id"
    OR NEW."exception_code" IS DISTINCT FROM OLD."exception_code"
    OR NEW."summary" IS DISTINCT FROM OLD."summary"
    OR NEW."opened_at" IS DISTINCT FROM OLD."opened_at" THEN
    RAISE EXCEPTION 'reconciliation exception % source evidence is immutable', OLD."id"
      USING ERRCODE = '55000';
  END IF;

  IF OLD."state" IN ('resolved', 'ignored') THEN
    RAISE EXCEPTION 'reconciliation exception % is terminal and immutable', OLD."id"
      USING ERRCODE = '55000';
  END IF;

  IF NEW."state" <> 'resolved'
    AND (NEW."state" IS DISTINCT FROM OLD."state"
      OR NEW."assigned_to" IS DISTINCT FROM OLD."assigned_to"
      OR NEW."resolution_note" IS DISTINCT FROM OLD."resolution_note"
      OR NEW."resolved_at" IS DISTINCT FROM OLD."resolved_at") THEN
    RAISE EXCEPTION 'reconciliation exception % requires a controlled decision workflow', OLD."id"
      USING ERRCODE = '55000';
  END IF;

  IF NEW."state" = 'resolved' THEN
    PERFORM 1
    FROM "samra_core"."ledger_journals" AS journal
    JOIN "samra_core"."reconciliation_items" AS item
      ON item."id" = OLD."item_id"
    WHERE journal."id" = NEW."resolution_journal_id"
      AND journal."state" = 'posted'
      AND journal."business_event_type" = 'reconciliation_exception_resolution'
      AND journal."business_event_id" = OLD."id"::text
      AND journal."currency" = item."internal_currency"
      AND item."internal_currency" = item."provider_currency"
      AND item."internal_amount_minor" IS NOT NULL
      AND item."provider_amount_minor" IS NOT NULL
      AND item."internal_amount_minor" <> item."provider_amount_minor"
      AND journal."metadata"->>'exceptionId' = OLD."id"::text
      AND journal."metadata"->>'internalAmountMinor' = item."internal_amount_minor"::text
      AND journal."metadata"->>'providerAmountMinor' = item."provider_amount_minor"::text
      AND journal."metadata"->>'operatorId' = NEW."resolved_by"
      AND journal."metadata"->>'reason' = NEW."resolution_note"
      AND journal."metadata"->>'idempotencyKey' = NEW."resolution_idempotency_key"
      AND (SELECT count(*) FROM "samra_core"."ledger_postings" AS posting
           WHERE posting."journal_id" = journal."id") = 2
      AND (
        (item."provider_amount_minor" > item."internal_amount_minor"
          AND EXISTS (
            SELECT 1
            FROM "samra_core"."ledger_postings" AS posting
            JOIN "samra_core"."ledger_accounts" AS account
              ON account."id" = posting."account_id"
            WHERE posting."journal_id" = journal."id"
              AND account."code" = 'asset_reconciliation_suspense_usd'
              AND posting."side" = 'debit'
              AND posting."amount_minor" =
                item."provider_amount_minor" - item."internal_amount_minor")
          AND EXISTS (
            SELECT 1
            FROM "samra_core"."ledger_postings" AS posting
            JOIN "samra_core"."ledger_accounts" AS account
              ON account."id" = posting."account_id"
            WHERE posting."journal_id" = journal."id"
              AND account."code" = 'control_rain_usd'
              AND posting."side" = 'credit'
              AND posting."amount_minor" =
                item."provider_amount_minor" - item."internal_amount_minor"))
        OR
        (item."provider_amount_minor" < item."internal_amount_minor"
          AND EXISTS (
            SELECT 1
            FROM "samra_core"."ledger_postings" AS posting
            JOIN "samra_core"."ledger_accounts" AS account
              ON account."id" = posting."account_id"
            WHERE posting."journal_id" = journal."id"
              AND account."code" = 'control_rain_usd'
              AND posting."side" = 'debit'
              AND posting."amount_minor" =
                item."internal_amount_minor" - item."provider_amount_minor")
          AND EXISTS (
            SELECT 1
            FROM "samra_core"."ledger_postings" AS posting
            JOIN "samra_core"."ledger_accounts" AS account
              ON account."id" = posting."account_id"
            WHERE posting."journal_id" = journal."id"
              AND account."code" = 'asset_reconciliation_suspense_usd'
              AND posting."side" = 'credit'
              AND posting."amount_minor" =
                item."internal_amount_minor" - item."provider_amount_minor"))
      );
    IF NOT FOUND THEN
      RAISE EXCEPTION 'reconciliation exception % requires its exact posted resolution journal', OLD."id"
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "reconciliation_exceptions_controlled_mutation"
BEFORE UPDATE OR DELETE ON "samra_core"."reconciliation_exceptions"
FOR EACH ROW EXECUTE FUNCTION "samra_core"."guard_reconciliation_exception_mutation"();
--> statement-breakpoint
CREATE FUNCTION "samra_core"."guard_reconciliation_exception_event_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'reconciliation exception event % is append-only', OLD."id"
    USING ERRCODE = '55000';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "reconciliation_exception_events_append_only"
BEFORE UPDATE OR DELETE ON "samra_core"."reconciliation_exception_events"
FOR EACH ROW EXECUTE FUNCTION "samra_core"."guard_reconciliation_exception_event_mutation"();
--> statement-breakpoint
CREATE FUNCTION "samra_core"."validate_reconciliation_exception_resolution_commit"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."state" = 'resolved' THEN
    PERFORM 1
    FROM "samra_core"."reconciliation_exception_events" AS event
    WHERE event."exception_id" = NEW."id"
      AND event."sequence" = 1
      AND event."from_state" = OLD."state"
      AND event."to_state" = 'resolved'
      AND event."actor_type" = 'operator'
      AND event."actor_id" = NEW."resolved_by"
      AND event."decision" = 'resolved_with_journal'
      AND event."reason" = NEW."resolution_note"
      AND event."resolving_journal_id" = NEW."resolution_journal_id"
      AND event."idempotency_key" = NEW."resolution_idempotency_key";
    IF NOT FOUND THEN
      RAISE EXCEPTION 'reconciliation exception % requires its exact immutable resolution event', NEW."id"
        USING ERRCODE = '23514';
    END IF;
  ELSE
    PERFORM 1
    FROM "samra_core"."reconciliation_exception_events" AS event
    WHERE event."exception_id" = NEW."id";
    IF FOUND THEN
      RAISE EXCEPTION 'unresolved reconciliation exception % cannot retain a resolution event', NEW."id"
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "reconciliation_exceptions_resolution_consistency"
AFTER INSERT OR UPDATE ON "samra_core"."reconciliation_exceptions"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "samra_core"."validate_reconciliation_exception_resolution_commit"();
--> statement-breakpoint
CREATE FUNCTION "samra_core"."validate_reconciliation_exception_event_commit"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM 1
  FROM "samra_core"."reconciliation_exceptions" AS exception
  WHERE exception."id" = NEW."exception_id"
    AND exception."state" = 'resolved'
    AND exception."resolved_by" = NEW."actor_id"
    AND exception."resolution_note" = NEW."reason"
    AND exception."resolution_journal_id" = NEW."resolving_journal_id"
    AND exception."resolution_idempotency_key" = NEW."idempotency_key";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'reconciliation exception event % has no matching resolved exception', NEW."id"
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "reconciliation_exception_events_resolution_consistency"
AFTER INSERT ON "samra_core"."reconciliation_exception_events"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "samra_core"."validate_reconciliation_exception_event_commit"();
