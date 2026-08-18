/**
 * Design-system Text component for React Native.
 * Applies semantic typography roles from the design token system.
 * All font families reference registered Expo font names from native-theme.tsx.
 */
import React from "react";
import { Text as RNText, type TextProps as RNTextProps } from "react-native";
import { fontFamily } from "../../lib/native-theme";
import { useColors } from "../../hooks/use-colors";
import type { NativeColorScheme } from "../../lib/native-theme";

export type TextVariant =
  | "display-xl"
  | "display-lg"
  | "display-md"
  | "heading-xl"
  | "heading-lg"
  | "heading-md"
  | "heading-sm"
  | "body-lg"
  | "body-md"
  | "body-sm"
  | "label-lg"
  | "label-md"
  | "label-sm"
  | "caption"
  | "numeric-balance"
  | "numeric-amount"
  | "numeric-rate"
  | "ethiopic-display"
  | "ethiopic-heading"
  | "ethiopic-body"
  | "ethiopic-label";

interface VariantStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight: "400" | "500" | "600" | "700";
  lineHeight: number;
  letterSpacing: number;
}

const variantStyles: Record<TextVariant, VariantStyle> = {
  "display-xl": {
    fontFamily: fontFamily.serif.medium,
    fontSize: 72,
    fontWeight: "400",
    lineHeight: 72,
    letterSpacing: -1.44,
  },
  "display-lg": {
    fontFamily: fontFamily.serif.medium,
    fontSize: 60,
    fontWeight: "400",
    lineHeight: 60,
    letterSpacing: -1.2,
  },
  "display-md": {
    fontFamily: fontFamily.serif.medium,
    fontSize: 48,
    fontWeight: "400",
    lineHeight: 50.4,
    letterSpacing: -0.48,
  },
  "heading-xl": {
    fontFamily: fontFamily.sans.semibold,
    fontSize: 36,
    fontWeight: "600",
    lineHeight: 39.6,
    letterSpacing: -0.36,
  },
  "heading-lg": {
    fontFamily: fontFamily.sans.semibold,
    fontSize: 30,
    fontWeight: "600",
    lineHeight: 34.5,
    letterSpacing: -0.3,
  },
  "heading-md": {
    fontFamily: fontFamily.sans.semibold,
    fontSize: 24,
    fontWeight: "600",
    lineHeight: 28.8,
    letterSpacing: 0,
  },
  "heading-sm": {
    fontFamily: fontFamily.sans.semibold,
    fontSize: 20,
    fontWeight: "600",
    lineHeight: 25,
    letterSpacing: 0,
  },
  "body-lg": {
    fontFamily: fontFamily.sans.regular,
    fontSize: 18,
    fontWeight: "400",
    lineHeight: 28.8,
    letterSpacing: 0,
  },
  "body-md": {
    fontFamily: fontFamily.sans.regular,
    fontSize: 16,
    fontWeight: "400",
    lineHeight: 25.6,
    letterSpacing: 0,
  },
  "body-sm": {
    fontFamily: fontFamily.sans.regular,
    fontSize: 14,
    fontWeight: "400",
    lineHeight: 21,
    letterSpacing: 0,
  },
  "label-lg": {
    fontFamily: fontFamily.sans.medium,
    fontSize: 14,
    fontWeight: "500",
    lineHeight: 19.6,
    letterSpacing: 0.14,
  },
  "label-md": {
    fontFamily: fontFamily.sans.medium,
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 18.2,
    letterSpacing: 0.13,
  },
  "label-sm": {
    fontFamily: fontFamily.sans.medium,
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 16.8,
    letterSpacing: 0.12,
  },
  caption: {
    fontFamily: fontFamily.sans.regular,
    fontSize: 11,
    fontWeight: "400",
    lineHeight: 15.4,
    letterSpacing: 0.22,
  },
  "numeric-balance": {
    fontFamily: fontFamily.serif.medium,
    fontSize: 48,
    fontWeight: "500",
    lineHeight: 48,
    letterSpacing: -0.96,
  },
  "numeric-amount": {
    fontFamily: fontFamily.sans.semibold,
    fontSize: 24,
    fontWeight: "600",
    lineHeight: 28.8,
    letterSpacing: -0.24,
  },
  "numeric-rate": {
    fontFamily: fontFamily.serif.medium,
    fontSize: 30,
    fontWeight: "400",
    lineHeight: 33,
    letterSpacing: 0,
  },
  "ethiopic-display": {
    fontFamily: fontFamily.ethiopic.regular,
    fontSize: 48,
    fontWeight: "400",
    lineHeight: 57.6,
    letterSpacing: 0,
  },
  "ethiopic-heading": {
    fontFamily: fontFamily.ethiopic.regular,
    fontSize: 24,
    fontWeight: "400",
    lineHeight: 33.6,
    letterSpacing: 0,
  },
  "ethiopic-body": {
    fontFamily: fontFamily.ethiopic.regular,
    fontSize: 16,
    fontWeight: "400",
    lineHeight: 27.2,
    letterSpacing: 0,
  },
  "ethiopic-label": {
    fontFamily: fontFamily.ethiopic.regular,
    fontSize: 14,
    fontWeight: "400",
    lineHeight: 21,
    letterSpacing: 0,
  },
};

export interface TextProps extends Omit<RNTextProps, "style"> {
  variant?: TextVariant;
  color?: string;
  scheme?: NativeColorScheme;
  style?: RNTextProps["style"];
}

export function Text({
  variant = "body-md",
  color,
  scheme = "dark",
  style,
  allowFontScaling = true,
  ...rest
}: TextProps) {
  const colors = useColors(scheme);
  const vs = variantStyles[variant];

  return (
    <RNText
      allowFontScaling={allowFontScaling}
      style={[
        {
          fontFamily: vs.fontFamily,
          fontSize: vs.fontSize,
          lineHeight: vs.lineHeight,
          letterSpacing: vs.letterSpacing,
          color: color ?? colors.foreground,
        },
        style,
      ]}
      {...rest}
    />
  );
}

export default Text;
