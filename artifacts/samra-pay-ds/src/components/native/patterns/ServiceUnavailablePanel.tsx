/**
 * ServiceUnavailablePanel — Full or partial service outage UI.
 * Presentation only.
 */
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Button } from "../Button";
import { fontFamily } from "../../../lib/native-theme";
import { useColors } from "../../../hooks/use-colors";
import type { NativeColorScheme } from "../../../lib/native-theme";

const UNAVAILABLE_FG = "#adadad";
const UNAVAILABLE_BG = "#141414";

export interface ServiceUnavailablePanelProps {
  service: string;
  message?: string;
  onRetry?: () => void;
  supportReference?: string;
  scheme?: NativeColorScheme;
}

export function ServiceUnavailablePanel({
  service,
  message,
  onRetry,
  supportReference,
  scheme = "dark",
}: ServiceUnavailablePanelProps) {
  const colors = useColors(scheme);

  return (
    <View
      style={[styles.container, { backgroundColor: UNAVAILABLE_BG }]}
      accessibilityRole="alert"
      accessible
      accessibilityLabel={`${service} is temporarily unavailable`}
    >
      <Text style={[styles.icon, { color: UNAVAILABLE_FG }]}>⊘</Text>
      <Text style={[styles.title, { fontFamily: fontFamily.sans.semibold, color: colors.foreground }]}>
        {service} is temporarily unavailable
      </Text>
      <Text style={[styles.message, { fontFamily: fontFamily.sans.regular, color: UNAVAILABLE_FG }]}>
        {message ?? "We're working to restore service. Please try again later."}
      </Text>
      {supportReference ? (
        <View style={[styles.refRow, { backgroundColor: colors.muted }]}>
          <Text style={[styles.refLabel, { fontFamily: fontFamily.sans.regular, color: colors.mutedForeground }]}>
            Reference
          </Text>
          <Text style={[styles.refId, { fontFamily: fontFamily.mono, color: colors.foreground }]} selectable>
            {supportReference}
          </Text>
        </View>
      ) : null}
      {onRetry ? (
        <Button
          variant="outline"
          size="md"
          onPress={onRetry}
          accessibilityLabel="Retry"
          style={styles.retryBtn}
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
    borderRadius: 12,
    gap: 12,
  },
  icon: { fontSize: 40 },
  title: { fontSize: 18, textAlign: "center" },
  message: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  refRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 10,
    borderRadius: 6,
    width: "100%",
  },
  refLabel: { fontSize: 12 },
  refId: { fontSize: 13 },
  retryBtn: { marginTop: 4 },
});

export default ServiceUnavailablePanel;
