/**
 * Design-system ErrorState for React Native.
 */
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Button } from "./Button";
import { useColors } from "../../hooks/use-colors";
import { fontFamily } from "../../lib/native-theme";
import type { NativeColorScheme } from "../../lib/native-theme";

export interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
  scheme?: NativeColorScheme;
}

export function ErrorState({
  title = "Something went wrong",
  description,
  onRetry,
  retryLabel = "Try again",
  scheme = "dark",
}: ErrorStateProps) {
  const colors = useColors(scheme);

  return (
    <View style={styles.container} accessibilityRole="alert" accessible>
      <Text style={[styles.icon, { color: colors.destructive }]}>⚠</Text>
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
      {onRetry ? (
        <Button
          variant="outline"
          size="md"
          onPress={onRetry}
          accessibilityLabel={retryLabel}
          style={styles.retryButton}
        >
          {retryLabel}
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
  icon: { fontSize: 32 },
  title: { fontSize: 18, textAlign: "center" },
  description: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  retryButton: { marginTop: 8 },
});

export default ErrorState;
