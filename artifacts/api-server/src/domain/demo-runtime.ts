import type { Request } from "express";
import { randomUUID } from "node:crypto";
import type {
  ClaimedOutboxEvent,
  PostgresOperationsStore,
  WorkflowClaim,
} from "@workspace/db";
import {
  DeterministicFakeProviders,
  DomainError,
  InMemoryRemittanceRepository,
  RemittanceService,
  money,
  type Actor,
  type ActorResolver,
  type FakeScenario,
  type RemittanceTransfer,
  type RemittanceRepository,
  type RemittanceUnitOfWork,
  type LedgerControlPort,
} from "@workspace/remittance";
import { DemoLedgerAdapter, DEMO_LEDGER_ACCOUNT_IDS } from "./demo-ledger";
import { publicTransferStatus, serializeMoney } from "./serializers";
import {
  InMemoryBeneficiaryStore,
  serializeBeneficiary,
  type BeneficiaryDeliveryInput,
  type BeneficiaryStore,
} from "./beneficiary-store";

export const DEMO_ACTOR: Actor = Object.freeze({
  id: "demo_customer_001",
  displayName: "Samra Demo Customer",
  kind: "SEEDED_DEMO",
});

export const DEMO_ACTOR_B: Actor = Object.freeze({
  id: "demo_customer_002",
  displayName: "Second Synthetic Customer",
  kind: "SEEDED_DEMO",
});

const DEMO_ACTORS = new Map([
  [DEMO_ACTOR.id, DEMO_ACTOR],
  [DEMO_ACTOR_B.id, DEMO_ACTOR_B],
]);

export type PublicTransferDemoScenario =
  | "happy_path"
  | "caliza_rejection"
  | "chapa_failure"
  | "settlement_refund"
  | "timeout_retry"
  | "duplicate_event"
  | "out_of_order_event";

export type PublicReconciliationDemoScenario =
  "happy_path" | "reconciliation_amount_mismatch" | "missing_report_line";

export class SeededActorResolver implements ActorResolver<Request> {
  async resolve(request: Request): Promise<Actor> {
    const actorHint = request.header("x-demo-actor-id");
    if (actorHint !== undefined && actorHint !== DEMO_ACTOR.id) {
      throw new DomainError(
        "ACTOR_NOT_ALLOWED",
        "Only the primary seeded synthetic actor is available for this operation.",
      );
    }
    return DEMO_ACTOR;
  }
}

export class BeneficiaryActorResolver implements ActorResolver<Request> {
  async resolve(request: Request): Promise<Actor> {
    const actorHint = request.header("x-demo-actor-id");
    const actor =
      actorHint === undefined ? DEMO_ACTOR : DEMO_ACTORS.get(actorHint);
    if (!actor) {
      throw new DomainError(
        "ACTOR_NOT_ALLOWED",
        "Only a seeded synthetic actor is available in demo mode.",
      );
    }
    return actor;
  }
}

type ReconciliationClassification =
  | "matched"
  | "missing_internally"
  | "missing_externally"
  | "duplicate_external"
  | "amount_mismatch"
  | "currency_mismatch"
  | "status_mismatch"
  | "timing_difference"
  | "unexpected_external";

export type DemoReconciliationRun = Readonly<{
  id: string;
  status: "completed";
  provider: "caliza";
  startedAt: string;
  completedAt: string;
  items: readonly Readonly<{
    id: string;
    matchKey: string;
    classification: ReconciliationClassification;
    internalAmount?: ReturnType<typeof serializeMoney>;
    externalAmount?: ReturnType<typeof serializeMoney>;
  }>[];
}>;

export interface DemoBalanceLedger extends LedgerControlPort {
  getCustomerBalance(accountId: string): Promise<
    Readonly<{
      naturalBalanceMinor: bigint;
      availableMinor: bigint;
    }>
  >;
}

export interface ReconciliationStore {
  save(run: DemoReconciliationRun): Promise<void>;
  get(runId: string): Promise<DemoReconciliationRun | undefined>;
}

class InMemoryReconciliationStore implements ReconciliationStore {
  readonly #runs = new Map<string, DemoReconciliationRun>();

  async save(run: DemoReconciliationRun): Promise<void> {
    this.#runs.set(run.id, run);
  }

  async get(runId: string): Promise<DemoReconciliationRun | undefined> {
    return this.#runs.get(runId);
  }
}

