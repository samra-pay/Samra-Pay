/**
 * Design-system Skeleton for React Native.
 * Animated shimmer placeholder for loading states.
 */
import React, { useEffect, useRef } from "react";
import { Animated, View, StyleSheet, type ViewStyle } from "react-native";
import { useColors } from "../../hooks/use-colors";
import type { NativeColorScheme } from "../../lib/native-theme";

export type SkeletonVariant = "text" | "card" | "circle";

export interface SkeletonProps {
  variant?: SkeletonVariant;
  width?: number | string;
  height?: number;
  style?: ViewStyle;
  scheme?: NativeColorScheme;
}

export function Skeleton({
  variant = "text",
  width = "100%",
  height,
  style,
  scheme = "dark",
}: SkeletonProps) {
  const colors = useColors(scheme);
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.4,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  const resolvedHeight = height ?? (variant === "text" ? 16 : variant === "circle" ? 48 : 120);
  const resolvedWidth = variant === "circle" ? resolvedHeight : width;

  const borderRadius =
    variant === "circle"
      ? resolvedHeight / 2
      : variant === "text"
        ? 4
        : 12;

  return (
    <Animated.View
      accessibilityLabel="Loading"
      accessibilityRole="progressbar"
      style={[
        {
          width: resolvedWidth as number,
          height: resolvedHeight,
          borderRadius,
          backgroundColor: colors.muted,
          opacity,
        },
        style,
      ]}
    />
  );
}

export default Skeleton;
