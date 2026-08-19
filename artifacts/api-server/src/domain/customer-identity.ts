import { createHash } from "node:crypto";
import type {
  CustomerIdentityCaseSnapshot,
  CustomerIdentityCaseStore,
  CustomerIdentityProviderDecision,
  CustomerIdentityProviderEventResult,
} from "@workspace/db";

export interface CustomerIdentityProvider {
  readonly provider: "persona";
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
        snapshot: prepared.snapshot,
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
        return Object.freeze({ snapshot: failed, created: false });
      }
      throw new IdentityProviderUnavailableError();
    }

    const snapshot = await this.#store.attachProviderInquiry({
      identityCaseId: prepared.snapshot.identityCaseId,
      providerRequestKey: prepared.providerRequestKey,
      providerInquiryRef,
    });
    return Object.freeze({ snapshot, created: prepared.created });
  }

  getAuth0IdentityCase(input: {
    issuer: string;
    subject: string;
  }): Promise<CustomerIdentityCaseSnapshot> {
    return this.#store.getAuth0IdentityCase(input);
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
