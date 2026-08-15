import type { ProviderEvent } from "./events";
import type { ProviderResourceLink, RemittanceTransfer } from "./model";

export interface RainPort {
  authorizeDebit(input: {
    transferId: string;
    accountId: string;
    amountMinor: bigint;
    idempotencyKey: string;
    occurredAt: string;
  }): Promise<ProviderResourceLink>;
  releaseAuthorization(input: {
    transferId: string;
    idempotencyKey: string;
    occurredAt: string;
  }): Promise<void>;
  requestRefund(input: {
    transferId: string;
    amountMinor: bigint;
    idempotencyKey: string;
    occurredAt: string;
  }): Promise<ProviderResourceLink>;
}

export interface CalizaPort {
  submitTransfer(input: {
    transferId: string;
    sourceAmountMinor: bigint;
    sourceCurrency: "USD";
    destinationCurrency: "ETB";
    beneficiaryId: string;
    idempotencyKey: string;
    occurredAt: string;
  }): Promise<ProviderResourceLink>;
  cancelTransfer(input: {
    transferId: string;
    idempotencyKey: string;
    occurredAt: string;
  }): Promise<boolean>;
}

export interface ChapaPort {
  submitPayout(input: {
    transferId: string;
    beneficiaryId: string;
    amountMinor: bigint;
    currency: "ETB";
    idempotencyKey: string;
    occurredAt: string;
  }): Promise<ProviderResourceLink>;
}

export interface LedgerControlPort {
  reserve(input: {
    transferId: string;
    accountId: string;
    amountMinor: bigint;
    principalAmountMinor: bigint;
    feeAmountMinor: bigint;
    currency: "USD";
    idempotencyKey: string;
  }): Promise<{ holdId: string }>;
  capture(input: {
    transferId: string;
    holdId: string;
    idempotencyKey: string;
  }): Promise<void>;
  release(input: {
    transferId: string;
    holdId: string;
    idempotencyKey: string;
  }): Promise<void>;
  settlePrincipal(input: {
    transferId: string;
    amountMinor: bigint;
    currency: "USD";
    idempotencyKey: string;
  }): Promise<void>;
  recognizeFee(input: {
    transferId: string;
    amountMinor: bigint;
    currency: "USD";
    idempotencyKey: string;
  }): Promise<void>;
  refund(input: {
    transferId: string;
    amountMinor: bigint;
    currency: "USD";
    idempotencyKey: string;
  }): Promise<void>;
}

export type ProviderSuite = Readonly<{
  rain: RainPort;
  caliza: CalizaPort;
  chapa: ChapaPort;
}>;

export type FakeScenario =
  | "HAPPY_PATH"
  | "CALIZA_REJECTION"
  | "CHAPA_FAILURE"
  | "SETTLEMENT_REFUND"
  | "TIMEOUT_RETRY"
  | "DUPLICATE_EVENT"
  | "OUT_OF_ORDER_EVENT"
  | "RECONCILIATION_AMOUNT_MISMATCH"
  | "MISSING_REPORT_LINE";

export interface FakeScenarioController {
  setScenario(transferId: string, scenario: FakeScenario): void;
  getScenario(transferId: string): FakeScenario;
  nextEvent(
    transfer: RemittanceTransfer,
    occurredAt: string,
  ): ProviderEvent | null;
}

