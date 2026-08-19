import { createHash, randomUUID } from "node:crypto";
import { DomainError } from "@workspace/remittance";
import {
  CustomerOnboardingAccessRestrictedError,
  CustomerOnboardingNotFoundError,
} from "./postgres-customer-onboarding";
import {
  normalizeAuth0Issuer,
  normalizeAuth0Subject,
} from "./postgres-customer-identities";
import type { PostgresPersistenceContext } from "./postgres-persistence";

export const CUSTOMER_ACQUISITION_EVENT_TYPES = Object.freeze([
  "landing_view",
  "app_open",
  "quote_started",
  "quote_completed",
  "signup_started",
] as const);

export const CUSTOMER_ACQUISITION_CHANNELS = Object.freeze([
  "direct",
  "organic_search",
  "organic_social",
  "paid_search",
  "paid_social",
  "referral",
  "email",
  "partner",
  "offline",
  "unknown",
] as const);

export const CUSTOMER_FUNNEL_MILESTONES = Object.freeze([
  "linked_customer",
  "onboarding_started",
  "consent_completed",
  "identity_approved",
  "activated",
  "send_1_completed",
  "send_2_completed",
  "send_3_completed",
  "send_4_completed",
  "send_5_completed",
] as const);

export type CustomerAcquisitionEventType =
  (typeof CUSTOMER_ACQUISITION_EVENT_TYPES)[number];
export type CustomerAcquisitionPlatform = "web" | "mobile";
export type CustomerAcquisitionChannel =
  (typeof CUSTOMER_ACQUISITION_CHANNELS)[number];
export type CustomerFunnelMilestone =
  (typeof CUSTOMER_FUNNEL_MILESTONES)[number];

export type CustomerAcquisitionAttribution = Readonly<{
  channel: CustomerAcquisitionChannel;
  source: string | null;
  medium: string | null;
  campaign: string | null;
}>;

export type CustomerAcquisitionEventReceipt = Readonly<{
  sessionId: string;
  eventType: CustomerAcquisitionEventType;
  recorded: boolean;
  recordedAt: string;
  synthetic: true;
}>;

export type CustomerAcquisitionLinkReceipt = Readonly<{
  sessionId: string;
  customerId: string;
  linked: boolean;
  linkedAt: string;
  synthetic: true;
}>;

export type CustomerFunnelAttributionRow = CustomerAcquisitionAttribution &
  Readonly<{ customers: number }>;

export type CustomerFunnelReport = Readonly<{
  generatedAt: string;
  cohortFrom: string;
  cohortTo: string;
  eventSessions: Readonly<Record<CustomerAcquisitionEventType, number>>;
  milestones: Readonly<Record<CustomerFunnelMilestone, number>>;
  firstTouch: readonly CustomerFunnelAttributionRow[];
  lastNonDirect: readonly CustomerFunnelAttributionRow[];
  privacy: Readonly<{
    aggregateOnly: true;
    containsCustomerIdentifiers: false;
    acceptedDimensions: readonly ["channel", "source", "medium", "campaign"];
  }>;
}>;

type AcquisitionSessionRow = {
  id: string;
  external_ref: string;
  expires_at: Date;
};

type AcquisitionEventRow = {
  event_type: CustomerAcquisitionEventType;
  request_fingerprint: string;
  occurred_at: Date;
};

type AcquisitionLinkRow = {
  customer_id: string;
  customer_external_ref: string;
  linked_at: Date;
};

type AttributionRow = {
  channel: CustomerAcquisitionChannel;
  source: string | null;
  medium: string | null;
  campaign: string | null;
  customers: number;
};

const ACQUISITION_SESSION_LIFETIME_MS = 90 * 24 * 60 * 60 * 1_000;
const SESSION_PATTERN = /^acq_[0-9a-f]{32}$/;
const DIMENSION_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;

