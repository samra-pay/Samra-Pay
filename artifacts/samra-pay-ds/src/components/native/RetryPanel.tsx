/**
 * Design-system RetryPanel for React Native.
 * Compact retry affordance — not a full-screen state.
 */
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Button } from "./Button";
import { useColors } from "../../hooks/use-colors";
import { fontFamily } from "../../lib/native-theme";
import type { NativeColorScheme } from "../../lib/native-theme";

export interface RetryPanelProps {
  message?: string;
  onRetry: () => void;
  retryLabel?: string;
  scheme?: NativeColorScheme;
}

export function RetryPanel({
  message = "Something went wrong",
  onRetry,
  retryLabel = "Retry",
  scheme = "dark",
}: RetryPanelProps) {
  const colors = useColors(scheme);

  return (
    <View
      style={[styles.container, { backgroundColor: colors.card, borderColor: colors.border }]}
      accessibilityRole="alert"
    >
      <Text
        style={[styles.message, { fontFamily: fontFamily.sans.regular, color: colors.mutedForeground }]}
      >
        {message}
      </Text>
      <Button
        variant="outline"
        size="sm"
        onPress={onRetry}
        accessibilityLabel={retryLabel}
      >
        {retryLabel}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
  },
  message: { fontSize: 13, flex: 1 },
});

export default RetryPanel;
