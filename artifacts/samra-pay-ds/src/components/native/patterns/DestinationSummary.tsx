/**
 * DestinationSummary — Where money is going.
 * Presentation only.
 */
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Card } from "../Card";
import { useColors } from "../../../hooks/use-colors";
import { fontFamily } from "../../../lib/native-theme";
import type { NativeColorScheme } from "../../../lib/native-theme";

export interface DestinationSummaryProps {
  recipientName: string;
  deliveryMethod: string;
  /** Consumer provides pre-formatted estimated arrival, e.g. "1–2 business days" */
  estimatedArrival: string;
  country: string;
  accountSummary?: string;
  scheme?: NativeColorScheme;
}

export function DestinationSummary({
  recipientName,
  deliveryMethod,
  estimatedArrival,
  country,
  accountSummary,
  scheme = "dark",
}: DestinationSummaryProps) {
  const colors = useColors(scheme);

  return (
    <Card variant="outlined" padding="md" scheme={scheme}>
      <View style={styles.container} accessible accessibilityLabel={`Sending to ${recipientName} in ${country} via ${deliveryMethod}`}>
        <Row label="Recipient" value={recipientName} colors={colors} />
        <Row label="Country" value={country} colors={colors} />
        <Row label="Delivery method" value={deliveryMethod} colors={colors} />
        <Row label="Estimated arrival" value={estimatedArrival} colors={colors} highlight />
        {accountSummary ? <Row label="Account" value={accountSummary} colors={colors} /> : null}
      </View>
    </Card>
  );
}

function Row({
  label,
  value,
  colors,
  highlight = false,
}: {
  label: string;
  value: string;
  colors: ReturnType<typeof useColors>;
  highlight?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text style={[styles.label, { fontFamily: fontFamily.sans.regular, color: colors.mutedForeground }]}>
        {label}
      </Text>
      <Text
        style={[
          styles.value,
          {
            fontFamily: highlight ? fontFamily.sans.semibold : fontFamily.sans.regular,
            color: highlight ? colors.primary : colors.foreground,
          },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 10 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  label: { fontSize: 13, flex: 1 },
  value: { fontSize: 13, flex: 1, textAlign: "right" },
});

export default DestinationSummary;
