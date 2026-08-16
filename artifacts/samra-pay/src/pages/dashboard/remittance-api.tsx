import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  Check,
  CircleCheck,
  CircleX,
  History,
  Landmark,
  LoaderCircle,
  MapPin,
  RefreshCw,
  RotateCcw,
  Smartphone,
  Wallet,
  XCircle,
} from "lucide-react";
import type {
  RemittanceQuote,
  Transfer,
  TransferStatus,
} from "@workspace/samra-client";
import {
  useAccounts,
  useActivity,
  useBeneficiaries,
  useCancelTransfer,
  useCreateQuote,
  useCreateTransfer,
  useRemittanceOptions,
  useTransfer,
  useTransfers,
} from "@workspace/samra-client/react";
import { Button } from "@workspace/samra-pay-ds/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/samra-pay-ds/components/ui/card";
import { cn } from "@workspace/samra-pay-ds/lib/utils";

import { PageTransition } from "@/components/page-transition";
import {
  clearActiveRemittanceFlow,
  formatExchangeRate,
  formatMinorUnits,
  getOrCreateCancelIdempotencyKey,
  getOrCreateTransferIdempotencyKey,
  isTerminalTransferStatus,
  persistActiveQuote,
  persistTransferForQuote,
  readActiveQuote,
  readActiveTransferId,
  readTransferForQuote,
  sanitizeUsdInput,
  toSyntheticBeneficiary,
  usdInputToMinorUnits,
} from "@/lib/samra-api-flow";

type Screen = "details" | "review" | "status";

const CANCELLABLE_STATUSES = new Set<TransferStatus>([
  "created",
  "funds_reserved",
  "submitted",
]);

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "The request could not be completed.";
}

function ErrorNotice({
  error,
  onRetry,
  retrying = false,
}: {
  error: unknown;
  onRetry: () => void;
  retrying?: boolean;
}) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-destructive/30 bg-destructive/10 p-4"
    >
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-foreground">
            Could not reach Samra Pay
          </p>
          <p className="mt-1 break-words text-sm text-muted-foreground">
            {errorMessage(error)}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3 border-destructive/30"
            disabled={retrying}
            onClick={onRetry}
          >
            <RefreshCw
              className={cn("mr-2 h-4 w-4", retrying && "animate-spin")}
            />
            Retry
          </Button>
        </div>
      </div>
    </div>
  );
}

function LoadingCard({ label }: { label: string }) {
  return (
    <Card className="border-primary/20 bg-card/50 shadow-xl">
      <CardContent className="flex min-h-72 items-center justify-center">
        <div className="text-center">
          <LoaderCircle className="mx-auto h-7 w-7 animate-spin text-primary" />
          <p className="mt-3 text-sm text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function MoneyValue({
  currency,
  minorUnits,
}: {
  currency: "USD" | "ETB";
  minorUnits: string;
}) {
  return (
    <span className="font-mono">
      {currency === "USD" ? "$" : ""}
      {formatMinorUnits(minorUnits)} {currency}
    </span>
  );
}

function statusPresentation(status: TransferStatus): {
  title: string;
  body: string;
  tone: "success" | "danger" | "warning" | "neutral";
} {
  switch (status) {
    case "completed":
      return {
        title: "Transfer completed",
        body: "The synthetic payout reached its terminal completed state.",
        tone: "success",
      };
    case "failed":
      return {
        title: "Transfer failed",
        body: "The provider flow ended in a failure state. No completion is being shown.",
        tone: "danger",
      };
    case "refund_pending":
      return {
        title: "Refund in progress",
        body: "The transfer did not complete. The ledger is waiting for the refund flow to finish.",
        tone: "warning",
      };
    case "refunded":
      return {
        title: "Transfer refunded",
        body: "The backend reports that the synthetic debit has been refunded.",
        tone: "warning",
      };
    case "cancelled":
      return {
        title: "Transfer cancelled",
        body: "The backend accepted the cancellation before the transfer crossed its boundary.",
        tone: "neutral",
      };
    case "created":
    case "funds_reserved":
    case "submitted":
    case "in_transit":
    case "payout_pending":
      return {
        title: "Transfer processing",
        body: "The backend is advancing the synthetic provider flow. This page will update automatically.",
        tone: "neutral",
      };
    default:
      return {
        title: "Transfer state unavailable",
        body: "The backend returned a transfer state this client does not recognize.",
        tone: "neutral",
      };
  }
}