export type DemoRuntimeDependencies = Readonly<{
  repository?: RemittanceRepository;
  ledger?: DemoBalanceLedger;
  unitOfWork?: RemittanceUnitOfWork;
  reconciliationStore?: ReconciliationStore;
  beneficiaryStore?: BeneficiaryStore;
  ids?: ConstructorParameters<typeof RemittanceService>[0]["ids"];
  nextBeneficiaryId?: () => string;
  nextReconciliationId?: () => string;
  operationsStore?: PostgresOperationsStore;
  publishOutbox?: (event: ClaimedOutboxEvent) => Promise<void>;
  close?: () => Promise<void>;
}>;

export class DemoRuntime {
  readonly actorResolver = new SeededActorResolver();
  readonly beneficiaryActorResolver = new BeneficiaryActorResolver();
  readonly repository: RemittanceRepository;
  readonly providers = new DeterministicFakeProviders();
  // Kept as the concrete demo adapter type for existing white-box demo tests.
  // PostgreSQL composition supplies the same operational surface at runtime.
  readonly ledger: DemoLedgerAdapter;
  readonly service: RemittanceService;
  readonly operationsStore?: PostgresOperationsStore;
  readonly #unitOfWork?: RemittanceUnitOfWork;
  readonly #reconciliationStore: ReconciliationStore;
  readonly #beneficiaryStore: BeneficiaryStore;
  readonly #nextBeneficiaryId: () => string;
  readonly #nextReconciliationId?: () => string;
  readonly #publishOutbox: (event: ClaimedOutboxEvent) => Promise<void>;
  readonly #workerId = `demo-worker-${randomUUID()}`;
  readonly #close?: () => Promise<void>;
  #closePromise?: Promise<void>;
  #reconciliationSequence = 0;

  constructor(dependencies: DemoRuntimeDependencies = {}) {
    this.repository =
      dependencies.repository ?? new InMemoryRemittanceRepository();
    this.ledger = (dependencies.ledger ??
      new DemoLedgerAdapter()) as DemoLedgerAdapter;
    this.#unitOfWork = dependencies.unitOfWork;
    this.#reconciliationStore =
      dependencies.reconciliationStore ?? new InMemoryReconciliationStore();
    this.#beneficiaryStore =
      dependencies.beneficiaryStore ?? new InMemoryBeneficiaryStore();
    this.#nextBeneficiaryId =
      dependencies.nextBeneficiaryId ??
      (() => `beneficiary_${randomUUID().replaceAll("-", "")}`);
    this.#nextReconciliationId = dependencies.nextReconciliationId;
    this.operationsStore = dependencies.operationsStore;
    this.#publishOutbox = dependencies.publishOutbox ?? (async () => undefined);
    this.#close = dependencies.close;
    this.service = new RemittanceService({
      repository: this.repository,
      providers: this.providers,
      ledger: this.ledger,
      fakeScenarioController: this.providers,
      unitOfWork: dependencies.unitOfWork,
      ids: dependencies.ids,
    });
  }

  async close(): Promise<void> {
    this.#closePromise ??= this.#close?.() ?? Promise.resolve();
    await this.#closePromise;
  }

  assertAccount(actorId: string, accountId: string): void {
    if (
      actorId !== DEMO_ACTOR.id ||
      accountId !== DEMO_LEDGER_ACCOUNT_IDS.customerUsd
    ) {
      throw new DomainError("NOT_FOUND", "The source account was not found.", {
        accountId,
      });
    }
  }

  async listBeneficiaries(actorId: string) {
    return (await this.#beneficiaryStore.list(actorId)).map(
      serializeBeneficiary,
    );
  }

