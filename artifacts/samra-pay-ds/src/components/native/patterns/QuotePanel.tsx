/**
 * QuotePanel — Remittance quote display.
 * Presentation only — never calculates rates or fees.
 * Consumer provides isNearExpiry bool (< 60s) and formatted strings.
 */
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Card } from "../Card";
import { Spinner } from "../Spinner";
import { MoneyAmount } from "./MoneyAmount";
import { ExchangeRateDisclosure } from "./ExchangeRateDisclosure";
import { StaleDataNotice } from "./StaleDataNotice";
import { useColors } from "../../../hooks/use-colors";
import { fontFamily } from "../../../lib/native-theme";
import type { NativeColorScheme } from "../../../lib/native-theme";

export interface QuotePanelProps {
  sendAmount: string;
  sendCurrency: string;
  receiveAmount: string;
  receiveCurrency: string;
  /** Exact exchange rate string — do not calculate. */
  exchangeRate: string;
  fee: string;
  feeCurrency: string;
  /** Consumer provides pre-formatted expiry string, e.g. "Expires in 3:45" */
  expiresAt: string;
  isExpired?: boolean;
  isLoading?: boolean;
  /** Consumer signals < 60s remain — shows stale/expiry warning. */
  isNearExpiry?: boolean;
  onRefresh?: () => void;
  scheme?: NativeColorScheme;
}

export function QuotePanel({
  sendAmount,
  sendCurrency,
  receiveAmount,
  receiveCurrency,
  exchangeRate,
  fee,
  feeCurrency,
  expiresAt,
  isExpired = false,
  isLoading = false,
  isNearExpiry = false,
  onRefresh,
  scheme = "dark",
}: QuotePanelProps) {
  const colors = useColors(scheme);

  if (isLoading) {
    return (
      <Card variant="elevated" padding="lg" scheme={scheme}>
        <View style={styles.loadingWrap}>
          <Spinner size="lg" scheme={scheme} accessibilityLabel="Loading quote" />
        </View>
      </Card>
    );
  }

  return (
    <Card variant="elevated" padding="lg" scheme={scheme}>
      {isExpired ? (
        <StaleDataNotice
          message="This quote has expired. Refresh to get a new rate."
          onRefresh={onRefresh}
          scheme={scheme}
        />
      ) : null}
      {isNearExpiry && !isExpired ? (
        <StaleDataNotice
          message={`Rate expires soon — ${expiresAt}`}
          onRefresh={onRefresh}
          scheme={scheme}
        />
      ) : null}

      <View style={styles.row}>
        <View style={styles.col}>
          <Text style={[styles.label, { fontFamily: fontFamily.sans.regular, color: colors.mutedForeground }]}>
            You send
          </Text>
          <MoneyAmount amount={sendAmount} currency={sendCurrency} size="lg" scheme={scheme} />
        </View>
        <Text style={[styles.arrow, { color: colors.primary }]}>→</Text>
        <View style={styles.col}>
          <Text style={[styles.label, { fontFamily: fontFamily.sans.regular, color: colors.mutedForeground }]}>
            They receive
          </Text>
          <MoneyAmount amount={receiveAmount} currency={receiveCurrency} size="lg" treatment="positive" scheme={scheme} />
        </View>
      </View>

      <View style={styles.divider} />

      <ExchangeRateDisclosure
        sendCurrency={sendCurrency}
        receiveCurrency={receiveCurrency}
        rate={exchangeRate}
        scheme={scheme}
      />

      <View style={styles.feeRow}>
        <Text style={[styles.feeLabel, { fontFamily: fontFamily.sans.regular, color: colors.mutedForeground }]}>
          Transfer fee
        </Text>
        <MoneyAmount amount={fee} currency={feeCurrency} size="sm" scheme={scheme} />
      </View>

      {!isNearExpiry && !isExpired ? (
        <Text style={[styles.expiry, { fontFamily: fontFamily.sans.regular, color: colors.mutedForeground }]}>
          {expiresAt}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  loadingWrap: { alignItems: "center", paddingVertical: 32 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  col: { flex: 1, gap: 4 },
  label: { fontSize: 12 },
  arrow: { fontSize: 20, fontWeight: "700" },
  divider: { height: 1, backgroundColor: "#1f1f1f", marginBottom: 12 },
  feeRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 },
  feeLabel: { fontSize: 13 },
  expiry: { fontSize: 11, marginTop: 8, textAlign: "right" },
});

export default QuotePanel;
