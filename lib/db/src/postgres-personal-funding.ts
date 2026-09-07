import { createHash, randomUUID } from "node:crypto";
import { DomainError } from "@workspace/remittance";
import {
  normalizeAuth0Issuer,
  normalizeAuth0Subject,
} from "./postgres-customer-identities";
import type { PostgresPersistenceContext } from "./postgres-persistence";

export type PersonalFundingIdentity = Readonly<{
  issuer: string;
  subject: string;
}>;
export type PersonalFundingState =
  "reserved" | "provider_unknown" | "checkout_created";
export type PersonalFundingTarget = Readonly<{
  environment: "staging" | "production";
  walletAddress: string;
  providerWalletRef: string;
}>;
export const PERSONAL_FUNDING_PAYMENT_STATUSES = [
  "unknown",
  "requires-quote",
  "requires-email",
  "requires-recipient-verification",
  "requires-kyc",
  "manual-kyc",
  "failed-kyc",
  "awaiting-payment",
  "in-progress",
  "completed",
] as const;
export const PERSONAL_FUNDING_DELIVERY_STATUSES = [
  "not-reported",
  "unknown",
  "awaiting-payment",
  "in-progress",
  "failed",
  "completed",
] as const;
export type PersonalFundingProviderStatus = Readonly<{
  paymentStatus: (typeof PERSONAL_FUNDING_PAYMENT_STATUSES)[number];
  deliveryStatus: (typeof PERSONAL_FUNDING_DELIVERY_STATUSES)[number];
}>;
export type PersonalFundingProgress = PersonalFundingProviderStatus &
  Readonly<{
    requestedAt: string;
    observedAt: string;
    // Absence of a KYC prompt is not a durable Samra verification approval.
    kycStatus: "required" | "pending" | "rejected" | "not-reported";
  }>;
export type PersonalFundingSnapshot = Readonly<{
  orderId: string;
  amountMinor: string;
  currency: "USD";
  state: PersonalFundingState;
  environment: "staging" | "production";
  providerOrderRef: string | null;
  createdAt: string;
  progress: PersonalFundingProgress | null;
  // Order creation is never evidence of KYC approval, settlement or a balance.
  fundingConfirmed: false;
}>;
export type PersonalFundingReservation = Readonly<{
  snapshot: PersonalFundingSnapshot;
  target: PersonalFundingTarget;
  dispatch: boolean;
}>;

export class PersonalFundingUnavailableError extends Error {
  constructor() {
    super("The personal funding pilot is unavailable for this account.");
    this.name = "PersonalFundingUnavailableError";
  }
}

type AuthorizationRow = {
  environment: "staging" | "production";
  wallet_address: string;
  provider_wallet_ref: string;
  max_amount_minor: string;
  current: boolean;
};
type OrderRow = {
  id: string;
  command_key: string;
  amount_minor: string;
  state: PersonalFundingState;
  provider_order_ref: string | null;
  created_at: Date;
};
type ObservationRow = {
  payment_status: PersonalFundingProviderStatus["paymentStatus"];
  delivery_status: PersonalFundingProviderStatus["deliveryStatus"];
  requested_at: Date;
  observed_at: Date;
};

/** Internal command boundary. No HTTP route or production runtime enables it yet. */
export class PostgresPersonalFundingStore {
  constructor(private readonly context: PostgresPersistenceContext) {}

