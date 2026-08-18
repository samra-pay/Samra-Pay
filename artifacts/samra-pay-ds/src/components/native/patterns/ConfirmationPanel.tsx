/**
 * ConfirmationPanel — Pre-submission review screen.
 * Shows all values clearly before confirm button.
 * Consumer provides all strings; this component never calculates anything.
 */
import React from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { Button } from "../Button";
import { Spinner } from "../Spinner";
import { Card } from "../Card";
import { MoneyAmount } from "./MoneyAmount";
import { ExchangeRateDisclosure } from "./ExchangeRateDisclosure";
import { Divider } from "../Divider";
import { useColors } from "../../../hooks/use-colors";
import { fontFamily } from "../../../lib/native-theme";
import type { NativeColorScheme } from "../../../lib/native-theme";

export interface ConfirmationPanelProps {
  sendAmount: string;
  sendCurrency: string;
  receiveAmount: string;
  receiveCurrency: string;
  fee: string;
  feeCurrency: string;
  /** Exact rate string — do not calculate. */
  exchangeRate: string;
  /** Consumer provides pre-formatted expiry string. */
  expiresAt: string;
  recipientName: string;
  deliveryMethod: string;
  onConfirm: () => void;
  onBack: () => void;
  isLoading?: boolean;
  /** Regulatory or disclosure text — must be shown before confirmation. */
  disclaimer?: string;
  scheme?: NativeColorScheme;
}

export function ConfirmationPanel({
  sendAmount,
  sendCurrency,
  receiveAmount,
  receiveCurrency,
  fee,
  feeCurrency,
  exchangeRate,
  expiresAt,
  recipientName,
  deliveryMethod,
  onConfirm,
  onBack,
  isLoading = false,
  disclaimer,
  scheme = "dark",
}: ConfirmationPanelProps) {
  const colors = useColors(scheme);

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Text
        style={[styles.heading, { fontFamily: fontFamily.sans.semibold, color: colors.foreground }]}
        accessibilityRole="header"
      >
        Review your transfer
      </Text>
      <Text style={[styles.subheading, { fontFamily: fontFamily.sans.regular, color: colors.mutedForeground }]}>
        Please confirm all details before sending.
      </Text>

      {/* Amount summary */}
      <View style={styles.amountRow}>
        <View style={styles.amountCol}>
          <Text style={[styles.amountLabel, { fontFamily: fontFamily.sans.regular, color: colors.mutedForeground }]}>
            You send
          </Text>
          <MoneyAmount amount={sendAmount} currency={sendCurrency} size="lg" scheme={scheme} />
        </View>
        <Text style={[styles.arrow, { color: colors.primary }]}>→</Text>
        <View style={styles.amountCol}>
          <Text style={[styles.amountLabel, { fontFamily: fontFamily.sans.regular, color: colors.mutedForeground }]}>
            They receive
          </Text>
          <MoneyAmount amount={receiveAmount} currency={receiveCurrency} size="lg" treatment="positive" scheme={scheme} />
        </View>
      </View>

      {/* Details card */}
      <Card variant="outlined" padding="md" scheme={scheme}>
        <ConfirmRow label="Recipient" value={recipientName} colors={colors} />
        <ConfirmRow label="Delivery" value={deliveryMethod} colors={colors} />
        <ConfirmRow label="Transfer fee" value={`${fee} ${feeCurrency}`} colors={colors} />
        <ExchangeRateDisclosure
          sendCurrency={sendCurrency}
          receiveCurrency={receiveCurrency}
          rate={exchangeRate}
          scheme={scheme}
        />
        <Divider scheme={scheme} spacing={4} />
        <ConfirmRow label="Rate expires" value={expiresAt} colors={colors} />
      </Card>

      {/* Disclaimer — required regulatory text */}
      {disclaimer ? (
        <Text style={[styles.disclaimer, { fontFamily: fontFamily.sans.regular, color: colors.mutedForeground }]}>
          {disclaimer}
        </Text>
      ) : null}

      {/* Actions */}
      <View style={styles.actions}>
        <Button
          variant="outline"
          size="lg"
          onPress={onBack}
          accessibilityLabel="Go back"
          disabled={isLoading}
        >
          Back
        </Button>
        <Button
          variant="primary"
          size="lg"
          onPress={onConfirm}
          accessibilityLabel="Confirm and send transfer"
          loading={isLoading}
          disabled={isLoading}
          style={styles.confirmBtn}
        >
          {isLoading ? "" : "Confirm & Send"}
        </Button>
      </View>
    </ScrollView>
  );
}

function ConfirmRow({
  label,
  value,
  colors,
}: {
  label: string;
  value: string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { fontFamily: fontFamily.sans.regular, color: colors.mutedForeground }]}>
        {label}
      </Text>
      <Text style={[styles.rowValue, { fontFamily: fontFamily.sans.regular, color: colors.foreground }]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { gap: 16, padding: 16 },
  heading: { fontSize: 22 },
  subheading: { fontSize: 14 },
  amountRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  amountCol: { flex: 1, gap: 4 },
  amountLabel: { fontSize: 12 },
  arrow: { fontSize: 24, fontWeight: "700" },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  rowLabel: { fontSize: 13, flex: 1 },
  rowValue: { fontSize: 13, flex: 1, textAlign: "right" },
  disclaimer: { fontSize: 12, lineHeight: 18 },
  actions: { flexDirection: "row", gap: 12, marginTop: 8 },
  confirmBtn: { flex: 2 },
});

export default ConfirmationPanel;
