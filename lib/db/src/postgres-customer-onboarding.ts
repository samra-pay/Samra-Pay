import { createHash, randomUUID } from "node:crypto";
import { DomainError } from "@workspace/remittance";
import {
  normalizeAuth0Issuer,
  normalizeAuth0Subject,
} from "./postgres-customer-identities";
import type { PostgresPersistenceContext } from "./postgres-persistence";

export const CUSTOMER_ONBOARDING_STATES = Object.freeze([
  "not_started",
  "authenticated",
  "consent_pending",
  "identity_in_progress",
  "identity_review",
  "identity_approved",
  "bank_link_pending",
  "bank_matched",
  "wallet_consent_pending",
  "wallet_provisioning",
  "wallet_ready",
  "funding_ready",
  "activated",
  "restricted",
] as const);

export type CustomerOnboardingState =
  (typeof CUSTOMER_ONBOARDING_STATES)[number];

export type CustomerConsentType =
  "terms_of_service" | "privacy_notice" | "electronic_communications";

export type CustomerConsentDecision = "accepted" | "declined";

export type CustomerConsentDocumentDefinition = Readonly<{
  consentType: CustomerConsentType;
  documentVersion: string;
  required: boolean;
}>;

export type CustomerConsentBundleSnapshot = Readonly<{
  bundleVersion: string;
  locale: string;
  legalEffect: "non_production";
  documents: readonly CustomerConsentDocumentDefinition[];
}>;

export const ALPHA_ONBOARDING_CONSENT_BUNDLE: CustomerConsentBundleSnapshot =
  Object.freeze({
    bundleVersion: "alpha-non-production-v1",
    locale: "en-US",
    legalEffect: "non_production" as const,
    documents: Object.freeze([
      Object.freeze({
        consentType: "terms_of_service" as const,
        documentVersion: "alpha-non-production-v1",
        required: true,
      }),
      Object.freeze({
        consentType: "privacy_notice" as const,
        documentVersion: "alpha-non-production-v1",
        required: true,
      }),
      Object.freeze({
        consentType: "electronic_communications" as const,
        documentVersion: "alpha-non-production-v1",
        required: true,
      }),
    ]),
  });

export type CustomerOnboardingSnapshot = Readonly<{
  onboardingId: string;
  customerId: string;
  state: CustomerOnboardingState;
  latestCompletedStep: string;
  reasonFamily: string | null;
  version: number;
  enteredAt: string;
  createdAt: string;
  updatedAt: string;
  nextAllowedActions: readonly string[];
  consentBundle: CustomerConsentBundleSnapshot;
}>;

export type StartCustomerOnboardingResult = Readonly<{
  snapshot: CustomerOnboardingSnapshot;
  created: boolean;
}>;

export type RecordCustomerConsentsResult = Readonly<{
  snapshot: CustomerOnboardingSnapshot;
  replayed: boolean;
}>;

export class CustomerOnboardingNotFoundError extends Error {
  constructor() {
    super(
      "The authenticated identity does not have a Samra Pay onboarding record.",
    );
    this.name = "CustomerOnboardingNotFoundError";
  }
}

export class CustomerOnboardingAccessRestrictedError extends Error {
  constructor() {
    super("The Samra Pay customer or authentication identity is restricted.");
    this.name = "CustomerOnboardingAccessRestrictedError";
  }
}

type IdentityCustomerRow = {
  identity_id: string;
  identity_state: "active" | "revoked";
  customer_id: string;
  customer_external_ref: string;
  customer_state: "active" | "suspended" | "closed";
};

type OnboardingRow = {
  id: string;
  customer_id: string;
  customer_external_ref: string;
  state: CustomerOnboardingState;
  latest_completed_step: string;
  reason_family: string | null;
  version: number;
  entered_at: Date;
  created_at: Date;
  updated_at: Date;
};

type ConsentDecisionInput = Readonly<{
  consentType: CustomerConsentType;
  documentVersion: string;
  decision: CustomerConsentDecision;
}>;

