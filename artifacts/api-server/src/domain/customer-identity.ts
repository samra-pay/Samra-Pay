import { createHash } from "node:crypto";
import { DomainError } from "@workspace/remittance";
import type {
  CustomerIdentityCaseSnapshot,
  CustomerIdentityCaseStore,
  CustomerIdentityProviderDecision,
  CustomerIdentityProviderEventResult,
} from "@workspace/db";

export interface CustomerIdentityProvider {
  readonly provider: "persona";
  readonly environment: "fake" | "sandbox";
  readonly hostedFlowAvailable?: boolean;
  createHostedLaunch?(
    input: Readonly<{
      identityCaseId: string;
      providerInquiryRef: string;
      providerRequestKey: string;
    }>,
  ): Promise<Readonly<{ url: string }>>;
  createInquiry(
    input: Readonly<{
      identityCaseId: string;
      providerRequestKey: string;
    }>,
  ): Promise<Readonly<{ providerInquiryRef: string }>>;
}

export class IdentityProviderUnavailableError extends Error {
  constructor() {
    super("Identity verification is temporarily unavailable. Please retry.");
    this.name = "IdentityProviderUnavailableError";
  }
}

export class DeterministicFakePersonaAdapter implements CustomerIdentityProvider {
  readonly provider = "persona" as const;
  readonly environment = "fake" as const;

  async createInquiry(
    input: Readonly<{
      identityCaseId: string;
      providerRequestKey: string;
    }>,
  ): Promise<Readonly<{ providerInquiryRef: string }>> {
    return Object.freeze({
      providerInquiryRef: `inq_fake_${sha256(
        `${input.identityCaseId}:${input.providerRequestKey}`,
      ).slice(0, 32)}`,
    });
  }
}

export class CustomerIdentityVerificationService {
  readonly #store: CustomerIdentityCaseStore;
  readonly #provider: CustomerIdentityProvider;

  constructor(
    input: Readonly<{
      store: CustomerIdentityCaseStore;
      provider: CustomerIdentityProvider;
    }>,
  ) {
    this.#store = input.store;
    this.#provider = input.provider;
  }

  async startAuth0IdentityVerification(input: {
    issuer: string;
    subject: string;
    idempotencyKey: string;
  }): Promise<
    Readonly<{ snapshot: CustomerIdentityCaseSnapshot; created: boolean }>
  > {
    const prepared = await this.#store.prepareAuth0IdentityCase(input);
    if (
      prepared.snapshot.state !== "created" &&
      prepared.snapshot.state !== "error"
    ) {
      return Object.freeze({
        snapshot: this.withLaunchAction(prepared.snapshot),
        created: false,
      });
    }

    let providerInquiryRef: string;
    try {
      ({ providerInquiryRef } = await this.#provider.createInquiry({
        identityCaseId: prepared.snapshot.identityCaseId,
        providerRequestKey: prepared.providerRequestKey,
      }));
    } catch {
      const failed = await this.#store.recordProviderStartFailure({
        identityCaseId: prepared.snapshot.identityCaseId,
        reasonFamily: "identity_provider_unavailable",
      });
      if (failed.state !== "error") {
        return Object.freeze({
          snapshot: this.withLaunchAction(failed),
          created: false,
        });
      }
      throw new IdentityProviderUnavailableError();
    }

    const snapshot = await this.#store.attachProviderInquiry({
      identityCaseId: prepared.snapshot.identityCaseId,
      providerRequestKey: prepared.providerRequestKey,
      providerInquiryRef,
    });
    return Object.freeze({
      snapshot: this.withLaunchAction(snapshot),
      created: prepared.created,
    });
  }

  async getAuth0IdentityCase(input: {
    issuer: string;
    subject: string;
  }): Promise<CustomerIdentityCaseSnapshot> {
    return this.withLaunchAction(await this.#store.getAuth0IdentityCase(input));
  }

  async createAuth0HostedLaunch(input: {
    issuer: string;
    subject: string;
    idempotencyKey: string;
  }): Promise<
    Readonly<{ provider: "persona"; environment: "sandbox"; url: string }>
  > {
    if (
      !this.#provider.hostedFlowAvailable ||
      !this.#provider.createHostedLaunch ||
      this.#provider.environment !== "sandbox"
    ) {
      throw new DomainError(
        "NOT_FOUND",
        "Hosted identity verification is unavailable.",
      );
    }
    const target = await this.#store.getAuth0IdentityLaunchTarget(input);
    let launch: Readonly<{ url: string }>;
    try {
      launch = await this.#provider.createHostedLaunch({
        ...target,
        providerRequestKey: sha256(
          JSON.stringify([
            "identity-launch",
            target.identityCaseId,
            input.idempotencyKey,
          ]),
        ),
      });
    } catch {
      // A failed session launch does not change durable KYC state or expose provider data.
      throw new IdentityProviderUnavailableError();
    }
    const current = await this.#store.getAuth0IdentityLaunchTarget(input);
    if (
      current.identityCaseId !== target.identityCaseId ||
      current.providerInquiryRef !== target.providerInquiryRef
    ) {
      throw new DomainError(
        "CONFLICT",
        "Identity verification changed. Refresh before continuing.",
      );
    }
    return Object.freeze({
      provider: "persona",
      environment: "sandbox",
      url: launch.url,
    });
  }

  private withLaunchAction(
    snapshot: CustomerIdentityCaseSnapshot,
  ): CustomerIdentityCaseSnapshot {
    if (!this.#provider.hostedFlowAvailable || snapshot.state !== "pending")
      return snapshot;
    return Object.freeze({
      ...snapshot,
      nextAllowedActions: Object.freeze([
        ...snapshot.nextAllowedActions,
        "launch_identity_verification",
      ]),
    });
  }

  simulateProviderDecision(input: {
    identityCaseId: string;
    decision: CustomerIdentityProviderDecision;
    idempotencyKey: string;
  }): Promise<CustomerIdentityProviderEventResult> {
    const evidence = Object.freeze({
      identityCaseId: input.identityCaseId,
      decision: input.decision,
      synthetic: true,
    });
    const commandDigest = sha256(
      `${input.identityCaseId}:${input.idempotencyKey}`,
    );
    return this.#store.recordProviderEvent({
      identityCaseId: input.identityCaseId,
      providerEventRef: `evt_fake_${commandDigest.slice(0, 32)}`,
      eventType: `inquiry.${input.decision}`,
      decision: input.decision,
      payloadDigest: sha256(JSON.stringify(evidence)),
    });
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
