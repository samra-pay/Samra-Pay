import {
  advanceDemoCustomerIdentity,
  bindCustomerAcquisitionSession,
  cancelRemittanceTransfer,
  createRemittanceQuote,
  createRemittanceTransfer,
  createCustomerIdentityHostedLaunch,
  getCustomerIdentityCase,
  getCustomerOnboarding,
  getCustomerWallet,
  getCurrentCustomer,
  getRemittanceOptions,
  getRemittanceTransfer,
  listAccounts,
  listActivity,
  listBeneficiaries,
  listRemittanceTransfers,
  recordCustomerAcquisitionEvent,
  startCustomerIdentityVerification,
  startCustomerOnboarding,
  startCustomerWalletProvisioning,
  submitCustomerConsentBundle,
} from "@workspace/api-client-react";

import type { CustomerAcquisitionTransport } from "./acquisition";
import { parseCustomerIdentityHostedLaunch } from "./onboarding";
import type {
  ActivityQuery,
  CreateQuoteInput,
  CreateTransferInput,
  SamraTransport,
  TransferQuery,
} from "./index";
import type {
  CustomerIdentityCaseSnapshot,
  CustomerIdentityProviderDecision,
  CustomerOnboardingSnapshot,
  CustomerWalletSnapshot,
  SamraOnboardingDemoControls,
  SamraOnboardingSource,
  StartCustomerWalletProvisioningInput,
  SubmitCustomerConsentBundleInput,
} from "./onboarding";

function idempotencyHeaders(key: string): HeadersInit {
  return { "Idempotency-Key": key };
}

/**
 * The only adapter that knows generated operation names. Screens and hooks use
 * SamraDataSource, allowing the OpenAPI generator to evolve without spreading
 * transport naming through either client.
 */
export function createGeneratedSamraTransport(): SamraTransport {
  return {
    async getCurrentCustomer() {
      const { backendMode: _backendMode, ...customer } =
        await getCurrentCustomer();
      return customer;
    },

    listAccounts,

    listActivity(input?: ActivityQuery) {
      return listActivity(input);
    },

    listBeneficiaries,

    getRemittanceOptions,

    createQuote(input: CreateQuoteInput) {
      return createRemittanceQuote(input);
    },

    createTransfer(input: CreateTransferInput, idempotencyKey: string) {
      return createRemittanceTransfer(input, {
        headers: idempotencyHeaders(idempotencyKey),
      });
    },

    getTransfer(id: string) {
      return getRemittanceTransfer(id);
    },

    listTransfers(input?: TransferQuery) {
      return listRemittanceTransfers(input);
    },

    cancelTransfer(id: string, idempotencyKey: string) {
      return cancelRemittanceTransfer(id, {
        headers: idempotencyHeaders(idempotencyKey),
      });
    },
  };
}

export class GeneratedCustomerAcquisitionTransport implements CustomerAcquisitionTransport {
  async recordEvent(
    input: Parameters<CustomerAcquisitionTransport["recordEvent"]>[0],
    idempotencyKey: string,
  ) {
    return recordCustomerAcquisitionEvent(input, {
      headers: idempotencyHeaders(idempotencyKey),
    });
  }

  async bindSession(
    input: Parameters<CustomerAcquisitionTransport["bindSession"]>[0],
    idempotencyKey: string,
  ): Promise<void> {
    await bindCustomerAcquisitionSession(input, {
      headers: idempotencyHeaders(idempotencyKey),
    });
  }
}

