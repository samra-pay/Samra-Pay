CREATE TABLE samra_core.marketing_provider_events (
 event_hash text PRIMARY KEY CHECK(event_hash ~ '^[a-f0-9]{64}$'),
 payload_hash text NOT NULL CHECK(payload_hash ~ '^[a-f0-9]{64}$'),
 event_type text NOT NULL,
 received_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE samra_core.marketing_request_limits (
 bucket text PRIMARY KEY,
 window_start timestamptz NOT NULL,
 requests integer NOT NULL CHECK(requests > 0)
);
--> statement-breakpoint
CREATE TABLE samra_core.marketing_audience_sync (
 contact_id uuid NOT NULL REFERENCES samra_core.marketing_lead_profiles(contact_id) ON DELETE RESTRICT,
 destination text NOT NULL CHECK(destination IN ('meta','google','resend')),
 desired_member boolean NOT NULL,
 revision integer NOT NULL DEFAULT 1 CHECK(revision > 0),
 acknowledged_revision integer NOT NULL DEFAULT 0 CHECK(acknowledged_revision >= 0 AND acknowledged_revision <= revision),
 submitted_revision integer,
 submitted_member boolean,
 request_id text,
 state text NOT NULL DEFAULT 'idle' CHECK(state IN ('idle','submitting','pending','uncertain','blocked')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts >= 0),
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(contact_id,destination)
);
--> statement-breakpoint
CREATE INDEX marketing_audience_sync_ready ON samra_core.marketing_audience_sync(state,next_attempt_at);
--> statement-breakpoint
CREATE FUNCTION samra_core.queue_marketing_audience_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.ads_allowed IS DISTINCT FROM NEW.ads_allowed THEN
  INSERT INTO samra_core.marketing_audience_sync(contact_id,destination,desired_member)
  SELECT NEW.contact_id,provider,NEW.ads_allowed FROM unnest(ARRAY['meta','google']) AS provider
  ON CONFLICT(contact_id,destination) DO UPDATE SET desired_member=EXCLUDED.desired_member,
   revision=marketing_audience_sync.revision+1,updated_at=now();
 END IF;
 IF OLD.email_active IS DISTINCT FROM NEW.email_active THEN
  INSERT INTO samra_core.marketing_audience_sync(contact_id,destination,desired_member) VALUES(NEW.contact_id,'resend',NEW.email_active)
  ON CONFLICT(contact_id,destination) DO UPDATE SET desired_member=EXCLUDED.desired_member,
   revision=marketing_audience_sync.revision+1,updated_at=now();
 END IF;
 RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER marketing_audience_permission_change AFTER UPDATE OF ads_allowed,email_active ON samra_core.marketing_lead_profiles
FOR EACH ROW EXECUTE FUNCTION samra_core.queue_marketing_audience_change();
--> statement-breakpoint
INSERT INTO samra_core.marketing_audience_sync(contact_id,destination,desired_member)
SELECT p.contact_id,provider,p.ads_allowed FROM samra_core.marketing_lead_profiles p
CROSS JOIN unnest(ARRAY['meta','google']) AS provider
WHERE p.verified_at IS NOT NULL;
--> statement-breakpoint
CREATE TABLE samra_core.marketing_email_suppressions (
 email_hash text PRIMARY KEY CHECK(email_hash ~ '^[a-f0-9]{64}$'),
 reason text NOT NULL CHECK(reason IN ('unsubscribed','complained','bounced')),
 recorded_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE samra_core.marketing_audience_reconciliations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 contact_id uuid NOT NULL,
 destination text NOT NULL,
 submitted_revision integer NOT NULL,
 disposition text NOT NULL CHECK(disposition IN ('accepted','not_applied')),
 evidence_digest text NOT NULL CHECK(evidence_digest ~ '^[a-f0-9]{64}$'),
 recorded_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(contact_id,destination) REFERENCES samra_core.marketing_audience_sync(contact_id,destination) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TRIGGER marketing_audience_reconciliation_immutable BEFORE UPDATE OR DELETE ON samra_core.marketing_audience_reconciliations
FOR EACH ROW EXECUTE FUNCTION samra_core.guard_marketing_permission_history();
--> statement-breakpoint
INSERT INTO samra_core.marketing_audience_sync(contact_id,destination,desired_member)
SELECT contact_id,'resend',email_active FROM samra_core.marketing_lead_profiles WHERE verified_at IS NOT NULL;
