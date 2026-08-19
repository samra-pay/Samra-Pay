import {
  PostgresLedgerControl,
  PostgresPersistenceContext,
  PostgresRemittanceRepository,
  PostgresOperationsStore,
  PostgresWorkforceAuthStore,
  PostgresOperationsCaseStore,
  PostgresCustomerIdentityStore,
  PostgresCustomerOnboardingStore,
  PostgresCustomerIdentityCaseStore,
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

export function createConfiguredDemoRuntime(
  config: ApiRuntimeConfig,
): DemoRuntime {
  if ((config.persistenceMode ?? "memory") === "memory") {
    return new DemoRuntime();
  }
  const connection = createDatabase();
  const context = new PostgresPersistenceContext(connection.pool);
  const customerIdentityStore = new PostgresCustomerIdentityStore(context);
  const customerOnboardingStore = new PostgresCustomerOnboardingStore(context);
  const customerIdentityCaseStore = new PostgresCustomerIdentityCaseStore(
    context,
  );
  const customerActorResolver =
    config.customerAuth.mode === "auth0"
      ? new Auth0CustomerActorResolver(
          customerIdentityStore,
          config.customerAuth.issuerBaseUrl,
        )
      : undefined;
  return new DemoRuntime({
    repository: new PostgresRemittanceRepository(context),
    ledger: new PostgresLedgerControl(context),
    unitOfWork: context,
    beneficiaryStore: new PostgresBeneficiaryStore(context),
    reconciliationStore: new PostgresReconciliationStore(context),
    operationsStore: new PostgresOperationsStore(context),
    workforceAuthStore: new PostgresWorkforceAuthStore(context),
    operationsCaseStore: new PostgresOperationsCaseStore(context),
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
            provider: new DeterministicFakePersonaAdapter(),
          })
        : undefined,
    ids: new RandomIdGenerator(),
    nextReconciliationId: () => `recon_run_${randomUUID()}`,
    readiness: () => assertPostgresRuntimeReady(connection.pool),
    close: () => connection.pool.end(),
  });
}