export class PostgresCustomerOnboardingStore {
  readonly #context: PostgresPersistenceContext;

  constructor(context: PostgresPersistenceContext) {
    this.#context = context;
  }

  async startAuth0Onboarding(input: {
    issuer: string;
    subject: string;
    idempotencyKey: string;
  }): Promise<StartCustomerOnboardingResult> {
    const issuer = normalizeAuth0Issuer(input.issuer);
    const subject = normalizeAuth0Subject(input.subject);
    const commandKey = hashCommandKey(
      normalizeIdempotencyKey(input.idempotencyKey),
    );

    return this.#context.run(async () => {
      await lockIdentity(this.#context, issuer, subject);
      let identity = await selectIdentityCustomer(
        this.#context,
        issuer,
        subject,
        true,
      );
      let createdCustomer = false;

      if (!identity) {
        const customerExternalRef = `customer_${randomUUID().replaceAll("-", "")}`;
        const customer = await this.#context.query().query<{ id: string }>(
          `INSERT INTO samra_core.customers
           (external_ref, display_name, country_code, state, metadata)
           VALUES ($1, NULL, NULL, 'active', $2::jsonb)
           RETURNING id`,
          [customerExternalRef, JSON.stringify({ profileStatus: "pending" })],
        );
        const customerId = customer.rows[0]!.id;
        const insertedIdentity = await this.#context
          .query()
          .query<{ id: string }>(
            `INSERT INTO samra_core.customer_auth_identities
             (customer_id, provider, issuer, subject)
             VALUES ($1, 'auth0', $2, $3)
             RETURNING id`,
            [customerId, issuer, subject],
          );
        identity = {
          identity_id: insertedIdentity.rows[0]!.id,
          identity_state: "active",
          customer_id: customerId,
          customer_external_ref: customerExternalRef,
          customer_state: "active",
        };
        createdCustomer = true;

        await this.#context.query().query(
          `INSERT INTO samra_core.audit_events
           (event_key, actor_type, actor_id, action, entity_type, entity_id,
            metadata)
           VALUES ($1, 'system', 'customer-onboarding',
                   'customer_auth_identity_bound', 'customer_auth_identity',
                   $2, $3::jsonb)`,
          [
            `customer-auth-identity:${identity.identity_id}:bound`,
            identity.identity_id,
            JSON.stringify({
              provider: "auth0",
              issuer,
              customerExternalRef,
              source: "customer_onboarding",
            }),
          ],
        );
      }

      assertIdentityAccess(identity);
      const existing = await selectOnboarding(
        this.#context,
        identity.customer_id,
        true,
      );
      if (existing) {
        return Object.freeze({
          snapshot: mapOnboarding(existing),
          created: false,
        });
      }

