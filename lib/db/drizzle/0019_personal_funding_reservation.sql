-- Preparation only: no authorization, customer, wallet or money is seeded.
-- One operator-provisioned account and one purchase attempt for this pilot.
CREATE TABLE samra_core.personal_funding_authorizations (
  pilot_id text PRIMARY KEY CHECK (pilot_id = 'personal-funding-pilot'),
  customer_id uuid NOT NULL UNIQUE REFERENCES samra_core.customers(id) ON DELETE RESTRICT,
  environment text NOT NULL CHECK (environment IN ('staging', 'production')),
  wallet_address text NOT NULL CHECK (wallet_address ~ '^0x[0-9a-f]{40}$' AND wallet_address <> '0x0000000000000000000000000000000000000000'),
  provider_wallet_ref text NOT NULL CHECK (provider_wallet_ref = 'evm:' || wallet_address),
  max_amount_minor bigint NOT NULL CHECK (max_amount_minor BETWEEN 1 AND 2000),
  evidence_digest text NOT NULL CHECK (evidence_digest ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at)
);
--> statement-breakpoint
CREATE TABLE samra_core.personal_funding_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pilot_id text NOT NULL UNIQUE REFERENCES samra_core.personal_funding_authorizations(pilot_id) ON DELETE RESTRICT,
  command_key text NOT NULL CHECK (command_key ~ '^[0-9a-f]{64}$'),
  amount_minor bigint NOT NULL CHECK (amount_minor BETWEEN 1 AND 2000),
  state text NOT NULL CHECK (state IN ('reserved', 'provider_unknown', 'checkout_created')),
  provider_order_ref uuid UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((state = 'checkout_created') = (provider_order_ref IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE samra_core.personal_funding_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES samra_core.personal_funding_orders(id) ON DELETE RESTRICT,
  state text NOT NULL CHECK (state IN ('reserved', 'provider_unknown', 'checkout_created')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, state)
);
--> statement-breakpoint
CREATE FUNCTION samra_core.guard_personal_funding_authorization()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'personal funding authorization is immutable' USING ERRCODE = '23514';
  END IF;
  IF (to_jsonb(NEW) - 'revoked_at') IS DISTINCT FROM (to_jsonb(OLD) - 'revoked_at')
     OR (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at) THEN
    RAISE EXCEPTION 'personal funding authorization can only be revoked' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER personal_funding_authorization_guard
BEFORE UPDATE OR DELETE ON samra_core.personal_funding_authorizations
FOR EACH ROW EXECUTE FUNCTION samra_core.guard_personal_funding_authorization();
--> statement-breakpoint
CREATE FUNCTION samra_core.guard_personal_funding_order()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'personal funding orders cannot be deleted' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'INSERT' THEN
    PERFORM 1 FROM samra_core.personal_funding_authorizations
      WHERE pilot_id = NEW.pilot_id AND revoked_at IS NULL
        AND expires_at > now() AND max_amount_minor >= NEW.amount_minor
      FOR SHARE;
    IF NOT FOUND OR NEW.state <> 'reserved' THEN
      RAISE EXCEPTION 'personal funding authorization is unavailable' USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.id IS DISTINCT FROM OLD.id OR NEW.pilot_id IS DISTINCT FROM OLD.pilot_id
     OR NEW.command_key IS DISTINCT FROM OLD.command_key OR NEW.amount_minor IS DISTINCT FROM OLD.amount_minor
     OR NEW.created_at IS DISTINCT FROM OLD.created_at OR OLD.state <> 'reserved'
     OR NEW.state NOT IN ('provider_unknown', 'checkout_created') THEN
    RAISE EXCEPTION 'personal funding order transition is not permitted' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER personal_funding_order_guard
BEFORE INSERT OR UPDATE OR DELETE ON samra_core.personal_funding_orders
FOR EACH ROW EXECUTE FUNCTION samra_core.guard_personal_funding_order();
--> statement-breakpoint
CREATE TRIGGER personal_funding_events_append_only
BEFORE UPDATE OR DELETE ON samra_core.personal_funding_events
FOR EACH ROW EXECUTE FUNCTION samra_core.guard_append_only_customer_onboarding_evidence();
