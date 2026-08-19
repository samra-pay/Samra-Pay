import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type {
  Beneficiary,
  RemittanceQuote,
  Transfer,
  TransferStatus,
} from "@workspace/samra-client";
import {
  useAccounts,
  useBeneficiaries,
  useCancelTransfer,
  useCreateQuote,
  useCreateTransfer,
  useRemittanceOptions,
  useSamraCustomerAcquisition,
  useTransfer,
} from "@workspace/samra-client/react";
import { useColors } from "@workspace/samra-pay-ds/hooks/use-colors";

import {
  clearRemittanceSession,
  CANCELLABLE_TRANSFER_STATUSES,
  formatMinorUnits,
  isTerminalTransferStatus,
  loadRemittanceSession,
  persistActiveQuote,
  persistCreatedTransfer,
  prepareCancelSubmission,
  prepareTransferSubmission,
  resumePreparedCancellation,
  resumePreparedTransfer,
  sanitizeUsdInput,
  usdInputToMinorUnits,
  type MobileRemittanceSession,
} from "@/lib/remittance-session";

type Screen = "restoring" | "details" | "review" | "status";

function messageForError(error: unknown): string {
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
  onRetry?: () => void;
  retrying?: boolean;
}) {
  const colors = useColors("dark");
  return (
    <View
      style={[
        styles.errorCard,
        {
          backgroundColor: `${colors.destructive}18`,
          borderColor: `${colors.destructive}55`,
        },
      ]}
    >
      <Feather name="alert-circle" size={20} color={colors.destructive} />
      <View style={styles.errorBody}>
        <Text style={[styles.errorTitle, { color: colors.foreground }]}>
          Could not reach Samra Pay
        </Text>
        <Text style={[styles.errorText, { color: colors.mutedForeground }]}>
          {messageForError(error)}
        </Text>
        {onRetry ? (
          <Pressable
            disabled={retrying}
            onPress={onRetry}
            style={styles.retryButton}
          >
            <Text style={[styles.retryText, { color: colors.primary }]}>
              {retrying ? "Retrying…" : "Retry"}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function MoneyRow({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  const colors = useColors("dark");
  return (
    <View style={[styles.moneyRow, { borderBottomColor: colors.border }]}>
      <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>
        {label}
      </Text>
      <Text
        style={[
          styles.rowValue,
          { color: highlight ? colors.primary : colors.foreground },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function beneficiaryDetail(beneficiary: Beneficiary): string {
  const details = beneficiary.deliveryDetails;
  return details.method === "bank"
    ? `${details.institutionName} · account ••••${details.accountNumberLast4}`
    : `${details.institutionName} · wallet ••••${details.phoneNumberLast4}`;
}

function statusCopy(status: TransferStatus): {
  title: string;
  detail: string;
  icon: keyof typeof Feather.glyphMap;
} {
  switch (status) {
    case "completed":
      return {
        title: "Transfer completed",
        detail: "The backend confirmed the payout completed.",
        icon: "check",
      };
    case "failed":
      return {
        title: "Transfer failed",
        detail: "The provider flow failed. No completion is being shown.",
        icon: "x",
      };
    case "refund_pending":
      return {
        title: "Refund in progress",
        detail: "The ledger is waiting for the refund flow to finish.",
        icon: "rotate-ccw",
      };
    case "refunded":
      return {
        title: "Transfer refunded",
        detail: "The backend confirmed the synthetic debit was refunded.",
        icon: "rotate-ccw",
      };
    case "cancelled":
      return {
        title: "Transfer cancelled",
        detail: "The backend accepted the cancellation.",
        icon: "slash",
      };
    default:
      return {
        title: "Transfer processing",
        detail:
          "The backend is advancing the provider flow. This page updates automatically.",
        icon: "clock",
      };
  }
}

function TransferStatusView({
  transfer,
  refreshError,
  refreshing,
  onRetryRefresh,
  cancelling,
  cancelError,
  onCancel,
  onStartAnother,
}: {
  transfer: Transfer;
  refreshError: unknown;
  refreshing: boolean;
  onRetryRefresh: () => void;
  cancelling: boolean;
  cancelError: unknown;
  onCancel: () => void;
  onStartAnother: () => void;
}) {
  const colors = useColors("dark");
  const copy = statusCopy(transfer.status);
  const terminal = isTerminalTransferStatus(transfer.status);
  const success = transfer.status === "completed";
  const failure = transfer.status === "failed";
  const iconColor = success
    ? colors.accent
    : failure
      ? colors.destructive
      : colors.primary;

  return (
    <View style={styles.statusWrap}>
      <View
        style={[
          styles.statusIcon,
          { backgroundColor: `${iconColor}20`, borderColor: `${iconColor}55` },
        ]}
      >
        <Feather name={copy.icon} size={34} color={iconColor} />
      </View>
      <Text style={[styles.statusTitle, { color: colors.foreground }]}>
        {copy.title}
      </Text>
      <Text style={[styles.statusDetail, { color: colors.mutedForeground }]}>
        {copy.detail}
      </Text>
      <Text
        style={[
          styles.statusPill,
          { color: colors.primary, borderColor: colors.border },
        ]}
      >
        {transfer.status.replaceAll("_", " ").toUpperCase()}
      </Text>

      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <MoneyRow label="Recipient" value={transfer.recipientDisplay} />
        <MoneyRow
          label="You sent"
          value={`$${formatMinorUnits(transfer.quoteSnapshot.sendAmount.minorUnits)}`}
        />
        <MoneyRow
          label="They receive"
          value={`${formatMinorUnits(transfer.quoteSnapshot.receiveAmount.minorUnits)} ETB`}
          highlight
        />
        <MoneyRow label="Transfer ID" value={transfer.id} />
      </View>

      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
          BACKEND TIMELINE
        </Text>
        {transfer.timeline.map((entry, index) => (
          <View
            key={`${entry.status}-${entry.occurredAt}-${index}`}
            style={styles.timelineRow}
          >
            <View
              style={[styles.timelineDot, { backgroundColor: colors.primary }]}
            />
            <View style={styles.timelineBody}>
              <Text
                style={[styles.timelineStatus, { color: colors.foreground }]}
              >
                {entry.status.replaceAll("_", " ")}
              </Text>
              <Text
                style={[styles.timelineTime, { color: colors.mutedForeground }]}
              >
                {new Date(entry.occurredAt).toLocaleString()}
              </Text>
              {entry.detail ? (
                <Text
                  style={[
                    styles.timelineDetail,
                    { color: colors.mutedForeground },
                  ]}
                >
                  {entry.detail}
                </Text>
              ) : null}
            </View>
          </View>
        ))}
      </View>

      {refreshError ? (
        <ErrorNotice
          error={refreshError}
          onRetry={onRetryRefresh}
          retrying={refreshing}
        />
      ) : null}
      {cancelError ? (
        <ErrorNotice
          error={cancelError}
          onRetry={onCancel}
          retrying={cancelling}
        />
      ) : null}

      {CANCELLABLE_TRANSFER_STATUSES.has(transfer.status) ? (
        <Pressable
          disabled={cancelling}
          onPress={onCancel}
          style={[
            styles.secondaryButton,
            { borderColor: `${colors.destructive}66` },
          ]}
        >
          <Text
            style={[styles.secondaryButtonText, { color: colors.destructive }]}
          >
            {cancelling ? "Cancelling…" : "Cancel transfer"}
          </Text>
        </Pressable>
      ) : null}
      {terminal ? (
        <Pressable
          onPress={onStartAnother}
          style={[styles.secondaryButton, { borderColor: colors.border }]}
        >
          <Text
            style={[styles.secondaryButtonText, { color: colors.foreground }]}
          >
            Send another transfer
          </Text>
        </Pressable>
      ) : null}
      <Text style={[styles.demoNote, { color: colors.mutedForeground }]}>
        Synthetic demo only. No real funds were moved.
      </Text>
    </View>
  );
}

export function ApiRemittanceScreen() {
  const colors = useColors("dark");
  const acquisition = useSamraCustomerAcquisition();
  const insets = useSafeAreaInsets();
  const [screen, setScreen] = useState<Screen>("restoring");
  const [session, setSession] = useState<MobileRemittanceSession | null>(null);
  const [quote, setQuote] = useState<RemittanceQuote | null>(null);
  const [transferId, setTransferId] = useState("");
  const [amount, setAmount] = useState("100.00");
  const [beneficiaryId, setBeneficiaryId] = useState("");
  const [storageError, setStorageError] = useState<unknown>(null);
  const submissionStarted = useRef(false);
  const cancellationRecoveryStarted = useRef(false);

  const accountsQuery = useAccounts();
  const beneficiariesQuery = useBeneficiaries();
  const optionsQuery = useRemittanceOptions();
  const quoteMutation = useCreateQuote();
  const transferMutation = useCreateTransfer();
  const cancelMutation = useCancelTransfer();
  const transferQuery = useTransfer(transferId);

  const account = accountsQuery.data?.find(
    (item) =>
      item.kind === "domestic" &&
      item.currency === "USD" &&
      item.status === "active",
  );
  const beneficiaries = beneficiariesQuery.data ?? [];
  const beneficiary = beneficiaries.find((item) => item.id === beneficiaryId);
  const amountMinorUnits = usdInputToMinorUnits(amount);
  const deliveryMethod = beneficiary?.deliveryDetails.method;
  const transfer = transferQuery.data ?? transferMutation.data ?? null;
  const initialError =
    accountsQuery.error ?? beneficiariesQuery.error ?? optionsQuery.error;
  const initialLoading =
    accountsQuery.isLoading ||
    beneficiariesQuery.isLoading ||
    optionsQuery.isLoading;
  const deliverySupported = deliveryMethod
    ? optionsQuery.data?.deliveryMethods.includes(deliveryMethod)
    : false;
  const fundingSupported =
    optionsQuery.data?.fundingMethods.includes("samra_balance") ?? false;

  useEffect(() => {
    let active = true;
    async function restore() {
      let restored: MobileRemittanceSession | null = null;
      try {
        restored = await loadRemittanceSession();
        if (!active) return;
        setSession(restored);
        setQuote(restored?.quote ?? null);
        setTransferId(restored?.transferId ?? "");

        if (restored?.transferId) {
          setScreen("status");
          return;
        }

        if (restored?.transferIdempotencyKey) {
          submissionStarted.current = true;
          const recovered = await resumePreparedTransfer(
            restored,
            (input, idempotencyKey) =>
              transferMutation.mutateAsync({ input, idempotencyKey }),
          );
          if (!active || !recovered) return;
          const persisted = await loadRemittanceSession();
          if (!active) return;
          setSession(persisted);
          setQuote(recovered.quoteSnapshot);
          setTransferId(recovered.id);
          setScreen("status");
          return;
        }

        setScreen(restored?.quote ? "review" : "details");
      } catch (error) {
        if (!active) return;
        setSession(restored);
        setQuote(restored?.quote ?? null);
        setTransferId(restored?.transferId ?? "");
        submissionStarted.current = false;
        setStorageError(error);
        setScreen(restored?.quote ? "review" : "details");
      }
    }
    void restore();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (
      !session?.cancelIdempotencyKey ||
      !transfer ||
      cancellationRecoveryStarted.current
    ) {
      return;
    }
    if (!CANCELLABLE_TRANSFER_STATUSES.has(transfer.status)) return;

    cancellationRecoveryStarted.current = true;
    void resumePreparedCancellation(
      session,
      transfer.status,
      (id, idempotencyKey) =>
        cancelMutation.mutateAsync({ transferId: id, idempotencyKey }),
    ).catch((error) => {
      cancellationRecoveryStarted.current = false;
      setStorageError(error);
    });
  }, [session?.cancelIdempotencyKey, transfer?.id, transfer?.status]);

  useEffect(() => {
    if (!beneficiaryId && beneficiaries.length > 0)
      setBeneficiaryId(beneficiaries[0].id);
  }, [beneficiaryId, beneficiaries]);

  async function requestQuote() {
    if (
      !account ||
      !beneficiary ||
      !amountMinorUnits ||
      !deliveryMethod ||
      !deliverySupported ||
      !fundingSupported
    )
      return;
    setStorageError(null);
    void acquisition.recordOnce("quote_started");
    try {
      const serverQuote = await quoteMutation.mutateAsync({
        sourceAccountId: account.id,
        beneficiaryId: beneficiary.id,
        sendAmount: { currency: "USD", minorUnits: amountMinorUnits },
        fundingMethod: "samra_balance",
        deliveryMethod,
      });
      void acquisition.recordOnce("quote_completed");
      await persistActiveQuote(serverQuote);
      const nextSession: MobileRemittanceSession = {
        version: 1,
        quote: serverQuote,
      };
      setSession(nextSession);
      setQuote(serverQuote);
      submissionStarted.current = false;
      cancellationRecoveryStarted.current = false;
      setScreen("review");
    } catch (error) {
      if (!quoteMutation.error) setStorageError(error);
    }
  }

  async function confirmTransfer() {
    if (!quote || submissionStarted.current) return;
    submissionStarted.current = true;
    setStorageError(null);
    try {
      const idempotencyKey = await prepareTransferSubmission(quote);
      const prepared = await loadRemittanceSession();
      setSession(prepared);
      const created = await transferMutation.mutateAsync({
        input: { quoteId: quote.id },
        idempotencyKey,
      });
      setTransferId(created.id);
      setScreen("status");
      await persistCreatedTransfer(quote, created.id);
      setSession(await loadRemittanceSession());
    } catch (error) {
      submissionStarted.current = false;
      if (!transferMutation.error) setStorageError(error);
    }
  }

  async function cancelTransfer() {
    if (!transfer || !session || cancellationRecoveryStarted.current) return;
    cancellationRecoveryStarted.current = true;
    setStorageError(null);
    try {
      const idempotencyKey = await prepareCancelSubmission(session);
      setSession(await loadRemittanceSession());
      await cancelMutation.mutateAsync({
        transferId: transfer.id,
        idempotencyKey,
      });
    } catch (error) {
      cancellationRecoveryStarted.current = false;
      if (!cancelMutation.error) setStorageError(error);
    }
  }

  async function startAnother() {
    try {
      await clearRemittanceSession();
      setSession(null);
      setQuote(null);
      setTransferId("");
      setAmount("100.00");
      setStorageError(null);
      submissionStarted.current = false;
      cancellationRecoveryStarted.current = false;
      quoteMutation.reset();
      transferMutation.reset();
      cancelMutation.reset();
      setScreen("details");
    } catch (error) {
      setStorageError(error);
    }
  }

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 110 : insets.bottom + 100;

  let content: React.ReactNode;
  if (screen === "restoring") {
    content = (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
          Restoring secure transfer state…
        </Text>
      </View>
    );
  } else if (screen === "status") {
    content = transfer ? (
      <TransferStatusView
        transfer={transfer}
        refreshError={transferQuery.error}
        refreshing={transferQuery.isFetching}
        onRetryRefresh={() => void transferQuery.refetch()}
        cancelling={cancelMutation.isPending}
        cancelError={cancelMutation.error ?? storageError}
        onCancel={() => void cancelTransfer()}
        onStartAnother={() => void startAnother()}
      />
    ) : transferQuery.error ? (
      <>
        <ErrorNotice
          error={transferQuery.error}
          onRetry={() => void transferQuery.refetch()}
          retrying={transferQuery.isFetching}
        />
        <Pressable
          onPress={() => void startAnother()}
          style={[styles.secondaryButton, { borderColor: colors.border }]}
        >
          <Text
            style={[styles.secondaryButtonText, { color: colors.foreground }]}
          >
            Start a new transfer
          </Text>
        </Pressable>
      </>
    ) : (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
          Loading backend transfer state…
        </Text>
      </View>
    );
  } else if (screen === "review" && quote) {
    const expired =
      quote.status !== "active" || Date.parse(quote.expiresAt) <= Date.now();
    content = (
      <View>
        <Text style={[styles.title, { color: colors.foreground }]}>
          Review transfer
        </Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          These values came from the Samra Pay API.
        </Text>
        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <MoneyRow
            label="You send"
            value={`$${formatMinorUnits(quote.sendAmount.minorUnits)}`}
          />
          <MoneyRow
            label="Service fee"
            value={`$${formatMinorUnits(quote.feeAmount.minorUnits)}`}
          />
          <MoneyRow
            label="Total debit"
            value={`$${formatMinorUnits(quote.totalDebit.minorUnits)}`}
          />
          <MoneyRow
            label="They receive"
            value={`${formatMinorUnits(quote.receiveAmount.minorUnits)} ETB`}
            highlight
          />
          <MoneyRow
            label="Exchange rate"
            value={`$1 = ${quote.exchangeRate} ETB`}
          />
          <MoneyRow
            label="Estimated delivery"
            value={quote.estimatedDelivery}
          />
        </View>
        {expired ? (
          <ErrorNotice
            error={
              new Error(
                "This quote expired. Return and request a fresh server quote.",
              )
            }
          />
        ) : null}
        {(transferMutation.error ?? storageError) ? (
          <ErrorNotice
            error={transferMutation.error ?? storageError}
            onRetry={() => void confirmTransfer()}
            retrying={transferMutation.isPending}
          />
        ) : null}
        <Pressable
          disabled={expired || transferMutation.isPending}
          onPress={() => void confirmTransfer()}
          style={[
            styles.primaryButton,
            {
              backgroundColor: colors.primary,
              opacity: expired || transferMutation.isPending ? 0.45 : 1,
            },
          ]}
        >
          <Text
            style={[
              styles.primaryButtonText,
              { color: colors.primaryForeground },
            ]}
          >
            {transferMutation.isPending
              ? "Submitting securely…"
              : "Confirm transfer"}
          </Text>
        </Pressable>
        <Pressable
          disabled={transferMutation.isPending}
          onPress={() => setScreen("details")}
          style={[styles.secondaryButton, { borderColor: colors.border }]}
        >
          <Text
            style={[styles.secondaryButtonText, { color: colors.foreground }]}
          >
            Edit details
          </Text>
        </Pressable>
        <Text style={[styles.demoNote, { color: colors.mutedForeground }]}>
          Submission is not completion. The next screen waits for backend truth.
        </Text>
      </View>
    );
  } else {
    content = (
      <View>
        <Text style={[styles.eyebrow, { color: colors.primary }]}>
          API MODE · SYNTHETIC DATA
        </Text>
        <Text style={[styles.title, { color: colors.foreground }]}>
          Send money to Ethiopia
        </Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Create a server quote using an existing verified demo beneficiary.
        </Text>

        {initialError ? (
          <ErrorNotice
            error={initialError}
            onRetry={() =>
              void Promise.all([
                accountsQuery.refetch(),
                beneficiariesQuery.refetch(),
                optionsQuery.refetch(),
              ])
            }
            retrying={
              accountsQuery.isFetching ||
              beneficiariesQuery.isFetching ||
              optionsQuery.isFetching
            }
          />
        ) : null}
        {initialLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.primary} />
            <Text
              style={[styles.loadingText, { color: colors.mutedForeground }]}
            >
              Loading backend remittance options…
            </Text>
          </View>
        ) : null}
        {!initialLoading && !initialError ? (
          <>
            <Text
              style={[styles.fieldLabel, { color: colors.mutedForeground }]}
            >
              YOU SEND
            </Text>
            <View
              style={[
                styles.amountInputWrap,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <Text
                style={[styles.currencySymbol, { color: colors.foreground }]}
              >
                $
              </Text>
              <TextInput
                keyboardType="decimal-pad"
                value={amount}
                onChangeText={(value) => setAmount(sanitizeUsdInput(value))}
                style={[styles.amountInput, { color: colors.foreground }]}
                placeholder="100.00"
                placeholderTextColor={colors.mutedForeground}
              />
              <Text
                style={[styles.currencyCode, { color: colors.mutedForeground }]}
              >
                USD
              </Text>
            </View>

            <Text
              style={[styles.fieldLabel, { color: colors.mutedForeground }]}
            >
              RECIPIENT
            </Text>
            {beneficiaries.map((item) => {
              const selected = item.id === beneficiaryId;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => setBeneficiaryId(item.id)}
                  style={[
                    styles.beneficiaryCard,
                    {
                      backgroundColor: colors.card,
                      borderColor: selected ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.beneficiaryIcon,
                      { backgroundColor: `${colors.primary}18` },
                    ]}
                  >
                    <Feather
                      name={
                        item.deliveryDetails.method === "bank"
                          ? "briefcase"
                          : "smartphone"
                      }
                      size={19}
                      color={colors.primary}
                    />
                  </View>
                  <View style={styles.beneficiaryBody}>
                    <Text
                      style={[
                        styles.beneficiaryName,
                        { color: colors.foreground },
                      ]}
                    >
                      {item.displayName}
                    </Text>
                    <Text
                      style={[
                        styles.beneficiaryDetail,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      {beneficiaryDetail(item)}
                    </Text>
                  </View>
                  {selected ? (
                    <Feather
                      name="check-circle"
                      size={20}
                      color={colors.primary}
                    />
                  ) : null}
                </Pressable>
              );
            })}

            {!account ? (
              <ErrorNotice
                error={new Error("No active USD account is available.")}
              />
            ) : null}
            {beneficiaries.length === 0 ? (
              <ErrorNotice
                error={new Error("No active beneficiaries are available.")}
              />
            ) : null}
            {quoteMutation.error ? (
              <ErrorNotice
                error={quoteMutation.error}
                onRetry={() => void requestQuote()}
                retrying={quoteMutation.isPending}
              />
            ) : null}
            {storageError ? (
              <ErrorNotice
                error={storageError}
                onRetry={() => void requestQuote()}
              />
            ) : null}
            <Pressable
              disabled={
                !account ||
                !beneficiary ||
                !amountMinorUnits ||
                !deliverySupported ||
                !fundingSupported ||
                quoteMutation.isPending
              }
              onPress={() => void requestQuote()}
              style={[
                styles.primaryButton,
                {
                  backgroundColor: colors.primary,
                  opacity:
                    !account ||
                    !beneficiary ||
                    !amountMinorUnits ||
                    !deliverySupported ||
                    !fundingSupported ||
                    quoteMutation.isPending
                      ? 0.45
                      : 1,
                },
              ]}
            >
              <Text
                style={[
                  styles.primaryButtonText,
                  { color: colors.primaryForeground },
                ]}
              >
                {quoteMutation.isPending
                  ? "Requesting quote…"
                  : "Review server quote"}
              </Text>
            </Pressable>
          </>
        ) : null}
      </View>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[
        styles.page,
        { paddingTop: topInset + 20, paddingBottom: bottomInset },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      {content}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, paddingHorizontal: 20 },
  eyebrow: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  title: { fontSize: 30, fontWeight: "600", letterSpacing: -0.5 },
  subtitle: { fontSize: 15, lineHeight: 22, marginTop: 8, marginBottom: 24 },
  fieldLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.3,
    marginTop: 22,
    marginBottom: 9,
  },
  amountInputWrap: {
    borderWidth: 1,
    borderRadius: 16,
    minHeight: 78,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
  },
  currencySymbol: { fontSize: 30, fontWeight: "600", marginRight: 8 },
  amountInput: {
    flex: 1,
    fontSize: 30,
    fontWeight: "600",
    paddingVertical: 16,
  },
  currencyCode: { fontSize: 13, fontWeight: "700" },
  beneficiaryCard: {
    borderWidth: 1,
    borderRadius: 15,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  beneficiaryIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  beneficiaryBody: { flex: 1, marginHorizontal: 12 },
  beneficiaryName: { fontSize: 15, fontWeight: "600" },
  beneficiaryDetail: { fontSize: 12, marginTop: 3 },
  card: {
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 16,
    marginTop: 20,
    overflow: "hidden",
  },
  moneyRow: {
    minHeight: 54,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
  },
  rowLabel: { fontSize: 13, flexShrink: 0 },
  rowValue: {
    fontSize: 13,
    fontWeight: "600",
    textAlign: "right",
    flexShrink: 1,
  },
  primaryButton: {
    minHeight: 54,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
  },
  primaryButtonText: { fontSize: 15, fontWeight: "700" },
  secondaryButton: {
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
  },
  secondaryButtonText: { fontSize: 14, fontWeight: "600" },
  errorCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    flexDirection: "row",
    marginVertical: 10,
  },
  errorBody: { flex: 1, marginLeft: 11 },
  errorTitle: { fontSize: 14, fontWeight: "700" },
  errorText: { fontSize: 12, lineHeight: 18, marginTop: 3 },
  retryButton: { alignSelf: "flex-start", paddingTop: 8, paddingRight: 20 },
  retryText: { fontSize: 13, fontWeight: "700" },
  loading: {
    minHeight: 190,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: { fontSize: 13 },
  statusWrap: { alignItems: "stretch" },
  statusIcon: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
  },
  statusTitle: {
    fontSize: 27,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 18,
  },
  statusDetail: {
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
    marginTop: 8,
    paddingHorizontal: 18,
  },
  statusPill: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.1,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 11,
    paddingVertical: 6,
    alignSelf: "center",
    marginTop: 13,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    marginVertical: 15,
  },
  timelineRow: { flexDirection: "row", paddingBottom: 16 },
  timelineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 5,
    marginRight: 11,
  },
  timelineBody: { flex: 1 },
  timelineStatus: {
    fontSize: 13,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  timelineTime: { fontSize: 10, marginTop: 2 },
  timelineDetail: { fontSize: 11, lineHeight: 16, marginTop: 3 },
  demoNote: {
    fontSize: 11,
    lineHeight: 17,
    textAlign: "center",
    marginTop: 18,
    paddingHorizontal: 20,
  },
});