      const initialState: CustomerOnboardingState = createdCustomer
        ? "consent_pending"
        : "activated";
      const latestCompletedStep = createdCustomer
        ? "authenticated"
        : "activated";
      const inserted = await this.#context.query().query<OnboardingRow>(
        `INSERT INTO samra_core.customer_onboardings
         (customer_id, state, latest_completed_step, reason_family, version)
         VALUES ($1, $2, $3, NULL, 1)
         RETURNING id, customer_id, $4::text AS customer_external_ref, state,
                   latest_completed_step, reason_family, version, entered_at,
                   created_at, updated_at`,
        [
          identity.customer_id,
          initialState,
          latestCompletedStep,
          identity.customer_external_ref,
        ],
      );
      const onboarding = inserted.rows[0]!;
      await this.#context.query().query(
        `INSERT INTO samra_core.customer_onboarding_transitions
         (onboarding_id, sequence, from_state, to_state, reason_family,
          command_key)
         VALUES ($1, 1, NULL, $2, $3, $4)`,
        [
          onboarding.id,
          initialState,
          createdCustomer ? "authenticated" : "legacy_active_customer",
          `start:${commandKey}`,
        ],
      );
      await this.#context.query().query(
        `INSERT INTO samra_core.audit_events
         (event_key, actor_type, actor_id, action, entity_type, entity_id,
          metadata)
         VALUES ($1, 'customer', $2, 'customer_onboarding_started',
                 'customer_onboarding', $3, $4::jsonb)`,
        [
          `customer-onboarding:${onboarding.id}:version:1`,
          identity.customer_external_ref,
          onboarding.id,
          JSON.stringify({
            state: initialState,
            latestCompletedStep,
            customerCreated: createdCustomer,
            syntheticOnly: true,
          }),
        ],
      );
      return Object.freeze({
        snapshot: mapOnboarding(onboarding),
        created: true,
      });
    });
  }

  async getAuth0Onboarding(input: {
    issuer: string;
    subject: string;
  }): Promise<CustomerOnboardingSnapshot> {
    const issuer = normalizeAuth0Issuer(input.issuer);
    const subject = normalizeAuth0Subject(input.subject);
    const identity = await selectIdentityCustomer(
      this.#context,
      issuer,
      subject,
      false,
    );
    if (!identity) throw new CustomerOnboardingNotFoundError();
    assertIdentityAccess(identity);
    const onboarding = await selectOnboarding(
      this.#context,
      identity.customer_id,
      false,
    );
    if (!onboarding) throw new CustomerOnboardingNotFoundError();
    return mapOnboarding(onboarding);
  }

  async recordAuth0ConsentBundle(input: {
    issuer: string;
    subject: string;
    idempotencyKey: string;
    bundleVersion: string;
    locale: string;
    decisions: readonly ConsentDecisionInput[];
  }): Promise<RecordCustomerConsentsResult> {
    const issuer = normalizeAuth0Issuer(input.issuer);
    const subject = normalizeAuth0Subject(input.subject);
    const key = hashCommandKey(normalizeIdempotencyKey(input.idempotencyKey));
    const decisions = normalizeConsentDecisions(input);
    const requestHash = fingerprint({
      bundleVersion: input.bundleVersion,
      locale: input.locale,
      decisions,
    });

    return this.#context.run(async () => {
      await lockIdentity(this.#context, issuer, subject);
      const identity = await selectIdentityCustomer(
        this.#context,
        issuer,
        subject,
        true,
      );
      if (!identity) throw new CustomerOnboardingNotFoundError();
      assertIdentityAccess(identity);
      const onboarding = await selectOnboarding(
        this.#context,
        identity.customer_id,
        true,
      );
      if (!onboarding) throw new CustomerOnboardingNotFoundError();
      const scope = `${identity.customer_external_ref}:onboarding-consents`;

      const replay = await this.#context.query().query<{
        request_hash: string;
        response_body: Record<string, unknown> | null;
      }>(
        `SELECT request_hash, response_body
         FROM samra_core.idempotency_records
         WHERE scope = $1 AND idempotency_key = $2 AND state = 'succeeded'
         FOR UPDATE`,
        [scope, key],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_hash !== requestHash) {
          throw new DomainError(
            "CONFLICT",
            "The idempotency key was already used for different consent decisions.",
          );
        }
        return Object.freeze({
          snapshot: snapshotFromStoredResponse(replay.rows[0].response_body),
          replayed: true,
        });
      }

      if (onboarding.state !== "consent_pending") {
        throw new DomainError(
          "INVALID_TRANSITION",
          "Required consent decisions can be recorded only while consent is pending.",
        );
      }

      for (const decision of decisions) {
        await this.#context.query().query(
          `INSERT INTO samra_core.customer_consents
           (customer_id, onboarding_id, consent_type, document_version,
            bundle_version, decision, locale, channel, idempotency_key)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'api',$8)`,
          [
            identity.customer_id,
            onboarding.id,
            decision.consentType,
            decision.documentVersion,
            input.bundleVersion,
            decision.decision,
            input.locale,
            key,
          ],
        );
      }

      const allAccepted = decisions.every(
        (decision) => decision.decision === "accepted",
      );
      const nextState: CustomerOnboardingState = allAccepted
        ? "identity_in_progress"
        : "consent_pending";
      const nextVersion = onboarding.version + 1;
      const reasonFamily = allAccepted ? null : "required_consent_declined";
      const updated = await this.#context.query().query<OnboardingRow>(
        `UPDATE samra_core.customer_onboardings
         SET state = $2,
             latest_completed_step = $3,
             reason_family = $4,
             version = version + 1,
             entered_at = CASE WHEN state = $2 THEN entered_at ELSE now() END,
             updated_at = now()
         WHERE id = $1 AND version = $5
         RETURNING id, customer_id, $6::text AS customer_external_ref, state,
                   latest_completed_step, reason_family, version, entered_at,
                   created_at, updated_at`,
        [
          onboarding.id,
          nextState,
          allAccepted ? "required_consents" : onboarding.latest_completed_step,
          reasonFamily,
          onboarding.version,
          identity.customer_external_ref,
        ],
      );
      const updatedRow = updated.rows[0];
      if (!updatedRow) {
        throw new DomainError(
          "CONFLICT",
          "The onboarding state changed before consent could be recorded.",
        );
      }
      await this.#context.query().query(
        `INSERT INTO samra_core.customer_onboarding_transitions
         (onboarding_id, sequence, from_state, to_state, reason_family,
          command_key)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          onboarding.id,
          nextVersion,
          onboarding.state,
          nextState,
          reasonFamily,
          `consent:${key}`,
        ],
      );
      const snapshot = mapOnboarding(updatedRow);
      await this.#context.query().query(
        `INSERT INTO samra_core.audit_events
         (event_key, actor_type, actor_id, action, entity_type, entity_id,
          metadata)
         VALUES ($1, 'customer', $2, 'customer_consent_bundle_recorded',
                 'customer_onboarding', $3, $4::jsonb)`,
        [
          `customer-onboarding:${onboarding.id}:version:${nextVersion}`,
          identity.customer_external_ref,
          onboarding.id,
          JSON.stringify({
            bundleVersion: input.bundleVersion,
            locale: input.locale,
            consentTypes: decisions.map((decision) => decision.consentType),
            allRequiredAccepted: allAccepted,
            resultingState: nextState,
            onboardingVersion: nextVersion,
            syntheticOnly: true,
          }),
        ],
      );
      await this.#context.query().query(
        `INSERT INTO samra_core.idempotency_records
         (scope, idempotency_key, request_hash, state, resource_type,
          resource_id, response_status, response_body, completed_at, expires_at)
         VALUES ($1,$2,$3,'succeeded','customer_onboarding',$4,200,$5::jsonb,
                 now(),now() + interval '10 years')`,
        [scope, key, requestHash, onboarding.id, JSON.stringify(snapshot)],
      );
      return Object.freeze({ snapshot, replayed: false });
    });
  }
}

export type CustomerOnboardingStore = Pick<
  PostgresCustomerOnboardingStore,
  "startAuth0Onboarding" | "getAuth0Onboarding" | "recordAuth0ConsentBundle"
>;

async function lockIdentity(
  context: PostgresPersistenceContext,
  issuer: string,
  subject: string,
): Promise<void> {
  await context
    .query()
    .query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [
      `customer-onboarding:${issuer}:${subject}`,
    ]);
}

async function selectIdentityCustomer(
  context: PostgresPersistenceContext,
  issuer: string,
  subject: string,
  forUpdate: boolean,
): Promise<IdentityCustomerRow | undefined> {
  const result = await context.query().query<IdentityCustomerRow>(
    `SELECT identity.id AS identity_id, identity.state AS identity_state,
            customer.id AS customer_id,
            customer.external_ref AS customer_external_ref,
            customer.state AS customer_state
     FROM samra_core.customer_auth_identities identity
     JOIN samra_core.customers customer ON customer.id = identity.customer_id
     WHERE identity.provider = 'auth0'
       AND identity.issuer = $1 AND identity.subject = $2
     ${forUpdate ? "FOR UPDATE OF identity, customer" : ""}
     LIMIT 1`,
    [issuer, subject],
  );
  return result.rows[0];
}

async function selectOnboarding(
  context: PostgresPersistenceContext,
  customerId: string,
  forUpdate: boolean,
): Promise<OnboardingRow | undefined> {
  const result = await context.query().query<OnboardingRow>(
    `SELECT onboarding.id, onboarding.customer_id,
            customer.external_ref AS customer_external_ref,
            onboarding.state, onboarding.latest_completed_step,
            onboarding.reason_family, onboarding.version,
            onboarding.entered_at, onboarding.created_at,
            onboarding.updated_at
     FROM samra_core.customer_onboardings onboarding
     JOIN samra_core.customers customer ON customer.id = onboarding.customer_id
     WHERE onboarding.customer_id = $1
     ${forUpdate ? "FOR UPDATE OF onboarding" : ""}
     LIMIT 1`,
    [customerId],
  );
  return result.rows[0];
}

function assertIdentityAccess(identity: IdentityCustomerRow): void {
  if (
    identity.identity_state !== "active" ||
    identity.customer_state !== "active"
  ) {
    throw new CustomerOnboardingAccessRestrictedError();
  }
}

function normalizeConsentDecisions(input: {
  bundleVersion: string;
  locale: string;
  decisions: readonly ConsentDecisionInput[];
}): readonly ConsentDecisionInput[] {
  if (
    input.bundleVersion !== ALPHA_ONBOARDING_CONSENT_BUNDLE.bundleVersion ||
    input.locale !== ALPHA_ONBOARDING_CONSENT_BUNDLE.locale
  ) {
    throw new DomainError(
      "INVALID_ARGUMENT",
      "The consent bundle version or locale is not current.",
    );
  }
  const decisions = [...input.decisions].sort((left, right) =>
    left.consentType.localeCompare(right.consentType),
  );
  if (decisions.length !== ALPHA_ONBOARDING_CONSENT_BUNDLE.documents.length) {
    throw invalidConsentBundle();
  }
  for (const document of ALPHA_ONBOARDING_CONSENT_BUNDLE.documents) {
    const matches = decisions.filter(
      (decision) => decision.consentType === document.consentType,
    );
    if (
      matches.length !== 1 ||
      matches[0]!.documentVersion !== document.documentVersion ||
      !new Set(["accepted", "declined"]).has(matches[0]!.decision)
    ) {
      throw invalidConsentBundle();
    }
  }
  return Object.freeze(
    decisions.map((decision) =>
      Object.freeze({
        consentType: decision.consentType,
        documentVersion: decision.documentVersion,
        decision: decision.decision,
      }),
    ),
  );
}

function invalidConsentBundle(): DomainError {
  return new DomainError(
    "INVALID_ARGUMENT",
    "Every current required consent must have exactly one valid decision.",
  );
}

function normalizeIdempotencyKey(value: string): string {
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
  return value;
}

function hashCommandKey(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function fingerprint(value: Readonly<Record<string, unknown>>): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function mapOnboarding(row: OnboardingRow): CustomerOnboardingSnapshot {
  return Object.freeze({
    onboardingId: row.id,
    customerId: row.customer_external_ref,
    state: row.state,
    latestCompletedStep: row.latest_completed_step,
    reasonFamily: row.reason_family,
    version: row.version,
    enteredAt: row.entered_at.toISOString(),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    nextAllowedActions: nextAllowedActions(row.state),
    consentBundle: ALPHA_ONBOARDING_CONSENT_BUNDLE,
  });
}

function snapshotFromStoredResponse(
  value: Record<string, unknown> | null,
): CustomerOnboardingSnapshot {
  if (!value) {
    throw new DomainError(
      "CONFLICT",
      "The prior consent response could not be recovered.",
    );
  }
  const requiredStrings = [
    "onboardingId",
    "customerId",
    "state",
    "latestCompletedStep",
    "enteredAt",
    "createdAt",
    "updatedAt",
  ] as const;
  if (
    requiredStrings.some((key) => typeof value[key] !== "string") ||
    typeof value["version"] !== "number" ||
    !CUSTOMER_ONBOARDING_STATES.includes(
      value["state"] as CustomerOnboardingState,
    )
  ) {
    throw new DomainError(
      "CONFLICT",
      "The prior consent response could not be recovered.",
    );
  }
  const state = value["state"] as CustomerOnboardingState;
  const consentBundle = parseStoredConsentBundle(value["consentBundle"]);
  return Object.freeze({
    onboardingId: value["onboardingId"] as string,
    customerId: value["customerId"] as string,
    state,
    latestCompletedStep: value["latestCompletedStep"] as string,
    reasonFamily:
      typeof value["reasonFamily"] === "string" ? value["reasonFamily"] : null,
    version: value["version"] as number,
    enteredAt: value["enteredAt"] as string,
    createdAt: value["createdAt"] as string,
    updatedAt: value["updatedAt"] as string,
    nextAllowedActions:
      Array.isArray(value["nextAllowedActions"]) &&
      value["nextAllowedActions"].every((action) => typeof action === "string")
        ? Object.freeze([...value["nextAllowedActions"]])
        : nextAllowedActions(state),
    consentBundle,
  });
}

function parseStoredConsentBundle(
  value: unknown,
): CustomerConsentBundleSnapshot {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw unrecoverableConsentResponse();
  }
  const record = value as Record<string, unknown>;
  const documents = record["documents"];
  if (
    typeof record["bundleVersion"] !== "string" ||
    typeof record["locale"] !== "string" ||
    record["legalEffect"] !== "non_production" ||
    !Array.isArray(documents)
  ) {
    throw unrecoverableConsentResponse();
  }
  const parsedDocuments = documents.map((document) => {
    if (
      typeof document !== "object" ||
      document === null ||
      Array.isArray(document)
    ) {
      throw unrecoverableConsentResponse();
    }
    const item = document as Record<string, unknown>;
    if (
      !new Set<CustomerConsentType>([
        "terms_of_service",
        "privacy_notice",
        "electronic_communications",
      ]).has(item["consentType"] as CustomerConsentType) ||
      typeof item["documentVersion"] !== "string" ||
      typeof item["required"] !== "boolean"
    ) {
      throw unrecoverableConsentResponse();
    }
    return Object.freeze({
      consentType: item["consentType"] as CustomerConsentType,
      documentVersion: item["documentVersion"],
      required: item["required"],
    });
  });
  return Object.freeze({
    bundleVersion: record["bundleVersion"],
    locale: record["locale"],
    legalEffect: "non_production",
    documents: Object.freeze(parsedDocuments),
  });
}

function unrecoverableConsentResponse(): DomainError {
  return new DomainError(
    "CONFLICT",
    "The prior consent response could not be recovered.",
  );
}

function nextAllowedActions(state: CustomerOnboardingState): readonly string[] {
  const actions: Readonly<Record<CustomerOnboardingState, readonly string[]>> =
    {
      not_started: ["authenticate"],
      authenticated: ["review_required_consents"],
      consent_pending: [
        "review_required_consents",
        "submit_required_consents",
        "exit_onboarding",
      ],
      identity_in_progress: ["start_identity_verification", "exit_onboarding"],
      identity_review: ["await_identity_review", "contact_support"],
      identity_approved: ["continue_to_wallet_setup"],
      bank_link_pending: ["link_bank_account", "skip_if_allowed"],
      bank_matched: ["continue_to_wallet_setup"],
      wallet_consent_pending: ["review_wallet_terms"],
      wallet_provisioning: ["await_wallet_provisioning"],
      wallet_ready: ["choose_funding_method"],
      funding_ready: ["activate_customer"],
      activated: ["use_customer_products"],
      restricted: ["contact_support"],
    };
  return Object.freeze([...actions[state]]);
}
