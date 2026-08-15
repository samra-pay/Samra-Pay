import type { Money, Rational } from "./money";

export type RemittanceQuote = Readonly<{
  id: string;
  actorId: string;
  sourceAccountId: string;
  beneficiaryId: string;
  sourceAmount: Money;
  feeAmount: Money;
  debitAmount: Money;
  recipientAmount: Money;
  rate: Readonly<{
    sourceCurrency: "USD";
    destinationCurrency: "ETB";
    value: Rational;
  }>;
  fundingMethod: "samra_balance";
  deliveryMethod: "bank" | "wallet";
  estimatedDelivery: string;
  createdAt: string;
  expiresAt: string;
}>;

export type TransferState =
  | "CREATED"
  | "FUNDS_RESERVED"
  | "SUBMITTED"
  | "IN_TRANSIT"
  | "PAYOUT_PENDING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "REFUND_PENDING"
  | "REFUNDED"
  | "REVERSAL_PENDING"
  | "REVERSED";

export type FundingState =
  | "UNRESERVED"
  | "RESERVED"
  | "CAPTURED"
  | "RELEASED"
  | "REFUND_PENDING"
  | "REFUNDED";

export type PayoutState =
  "NOT_SUBMITTED" | "SUBMITTED" | "PROCESSING" | "PAID" | "FAILED" | "REVERSED";

export type ReconciliationState =
  "NOT_STARTED" | "PENDING" | "MATCHED" | "EXCEPTION" | "RESOLVED";

export type ProviderName = "RAIN" | "CALIZA" | "CHAPA";

export type ProviderResourceLink = Readonly<{
  provider: ProviderName;
  resourceType: "FUNDING_AUTHORIZATION" | "TRANSFER" | "PAYOUT" | "REFUND";
  providerResourceId: string;
  createdAt: string;
}>;

export type TransferStatusChange = Readonly<{
  sequence: number;
  from: TransferState | null;
  to: TransferState;
  reason: string;
  occurredAt: string;
}>;

export type RemittanceTransfer = Readonly<{
  id: string;
  actorId: string;
  idempotencyKey: string;
  quote: RemittanceQuote;
  state: TransferState;
  fundingState: FundingState;
  payoutState: PayoutState;
  reconciliationState: ReconciliationState;
  providerLinks: readonly ProviderResourceLink[];
  statusHistory: readonly TransferStatusChange[];
  version: number;
  createdAt: string;
  updatedAt: string;
}>;

export type Actor = Readonly<{
  id: string;
  displayName: string;
  kind: "SEEDED_DEMO";
}>;

export interface ActorResolver<TContext = unknown> {
  resolve(context: TContext): Promise<Actor>;
}

export type AccountSummary = Readonly<{
  id: string;
  actorId: string;
  label: string;
  currency: "USD";
  ledgerBalance: Money;
  availableBalance: Money;
  kind: "DEMO_DOMESTIC_ACCOUNT";
}>;

export type ActivityItem = Readonly<{
  id: string;
  actorId: string;
  kind: "TRANSFER" | "SEEDED_DEPOSIT";
  state: string;
  amount: Money;
  occurredAt: string;
  transferId?: string;
}>;
