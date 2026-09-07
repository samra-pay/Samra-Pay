import { createHash, randomUUID } from "node:crypto";
import { DomainError } from "@workspace/remittance";
import {
  CustomerOnboardingAccessRestrictedError,
  CustomerOnboardingNotFoundError,
  type CustomerOnboardingState,
} from "./postgres-customer-onboarding";
import {
  normalizeAuth0Issuer,
  normalizeAuth0Subject,
} from "./postgres-customer-identities";
import type { PostgresPersistenceContext } from "./postgres-persistence";

export const CUSTOMER_IDENTITY_CASE_STATES = Object.freeze([
  "created",
  "pending",
  "review",
  "approved",
  "declined",
  "error",
] as const);

export type CustomerIdentityCaseState =
  (typeof CUSTOMER_IDENTITY_CASE_STATES)[number];

export type CustomerIdentityProviderDecision = Exclude<
  CustomerIdentityCaseState,
  "created"
>;

export type CustomerIdentityCaseSnapshot = Readonly<{
  identityCaseId: string;
  state: CustomerIdentityCaseState;
  reasonFamily: string | null;
  provider: "persona";
  synthetic: true;
  version: number;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
  nextAllowedActions: readonly string[];
}>;

export type PreparedCustomerIdentityCase = Readonly<{
  snapshot: CustomerIdentityCaseSnapshot;
  providerRequestKey: string;
  created: boolean;
}>;

export type CustomerIdentityProviderEventResult = Readonly<{
  snapshot: CustomerIdentityCaseSnapshot;
  replayed: boolean;
  disposition: "applied" | "ignored_stale" | "conflict";
}>;

export class CustomerIdentityCaseNotFoundError extends Error {
  constructor() {
    super("The authenticated customer does not have an identity case.");
    this.name = "CustomerIdentityCaseNotFoundError";
  }
}

type IdentityContextRow = {
  identity_state: "active" | "revoked";
  customer_id: string;
  customer_external_ref: string;
  customer_state: "active" | "suspended" | "closed";
  onboarding_id: string;
  onboarding_state: CustomerOnboardingState;
  onboarding_version: number;
};

