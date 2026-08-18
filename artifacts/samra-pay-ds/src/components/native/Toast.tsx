/**
 * Design-system Toast for React Native.
 * Imperative model: ToastProvider + useToast hook + Toast display component.
 * Renders as a Banner at top — not a floating overlay requiring layout measurement.
 */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useColors } from "../../hooks/use-colors";
import { fontFamily } from "../../lib/native-theme";
import type { NativeColorScheme } from "../../lib/native-theme";

export type ToastVariant = "default" | "success" | "warning" | "error";

export interface ToastConfig {
  message: string;
  variant?: ToastVariant;
  duration?: number;
}

interface ToastContextValue {
  show: (config: ToastConfig) => void;
  hide: () => void;
}

const ToastContext = createContext<ToastContextValue>({
  show: () => {},
  hide: () => {},
});

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}

const variantColors: Record<ToastVariant, { fg: string; bg: string }> = {
  default: { fg: "#f5f5f5", bg: "#1a1a1a" },
  success: { fg: "#6b9a78", bg: "#0d1a10" },
  warning: { fg: "#cf6644", bg: "#2a1a0f" },
  error: { fg: "#f87171", bg: "#1f0a0a" },
};

const variantIcon: Record<ToastVariant, string> = {
  default: "ℹ",
  success: "✓",
  warning: "⚠",
  error: "✕",
};

export interface ToastProps {
  message: string;
  variant?: ToastVariant;
  visible: boolean;
  duration?: number;
  onDismiss?: () => void;
  scheme?: NativeColorScheme;
}

export function Toast({
  message,
  variant = "default",
  visible,
  duration = 3000,
  onDismiss,
  scheme = "dark",
}: ToastProps) {
  const _colors = useColors(scheme);
  const vc = variantColors[variant];
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      if (duration > 0 && onDismiss) {
        const timer = setTimeout(onDismiss, duration);
        return () => clearTimeout(timer);
      }
    } else {
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start();
    }
    return undefined;
  }, [visible, duration, onDismiss, opacity]);

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        { backgroundColor: vc.bg, opacity },
      ]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      accessible
    >
      <Text style={[styles.icon, { color: vc.fg }]}>{variantIcon[variant]}</Text>
      <Text
        style={[styles.message, { fontFamily: fontFamily.sans.regular, color: vc.fg }]}
        numberOfLines={3}
      >
        {message}
      </Text>
      {onDismiss ? (
        <Pressable
          onPress={onDismiss}
          accessibilityLabel="Dismiss notification"
          accessibilityRole="button"
          style={({ pressed }) => [styles.dismiss, { opacity: pressed ? 0.75 : 1 }]}
        >
          <Text style={[styles.dismissText, { color: vc.fg }]}>✕</Text>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

// ── Provider ──────────────────────────────────────────────────────────────────

export interface ToastProviderProps {
  children: React.ReactNode;
  scheme?: NativeColorScheme;
}

export function ToastProvider({ children, scheme = "dark" }: ToastProviderProps) {
  const [config, setConfig] = useState<ToastConfig | null>(null);
  const [visible, setVisible] = useState(false);

  const hide = useCallback(() => {
    setVisible(false);
    setConfig(null);
  }, []);

  const show = useCallback(
    (newConfig: ToastConfig) => {
      setConfig(newConfig);
      setVisible(true);
    },
    [],
  );

  return (
    <ToastContext.Provider value={{ show, hide }}>
      {children}
      {config ? (
        <View style={styles.providerWrap} pointerEvents="box-none">
          <Toast
            message={config.message}
            variant={config.variant}
            visible={visible}
            duration={config.duration ?? 3000}
            onDismiss={hide}
            scheme={scheme}
          />
        </View>
      ) : null}
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  icon: { fontSize: 16, fontWeight: "700" },
  message: { flex: 1, fontSize: 14, lineHeight: 20 },
  dismiss: { padding: 4, minWidth: 32, minHeight: 32, alignItems: "center", justifyContent: "center" },
  dismissText: { fontSize: 14 },
  providerWrap: {
    position: "absolute",
    top: 60,
    left: 16,
    right: 16,
    zIndex: 9999,
  },
});

export default Toast;
