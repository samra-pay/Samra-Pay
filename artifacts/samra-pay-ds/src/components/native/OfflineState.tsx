/**
 * Design-system OfflineState for React Native.
 * Dedicated offline UI using offline status token colors.
 */
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Button } from "./Button";
import { useColors } from "../../hooks/use-colors";
import { fontFamily } from "../../lib/native-theme";
import type { NativeColorScheme } from "../../lib/native-theme";

const OFFLINE_FG = "#adadad";
const OFFLINE_BG = "#141414";

export interface OfflineStateProps {
  onRetry?: () => void;
  scheme?: NativeColorScheme;
}

export function OfflineState({ onRetry, scheme = "dark" }: OfflineStateProps) {
  const colors = useColors(scheme);

  return (
    <View
      style={[styles.container, { backgroundColor: OFFLINE_BG }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
      accessible
    >
      <Text style={[styles.icon, { color: OFFLINE_FG }]}>⊗</Text>
      <Text
        style={[styles.title, { fontFamily: fontFamily.sans.semibold, color: colors.foreground }]}
        accessibilityRole="header"
      >
        You are offline
      </Text>
      <Text
        style={[styles.description, { fontFamily: fontFamily.sans.regular, color: OFFLINE_FG }]}
      >
        Check your internet connection and try again.
      </Text>
      {onRetry ? (
        <Button
          variant="outline"
          size="md"
          onPress={onRetry}
          accessibilityLabel="Retry connection"
          style={styles.retryButton}
        >
          Try again
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
    borderRadius: 12,
  },
  icon: { fontSize: 32 },
  title: { fontSize: 18, textAlign: "center" },
  description: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  retryButton: { marginTop: 8 },
});

export default OfflineState;