  async reserve(
    input: PersonalFundingIdentity & {
      idempotencyKey: string;
      amountMinor: string;
      environment: "staging" | "production";
    },
  ): Promise<PersonalFundingReservation> {
    const identity = normalizeIdentity(input);
    if (
      !/^[1-9][0-9]{0,17}$/u.test(input.amountMinor) ||
      !/^[\x21-\x7e]{8,128}$/u.test(input.idempotencyKey)
    ) {
      throw new DomainError(
        "INVALID_ARGUMENT",
        "A positive minor-unit amount and an idempotency key are required.",
      );
    }
    const commandKey = createHash("sha256")
      .update(input.idempotencyKey)
      .digest("hex");
    return this.context.run(async () => {
      // This lock is held only for the local commit, never over a provider call.
      await this.context
        .query()
        .query(
          "SELECT pg_advisory_xact_lock(hashtextextended('personal-funding-pilot', 0))",
        );
      const authorization = await this.authorization(identity);
      if (authorization.environment !== input.environment)
        throw new PersonalFundingUnavailableError();
      const existing = await this.order();
      if (existing) {
        if (
          existing.command_key !== commandKey ||
          existing.amount_minor !== input.amountMinor
        ) {
          throw new DomainError(
            "CONFLICT",
            "This pilot already has a purchase attempt. Resume or reconcile that attempt.",
          );
        }
        return reservation(existing, authorization, false);
      }
      if (
        !authorization.current ||
        BigInt(input.amountMinor) > BigInt(authorization.max_amount_minor)
      ) {
        throw new PersonalFundingUnavailableError();
      }
      const inserted = await this.context.query().query<OrderRow>(
        `INSERT INTO samra_core.personal_funding_orders (id, pilot_id, command_key, amount_minor, state)
         VALUES ($1, 'personal-funding-pilot', $2, $3, 'reserved') RETURNING *`,
        [randomUUID(), commandKey, input.amountMinor],
      );
      const row = inserted.rows[0]!;
      await this.event(row.id, "reserved");
      return reservation(row, authorization, true);
    });
  }

  async get(
    input: PersonalFundingIdentity,
  ): Promise<PersonalFundingSnapshot | null> {
    return this.context.run(async () => {
      const authorization = await this.authorization(normalizeIdentity(input));
      const order = await this.order();
      if (!order) return null;
      const observation = (
        await this.context.query().query<ObservationRow>(
          `SELECT payment_status, delivery_status, requested_at, observed_at
         FROM samra_core.personal_funding_observations WHERE order_id = $1
         ORDER BY requested_at DESC, observed_at DESC, id DESC LIMIT 1`,
          [order.id],
        )
      ).rows[0];
      return snapshot(order, authorization, observation);
    });
  }

