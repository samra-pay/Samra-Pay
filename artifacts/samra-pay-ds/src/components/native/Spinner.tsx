/**
 * Design-system Spinner for React Native.
 * Wraps ActivityIndicator with design-token colors and sizes.
 */
import React from "react";
import { ActivityIndicator, View } from "react-native";
import { useColors } from "../../hooks/use-colors";
import type { NativeColorScheme } from "../../lib/native-theme";

export type SpinnerSize = "sm" | "md" | "lg";
export type SpinnerColor = "default" | "muted" | "inverted";

const sizeMap: Record<SpinnerSize, number> = {
  sm: 16,
  md: 24,
  lg: 36,
};

export interface SpinnerProps {
  size?: SpinnerSize;
  color?: SpinnerColor;
  scheme?: NativeColorScheme;
  accessibilityLabel?: string;
}

export function Spinner({
  size = "md",
  color = "default",
  scheme = "dark",
  accessibilityLabel = "Loading",
}: SpinnerProps) {
  const colors = useColors(scheme);

  const indicatorColor =
    color === "muted"
      ? colors.mutedForeground
      : color === "inverted"
        ? colors.background
        : colors.primary;

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessible
    >
      <ActivityIndicator size={sizeMap[size]} color={indicatorColor} />
    </View>
  );
}

export default Spinner;
