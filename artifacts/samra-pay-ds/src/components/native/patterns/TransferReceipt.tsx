/**
 * TransferReceipt — Completed transfer summary.
 * Presentation only.
 */
import React from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { Card } from "../Card";
import { MoneyAmount } from "./MoneyAmount";
import { ExchangeRateDisclosure } from "./ExchangeRateDisclosure";
import { Divider } from "../Divider";
import { useColors } from "../../../hooks/use-colors";
import { fontFamily } from "../../../lib/native-theme";
import type { NativeColorScheme } from "../../../lib/native-theme";

export interface TransferReceiptProps {
  transferId: string;
  sendAmount: string;
  sendCurrency: string;
  receiveAmount: string;
  receiveCurrency: string;
  fee: string;
  feeCurrency: string;
  /** Exact rate string — do not calculate. */
  exchangeRate: string;
  recipientName: string;
  deliveryMethod: string;
  /** Consumer provides formatted completion time string */
  completedAt: string;
  referenceNumber: string;
  scheme?: NativeColorScheme;
}

export function TransferReceipt({
  transferId,
  sendAmount,
  sendCurrency,
  receiveAmount,
  receiveCurrency,
  fee,
  feeCurrency,
  exchangeRate,
  recipientName,
  deliveryMethod,
  completedAt,
  referenceNumber,
  scheme = "dark",
}: TransferReceiptProps) {
  const colors = useColors(scheme);

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      {/* Header */}
      <View style={styles.header} accessible accessibilityLabel="Transfer complete">
        <Text style={[styles.checkIcon, { color: "#6b9a78" }]}>✓</Text>
        <Text style={[styles.headerTitle, { fontFamily: fontFamily.sans.semibold, color: colors.foreground }]}>
          Transfer complete
        </Text>
        <Text style={[styles.completedAt, { fontFamily: fontFamily.sans.regular, color: colors.mutedForeground }]}>
          {completedAt}
        </Text>
      </View>

      {/* Amount hero */}
      <View style={styles.amountBlock}>
        <Text style={[styles.amountLabel, { fontFamily: fontFamily.sans.regular, color: colors.mutedForeground }]}>
          Amount sent
        </Text>
        <MoneyAmount amount={sendAmount} currency={sendCurrency} size="display" scheme={scheme} />
        <Text style={[styles.receiveLabel, { fontFamily: fontFamily.sans.regular, color: colors.mutedForeground }]}>
          {recipientName} received
        </Text>
        <MoneyAmount amount={receiveAmount} currency={receiveCurrency} size="lg" treatment="positive" scheme={scheme} />
      </View>

      <Card variant="outlined" padding="md" scheme={scheme}>
        <ReceiptRow label="Recipient" value={recipientName} colors={colors} />
        <ReceiptRow label="Delivery method" value={deliveryMethod} colors={colors} />
        <ReceiptRow label="Transfer fee" value={`${fee} ${feeCurrency}`} colors={colors} />
        <ExchangeRateDisclosure
          sendCurrency={sendCurrency}
          receiveCurrency={receiveCurrency}
          rate={exchangeRate}
          scheme={scheme}
        />
        <Divider scheme={scheme} spacing={8} />
        <ReceiptRow label="Reference" value={referenceNumber} colors={colors} mono />
        <ReceiptRow label="Transfer ID" value={transferId} colors={colors} mono />
      </Card>
    </ScrollView>
  );
}

function ReceiptRow({
  label,
  value,
  colors,
  mono = false,
}: {
  label: string;
  value: string;
  colors: ReturnType<typeof useColors>;
  mono?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { fontFamily: fontFamily.sans.regular, color: colors.mutedForeground }]}>
        {label}
      </Text>
      <Text
        style={[
          styles.rowValue,
          {
            fontFamily: mono ? fontFamily.mono : fontFamily.sans.regular,
            color: colors.foreground,
          },
        ]}
        selectable
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { gap: 20, padding: 16 },
  header: { alignItems: "center", gap: 8 },
  checkIcon: { fontSize: 48 },
  headerTitle: { fontSize: 22 },
  completedAt: { fontSize: 13 },
  amountBlock: { alignItems: "center", gap: 8 },
  amountLabel: { fontSize: 13 },
  receiveLabel: { fontSize: 13, marginTop: 8 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingVertical: 4 },
  rowLabel: { fontSize: 13, flex: 1 },
  rowValue: { fontSize: 13, flex: 1, textAlign: "right" },
});

export default TransferReceipt;