type IdentityCaseRow = {
  id: string;
  external_ref: string;
  customer_id: string;
  onboarding_id: string;
  provider: "persona";
  provider_request_key: string;
  provider_inquiry_ref: string | null;
  state: CustomerIdentityCaseState;
  reason_family: string | null;
  version: number;
  decided_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

type ExistingProviderEventRow = {
  identity_case_id: string;
  event_type: string;
  normalized_decision: CustomerIdentityProviderDecision;
  disposition: "applied" | "ignored_stale" | "conflict";
  payload_digest: string;
};

export class PostgresCustomerIdentityCaseStore {
  readonly #context: PostgresPersistenceContext;

  constructor(context: PostgresPersistenceContext) {
    this.#context = context;
  }

  async prepareAuth0IdentityCase(input: {
    issuer: string;
    subject: string;
    idempotencyKey: string;
  }): Promise<PreparedCustomerIdentityCase> {
    const issuer = normalizeAuth0Issuer(input.issuer);
    const subject = normalizeAuth0Subject(input.subject);
    const commandKey = hashCommandKey(
      normalizeVisibleValue(input.idempotencyKey, "Idempotency-Key", 8, 128),
    );

    return this.#context.run(async () => {
      await lockIdentity(this.#context, issuer, subject);
      const identity = await selectIdentityContext(
        this.#context,
        issuer,
        subject,
        true,
      );
      if (!identity) throw new CustomerOnboardingNotFoundError();
      assertIdentityAccess(identity);

      const existing = await selectCaseByOnboarding(
        this.#context,
        identity.onboarding_id,
        true,
      );
      if (existing) {
        return Object.freeze({
          snapshot: mapIdentityCase(existing),
          providerRequestKey: existing.provider_request_key,
          created: false,
        });
      }
      if (identity.onboarding_state !== "identity_in_progress") {
        throw new DomainError(
          "INVALID_TRANSITION",
          "Identity verification can begin only after required consent is complete.",
        );
      }

      const externalRef = `identity_case_${randomUUID().replaceAll("-", "")}`;
      const providerRequestKey = fingerprint({
        provider: "persona",
        identityCaseId: externalRef,
      });
      const inserted = await this.#context.query().query<IdentityCaseRow>(
        `INSERT INTO samra_core.customer_identity_cases
         (external_ref, customer_id, onboarding_id, provider,
          provider_request_key, state)
         VALUES ($1,$2,$3,'persona',$4,'created')
         RETURNING id, external_ref, customer_id, onboarding_id, provider,
                   provider_request_key, provider_inquiry_ref, state,
                   reason_family, version, decided_at, created_at, updated_at`,
        [
          externalRef,
          identity.customer_id,
          identity.onboarding_id,
          providerRequestKey,
        ],
      );
      const identityCase = inserted.rows[0]!;
      await this.#context.query().query(
        `INSERT INTO samra_core.customer_identity_case_transitions
         (identity_case_id, sequence, from_state, to_state, reason_family,
          command_key)
         VALUES ($1,1,NULL,'created',NULL,$2)`,
        [identityCase.id, `start:${commandKey}`],
      );
      await this.#context.query().query(
        `INSERT INTO samra_core.audit_events
         (event_key, actor_type, actor_id, action, entity_type, entity_id,
          metadata)
         VALUES ($1,'customer',$2,'customer_identity_case_created',
                 'customer_identity_case',$3,$4::jsonb)`,
        [
          `customer-identity-case:${identityCase.id}:version:1`,
          identity.customer_external_ref,
          identityCase.id,
          JSON.stringify({
            provider: "persona",
            state: "created",
            onboardingId: identity.onboarding_id,
            syntheticOnly: true,
          }),
        ],
      );
      return Object.freeze({
        snapshot: mapIdentityCase(identityCase),
        providerRequestKey,
        created: true,
      });
    });
  }

  async attachProviderInquiry(input: {
    identityCaseId: string;
    providerRequestKey: string;
    providerInquiryRef: string;
  }): Promise<CustomerIdentityCaseSnapshot> {
    const identityCaseId = normalizeVisibleValue(
      input.identityCaseId,
      "identity case ID",
      8,
      128,
    );
    const providerRequestKey = normalizeDigest(
      input.providerRequestKey,
      "provider request key",
    );
    const providerInquiryRef = normalizeVisibleValue(
      input.providerInquiryRef,
      "provider inquiry reference",
      1,
      255,
    );

    return this.#context.run(async () => {
      const identityCase = await selectCaseByExternalRef(
        this.#context,
        identityCaseId,
        true,
      );
      if (!identityCase) throw new CustomerIdentityCaseNotFoundError();
      if (identityCase.provider_request_key !== providerRequestKey) {
        throw new DomainError(
          "CONFLICT",
          "The provider request does not belong to this identity case.",
        );
      }
      if (identityCase.provider_inquiry_ref !== null) {
        if (identityCase.provider_inquiry_ref !== providerInquiryRef) {
          throw new DomainError(
            "CONFLICT",
            "The identity case is already bound to another provider inquiry.",
          );
        }
        return mapIdentityCase(identityCase);
      }
      if (
        !new Set<CustomerIdentityCaseState>(["created", "error"]).has(
          identityCase.state,
        )
      ) {
        throw invalidIdentityTransition();
      }

      const nextVersion = identityCase.version + 1;
      const updated = await this.#context.query().query<IdentityCaseRow>(
        `UPDATE samra_core.customer_identity_cases
         SET provider_inquiry_ref = $2, state = 'pending', reason_family = NULL,
             version = version + 1, updated_at = now()
         WHERE id = $1 AND version = $3
         RETURNING id, external_ref, customer_id, onboarding_id, provider,
                   provider_request_key, provider_inquiry_ref, state,
                   reason_family, version, decided_at, created_at, updated_at`,
        [identityCase.id, providerInquiryRef, identityCase.version],
      );
      const updatedRow = updated.rows[0];
      if (!updatedRow) throw identityConcurrencyConflict();
      await appendCaseTransition(this.#context, {
        identityCase,
        nextState: "pending",
        nextVersion,
        reasonFamily: null,
        commandKey: `provider-inquiry:${hashCommandKey(providerInquiryRef)}`,
      });
      await appendIdentityAudit(this.#context, {
        identityCase: updatedRow,
        actorId: "customer-identity-provider",
        action: "customer_identity_inquiry_attached",
        metadata: {
          provider: "persona",
          state: "pending",
          syntheticOnly: true,
        },
      });
      return mapIdentityCase(updatedRow);
    });
  }

  async recordProviderStartFailure(input: {
    identityCaseId: string;
    reasonFamily: string;
  }): Promise<CustomerIdentityCaseSnapshot> {
    const identityCaseId = normalizeVisibleValue(
      input.identityCaseId,
      "identity case ID",
      8,
      128,
    );
    const reasonFamily = normalizeVisibleValue(
      input.reasonFamily,
      "reason family",
      1,
      64,
    );
    return this.#context.run(async () => {
      const identityCase = await selectCaseByExternalRef(
        this.#context,
        identityCaseId,
        true,
      );
      if (!identityCase) throw new CustomerIdentityCaseNotFoundError();
      if (identityCase.state === "error") return mapIdentityCase(identityCase);
      if (identityCase.state !== "created")
        return mapIdentityCase(identityCase);
      const nextVersion = identityCase.version + 1;
      const updated = await this.#context.query().query<IdentityCaseRow>(
        `UPDATE samra_core.customer_identity_cases
         SET state = 'error', reason_family = $2, version = version + 1,
             updated_at = now()
         WHERE id = $1 AND version = $3
         RETURNING id, external_ref, customer_id, onboarding_id, provider,
                   provider_request_key, provider_inquiry_ref, state,
                   reason_family, version, decided_at, created_at, updated_at`,
        [identityCase.id, reasonFamily, identityCase.version],
      );
      const updatedRow = updated.rows[0];
      if (!updatedRow) throw identityConcurrencyConflict();
      await appendCaseTransition(this.#context, {
        identityCase,
        nextState: "error",
        nextVersion,
        reasonFamily,
        commandKey: `provider-start-error:${nextVersion}`,
      });
      await appendIdentityAudit(this.#context, {
        identityCase: updatedRow,
        actorId: "customer-identity-provider",
        action: "customer_identity_inquiry_start_failed",
        metadata: { provider: "persona", reasonFamily, syntheticOnly: true },
      });
      return mapIdentityCase(updatedRow);
    });
  }

  async getAuth0IdentityCase(input: {
    issuer: string;
    subject: string;
  }): Promise<CustomerIdentityCaseSnapshot> {
    const issuer = normalizeAuth0Issuer(input.issuer);
    const subject = normalizeAuth0Subject(input.subject);
    const identity = await selectIdentityContext(
      this.#context,
      issuer,
      subject,
      false,
    );
    if (!identity) throw new CustomerOnboardingNotFoundError();
    assertIdentityAccess(identity);
    const identityCase = await selectCaseByOnboarding(
      this.#context,
      identity.onboarding_id,
      false,
    );
    if (!identityCase) throw new CustomerIdentityCaseNotFoundError();
    return mapIdentityCase(identityCase);
  }

  /** Server-only target; never include this mapping in normalized case responses. */
  async getAuth0IdentityLaunchTarget(input: {
    issuer: string;
    subject: string;
  }): Promise<
    Readonly<{ identityCaseId: string; providerInquiryRef: string }>
  > {
    const identity = await selectIdentityContext(
      this.#context,
      normalizeAuth0Issuer(input.issuer),
      normalizeAuth0Subject(input.subject),
      false,
    );
    if (!identity) throw new CustomerOnboardingNotFoundError();
    assertIdentityAccess(identity);
    const identityCase = await selectCaseByOnboarding(
      this.#context,
      identity.onboarding_id,
      false,
    );
    if (!identityCase) throw new CustomerIdentityCaseNotFoundError();
    if (
      identity.onboarding_state !== "identity_in_progress" ||
      identityCase.state !== "pending" ||
      !identityCase.provider_inquiry_ref
    ) {
      throw invalidIdentityTransition();
    }
    return Object.freeze({
      identityCaseId: identityCase.external_ref,
      providerInquiryRef: identityCase.provider_inquiry_ref,
    });
  }

  async recordProviderEvent(input: {
    identityCaseId: string;
    providerInquiryRef?: string;
    providerEventRef: string;
    eventType: string;
    decision: CustomerIdentityProviderDecision;
    payloadDigest: string;
  }): Promise<CustomerIdentityProviderEventResult> {
    const identityCaseId = normalizeVisibleValue(
      input.identityCaseId,
      "identity case ID",
      8,
      128,
    );
    const providerEventRef = normalizeVisibleValue(
      input.providerEventRef,
      "provider event reference",
      1,
      255,
    );
    const providerInquiryRef = input.providerInquiryRef
      ? normalizeVisibleValue(
          input.providerInquiryRef,
          "provider inquiry reference",
          1,
          255,
        )
      : undefined;
    const eventType = normalizeVisibleValue(
      input.eventType,
      "provider event type",
      1,
      128,
    );
    const payloadDigest = normalizeDigest(
      input.payloadDigest,
      "payload digest",
    );
    if (
      !new Set<CustomerIdentityProviderDecision>([
        "pending",
        "review",
        "approved",
        "declined",
        "error",
      ]).has(input.decision)
    ) {
      throw new DomainError(
        "INVALID_ARGUMENT",
        "The identity decision is invalid.",
      );
    }

    return this.#context.run(async () => {
      const identityCase = await selectCaseByExternalRef(
        this.#context,
        identityCaseId,
        true,
      );
      if (!identityCase) throw new CustomerIdentityCaseNotFoundError();
      if (
        providerInquiryRef !== undefined &&
        identityCase.provider_inquiry_ref !== providerInquiryRef
      ) {
        throw new DomainError(
          "CONFLICT",
          "The provider event does not belong to this identity inquiry.",
        );
      }
      if (
        providerInquiryRef === undefined &&
        !identityCase.provider_inquiry_ref?.startsWith("inq_fake_")
      ) {
        throw new DomainError(
          "INVALID_ARGUMENT",
          "A provider inquiry reference is required for non-synthetic events.",
        );
      }
      const existing = await this.#context
        .query()
        .query<ExistingProviderEventRow>(
          `SELECT identity_case_id, event_type, normalized_decision, disposition,
                payload_digest
         FROM samra_core.customer_identity_provider_events
         WHERE provider = 'persona' AND provider_event_ref = $1
         FOR UPDATE`,
          [providerEventRef],
        );
      if (existing.rows[0]) {
        const prior = existing.rows[0];
        if (
          prior.identity_case_id !== identityCase.id ||
          prior.event_type !== eventType ||
          prior.normalized_decision !== input.decision ||
          prior.payload_digest !== payloadDigest
        ) {
          throw new DomainError(
            "CONFLICT",
            "The provider event reference was already used for different evidence.",
          );
        }
        return Object.freeze({
          snapshot: mapIdentityCase(identityCase),
          replayed: true,
          disposition: prior.disposition,
        });
      }
      if (!identityCase.provider_inquiry_ref) {
        throw new DomainError(
          "INVALID_TRANSITION",
          "The provider inquiry must be attached before events are accepted.",
        );
      }

      const disposition = classifyProviderDecision(
        identityCase.state,
        input.decision,
      );
      let resultingCase = identityCase;
      if (disposition === "applied") {
        resultingCase = await transitionIdentityCase(this.#context, {
          identityCase,
          nextState: input.decision,
          reasonFamily: decisionReasonFamily(input.decision),
          commandKey: `provider-event:${hashCommandKey(providerEventRef)}`,
        });
        await transitionOnboardingForDecision(this.#context, {
          identityCase: resultingCase,
          decision: input.decision,
          commandKey: `identity-event:${hashCommandKey(providerEventRef)}`,
        });
      } else if (disposition === "conflict") {
        await restrictOnboardingForConflict(this.#context, {
          identityCase,
          commandKey: `identity-conflict:${hashCommandKey(providerEventRef)}`,
        });
      }

      await this.#context.query().query(
        `INSERT INTO samra_core.customer_identity_provider_events
         (identity_case_id, provider, provider_event_ref, event_type,
          normalized_decision, disposition, payload_digest)
         VALUES ($1,'persona',$2,$3,$4,$5,$6)`,
        [
          identityCase.id,
          providerEventRef,
          eventType,
          input.decision,
          disposition,
          payloadDigest,
        ],
      );
      await appendIdentityAudit(this.#context, {
        identityCase: resultingCase,
        actorId: "customer-identity-provider",
        action: "customer_identity_provider_event_recorded",
        eventSuffix: hashCommandKey(providerEventRef).slice(0, 16),
        metadata: {
          provider: "persona",
          eventType,
          normalizedDecision: input.decision,
          disposition,
          payloadDigest,
          syntheticOnly: true,
        },
      });
      return Object.freeze({
        snapshot: mapIdentityCase(resultingCase),
        replayed: false,
        disposition,
      });
    });
  }
}

