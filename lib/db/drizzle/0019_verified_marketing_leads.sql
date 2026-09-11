CREATE TABLE samra_core.marketing_lead_profiles (
 contact_id uuid PRIMARY KEY REFERENCES samra_core.marketing_waitlist_contacts(id) ON DELETE RESTRICT,
 verified_at timestamptz,
 email_active boolean NOT NULL DEFAULT false,
 ads_allowed boolean NOT NULL DEFAULT false,
 suppressed_at timestamptz,
 first_touch jsonb NOT NULL DEFAULT '{}',
 signup_touch jsonb NOT NULL DEFAULT '{}',
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (NOT ads_allowed OR (verified_at IS NOT NULL AND email_active AND suppressed_at IS NULL)),
 CHECK (jsonb_typeof(first_touch) = 'object' AND octet_length(first_touch::text) <= 1024),
 CHECK (jsonb_typeof(signup_touch) = 'object' AND octet_length(signup_touch::text) <= 1024)
);
--> statement-breakpoint
CREATE TABLE samra_core.marketing_lead_requests (
 command_hash text PRIMARY KEY CHECK (command_hash ~ '^[a-f0-9]{64}$'),
 fingerprint text NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
 contact_id uuid NOT NULL REFERENCES samra_core.marketing_lead_profiles(contact_id) ON DELETE RESTRICT,
 accepted_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE samra_core.marketing_lead_challenges (
 id uuid PRIMARY KEY,
 contact_id uuid NOT NULL REFERENCES samra_core.marketing_lead_profiles(contact_id) ON DELETE RESTRICT,
 command_hash text NOT NULL UNIQUE CHECK (command_hash ~ '^[a-f0-9]{64}$'),
 fingerprint text NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
 token_digest text NOT NULL UNIQUE CHECK (token_digest ~ '^[a-f0-9]{64}$'),
 key_version text NOT NULL CHECK (key_version ~ '^[a-z0-9_-]{1,32}$'),
 notice_version text NOT NULL CHECK (notice_version ~ '^marketing-[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
 ads_requested boolean NOT NULL DEFAULT false,
 locale text NOT NULL CHECK (locale IN ('en','am')),
 attribution jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 consumed_at timestamptz,
 cancelled_at timestamptz,
 sent_at timestamptz,
 lease_id uuid,
 lease_until timestamptz,
 attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
 CHECK (expires_at > created_at AND expires_at <= created_at + interval '24 hours'),
 CHECK (jsonb_typeof(attribution) = 'object' AND octet_length(attribution::text) <= 1024)
);
--> statement-breakpoint
CREATE INDEX marketing_lead_challenges_contact_created ON samra_core.marketing_lead_challenges(contact_id, created_at);
--> statement-breakpoint
CREATE TABLE samra_core.marketing_lead_permissions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 contact_id uuid NOT NULL REFERENCES samra_core.marketing_lead_profiles(contact_id) ON DELETE RESTRICT,
 purpose text NOT NULL CHECK (purpose IN ('email_updates','ads_matching')),
 granted boolean NOT NULL,
 notice_version text NOT NULL,
 reason text NOT NULL CHECK (reason IN ('confirmed','withdrawn','unsubscribed','complained','bounced')),
 command_hash text NOT NULL CHECK (command_hash ~ '^[a-f0-9]{64}$'),
 occurred_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(contact_id, purpose, command_hash)
);
--> statement-breakpoint
CREATE TABLE samra_core.marketing_audience_removals (
 contact_id uuid NOT NULL REFERENCES samra_core.marketing_lead_profiles(contact_id) ON DELETE RESTRICT,
 destination text NOT NULL CHECK (destination IN ('meta','google')),
 revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
 requested_at timestamptz NOT NULL DEFAULT now(),
 completed_revision integer NOT NULL DEFAULT 0 CHECK (completed_revision >= 0 AND completed_revision <= revision),
 PRIMARY KEY(contact_id, destination)
);
--> statement-breakpoint
CREATE FUNCTION samra_core.guard_marketing_permission_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'marketing permission history is append-only' USING ERRCODE = '23514';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER marketing_permission_history_immutable BEFORE UPDATE OR DELETE ON samra_core.marketing_lead_permissions
FOR EACH ROW EXECUTE FUNCTION samra_core.guard_marketing_permission_history();
