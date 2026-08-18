/**
 * Design-system Badge for React Native.
 * Variants: default, primary (gold), secondary, destructive, success, warning, outline.
 */
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useColors } from "../../hooks/use-colors";
import { fontFamily } from "../../lib/native-theme";
import type { NativeColorScheme } from "../../lib/native-theme";

export type BadgeVariant =
  | "default"
  | "primary"
  | "secondary"
  | "destructive"
  | "success"
  | "warning"
  | "outline";

export type BadgeSize = "sm" | "md";

export interface BadgeProps {
  variant?: BadgeVariant;
  size?: BadgeSize;
  children: React.ReactNode;
  scheme?: NativeColorScheme;
}

export function Badge({
  variant = "default",
  size = "md",
  children,
  scheme = "dark",
}: BadgeProps) {
  const colors = useColors(scheme);

  const variantStyles: Record<BadgeVariant, { bg: string; fg: string; border?: string }> = {
    default: { bg: colors.muted, fg: colors.mutedForeground },
    primary: { bg: colors.primary, fg: colors.primaryForeground },
    secondary: { bg: colors.secondary, fg: colors.secondaryForeground },
    destructive: { bg: colors.destructive, fg: colors.destructiveForeground },
    success: { bg: colors.eucalyptus, fg: colors.eucalyptusForeground },
    warning: { bg: colors.berbere, fg: colors.berbereForeground },
    outline: { bg: "transparent", fg: colors.foreground, border: colors.border },
  };

  const vs = variantStyles[variant];
  const fontSize = size === "sm" ? 10 : 12;
  const paddingH = size === "sm" ? 6 : 8;
  const paddingV = size === "sm" ? 2 : 3;

  return (
    <View
      style={[
        styles.base,
        {
          backgroundColor: vs.bg,
          borderColor: vs.border ?? "transparent",
          borderWidth: variant === "outline" ? 1 : 0,
          paddingHorizontal: paddingH,
          paddingVertical: paddingV,
        },
      ]}
    >
      <Text
        style={[
          styles.text,
          {
            fontFamily: fontFamily.sans.medium,
            fontSize,
            color: vs.fg,
          },
        ]}
        numberOfLines={1}
      >
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 100,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
  },
  text: {
    letterSpacing: 0.1,
  },
});

export default Badge;
