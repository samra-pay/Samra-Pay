import { PostgresProductAccountStore } from "./postgres-product-account-store";
import {
  PostgresLedgerControl,
  PostgresPersistenceContext,
  PostgresRemittanceRepository,
  PostgresOperationsStore,
  PostgresWorkforceAuthStore,
  PostgresOperationsCaseStore,
  PostgresCustomerIdentityStore,
  PostgresCustomerOnboardingStore,
  PostgresAlphaAccessStore,
  PostgresCustomerIdentityCaseStore,
  PostgresCustomerFunnelStore,
  PostgresCustomerWalletStore,
  PostgresMarketingWaitlistStore,
  RandomIdGenerator,
  assertPostgresRuntimeReady,
  createDatabase,
} from "@workspace/db";
import { randomUUID } from "node:crypto";
import type { ApiRuntimeConfig } from "../config";
import { DemoRuntime } from "./demo-runtime";
import { PostgresReconciliationStore } from "./postgres-reconciliation";
import { PostgresBeneficiaryStore } from "./postgres-beneficiary-store";
import { Auth0CustomerActorResolver } from "./customer-auth";
import {
  CustomerIdentityVerificationService,
  DeterministicFakePersonaAdapter,
} from "./customer-identity";
import { PersonaSandboxAdapter, PersonaWebhookService } from "./persona";
import { CrossmintCustomerSandboxAdapter } from "./crossmint-customer-sandbox";
import {
  CustomerWalletProvisioningService,
  DeterministicFakeCrossmintAdapter,
} from "./customer-wallet";

export function createConfiguredDemoRuntime(
  config: ApiRuntimeConfig,
): DemoRuntime {
  if (config.persistenceMode !== "postgres") {
    throw new Error(
      "The demo backend requires SAMRA_PERSISTENCE_MODE=postgres. Use SAMRA_BACKEND_MODE=disabled for health endpoints without a database.",
    );
  }
  const connection = createDatabase();
  const context = new PostgresPersistenceContext(connection.pool);
  const customerIdentityStore = new PostgresCustomerIdentityStore(context);
  const customerAlphaAccessStore =
    config.releaseProfile === "alpha-release-1" ||
    config.releaseProfile === "synthetic-shared"
      ? new PostgresAlphaAccessStore(context)
      : undefined;
  const customerOnboardingStore = new PostgresCustomerOnboardingStore(
    context,
    customerAlphaAccessStore,
  );
  const customerIdentityCaseStore = new PostgresCustomerIdentityCaseStore(
    context,
  );
  const walletConfig = config.customerWalletProvider ?? {
    mode: "fake" as const,
  };
  const customerWalletStore = new PostgresCustomerWalletStore(
    context,
    walletConfig.mode === "fake"
      ? { mode: "fake" }
      : {
          mode: walletConfig.mode,
          allowedCustomerId: walletConfig.allowedCustomerId,
        },
  );
  const customerActorResolver =
    config.customerAuth.mode === "auth0"
      ? new Auth0CustomerActorResolver(
          customerIdentityStore,
          config.customerAuth.issuerBaseUrl,
        )
      : undefined;
  const customerIdentityProvider =
    config.customerIdentityProvider?.mode === "persona-sandbox"
      ? new PersonaSandboxAdapter(config.customerIdentityProvider)
      : new DeterministicFakePersonaAdapter();
  return new DemoRuntime({
    customerAlphaAccessStore,
    productAccountStore:
      config.releaseProfile === "synthetic-shared"
        ? new PostgresProductAccountStore(context)
        : undefined,
    repository: new PostgresRemittanceRepository(context),
    ledger: new PostgresLedgerControl(context),
    unitOfWork: context,
    beneficiaryStore: new PostgresBeneficiaryStore(context),
    reconciliationStore: new PostgresReconciliationStore(context),
    operationsStore: new PostgresOperationsStore(context),
    workforceAuthStore: new PostgresWorkforceAuthStore(context),
    operationsCaseStore: new PostgresOperationsCaseStore(context),
    customerFunnelStore: new PostgresCustomerFunnelStore(context),
    marketingWaitlistStore: new PostgresMarketingWaitlistStore(context),
    actorResolver: customerActorResolver,
    beneficiaryActorResolver: customerActorResolver,
    customerAuthenticationMode:
      config.customerAuth.mode === "auth0" ? "auth0" : "seeded-demo",
    customerOnboardingStore:
      config.customerAuth.mode === "auth0"
        ? customerOnboardingStore
        : undefined,
    customerIdentityVerificationService:
      config.customerAuth.mode === "auth0"
        ? new CustomerIdentityVerificationService({
            store: customerIdentityCaseStore,
            provider: customerIdentityProvider,
          })
        : undefined,
    personaWebhookService:
      config.customerAuth.mode === "auth0" &&
      config.customerIdentityProvider?.mode === "persona-sandbox"
        ? new PersonaWebhookService({
            store: customerIdentityCaseStore,
            webhookSecrets: config.customerIdentityProvider.webhookSecrets,
          })
        : undefined,
    customerWalletProvisioningService:
      config.customerAuth.mode === "auth0"
        ? new CustomerWalletProvisioningService({
            store: customerWalletStore,
            providerMode: walletConfig.mode,
            provider:
              walletConfig.mode === "crossmint-sandbox-customer"
                ? new CrossmintCustomerSandboxAdapter(walletConfig)
                : new DeterministicFakeCrossmintAdapter(),
          })
        : undefined,
    ids: new RandomIdGenerator(),
    nextReconciliationId: () => `recon_run_${randomUUID()}`,
    readiness: () =>
      assertPostgresRuntimeReady(connection.pool, {
        alphaReleaseAdmission:
          config.releaseProfile === "alpha-release-1" ||
          config.releaseProfile === "synthetic-shared",
        customerControlledSandboxWallets:
          walletConfig.mode === "crossmint-sandbox-customer",
      }),
    close: () => connection.pool.end(),
  });
}
