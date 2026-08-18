/**
 * FeeBreakdown — Itemized fee list.
 * Presentation only — never calculates totals.
 */
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Divider } from "../Divider";
import { MoneyAmount } from "./MoneyAmount";
import { useColors } from "../../../hooks/use-colors";
import { fontFamily } from "../../../lib/native-theme";
import type { NativeColorScheme } from "../../../lib/native-theme";

export interface FeeItem {
  label: string;
  amount: string;
  currency: string;
}

export interface FeeBreakdownProps {
  items: FeeItem[];
  total: string;
  currency: string;
  footnote?: string;
  scheme?: NativeColorScheme;
}

export function FeeBreakdown({
  items,
  total,
  currency,
  footnote,
  scheme = "dark",
}: FeeBreakdownProps) {
  const colors = useColors(scheme);

  return (
    <View style={styles.container}>
      {items.map((item, i) => (
        <View key={i} style={styles.row}>
          <Text style={[styles.label, { fontFamily: fontFamily.sans.regular, color: colors.mutedForeground }]}>
            {item.label}
          </Text>
          <MoneyAmount amount={item.amount} currency={item.currency} size="sm" scheme={scheme} />
        </View>
      ))}
      <Divider scheme={scheme} spacing={8} />
      <View style={[styles.row, styles.totalRow]}>
        <Text style={[styles.totalLabel, { fontFamily: fontFamily.sans.semibold, color: colors.foreground }]}>
          Total fees
        </Text>
        <MoneyAmount amount={total} currency={currency} size="md" scheme={scheme} />
      </View>
      {footnote ? (
        <Text style={[styles.footnote, { fontFamily: fontFamily.sans.regular, color: colors.mutedForeground }]}>
          {footnote}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  label: { fontSize: 13 },
  totalRow: { marginTop: 4 },
  totalLabel: { fontSize: 14 },
  footnote: { fontSize: 11, marginTop: 4 },
});

export default FeeBreakdown;