export type CustomerIdentityCaseStore = Pick<
  PostgresCustomerIdentityCaseStore,
  | "prepareAuth0IdentityCase"
  | "attachProviderInquiry"
  | "recordProviderStartFailure"
  | "getAuth0IdentityCase"
  | "getAuth0IdentityLaunchTarget"
  | "recordProviderEvent"
>;

async function selectIdentityContext(
  context: PostgresPersistenceContext,
  issuer: string,
  subject: string,
  forUpdate: boolean,
): Promise<IdentityContextRow | undefined> {
  const result = await context.query().query<IdentityContextRow>(
    `SELECT identity.state AS identity_state, customer.id AS customer_id,
            customer.external_ref AS customer_external_ref,
            customer.state AS customer_state, onboarding.id AS onboarding_id,
            onboarding.state AS onboarding_state,
            onboarding.version AS onboarding_version
     FROM samra_core.customer_auth_identities identity
     JOIN samra_core.customers customer ON customer.id = identity.customer_id
     JOIN samra_core.customer_onboardings onboarding
       ON onboarding.customer_id = customer.id
     WHERE identity.provider = 'auth0'
       AND identity.issuer = $1 AND identity.subject = $2
     ${forUpdate ? "FOR UPDATE OF identity, customer, onboarding" : ""}
     LIMIT 1`,
    [issuer, subject],
  );
  return result.rows[0];
}

