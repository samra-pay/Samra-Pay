/**
 * Design-system StatusBadge for React Native.
 * Renders a badge with icon description + text for financial statuses.
 * ALWAYS renders both icon placeholder AND text — never color alone.
 */
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useColors } from "../../hooks/use-colors";
import { fontFamily } from "../../lib/native-theme";
import type { NativeColorScheme } from "../../lib/native-theme";

export type FinancialStatus =
  | "neutral"
  | "information"
  | "warning"
  | "submitted"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled"
  | "refundPending"
  | "refunded"
  | "reversed"
  | "stale"
  | "offline"
  | "unavailable";

export type StatusBadgeSize = "sm" | "md";

// Status to display label mapping (consumers can override with `label` prop)
const defaultLabels: Record<FinancialStatus, string> = {
  neutral: "Neutral",
  information: "Info",
  warning: "Warning",
  submitted: "Submitted",
  processing: "Processing",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
  refundPending: "Refund Pending",
  refunded: "Refunded",
  reversed: "Reversed",
  stale: "Stale",
  offline: "Offline",
  unavailable: "Unavailable",
};

// Icon symbols (text-based — avoids third-party icon dependency)
const statusIconText: Record<FinancialStatus, string> = {
  neutral: "○",
  information: "ℹ",
  warning: "⚠",
  submitted: "↑",
  processing: "⟳",
  completed: "✓",
  failed: "✕",
  cancelled: "✕",
  refundPending: "⏱",
  refunded: "↺",
  reversed: "←",
  stale: "⚠",
  offline: "⊗",
  unavailable: "⊘",
};

// Status colors — these mirror the semantic status tokens
const statusColors: Record<FinancialStatus, { fg: string; bg: string }> = {
  neutral: { fg: "#adadad", bg: "#1f1f1f" },
  information: { fg: "#60a5fa", bg: "#1e2a3a" },
  warning: { fg: "#cf6644", bg: "#2a1a0f" },
  submitted: { fg: "#e9d99a", bg: "#1a1508" },
  processing: { fg: "#d4af37", bg: "#1a1508" },
  completed: { fg: "#6b9a78", bg: "#0d1a10" },
  failed: { fg: "#f87171", bg: "#1f0a0a" },
  cancelled: { fg: "#ef4444", bg: "#1f0a0a" },
  refundPending: { fg: "#cf6644", bg: "#1f1008" },
  refunded: { fg: "#ab7549", bg: "#1a1008" },
  reversed: { fg: "#ab7549", bg: "#1a1008" },
  stale: { fg: "#cf6644", bg: "#1f1208" },
  offline: { fg: "#adadad", bg: "#141414" },
  unavailable: { fg: "#adadad", bg: "#141414" },
};

export interface StatusBadgeProps {
  status: FinancialStatus;
  /** Override the default label text. */
  label?: string;
  size?: StatusBadgeSize;
  scheme?: NativeColorScheme;
}

export function StatusBadge({
  status,
  label,
  size = "md",
  scheme = "dark",
}: StatusBadgeProps) {
  const _colors = useColors(scheme);
  const sc = statusColors[status];
  const displayLabel = label ?? defaultLabels[status];
  const iconText = statusIconText[status];

  const fontSize = size === "sm" ? 10 : 12;
  const paddingH = size === "sm" ? 6 : 10;
  const paddingV = size === "sm" ? 3 : 4;

  return (
    <View
      style={[
        styles.base,
        {
          backgroundColor: sc.bg,
          paddingHorizontal: paddingH,
          paddingVertical: paddingV,
        },
      ]}
      accessible
      accessibilityLabel={`Status: ${displayLabel}`}
      accessibilityRole="text"
    >
      {/* Icon — always shown alongside text, never alone */}
      <Text
        style={[styles.icon, { color: sc.fg, fontSize }]}
        accessibilityElementsHidden
      >
        {iconText}
      </Text>
      {/* Text label — always required, never omit */}
      <Text
        style={[
          styles.label,
          { fontFamily: fontFamily.sans.medium, color: sc.fg, fontSize },
        ]}
        numberOfLines={1}
      >
        {displayLabel}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 100,
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
  },
  icon: { fontWeight: "700" },
  label: { letterSpacing: 0.1 },
});

export default StatusBadge;
