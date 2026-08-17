import {
  PostgresLedgerControl,
  PostgresPersistenceContext,
  PostgresRemittanceRepository,
  PostgresOperationsStore,
  PostgresWorkforceAuthStore,
  PostgresOperationsCaseStore,
  RandomIdGenerator,
  createDatabase,
} from "@workspace/db";
import { randomUUID } from "node:crypto";
import type { ApiRuntimeConfig } from "../config";
import { DemoRuntime } from "./demo-runtime";
import { PostgresReconciliationStore } from "./postgres-reconciliation";
import { PostgresBeneficiaryStore } from "./postgres-beneficiary-store";

export function createConfiguredDemoRuntime(
  config: ApiRuntimeConfig,
): DemoRuntime {
  if ((config.persistenceMode ?? "memory") === "memory") {
    return new DemoRuntime();
  }
  const connection = createDatabase();
  const context = new PostgresPersistenceContext(connection.pool);
  return new DemoRuntime({
    repository: new PostgresRemittanceRepository(context),
    ledger: new PostgresLedgerControl(context),
    unitOfWork: context,
    beneficiaryStore: new PostgresBeneficiaryStore(context),
    reconciliationStore: new PostgresReconciliationStore(context),
    operationsStore: new PostgresOperationsStore(context),
    workforceAuthStore: new PostgresWorkforceAuthStore(context),
    operationsCaseStore: new PostgresOperationsCaseStore(context),
    ids: new RandomIdGenerator(),
    nextReconciliationId: () => `recon_run_${randomUUID()}`,
    close: () => connection.pool.end(),
  });
}
