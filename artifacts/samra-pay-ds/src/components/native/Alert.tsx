/**
 * Design-system Alert for React Native.
 * Status-aware inline alert (not a popup modal).
 */
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useColors } from "../../hooks/use-colors";
import { fontFamily } from "../../lib/native-theme";
import type { NativeColorScheme } from "../../lib/native-theme";

export type AlertVariant = "info" | "warning" | "error" | "success";

const alertConfig: Record<
  AlertVariant,
  { iconText: string; fgKey: "primary" | "destructive" | "berbere" | "eucalyptus" }
> = {
  info: { iconText: "ℹ", fgKey: "primary" },
  warning: { iconText: "⚠", fgKey: "berbere" },
  error: { iconText: "✕", fgKey: "destructive" },
  success: { iconText: "✓", fgKey: "eucalyptus" },
};

export interface AlertProps {
  variant?: AlertVariant;
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  scheme?: NativeColorScheme;
}

export function Alert({
  variant = "info",
  title,
  description,
  icon,
  scheme = "dark",
}: AlertProps) {
  const colors = useColors(scheme);
  const config = alertConfig[variant];

  const fgColor = colors[config.fgKey as keyof typeof colors] as string;

  const bgMap: Record<AlertVariant, string> = {
    info: colors.accent,
    warning: "#2a1a0f",
    error: "#1f0a0a",
    success: colors.eucalyptusForeground === "#eef6f0" ? "#0d1a10" : "#0d1a10",
  };

  return (
    <View
      style={[styles.container, { backgroundColor: bgMap[variant], borderColor: fgColor }]}
      accessibilityRole="alert"
      accessible
    >
      <View style={styles.iconWrap}>
        {icon ?? (
          <Text style={[styles.icon, { color: fgColor }]}>{config.iconText}</Text>
        )}
      </View>
      <View style={styles.content}>
        {title ? (
          <Text
            style={[styles.title, { fontFamily: fontFamily.sans.semibold, color: colors.foreground }]}
          >
            {title}
          </Text>
        ) : null}
        {description ? (
          <Text
            style={[styles.description, { fontFamily: fontFamily.sans.regular, color: colors.mutedForeground }]}
          >
            {description}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    gap: 10,
    alignItems: "flex-start",
  },
  iconWrap: { marginTop: 1 },
  icon: { fontSize: 16, fontWeight: "700" },
  content: { flex: 1, gap: 2 },
  title: { fontSize: 14 },
  description: { fontSize: 13, lineHeight: 18 },
});

export default Alert;
