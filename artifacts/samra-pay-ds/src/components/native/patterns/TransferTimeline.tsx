/**
 * TransferTimeline — Step-by-step transfer progress.
 * Presentation only.
 */
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useColors } from "../../../hooks/use-colors";
import { fontFamily } from "../../../lib/native-theme";
import type { NativeColorScheme } from "../../../lib/native-theme";
import type { FinancialStatus } from "../StatusBadge";

export type StepStatus = FinancialStatus | "pending";

export interface TimelineStep {
  label: string;
  status: StepStatus;
  /** Consumer provides formatted timestamp string, or null if not yet reached. */
  timestamp: string | null;
  description?: string;
}

export interface TransferTimelineProps {
  steps: TimelineStep[];
  scheme?: NativeColorScheme;
}

const stepIcon: Record<string, string> = {
  completed: "✓",
  processing: "⟳",
  pending: "○",
  failed: "✕",
  cancelled: "✕",
  submitted: "↑",
};

const stepColor: Record<string, string> = {
  completed: "#6b9a78",
  processing: "#d4af37",
  pending: "#adadad",
  failed: "#f87171",
  cancelled: "#ef4444",
  submitted: "#e9d99a",
};

export function TransferTimeline({ steps, scheme = "dark" }: TransferTimelineProps) {
  const colors = useColors(scheme);

  return (
    <View style={styles.container}>
      {steps.map((step, index) => {
        const color = stepColor[step.status] ?? "#adadad";
        const icon = stepIcon[step.status] ?? "○";
        const isLast = index === steps.length - 1;

        return (
          <View key={index} style={styles.step}>
            {/* Left: line + dot */}
            <View style={styles.indicator}>
              <View style={[styles.dot, { backgroundColor: color, borderColor: color }]}>
                <Text style={[styles.dotIcon, { color: colors.background }]}>{icon}</Text>
              </View>
              {!isLast ? (
                <View style={[styles.line, { backgroundColor: step.status === "completed" ? color : colors.border }]} />
              ) : null}
            </View>
            {/* Right: content */}
            <View style={[styles.content, isLast ? {} : styles.contentSpaced]}>
              <Text
                style={[
                  styles.label,
                  {
                    fontFamily: fontFamily.sans.semibold,
                    color: step.status === "pending" ? colors.mutedForeground : colors.foreground,
                  },
                ]}
              >
                {step.label}
              </Text>
              {step.timestamp ? (
                <Text style={[styles.timestamp, { fontFamily: fontFamily.sans.regular, color: colors.mutedForeground }]}>
                  {step.timestamp}
                </Text>
              ) : null}
              {step.description ? (
                <Text style={[styles.description, { fontFamily: fontFamily.sans.regular, color: colors.mutedForeground }]}>
                  {step.description}
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 0 },
  step: { flexDirection: "row", gap: 12 },
  indicator: { alignItems: "center", width: 28 },
  dot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  dotIcon: { fontSize: 12, fontWeight: "700" },
  line: { width: 2, flex: 1, minHeight: 24, marginVertical: 4 },
  content: { flex: 1, paddingBottom: 4 },
  contentSpaced: { paddingBottom: 20 },
  label: { fontSize: 14 },
  timestamp: { fontSize: 12, marginTop: 2 },
  description: { fontSize: 12, marginTop: 2, lineHeight: 16 },
});

export default TransferTimeline;