export class CustomerAcquisitionSessionNotFoundError extends Error {
  constructor() {
    super("The acquisition session does not exist or has expired.");
    this.name = "CustomerAcquisitionSessionNotFoundError";
  }
}

export interface CustomerFunnelStore {
  recordEvent(input: Readonly<{
    sessionId?: string;
    idempotencyKey: string;
    eventType: CustomerAcquisitionEventType;
    platform: CustomerAcquisitionPlatform;
    attribution: Readonly<{
      channel: CustomerAcquisitionChannel;
      source?: string | null;
      medium?: string | null;
      campaign?: string | null;
    }>;
  }>): Promise<CustomerAcquisitionEventReceipt>;
  bindAuth0Session(input: Readonly<{
    issuer: string;
    subject: string;
    sessionId: string;
    idempotencyKey: string;
  }>): Promise<CustomerAcquisitionLinkReceipt>;
  funnelReport(input: Readonly<{
    from: Date;
    to: Date;
    now?: Date;
  }>): Promise<CustomerFunnelReport>;
}

export class PostgresCustomerFunnelStore implements CustomerFunnelStore {
  readonly #context: PostgresPersistenceContext;

  constructor(context: PostgresPersistenceContext) {
    this.#context = context;
  }

  async recordEvent(input: Readonly<{
    sessionId?: string;
    idempotencyKey: string;
    eventType: CustomerAcquisitionEventType;
    platform: CustomerAcquisitionPlatform;
    attribution: Readonly<{
      channel: CustomerAcquisitionChannel;
      source?: string | null;
      medium?: string | null;
      campaign?: string | null;
    }>;
  }>): Promise<CustomerAcquisitionEventReceipt> {
    const sessionId = input.sessionId
      ? normalizeSessionId(input.sessionId)
      : `acq_${randomUUID().replaceAll("-", "")}`;
    const commandKey = hashVisibleCommand(input.idempotencyKey);
    const eventType = normalizeEventType(input.eventType);
    const platform = normalizePlatform(input.platform);
    const attribution = normalizeAttribution(input.attribution);
    const requestFingerprint = fingerprint({
      eventType,
      platform,
      attribution,
    });

    return this.#context.run(async () => {
      await lockSession(this.#context, sessionId);
      let session = await selectSession(this.#context, sessionId, true);
      if (!session) {
        const inserted = await this.#context
          .query()
          .query<AcquisitionSessionRow>(
            `INSERT INTO samra_core.customer_acquisition_sessions
             (external_ref, expires_at)
             VALUES ($1, $2)
             RETURNING id, external_ref, expires_at`,
            [
              sessionId,
              new Date(Date.now() + ACQUISITION_SESSION_LIFETIME_MS),
            ],
          );
        session = inserted.rows[0]!;
      } else if (session.expires_at.getTime() <= Date.now()) {
        throw new CustomerAcquisitionSessionNotFoundError();
      }

      const existing = await this.#context
        .query()
        .query<AcquisitionEventRow>(
          `SELECT event_type, request_fingerprint, occurred_at
             FROM samra_core.customer_acquisition_events
            WHERE session_id = $1 AND command_key = $2
            LIMIT 1`,
          [session.id, commandKey],
        );
      if (existing.rows[0]) {
        if (existing.rows[0].request_fingerprint !== requestFingerprint) {
          throw new DomainError(
            "CONFLICT",
            "The acquisition event idempotency key was reused with different input.",
          );
        }
        return Object.freeze({
          sessionId,
          eventType: existing.rows[0].event_type,
          recorded: false,
          recordedAt: existing.rows[0].occurred_at.toISOString(),
          synthetic: true as const,
        });
      }

      const inserted = await this.#context.query().query<{
        occurred_at: Date;
      }>(
        `INSERT INTO samra_core.customer_acquisition_events
         (session_id, command_key, request_fingerprint, event_type, platform,
          channel, source, medium, campaign)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING occurred_at`,
        [
          session.id,
          commandKey,
          requestFingerprint,
          eventType,
          platform,
          attribution.channel,
          attribution.source,
          attribution.medium,
          attribution.campaign,
        ],
      );
      return Object.freeze({
        sessionId,
        eventType,
        recorded: true,
        recordedAt: inserted.rows[0]!.occurred_at.toISOString(),
        synthetic: true as const,
      });
    });
  }

  async bindAuth0Session(input: Readonly<{
    issuer: string;
    subject: string;
    sessionId: string;
    idempotencyKey: string;
  }>): Promise<CustomerAcquisitionLinkReceipt> {
    const issuer = normalizeAuth0Issuer(input.issuer);
    const subject = normalizeAuth0Subject(input.subject);
    const sessionId = normalizeSessionId(input.sessionId);
    const commandKey = hashVisibleCommand(input.idempotencyKey);

    return this.#context.run(async () => {
      await lockSession(this.#context, sessionId);
      const session = await selectSession(this.#context, sessionId, true);
      if (!session || session.expires_at.getTime() <= Date.now()) {
        throw new CustomerAcquisitionSessionNotFoundError();
      }
      const identity = await this.#context.query().query<{
        customer_id: string;
        customer_external_ref: string;
        identity_state: "active" | "revoked";
        customer_state: "active" | "suspended" | "closed";
      }>(
        `SELECT identity.customer_id,
                customer.external_ref AS customer_external_ref,
                identity.state AS identity_state,
                customer.state AS customer_state
           FROM samra_core.customer_auth_identities identity
           JOIN samra_core.customers customer ON customer.id = identity.customer_id
          WHERE identity.provider = 'auth0'
            AND identity.issuer = $1 AND identity.subject = $2
          LIMIT 1
          FOR UPDATE OF identity, customer`,
        [issuer, subject],
      );
      const resolved = identity.rows[0];
      if (!resolved) throw new CustomerOnboardingNotFoundError();
      if (
        resolved.identity_state !== "active" ||
        resolved.customer_state !== "active"
      ) {
        throw new CustomerOnboardingAccessRestrictedError();
      }

      const existing = await this.#context
        .query()
        .query<AcquisitionLinkRow>(
          `SELECT link.customer_id,
                  customer.external_ref AS customer_external_ref,
                  link.linked_at
             FROM samra_core.customer_acquisition_links link
             JOIN samra_core.customers customer ON customer.id = link.customer_id
            WHERE link.session_id = $1
            LIMIT 1`,
          [session.id],
        );
      if (existing.rows[0]) {
        if (existing.rows[0].customer_id !== resolved.customer_id) {
          throw new DomainError(
            "CONFLICT",
            "The acquisition session is already linked to another customer.",
          );
        }
        return Object.freeze({
          sessionId,
          customerId: existing.rows[0].customer_external_ref,
          linked: false,
          linkedAt: existing.rows[0].linked_at.toISOString(),
          synthetic: true as const,
        });
      }

      const inserted = await this.#context.query().query<{ linked_at: Date }>(
        `INSERT INTO samra_core.customer_acquisition_links
         (session_id, customer_id, command_key)
         VALUES ($1,$2,$3)
         RETURNING linked_at`,
        [session.id, resolved.customer_id, commandKey],
      );
      await this.#context.query().query(
        `INSERT INTO samra_core.audit_events
         (event_key, actor_type, actor_id, action, entity_type, entity_id,
          metadata)
         VALUES ($1,'customer',$2,'customer_acquisition_session_linked',
                 'customer_acquisition_session',$3,$4::jsonb)`,
        [
          `customer-acquisition:${session.id}:linked`,
          resolved.customer_external_ref,
          session.id,
          JSON.stringify({ syntheticOnly: true }),
        ],
      );
      return Object.freeze({
        sessionId,
        customerId: resolved.customer_external_ref,
        linked: true,
        linkedAt: inserted.rows[0]!.linked_at.toISOString(),
        synthetic: true as const,
      });
    });
  }

  async funnelReport(input: Readonly<{
    from: Date;
    to: Date;
    now?: Date;
  }>): Promise<CustomerFunnelReport> {
    const from = normalizeReportDate(input.from, "cohortFrom");
    const to = normalizeReportDate(input.to, "cohortTo");
    const now = input.now ?? new Date();
    if (from >= to) {
      throw new DomainError(
        "INVALID_ARGUMENT",
        "The funnel cohort start must be before its end.",
      );
    }
    if (to.getTime() - from.getTime() > 366 * 24 * 60 * 60 * 1_000) {
      throw new DomainError(
        "INVALID_ARGUMENT",
        "The funnel cohort window cannot exceed 366 days.",
      );
    }

    const eventRows = await this.#context.query().query<{
      event_type: CustomerAcquisitionEventType;
      sessions: string;
    }>(
      `SELECT event_type, count(DISTINCT session_id)::text AS sessions
         FROM samra_core.customer_acquisition_events
        WHERE occurred_at >= $1 AND occurred_at < $2
        GROUP BY event_type
        ORDER BY event_type`,
      [from, to],
    );
    const cohortSql = customerCohortSql();
    const milestoneRows = await this.#context.query().query<{
      linked_customer: string;
      onboarding_started: string;
      consent_completed: string;
      identity_approved: string;
      activated: string;
      send_1_completed: string;
      send_2_completed: string;
      send_3_completed: string;
      send_4_completed: string;
      send_5_completed: string;
    }>(
      `${cohortSql}
       SELECT
         count(*)::text AS linked_customer,
         count(*) FILTER (WHERE onboarding.id IS NOT NULL)::text
           AS onboarding_started,
         count(*) FILTER (WHERE consent.customer_id IS NOT NULL)::text
           AS consent_completed,
         count(*) FILTER (WHERE identity_case.state = 'approved')::text
           AS identity_approved,
         count(*) FILTER (WHERE onboarding.state = 'activated')::text
           AS activated,
         count(*) FILTER (WHERE COALESCE(sends.completed_sends, 0) >= 1)::text
           AS send_1_completed,
         count(*) FILTER (WHERE COALESCE(sends.completed_sends, 0) >= 2)::text
           AS send_2_completed,
         count(*) FILTER (WHERE COALESCE(sends.completed_sends, 0) >= 3)::text
           AS send_3_completed,
         count(*) FILTER (WHERE COALESCE(sends.completed_sends, 0) >= 4)::text
           AS send_4_completed,
         count(*) FILTER (WHERE COALESCE(sends.completed_sends, 0) >= 5)::text
           AS send_5_completed
       FROM cohort
       LEFT JOIN samra_core.customer_onboardings onboarding
         ON onboarding.customer_id = cohort.customer_id
       LEFT JOIN samra_core.customer_identity_cases identity_case
         ON identity_case.customer_id = cohort.customer_id
       LEFT JOIN (
         SELECT customer_id
           FROM samra_core.customer_consents
          WHERE consent_type IN ('terms_of_service','privacy_notice','electronic_communications')
            AND decision = 'accepted'
          GROUP BY customer_id
         HAVING count(DISTINCT consent_type) = 3
       ) consent ON consent.customer_id = cohort.customer_id
       LEFT JOIN (
         SELECT customer_id, count(*)::integer AS completed_sends
           FROM samra_core.remittance_transfers
          WHERE state = 'completed'
          GROUP BY customer_id
       ) sends ON sends.customer_id = cohort.customer_id`,
      [from, to],
    );
    const attributionRows = await this.#context.query().query<
      AttributionRow & { model: "first_touch" | "last_non_direct" }
    >(
      `${cohortSql}
       SELECT 'first_touch'::text AS model, first_channel AS channel,
              first_source AS source, first_medium AS medium,
              first_campaign AS campaign, count(*)::integer AS customers
         FROM cohort
        GROUP BY first_channel, first_source, first_medium, first_campaign
       UNION ALL
       SELECT 'last_non_direct'::text AS model,
              COALESCE(last_channel, first_channel) AS channel,
              CASE WHEN last_channel IS NULL THEN first_source ELSE last_source END AS source,
              CASE WHEN last_channel IS NULL THEN first_medium ELSE last_medium END AS medium,
              CASE WHEN last_channel IS NULL THEN first_campaign ELSE last_campaign END AS campaign,
              count(*)::integer AS customers
         FROM cohort
        GROUP BY COALESCE(last_channel, first_channel),
                 CASE WHEN last_channel IS NULL THEN first_source ELSE last_source END,
                 CASE WHEN last_channel IS NULL THEN first_medium ELSE last_medium END,
                 CASE WHEN last_channel IS NULL THEN first_campaign ELSE last_campaign END
       ORDER BY model, customers DESC, channel, source NULLS LAST,
                medium NULLS LAST, campaign NULLS LAST`,
      [from, to],
    );

    const eventSessions = Object.fromEntries(
      CUSTOMER_ACQUISITION_EVENT_TYPES.map((eventType) => [eventType, 0]),
    ) as Record<CustomerAcquisitionEventType, number>;
    for (const row of eventRows.rows) {
      eventSessions[row.event_type] = Number(row.sessions);
    }
    const counts = milestoneRows.rows[0] ?? emptyMilestoneRow();
    return Object.freeze({
      generatedAt: now.toISOString(),
      cohortFrom: from.toISOString(),
      cohortTo: to.toISOString(),
      eventSessions: Object.freeze(eventSessions),
      milestones: Object.freeze(
        Object.fromEntries(
          CUSTOMER_FUNNEL_MILESTONES.map((milestone) => [
            milestone,
            Number(counts[milestone]),
          ]),
        ) as Record<CustomerFunnelMilestone, number>,
      ),
      firstTouch: mapAttribution(
        attributionRows.rows.filter((row) => row.model === "first_touch"),
      ),
      lastNonDirect: mapAttribution(
        attributionRows.rows.filter((row) => row.model === "last_non_direct"),
      ),
      privacy: Object.freeze({
        aggregateOnly: true as const,
        containsCustomerIdentifiers: false as const,
        acceptedDimensions: Object.freeze([
          "channel",
          "source",
          "medium",
          "campaign",
        ] as const),
      }),
    });
  }
}

