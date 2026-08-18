/**
 * Design-system ModalShell for React Native.
 * Wraps React Native Modal with design-system styling.
 * Consumer provides safeAreaInsets via useSafeAreaInsets() — not inferred internally.
 */
import React from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
} from "react-native";

/** Insets from useSafeAreaInsets() (react-native-safe-area-context). Defined locally to avoid the peer dep. */
export interface EdgeInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}
import { useColors } from "../../hooks/use-colors";
import { fontFamily } from "../../lib/native-theme";
import type { NativeColorScheme } from "../../lib/native-theme";

export type ModalSize = "sm" | "md" | "lg";

const modalWidths: Record<ModalSize, number> = {
  sm: 360,
  md: 480,
  lg: 640,
};

export interface ModalShellProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children?: React.ReactNode;
  size?: ModalSize;
  /** Consumer-provided safe area insets from useSafeAreaInsets(). */
  safeAreaInsets?: EdgeInsets;
  scheme?: NativeColorScheme;
}

export function ModalShell({
  visible,
  onClose,
  title,
  children,
  size = "md",
  safeAreaInsets,
  scheme = "dark",
}: ModalShellProps) {
  const colors = useColors(scheme);
  const maxWidth = modalWidths[size];
  const bottomPad = safeAreaInsets?.bottom ?? 0;
  const topPad = safeAreaInsets?.top ?? 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      {/* Overlay */}
      <Pressable
        style={styles.overlay}
        onPress={onClose}
        accessibilityLabel="Close modal"
        accessibilityRole="button"
      >
        {/* Content — stop event propagation to avoid closing when tapping content */}
        <Pressable
          style={[
            styles.sheet,
            {
              backgroundColor: colors.card,
              maxWidth,
              paddingBottom: Math.max(24, bottomPad),
              marginTop: Math.max(60, topPad + 20),
            },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            {title ? (
              <Text
                style={[styles.title, { fontFamily: fontFamily.sans.semibold, color: colors.foreground }]}
                accessibilityRole="header"
              >
                {title}
              </Text>
            ) : (
              <View style={{ flex: 1 }} />
            )}
            <Pressable
              onPress={onClose}
              accessibilityLabel="Close"
              accessibilityRole="button"
              style={({ pressed }) => [styles.closeBtn, { opacity: pressed ? 0.75 : 1 }]}
            >
              <Text style={[styles.closeText, { color: colors.mutedForeground }]}>✕</Text>
            </Pressable>
          </View>
          {/* Body */}
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-start",
    alignItems: "center",
  },
  sheet: {
    width: "90%",
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 32,
    elevation: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  title: { fontSize: 17, flex: 1 },
  closeBtn: { padding: 4, minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  closeText: { fontSize: 16 },
  body: { padding: 20 },
});

export default ModalShell;
