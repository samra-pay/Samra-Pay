/**
 * RecipientCard — Recipient summary.
 * Presentation only.
 */
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Card } from "../Card";
import { useColors } from "../../../hooks/use-colors";
import { fontFamily } from "../../../lib/native-theme";
import type { NativeColorScheme } from "../../../lib/native-theme";

export interface RecipientCardProps {
  name: string;
  accountType?: string;
  /** Masked account identifier, e.g. "•••• 4321" */
  accountIdentifier: string;
  bank?: string;
  country: string;
  flag?: React.ReactNode;
  scheme?: NativeColorScheme;
}

export function RecipientCard({
  name,
  accountType,
  accountIdentifier,
  bank,
  country,
  flag,
  scheme = "dark",
}: RecipientCardProps) {
  const colors = useColors(scheme);

  return (
    <Card variant="outlined" padding="md" scheme={scheme}>
      <View style={styles.container} accessible accessibilityLabel={`Recipient: ${name}, ${country}`}>
        {flag ? <View style={styles.flag}>{flag}</View> : null}
        <View style={styles.content}>
          <Text
            style={[styles.name, { fontFamily: fontFamily.sans.semibold, color: colors.foreground }]}
            numberOfLines={1}
          >
            {name}
          </Text>
          <Text
            style={[styles.accountId, { fontFamily: fontFamily.mono, color: colors.mutedForeground }]}
            accessibilityLabel={`Account: ${accountIdentifier}`}
          >
            {accountIdentifier}
          </Text>
          {(accountType || bank) ? (
            <Text style={[styles.meta, { fontFamily: fontFamily.sans.regular, color: colors.mutedForeground }]}>
              {[accountType, bank, country].filter(Boolean).join(" · ")}
            </Text>
          ) : (
            <Text style={[styles.meta, { fontFamily: fontFamily.sans.regular, color: colors.mutedForeground }]}>
              {country}
            </Text>
          )}
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: "row", alignItems: "center", gap: 12 },
  flag: { width: 32 },
  content: { flex: 1, gap: 2 },
  name: { fontSize: 16 },
  accountId: { fontSize: 14, letterSpacing: 1 },
  meta: { fontSize: 12 },
});

export default RecipientCard;