function StatusIcon({
  status,
  tone,
}: {
  status: TransferStatus;
  tone: ReturnType<typeof statusPresentation>["tone"];
}) {
  const className = cn(
    "h-10 w-10",
    tone === "success" && "text-eucalyptus",
    tone === "danger" && "text-destructive",
    tone === "warning" && "text-primary",
    tone === "neutral" && "text-muted-foreground",
  );

  if (status === "completed") return <CircleCheck className={className} />;
  if (status === "failed") return <CircleX className={className} />;
  if (status === "refunded" || status === "refund_pending") {
    return (
      <RotateCcw
        className={cn(className, status === "refund_pending" && "animate-spin")}
      />
    );
  }
  if (status === "cancelled") return <XCircle className={className} />;
  return <LoaderCircle className={cn(className, "animate-spin")} />;
}

function TransferStatusCard({
  transfer,
  cancelling,
  cancelError,
  refreshError,
  onCancel,
  onRetryCancel,
  onRetryRefresh,
  onStartAnother,
}: {
  transfer: Transfer;
  cancelling: boolean;
  cancelError: unknown;
  refreshError: unknown;
  onCancel: () => void;
  onRetryCancel: () => void;
  onRetryRefresh: () => void;
  onStartAnother: () => void;
}) {
  const presentation = statusPresentation(transfer.status);
  const terminal = isTerminalTransferStatus(transfer.status);
  const canCancel = CANCELLABLE_STATUSES.has(transfer.status);

  return (
    <Card className="relative overflow-hidden border-primary/20 bg-card/50 shadow-xl">
      <div className="absolute right-0 top-0 h-64 w-64 rounded-full bg-primary/5 blur-[100px]" />
      <CardContent className="relative space-y-6 pb-8 pt-8">
        <div className="flex flex-col items-center text-center">
          <div
            className={cn(
              "flex h-20 w-20 items-center justify-center rounded-full border",
              presentation.tone === "success" &&
                "border-eucalyptus/30 bg-eucalyptus/10",
              presentation.tone === "danger" &&
                "border-destructive/30 bg-destructive/10",
              presentation.tone === "warning" &&
                "border-primary/30 bg-primary/10",
              presentation.tone === "neutral" && "border-white/10 bg-white/5",
            )}
          >
            <StatusIcon status={transfer.status} tone={presentation.tone} />
          </div>
          <h2 className="mt-5 text-2xl font-serif">{presentation.title}</h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            {presentation.body}
          </p>
          <span className="mt-3 rounded-full border border-white/10 bg-background/50 px-3 py-1 font-mono text-xs uppercase tracking-wider text-muted-foreground">
            {transfer.status.replaceAll("_", " ")}
          </span>
        </div>

        <div className="rounded-2xl border border-white/5 bg-background/50 p-5 text-sm">
          <div className="flex justify-between gap-4 border-b border-white/5 pb-3">
            <span className="text-muted-foreground">Recipient</span>
            <span className="text-right font-medium">
              {transfer.recipientDisplay}
            </span>
          </div>
          <div className="flex justify-between gap-4 border-b border-white/5 py-3">
            <span className="text-muted-foreground">You sent</span>
            <MoneyValue {...transfer.quoteSnapshot.sendAmount} />
          </div>
          <div className="flex justify-between gap-4 border-b border-white/5 py-3">
            <span className="text-muted-foreground">Recipient gets</span>
            <span className="text-primary">
              <MoneyValue {...transfer.quoteSnapshot.receiveAmount} />
            </span>
          </div>
          <div className="flex justify-between gap-4 pt-3">
            <span className="text-muted-foreground">Transfer ID</span>
            <span
              className="max-w-[60%] truncate font-mono text-xs"
              title={transfer.id}
            >
              {transfer.id}
            </span>
          </div>
          {transfer.failureCode ? (
            <div className="mt-3 flex justify-between gap-4 border-t border-white/5 pt-3">
              <span className="text-muted-foreground">Failure code</span>
              <span className="font-mono text-xs text-destructive">
                {transfer.failureCode}
              </span>
            </div>
          ) : null}
        </div>

        <div>
          <p className="mb-3 text-xs uppercase tracking-widest text-muted-foreground">
            Backend timeline
          </p>
          <ol className="space-y-3">
            {transfer.timeline.map((item, index) => (
              <li
                key={`${item.status}-${item.occurredAt}-${index}`}
                className="flex gap-3 text-sm"
              >
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium capitalize">
                      {item.status.replaceAll("_", " ")}
                    </span>
                    <time className="text-xs text-muted-foreground">
                      {new Date(item.occurredAt).toLocaleString()}
                    </time>
                  </div>
                  {item.detail ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {item.detail}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </div>

        {cancelError ? (
          <ErrorNotice
            error={cancelError}
            onRetry={onRetryCancel}
            retrying={cancelling}
          />
        ) : null}

        {refreshError ? (
          <ErrorNotice error={refreshError} onRetry={onRetryRefresh} />
        ) : null}

        {canCancel ? (
          <Button
            type="button"
            variant="outline"
            className="w-full rounded-xl border-destructive/30 text-destructive"
            disabled={cancelling}
            onClick={onCancel}
          >
            {cancelling ? (
              <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Cancel transfer
          </Button>
        ) : null}

        {terminal ? (
          <Button
            type="button"
            variant="outline"
            className="w-full rounded-xl border-white/10"
            onClick={onStartAnother}
          >
            Send another transfer
          </Button>
        ) : null}

        <p className="text-center text-xs text-muted-foreground">
          Synthetic demo only. No real funds were moved.
        </p>
      </CardContent>
    </Card>
  );
}

function RecentTransfers({
  transfers,
  loading,
  error,
  onRetry,
}: {
  transfers: readonly Transfer[];
  loading: boolean;
  error: unknown;
  onRetry: () => void;
}) {
  return (
    <Card className="border-white/5 bg-card/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5 text-muted-foreground" />
          Recent Transfers
        </CardTitle>
      </CardHeader>
      <CardContent>
        {error ? <ErrorNotice error={error} onRetry={onRetry} /> : null}
        {!error && loading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <LoaderCircle className="h-4 w-4 animate-spin" /> Loading backend
            history…
          </div>
        ) : null}
        {!error && !loading && transfers.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">
            No backend transfers yet.
          </p>
        ) : null}
        <div className="space-y-3">
          {transfers.map((transfer) => (
            <div
              key={transfer.id}
              className="rounded-xl border border-white/5 bg-background/50 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {transfer.recipientDisplay}
                  </p>
                  <p className="mt-1 text-xs capitalize text-muted-foreground">
                    {transfer.status.replaceAll("_", " ")}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-mono text-primary">
                    {formatMinorUnits(
                      transfer.quoteSnapshot.receiveAmount.minorUnits,
                    )}{" "}
                    ETB
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Sent $
                    {formatMinorUnits(
                      transfer.quoteSnapshot.sendAmount.minorUnits,
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function ApiDashboardRemittance() {
  const restoredQuote = useMemo(() => readActiveQuote(), []);
  const restoredTransferId = useMemo(() => readActiveTransferId(), []);
  const [screen, setScreen] = useState<Screen>(() =>
    restoredTransferId ? "status" : restoredQuote ? "review" : "details",
  );
  const [quote, setQuote] = useState<RemittanceQuote | null>(restoredQuote);
  const [transferId, setTransferId] = useState(restoredTransferId);
  const [usdAmount, setUsdAmount] = useState("100.00");
  const [deliveryMethod, setDeliveryMethod] = useState<"bank" | "wallet">(
    restoredQuote?.deliveryMethod ?? "bank",
  );
  const [beneficiaryId, setBeneficiaryId] = useState(
    restoredQuote?.beneficiaryId ?? "",
  );

  const accountsQuery = useAccounts();
  const beneficiariesQuery = useBeneficiaries();
  const optionsQuery = useRemittanceOptions();
  const beneficiaries = useMemo(
    () => (beneficiariesQuery.data ?? []).map(toSyntheticBeneficiary),
    [beneficiariesQuery.data],
  );
  const account = accountsQuery.data?.find(
    (item) =>
      item.kind === "domestic" &&
      item.currency === "USD" &&
      item.status === "active",
  );
  const activityQuery = useActivity(
    account ? { accountId: account.id, limit: 5 } : { limit: 5 },
  );
  const transfersQuery = useTransfers({ limit: 5 });
  const transferQuery = useTransfer(transferId);
  const quoteMutation = useCreateQuote();
  const transferMutation = useCreateTransfer();
  const cancelMutation = useCancelTransfer();

  const confirmStarted = useRef(Boolean(restoredTransferId));
  const transferIdempotency = useRef<{
    quoteId: string;
    key: string;
  } | null>(null);
  const cancelIdempotency = useRef<{
    transferId: string;
    key: string;
  } | null>(null);
  const refreshedTerminal = useRef<string | null>(null);
  const amountMinorUnits = usdInputToMinorUnits(usdAmount);
  const beneficiary = beneficiaries.find((item) => item.id === beneficiaryId);
  const transfer = transferQuery.data ?? transferMutation.data ?? null;
  const availableBalance = account?.availableBalance.minorUnits;
  const exceedsBalance =
    amountMinorUnits !== null &&
    availableBalance !== undefined &&
    BigInt(amountMinorUnits) > BigInt(availableBalance);
  const deliverySupported = Boolean(
    optionsQuery.data?.deliveryMethods.includes(deliveryMethod),
  );
  const fundingSupported = Boolean(
    optionsQuery.data?.fundingMethods.includes("samra_balance"),
  );

  const terminalStatus = transfer?.status;
  useEffect(() => {
    if (beneficiary) return;
    const matching = beneficiaries.find(
      (item) => item.deliveryMethod === deliveryMethod,
    );
    if (matching) setBeneficiaryId(matching.id);
  }, [beneficiary, beneficiaries, deliveryMethod]);

  useEffect(() => {
    if (!transfer || !isTerminalTransferStatus(transfer.status)) return;
    const transitionKey = `${transfer.id}:${transfer.status}`;
    if (refreshedTerminal.current === transitionKey) return;
    refreshedTerminal.current = transitionKey;
    void Promise.all([
      accountsQuery.refetch(),
      activityQuery.refetch(),
      transfersQuery.refetch(),
    ]);
  }, [terminalStatus, transfer?.id]);

  function chooseDelivery(method: "bank" | "wallet") {
    setDeliveryMethod(method);
    const matching = beneficiaries.find(
      (item) => item.deliveryMethod === method,
    );
    if (matching) setBeneficiaryId(matching.id);
  }

  async function requestQuote() {
    if (
      !account ||
      !beneficiary ||
      !amountMinorUnits ||
      exceedsBalance ||
      !deliverySupported ||
      !fundingSupported
    ) {
      return;
    }
    try {
      const serverQuote = await quoteMutation.mutateAsync({
        sourceAccountId: account.id,
        beneficiaryId: beneficiary.id,
        sendAmount: { currency: "USD", minorUnits: amountMinorUnits },
        fundingMethod: "samra_balance",
        deliveryMethod,
      });
      if (quote && quote.id !== serverQuote.id) {
        clearActiveRemittanceFlow(quote.id);
      }
      setQuote(serverQuote);
      persistActiveQuote(serverQuote);
      confirmStarted.current = false;
      setScreen("review");
    } catch {
      // The mutation exposes the typed error for the explicit retry panel.
    }
  }

  async function confirmTransfer() {
    if (!quote) return;

    const existingTransferId = readTransferForQuote(quote.id);
    if (existingTransferId) {
      setTransferId(existingTransferId);
      setScreen("status");
      return;
    }
    if (confirmStarted.current) return;
    confirmStarted.current = true;

    try {
      const idempotencyKey =
        transferIdempotency.current?.quoteId === quote.id
          ? transferIdempotency.current.key
          : getOrCreateTransferIdempotencyKey(quote.id);
      transferIdempotency.current = { quoteId: quote.id, key: idempotencyKey };
      const created = await transferMutation.mutateAsync({
        input: { quoteId: quote.id },
        idempotencyKey,
      });
      persistTransferForQuote(quote.id, created.id);
      setTransferId(created.id);
      setScreen("status");
    } catch {
      confirmStarted.current = false;
    }
  }

  async function cancelTransfer() {
    if (!transfer) return;
    try {
      const idempotencyKey =
        cancelIdempotency.current?.transferId === transfer.id
          ? cancelIdempotency.current.key
          : getOrCreateCancelIdempotencyKey(transfer.id);
      cancelIdempotency.current = {
        transferId: transfer.id,
        key: idempotencyKey,
      };
      await cancelMutation.mutateAsync({
        transferId: transfer.id,
        idempotencyKey,
      });
    } catch {
      // The mutation exposes the error and retries with the same key.
    }
  }

  function startAnotherTransfer() {
    clearActiveRemittanceFlow(quote?.id ?? transfer?.quoteSnapshot.id);
    setScreen("details");
    setQuote(null);
    setTransferId("");
    setUsdAmount("100.00");
    setDeliveryMethod("bank");
    setBeneficiaryId("");
    confirmStarted.current = false;
    transferIdempotency.current = null;
    cancelIdempotency.current = null;
    refreshedTerminal.current = null;
    quoteMutation.reset();
    transferMutation.reset();
    cancelMutation.reset();
  }

  const initialLoadFailed =
    accountsQuery.error ?? beneficiariesQuery.error ?? optionsQuery.error;
  const initialLoading =
    accountsQuery.isLoading ||
    beneficiariesQuery.isLoading ||
    optionsQuery.isLoading;
  const noAccount = !initialLoading && !initialLoadFailed && !account;

  let mainCard;
  if (screen === "status") {
    if (transferQuery.error && !transfer) {
      mainCard = (
        <Card className="border-primary/20 bg-card/50 shadow-xl">
          <CardContent className="space-y-4 pt-6">
            <ErrorNotice
              error={transferQuery.error}
              onRetry={() => void transferQuery.refetch()}
              retrying={transferQuery.isFetching}
            />
            <Button
              type="button"
              variant="outline"
              className="w-full rounded-xl border-white/10"
              onClick={startAnotherTransfer}
            >
              Start a new transfer
            </Button>
          </CardContent>
        </Card>
      );
    } else if (!transfer) {
      mainCard = (
        <LoadingCard label="Loading transfer state from the backend…" />
      );
    } else {
      mainCard = (
        <TransferStatusCard
          transfer={transfer}
          cancelling={cancelMutation.isPending}
          cancelError={cancelMutation.error}
          refreshError={transferQuery.error}
          onCancel={() => void cancelTransfer()}
          onRetryCancel={() => void cancelTransfer()}
          onRetryRefresh={() => void transferQuery.refetch()}
          onStartAnother={startAnotherTransfer}
        />
      );
    }
  } else if (screen === "review" && quote) {
    const selectedBeneficiary = beneficiaries.find(
      (item) => item.id === quote.beneficiaryId,
    );
    const quoteUnavailable =
      quote.status !== "active" || Date.parse(quote.expiresAt) <= Date.now();
    mainCard = (
      <Card className="relative overflow-hidden border-primary/20 bg-card/50 shadow-xl">
        <div className="absolute right-0 top-0 h-64 w-64 rounded-full bg-primary/5 blur-[100px]" />
        <CardHeader className="relative">
          <button
            type="button"
            onClick={() => setScreen("details")}
            className="-ml-1 mb-1 flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <CardTitle>Review &amp; confirm</CardTitle>
          <p className="text-sm text-muted-foreground">
            Financial values below are the server quote. The browser does not
            recalculate them.
          </p>
        </CardHeader>
        <CardContent className="relative space-y-5">
          <div className="rounded-2xl border border-white/5 bg-background/50 px-5 text-sm">
            <div className="flex justify-between gap-4 border-b border-white/5 py-4">
              <span className="text-muted-foreground">You send</span>
              <MoneyValue {...quote.sendAmount} />
            </div>
            <div className="flex justify-between gap-4 border-b border-white/5 py-4">
              <span className="text-muted-foreground">Service fee</span>
              <MoneyValue {...quote.feeAmount} />
            </div>
            <div className="flex justify-between gap-4 border-b border-white/5 py-4 font-semibold">
              <span>Total debit</span>
              <MoneyValue {...quote.totalDebit} />
            </div>
            <div className="flex justify-between gap-4 border-b border-white/5 py-4">
              <span className="text-muted-foreground">Recipient gets</span>
              <span className="text-primary">
                <MoneyValue {...quote.receiveAmount} />
              </span>
            </div>
            <div className="flex justify-between gap-4 border-b border-white/5 py-4">
              <span className="text-muted-foreground">Exchange rate</span>
              <span className="font-mono">
                1 USD = {formatExchangeRate(quote.exchangeRate)} ETB
              </span>
            </div>
            <div className="flex justify-between gap-4 py-4">
              <span className="text-muted-foreground">Estimated delivery</span>
              <span className="text-right">{quote.estimatedDelivery}</span>
            </div>
          </div>

          <div className="rounded-xl border border-white/5 bg-background/30 p-4 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">
                Synthetic beneficiary
              </span>
              <span className="text-right font-medium">
                {selectedBeneficiary?.name ?? quote.beneficiaryId}
              </span>
            </div>
            <div className="mt-2 flex justify-between gap-4">
              <span className="text-muted-foreground">Delivery</span>
              <span className="text-right capitalize">
                {selectedBeneficiary?.deliveryLabel ?? quote.deliveryMethod}
              </span>
            </div>
            <div className="mt-2 flex justify-between gap-4">
              <span className="text-muted-foreground">Quote expires</span>
              <time className="text-right">
                {new Date(quote.expiresAt).toLocaleTimeString()}
              </time>
            </div>
          </div>

          {transferMutation.error ? (
            <ErrorNotice
              error={transferMutation.error}
              onRetry={() => void confirmTransfer()}
              retrying={transferMutation.isPending}
            />
          ) : null}

          {quoteUnavailable ? (
            <div
              role="alert"
              className="rounded-xl border border-primary/30 bg-primary/10 p-4"
            >
              <p className="font-medium">This quote is no longer active.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Request a new server quote before creating a transfer.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3 border-primary/30"
                onClick={startAnotherTransfer}
              >
                Request new quote
              </Button>
            </div>
          ) : null}

          <Button
            type="button"
            variant="gold"
            size="lg"
            className="h-14 w-full rounded-xl text-lg"
            disabled={transferMutation.isPending || quoteUnavailable}
            onClick={() => void confirmTransfer()}
          >
            {transferMutation.isPending ? (
              <LoaderCircle className="mr-2 h-5 w-5 animate-spin" />
            ) : null}
            Confirm &amp; send ${formatMinorUnits(quote.totalDebit.minorUnits)}
          </Button>
        </CardContent>
      </Card>
    );
  } else if (initialLoading) {
    mainCard = <LoadingCard label="Loading accounts and remittance options…" />;
  } else if (initialLoadFailed) {
    mainCard = (
      <Card className="border-primary/20 bg-card/50 shadow-xl">
        <CardContent className="pt-6">
          <ErrorNotice
            error={initialLoadFailed}
            onRetry={() => {
              void accountsQuery.refetch();
              void beneficiariesQuery.refetch();
              void optionsQuery.refetch();
            }}
            retrying={
              accountsQuery.isFetching ||
              beneficiariesQuery.isFetching ||
              optionsQuery.isFetching
            }
          />
        </CardContent>
      </Card>
    );
  } else if (noAccount) {
    mainCard = (
      <Card className="border-primary/20 bg-card/50 shadow-xl">
        <CardContent className="pt-6">
          <ErrorNotice
            error={new Error("No active synthetic USD account is available.")}
            onRetry={() => void accountsQuery.refetch()}
            retrying={accountsQuery.isFetching}
          />
        </CardContent>
      </Card>
    );
  } else {
    mainCard = (
      <Card className="relative overflow-hidden border-primary/20 bg-card/50 shadow-xl">
        <div className="absolute right-0 top-0 h-64 w-64 rounded-full bg-primary/5 blur-[100px]" />
        <CardHeader className="relative">
          <CardTitle>Send Money</CardTitle>
          <p className="text-sm text-muted-foreground">
            The next step requests a quote from the Samra backend.
          </p>
        </CardHeader>
        <CardContent className="relative space-y-6">
          <div className="rounded-2xl border border-white/5 bg-background p-4">
            <label
              htmlFor="api-usd-amount"
              className="mb-2 block text-sm text-muted-foreground"
            >
              You send
            </label>
            <div className="flex items-center">
              <span className="mr-2 text-2xl text-muted-foreground">$</span>
              <input
                id="api-usd-amount"
                type="text"
                inputMode="decimal"
                value={usdAmount}
                onChange={(event) =>
                  setUsdAmount(sanitizeUsdInput(event.target.value))
                }
                className="w-full bg-transparent font-mono text-4xl text-foreground outline-none placeholder:text-muted"
                placeholder="0.00"
              />
              <div className="rounded-lg border border-white/5 bg-secondary/50 px-3 py-1.5 font-medium">
                USD
              </div>
            </div>
            <div className="mt-2 text-right text-xs text-muted-foreground">
              Ledger available: $
              {formatMinorUnits(account!.availableBalance.minorUnits)}
            </div>
          </div>

          <div className="flex justify-center -my-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-primary/30 bg-primary/20 text-primary">
              <ArrowDown className="h-5 w-5" />
            </div>
          </div>

          <div>
            <span className="mb-3 block text-xs uppercase tracking-widest text-muted-foreground">
              Send to
            </span>
            <div className="grid grid-cols-2 gap-3">
              {optionsQuery.data?.deliveryMethods.map((method) => {
                const selected = deliveryMethod === method;
                const Icon = method === "bank" ? Landmark : Smartphone;
                return (
                  <button
                    key={method}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => chooseDelivery(method)}
                    className={cn(
                      "relative flex min-h-24 flex-col items-start gap-2 rounded-xl border p-4 text-left transition-all",
                      selected
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-white/5 bg-background/50 text-muted-foreground hover:border-white/15",
                    )}
                  >
                    {selected ? (
                      <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check className="h-3 w-3" />
                      </span>
                    ) : null}
                    <Icon className="h-5 w-5" />
                    <span className="text-sm font-medium capitalize">
                      {method}
                    </span>
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {method === "bank"
                        ? "Direct to bank"
                        : "Mobile money wallet"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label
              htmlFor="api-beneficiary"
              className="mb-3 block text-xs uppercase tracking-widest text-muted-foreground"
            >
              Synthetic beneficiary
            </label>
            <select
              id="api-beneficiary"
              value={beneficiaryId}
              onChange={(event) => setBeneficiaryId(event.target.value)}
              className="w-full rounded-xl border border-white/10 bg-background px-4 py-3 text-foreground outline-none focus:border-primary/50"
            >
              {beneficiaries
                .filter((item) => item.deliveryMethod === deliveryMethod)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} — {item.location}
                  </option>
                ))}
            </select>
            {beneficiary ? (
              <div className="mt-3 flex items-start gap-3 rounded-xl border border-white/5 bg-background/40 p-4 text-sm">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div>
                  <p className="font-medium">{beneficiary.deliveryLabel}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {beneficiary.deliveryDetail}
                  </p>
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-eucalyptus/20 bg-eucalyptus/5 p-4">
            <Wallet className="h-5 w-5 text-eucalyptus" />
            <div>
              <p className="text-sm font-medium">Samra balance</p>
              <p className="text-xs text-muted-foreground">
                Backend-supported funding method
              </p>
            </div>
          </div>

          {exceedsBalance ? (
            <p role="alert" className="text-sm text-destructive">
              This amount exceeds the ledger-derived available balance.
            </p>
          ) : null}
          {!amountMinorUnits && usdAmount !== "" ? (
            <p role="alert" className="text-sm text-destructive">
              Enter an amount greater than $0.00 with no more than two decimal
              places.
            </p>
          ) : null}
          {!deliverySupported ? (
            <p role="alert" className="text-sm text-destructive">
              This delivery method is not enabled by the backend.
            </p>
          ) : null}
          {!fundingSupported ? (
            <p role="alert" className="text-sm text-destructive">
              Samra balance funding is not enabled by the backend.
            </p>
          ) : null}

          {quoteMutation.error ? (
            <ErrorNotice
              error={quoteMutation.error}
              onRetry={() => void requestQuote()}
              retrying={quoteMutation.isPending}
            />
          ) : null}

          <Button
            type="button"
            variant="gold"
            size="lg"
            className="h-14 w-full rounded-xl text-lg"
            disabled={
              !amountMinorUnits ||
              !beneficiary ||
              exceedsBalance ||
              !deliverySupported ||
              !fundingSupported ||
              quoteMutation.isPending
            }
            onClick={() => void requestQuote()}
          >
            {quoteMutation.isPending ? (
              <LoaderCircle className="mr-2 h-5 w-5 animate-spin" />
            ) : null}
            Continue to server quote
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <PageTransition>
      <div className="mx-auto max-w-6xl space-y-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-serif">Remittance</h1>
            <p className="mt-1 text-muted-foreground">
              Send money through the synthetic Samra ledger and provider flow.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-medium uppercase tracking-wider text-primary">
            <span className="h-2 w-2 rounded-full bg-primary" />
            Synthetic data · API mode
          </div>
        </div>

        <div className="grid items-start gap-8 lg:grid-cols-2">
          {mainCard}
          <RecentTransfers
            transfers={transfersQuery.data?.items ?? []}
            loading={transfersQuery.isLoading}
            error={transfersQuery.error}
            onRetry={() => void transfersQuery.refetch()}
          />
        </div>
      </div>
    </PageTransition>
  );
}