  async recordProviderStatus(
    input: PersonalFundingIdentity & {
      orderId: string;
      providerOrderRef: string;
      environment: "staging" | "production";
      requestedAt: string;
      status: PersonalFundingProviderStatus;
    },
  ): Promise<void> {
    const requestedAt = new Date(input.requestedAt);
    if (
      !uuid(input.orderId) ||
      !uuid(input.providerOrderRef) ||
      !Number.isFinite(requestedAt.getTime()) ||
      requestedAt.toISOString() !== input.requestedAt ||
      !(PERSONAL_FUNDING_PAYMENT_STATUSES as readonly string[]).includes(
        input.status.paymentStatus,
      ) ||
      !(PERSONAL_FUNDING_DELIVERY_STATUSES as readonly string[]).includes(
        input.status.deliveryStatus,
      )
    ) {
      throw new DomainError("INVALID_ARGUMENT", "Invalid funding observation.");
    }
    await this.context.run(async () => {
      // Recheck identity after the bounded GET; revocation during it blocks persistence.
      const authorization = await this.authorization(normalizeIdentity(input));
      const order = await this.order();
      if (
        authorization.environment !== input.environment ||
        order?.id !== input.orderId ||
        order.state !== "checkout_created" ||
        order.provider_order_ref !== input.providerOrderRef
      ) {
        throw new PersonalFundingUnavailableError();
      }
      await this.context.query().query(
        `INSERT INTO samra_core.personal_funding_observations
         (order_id, provider_order_ref, payment_status, delivery_status, requested_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          order.id,
          order.provider_order_ref,
          input.status.paymentStatus,
          input.status.deliveryStatus,
          requestedAt,
        ],
      );
    });
  }

  async recordOutcome(input: {
    orderId: string;
    outcome:
      | Readonly<{ state: "provider_unknown" }>
      | Readonly<{ state: "checkout_created"; providerOrderRef: string }>;
  }): Promise<void> {
    if (
      !uuid(input.orderId) ||
      (input.outcome.state === "checkout_created" &&
        !uuid(input.outcome.providerOrderRef))
    ) {
      throw new DomainError(
        "INVALID_ARGUMENT",
        "Invalid funding order reference.",
      );
    }
    await this.context.run(async () => {
      const result = await this.context.query().query<{ id: string }>(
        `UPDATE samra_core.personal_funding_orders SET state = $2, provider_order_ref = $3, updated_at = now()
         WHERE id = $1 AND state = 'reserved' RETURNING id`,
        [
          input.orderId,
          input.outcome.state,
          input.outcome.state === "checkout_created"
            ? input.outcome.providerOrderRef
            : null,
        ],
      );
      if (result.rowCount !== 1)
        throw new DomainError(
          "CONFLICT",
          "The funding attempt has already been recorded.",
        );
      await this.event(input.orderId, input.outcome.state);
    });
  }

  private async authorization(
    identity: PersonalFundingIdentity,
  ): Promise<AuthorizationRow> {
    const result = await this.context.query().query<AuthorizationRow>(
      `SELECT p.environment, p.wallet_address, p.provider_wallet_ref, p.max_amount_minor,
              p.expires_at > now() AND p.revoked_at IS NULL AS current
       FROM samra_core.personal_funding_authorizations p
       JOIN samra_core.customers c ON c.id = p.customer_id AND c.state = 'active'
       JOIN samra_core.customer_auth_identities a ON a.customer_id = c.id AND a.state = 'active'
       WHERE p.pilot_id = 'personal-funding-pilot' AND a.provider = 'auth0' AND a.issuer = $1 AND a.subject = $2 FOR SHARE OF p, c, a`,
      [identity.issuer, identity.subject],
    );
    const row = result.rows[0];
    if (!row) throw new PersonalFundingUnavailableError();
    return row;
  }

  private async order(): Promise<OrderRow | undefined> {
    return (
      await this.context
        .query()
        .query<OrderRow>(
          "SELECT * FROM samra_core.personal_funding_orders WHERE pilot_id = 'personal-funding-pilot'",
        )
    ).rows[0];
  }

  private async event(
    orderId: string,
    state: PersonalFundingState,
  ): Promise<void> {
    await this.context
      .query()
      .query(
        "INSERT INTO samra_core.personal_funding_events (order_id, state) VALUES ($1, $2)",
        [orderId, state],
      );
  }
}

export type PersonalFundingStore = Pick<
  PostgresPersonalFundingStore,
  "reserve" | "get" | "recordOutcome"
>;

function normalizeIdentity(
  input: PersonalFundingIdentity,
): PersonalFundingIdentity {
  return {
    issuer: normalizeAuth0Issuer(input.issuer),
    subject: normalizeAuth0Subject(input.subject),
  };
}
function uuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(
    value,
  );
}
function snapshot(
  order: OrderRow,
  authorization: AuthorizationRow,
  observation?: ObservationRow,
): PersonalFundingSnapshot {
  return Object.freeze({
    orderId: order.id,
    amountMinor: order.amount_minor,
    currency: "USD",
    state: order.state,
    environment: authorization.environment,
    providerOrderRef: order.provider_order_ref,
    createdAt: order.created_at.toISOString(),
    progress: observation
      ? Object.freeze({
          paymentStatus: observation.payment_status,
          deliveryStatus: observation.delivery_status,
          requestedAt: observation.requested_at.toISOString(),
          observedAt: observation.observed_at.toISOString(),
          kycStatus:
            observation.payment_status === "requires-kyc"
              ? "required"
              : observation.payment_status === "manual-kyc"
                ? "pending"
                : observation.payment_status === "failed-kyc"
                  ? "rejected"
                  : "not-reported",
        })
      : null,
    fundingConfirmed: false,
  });
}
function reservation(
  order: OrderRow,
  authorization: AuthorizationRow,
  dispatch: boolean,
): PersonalFundingReservation {
  return Object.freeze({
    snapshot: snapshot(order, authorization),
    dispatch,
    target: Object.freeze({
      environment: authorization.environment,
      walletAddress: authorization.wallet_address,
      providerWalletRef: authorization.provider_wallet_ref,
    }),
  });
}
