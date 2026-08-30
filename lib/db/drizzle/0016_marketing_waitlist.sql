CREATE TABLE "samra_core"."marketing_waitlist_contacts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" text NOT NULL,
  "email_hash" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "marketing_waitlist_contacts_email_chk"
    CHECK (length("email") BETWEEN 3 AND 254 AND "email" = lower(btrim("email"))),
  CONSTRAINT "marketing_waitlist_contacts_email_hash_chk"
    CHECK ("email_hash" ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX "marketing_waitlist_contacts_email_hash_uidx"
  ON "samra_core"."marketing_waitlist_contacts" ("email_hash");

CREATE TABLE "samra_core"."marketing_waitlist_consent_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "contact_id" uuid NOT NULL,
  "action" text NOT NULL,
  "notice_version" text NOT NULL,
  "locale" text NOT NULL,
  "command_key" text NOT NULL,
  "request_fingerprint" text NOT NULL,
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "marketing_waitlist_consent_events_action_chk"
    CHECK ("action" IN ('subscribed', 'unsubscribed')),
  CONSTRAINT "marketing_waitlist_consent_events_notice_version_chk"
    CHECK ("notice_version" ~ '^coming-soon-[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  CONSTRAINT "marketing_waitlist_consent_events_locale_chk"
    CHECK ("locale" IN ('en', 'am')),
  CONSTRAINT "marketing_waitlist_consent_events_command_key_chk"
    CHECK ("command_key" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "marketing_waitlist_consent_events_request_fingerprint_chk"
    CHECK ("request_fingerprint" ~ '^[0-9a-f]{64}$')
);

ALTER TABLE "samra_core"."marketing_waitlist_consent_events"
  ADD CONSTRAINT "marketing_waitlist_consent_events_contact_id_fk"
  FOREIGN KEY ("contact_id")
  REFERENCES "samra_core"."marketing_waitlist_contacts"("id")
  ON DELETE RESTRICT;

CREATE UNIQUE INDEX "marketing_waitlist_consent_events_command_uidx"
  ON "samra_core"."marketing_waitlist_consent_events" ("command_key");

CREATE INDEX "marketing_waitlist_consent_events_time_idx"
  ON "samra_core"."marketing_waitlist_consent_events" ("occurred_at");
