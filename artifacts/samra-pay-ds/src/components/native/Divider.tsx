/**
 * Design-system Divider for React Native.
 * Horizontal or vertical separator.
 */
import React from "react";
import { View, type ViewStyle } from "react-native";
import { useColors } from "../../hooks/use-colors";
import type { NativeColorScheme } from "../../lib/native-theme";

export type DividerOrientation = "horizontal" | "vertical";

export interface DividerProps {
  orientation?: DividerOrientation;
  color?: string;
  thickness?: number;
  spacing?: number;
  style?: ViewStyle;
  scheme?: NativeColorScheme;
}

export function Divider({
  orientation = "horizontal",
  color,
  thickness = 1,
  spacing = 0,
  style,
  scheme = "dark",
}: DividerProps) {
  const colors = useColors(scheme);
  const resolvedColor = color ?? colors.border;

  const dividerStyle: ViewStyle =
    orientation === "horizontal"
      ? {
          height: thickness,
          backgroundColor: resolvedColor,
          marginVertical: spacing,
          alignSelf: "stretch",
        }
      : {
          width: thickness,
          backgroundColor: resolvedColor,
          marginHorizontal: spacing,
          alignSelf: "stretch",
        };

  return (
    <View
      accessible={false}
      importantForAccessibility="no"
      style={[dividerStyle, style]}
    />
  );
}

export default Divider;
