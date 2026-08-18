/**
 * MoneyAmount — Display a monetary amount with currency.
 * Presentation only — never calculates or reformats values.
 */
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useColors } from "../../../hooks/use-colors";
import { fontFamily } from "../../../lib/native-theme";
import type { NativeColorScheme } from "../../../lib/native-theme";

export type MoneyAmountSize = "sm" | "md" | "lg" | "display";
export type MoneyAmountTreatment = "positive" | "negative" | "neutral";

const sizeStyles: Record<MoneyAmountSize, { amountSize: number; currencySize: number; fontFamilyKey: "sans" | "serif" }> = {
  sm: { amountSize: 14, currencySize: 11, fontFamilyKey: "sans" },
  md: { amountSize: 18, currencySize: 13, fontFamilyKey: "sans" },
  lg: { amountSize: 24, currencySize: 16, fontFamilyKey: "sans" },
  display: { amountSize: 48, currencySize: 24, fontFamilyKey: "serif" },
};

const treatmentColors: Record<MoneyAmountTreatment, { fg: string }> = {
  positive: { fg: "#6b9a78" }, // eucalyptus dark
  negative: { fg: "#f87171" }, // red-400
  neutral: { fg: "" }, // resolved at render from colors.foreground
};

export interface MoneyAmountProps {
  amount: string;
  currency: string;
  size?: MoneyAmountSize;
  treatment?: MoneyAmountTreatment;
  accessibilityLabel?: string;
  scheme?: NativeColorScheme;
}

export function MoneyAmount({
  amount,
  currency,
  size = "md",
  treatment = "neutral",
  accessibilityLabel,
  scheme = "dark",
}: MoneyAmountProps) {
  const colors = useColors(scheme);
  const sz = sizeStyles[size];

  const fgColor =
    treatment === "neutral" ? colors.foreground : treatmentColors[treatment].fg;

  const amountFont =
    sz.fontFamilyKey === "serif" ? fontFamily.serif.medium : fontFamily.sans.semibold;

  const ariaLabel = accessibilityLabel ?? `${amount} ${currency}`;

  return (
    <View
      style={styles.container}
      accessible
      accessibilityLabel={ariaLabel}
    >
      <Text
        style={[styles.currency, { fontFamily: fontFamily.sans.medium, fontSize: sz.currencySize, color: fgColor }]}
        accessibilityElementsHidden
      >
        {currency}
      </Text>
      <Text
        style={[styles.amount, { fontFamily: amountFont, fontSize: sz.amountSize, color: fgColor }]}
        accessibilityElementsHidden
      >
        {amount}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: "row", alignItems: "baseline", gap: 4 },
  currency: { letterSpacing: 0.5 },
  amount: { letterSpacing: -0.5 },
});

export default MoneyAmount;