async function selectCaseByOnboarding(
  context: PostgresPersistenceContext,
  onboardingId: string,
  forUpdate: boolean,
): Promise<IdentityCaseRow | undefined> {
  const result = await context.query().query<IdentityCaseRow>(
    `${identityCaseSelect()}
     WHERE onboarding_id = $1
     ${forUpdate ? "FOR UPDATE" : ""}
     LIMIT 1`,
    [onboardingId],
  );
  return result.rows[0];
}

async function selectCaseByExternalRef(
  context: PostgresPersistenceContext,
  externalRef: string,
  forUpdate: boolean,
): Promise<IdentityCaseRow | undefined> {
  const result = await context.query().query<IdentityCaseRow>(
    `${identityCaseSelect()}
     WHERE external_ref = $1
     ${forUpdate ? "FOR UPDATE" : ""}
     LIMIT 1`,
    [externalRef],
  );
  return result.rows[0];
}

function identityCaseSelect(): string {
  return `SELECT id, external_ref, customer_id, onboarding_id, provider,
                 provider_request_key, provider_inquiry_ref, state,
                 reason_family, version, decided_at, created_at, updated_at
          FROM samra_core.customer_identity_cases`;
}

async function transitionIdentityCase(
  context: PostgresPersistenceContext,
  input: Readonly<{
    identityCase: IdentityCaseRow;
    nextState: CustomerIdentityProviderDecision;
    reasonFamily: string | null;
    commandKey: string;
  }>,
): Promise<IdentityCaseRow> {
  const nextVersion = input.identityCase.version + 1;
  const updated = await context.query().query<IdentityCaseRow>(
    `UPDATE samra_core.customer_identity_cases
     SET state = $2, reason_family = $3, version = version + 1,
         decided_at = CASE WHEN $2 IN ('approved','declined') THEN now()
                           ELSE NULL END,
         updated_at = now()
     WHERE id = $1 AND version = $4
     RETURNING id, external_ref, customer_id, onboarding_id, provider,
               provider_request_key, provider_inquiry_ref, state,
               reason_family, version, decided_at, created_at, updated_at`,
    [
      input.identityCase.id,
      input.nextState,
      input.reasonFamily,
      input.identityCase.version,
    ],
  );
  const updatedRow = updated.rows[0];
  if (!updatedRow) throw identityConcurrencyConflict();
  await appendCaseTransition(context, {
    identityCase: input.identityCase,
    nextState: input.nextState,
    nextVersion,
    reasonFamily: input.reasonFamily,
    commandKey: input.commandKey,
  });
  return updatedRow;
}