function customerCohortSql(): string {
  return `WITH eligible_events AS (
    SELECT link.customer_id, event.id, event.channel, event.source,
           event.medium, event.campaign, event.occurred_at
      FROM samra_core.customer_acquisition_links link
      JOIN samra_core.customer_acquisition_events event
        ON event.session_id = link.session_id
     WHERE event.occurred_at <= link.linked_at
  ), first_touch AS (
    SELECT DISTINCT ON (customer_id)
           customer_id, channel AS first_channel, source AS first_source,
           medium AS first_medium, campaign AS first_campaign,
           occurred_at AS first_occurred_at
      FROM eligible_events
     ORDER BY customer_id, occurred_at, id
  ), last_non_direct AS (
    SELECT DISTINCT ON (customer_id)
           customer_id, channel AS last_channel, source AS last_source,
           medium AS last_medium, campaign AS last_campaign
      FROM eligible_events
     WHERE channel NOT IN ('direct','unknown')
     ORDER BY customer_id, occurred_at DESC, id DESC
  ), cohort AS (
    SELECT first_touch.*, last_non_direct.last_channel,
           last_non_direct.last_source, last_non_direct.last_medium,
           last_non_direct.last_campaign
      FROM first_touch
      LEFT JOIN last_non_direct USING (customer_id)
     WHERE first_occurred_at >= $1 AND first_occurred_at < $2
  )`;
}

