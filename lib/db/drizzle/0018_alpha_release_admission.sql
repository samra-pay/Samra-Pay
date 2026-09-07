-- Admission starts closed. Operators raise the limit only after cohort acceptance.
CREATE TABLE samra_core.alpha_release_controls (
  release_id text PRIMARY KEY CHECK (release_id = 'alpha-release-1'),
  admission_limit smallint NOT NULL DEFAULT 0 CHECK (admission_limit IN (0, 1, 5, 25, 100))
);
--> statement-breakpoint
INSERT INTO samra_core.alpha_release_controls (release_id) VALUES ('alpha-release-1');
--> statement-breakpoint
-- Operator-provisioned eligibility; authentication claims and request bodies cannot grant it.
CREATE TABLE samra_core.alpha_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issuer text NOT NULL CHECK (length(issuer) BETWEEN 9 AND 2048),
  subject text NOT NULL CHECK (length(subject) BETWEEN 1 AND 255),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (issuer, subject)
);
--> statement-breakpoint
CREATE TABLE samra_core.alpha_admissions (
  slot smallint PRIMARY KEY CHECK (slot BETWEEN 1 AND 100),
  invitation_id uuid NOT NULL UNIQUE REFERENCES samra_core.alpha_invitations(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL UNIQUE REFERENCES samra_core.customers(id) ON DELETE RESTRICT,
  admitted_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
-- Slots are lifetime admissions, including subsequently revoked/closed accounts.
CREATE FUNCTION samra_core.guard_alpha_admission_immutability()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'alpha admission history is immutable' USING ERRCODE = '23514';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER alpha_admission_immutability_guard
BEFORE UPDATE OR DELETE ON samra_core.alpha_admissions
FOR EACH ROW EXECUTE FUNCTION samra_core.guard_alpha_admission_immutability();
--> statement-breakpoint
CREATE FUNCTION samra_core.guard_alpha_invitation_identity()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.issuer IS DISTINCT FROM OLD.issuer
     OR NEW.subject IS DISTINCT FROM OLD.subject THEN
    RAISE EXCEPTION 'alpha invitation identity is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER alpha_invitation_identity_guard
BEFORE UPDATE ON samra_core.alpha_invitations
FOR EACH ROW EXECUTE FUNCTION samra_core.guard_alpha_invitation_identity();
