import { pgSchema } from "drizzle-orm/pg-core";

export const samraCore = pgSchema("samra_core");

export const currencyCodeEnum = samraCore.enum("currency_code", ["USD", "ETB"]);

export const customerStateEnum = samraCore.enum("customer_state", [
  "active",
  "suspended",
  "closed",
]);

export const recordStateEnum = samraCore.enum("record_state", [
  "active",
  "disabled",
  "closed",
]);

export const productAccountKindEnum = samraCore.enum("product_account_kind", [
  "domestic_cash",
  "remittance",
]);

export const beneficiaryRailEnum = samraCore.enum("beneficiary_rail", [
  "bank_account",
  "mobile_wallet",
]);

export const ledgerAccountClassEnum = samraCore.enum("ledger_account_class", [
  "asset",
  "liability",
  "equity",
  "revenue",
  "expense",
]);

export const ledgerEntrySideEnum = samraCore.enum("ledger_entry_side", [
  "debit",
  "credit",
]);

export const ledgerJournalStateEnum = samraCore.enum("ledger_journal_state", [
  "draft",
  "posted",
  "reversed",
]);

export const ledgerHoldStateEnum = samraCore.enum("ledger_hold_state", [
  "active",
  "captured",
  "released",
  "expired",
]);

export const ledgerHoldEventTypeEnum = samraCore.enum(
  "ledger_hold_event_type",
  ["created", "captured", "released", "expired"],
);

export const idempotencyStateEnum = samraCore.enum("idempotency_state", [
  "in_progress",
  "succeeded",
  "failed",
]);

export const providerNameEnum = samraCore.enum("provider_name", [
  "rain",
  "caliza",
  "chapa",
]);

export const providerEventStateEnum = samraCore.enum("provider_event_state", [
  "received",
  "deferred",
  "processed",
  "ignored",
  "failed",
]);

export const outboxEventStateEnum = samraCore.enum("outbox_event_state", [
  "pending",
  "processing",
  "published",
  "failed",
]);

export const workflowWorkStateEnum = samraCore.enum("workflow_work_state", [
  "pending",
  "processing",
  "retry",
  "completed",
  "failed",
]);

export const remittanceQuoteStateEnum = samraCore.enum(
  "remittance_quote_state",
  ["active", "accepted", "expired", "cancelled"],
);

export const remittanceTransferStateEnum = samraCore.enum(
  "remittance_transfer_state",
  [
    "created",
    "funds_reserved",
    "submitted",
    "in_transit",
    "payout_pending",
    "completed",
    "failed",
    "cancelled",
    "refund_pending",
    "refunded",
    "reversal_pending",
    "reversed",
  ],
);

export const remittanceFundingStateEnum = samraCore.enum(
  "remittance_funding_state",
  [
    "unreserved",
    "reserved",
    "captured",
    "released",
    "refund_pending",
    "refunded",
  ],
);

export const remittancePayoutStateEnum = samraCore.enum(
  "remittance_payout_state",
  ["not_submitted", "submitted", "processing", "paid", "failed", "reversed"],
);

export const transferReconciliationStateEnum = samraCore.enum(
  "transfer_reconciliation_state",
  ["not_started", "pending", "matched", "exception", "resolved"],
);

export const providerReportStateEnum = samraCore.enum("provider_report_state", [
  "received",
  "parsed",
  "failed",
]);

export const reconciliationRunStateEnum = samraCore.enum(
  "reconciliation_run_state",
  ["pending", "running", "completed", "failed"],
);

export const reconciliationResultEnum = samraCore.enum(
  "reconciliation_result",
  [
    "matched",
    "missing_internal",
    "missing_provider",
    "amount_mismatch",
    "status_mismatch",
    "currency_mismatch",
  ],
);

export const reconciliationExceptionStateEnum = samraCore.enum(
  "reconciliation_exception_state",
  ["open", "in_review", "resolved", "ignored"],
);

export const auditActorTypeEnum = samraCore.enum("audit_actor_type", [
  "system",
  "customer",
  "operator",
  "provider",
]);
