/**
 * StaleDataNotice — Inline warning for stale data.
 * Uses stale status token colors.
 */
import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { fontFamily } from "../../../lib/native-theme";
import type { NativeColorScheme } from "../../../lib/native-theme";

const STALE_FG = "#cf6644";
const STALE_BG = "#1f1208";

export interface StaleDataNoticeProps {
  message?: string;
  onRefresh?: () => void;
  scheme?: NativeColorScheme;
}

export function StaleDataNotice({
  message = "This data may be outdated.",
  onRefresh,
  scheme: _scheme = "dark",
}: StaleDataNoticeProps) {
  return (
    <View
      style={[styles.container, { backgroundColor: STALE_BG }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <Text style={[styles.icon, { color: STALE_FG }]}>⚠</Text>
      <Text
        style={[styles.message, { fontFamily: fontFamily.sans.regular, color: STALE_FG }]}
        numberOfLines={3}
      >
        {message}
      </Text>
      {onRefresh ? (
        <Pressable
          onPress={onRefresh}
          accessibilityLabel="Refresh data"
          accessibilityRole="button"
          style={({ pressed }) => [styles.refreshBtn, { opacity: pressed ? 0.75 : 1 }]}
        >
          <Text style={[styles.refreshText, { fontFamily: fontFamily.sans.semibold, color: STALE_FG }]}>
            Refresh
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderRadius: 6,
    gap: 8,
    marginBottom: 8,
  },
  icon: { fontSize: 14 },
  message: { flex: 1, fontSize: 13 },
  refreshBtn: { minHeight: 32, justifyContent: "center" },
  refreshText: { fontSize: 13 },
});

export default StaleDataNotice;