async function appendCaseTransition(
  context: PostgresPersistenceContext,
  input: Readonly<{
    identityCase: IdentityCaseRow;
    nextState: CustomerIdentityCaseState;
    nextVersion: number;
    reasonFamily: string | null;
    commandKey: string;
  }>,
): Promise<void> {
  await context.query().query(
    `INSERT INTO samra_core.customer_identity_case_transitions
     (identity_case_id, sequence, from_state, to_state, reason_family,
      command_key)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [
      input.identityCase.id,
      input.nextVersion,
      input.identityCase.state,
      input.nextState,
      input.reasonFamily,
      input.commandKey,
    ],
  );
}

async function transitionOnboardingForDecision(
  context: PostgresPersistenceContext,
  input: Readonly<{
    identityCase: IdentityCaseRow;
    decision: CustomerIdentityProviderDecision;
    commandKey: string;
  }>,
): Promise<void> {
  const target = onboardingTarget(input.decision);
  if (!target) return;
  const onboarding = await context.query().query<{
    state: CustomerOnboardingState;
    version: number;
  }>(
    `SELECT state, version FROM samra_core.customer_onboardings
     WHERE id = $1 FOR UPDATE`,
    [input.identityCase.onboarding_id],
  );
  const current = onboarding.rows[0];
  if (!current) throw new CustomerOnboardingNotFoundError();
  if (current.state === target.state) return;
  const allowed =
    (current.state === "identity_in_progress" &&
      new Set(["identity_review", "identity_approved", "restricted"]).has(
        target.state,
      )) ||
    (current.state === "identity_review" &&
      new Set(["identity_approved", "restricted"]).has(target.state));
  if (!allowed) throw invalidIdentityTransition();
  const nextVersion = current.version + 1;
  const updated = await context.query().query(
    `UPDATE samra_core.customer_onboardings
     SET state = $2, latest_completed_step = $3, reason_family = $4,
         version = version + 1, entered_at = now(), updated_at = now()
     WHERE id = $1 AND version = $5`,
    [
      input.identityCase.onboarding_id,
      target.state,
      target.latestCompletedStep,
      target.reasonFamily,
      current.version,
    ],
  );
  if (updated.rowCount !== 1) throw identityConcurrencyConflict();
  await context.query().query(
    `INSERT INTO samra_core.customer_onboarding_transitions
     (onboarding_id, sequence, from_state, to_state, reason_family,
      command_key)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [
      input.identityCase.onboarding_id,
      nextVersion,
      current.state,
      target.state,
      target.reasonFamily,
      input.commandKey,
    ],
  );
}

