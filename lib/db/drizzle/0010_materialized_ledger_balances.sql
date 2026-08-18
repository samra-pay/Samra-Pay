CREATE TABLE "samra_core"."ledger_account_balances" (
  "account_id" uuid PRIMARY KEY NOT NULL,
  "currency" "samra_core"."currency_code" NOT NULL,
  "natural_balance_minor" bigint DEFAULT 0 NOT NULL,
  "active_holds_minor" bigint DEFAULT 0 NOT NULL,
  "available_balance_minor" bigint DEFAULT 0 NOT NULL,
  "applied_posting_count" bigint DEFAULT 0 NOT NULL,
  "active_hold_count" bigint DEFAULT 0 NOT NULL,
  "version" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ledger_account_balances_account_id_ledger_accounts_id_fk"
    FOREIGN KEY ("account_id")
    REFERENCES "samra_core"."ledger_accounts"("id")
    ON DELETE RESTRICT,
  CONSTRAINT "ledger_account_balances_available_chk"
    CHECK ("available_balance_minor" = "natural_balance_minor" - "active_holds_minor"),
  CONSTRAINT "ledger_account_balances_counts_chk"
    CHECK ("applied_posting_count" >= 0
      AND "active_hold_count" >= 0
      AND "active_holds_minor" >= 0
      AND "version" >= 0)
);
--> statement-breakpoint
CREATE INDEX "ledger_account_balances_updated_idx"
  ON "samra_core"."ledger_account_balances" USING btree ("updated_at");
--> statement-breakpoint
CREATE TABLE "samra_core"."ledger_balance_rebuild_commands" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "command_ref" text NOT NULL,
  "actor_id" text NOT NULL,
  "reason" text NOT NULL,
  "state" text DEFAULT 'requested' NOT NULL,
  "drifted_account_count" integer,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "requested_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  CONSTRAINT "ledger_balance_rebuild_commands_reason_chk"
    CHECK (length(trim("reason")) >= 20),
  CONSTRAINT "ledger_balance_rebuild_commands_state_chk"
    CHECK (("state" = 'requested' AND "completed_at" IS NULL
              AND "drifted_account_count" IS NULL)
      OR ("state" = 'completed' AND "completed_at" IS NOT NULL
              AND "drifted_account_count" >= 0))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_balance_rebuild_commands_ref_uidx"
  ON "samra_core"."ledger_balance_rebuild_commands" USING btree ("command_ref");
--> statement-breakpoint
CREATE INDEX "ledger_balance_rebuild_commands_requested_idx"
  ON "samra_core"."ledger_balance_rebuild_commands" USING btree ("requested_at");
--> statement-breakpoint
CREATE VIEW "samra_core"."ledger_account_balance_truth" AS
WITH posting_truth AS (
  SELECT posting."account_id",
         sum(CASE WHEN posting."side" = account."normal_side"
                  THEN posting."amount_minor" ELSE -posting."amount_minor" END)
           AS natural_balance_minor,
         count(*)::bigint AS applied_posting_count
  FROM "samra_core"."ledger_postings" AS posting
  JOIN "samra_core"."ledger_journals" AS journal
    ON journal."id" = posting."journal_id"
   AND journal."state" IN ('posted', 'reversed')
  JOIN "samra_core"."ledger_accounts" AS account
    ON account."id" = posting."account_id"
  GROUP BY posting."account_id"
), hold_truth AS (
  SELECT hold."ledger_account_id" AS account_id,
         sum(hold."amount_minor") AS active_holds_minor,
         count(*)::bigint AS active_hold_count
  FROM "samra_core"."ledger_holds" AS hold
  WHERE hold."state" = 'active'
  GROUP BY hold."ledger_account_id"
)
SELECT account."id" AS account_id,
       account."currency",
       COALESCE(posting_truth.natural_balance_minor, 0)::bigint
         AS natural_balance_minor,
       COALESCE(hold_truth.active_holds_minor, 0)::bigint
         AS active_holds_minor,
       (COALESCE(posting_truth.natural_balance_minor, 0)
         - COALESCE(hold_truth.active_holds_minor, 0))::bigint
         AS available_balance_minor,
       COALESCE(posting_truth.applied_posting_count, 0)::bigint
         AS applied_posting_count,
       COALESCE(hold_truth.active_hold_count, 0)::bigint
         AS active_hold_count
