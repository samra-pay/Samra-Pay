/**
 * Design-system EmptyState for React Native.
 */
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Button } from "./Button";
import { useColors } from "../../hooks/use-colors";
import { fontFamily } from "../../lib/native-theme";
import type { NativeColorScheme } from "../../lib/native-theme";

export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: { label: string; onPress: () => void };
  scheme?: NativeColorScheme;
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  scheme = "dark",
}: EmptyStateProps) {
  const colors = useColors(scheme);

  return (
    <View style={styles.container} accessible accessibilityRole="none">
      {icon ? <View style={styles.icon}>{icon}</View> : null}
      <Text
        style={[styles.title, { fontFamily: fontFamily.sans.semibold, color: colors.foreground }]}
        accessibilityRole="header"
      >
        {title}
      </Text>
      {description ? (
        <Text
          style={[styles.description, { fontFamily: fontFamily.sans.regular, color: colors.mutedForeground }]}
        >
          {description}
        </Text>
      ) : null}
      {action ? (
        <Button
          variant="primary"
          size="md"
          onPress={action.onPress}
          accessibilityLabel={action.label}
          style={styles.action}
        >
          {action.label}
        </Button>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 48,
    gap: 12,
  },
  icon: { marginBottom: 4 },
  title: { fontSize: 18, textAlign: "center" },
  description: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  action: { marginTop: 8 },
});

export default EmptyState;
