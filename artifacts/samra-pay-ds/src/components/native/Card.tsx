/**
 * Design-system Card for React Native.
 * Variants: default, elevated, outlined.
 */
import React from "react";
import { View, StyleSheet, type ViewProps } from "react-native";
import { useColors, } from "../../hooks/use-colors";
import type { NativeColorScheme } from "../../lib/native-theme";

export type CardVariant = "default" | "elevated" | "outlined";
export type CardPadding = "sm" | "md" | "lg";

const paddingMap: Record<CardPadding, number> = {
  sm: 12,
  md: 16,
  lg: 24,
};

export interface CardProps extends ViewProps {
  variant?: CardVariant;
  padding?: CardPadding;
  children?: React.ReactNode;
  scheme?: NativeColorScheme;
}

export function Card({
  variant = "default",
  padding = "md",
  children,
  scheme = "dark",
  style,
  ...rest
}: CardProps) {
  const colors = useColors(scheme);
  const p = paddingMap[padding];

  const shadow =
    variant === "elevated"
      ? {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.45,
          shadowRadius: 8,
          elevation: 4,
        }
      : {};

  return (
    <View
      style={[
        styles.base,
        {
          backgroundColor: colors.card,
          padding: p,
          borderWidth: variant === "outlined" ? 1 : 0,
          borderColor: variant === "outlined" ? colors.border : "transparent",
          ...shadow,
        },
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 12,
    overflow: "hidden",
  },
});

export default Card;
