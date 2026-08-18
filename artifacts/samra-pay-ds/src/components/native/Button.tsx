/**
 * Design-system Button for React Native.
 * Variants: primary (gold), secondary, ghost, outline, destructive.
 * Enforces minimum touch targets from interaction tokens.
 */
import React from "react";
import {
  Pressable,
  Text,
  View,
  StyleSheet,
  type PressableProps,
  type ViewStyle,
} from "react-native";
import { useColors } from "../../hooks/use-colors";
import { fontFamily } from "../../lib/native-theme";
import { Spinner } from "./Spinner";
import type { NativeColorScheme } from "../../lib/native-theme";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "outline" | "destructive";
export type ButtonSize = "sm" | "md" | "lg";

// From interaction tokens: iOS 44pt, Android 48dp — use 48 as safe minimum
const MIN_TOUCH = 48;

const sizeStyles: Record<ButtonSize, { height: number; paddingHorizontal: number; fontSize: number; gap: number }> = {
  sm: { height: Math.max(32, MIN_TOUCH), paddingHorizontal: 12, fontSize: 13, gap: 6 },
  md: { height: Math.max(40, MIN_TOUCH), paddingHorizontal: 16, fontSize: 14, gap: 8 },
  lg: { height: Math.max(48, MIN_TOUCH), paddingHorizontal: 24, fontSize: 16, gap: 8 },
};

export interface ButtonProps extends Omit<PressableProps, "style" | "children"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  accessibilityLabel: string; // required — no optional
  children?: React.ReactNode;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  scheme?: NativeColorScheme;
  /** Optional outer container style override. */
  style?: ViewStyle;
}

export function Button({
  variant = "primary",
  size = "md",
  disabled = false,
  loading = false,
  accessibilityLabel,
  children,
  leftIcon,
  rightIcon,
  scheme = "dark",
  onPress,
  style,
  ...rest
}: ButtonProps) {
  const colors = useColors(scheme);
  const sz = sizeStyles[size];

  const isDisabled = disabled || loading;

  const variantBg: Record<ButtonVariant, string> = {
    primary: colors.primary,
    secondary: colors.secondary,
    ghost: "transparent",
    outline: "transparent",
    destructive: colors.destructive,
  };

  const variantFg: Record<ButtonVariant, string> = {
    primary: colors.primaryForeground,
    secondary: colors.secondaryForeground,
    ghost: colors.foreground,
    outline: colors.foreground,
    destructive: colors.destructiveForeground,
  };

  const variantBorder: Record<ButtonVariant, string | undefined> = {
    primary: undefined,
    secondary: undefined,
    ghost: undefined,
    outline: colors.border,
    destructive: undefined,
  };

  const bg = variantBg[variant];
  const fg = variantFg[variant];
  const border = variantBorder[variant];

  return (
    <Pressable
      onPress={isDisabled ? undefined : onPress}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        {
          height: sz.height,
          paddingHorizontal: sz.paddingHorizontal,
          backgroundColor: bg,
          borderWidth: border ? 1 : 0,
          borderColor: border ?? "transparent",
          opacity: isDisabled ? 0.38 : pressed ? 0.75 : 1,
        },
        style,
      ]}
      {...rest}
    >
      <View style={[styles.content, { gap: sz.gap }]}>
        {loading ? (
          <Spinner size="sm" color={variant === "primary" ? "inverted" : "default"} scheme={scheme} />
        ) : (
          <>
            {leftIcon && <View>{leftIcon}</View>}
            {typeof children === "string" ? (
              <Text
                style={{
                  fontFamily: fontFamily.sans.semibold,
                  fontSize: sz.fontSize,
                  color: fg,
                  letterSpacing: 0,
                }}
                numberOfLines={1}
              >
                {children}
              </Text>
            ) : (
              children
            )}
            {rightIcon && <View>{rightIcon}</View>}
          </>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "row",
    minWidth: MIN_TOUCH,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
});

export default Button;
