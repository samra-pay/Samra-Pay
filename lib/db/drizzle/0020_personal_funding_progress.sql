-- Provider observations only. They confer no KYC entitlement or balance.
CREATE TABLE samra_core.personal_funding_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES samra_core.personal_funding_orders(id) ON DELETE RESTRICT,
  provider_order_ref uuid NOT NULL,
  payment_status text NOT NULL CHECK (payment_status IN
    ('unknown', 'requires-quote', 'requires-email', 'requires-recipient-verification',
     'requires-kyc', 'manual-kyc', 'failed-kyc', 'awaiting-payment', 'in-progress', 'completed')),
  delivery_status text NOT NULL CHECK (delivery_status IN
    ('not-reported', 'unknown', 'awaiting-payment', 'in-progress', 'failed', 'completed')),
  requested_at timestamptz NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (requested_at <= observed_at + interval '5 seconds')
);
--> statement-breakpoint
CREATE INDEX personal_funding_observations_order_time
ON samra_core.personal_funding_observations (order_id, requested_at DESC, observed_at DESC);
--> statement-breakpoint
CREATE FUNCTION samra_core.guard_personal_funding_observation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM samra_core.personal_funding_orders
    WHERE id = NEW.order_id AND state = 'checkout_created'
      AND provider_order_ref = NEW.provider_order_ref;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'personal funding observation does not match the existing order' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER personal_funding_observation_order_guard
BEFORE INSERT ON samra_core.personal_funding_observations
FOR EACH ROW EXECUTE FUNCTION samra_core.guard_personal_funding_observation();
--> statement-breakpoint
CREATE TRIGGER personal_funding_observations_append_only
BEFORE UPDATE OR DELETE ON samra_core.personal_funding_observations
FOR EACH ROW EXECUTE FUNCTION samra_core.guard_append_only_customer_onboarding_evidence();
