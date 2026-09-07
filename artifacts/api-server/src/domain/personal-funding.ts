import type {
  PersonalFundingIdentity,
  PersonalFundingSnapshot,
  PersonalFundingStore,
  PersonalFundingTarget,
} from "@workspace/db";

export interface PersonalFundingProvider {
  readonly environment: "staging" | "production";
  createOrder(input: PersonalFundingTarget & { amountMinor: string }): Promise<
    Readonly<{
      providerOrderRef: string;
      clientSecret: string;
    }>
  >;
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
