/**
 * Design-system CurrencyInput for React Native.
 * Presentation wrapper for currency entry. Does NOT do arithmetic.
 * Displays a formatted string with currency symbol prefix.
 * The value prop is displayed as-is — never parsed or reformatted internally.
 */
import React from "react";
import { View, Text, TextInput, StyleSheet } from "react-native";
import { useColors } from "../../hooks/use-colors";
import { fontFamily } from "../../lib/native-theme";
import type { NativeColorScheme } from "../../lib/native-theme";

export interface CurrencyInputProps {
  /** Exact string to display — never parseFloat/toFixed applied internally. */
  value: string;
  currency: string;
  placeholder?: string;
  onChangeText?: (text: string) => void;
  error?: string;
  label?: string;
  accessibilityLabel?: string;
  scheme?: NativeColorScheme;
  disabled?: boolean;
}

export function CurrencyInput({
  value,
  currency,
  placeholder = "0.00",
  onChangeText,
  error,
  label,
  accessibilityLabel,
  scheme = "dark",
  disabled = false,
}: CurrencyInputProps) {
  const colors = useColors(scheme);

  const borderColor = error ? colors.destructive : colors.border;

  return (
    <View style={styles.container}>
      {label ? (
        <Text
          style={[styles.label, { fontFamily: fontFamily.sans.medium, color: colors.mutedForeground }]}
          accessibilityElementsHidden
        >
          {label}
        </Text>
      ) : null}
      <View
        style={[
          styles.inputRow,
          {
            backgroundColor: colors.input,
            borderColor,
            opacity: disabled ? 0.38 : 1,
          },
        ]}
      >
        <Text
          style={[
            styles.currency,
            { fontFamily: fontFamily.sans.semibold, color: colors.primary },
          ]}
          accessibilityElementsHidden
        >
          {currency}
        </Text>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.mutedForeground}
          keyboardType="decimal-pad"
          editable={!disabled}
          accessibilityLabel={accessibilityLabel ?? `${currency} amount`}
          accessibilityState={{ disabled }}
          style={[
            styles.input,
            { fontFamily: fontFamily.sans.regular, color: colors.foreground },
          ]}
        />
      </View>
      {error ? (
        <Text
          style={[styles.error, { fontFamily: fontFamily.sans.regular, color: colors.destructive }]}
          accessibilityRole="alert"
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 4 },
  label: { fontSize: 13, marginBottom: 4 },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    minHeight: 48,
    gap: 8,
  },
  currency: { fontSize: 16 },
  input: { flex: 1, fontSize: 20, paddingVertical: 10 },
  error: { fontSize: 12, marginTop: 2 },
});

export default CurrencyInput;