FROM "samra_core"."ledger_accounts" AS account
LEFT JOIN posting_truth ON posting_truth.account_id = account."id"
LEFT JOIN hold_truth ON hold_truth.account_id = account."id";
--> statement-breakpoint
INSERT INTO "samra_core"."ledger_account_balances"
  ("account_id", "currency", "natural_balance_minor", "active_holds_minor",
   "available_balance_minor", "applied_posting_count", "active_hold_count",
   "version", "updated_at")
SELECT truth.account_id, truth.currency, truth.natural_balance_minor,
       truth.active_holds_minor, truth.available_balance_minor,
       truth.applied_posting_count, truth.active_hold_count, 1, now()
FROM "samra_core"."ledger_account_balance_truth" AS truth;
--> statement-breakpoint
CREATE FUNCTION "samra_core"."guard_ledger_account_balance_projection"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ledger balance projections cannot be deleted'
      USING ERRCODE = '55000';
  END IF;

  IF pg_trigger_depth() < 2 THEN
    RAISE EXCEPTION 'ledger balance projections are derived and cannot be edited directly'
      USING ERRCODE = '55000';
  END IF;

  IF TG_OP = 'UPDATE' AND (
    NEW."account_id" IS DISTINCT FROM OLD."account_id"
    OR NEW."currency" IS DISTINCT FROM OLD."currency") THEN
    RAISE EXCEPTION 'ledger balance projection identity and currency are immutable'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "ledger_account_balances_derived_only"
