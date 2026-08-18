import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ActivityItem } from "@workspace/samra-client";
import {
  useAccounts,
  useActivity,
  useCurrentCustomer,
} from "@workspace/samra-client/react";
import { useColors } from "@workspace/samra-pay-ds/hooks/use-colors";
import { nativeTheme } from "@workspace/samra-pay-ds/lib/native-theme";

import { SamraLogo } from "@/components/SamraLogo";
import {
  accountBalancePresentation,
  activityAmountPresentation,
  activityMetadataPresentation,
  firstNameFromDisplayName,
  selectPrimaryUsdAccount,
} from "@/lib/home-api-model";

const MAX_VISIBLE_ACTIVITY = 5;

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "The request could not be completed.";
}

function ErrorNotice({
  error,
  retrying,
  onRetry,
}: {
  error: unknown;
  retrying: boolean;
  onRetry: () => void;
}) {
  const colors = useColors("dark");
  return (
    <View
      testID="api-home-error"
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
          {errorMessage(error)}
        </Text>
        <Pressable
          disabled={retrying}
          onPress={onRetry}
          style={styles.retryButton}
        >
          <Text style={[styles.retryText, { color: colors.primary }]}>
            {retrying ? "Retrying…" : "Retry"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function ActivityRow({ item, last }: { item: ActivityItem; last: boolean }) {
  const colors = useColors("dark");
  const credit = item.direction === "credit";
  return (
    <View
      testID={`api-activity-${item.id}`}
      style={[
        styles.activityRow,
        !last && { borderBottomWidth: 1, borderBottomColor: colors.border },
      ]}
    >
      <View
        style={[styles.activityIcon, { backgroundColor: colors.secondary }]}
      >
        <Feather
          name={credit ? "arrow-down-left" : "arrow-up-right"}
          size={15}
          color={credit ? colors.eucalyptus : colors.mutedForeground}
        />
      </View>
      <View style={styles.activityInfo}>
        <Text style={[styles.activityTitle, { color: colors.foreground }]}>
          {item.title}
        </Text>
        <Text style={[styles.activityMeta, { color: colors.mutedForeground }]}>
          {activityMetadataPresentation(item)}
        </Text>
      </View>
      <Text
        style={[
          styles.activityAmount,
          { color: credit ? colors.eucalyptus : colors.foreground },
        ]}
      >
        {activityAmountPresentation(item)}
      </Text>
    </View>
  );
}

export function ApiHomeScreen() {
  const colors = useColors("dark");
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const customerQuery = useCurrentCustomer();
  const accountsQuery = useAccounts();
  const activityQuery = useActivity({ limit: 25 });
  const [balanceHidden, setBalanceHidden] = useState(false);
  const [showAllActivity, setShowAllActivity] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 420,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  const account = selectPrimaryUsdAccount(accountsQuery.data ?? []);
  const balances = account ? accountBalancePresentation(account) : null;
  const accountActivity = account
    ? (activityQuery.data?.items ?? []).filter(
        (item) => item.accountId === account.id,
      )
    : [];
  const visibleActivity = showAllActivity
    ? accountActivity
    : accountActivity.slice(0, MAX_VISIBLE_ACTIVITY);
  const firstName = firstNameFromDisplayName(
    customerQuery.data?.displayName ?? "",
  );
  const requestError =
    customerQuery.error ?? accountsQuery.error ?? activityQuery.error;
  const loading =
    customerQuery.isLoading ||
    accountsQuery.isLoading ||
    activityQuery.isLoading;
  const retrying =
    customerQuery.isFetching ||
    accountsQuery.isFetching ||
    activityQuery.isFetching;

  async function refreshAll() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRefreshing(true);
    try {
      await Promise.all([
        customerQuery.refetch(),
        accountsQuery.refetch(),
        activityQuery.refetch(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <ScrollView
      testID="api-home-screen"
      style={[styles.root, { backgroundColor: colors.background }]}
      contentContainerStyle={{
        paddingTop: topInset + 12,
        paddingBottom: bottomInset + 100,
      }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void refreshAll()}
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
              Welcome back, {firstName}
            </Text>
            <Text
              style={[styles.greetingAm, { color: colors.mutedForeground }]}
              accessibilityLanguage="am"
            >
              እንኳን ደህና መጡ
            </Text>
          </View>
          <Pressable
            testID="open-settings"
            onPress={() => router.push("/settings")}
            style={({ pressed }) => [
              styles.iconButton,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Feather name="settings" size={17} color={colors.mutedForeground} />
          </Pressable>
        </View>

        <View style={styles.modeRow}>
          <View style={[styles.modeBadge, { backgroundColor: colors.accent }]}>
            <Text style={[styles.modeText, { color: colors.primary }]}>
              API MODE · SYNTHETIC DATA
            </Text>
          </View>
        </View>

        {requestError ? (
          <ErrorNotice
            error={requestError}
            retrying={retrying}
            onRetry={() => void refreshAll()}
          />
        ) : null}

        {loading && !accountsQuery.data ? (
          <View style={styles.loadingCard} testID="api-home-loading">
            <ActivityIndicator color={colors.primary} />
            <Text
              style={[styles.loadingText, { color: colors.mutedForeground }]}
            >
              Loading ledger balances and activity…
            </Text>
          </View>
        ) : account && balances ? (
          <View
            testID="api-balance-card"
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
                  AVAILABLE BALANCE
                </Text>
                <Text
                  style={[
                    styles.balanceLabelAm,
                    { color: colors.mutedForeground },
                  ]}
                  accessibilityLanguage="am"
                >
                  ያለው የሂሳብ ቀሪ
                </Text>
              </View>
              <Pressable
                accessibilityLabel={
                  balanceHidden ? "Show balance" : "Hide balance"
                }
                onPress={() => {
                  Haptics.selectionAsync();
                  setBalanceHidden((hidden) => !hidden);
                }}
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
              style={[
                balanceHidden ? styles.balanceHidden : styles.balanceValue,
                { color: colors.foreground },
              ]}
              allowFontScaling={false}
            >
              {balanceHidden ? "••••••" : balances.available}
            </Text>
            <View style={styles.accountMetaRow}>
              <View>
                <Text
                  style={[styles.accountName, { color: colors.foreground }]}
                >
                  {account.displayName} · ••••{account.last4}
                </Text>
                <Text
                  style={[
                    styles.bookBalance,
                    { color: colors.mutedForeground },
                  ]}
                >
                  Book balance {balances.book}
                </Text>
              </View>
              <View
                style={[styles.statusBadge, { borderColor: colors.border }]}
              >
                <Text style={[styles.statusText, { color: colors.eucalyptus }]}>
                  ACTIVE
                </Text>
              </View>
            </View>
            <View style={styles.quickRow}>
              <Pressable
                testID="api-home-send"
                onPress={() => router.push("/(tabs)/remittance")}
                style={({ pressed }) => [
                  styles.primaryAction,
                  {
                    backgroundColor: colors.primary,
                    opacity: pressed ? 0.75 : 1,
                  },
                ]}
              >
                <Feather
                  name="send"
                  size={16}
                  color={colors.primaryForeground}
                />
                <Text
                  style={[
                    styles.primaryActionText,
                    { color: colors.primaryForeground },
                  ]}
                >
                  Send money
                </Text>
              </Pressable>
              <Pressable
                onPress={() => void refreshAll()}
                style={({ pressed }) => [
                  styles.secondaryAction,
                  { borderColor: colors.border, opacity: pressed ? 0.65 : 1 },
                ]}
              >
                <Feather
                  name="refresh-cw"
                  size={15}
                  color={colors.mutedForeground}
                />
                <Text
                  style={[
                    styles.secondaryActionText,
                    { color: colors.foreground },
                  ]}
                >
                  Refresh
                </Text>
              </Pressable>
            </View>
          </View>
        ) : !requestError ? (
          <View
            testID="api-home-no-account"
            style={[
              styles.emptyCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Feather name="slash" size={20} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              No active USD account
            </Text>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              The backend did not return an active domestic account. No balance
              is being inferred.
            </Text>
          </View>
        ) : null}

        {account ? (
          <>
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
                  የቅርብ ጊዜ እንቅስቃሴ
                </Text>
              </View>
              {accountActivity.length > MAX_VISIBLE_ACTIVITY ? (
                <Pressable
                  onPress={() => setShowAllActivity((shown) => !shown)}
                >
                  <Text style={[styles.viewAll, { color: colors.primary }]}>
                    {showAllActivity ? "Show less" : "View all"}
                  </Text>
                </Pressable>
              ) : null}
            </View>
            <View
              testID="api-activity-card"
              style={[
                styles.activityCard,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              {visibleActivity.length > 0 ? (
                visibleActivity.map((item, index) => (
                  <ActivityRow
                    key={item.id}
                    item={item}
                    last={index === visibleActivity.length - 1}
                  />
                ))
              ) : (
                <View style={styles.activityEmpty}>
                  <Text
                    style={[styles.emptyTitle, { color: colors.foreground }]}
                  >
                    No ledger activity yet
                  </Text>
                  <Text
                    style={[
                      styles.emptyText,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    Posted deposits, remittances, fees, and refunds will appear
                    here.
                  </Text>
                </View>
              )}
            </View>
          </>
        ) : null}

        <Text style={[styles.disclaimer, { color: colors.mutedForeground }]}>
          Synthetic API data. Balances and activity come from Samra Pay ledger
          endpoints; no real funds move. No mock financial data is shown in API
          mode.
        </Text>
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
    marginBottom: 16,
  },
  greeting: { fontFamily: font.sans.regular, fontSize: 13, marginTop: 2 },
  greetingAm: {
    fontFamily: font.sans.regular,
    fontSize: 11,
    marginTop: 1,
    lineHeight: 18,
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  modeRow: {
    paddingHorizontal: 20,
    marginBottom: 14,
    alignItems: "flex-start",
  },
  modeBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  modeText: { fontFamily: font.sans.bold, fontSize: 10, letterSpacing: 1.1 },
  errorCard: {
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    flexDirection: "row",
    gap: 12,
  },
  errorBody: { flex: 1 },
  errorTitle: { fontFamily: font.sans.semibold, fontSize: 15 },
  errorText: {
    fontFamily: font.sans.regular,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  retryButton: { alignSelf: "flex-start", marginTop: 9, paddingVertical: 3 },
  retryText: { fontFamily: font.sans.semibold, fontSize: 13 },
  loadingCard: { alignItems: "center", gap: 10, paddingVertical: 46 },
  loadingText: { fontFamily: font.sans.regular, fontSize: 13 },
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
    alignItems: "flex-start",
    marginBottom: 6,
  },
  balanceLabel: {
    fontFamily: font.sans.medium,
    fontSize: 10,
    letterSpacing: 2,
  },
  balanceLabelAm: {
    fontFamily: font.sans.regular,
    fontSize: 9,
    letterSpacing: 1,
    lineHeight: 14,
    marginTop: 3,
  },
  balanceValue: {
    fontFamily: font.serif.semibold,
    fontSize: 44,
    marginBottom: 14,
  },
  balanceHidden: {
    fontFamily: font.sans.bold,
    fontSize: 34,
    letterSpacing: 6,
    marginBottom: 14,
  },
  accountMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginBottom: 20,
  },
  accountName: { fontFamily: font.sans.medium, fontSize: 13 },
  bookBalance: { fontFamily: font.sans.regular, fontSize: 11, marginTop: 3 },
  statusBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusText: { fontFamily: font.sans.bold, fontSize: 9, letterSpacing: 0.8 },
  quickRow: { flexDirection: "row", gap: 10 },
  primaryAction: {
    flex: 1,
    minHeight: 46,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  primaryActionText: { fontFamily: font.sans.semibold, fontSize: 13 },
  secondaryAction: {
    minHeight: 46,
    borderRadius: 13,
    borderWidth: 1,
    paddingHorizontal: 15,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 7,
  },
  secondaryActionText: { fontFamily: font.sans.semibold, fontSize: 13 },
  emptyCard: {
    marginHorizontal: 20,
    marginBottom: 28,
    borderRadius: 18,
    borderWidth: 1,
    padding: 22,
    alignItems: "center",
  },
  emptyTitle: { fontFamily: font.sans.semibold, fontSize: 14 },
  emptyText: {
    fontFamily: font.sans.regular,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    marginTop: 5,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  sectionTitle: { fontFamily: font.serif.semibold, fontSize: 21 },
  sectionTitleAm: {
    fontFamily: font.sans.regular,
    fontSize: 14,
    lineHeight: 22,
    marginTop: 1,
  },
  viewAll: { fontFamily: font.sans.medium, fontSize: 13 },
  activityCard: {
    marginHorizontal: 20,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 16,
    marginBottom: 28,
  },
  activityRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    gap: 12,
  },
  activityIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  activityInfo: { flex: 1 },
  activityTitle: { fontFamily: font.sans.medium, fontSize: 14 },
  activityMeta: { fontFamily: font.sans.regular, fontSize: 11, marginTop: 2 },
  activityAmount: { fontFamily: font.sans.semibold, fontSize: 14 },
  activityEmpty: { paddingVertical: 26, alignItems: "center" },
  disclaimer: {
    fontFamily: font.sans.regular,
    fontSize: 10,
    lineHeight: 16,
    textAlign: "center",
    paddingHorizontal: 32,
    marginBottom: 12,
  },
});
