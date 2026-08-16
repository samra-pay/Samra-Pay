export type SamraDataMode = "mock" | "api";

export type Currency = "USD" | "ETB";

export type Money<C extends Currency = Currency> = Readonly<{
  currency: C;
  minorUnits: string;
}>;

export type CustomerSummary = Readonly<{
  id: string;
  displayName: string;
  synthetic: true;
}>;

export type AccountSummary = Readonly<{
  id: string;
  kind: "domestic";
  displayName: string;
  last4: string;
  currency: "USD";
  bookBalance: Money<"USD">;
  availableBalance: Money<"USD">;
  status: "active" | "restricted" | "closed";
}>;

export type ActivityStatus = "pending" | "completed" | "failed" | "reversed";

export type ActivityItem = Readonly<{
  id: string;
  accountId: string;
  sourceType: "opening_balance" | "remittance";
  sourceId: string;
  occurredAt: string;
  title: string;
  category: "deposit" | "remittance" | "fee" | "refund";
  direction: "credit" | "debit";
  amount: Money;
  status: ActivityStatus;
}>;

export type ActivityQuery = Readonly<{
  accountId?: string;
  cursor?: string;
  limit?: number;
}>;

export type ActivityPage = Readonly<{
  items: readonly ActivityItem[];
  nextCursor: string | null;
}>;

export type FundingMethod = "samra_balance";
export type DeliveryMethod = "bank" | "wallet";

export type Beneficiary = Readonly<{
  id: string;
  displayName: string;
  city: string;
  countryCode: "ET";
  deliveryDetails:
    | Readonly<{
        method: "bank";
        bankId: "cbe" | "awash";
        institutionName: string;
        accountNumberLast4: string;
      }>
    | Readonly<{
        method: "wallet";
        walletId: "telebirr" | "cbebirr";
        institutionName: string;
        phoneNumberLast4: string;
      }>;
  status: "active";
  createdAt: string;
  updatedAt: string;
}>;

export type RemittanceOptions = Readonly<{
  sourceCurrency: "USD";
  destinationCurrency: "ETB";
  fundingMethods: readonly FundingMethod[];
  deliveryMethods: readonly DeliveryMethod[];
}>;

export type CreateQuoteInput = Readonly<{
  sourceAccountId: string;
  beneficiaryId: string;
  sendAmount: Money<"USD">;
  fundingMethod: FundingMethod;
  deliveryMethod: DeliveryMethod;
}>;

export type RemittanceQuote = Readonly<{
  id: string;
  status: "active" | "expired" | "consumed";
  expiresAt: string;
  sourceAccountId: string;
  beneficiaryId: string;
  sendAmount: Money<"USD">;
  feeAmount: Money<"USD">;
  totalDebit: Money<"USD">;
  receiveAmount: Money<"ETB">;
  exchangeRate: string;
  fundingMethod: FundingMethod;
  deliveryMethod: DeliveryMethod;
  estimatedDelivery: string;
}>;

export type TransferStatus =
  | "created"
  | "funds_reserved"
  | "submitted"
  | "in_transit"
  | "payout_pending"
  | "completed"
  | "failed"
  | "refund_pending"
  | "refunded"
  | "cancelled";

export type TransferTimelineItem = Readonly<{
  status: TransferStatus;
  occurredAt: string;
  detail?: string;
}>;

export type Transfer = Readonly<{
  id: string;
  status: TransferStatus;
  recipientDisplay: string;
  quoteSnapshot: RemittanceQuote;
  createdAt: string;
  updatedAt: string;
  failureCode: string | null;
  timeline: readonly TransferTimelineItem[];
}>;

export type CreateTransferInput = Readonly<{
  quoteId: string;
}>;

export type TransferQuery = Readonly<{
  cursor?: string;
  limit?: number;
}>;

export type TransferPage = Readonly<{
  items: readonly Transfer[];
  nextCursor: string | null;
}>;

export interface SamraDataSource {
  getCurrentCustomer(): Promise<CustomerSummary>;
  listAccounts(): Promise<readonly AccountSummary[]>;
  listActivity(input?: ActivityQuery): Promise<ActivityPage>;
  listBeneficiaries(): Promise<readonly Beneficiary[]>;
  getRemittanceOptions(): Promise<RemittanceOptions>;
  createQuote(input: CreateQuoteInput): Promise<RemittanceQuote>;
  createTransfer(
    input: CreateTransferInput,
    idempotencyKey: string,
  ): Promise<Transfer>;
  getTransfer(id: string): Promise<Transfer>;
  listTransfers(input?: TransferQuery): Promise<TransferPage>;
  cancelTransfer(id: string, idempotencyKey: string): Promise<Transfer>;
}

/**
 * Transport is intentionally shaped like the stable application data source.
 * The generated OpenAPI client is adapted to this interface in one place, so
 * generated operation names never leak into screens.
 */
export interface SamraTransport extends SamraDataSource {}

export class ApiSamraDataSource implements SamraDataSource {
  private readonly transport: SamraTransport;

  constructor(transport: SamraTransport) {
    this.transport = transport;
  }

  getCurrentCustomer(): Promise<CustomerSummary> {
    return this.transport.getCurrentCustomer();
  }

  listAccounts(): Promise<readonly AccountSummary[]> {
    return this.transport.listAccounts();
  }

  listActivity(input?: ActivityQuery): Promise<ActivityPage> {
    return this.transport.listActivity(input);
  }

  listBeneficiaries(): Promise<readonly Beneficiary[]> {
    return this.transport.listBeneficiaries();
  }

  getRemittanceOptions(): Promise<RemittanceOptions> {
    return this.transport.getRemittanceOptions();
  }

  createQuote(input: CreateQuoteInput): Promise<RemittanceQuote> {
    return this.transport.createQuote(input);
  }

  createTransfer(
    input: CreateTransferInput,
    idempotencyKey: string,
  ): Promise<Transfer> {
    return this.transport.createTransfer(input, idempotencyKey);
  }

  getTransfer(id: string): Promise<Transfer> {
    return this.transport.getTransfer(id);
  }

  listTransfers(input?: TransferQuery): Promise<TransferPage> {
    return this.transport.listTransfers(input);
  }

  cancelTransfer(id: string, idempotencyKey: string): Promise<Transfer> {
    return this.transport.cancelTransfer(id, idempotencyKey);
  }
}

export function parseSamraDataMode(
  value: string | undefined,
  variableName: string,
): SamraDataMode {
  if (value === undefined || value === "") return "mock";
  if (value === "mock" || value === "api") return value;
  throw new Error(
    `${variableName} must be "mock" or "api"; received ${JSON.stringify(value)}`,
  );
}

/**
 * Selection is explicit. API mode without an API adapter throws rather than
 * silently returning local financial state.
 */
export function selectSamraDataSource(
  mode: SamraDataMode,
  sources: Readonly<{
    mock: SamraDataSource;
    api?: SamraDataSource;
  }>,
): SamraDataSource {
  if (mode === "mock") return sources.mock;
  if (!sources.api) {
    throw new Error(
      "Samra API data mode is enabled but no API data source is configured",
    );
  }
  return sources.api;
}

export function assertMinorUnits(value: string): string {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error("minorUnits must be a non-negative base-10 integer string");
  }
  return value;
}
