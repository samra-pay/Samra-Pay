/**
 * Design-system ListRow for React Native.
 * Standard list row pattern.
 */
import React from "react";
import { Pressable, View, Text, StyleSheet, type ViewStyle } from "react-native";
import { Divider } from "./Divider";
import { useColors } from "../../hooks/use-colors";
import { fontFamily } from "../../lib/native-theme";
import type { NativeColorScheme } from "../../lib/native-theme";

const MIN_TOUCH = 48;

export interface ListRowProps {
  title: string;
  subtitle?: string;
  leftContent?: React.ReactNode;
  rightContent?: React.ReactNode;
  onPress?: () => void;
  divider?: boolean;
  accessibilityLabel?: string;
  scheme?: NativeColorScheme;
  style?: ViewStyle;
}

export function ListRow({
  title,
  subtitle,
  leftContent,
  rightContent,
  onPress,
  divider = true,
  accessibilityLabel,
  scheme = "dark",
  style,
}: ListRowProps) {
  const colors = useColors(scheme);

  const content = (
    <View
      style={[styles.container, { minHeight: MIN_TOUCH }, style]}
    >
      {leftContent ? <View style={styles.leftContent}>{leftContent}</View> : null}
      <View style={styles.textContent}>
        <Text
          style={[styles.title, { fontFamily: fontFamily.sans.medium, color: colors.foreground }]}
          numberOfLines={1}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            style={[styles.subtitle, { fontFamily: fontFamily.sans.regular, color: colors.mutedForeground }]}
            numberOfLines={2}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {rightContent ? <View style={styles.rightContent}>{rightContent}</View> : null}
    </View>
  );

  return (
    <>
      {onPress ? (
        <Pressable
          onPress={onPress}
          accessibilityLabel={accessibilityLabel ?? title}
          accessibilityRole="button"
          style={({ pressed }) => [styles.pressable, { opacity: pressed ? 0.75 : 1 }]}
        >
          {content}
        </Pressable>
      ) : (
        <View accessible accessibilityLabel={accessibilityLabel ?? title}>
          {content}
        </View>
      )}
      {divider ? <Divider scheme={scheme} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  pressable: {},
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  leftContent: { flexShrink: 0 },
  textContent: { flex: 1, gap: 2 },
  title: { fontSize: 15 },
  subtitle: { fontSize: 13, lineHeight: 18 },
  rightContent: { flexShrink: 0 },
});

export default ListRow;
