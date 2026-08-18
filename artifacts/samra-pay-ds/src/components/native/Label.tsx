/**
 * Design-system Label for React Native.
 * Small text label for form fields.
 */
import React from "react";
import { Text, type TextProps } from "react-native";
import { useColors } from "../../hooks/use-colors";
import { fontFamily } from "../../lib/native-theme";
import type { NativeColorScheme } from "../../lib/native-theme";

export type LabelVariant = "default" | "muted" | "error";

export interface LabelProps extends Omit<TextProps, "style"> {
  children: React.ReactNode;
  required?: boolean;
  /** Unused on native but provided for API parity with web Label. */
  htmlFor?: string;
  color?: string;
  variant?: LabelVariant;
  scheme?: NativeColorScheme;
  style?: TextProps["style"];
}

export function Label({
  children,
  required = false,
  htmlFor: _htmlFor,
  color,
  variant = "default",
  scheme = "dark",
  style,
  ...rest
}: LabelProps) {
  const colors = useColors(scheme);

  const resolvedColor =
    color ??
    (variant === "error"
      ? colors.destructive
      : variant === "muted"
        ? colors.mutedForeground
        : colors.foreground);

  return (
    <Text
      style={[
        {
          fontFamily: fontFamily.sans.medium,
          fontSize: 13,
          lineHeight: 18,
          color: resolvedColor,
          letterSpacing: 0.1,
        },
        style,
      ]}
      {...rest}
    >
      {children}
      {required ? (
        <Text style={{ color: colors.destructive }}>{" *"}</Text>
      ) : null}
    </Text>
  );
}

export default Label;
