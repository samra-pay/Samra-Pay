/**
 * AccountSummary — Card with account name, masked number, balance.
 * Presentation only.
 */
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Card } from "../Card";
import { MoneyAmount } from "./MoneyAmount";
import { useColors } from "../../../hooks/use-colors";
import { fontFamily } from "../../../lib/native-theme";
import type { NativeColorScheme } from "../../../lib/native-theme";

export interface AccountSummaryProps {
  accountName: string;
  maskedNumber: string;
  balance: string;
  currency: string;
  accountType?: string;
  scheme?: NativeColorScheme;
}

export function AccountSummary({
  accountName,
  maskedNumber,
  balance,
  currency,
  accountType,
  scheme = "dark",
}: AccountSummaryProps) {
  const colors = useColors(scheme);

  return (
    <Card variant="elevated" padding="lg" scheme={scheme}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text
            style={[styles.name, { fontFamily: fontFamily.sans.semibold, color: colors.foreground }]}
            numberOfLines={1}
          >
            {accountName}
          </Text>
          {accountType ? (
            <Text
              style={[styles.type, { fontFamily: fontFamily.sans.regular, color: colors.mutedForeground }]}
            >
              {accountType}
            </Text>
          ) : null}
        </View>
      </View>
      <Text
        style={[styles.masked, { fontFamily: fontFamily.mono, color: colors.mutedForeground }]}
        accessibilityLabel={`Account ending in ${maskedNumber.replace(/•/g, "")}`}
      >
        {maskedNumber}
      </Text>
      <View style={styles.balanceRow}>
        <MoneyAmount amount={balance} currency={currency} size="lg" scheme={scheme} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  headerLeft: { gap: 2 },
  name: { fontSize: 16 },
  type: { fontSize: 12 },
  masked: { fontSize: 14, letterSpacing: 2, marginBottom: 12 },
  balanceRow: { marginTop: 4 },
});

export default AccountSummary;
