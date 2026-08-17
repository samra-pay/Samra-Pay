import React, { useRef, useState } from "react";
import {
  Animated,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import {
  useAccounts,
  useActivity,
  useCurrentCustomer,
  useTransfers,
} from "@workspace/samra-client/react";

import { SamraLogo } from "@/components/SamraLogo";
import {
  accountBalancePresentation,
  activityAmountPresentation,
  transferStatusLabel,
} from "@/lib/mobile-api-model";
import { useColors } from "@workspace/samra-pay-ds/hooks/use-colors";
import { nativeTheme } from "@workspace/samra-pay-ds/lib/native-theme";

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "The Samra API could not be reached.";
}

export function ApiDashboard() {
  const colors = useColors("dark");
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const customer = useCurrentCustomer();
  const accounts = useAccounts();
  const activity = useActivity({ limit: 10 });
  const transfers = useTransfers({ limit: 5 });
  const [balanceHidden, setBalanceHidden] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 420,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;
  const firstAccount = accounts.data?.[0];
  const balance = firstAccount
    ? accountBalancePresentation(firstAccount)
    : null;
  const firstError =
    customer.error ?? accounts.error ?? activity.error ?? transfers.error;
  const loading =
    customer.isLoading ||
    accounts.isLoading ||
    activity.isLoading ||
    transfers.isLoading;

  async function refresh() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRefreshing(true);
    await Promise.allSettled([
      customer.refetch(),
      accounts.refetch(),
      activity.refetch(),
      transfers.refetch(),
    ]);
    setRefreshing(false);
  }

  return (
    <ScrollView
      testID="api-dashboard"
      style={[styles.root, { backgroundColor: colors.background }]}
      contentContainerStyle={{
        paddingTop: topInset + 12,
        paddingBottom: bottomInset + 100,
      }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void refresh()}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
    >
      <Animated.View style={{ opacity: fadeAnim }}>
        <View style={styles.header}>
          <View>
            <SamraLogo size="md" />
            <Text style={[styles.greeting, { color: colors.mutedForeground }]}>
              {customer.data?.displayName
                ? "Welcome back, " + customer.data.displayName.split(/\s+/)[0]
                : "Synthetic backend account"}
            </Text>
            <Text
              style={[styles.greetingAm, { color: colors.mutedForeground }]}
              accessibilityLanguage="am"
            >
              እንኳን ደህና መጡ
            </Text>
          </View>
          <View style={[styles.modeBadge, { backgroundColor: colors.accent }]}>
            <Feather name="database" size={12} color={colors.primary} />
            <Text style={[styles.modeText, { color: colors.accentForeground }]}>
              API MODE
            </Text>
          </View>
        </View>

        {firstError ? (
          <View
            testID="api-dashboard-error"
            style={[
              styles.errorCard,
              { backgroundColor: colors.card, borderColor: colors.destructive },
            ]}
          >
            <Feather name="alert-circle" size={20} color={colors.destructive} />
            <Text style={[styles.errorTitle, { color: colors.foreground }]}>
              Backend unavailable
            </Text>
            <Text style={[styles.errorBody, { color: colors.mutedForeground }]}>
              {errorMessage(firstError)}
            </Text>
            <Pressable
              onPress={() => void refresh()}
              style={({ pressed }) => [
                styles.retryButton,
                { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Feather name="refresh-cw" size={14} color={colors.primary} />
              <Text style={[styles.retryText, { color: colors.primary }]}>
                Retry
              </Text>
            </Pressable>
          </View>
        ) : null}

        {!firstError && loading ? (
          <View
            style={[
              styles.loadingCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Feather name="loader" size={20} color={colors.primary} />
            <Text
              style={[styles.loadingText, { color: colors.mutedForeground }]}
            >
              Loading ledger-backed account…
            </Text>
          </View>
        ) : null}

        {!firstError && !loading ? (
          <>
            <View
              style={[
                styles.balanceCard,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <View style={styles.balanceLabelRow}>
                <View>
                  <Text
                    style={[
                      styles.balanceLabel,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    {(firstAccount?.displayName.toUpperCase() ?? "ACCOUNT") +
                      " AVAILABLE"}
                  </Text>
                  <Text
                    style={[
                      styles.balanceLabelAm,
                      { color: colors.mutedForeground },
                    ]}
                    accessibilityLanguage="am"
                  >
                    የሂሳብ ቀሪ
                  </Text>
                </View>
                <Pressable
                  onPress={() => setBalanceHidden((hidden) => !hidden)}
                  hitSlop={10}
                >
                  <Feather
                    name={balanceHidden ? "eye-off" : "eye"}
                    size={14}
                    color={colors.mutedForeground}
                  />
                </Pressable>
              </View>
              <Text
                testID="api-available-balance"
                style={[styles.balanceValue, { color: colors.foreground }]}
                allowFontScaling={false}
              >
                {balanceHidden ? "••••••" : (balance?.available ?? "—")}
              </Text>
              <Text
                style={[styles.bookBalance, { color: colors.mutedForeground }]}
              >
                {"Book balance " + (balance?.book ?? "—") + " · ledger-derived"}
              </Text>
              <View style={styles.quickRow}>
                <Pressable
                  onPress={() => router.push("/(tabs)/remittance")}
                  style={({ pressed }) => [
                    styles.quickItem,
                    { opacity: pressed ? 0.65 : 1 },
                  ]}
                >
                  <View
                    style={[
                      styles.quickIcon,
                      { backgroundColor: colors.accent },
                    ]}
                  >
                    <Feather name="send" size={18} color={colors.primary} />
                  </View>
                  <Text
                    style={[
                      styles.quickLabel,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    Send
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => void refresh()}
                  style={({ pressed }) => [
                    styles.quickItem,
                    { opacity: pressed ? 0.65 : 1 },
                  ]}
                >
                  <View
                    style={[
                      styles.quickIcon,
                      { backgroundColor: colors.accent },
                    ]}
                  >
                    <Feather
                      name="refresh-cw"
                      size={18}
                      color={colors.primary}
                    />
                  </View>
                  <Text
                    style={[
                      styles.quickLabel,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    Refresh
                  </Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.sectionHeader}>
              <View>
                <Text
                  style={[styles.sectionTitle, { color: colors.foreground }]}
                >
                  Recent activity
                </Text>
                <Text
                  style={[
                    styles.sectionTitleAm,
                    { color: colors.mutedForeground },
                  ]}
                  accessibilityLanguage="am"
                >
                  የቅርብ ጊዜ ግብይቶች
                </Text>
              </View>
            </View>
            <View
              style={[
                styles.txCard,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              {(activity.data?.items.length ?? 0) === 0 ? (
                <Text
                  style={[styles.emptyText, { color: colors.mutedForeground }]}
                >
                  No backend activity yet.
                </Text>
              ) : null}
              {activity.data?.items.slice(0, 5).map((item, index, items) => (
                <View
                  key={item.id}
                  style={[
                    styles.txRow,
                    index < items.length - 1 && {
                      borderBottomWidth: 1,
                      borderBottomColor: colors.border,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.txIcon,
                      { backgroundColor: colors.secondary },
                    ]}
                  >
                    <Feather
                      name={
                        item.direction === "credit"
                          ? "arrow-down-left"
                          : "arrow-up-right"
                      }
                      size={15}
                      color={
                        item.direction === "credit"
                          ? colors.eucalyptus
                          : colors.mutedForeground
                      }
                    />
                  </View>
                  <View style={styles.txInfo}>
                    <Text
                      style={[styles.txMerchant, { color: colors.foreground }]}
                    >
                      {item.title}
                    </Text>
                    <Text
                      style={[styles.txMeta, { color: colors.mutedForeground }]}
                    >
                      {new Date(item.occurredAt).toLocaleDateString() +
                        " · " +
                        item.status}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.txAmount,
                      {
                        color:
                          item.direction === "credit"
                            ? colors.eucalyptus
                            : colors.foreground,
                      },
                    ]}
                  >
                    {activityAmountPresentation(item)}
                  </Text>
                </View>
              ))}
            </View>

            <Text
              style={[
                styles.sectionTitleStandalone,
                { color: colors.foreground },
              ]}
            >
              Transfers
            </Text>
            <View
              style={[
                styles.txCard,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              {(transfers.data?.items.length ?? 0) === 0 ? (
                <Text
                  style={[styles.emptyText, { color: colors.mutedForeground }]}
                >
                  No durable transfers yet.
                </Text>
              ) : null}
              {transfers.data?.items.map((transfer, index, items) => (
                <View
                  key={transfer.id}
                  style={[
                    styles.transferRow,
                    index < items.length - 1 && {
                      borderBottomWidth: 1,
                      borderBottomColor: colors.border,
                    },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[styles.txMerchant, { color: colors.foreground }]}
                    >
                      {transfer.recipientDisplay}
                    </Text>
                    <Text
                      style={[styles.txMeta, { color: colors.mutedForeground }]}
                    >
                      {transfer.id}
                    </Text>
                  </View>
                  <Text style={[styles.status, { color: colors.primary }]}>
                    {transferStatusLabel(transfer.status)}
                  </Text>
                </View>
              ))}
            </View>

            <Text
              style={[styles.disclaimer, { color: colors.mutedForeground }]}
            >
              Synthetic data · API mode · balances and statuses come from the
              Samra ledger.
            </Text>
          </>
        ) : null}
      </Animated.View>
    </ScrollView>
  );
}

const font = nativeTheme.fontFamily;

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  greeting: { fontFamily: font.sans.regular, fontSize: 13, marginTop: 2 },
  greetingAm: {
    fontFamily: font.sans.regular,
    fontSize: 11,
    marginTop: 1,
    lineHeight: 18,
  },
  modeBadge: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
  },
  modeText: { fontFamily: font.sans.semibold, fontSize: 9, letterSpacing: 1.2 },
  loadingCard: {
    marginHorizontal: 20,
    borderWidth: 1,
    borderRadius: 18,
    padding: 24,
    alignItems: "center",
    gap: 10,
  },
  loadingText: { fontFamily: font.sans.regular, fontSize: 14 },
  errorCard: {
    marginHorizontal: 20,
    borderWidth: 1,
    borderRadius: 18,
    padding: 20,
    alignItems: "flex-start",
  },
  errorTitle: { marginTop: 10, fontFamily: font.sans.semibold, fontSize: 16 },
  errorBody: {
    marginTop: 6,
    fontFamily: font.sans.regular,
    fontSize: 13,
    lineHeight: 19,
  },
  retryButton: {
    marginTop: 14,
    flexDirection: "row",
    gap: 7,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  retryText: { fontFamily: font.sans.semibold, fontSize: 13 },
  balanceCard: {
    marginHorizontal: 20,
    borderRadius: 20,
    borderWidth: 1,
    padding: 22,
    marginBottom: 28,
  },
  balanceLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  balanceLabel: {
    fontFamily: font.sans.medium,
    fontSize: 10,
    letterSpacing: 1.4,
  },
  balanceLabelAm: {
    fontFamily: font.sans.regular,
    fontSize: 9,
    lineHeight: 14,
    marginTop: 2,
  },
  balanceValue: {
    fontFamily: font.serif.semibold,
    fontSize: 44,
    marginBottom: 3,
  },
  bookBalance: {
    fontFamily: font.sans.regular,
    fontSize: 11,
    marginBottom: 20,
  },
  quickRow: { flexDirection: "row", gap: 34 },
  quickItem: { alignItems: "center", gap: 6 },
  quickIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  quickLabel: { fontFamily: font.sans.medium, fontSize: 11 },
  sectionHeader: { paddingHorizontal: 20, marginBottom: 12 },
  sectionTitle: { fontFamily: font.serif.semibold, fontSize: 21 },
  sectionTitleStandalone: {
    fontFamily: font.serif.semibold,
    fontSize: 21,
    marginHorizontal: 20,
    marginBottom: 12,
  },
  sectionTitleAm: {
    fontFamily: font.sans.regular,
    fontSize: 14,
    lineHeight: 22,
    marginTop: 1,
  },
  txCard: {
    marginHorizontal: 20,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 16,
    marginBottom: 28,
  },
  txRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    gap: 12,
  },
  txIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  txInfo: { flex: 1 },
  txMerchant: { fontFamily: font.sans.medium, fontSize: 14 },
  txMeta: {
    fontFamily: font.sans.regular,
    fontSize: 11,
    marginTop: 2,
    textTransform: "capitalize",
  },
  txAmount: { fontFamily: font.sans.semibold, fontSize: 13 },
  transferRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    gap: 12,
  },
  status: {
    fontFamily: font.sans.semibold,
    fontSize: 11,
    textTransform: "capitalize",
  },
  emptyText: {
    fontFamily: font.sans.regular,
    fontSize: 13,
    textAlign: "center",
    paddingVertical: 22,
  },
  disclaimer: {
    fontFamily: font.sans.regular,
    fontSize: 11,
    lineHeight: 17,
    textAlign: "center",
    marginHorizontal: 30,
  },
});