function mapAttribution(rows: readonly AttributionRow[]) {
  return Object.freeze(
    rows.map((row) =>
      Object.freeze({
        channel: row.channel,
        source: row.source,
        medium: row.medium,
        campaign: row.campaign,
        customers: Number(row.customers),
      }),
    ),
  );
}

function emptyMilestoneRow(): Record<CustomerFunnelMilestone, string> {
  return Object.fromEntries(
    CUSTOMER_FUNNEL_MILESTONES.map((milestone) => [milestone, "0"]),
  ) as Record<CustomerFunnelMilestone, string>;
}

async function lockSession(
  context: PostgresPersistenceContext,
  sessionId: string,
): Promise<void> {
  await context
    .query()
    .query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [
      `customer-acquisition:${sessionId}`,
    ]);
}

async function selectSession(
  context: PostgresPersistenceContext,
  sessionId: string,
  forUpdate: boolean,
): Promise<AcquisitionSessionRow | undefined> {
  const result = await context.query().query<AcquisitionSessionRow>(
    `SELECT id, external_ref, expires_at
       FROM samra_core.customer_acquisition_sessions
      WHERE external_ref = $1
      ${forUpdate ? "FOR UPDATE" : ""}
      LIMIT 1`,
    [sessionId],
  );
  return result.rows[0];
}

