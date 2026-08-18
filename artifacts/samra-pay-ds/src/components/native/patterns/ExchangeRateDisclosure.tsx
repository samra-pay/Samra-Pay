/**
 * ExchangeRateDisclosure — Rate disclosure line.
 * Pure display — never calculate the rate.
 */
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useColors } from "../../../hooks/use-colors";
import { fontFamily } from "../../../lib/native-theme";
import type { NativeColorScheme } from "../../../lib/native-theme";

export interface ExchangeRateDisclosureProps {
  sendCurrency: string;
  receiveCurrency: string;
  /** Exact rate string as provided — do not calculate. */
  rate: string;
  providerName?: string;
  footnote?: string;
  scheme?: NativeColorScheme;
}

export function ExchangeRateDisclosure({
  sendCurrency,
  receiveCurrency,
  rate,
  providerName,
  footnote,
  scheme = "dark",
}: ExchangeRateDisclosureProps) {
  const colors = useColors(scheme);

  return (
    <View
      style={styles.container}
      accessible
      accessibilityLabel={`Exchange rate: 1 ${sendCurrency} = ${rate} ${receiveCurrency}${providerName ? ` via ${providerName}` : ""}`}
    >
      <Text
        style={[styles.rate, { fontFamily: fontFamily.sans.regular, color: colors.mutedForeground }]}
        accessibilityElementsHidden
      >
        1 {sendCurrency} = {" "}
        <Text style={[styles.rateValue, { fontFamily: fontFamily.serif.medium, color: colors.foreground }]}>
          {rate}
        </Text>
        {" "}{receiveCurrency}
      </Text>
      {providerName ? (
        <Text style={[styles.provider, { fontFamily: fontFamily.sans.regular, color: colors.mutedForeground }]}>
          via {providerName}
        </Text>
      ) : null}
      {footnote ? (
        <Text style={[styles.footnote, { fontFamily: fontFamily.sans.regular, color: colors.mutedForeground }]}>
          {footnote}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 2 },
  rate: { fontSize: 14 },
  rateValue: { fontSize: 18 },
  provider: { fontSize: 12 },
  footnote: { fontSize: 11, marginTop: 2 },
});

export default ExchangeRateDisclosure;
