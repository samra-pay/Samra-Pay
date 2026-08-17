import React, { useEffect, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
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
import type { RemittanceQuote } from "@workspace/samra-client";

import {
  beneficiaryDestination,
  cancelIdempotencyKey,
  formatMinorUnits,
  isTerminalTransferStatus,
  sanitizeUsdInput,
  transferIdempotencyKey,
  transferStatusLabel,
  usdInputToMinorUnits,
} from "@/lib/mobile-api-model";
import { useColors } from "@workspace/samra-pay-ds/hooks/use-colors";
import { nativeTheme } from "@workspace/samra-pay-ds/lib/native-theme";

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "The Samra API request failed.";
}

export function ApiRemittanceScreen() {
  const colors = useColors("dark");
  const insets = useSafeAreaInsets();
  const accounts = useAccounts();
  const activity = useActivity({ limit: 10 });
  const beneficiaries = useBeneficiaries();
  const options = useRemittanceOptions();
  const transfers = useTransfers({ limit: 10 });
  const createQuote = useCreateQuote();
  const createTransfer = useCreateTransfer();
  const cancelTransfer = useCancelTransfer();
  const [amountText, setAmountText] = useState("100");
  const [selectedBeneficiaryId, setSelectedBeneficiaryId] = useState("");
  const [quote, setQuote] = useState<RemittanceQuote | null>(null);
  const [transferId, setTransferId] = useState("");
  const transfer = useTransfer(transferId);

  useEffect(() => {
    if (!selectedBeneficiaryId && beneficiaries.data?.[0]) {
      setSelectedBeneficiaryId(beneficiaries.data[0].id);
    }
  }, [beneficiaries.data, selectedBeneficiaryId]);

  useEffect(() => {
    if (transfer.data && isTerminalTransferStatus(transfer.data.status)) {
      void Promise.allSettled([
        accounts.refetch(),
        activity.refetch(),
        transfers.refetch(),
      ]);
    }
  }, [transfer.data?.status]);

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;
  const sourceAccount = accounts.data?.find(
    (account) => account.status === "active",
  );
  const selectedBeneficiary = beneficiaries.data?.find(
    (beneficiary) => beneficiary.id === selectedBeneficiaryId,
  );
  const sendMinorUnits = usdInputToMinorUnits(amountText);
  const firstError =
    accounts.error ?? beneficiaries.error ?? options.error ?? transfers.error;
  const loading =
    accounts.isLoading ||
    beneficiaries.isLoading ||
    options.isLoading ||
    transfers.isLoading;
  const deliverySupported = selectedBeneficiary
    ? options.data?.deliveryMethods.includes(
        selectedBeneficiary.deliveryDetails.method,
      )
    : false;
  const fundingSupported =
    options.data?.fundingMethods.includes("samra_balance") ?? false;
  const canQuote =
    Boolean(sourceAccount) &&
    Boolean(selectedBeneficiary) &&
    Boolean(sendMinorUnits) &&
    deliverySupported &&
    fundingSupported;
  const trackedTransfer = transfer.data;
  const requestError =
    createQuote.error ??
    createTransfer.error ??
    cancelTransfer.error ??
    transfer.error;

  async function refreshPrerequisites() {
    await Promise.allSettled([
      accounts.refetch(),
      beneficiaries.refetch(),
      options.refetch(),
      transfers.refetch(),
    ]);
  }

  async function requestQuote() {
    if (!sourceAccount || !selectedBeneficiary || !sendMinorUnits || !canQuote)
      return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const created = await createQuote.mutateAsync({
      sourceAccountId: sourceAccount.id,
      beneficiaryId: selectedBeneficiary.id,
      sendAmount: { currency: "USD", minorUnits: sendMinorUnits },
      fundingMethod: "samra_balance",
      deliveryMethod: selectedBeneficiary.deliveryDetails.method,
    });
    setQuote(created);
  }

  async function submitTransfer() {
    if (!quote) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const created = await createTransfer.mutateAsync({
      input: { quoteId: quote.id },
      idempotencyKey: transferIdempotencyKey(quote.id),
    });
    setTransferId(created.id);
  }

  async function cancelTrackedTransfer() {
    if (!trackedTransfer) return;
    const cancelled = await cancelTransfer.mutateAsync({
      transferId: trackedTransfer.id,
      idempotencyKey: cancelIdempotencyKey(trackedTransfer.id),
    });
    setTransferId(cancelled.id);
  }

  function resetFlow() {
    setQuote(null);
    setTransferId("");
    setAmountText("100");
    createQuote.reset();
    createTransfer.reset();
    cancelTransfer.reset();
  }

  if (trackedTransfer) {
    const terminal = isTerminalTransferStatus(trackedTransfer.status);
    const cancellable =
      trackedTransfer.status === "created" ||
      trackedTransfer.status === "funds_reserved";
    return (
      <ScrollView
        testID="api-transfer-status"
        style={[styles.root, { backgroundColor: colors.background }]}
        contentContainerStyle={{
          paddingTop: topInset + 28,
          paddingBottom: bottomInset + 100,
        }}
      >
        <View style={styles.centeredHeader}>
          <View
            style={[
              styles.statusIcon,
              {
                backgroundColor:
                  trackedTransfer.status === "failed"
                    ? colors.destructive
                    : colors.accent,
              },
            ]}
          >
            <Feather
              name={
                trackedTransfer.status === "completed"
                  ? "check"
                  : trackedTransfer.status === "failed"
                    ? "alert-triangle"
                    : "refresh-cw"
              }
              size={30}
              color={
                trackedTransfer.status === "failed"
                  ? colors.destructiveForeground
                  : colors.primary
              }
            />
          </View>
          <Text style={[styles.title, { color: colors.foreground }]}>
            {terminal ? "Transfer update" : "Transfer in progress"}
          </Text>
          <Text
            testID="api-transfer-canonical-status"
            style={[styles.statusText, { color: colors.primary }]}
          >
            {transferStatusLabel(trackedTransfer.status)}
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            {trackedTransfer.recipientDisplay + " · " + trackedTransfer.id}
          </Text>
        </View>

        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Row
            label="Amount"
            value={
              "$" +
              formatMinorUnits(
                trackedTransfer.quoteSnapshot.sendAmount.minorUnits,
              )
            }
            colors={colors}
          />
          <Row
            label="Service fee"
            value={
              "$" +
              formatMinorUnits(
                trackedTransfer.quoteSnapshot.feeAmount.minorUnits,
              )
            }
            colors={colors}
          />
          <Row
            label="They receive"
            value={
              formatMinorUnits(
                trackedTransfer.quoteSnapshot.receiveAmount.minorUnits,
              ) + " ETB"
            }
            colors={colors}
            highlight
          />
        </View>

        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
          Timeline
        </Text>
        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          {trackedTransfer.timeline.map((item, index) => (
            <View
              key={item.status + "-" + item.occurredAt}
              style={[
                styles.timelineRow,
                index < trackedTransfer.timeline.length - 1 && {
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                },
              ]}
            >
              <Feather name="check-circle" size={16} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text
                  style={[styles.timelineStatus, { color: colors.foreground }]}
                >
                  {transferStatusLabel(item.status)}
                </Text>
                <Text
                  style={[
                    styles.timelineDate,
                    { color: colors.mutedForeground },
                  ]}
                >
                  {new Date(item.occurredAt).toLocaleString()}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {transfer.error ? (
          <ErrorPanel
            error={transfer.error}
            onRetry={() => void transfer.refetch()}
            colors={colors}
          />
        ) : null}

        {cancellable ? (
          <Pressable
            disabled={cancelTransfer.isPending}
            onPress={() => void cancelTrackedTransfer()}
            style={({ pressed }) => [
              styles.secondaryButton,
              {
                borderColor: colors.border,
                opacity: cancelTransfer.isPending || pressed ? 0.65 : 1,
              },
            ]}
          >
            <Text
              style={[styles.secondaryButtonText, { color: colors.foreground }]}
            >
              Cancel transfer
            </Text>
          </Pressable>
        ) : null}

        {terminal ? (
          <Pressable
            onPress={resetFlow}
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <Text
              style={[
                styles.primaryButtonText,
                { color: colors.primaryForeground },
              ]}
            >
              Send another
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>
    );
  }

  if (quote) {
    return (
      <ScrollView
        testID="api-quote-review"
        style={[styles.root, { backgroundColor: colors.background }]}
        contentContainerStyle={{
          paddingTop: topInset + 28,
          paddingBottom: bottomInset + 100,
        }}
      >
        <Text style={[styles.title, { color: colors.foreground }]}>
          Review server quote
        </Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          The fee, FX rate, recipient amount, and total below came from the API.
        </Text>

        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Row
            label="Recipient"
            value={selectedBeneficiary?.displayName ?? quote.beneficiaryId}
            colors={colors}
          />
          <Row
            label="Amount"
            value={"$" + formatMinorUnits(quote.sendAmount.minorUnits)}
            colors={colors}
          />
          <Row
            label="Service fee"
            value={"$" + formatMinorUnits(quote.feeAmount.minorUnits)}
            colors={colors}
          />
          <Row
            label="Total debit"
            value={"$" + formatMinorUnits(quote.totalDebit.minorUnits)}
            colors={colors}
            bold
          />
          <Row
            label="They receive"
            value={formatMinorUnits(quote.receiveAmount.minorUnits) + " ETB"}
            colors={colors}
            highlight
          />
          <Row
            label="Exchange rate"
            value={quote.exchangeRate + " ETB / USD"}
            colors={colors}
          />
          <Row
            label="Estimated delivery"
            value={quote.estimatedDelivery}
            colors={colors}
          />
        </View>

        {requestError ? (
          <ErrorPanel
            error={requestError}
            onRetry={() => void submitTransfer()}
            colors={colors}
          />
        ) : null}

        <Pressable
          disabled={createTransfer.isPending}
          onPress={() => void submitTransfer()}
          style={({ pressed }) => [
            styles.primaryButton,
            {
              backgroundColor: colors.primary,
              opacity: createTransfer.isPending || pressed ? 0.7 : 1,
            },
          ]}
        >
          <Text
            style={[
              styles.primaryButtonText,
              { color: colors.primaryForeground },
            ]}
          >
            {createTransfer.isPending ? "Submitting…" : "Confirm & send"}
          </Text>
        </Pressable>
        <Pressable
          disabled={createTransfer.isPending}
          onPress={() => setQuote(null)}
          style={({ pressed }) => [
            styles.secondaryButton,
            { borderColor: colors.border, opacity: pressed ? 0.65 : 1 },
          ]}
        >
          <Text
            style={[styles.secondaryButtonText, { color: colors.foreground }]}
          >
            Edit
          </Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      testID="api-remittance"
      style={[styles.root, { backgroundColor: colors.background }]}
      contentContainerStyle={{
        paddingTop: topInset + 12,
        paddingBottom: bottomInset + 100,
      }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.titleRow}>
        <View>
          <Text style={[styles.title, { color: colors.foreground }]}>
            Send money home
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Synthetic data · API mode
          </Text>
        </View>
        <View style={[styles.modeBadge, { backgroundColor: colors.accent }]}>
          <Feather name="database" size={12} color={colors.primary} />
          <Text style={[styles.modeText, { color: colors.accentForeground }]}>
            SERVER QUOTE
          </Text>
        </View>
      </View>

      {firstError ? (
        <ErrorPanel
          error={firstError}
          onRetry={() => void refreshPrerequisites()}
          colors={colors}
        />
      ) : null}

      {!firstError && loading ? (
        <View
          style={[
            styles.loadingCard,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Feather name="loader" size={20} color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
            Loading accounts, recipients, and remittance options…
          </Text>
        </View>
      ) : null}

      {!firstError && !loading ? (
        <>
          <View
            style={[
              styles.card,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Text
              style={[styles.fieldLabel, { color: colors.mutedForeground }]}
            >
              YOU SEND (USD)
            </Text>
            <View style={[styles.amountWrap, { borderColor: colors.border }]}>
              <Text style={[styles.dollar, { color: colors.primary }]}>$</Text>
              <TextInput
                testID="api-remit-amount"
                style={[styles.amountInput, { color: colors.foreground }]}
                keyboardType="decimal-pad"
                value={amountText}
                onChangeText={(value) => {
                  setAmountText(sanitizeUsdInput(value));
                  createQuote.reset();
                }}
                placeholder="0"
                placeholderTextColor={colors.mutedForeground}
              />
            </View>
            <Text
              style={[styles.accountHint, { color: colors.mutedForeground }]}
            >
              {sourceAccount
                ? "Funded from " +
                  sourceAccount.displayName +
                  " •••• " +
                  sourceAccount.last4
                : "No active backend account is available."}
            </Text>
          </View>

          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            Recipient
          </Text>
          <View style={styles.recipientList}>
            {beneficiaries.data?.map((beneficiary) => {
              const selected = beneficiary.id === selectedBeneficiaryId;
              return (
                <Pressable
                  key={beneficiary.id}
                  testID={"api-beneficiary-" + beneficiary.id}
                  onPress={() => {
                    setSelectedBeneficiaryId(beneficiary.id);
                    createQuote.reset();
                    Haptics.selectionAsync();
                  }}
                  style={({ pressed }) => [
                    styles.recipientCard,
                    {
                      backgroundColor: colors.card,
                      borderColor: selected ? colors.primary : colors.border,
                      opacity: pressed ? 0.75 : 1,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.recipientIcon,
                      { backgroundColor: colors.secondary },
                    ]}
                  >
                    <Feather
                      name={
                        beneficiary.deliveryDetails.method === "bank"
                          ? "home"
                          : "smartphone"
                      }
                      size={17}
                      color={colors.primary}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.recipientName,
                        { color: colors.foreground },
                      ]}
                    >
                      {beneficiary.displayName}
                    </Text>
                    <Text
                      style={[
                        styles.recipientDetail,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      {beneficiaryDestination(beneficiary)}
                    </Text>
                  </View>
                  <Feather
                    name={selected ? "check-circle" : "circle"}
                    size={18}
                    color={selected ? colors.primary : colors.mutedForeground}
                  />
                </Pressable>
              );
            })}
          </View>

          {createQuote.error ? (
            <ErrorPanel
              error={createQuote.error}
              onRetry={() => void requestQuote()}
              colors={colors}
            />
          ) : null}

          <Pressable
            disabled={!canQuote || createQuote.isPending}
            onPress={() => void requestQuote()}
            style={({ pressed }) => [
              styles.primaryButton,
              {
                backgroundColor: canQuote ? colors.primary : colors.secondary,
                opacity: createQuote.isPending || pressed ? 0.7 : 1,
              },
            ]}
          >
            <Text
              style={[
                styles.primaryButtonText,
                {
                  color: canQuote
                    ? colors.primaryForeground
                    : colors.mutedForeground,
                },
              ]}
            >
              {createQuote.isPending ? "Requesting quote…" : "Continue"}
            </Text>
          </Pressable>

          <Text style={[styles.disclaimer, { color: colors.mutedForeground }]}>
            Fake providers only. No real money is moved.
          </Text>
        </>
      ) : null}
    </ScrollView>
  );
}

function ErrorPanel({
  error,
  onRetry,
  colors,
}: {
  error: unknown;
  onRetry: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View
      testID="api-remittance-error"
      style={[
        styles.errorCard,
        { backgroundColor: colors.card, borderColor: colors.destructive },
      ]}
    >
      <Feather name="alert-circle" size={20} color={colors.destructive} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.errorTitle, { color: colors.foreground }]}>
          Could not reach Samra Pay
        </Text>
        <Text style={[styles.errorBody, { color: colors.mutedForeground }]}>
          {errorMessage(error)}
        </Text>
        <Pressable onPress={onRetry} style={styles.retryInline}>
          <Feather name="refresh-cw" size={14} color={colors.primary} />
          <Text style={[styles.retryText, { color: colors.primary }]}>
            Retry
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function Row({
  label,
  value,
  colors,
  bold,
  highlight,
}: {
  label: string;
  value: string;
  colors: ReturnType<typeof useColors>;
  bold?: boolean;
  highlight?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>
        {label}
      </Text>
      <Text
        style={[
          styles.rowValue,
          {
            color: highlight ? colors.primary : colors.foreground,
            fontFamily: bold ? font.sans.bold : font.sans.medium,
          },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const font = nativeTheme.fontFamily;

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 20 },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  centeredHeader: { alignItems: "center", marginBottom: 22 },
  title: { fontFamily: font.serif.semibold, fontSize: 28 },
  subtitle: {
    fontFamily: font.sans.regular,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  modeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  modeText: { fontFamily: font.sans.semibold, fontSize: 9, letterSpacing: 1 },
  card: { borderWidth: 1, borderRadius: 18, padding: 18, marginBottom: 22 },
  fieldLabel: {
    fontFamily: font.sans.medium,
    fontSize: 10,
    letterSpacing: 1.5,
  },
  amountWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    marginTop: 10,
    paddingBottom: 5,
  },
  dollar: { fontFamily: font.serif.semibold, fontSize: 34 },
  amountInput: {
    flex: 1,
    fontFamily: font.serif.semibold,
    fontSize: 42,
    paddingVertical: 0,
  },
  accountHint: { fontFamily: font.sans.regular, fontSize: 11, marginTop: 10 },
  sectionTitle: {
    fontFamily: font.serif.semibold,
    fontSize: 21,
    marginBottom: 12,
  },
  recipientList: { gap: 10, marginBottom: 22 },
  recipientCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
  },
  recipientIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  recipientName: { fontFamily: font.sans.semibold, fontSize: 14 },
  recipientDetail: {
    fontFamily: font.sans.regular,
    fontSize: 11,
    marginTop: 3,
  },
  loadingCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 24,
    alignItems: "center",
    gap: 10,
  },
  loadingText: {
    fontFamily: font.sans.regular,
    fontSize: 13,
    textAlign: "center",
  },
  errorCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 18,
  },
  errorTitle: { fontFamily: font.sans.semibold, fontSize: 14 },
  errorBody: {
    fontFamily: font.sans.regular,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  retryInline: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    marginTop: 10,
  },
  retryText: { fontFamily: font.sans.semibold, fontSize: 12 },
  primaryButton: {
    minHeight: 52,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    marginTop: 4,
  },
  primaryButtonText: { fontFamily: font.sans.semibold, fontSize: 15 },
  secondaryButton: {
    minHeight: 48,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
  },
  secondaryButtonText: { fontFamily: font.sans.semibold, fontSize: 14 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 18,
    paddingVertical: 9,
  },
  rowLabel: { flex: 1, fontFamily: font.sans.regular, fontSize: 12 },
  rowValue: { flex: 1, fontSize: 13, textAlign: "right" },
  statusIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  statusText: {
    fontFamily: font.sans.semibold,
    fontSize: 14,
    textTransform: "capitalize",
    marginTop: 8,
  },
  timelineRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    paddingVertical: 12,
  },
  timelineStatus: {
    fontFamily: font.sans.medium,
    fontSize: 13,
    textTransform: "capitalize",
  },
  timelineDate: { fontFamily: font.sans.regular, fontSize: 11, marginTop: 2 },
  disclaimer: {
    fontFamily: font.sans.regular,
    fontSize: 11,
    textAlign: "center",
    marginTop: 14,
  },
});
