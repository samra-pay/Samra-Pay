/**
 * TransactionRow — Single transaction in a list.
 * Presentation only. Uses StatusBadge, MoneyAmount, ListRow.
 */
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { ListRow } from "../ListRow";
import { StatusBadge } from "../StatusBadge";
import { MoneyAmount } from "./MoneyAmount";
import { useColors } from "../../../hooks/use-colors";
import { fontFamily } from "../../../lib/native-theme";
import type { NativeColorScheme } from "../../../lib/native-theme";
import type { FinancialStatus } from "../StatusBadge";

export type TransactionDirection = "debit" | "credit";

export interface TransactionRowProps {
  title: string;
  subtitle?: string;
  amount: string;
  currency: string;
  status: FinancialStatus;
  /** Consumer provides formatted date string, e.g. "Jul 14, 2025" */
  date: string;
  direction: TransactionDirection;
  onPress?: () => void;
  scheme?: NativeColorScheme;
}

export function TransactionRow({
  title,
  subtitle,
  amount,
  currency,
  status,
  date,
  direction,
  onPress,
  scheme = "dark",
}: TransactionRowProps) {
  const colors = useColors(scheme);

  const treatment = direction === "credit" ? "positive" : "negative";
  const prefix = direction === "credit" ? "+" : "-";

  const rightContent = (
    <View style={styles.right}>
      <MoneyAmount
        amount={`${prefix}${amount}`}
        currency={currency}
        size="sm"
        treatment={treatment}
        scheme={scheme}
      />
      <StatusBadge status={status} size="sm" scheme={scheme} />
    </View>
  );

  const leftContent = (
    <View style={styles.dateWrap}>
      <Text
        style={[styles.date, { fontFamily: fontFamily.sans.regular, color: colors.mutedForeground }]}
      >
        {date}
      </Text>
    </View>
  );

  return (
    <ListRow
      title={title}
      subtitle={subtitle}
      leftContent={leftContent}
      rightContent={rightContent}
      onPress={onPress}
      accessibilityLabel={`${title}: ${prefix}${amount} ${currency}, ${status}, ${date}`}
      divider
      scheme={scheme}
    />
  );
}

const styles = StyleSheet.create({
  right: { alignItems: "flex-end", gap: 4 },
  dateWrap: { width: 44 },
  date: { fontSize: 11, textAlign: "center" },
});

export default TransactionRow;