function normalizeSessionId(value: string): string {
  if (!SESSION_PATTERN.test(value)) {
    throw new DomainError(
      "INVALID_ARGUMENT",
      "The acquisition session ID is invalid.",
    );
  }
  return value;
}

function normalizeEventType(value: CustomerAcquisitionEventType) {
  if (!CUSTOMER_ACQUISITION_EVENT_TYPES.includes(value)) {
    throw new DomainError(
      "INVALID_ARGUMENT",
      "The acquisition event type is not allowed.",
    );
  }
  return value;
}

function normalizePlatform(value: CustomerAcquisitionPlatform) {
  if (value !== "web" && value !== "mobile") {
    throw new DomainError(
      "INVALID_ARGUMENT",
      "The acquisition platform must be web or mobile.",
    );
  }
  return value;
}

function normalizeAttribution(input: {
  channel: CustomerAcquisitionChannel;
  source?: string | null;
  medium?: string | null;
  campaign?: string | null;
}): CustomerAcquisitionAttribution {
  if (!CUSTOMER_ACQUISITION_CHANNELS.includes(input.channel)) {
    throw new DomainError(
      "INVALID_ARGUMENT",
      "The acquisition channel is not allowed.",
    );
  }
  return Object.freeze({
    channel: input.channel,
    source: normalizeDimension(input.source, "source"),
    medium: normalizeDimension(input.medium, "medium"),
    campaign: normalizeDimension(input.campaign, "campaign"),
  });
}

function normalizeDimension(
  value: string | null | undefined,
  field: string,
): string | null {
  if (value === undefined || value === null || value === "") return null;
  const normalized = value.trim().toLowerCase();
  if (!DIMENSION_PATTERN.test(normalized)) {
    throw new DomainError(
      "INVALID_ARGUMENT",
      `Acquisition ${field} must be a 1 to 64 character lowercase slug.`,
    );
  }
  return normalized;
}

function hashVisibleCommand(value: string): string {
  if (
    value.length < 8 ||
    value.length > 128 ||
    value !== value.trim() ||
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw new DomainError(
      "INVALID_ARGUMENT",
      "Idempotency-Key must be 8 to 128 visible characters.",
    );
  }
  return createHash("sha256").update(value).digest("hex");
}

function fingerprint(value: Readonly<Record<string, unknown>>): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function normalizeReportDate(value: Date, field: string): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new DomainError("INVALID_ARGUMENT", `${field} must be a valid date.`);
  }
  return value;
}
