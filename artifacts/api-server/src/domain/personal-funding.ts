import type {
  PersonalFundingIdentity,
  PersonalFundingSnapshot,
  PersonalFundingStore,
  PersonalFundingTarget,
  PersonalFundingProviderStatus,
  PostgresPersonalFundingStore,
} from "@workspace/db";
import { PersonalFundingUnavailableError } from "@workspace/db";

export interface PersonalFundingProvider {
  readonly environment: "staging" | "production";
  createOrder(input: PersonalFundingTarget & { amountMinor: string }): Promise<
    Readonly<{
      providerOrderRef: string;
      clientSecret: string;
    }>
  >;
}

export interface PersonalFundingStatusProvider {
  readonly environment: "staging" | "production";
  readOrder(providerOrderRef: string): Promise<PersonalFundingProviderStatus>;
}

/** Reads the stored attempt only. It cannot create, update or pay for an order. */
export class PersonalFundingStatusService {
  constructor(
    private readonly store: Pick<
      PostgresPersonalFundingStore,
      "get" | "recordProviderStatus"
    >,
    private readonly provider: PersonalFundingStatusProvider,
  ) {}

  async refresh(identity: PersonalFundingIdentity): Promise<
    Readonly<{
      snapshot: PersonalFundingSnapshot | null;
      providerRead: "not-requested" | "updated" | "unavailable";
    }>
  > {
    const snapshot = await this.store.get(identity);
    if (!snapshot) return { snapshot, providerRead: "not-requested" };
    if (snapshot.environment !== this.provider.environment)
      throw new PersonalFundingUnavailableError();
    if (snapshot.state !== "checkout_created" || !snapshot.providerOrderRef)
      return { snapshot, providerRead: "not-requested" };
    const requestedAt = new Date().toISOString();
    let status: PersonalFundingProviderStatus;
    try {
      status = await this.provider.readOrder(snapshot.providerOrderRef);
    } catch {
      // Retain the last dated observation, with a distinct failed-read result.
      return {
        snapshot: await this.store.get(identity),
        providerRead: "unavailable",
      };
    }
    await this.store.recordProviderStatus({
      ...identity,
      orderId: snapshot.orderId,
      providerOrderRef: snapshot.providerOrderRef,
      environment: this.provider.environment,
      requestedAt,
      status,
    });
    return {
      snapshot: await this.store.get(identity),
      providerRead: "updated",
    };
  }
}

/** Internal only until checkout mutation and production activation gates are closed. */
export class PersonalFundingService {
  constructor(
    private readonly store: PersonalFundingStore,
    private readonly provider: PersonalFundingProvider,
  ) {}

  async start(
    input: PersonalFundingIdentity & {
      idempotencyKey: string;
      amountMinor: string;
    },
  ): Promise<
    Readonly<{
      snapshot: PersonalFundingSnapshot;
      checkout: Readonly<{
        providerOrderRef: string;
        clientSecret: string;
      }> | null;
    }>
  > {
    const reserved = await this.store.reserve({
      ...input,
      environment: this.provider.environment,
    });
    if (!reserved.dispatch)
      return { snapshot: reserved.snapshot, checkout: null };
    let checkout: Awaited<ReturnType<PersonalFundingProvider["createOrder"]>>;
    try {
      checkout = await this.provider.createOrder({
        ...reserved.target,
        amountMinor: reserved.snapshot.amountMinor,
      });
    } catch {
      // A network error, timeout, rejection or malformed reply does not prove
      // that Crossmint created no order. Never issue another POST automatically.
      await this.store.recordOutcome({
        orderId: reserved.snapshot.orderId,
        outcome: { state: "provider_unknown" },
      });
      return {
        snapshot: { ...reserved.snapshot, state: "provider_unknown" },
        checkout: null,
      };
    }
    // Commit the provider reference before allowing a caller to see the token.
    // A failed commit leaves 'reserved'; replay cannot dispatch a second order.
    await this.store.recordOutcome({
      orderId: reserved.snapshot.orderId,
      outcome: {
        state: "checkout_created",
        providerOrderRef: checkout.providerOrderRef,
      },
    });
    return {
      snapshot: {
        ...reserved.snapshot,
        state: "checkout_created",
        providerOrderRef: checkout.providerOrderRef,
      },
      checkout,
    };
  }

  resume(
    identity: PersonalFundingIdentity,
  ): Promise<PersonalFundingSnapshot | null> {
    return this.store.get(identity);
  }
}
