/**
 * TransferStatus — Status display for a transfer.
 * Always shows text status + icon — never color alone.
 * Always shows transferId as visible reference for support.
 */
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Card } from "../Card";
import { StatusBadge } from "../StatusBadge";
import { Button } from "../Button";
import { useColors } from "../../../hooks/use-colors";
import { fontFamily } from "../../../lib/native-theme";
import type { NativeColorScheme } from "../../../lib/native-theme";
import type { FinancialStatus } from "../StatusBadge";

export type TransferStatusValue = FinancialStatus;

export interface TransferAction {
  label: string;
  onPress: () => void;
}

export interface TransferStatusProps {
  status: TransferStatusValue;
  transferId: string;
  title: string;
  subtitle?: string;
  actions?: TransferAction[];
  scheme?: NativeColorScheme;
}

export function TransferStatus({
  status,
  transferId,
  title,
  subtitle,
  actions = [],
  scheme = "dark",
}: TransferStatusProps) {
  const colors = useColors(scheme);

  return (
    <Card variant="elevated" padding="lg" scheme={scheme}>
      <View style={styles.container} accessible accessibilityLabel={`Transfer ${status}: ${title}. Reference: ${transferId}`}>
        <StatusBadge status={status} size="md" scheme={scheme} />
        <Text
          style={[styles.title, { fontFamily: fontFamily.sans.semibold, color: colors.foreground }]}
          accessibilityRole="header"
        >
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { fontFamily: fontFamily.sans.regular, color: colors.mutedForeground }]}>
            {subtitle}
          </Text>
        ) : null}
        {/* Transfer ID — always visible for support reference */}
        <View style={[styles.refRow, { backgroundColor: colors.muted }]}>
          <Text style={[styles.refLabel, { fontFamily: fontFamily.sans.regular, color: colors.mutedForeground }]}>
            Reference
          </Text>
          <Text
            style={[styles.refId, { fontFamily: fontFamily.mono, color: colors.foreground }]}
            selectable
            accessibilityLabel={`Transfer reference: ${transferId}`}
          >
            {transferId}
          </Text>
        </View>
        {actions.length > 0 ? (
          <View style={styles.actions}>
            {actions.map((action, i) => (
              <Button
                key={i}
                variant={i === 0 ? "primary" : "outline"}
                size="md"
                onPress={action.onPress}
                accessibilityLabel={action.label}
              >
                {action.label}
              </Button>
            ))}
          </View>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  title: { fontSize: 20 },
  subtitle: { fontSize: 14, lineHeight: 20 },
  refRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 10,
    borderRadius: 6,
  },
  refLabel: { fontSize: 12 },
  refId: { fontSize: 13 },
  actions: { gap: 8, marginTop: 4 },
});

export default TransferStatus;