  async getBeneficiary(actorId: string, beneficiaryId: string) {
    const beneficiary = await this.#beneficiaryStore.get(
      actorId,
      beneficiaryId,
    );
    if (!beneficiary) {
      throw beneficiaryNotFound(beneficiaryId);
    }
    return serializeBeneficiary(beneficiary);
  }

  async createBeneficiary(
    actorId: string,
    input: Readonly<{
      displayName: string;
      city: string;
      countryCode: "ET";
      deliveryDetails: BeneficiaryDeliveryInput;
    }>,
  ) {
    return this.#withTransaction(async () =>
      serializeBeneficiary(
        await this.#beneficiaryStore.create({
          id: this.#nextBeneficiaryId(),
          actorId,
          ...input,
          now: new Date().toISOString(),
        }),
      ),
    );
  }

  async updateBeneficiary(
    actorId: string,
    beneficiaryId: string,
    input: Readonly<{
      displayName?: string;
      city?: string;
      deliveryDetails?: BeneficiaryDeliveryInput;
    }>,
  ) {
    return this.#withTransaction(async () => {
      const beneficiary = await this.#beneficiaryStore.update(
        actorId,
        beneficiaryId,
        { ...input, now: new Date().toISOString() },
      );
      if (!beneficiary) throw beneficiaryNotFound(beneficiaryId);
      return serializeBeneficiary(beneficiary);
    });
  }

  async deleteBeneficiary(actorId: string, beneficiaryId: string) {
    return this.#withTransaction(async () => {
      const deleted = await this.#beneficiaryStore.softDelete(
        actorId,
        beneficiaryId,
        new Date().toISOString(),
      );
      if (!deleted) throw beneficiaryNotFound(beneficiaryId);
    });
  }

  async assertBeneficiaryRail(
    actorId: string,
    beneficiaryId: string,
    deliveryMethod: "bank" | "wallet",
  ): Promise<void> {
    const beneficiary = await this.#beneficiaryStore.get(
      actorId,
      beneficiaryId,
    );
    if (!beneficiary) throw beneficiaryNotFound(beneficiaryId);
    const expected = beneficiary.deliveryDetails.method;
    if (deliveryMethod !== expected) {
      throw new DomainError(
        "INVALID_ARGUMENT",
        "The selected beneficiary does not support that delivery method.",
        { beneficiaryId, deliveryMethod },
      );
    }
  }

  async recipientDisplay(
    actorId: string,
    beneficiaryId: string,
  ): Promise<string> {
    const beneficiary = await this.#beneficiaryStore.get(
      actorId,
      beneficiaryId,
      {
        includeDisabled: true,
      },
    );
    if (!beneficiary) throw beneficiaryNotFound(beneficiaryId);
    return beneficiary.displayName;
  }

  async accountResponse() {
    const balance = await this.ledger.getCustomerBalance(
      DEMO_LEDGER_ACCOUNT_IDS.customerUsd,
    );
    return {
      id: DEMO_LEDGER_ACCOUNT_IDS.customerUsd,
      kind: "domestic" as const,
      displayName: "Samra USD Balance",
      last4: "4242",
      currency: "USD" as const,
      bookBalance: serializeMoney(money(balance.naturalBalanceMinor, "USD")),
      availableBalance: serializeMoney(money(balance.availableMinor, "USD")),
      status: "active" as const,
    };
  }

  async accountResponses(actorId: string) {
    return actorId === DEMO_ACTOR.id ? [await this.accountResponse()] : [];
  }

  async activity(actorId: string) {
    const transfers = await this.service.listTransfers(actorId);
    const transferActivity = (
      await Promise.all(
        transfers.map((transfer) => this.#transferActivity(actorId, transfer)),
      )
    ).flat();
    const items = [
      ...(actorId === DEMO_ACTOR.id
        ? [
            {
              id: "activity_opening_balance_001",
              accountId: DEMO_LEDGER_ACCOUNT_IDS.customerUsd,
              sourceType: "opening_balance" as const,
              sourceId: "opening_balance_001",
              occurredAt: "2026-01-01T00:00:00.000Z",
              title: "Synthetic opening balance",
              category: "deposit" as const,
              direction: "credit" as const,
              amount: { currency: "USD" as const, minorUnits: "425000" },
              status: "completed" as const,
            },
          ]
        : []),
      ...transferActivity,
    ].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
    return items;
  }

  async runReconciliation(
    actorId: string,
    scenario: PublicReconciliationDemoScenario = "happy_path",
  ): Promise<DemoReconciliationRun> {
    if (this.#unitOfWork) {
      return this.#unitOfWork.run(() =>
        this.#runReconciliation(actorId, scenario),
      );
    }
    return this.#runReconciliation(actorId, scenario);
  }

  async #withTransaction<T>(operation: () => Promise<T>): Promise<T> {
    return this.#unitOfWork ? this.#unitOfWork.run(operation) : operation();
  }

  async #runReconciliation(
    actorId: string,
    scenario: PublicReconciliationDemoScenario,
  ): Promise<DemoReconciliationRun> {
    const transfers = await this.service.listTransfers(actorId);
    const reconcilable = transfers.filter(
      (transfer) => transfer.reconciliationState === "PENDING",
    );
    const startedAt = new Date().toISOString();
    const items = reconcilable.map((transfer, index) => {
      const classification: ReconciliationClassification =
        scenario === "reconciliation_amount_mismatch" && index === 0
          ? "amount_mismatch"
          : scenario === "missing_report_line" && index === 0
            ? "missing_externally"
            : "matched";
      const internalAmount = serializeMoney(transfer.quote.sourceAmount);
      const externalAmount =
        classification === "missing_externally"
          ? undefined
          : classification === "amount_mismatch"
            ? serializeMoney(
                money(transfer.quote.sourceAmount.amountMinor + 1n, "USD"),
              )
            : internalAmount;
      return Object.freeze({
        id: `recon_item_${transfer.id}`,
        matchKey: transfer.id,
        classification,
        internalAmount,
        ...(externalAmount === undefined ? {} : { externalAmount }),
      });
    });

    for (const [index, transfer] of reconcilable.entries()) {
      const classification = items[index]?.classification;
      await this.service.setReconciliation(
        actorId,
        transfer.id,
        classification === "matched" ? "MATCHED" : "EXCEPTION",
      );
    }

    this.#reconciliationSequence += 1;
    const completedAt = new Date(
      Math.max(Date.now(), Date.parse(startedAt) + 1),
    ).toISOString();
    const run: DemoReconciliationRun = Object.freeze({
      id:
        this.#nextReconciliationId?.() ??
        `recon_run_${this.#reconciliationSequence.toString().padStart(6, "0")}`,
      status: "completed" as const,
      provider: "caliza" as const,
      startedAt,
      completedAt,
      items: Object.freeze(items),
    });
    await this.#reconciliationStore.save(run);
    return run;
  }

  async getReconciliation(runId: string): Promise<DemoReconciliationRun> {
    const run = await this.#reconciliationStore.get(runId);
    if (!run) {
      throw new DomainError(
        "NOT_FOUND",
        "The reconciliation run was not found.",
        {
          runId,
        },
      );
    }
    return run;
  }

  toDomainScenario(scenario: PublicTransferDemoScenario): FakeScenario {
    return scenario.toUpperCase() as FakeScenario;
  }

  async advanceWorkerBatch(limit = 25): Promise<number> {
    if (this.operationsStore) {
      return this.#advanceDurableWorkerBatch(limit);
    }
    const transfers = await this.service.listTransfers(DEMO_ACTOR.id);
    for (const transfer of transfers) {
      this.providers.setScenario(
        transfer.id,
        await this.repository.getFakeScenario(transfer.id),
      );
    }
    const pending = transfers
      .filter((transfer) => {
        const scenario = this.providers.getScenario(transfer.id);
        if (
          ["SUBMITTED", "IN_TRANSIT", "PAYOUT_PENDING"].includes(transfer.state)
        ) {
          return true;
        }
        if (
          transfer.state === "COMPLETED" &&
          scenario === "SETTLEMENT_REFUND"
        ) {
          return true;
        }
        return (
          ["REFUND_PENDING", "REVERSAL_PENDING"].includes(transfer.state) &&
          ["CHAPA_FAILURE", "SETTLEMENT_REFUND"].includes(scenario)
        );
      })
      .slice(0, limit);
    for (const transfer of pending) {
      await this.service.selectAndAdvanceFakeScenario(
        DEMO_ACTOR.id,
        transfer.id,
        this.providers.getScenario(transfer.id),
      );
    }
    return pending.length;
  }

  async #advanceDurableWorkerBatch(limit: number): Promise<number> {
    const store = this.operationsStore!;
    const now = new Date();
    const claims = await store.claimWorkflowBatch({
      workerId: this.#workerId,
      limit,
      now,
      leaseMilliseconds: 30_000,
    });
    for (const claim of claims) {
      await this.#processWorkflowClaim(claim);
    }
    const outbox = await store.claimOutboxBatch({
      workerId: this.#workerId,
      limit,
      now: new Date(),
      leaseMilliseconds: 30_000,
    });
    for (const event of outbox) {
      try {
        await this.#publishOutbox(event);
        const publishedAt = new Date();
        await store.markOutboxPublished({
          eventId: event.id,
          workerId: this.#workerId,
          publishedAt,
        });
        await store.recordAudit({
          eventKey: `outbox:${event.eventKey}:published`,
          actorType: "system",
          actorId: this.#workerId,
          action: "outbox_published",
          entityType: "remittance_transfer",
          entityId: event.aggregateId,
          correlationId: event.eventKey,
          metadata: { eventType: event.eventType, attempt: event.attemptCount },
          occurredAt: publishedAt,
        });
      } catch (error) {
        await store.failOutbox({
          eventId: event.id,
          workerId: this.#workerId,
          error: errorMessage(error),
          retryAt: retryAt(event.attemptCount),
          maxAttempts: 5,
        });
      }
    }
    return claims.length;
  }

  async #processWorkflowClaim(claim: WorkflowClaim): Promise<void> {
    const store = this.operationsStore!;
    try {
      const before = await this.service.getTransfer(
        claim.actorId,
        claim.transferId,
      );
      const scenario = await this.repository.getFakeScenario(claim.transferId);
      this.providers.setScenario(claim.transferId, scenario);
      this.providers.resumeAttempt?.(
        claim.transferId,
        before.state,
        claim.attemptCount - 1,
      );
      const after = await this.service.selectAndAdvanceFakeScenario(
        claim.actorId,
        claim.transferId,
        scenario,
      );
      const progressed = after.version > before.version;
      const actionable = isWorkerActionable(after.state, scenario);
      await store.settleWorkflowClaim({
        claimId: claim.id,
        workerId: this.#workerId,
        transferVersion: after.version,
        actionable,
        progressed,
        retryAt:
          progressed || !actionable ? new Date() : retryAt(claim.attemptCount),
      });
      await store.recordAudit({
        eventKey: `workflow:${claim.transferId}:v${claim.transferVersion}:attempt:${claim.attemptCount}`,
        actorType: "system",
        actorId: this.#workerId,
        action: progressed ? "workflow_advanced" : "workflow_retry_scheduled",
        entityType: "remittance_transfer",
        entityId: claim.transferId,
        correlationId: claim.transferId,
        metadata: {
          fromState: before.state,
          toState: after.state,
          attempt: claim.attemptCount,
          actionable,
        },
      });
    } catch (error) {
      await store.failWorkflowClaim({
        claimId: claim.id,
        workerId: this.#workerId,
        error: errorMessage(error),
        retryAt: retryAt(claim.attemptCount),
      });
      await store.recordAudit({
        eventKey: `workflow:${claim.transferId}:v${claim.transferVersion}:attempt:${claim.attemptCount}:failed`,
        actorType: "system",
        actorId: this.#workerId,
        action: "workflow_attempt_failed",
        entityType: "remittance_transfer",
        entityId: claim.transferId,
        correlationId: claim.transferId,
        metadata: { attempt: claim.attemptCount, error: errorMessage(error) },
      });
    }
  }

  async #transferActivity(actorId: string, transfer: RemittanceTransfer) {
    const status = publicTransferStatus(transfer.state);
    const primary = {
      id: `activity_transfer_${transfer.id}`,
      accountId: transfer.quote.sourceAccountId,
      sourceType: "remittance" as const,
      sourceId: transfer.id,
      occurredAt: transfer.createdAt,
      title: `Remittance to ${await this.recipientDisplay(actorId, transfer.quote.beneficiaryId)}`,
      category: "remittance" as const,
      direction: "debit" as const,
      amount: serializeMoney(transfer.quote.debitAmount),
      status:
        status === "completed"
          ? ("completed" as const)
          : status === "failed" || status === "cancelled"
            ? ("failed" as const)
            : status === "refunded"
              ? ("reversed" as const)
              : ("pending" as const),
    };
    if (status !== "refunded") {
      return [primary];
    }
    return [
      primary,
      {
        id: `activity_refund_${transfer.id}`,
        accountId: transfer.quote.sourceAccountId,
        sourceType: "remittance" as const,
        sourceId: transfer.id,
        occurredAt: transfer.updatedAt,
        title: "Remittance refund",
        category: "refund" as const,
        direction: "credit" as const,
        amount: serializeMoney(transfer.quote.debitAmount),
        status: "completed" as const,
      },
    ];
  }
}

function isWorkerActionable(
  state: RemittanceTransfer["state"],
  scenario: FakeScenario,
): boolean {
  if (
    [
      "SUBMITTED",
      "IN_TRANSIT",
      "PAYOUT_PENDING",
      "REFUND_PENDING",
      "REVERSAL_PENDING",
    ].includes(state)
  ) {
    return true;
  }
  return state === "COMPLETED" && scenario === "SETTLEMENT_REFUND";
}

function retryAt(attempt: number): Date {
  const delay = Math.min(5_000, 100 * 2 ** Math.max(0, attempt - 1));
  return new Date(Date.now() + delay);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function beneficiaryNotFound(beneficiaryId: string): DomainError {
  return new DomainError("NOT_FOUND", "The beneficiary was not found.", {
    beneficiaryId,
  });
}