async function restrictOnboardingForConflict(
  context: PostgresPersistenceContext,
  input: Readonly<{ identityCase: IdentityCaseRow; commandKey: string }>,
): Promise<void> {
  const onboarding = await context.query().query<{
    state: CustomerOnboardingState;
    version: number;
  }>(
    `SELECT state, version FROM samra_core.customer_onboardings
     WHERE id = $1 FOR UPDATE`,
    [input.identityCase.onboarding_id],
  );
  const current = onboarding.rows[0];
  if (!current || current.state === "restricted") return;
  if (
    !new Set<CustomerOnboardingState>([
      "identity_in_progress",
      "identity_review",
      "identity_approved",
    ]).has(current.state)
  ) {
    throw invalidIdentityTransition();
  }
  const nextVersion = current.version + 1;
  const updated = await context.query().query(
    `UPDATE samra_core.customer_onboardings
     SET state = 'restricted', latest_completed_step = 'identity_decision',
         reason_family = 'identity_provider_conflict', version = version + 1,
         entered_at = now(), updated_at = now()
     WHERE id = $1 AND version = $2`,
    [input.identityCase.onboarding_id, current.version],
  );
  if (updated.rowCount !== 1) throw identityConcurrencyConflict();
  await context.query().query(
    `INSERT INTO samra_core.customer_onboarding_transitions
     (onboarding_id, sequence, from_state, to_state, reason_family,
      command_key)
     VALUES ($1,$2,$3,'restricted','identity_provider_conflict',$4)`,
    [
      input.identityCase.onboarding_id,
      nextVersion,
      current.state,
      input.commandKey,
    ],
  );
}

function onboardingTarget(
  decision: CustomerIdentityProviderDecision,
): Readonly<{
  state: CustomerOnboardingState;
  latestCompletedStep: string;
  reasonFamily: string | null;
}> | null {
  if (decision === "review") {
    return Object.freeze({
      state: "identity_review",
      latestCompletedStep: "identity_submitted",
      reasonFamily: null,
    });
  }
  if (decision === "approved") {
    return Object.freeze({
      state: "identity_approved",
      latestCompletedStep: "identity_approved",
      reasonFamily: null,
    });
  }
  if (decision === "declined") {
    return Object.freeze({
      state: "restricted",
      latestCompletedStep: "identity_decision",
      reasonFamily: "identity_declined",
    });
  }
  return null;
}