export class GeneratedSamraOnboardingSource
  implements SamraOnboardingSource, SamraOnboardingDemoControls
{
  async getOnboarding(): Promise<CustomerOnboardingSnapshot | null> {
    try {
      return freezeOnboardingSnapshot(await getCustomerOnboarding());
    } catch (error) {
      if (isProblem(error, 403, "CUSTOMER_IDENTITY_UNBOUND")) return null;
      throw error;
    }
  }

  async startOnboarding(
    idempotencyKey: string,
  ): Promise<CustomerOnboardingSnapshot> {
    return freezeOnboardingSnapshot(
      await startCustomerOnboarding({
        headers: idempotencyHeaders(idempotencyKey),
      }),
    );
  }

  async submitConsentBundle(
    input: SubmitCustomerConsentBundleInput,
    idempotencyKey: string,
  ): Promise<CustomerOnboardingSnapshot> {
    return freezeOnboardingSnapshot(
      await submitCustomerConsentBundle(
        {
          bundleVersion: input.bundleVersion,
          locale: input.locale,
          decisions: input.decisions.map((decision) => ({ ...decision })),
        },
        { headers: idempotencyHeaders(idempotencyKey) },
      ),
    );
  }

  async getIdentityCase(): Promise<CustomerIdentityCaseSnapshot | null> {
    try {
      return freezeIdentityCaseSnapshot(await getCustomerIdentityCase());
    } catch (error) {
      if (isProblem(error, 404, "NOT_FOUND")) return null;
      throw error;
    }
  }

  async startIdentityVerification(
    idempotencyKey: string,
  ): Promise<CustomerIdentityCaseSnapshot> {
    return freezeIdentityCaseSnapshot(
      await startCustomerIdentityVerification({
        headers: idempotencyHeaders(idempotencyKey),
      }),
    );
  }

  async createIdentityHostedLaunch(idempotencyKey: string) {
    // Deliberately bypass the query/mutation cache for this transient capability.
    return parseCustomerIdentityHostedLaunch(
      await createCustomerIdentityHostedLaunch({
        headers: idempotencyHeaders(idempotencyKey),
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      }),
    );
  }

  async getWallet(): Promise<CustomerWalletSnapshot | null> {
    try {
      return freezeWalletSnapshot(await getCustomerWallet());
    } catch (error) {
      if (isProblem(error, 404, "NOT_FOUND")) return null;
      throw error;
    }
  }

  async startWalletProvisioning(
    input: StartCustomerWalletProvisioningInput,
    idempotencyKey: string,
  ): Promise<CustomerWalletSnapshot> {
    return freezeWalletSnapshot(
      await startCustomerWalletProvisioning(
        { ...input },
        { headers: idempotencyHeaders(idempotencyKey) },
      ),
    );
  }

  async advanceIdentity(
    identityCaseId: string,
    decision: CustomerIdentityProviderDecision,
    idempotencyKey: string,
  ): Promise<CustomerIdentityCaseSnapshot> {
    const result = await advanceDemoCustomerIdentity(
      identityCaseId,
      { decision },
      { headers: idempotencyHeaders(idempotencyKey) },
    );
    return freezeIdentityCaseSnapshot(result.identityCase);
  }
}

function isProblem(error: unknown, status: number, code: string): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    status?: unknown;
    data?: unknown;
  };
  if (candidate.status !== status || !candidate.data) return false;
  if (typeof candidate.data !== "object") return false;
  return (candidate.data as { code?: unknown }).code === code;
}

function freezeOnboardingSnapshot(
  snapshot: CustomerOnboardingSnapshot,
): CustomerOnboardingSnapshot {
  return Object.freeze({
    ...snapshot,
    consentBundle: Object.freeze({
      ...snapshot.consentBundle,
      documents: Object.freeze(
        snapshot.consentBundle.documents.map((document) =>
          Object.freeze({ ...document }),
        ),
      ),
    }),
    nextAllowedActions: Object.freeze([...snapshot.nextAllowedActions]),
  });
}

function freezeIdentityCaseSnapshot(
  snapshot: CustomerIdentityCaseSnapshot,
): CustomerIdentityCaseSnapshot {
  return Object.freeze({
    ...snapshot,
    nextAllowedActions: Object.freeze([...snapshot.nextAllowedActions]),
  });
}

function freezeWalletSnapshot(
  snapshot: CustomerWalletSnapshot,
): CustomerWalletSnapshot {
  return Object.freeze({
    ...snapshot,
    nextAllowedActions: Object.freeze([...snapshot.nextAllowedActions]),
  });
}
