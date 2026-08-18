/**
 * Design-system IconButton for React Native.
 * Circular/square pressable for icon-only actions.
 * accessibilityLabel is required — screen readers need this.
 */
import React from "react";
import { Pressable, View, StyleSheet } from "react-native";
import { useColors } from "../../hooks/use-colors";
import type { NativeColorScheme } from "../../lib/native-theme";

export type IconButtonSize = "sm" | "md" | "lg";
export type IconButtonVariant = "ghost" | "outline" | "primary";

const MIN_TOUCH = 48;

const sizeMap: Record<IconButtonSize, number> = {
  sm: Math.max(32, MIN_TOUCH),
  md: Math.max(40, MIN_TOUCH),
  lg: Math.max(48, MIN_TOUCH),
};

export interface IconButtonProps {
  icon: React.ReactNode;
  size?: IconButtonSize;
  variant?: IconButtonVariant;
  disabled?: boolean;
  onPress: () => void;
  accessibilityLabel: string; // required — never optional
  scheme?: NativeColorScheme;
}

export function IconButton({
  icon,
  size = "md",
  variant = "ghost",
  disabled = false,
  onPress,
  accessibilityLabel,
  scheme = "dark",
}: IconButtonProps) {
  const colors = useColors(scheme);
  const dim = sizeMap[size];

  const bg =
    variant === "primary"
      ? colors.primary
      : variant === "outline"
        ? "transparent"
        : "transparent";

  const border = variant === "outline" ? colors.border : "transparent";

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.base,
        {
          width: dim,
          height: dim,
          backgroundColor: bg,
          borderColor: border,
          borderWidth: variant === "outline" ? 1 : 0,
          opacity: disabled ? 0.38 : pressed ? 0.75 : 1,
        },
      ]}
    >
      <View style={styles.iconWrap}>{icon}</View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  iconWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
});

export default IconButton;