BEFORE INSERT OR UPDATE OR DELETE ON "samra_core"."ledger_account_balances"
FOR EACH ROW EXECUTE FUNCTION "samra_core"."guard_ledger_account_balance_projection"();
--> statement-breakpoint
CREATE FUNCTION "samra_core"."initialize_ledger_account_balance"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO "samra_core"."ledger_account_balances"
    ("account_id", "currency", "version")
  VALUES (NEW."id", NEW."currency", 0);
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "ledger_accounts_initialize_balance"
AFTER INSERT ON "samra_core"."ledger_accounts"
FOR EACH ROW EXECUTE FUNCTION "samra_core"."initialize_ledger_account_balance"();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "samra_core"."guard_ledger_journal_mutation"()
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

  SELECT count(*), count(DISTINCT posting."account_id"),
         COALESCE(sum(posting."amount_minor")
           FILTER (WHERE posting."side" = 'debit'), 0),
         COALESCE(sum(posting."amount_minor")
           FILTER (WHERE posting."side" = 'credit'), 0)
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
    JOIN "samra_core"."ledger_accounts" AS account
      ON account."id" = posting."account_id"
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

    IF NOT FOUND OR original_state <> 'posted'
      OR original_currency <> NEW."currency" THEN
      RAISE EXCEPTION 'journal % can only reverse a posted journal in the same currency', NEW."id"
        USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
      WITH original AS (
        SELECT posting."account_id", posting."side",
               sum(posting."amount_minor") AS amount_minor
        FROM "samra_core"."ledger_postings" AS posting
        WHERE posting."journal_id" = NEW."reverses_journal_id"
        GROUP BY posting."account_id", posting."side"
      ), reversal AS (
        SELECT posting."account_id",
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

  -- NO KEY UPDATE serializes balance-changing work without conflicting with
  -- the KEY SHARE locks already acquired by posting foreign-key checks.
  FOR account_record IN
    SELECT account."id", account."normal_side",
           account."allow_negative_available"
    FROM "samra_core"."ledger_accounts" AS account
    JOIN (
      SELECT DISTINCT posting."account_id"
      FROM "samra_core"."ledger_postings" AS posting
      WHERE posting."journal_id" = NEW."id"
    ) AS touched ON touched."account_id" = account."id"
    ORDER BY account."id"
    FOR NO KEY UPDATE OF account
  LOOP
    IF NOT account_record."allow_negative_available" THEN
      SELECT COALESCE(sum(
        CASE WHEN posting."side" = account_record."normal_side"
          THEN posting."amount_minor" ELSE -posting."amount_minor" END
      ), 0)
      INTO current_balance
      FROM "samra_core"."ledger_postings" AS posting
      JOIN "samra_core"."ledger_journals" AS journal
        ON journal."id" = posting."journal_id"
      WHERE posting."account_id" = account_record."id"
        AND journal."state" IN ('posted', 'reversed');

      SELECT COALESCE(sum(
        CASE WHEN posting."side" = account_record."normal_side"
          THEN posting."amount_minor" ELSE -posting."amount_minor" END
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
$$;
--> statement-breakpoint
CREATE FUNCTION "samra_core"."lock_posted_journal_accounts_in_order"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  locked_account_id uuid;
BEGIN
  IF OLD."state" = 'draft' AND NEW."state" = 'posted' THEN
    -- Lock one account row at a time in canonical UUID order. A single
    -- SELECT ... ORDER BY ... FOR UPDATE can still acquire locks in a plan-
    -- dependent order around joins. The explicit loop prevents cycles when
    -- distinct journals post against overlapping account sets.
    FOR locked_account_id IN
      SELECT DISTINCT posting."account_id"
      FROM "samra_core"."ledger_postings" AS posting
      WHERE posting."journal_id" = NEW."id"
      ORDER BY posting."account_id"
    LOOP
      PERFORM 1
      FROM "samra_core"."ledger_accounts" AS account
      WHERE account."id" = locked_account_id
      FOR NO KEY UPDATE;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "ledger_journals_00_lock_accounts_in_order"
BEFORE UPDATE OF "state" ON "samra_core"."ledger_journals"
FOR EACH ROW EXECUTE FUNCTION "samra_core"."lock_posted_journal_accounts_in_order"();
--> statement-breakpoint
CREATE FUNCTION "samra_core"."apply_posted_journal_to_balance"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."state" = 'draft' AND NEW."state" = 'posted' THEN
    INSERT INTO "samra_core"."ledger_account_balances"
      ("account_id", "currency", "natural_balance_minor",
       "active_holds_minor", "available_balance_minor",
       "applied_posting_count", "active_hold_count", "version", "updated_at")
    SELECT posting."account_id", account."currency",
           sum(CASE WHEN posting."side" = account."normal_side"
                    THEN posting."amount_minor" ELSE -posting."amount_minor" END),
           0,
           sum(CASE WHEN posting."side" = account."normal_side"
                    THEN posting."amount_minor" ELSE -posting."amount_minor" END),
           count(*)::bigint, 0, 1, now()
    FROM "samra_core"."ledger_postings" AS posting
    JOIN "samra_core"."ledger_accounts" AS account
      ON account."id" = posting."account_id"
    WHERE posting."journal_id" = NEW."id"
    GROUP BY posting."account_id", account."currency"
    ON CONFLICT ("account_id") DO UPDATE SET
      "natural_balance_minor" =
        "samra_core"."ledger_account_balances"."natural_balance_minor"
          + EXCLUDED."natural_balance_minor",
      "available_balance_minor" =
        "samra_core"."ledger_account_balances"."available_balance_minor"
          + EXCLUDED."natural_balance_minor",
      "applied_posting_count" =
        "samra_core"."ledger_account_balances"."applied_posting_count"
          + EXCLUDED."applied_posting_count",
      "version" = "samra_core"."ledger_account_balances"."version" + 1,
      "updated_at" = now();
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "ledger_journals_apply_balance_projection"
AFTER UPDATE OF "state" ON "samra_core"."ledger_journals"
FOR EACH ROW EXECUTE FUNCTION "samra_core"."apply_posted_journal_to_balance"();
--> statement-breakpoint
CREATE FUNCTION "samra_core"."apply_hold_to_balance"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  hold_delta bigint;
  hold_count_delta bigint;
BEGIN
  IF TG_OP = 'INSERT' AND NEW."state" = 'active' THEN
    hold_delta := NEW."amount_minor";
    hold_count_delta := 1;
  ELSIF TG_OP = 'UPDATE' AND OLD."state" = 'active' AND NEW."state" <> 'active' THEN
    hold_delta := -OLD."amount_minor";
    hold_count_delta := -1;
  ELSE
    RETURN NEW;
  END IF;

  UPDATE "samra_core"."ledger_account_balances"
  SET "active_holds_minor" = "active_holds_minor" + hold_delta,
      "available_balance_minor" = "available_balance_minor" - hold_delta,
      "active_hold_count" = "active_hold_count" + hold_count_delta,
      "version" = "version" + 1,
      "updated_at" = now()
  WHERE "account_id" = NEW."ledger_account_id";

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ledger account % has no balance projection', NEW."ledger_account_id"
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "ledger_holds_apply_balance_projection"
AFTER INSERT OR UPDATE OF "state" ON "samra_core"."ledger_holds"
FOR EACH ROW EXECUTE FUNCTION "samra_core"."apply_hold_to_balance"();
--> statement-breakpoint
CREATE FUNCTION "samra_core"."guard_ledger_balance_rebuild_command"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ledger balance rebuild commands are immutable'
      USING ERRCODE = '55000';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW."state" <> 'requested' OR NEW."completed_at" IS NOT NULL
      OR NEW."drifted_account_count" IS NOT NULL THEN
      RAISE EXCEPTION 'ledger balance rebuild commands must begin requested'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF pg_trigger_depth() < 2 THEN
    RAISE EXCEPTION 'ledger balance rebuild commands cannot be edited directly'
      USING ERRCODE = '55000';
  END IF;
  IF OLD."state" <> 'requested' OR NEW."state" <> 'completed'
    OR NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."command_ref" IS DISTINCT FROM OLD."command_ref"
    OR NEW."actor_id" IS DISTINCT FROM OLD."actor_id"
    OR NEW."reason" IS DISTINCT FROM OLD."reason"
    OR NEW."requested_at" IS DISTINCT FROM OLD."requested_at" THEN
    RAISE EXCEPTION 'ledger balance rebuild command transition is invalid'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "ledger_balance_rebuild_commands_controlled"
BEFORE INSERT OR UPDATE OR DELETE ON "samra_core"."ledger_balance_rebuild_commands"
FOR EACH ROW EXECUTE FUNCTION "samra_core"."guard_ledger_balance_rebuild_command"();
--> statement-breakpoint
CREATE FUNCTION "samra_core"."execute_ledger_balance_rebuild"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  drift_count integer;
BEGIN
  SELECT count(*)::integer
  INTO drift_count
  FROM "samra_core"."ledger_account_balance_truth" AS truth
  FULL OUTER JOIN "samra_core"."ledger_account_balances" AS projection
    ON projection."account_id" = truth."account_id"
  WHERE projection."account_id" IS NULL OR truth."account_id" IS NULL
    OR projection."currency" IS DISTINCT FROM truth."currency"
    OR projection."natural_balance_minor" IS DISTINCT FROM truth."natural_balance_minor"
    OR projection."active_holds_minor" IS DISTINCT FROM truth."active_holds_minor"
    OR projection."available_balance_minor" IS DISTINCT FROM truth."available_balance_minor"
    OR projection."applied_posting_count" IS DISTINCT FROM truth."applied_posting_count"
    OR projection."active_hold_count" IS DISTINCT FROM truth."active_hold_count";

  INSERT INTO "samra_core"."ledger_account_balances"
    ("account_id", "currency", "natural_balance_minor", "active_holds_minor",
     "available_balance_minor", "applied_posting_count", "active_hold_count",
     "version", "updated_at")
  SELECT truth.account_id, truth.currency, truth.natural_balance_minor,
         truth.active_holds_minor, truth.available_balance_minor,
         truth.applied_posting_count, truth.active_hold_count, 1, now()
  FROM "samra_core"."ledger_account_balance_truth" AS truth
  ON CONFLICT ("account_id") DO UPDATE SET
    "currency" = EXCLUDED."currency",
    "natural_balance_minor" = EXCLUDED."natural_balance_minor",
    "active_holds_minor" = EXCLUDED."active_holds_minor",
    "available_balance_minor" = EXCLUDED."available_balance_minor",
    "applied_posting_count" = EXCLUDED."applied_posting_count",
    "active_hold_count" = EXCLUDED."active_hold_count",
    "version" = "samra_core"."ledger_account_balances"."version" + 1,
    "updated_at" = now();

  INSERT INTO "samra_core"."audit_events"
    ("event_key", "actor_type", "actor_id", "action", "entity_type",
     "entity_id", "correlation_id", "metadata", "occurred_at")
  VALUES ('ledger:balance-rebuild:' || NEW."command_ref", 'operator',
          NEW."actor_id", 'ledger_balance_projection_rebuilt',
          'ledger_balance_rebuild', NEW."id"::text, NEW."command_ref",
          jsonb_build_object('reason', NEW."reason",
                             'driftedAccountCount', drift_count), now());

  UPDATE "samra_core"."ledger_balance_rebuild_commands"
  SET "state" = 'completed', "drifted_account_count" = drift_count,
      "metadata" = jsonb_build_object('journalTruthRebuilt', true),
      "completed_at" = now()
  WHERE "id" = NEW."id";

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "ledger_balance_rebuild_commands_execute"
AFTER INSERT ON "samra_core"."ledger_balance_rebuild_commands"
FOR EACH ROW EXECUTE FUNCTION "samra_core"."execute_ledger_balance_rebuild"();
