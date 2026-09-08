import type { LedgerRepository } from "@workspace/ledger";
import type { LedgerControlPort } from "@workspace/remittance";

export const DEMO_LEDGER_ACCOUNT_IDS = Object.freeze({
  customerUsd: "demo_usd_account_001",
  rainControlUsd: "control_rain_usd",
  principalClearingUsd: "clearing_remittance_principal_usd",
  deferredFeeUsd: "liability_deferred_remittance_fee_usd",
  feeRevenueUsd: "revenue_remittance_fee_usd",
});

type TransferAccountingRecord = {
  holdId: string;
  principalAmountMinor: bigint;
  feeAmountMinor: bigint;
  captureJournalId?: string;
  settlementJournalId?: string;
  feeJournalId?: string;
};

export class DemoLedgerAdapter implements LedgerControlPort {
  readonly repository: LedgerRepository;
  readonly #records = new Map<string, TransferAccountingRecord>();

  constructor(repository: LedgerRepository) {
    this.repository = repository;
    this.#seed();
  }

  async findHoldId(transferId: string): Promise<string | undefined> {
    return this.#records.get(transferId)?.holdId;
  }

  async getCustomerBalance(accountId: string) {
    return this.repository.getAccountBalance(accountId);
  }

  async reserve(input: {
    transferId: string;
    accountId: string;
    amountMinor: bigint;
    principalAmountMinor: bigint;
    feeAmountMinor: bigint;
    currency: "USD";
    idempotencyKey: string;
  }): Promise<{ holdId: string }> {
    if (
      input.amountMinor !==
      input.principalAmountMinor + input.feeAmountMinor
    ) {
      throw new Error("Transfer debit must equal principal plus fee.");
    }
    const hold = this.repository.createHold({
      accountId: input.accountId,
      amountMinor: input.amountMinor,
      source: { type: "remittance_transfer", id: input.transferId },
      idempotencyKey: input.idempotencyKey,
    });
    this.#records.set(input.transferId, {
      holdId: hold.id,
      principalAmountMinor: input.principalAmountMinor,
      feeAmountMinor: input.feeAmountMinor,
    });
    return { holdId: hold.id };
  }

  async capture(input: {
    transferId: string;
    holdId: string;
    idempotencyKey: string;
  }): Promise<void> {
    const record = this.#requiredRecord(input.transferId, input.holdId);
    const postings = [
      {
        accountId: DEMO_LEDGER_ACCOUNT_IDS.customerUsd,
        side: "debit" as const,
        amountMinor: record.principalAmountMinor + record.feeAmountMinor,
        memo: "Reduce customer liability for remittance principal and fee",
      },
      {
        accountId: DEMO_LEDGER_ACCOUNT_IDS.principalClearingUsd,
        side: "credit" as const,
        amountMinor: record.principalAmountMinor,
        memo: "Establish principal clearing liability",
      },
      ...(record.feeAmountMinor > 0n
        ? [
            {
              accountId: DEMO_LEDGER_ACCOUNT_IDS.deferredFeeUsd,
              side: "credit" as const,
              amountMinor: record.feeAmountMinor,
              memo: "Defer remittance fee until payout completes",
            },
          ]
        : []),
    ];
    const result = this.repository.captureHold({
      holdId: input.holdId,
      journal: {
        source: { type: "remittance_capture", id: input.transferId },
        description: "Capture remittance principal and deferred fee",
        currency: "USD",
        postings,
        metadata: { transferId: input.transferId },
      },
      idempotencyKey: input.idempotencyKey,
    });
    record.captureJournalId = result.journal.id;
  }

  async release(input: {
    transferId: string;
    holdId: string;
    idempotencyKey: string;
  }): Promise<void> {
    this.#requiredRecord(input.transferId, input.holdId);
    this.repository.releaseHold(input.holdId, "remittance_cancelled");
  }

  async settlePrincipal(input: {
    transferId: string;
    amountMinor: bigint;
    currency: "USD";
    idempotencyKey: string;
  }): Promise<void> {
    const record = this.#requiredRecord(input.transferId);
    if (record.principalAmountMinor !== input.amountMinor) {
      throw new Error("Settlement amount does not match captured principal.");
    }
    const journal = this.repository.postJournal({
      source: { type: "remittance_settlement", id: input.transferId },
      description: "Settle remittance principal from Rain control funds",
      currency: input.currency,
      postings: [
        {
          accountId: DEMO_LEDGER_ACCOUNT_IDS.principalClearingUsd,
          side: "debit",
          amountMinor: input.amountMinor,
        },
        {
          accountId: DEMO_LEDGER_ACCOUNT_IDS.rainControlUsd,
          side: "credit",
          amountMinor: input.amountMinor,
        },
      ],
      metadata: { transferId: input.transferId },
      idempotencyKey: input.idempotencyKey,
    });
    record.settlementJournalId = journal.id;
  }

  async recognizeFee(input: {
    transferId: string;
    amountMinor: bigint;
    currency: "USD";
    idempotencyKey: string;
  }): Promise<void> {
    const record = this.#requiredRecord(input.transferId);
    if (record.feeAmountMinor !== input.amountMinor) {
      throw new Error("Recognized fee does not match the quote snapshot.");
    }
    if (input.amountMinor === 0n) {
      return;
    }
    const journal = this.repository.postJournal({
      source: { type: "remittance_fee_recognition", id: input.transferId },
      description: "Recognize remittance fee after successful payout",
      currency: input.currency,
      postings: [
        {
          accountId: DEMO_LEDGER_ACCOUNT_IDS.deferredFeeUsd,
          side: "debit",
          amountMinor: input.amountMinor,
        },
        {
          accountId: DEMO_LEDGER_ACCOUNT_IDS.feeRevenueUsd,
          side: "credit",
          amountMinor: input.amountMinor,
        },
      ],
      metadata: { transferId: input.transferId },
      idempotencyKey: input.idempotencyKey,
    });
    record.feeJournalId = journal.id;
  }

  async refund(input: {
    transferId: string;
    amountMinor: bigint;
    currency: "USD";
    idempotencyKey: string;
  }): Promise<void> {
    const record = this.#requiredRecord(input.transferId);
    if (
      input.amountMinor !==
      record.principalAmountMinor + record.feeAmountMinor
    ) {
      throw new Error("Refund amount does not match the original debit.");
    }

    const journals = [
      record.feeJournalId,
      record.settlementJournalId,
      record.captureJournalId,
    ].filter((journalId): journalId is string => journalId !== undefined);
    for (const [index, journalId] of journals.entries()) {
      if (!this.repository.getReversalForJournal(journalId)) {
        this.repository.reverseJournal({
          journalId,
          source: {
            type: "remittance_refund_reversal",
            id: `${input.transferId}:${journalId}`,
          },
          description: `Refund reversal for transfer ${input.transferId}`,
          idempotencyKey: `${input.idempotencyKey}:${index}`,
        });
      }
    }
  }

  #seed(): void {
    this.repository.createAccount({
      id: DEMO_LEDGER_ACCOUNT_IDS.rainControlUsd,
      name: "Rain USD control asset",
      type: "asset",
      currency: "USD",
    });
    this.repository.createAccount({
      id: DEMO_LEDGER_ACCOUNT_IDS.customerUsd,
      name: "Demo customer USD liability",
      type: "liability",
      currency: "USD",
      enforceAvailableBalance: true,
    });
    this.repository.createAccount({
      id: DEMO_LEDGER_ACCOUNT_IDS.principalClearingUsd,
      name: "Remittance principal clearing",
      type: "liability",
      currency: "USD",
    });
    this.repository.createAccount({
      id: DEMO_LEDGER_ACCOUNT_IDS.deferredFeeUsd,
      name: "Deferred remittance fee",
      type: "liability",
      currency: "USD",
    });
    this.repository.createAccount({
      id: DEMO_LEDGER_ACCOUNT_IDS.feeRevenueUsd,
      name: "Remittance fee revenue",
      type: "revenue",
      currency: "USD",
    });
    this.repository.postJournal({
      source: { type: "demo_seed", id: "opening_balance_001" },
      description: "Seed synthetic demo customer balance",
      currency: "USD",
      postings: [
        {
          accountId: DEMO_LEDGER_ACCOUNT_IDS.rainControlUsd,
          side: "debit",
          amountMinor: 425_000n,
        },
        {
          accountId: DEMO_LEDGER_ACCOUNT_IDS.customerUsd,
          side: "credit",
          amountMinor: 425_000n,
        },
      ],
      idempotencyKey: "demo-opening-balance-001",
    });
  }

  #requiredRecord(
    transferId: string,
    holdId?: string,
  ): TransferAccountingRecord {
    const record = this.#records.get(transferId);
    if (!record || (holdId !== undefined && record.holdId !== holdId)) {
      throw new Error(`Missing ledger accounting record for ${transferId}.`);
    }
    return record;
  }
}