function classifyProviderDecision(
  current: CustomerIdentityCaseState,
  incoming: CustomerIdentityProviderDecision,
): "applied" | "ignored_stale" | "conflict" {
  if (current === incoming) return "ignored_stale";
  if (
    (current === "approved" && incoming === "declined") ||
    (current === "declined" && incoming === "approved")
  ) {
    return "conflict";
  }
  if (current === "approved" || current === "declined") {
    return "ignored_stale";
  }
  if (incoming === "pending" && new Set(["pending", "review"]).has(current)) {
    return "ignored_stale";
  }
  if (incoming === "review" && current === "review") {
    return "ignored_stale";
  }
  if (incoming === "error" && current === "error") {
    return "ignored_stale";
  }
  return "applied";
}

function decisionReasonFamily(
  decision: CustomerIdentityProviderDecision,
): string | null {
  if (decision === "declined") return "identity_declined";
  if (decision === "error") return "identity_provider_error";
  return null;
}

async function appendIdentityAudit(
  context: PostgresPersistenceContext,
  input: Readonly<{
    identityCase: IdentityCaseRow;
    actorId: string;
    action: string;
    eventSuffix?: string;
    metadata: Readonly<Record<string, unknown>>;
  }>,
): Promise<void> {
  const suffix = input.eventSuffix ?? `version:${input.identityCase.version}`;
  await context.query().query(
    `INSERT INTO samra_core.audit_events
     (event_key, actor_type, actor_id, action, entity_type, entity_id,
      metadata)
     VALUES ($1,'system',$2,$3,'customer_identity_case',$4,$5::jsonb)`,
    [
      `customer-identity-case:${input.identityCase.id}:${suffix}`,
      input.actorId,
      input.action,
      input.identityCase.id,
      JSON.stringify(input.metadata),
    ],
  );
}

async function lockIdentity(
  context: PostgresPersistenceContext,
  issuer: string,
  subject: string,
): Promise<void> {
  await context
    .query()
    .query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [
      `customer-identity:${issuer}:${subject}`,
    ]);
}

function assertIdentityAccess(identity: IdentityContextRow): void {
  if (
    identity.identity_state !== "active" ||
    identity.customer_state !== "active"
  ) {
    throw new CustomerOnboardingAccessRestrictedError();
  }
}

function mapIdentityCase(row: IdentityCaseRow): CustomerIdentityCaseSnapshot {
  return Object.freeze({
    identityCaseId: row.external_ref,
    state: row.state,
    reasonFamily: row.reason_family,
    provider: "persona",
    synthetic: true,
    version: row.version,
    decidedAt: row.decided_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    nextAllowedActions: identityNextActions(row.state),
  });
}

function identityNextActions(
  state: CustomerIdentityCaseState,
): readonly string[] {
  const actions: Readonly<
    Record<CustomerIdentityCaseState, readonly string[]>
  > = {
    created: ["retry_identity_verification", "exit_onboarding"],
    pending: ["continue_identity_verification", "exit_onboarding"],
    review: ["await_identity_review", "contact_support"],
    approved: ["continue_to_wallet_setup"],
    declined: ["contact_support"],
    error: ["retry_identity_verification", "contact_support"],
  };
  return Object.freeze([...actions[state]]);
}

function normalizeVisibleValue(
  value: string,
  label: string,
  minimum: number,
  maximum: number,
): string {
  if (
    value.length < minimum ||
    value.length > maximum ||
    value !== value.trim() ||
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw new DomainError(
      "INVALID_ARGUMENT",
      `${label} must be ${minimum} to ${maximum} visible characters.`,
    );
  }
  return value;
}

function normalizeDigest(value: string, label: string): string {
  if (!/^[0-9a-f]{64}$/u.test(value)) {
    throw new DomainError(
      "INVALID_ARGUMENT",
      `${label} must be a lowercase SHA-256 digest.`,
    );
  }
  return value;
}

function invalidIdentityTransition(): DomainError {
  return new DomainError(
    "INVALID_TRANSITION",
    "The identity case cannot make the requested state transition.",
  );
}

function identityConcurrencyConflict(): DomainError {
  return new DomainError(
    "CONFLICT",
    "The identity case changed before the command could complete.",
  );
}

function hashCommandKey(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function fingerprint(value: Readonly<Record<string, unknown>>): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
