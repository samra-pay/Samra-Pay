import type {
  Money,
  RemittanceQuote,
  RemittanceTransfer,
  TransferState,
} from "@workspace/remittance";

export function serializeMoney(value: Money): {
  currency: Money["currency"];
  minorUnits: string;
} {
  return {
    currency: value.currency,
    minorUnits: value.amountMinor.toString(),
  };
}

export function serializeQuote(
  quote: RemittanceQuote,
  status: "active" | "expired" | "consumed",
) {
  return {
    id: quote.id,
    status,
    expiresAt: quote.expiresAt,
    sourceAccountId: quote.sourceAccountId,
    beneficiaryId: quote.beneficiaryId,
    sendAmount: serializeMoney(quote.sourceAmount),
    feeAmount: serializeMoney(quote.feeAmount),
    totalDebit: serializeMoney(quote.debitAmount),
    receiveAmount: serializeMoney(quote.recipientAmount),
    exchangeRate: rationalToDecimal(
      quote.rate.value.numerator,
      quote.rate.value.denominator,
    ),
    fundingMethod: quote.fundingMethod,
    deliveryMethod: quote.deliveryMethod,
    estimatedDelivery: quote.estimatedDelivery,
  };
}

export function serializeTransfer(
  transfer: RemittanceTransfer,
  recipientDisplay: string,
) {
  return {
    id: transfer.id,
    status: publicTransferStatus(transfer.state),
    recipientDisplay,
    quoteSnapshot: serializeQuote(transfer.quote, "consumed"),
    createdAt: transfer.createdAt,
    updatedAt: transfer.updatedAt,
    failureCode: failureCode(transfer),
    timeline: transfer.statusHistory.map((item) => ({
      status: publicTransferStatus(item.to),
      occurredAt: item.occurredAt,
      detail: item.reason,
    })),
  };
}

export function publicTransferStatus(state: TransferState) {
  switch (state) {
    case "CREATED":
      return "created" as const;
    case "FUNDS_RESERVED":
      return "funds_reserved" as const;
    case "SUBMITTED":
      return "submitted" as const;
    case "IN_TRANSIT":
      return "in_transit" as const;
    case "PAYOUT_PENDING":
      return "payout_pending" as const;
    case "COMPLETED":
      return "completed" as const;
    case "FAILED":
      return "failed" as const;
    case "CANCELLED":
      return "cancelled" as const;
    case "REFUND_PENDING":
    case "REVERSAL_PENDING":
      return "refund_pending" as const;
    case "REFUNDED":
    case "REVERSED":
      return "refunded" as const;
  }
}

function failureCode(transfer: RemittanceTransfer): string | null {
  const lastFailure = [...transfer.statusHistory]
    .reverse()
    .find(
      (item) =>
        item.reason === "CALIZA_REJECTED" || item.reason === "CHAPA_FAILED",
    );
  return lastFailure?.reason ?? null;
}

function rationalToDecimal(numerator: bigint, denominator: bigint): string {
  const whole = numerator / denominator;
  let remainder = numerator % denominator;
  if (remainder === 0n) {
    return whole.toString();
  }

  let fraction = "";
  const seen = new Set<bigint>();
  while (remainder !== 0n && fraction.length < 18) {
    if (seen.has(remainder)) {
      throw new Error("Exchange rate does not have a finite decimal form.");
    }
    seen.add(remainder);
    remainder *= 10n;
    fraction += (remainder / denominator).toString();
    remainder %= denominator;
  }
  if (remainder !== 0n) {
    throw new Error("Exchange rate exceeds the supported decimal precision.");
  }
  return `${whole.toString()}.${fraction}`;
}
