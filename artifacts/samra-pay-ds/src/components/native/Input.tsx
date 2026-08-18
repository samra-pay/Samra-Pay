/**
 * Design-system Input for React Native.
 * States: default, focused (gold border), error (destructive border), disabled.
 */
import React, { useState } from "react";
import {
  TextInput,
  View,
  Text,
  StyleSheet,
  type TextInputProps,
  type KeyboardTypeOptions,
} from "react-native";
import { useColors } from "../../hooks/use-colors";
import { fontFamily } from "../../lib/native-theme";
import type { NativeColorScheme } from "../../lib/native-theme";

export interface InputProps {
  value?: string;
  onChangeText?: (text: string) => void;
  placeholder?: string;
  label?: string;
  error?: string;
  disabled?: boolean;
  secureTextEntry?: boolean;
  keyboardType?: KeyboardTypeOptions;
  accessibilityLabel?: string;
  multiline?: boolean;
  scheme?: NativeColorScheme;
}

export function Input({
  value,
  onChangeText,
  placeholder,
  label,
  error,
  disabled = false,
  secureTextEntry = false,
  keyboardType = "default",
  accessibilityLabel,
  multiline = false,
  scheme = "dark",
}: InputProps) {
  const colors = useColors(scheme);
  const [focused, setFocused] = useState(false);

  const borderColor = error
    ? colors.destructive
    : focused
      ? colors.primary
      : colors.border;

  return (
    <View style={styles.container}>
      {label ? (
        <Text
          style={[
            styles.label,
            {
              fontFamily: fontFamily.sans.medium,
              color: error ? colors.destructive : colors.mutedForeground,
            },
          ]}
          accessibilityElementsHidden
        >
          {label}
        </Text>
      ) : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        editable={!disabled}
        multiline={multiline}
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityState={{ disabled }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          styles.input,
          {
            fontFamily: fontFamily.sans.regular,
            color: colors.foreground,
            backgroundColor: colors.input,
            borderColor,
            opacity: disabled ? 0.38 : 1,
            minHeight: multiline ? 80 : 48,
          },
        ]}
      />
      {error ? (
        <Text
          style={[
            styles.error,
            {
              fontFamily: fontFamily.sans.regular,
              color: colors.destructive,
            },
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
  container: {
    gap: 4,
  },
  label: {
    fontSize: 13,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  error: {
    fontSize: 12,
    marginTop: 2,
  },
});

export default Input;
