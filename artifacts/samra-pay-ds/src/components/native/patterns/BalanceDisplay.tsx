/**
 * BalanceDisplay — Large balance hero display.
 * Presentation only. Consumer provides formatted strings and stale flag.
 */
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { MoneyAmount } from "./MoneyAmount";
import { StaleDataNotice } from "./StaleDataNotice";
import { useColors } from "../../../hooks/use-colors";
import { fontFamily } from "../../../lib/native-theme";
import type { NativeColorScheme } from "../../../lib/native-theme";

export interface BalanceDisplayProps {
  balance: string;
  currency: string;
  label?: string;
  /** Consumer provides pre-formatted string, e.g. "Updated 2 min ago" */
  lastUpdatedAt?: string;
  isStale?: boolean;
  onRefresh?: () => void;
  scheme?: NativeColorScheme;
}

export function BalanceDisplay({
  balance,
  currency,
  label = "Available Balance",
  lastUpdatedAt,
  isStale = false,
  onRefresh,
  scheme = "dark",
}: BalanceDisplayProps) {
  const colors = useColors(scheme);

  return (
    <View style={styles.container} accessible accessibilityLabel={`${label}: ${balance} ${currency}`}>
      <Text
        style={[styles.label, { fontFamily: fontFamily.sans.regular, color: colors.mutedForeground }]}
        accessibilityElementsHidden
      >
        {label}
      </Text>
      <MoneyAmount
        amount={balance}
        currency={currency}
        size="display"
        treatment="neutral"
        scheme={scheme}
      />
      {lastUpdatedAt ? (
        <Text
          style={[styles.updated, { fontFamily: fontFamily.sans.regular, color: colors.mutedForeground }]}
          accessibilityElementsHidden
        >
          {lastUpdatedAt}
        </Text>
      ) : null}
      {isStale ? (
        <StaleDataNotice onRefresh={onRefresh} scheme={scheme} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center", gap: 8 },
  label: { fontSize: 13 },
  updated: { fontSize: 11 },
});

export default BalanceDisplay;
