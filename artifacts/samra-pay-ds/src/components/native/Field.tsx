/**
 * Design-system Field for React Native.
 * Composes Label + children (input) + error text.
 */
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Label } from "./Label";
import { useColors } from "../../hooks/use-colors";
import { fontFamily } from "../../lib/native-theme";
import type { NativeColorScheme } from "../../lib/native-theme";

export interface FieldProps {
  label?: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
  scheme?: NativeColorScheme;
}

export function Field({
  label,
  required = false,
  error,
  children,
  scheme = "dark",
}: FieldProps) {
  const colors = useColors(scheme);

  return (
    <View style={styles.container}>
      {label ? (
        <Label required={required} variant={error ? "error" : "default"} scheme={scheme}>
          {label}
        </Label>
      ) : null}
      {children}
      {error ? (
        <Text
          style={[
            styles.errorText,
            { fontFamily: fontFamily.sans.regular, color: colors.destructive },
          ]}
          accessibilityRole="alert"
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 6 },
  errorText: { fontSize: 12, marginTop: 2 },
});

export default Field;