export class DeterministicFakeProviders
  implements RainPort, CalizaPort, ChapaPort, FakeScenarioController
{
  readonly rain: RainPort = this;
  readonly caliza: CalizaPort = this;
  readonly chapa: ChapaPort = this;
  readonly #scenarios = new Map<string, FakeScenario>();
  readonly #attempts = new Map<string, number>();

  async authorizeDebit(input: {
    transferId: string;
    accountId: string;
    amountMinor: bigint;
    idempotencyKey: string;
    occurredAt: string;
  }): Promise<ProviderResourceLink> {
    return providerLink(
      "RAIN",
      "FUNDING_AUTHORIZATION",
      deterministicId("rain_auth", input.transferId),
      input.occurredAt,
    );
  }

  async releaseAuthorization(_input: {
    transferId: string;
    idempotencyKey: string;
    occurredAt: string;
  }): Promise<void> {
    return;
  }

  async requestRefund(input: {
    transferId: string;
    amountMinor: bigint;
    idempotencyKey: string;
    occurredAt: string;
  }): Promise<ProviderResourceLink> {
    return providerLink(
      "RAIN",
      "REFUND",
      deterministicId("rain_refund", input.transferId),
      input.occurredAt,
    );
  }

  async submitTransfer(input: {
    transferId: string;
    sourceAmountMinor: bigint;
    sourceCurrency: "USD";
    destinationCurrency: "ETB";
    beneficiaryId: string;
    idempotencyKey: string;
    occurredAt: string;
  }): Promise<ProviderResourceLink> {
    return providerLink(
      "CALIZA",
      "TRANSFER",
      deterministicId("caliza_transfer", input.transferId),
      input.occurredAt,
    );
  }

  async cancelTransfer(_input: {
    transferId: string;
    idempotencyKey: string;
    occurredAt: string;
  }): Promise<boolean> {
    return true;
  }

  async submitPayout(input: {
    transferId: string;
    beneficiaryId: string;
    amountMinor: bigint;
    currency: "ETB";
    idempotencyKey: string;
    occurredAt: string;
  }): Promise<ProviderResourceLink> {
    return providerLink(
      "CHAPA",
      "PAYOUT",
      deterministicId("chapa_payout", input.transferId),
      input.occurredAt,
    );
  }

  setScenario(transferId: string, scenario: FakeScenario): void {
    this.#scenarios.set(transferId, scenario);
  }

  getScenario(transferId: string): FakeScenario {
    return this.#scenarios.get(transferId) ?? "HAPPY_PATH";
  }

  nextEvent(
    transfer: RemittanceTransfer,
    occurredAt: string,
  ): ProviderEvent | null {
    const scenario = this.getScenario(transfer.id);
    const attemptKey = `${transfer.id}:${transfer.state}`;
    const attempt = (this.#attempts.get(attemptKey) ?? 0) + 1;
    this.#attempts.set(attemptKey, attempt);
    const kind = nextEventKind(transfer, scenario, attempt);
    if (kind === null) {
      return null;
    }

    const provider = kind.startsWith("CALIZA_")
      ? "CALIZA"
      : kind.startsWith("CHAPA_")
        ? "CHAPA"
        : "RAIN";
    let payload: Readonly<Record<string, string>> = Object.freeze({});
    if (kind === "RAIN_REFUNDED" && scenario === "SETTLEMENT_REFUND") {
      payload = Object.freeze({ reason: "PAYOUT_REVERSED" });
    }
    return Object.freeze({
      provider,
      providerEventId: deterministicId(
        `${scenario.toLowerCase()}_${kind.toLowerCase()}`,
        transfer.id,
      ),
      transferId: transfer.id,
      kind,
      occurredAt,
      payload,
    });
  }
}

export class InMemoryLedgerControl implements LedgerControlPort {
  readonly #holds = new Map<
    string,
    Readonly<{
      holdId: string;
      amountMinor: bigint;
      state: "RESERVED" | "CAPTURED" | "RELEASED" | "REFUNDED";
    }>
  >();

  async reserve(input: {
    transferId: string;
    accountId: string;
    amountMinor: bigint;
    principalAmountMinor: bigint;
    feeAmountMinor: bigint;
    currency: "USD";
    idempotencyKey: string;
  }): Promise<{ holdId: string }> {
    const existing = this.#holds.get(input.transferId);
    if (existing) {
      return { holdId: existing.holdId };
    }

    const holdId = deterministicId("demo_hold", input.transferId);
    this.#holds.set(
      input.transferId,
      Object.freeze({
        holdId,
        amountMinor: input.amountMinor,
        state: "RESERVED" as const,
      }),
    );
    return { holdId };
  }

  async capture(input: {
    transferId: string;
    holdId: string;
    idempotencyKey: string;
  }): Promise<void> {
    this.#replaceHold(input.transferId, input.holdId, "CAPTURED");
  }

  async release(input: {
    transferId: string;
    holdId: string;
    idempotencyKey: string;
  }): Promise<void> {
    this.#replaceHold(input.transferId, input.holdId, "RELEASED");
  }

  async settlePrincipal(_input: {
    transferId: string;
    amountMinor: bigint;
    currency: "USD";
    idempotencyKey: string;
  }): Promise<void> {
    return;
  }

  async recognizeFee(_input: {
    transferId: string;
    amountMinor: bigint;
    currency: "USD";
    idempotencyKey: string;
  }): Promise<void> {
    return;
  }

  async refund(input: {
    transferId: string;
    amountMinor: bigint;
    currency: "USD";
    idempotencyKey: string;
  }): Promise<void> {
    const existing = this.#holds.get(input.transferId);
    if (existing) {
      this.#holds.set(
        input.transferId,
        Object.freeze({ ...existing, state: "REFUNDED" as const }),
      );
    }
  }

  holdState(transferId: string): string | undefined {
    return this.#holds.get(transferId)?.state;
  }

  #replaceHold(
    transferId: string,
    holdId: string,
    state: "CAPTURED" | "RELEASED",
  ): void {
    const existing = this.#holds.get(transferId);
    if (!existing || existing.holdId !== holdId) {
      return;
    }
    this.#holds.set(transferId, Object.freeze({ ...existing, state }));
  }
}

function nextEventKind(
  transfer: RemittanceTransfer,
  scenario: FakeScenario,
  attempt: number,
): ProviderEvent["kind"] | null {
  if (transfer.state === "SUBMITTED") {
    if (scenario === "TIMEOUT_RETRY" && attempt === 1) {
      return null;
    }
    return scenario === "CALIZA_REJECTION"
      ? "CALIZA_REJECTED"
      : "CALIZA_ACCEPTED";
  }
  if (transfer.state === "IN_TRANSIT") {
    return "CALIZA_DELIVERED";
  }
  if (transfer.state === "PAYOUT_PENDING") {
    return scenario === "CHAPA_FAILURE" ? "CHAPA_FAILED" : "CHAPA_PAID";
  }
  if (transfer.state === "COMPLETED" && scenario === "SETTLEMENT_REFUND") {
    return "CHAPA_REVERSED";
  }
  if (
    (transfer.state === "REFUND_PENDING" ||
      transfer.state === "REVERSAL_PENDING") &&
    (scenario === "CHAPA_FAILURE" || scenario === "SETTLEMENT_REFUND")
  ) {
    return "RAIN_REFUNDED";
  }
  return null;
}

function providerLink(
  provider: ProviderResourceLink["provider"],
  resourceType: ProviderResourceLink["resourceType"],
  providerResourceId: string,
  createdAt: string,
): ProviderResourceLink {
  return Object.freeze({
    provider,
    resourceType,
    providerResourceId,
    createdAt,
  });
}

function deterministicId(prefix: string, transferId: string): string {
  const safeTransferId = transferId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${prefix}_${safeTransferId}`;
}
