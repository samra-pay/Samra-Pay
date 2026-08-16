import type { Request } from "express";
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

export const DEMO_ACTOR: Actor = Object.freeze({
  id: "demo_customer_001",
  displayName: "Samra Demo Customer",
  kind: "SEEDED_DEMO",
});

export const DEMO_BENEFICIARIES = Object.freeze({
  beneficiary_bank_001: "Abebe Bekele",
  beneficiary_wallet_001: "Tigist Haile",
});

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
        "Only the seeded synthetic actor is available in demo mode.",
      );
    }
    return DEMO_ACTOR;
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
  ids?: ConstructorParameters<typeof RemittanceService>[0]["ids"];
  nextReconciliationId?: () => string;
  close?: () => Promise<void>;
}>;

export class DemoRuntime {
  readonly actorResolver = new SeededActorResolver();
  readonly repository: RemittanceRepository;
  readonly providers = new DeterministicFakeProviders();
  // Kept as the concrete demo adapter type for existing white-box demo tests.
  // PostgreSQL composition supplies the same operational surface at runtime.
  readonly ledger: DemoLedgerAdapter;
  readonly service: RemittanceService;
  readonly #unitOfWork?: RemittanceUnitOfWork;
  readonly #reconciliationStore: ReconciliationStore;
  readonly #nextReconciliationId?: () => string;
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
    this.#nextReconciliationId = dependencies.nextReconciliationId;
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

  assertBeneficiary(beneficiaryId: string): void {
    if (!(beneficiaryId in DEMO_BENEFICIARIES)) {
      throw new DomainError("NOT_FOUND", "The beneficiary was not found.", {
        beneficiaryId,
      });
    }
  }

  assertBeneficiaryRail(
    beneficiaryId: string,
    deliveryMethod: "bank" | "wallet",
  ): void {
    this.assertBeneficiary(beneficiaryId);
    const expected =
      beneficiaryId === "beneficiary_bank_001" ? "bank" : "wallet";
    if (deliveryMethod !== expected) {
      throw new DomainError(
        "INVALID_ARGUMENT",
        "The selected beneficiary does not support that delivery method.",
        { beneficiaryId, deliveryMethod },
      );
    }
  }

  recipientDisplay(beneficiaryId: string): string {
    this.assertBeneficiary(beneficiaryId);
    return DEMO_BENEFICIARIES[beneficiaryId as keyof typeof DEMO_BENEFICIARIES];
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

  async activity(actorId: string) {
    const transfers = await this.service.listTransfers(actorId);
    const items = [
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
      ...transfers.flatMap((transfer) => this.#transferActivity(transfer)),
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

  #transferActivity(transfer: RemittanceTransfer) {
    const status = publicTransferStatus(transfer.state);
    const primary = {
      id: `activity_transfer_${transfer.id}`,
      accountId: transfer.quote.sourceAccountId,
      sourceType: "remittance" as const,
      sourceId: transfer.id,
      occurredAt: transfer.createdAt,
      title: `Remittance to ${this.recipientDisplay(transfer.quote.beneficiaryId)}`,
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
