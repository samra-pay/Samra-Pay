/**
 * Design-system BottomSheet for React Native.
 * Slide-up sheet using Animated + PanResponder — no third-party library.
 * Consumer provides snapPoints (array of heights in px from bottom).
 */
import React, { useEffect, useRef } from "react";
import {
  Animated,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Dimensions,
} from "react-native";
import { useColors } from "../../hooks/use-colors";
import { fontFamily } from "../../lib/native-theme";
import type { NativeColorScheme } from "../../lib/native-theme";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

export interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children?: React.ReactNode;
  /** Heights from bottom in px — first entry is default snap. */
  snapPoints?: number[];
  scheme?: NativeColorScheme;
}

export function BottomSheet({
  visible,
  onClose,
  title,
  children,
  snapPoints = [400],
  scheme = "dark",
}: BottomSheetProps) {
  const colors = useColors(scheme);
  const defaultHeight = snapPoints[0] ?? 400;
  const translateY = useRef(new Animated.Value(defaultHeight)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          damping: 20,
          stiffness: 200,
        }),
        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: defaultHeight,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, translateY, overlayOpacity, defaultHeight]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dy) > 5,
      onPanResponderMove: (_, gs) => {
        if (gs.dy > 0) translateY.setValue(gs.dy);
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > defaultHeight * 0.4 || gs.vy > 0.5) {
          onClose();
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        }
      },
    }),
  ).current;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      {/* Backdrop */}
      <Animated.View style={[styles.backdrop, { opacity: overlayOpacity }]}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} accessibilityLabel="Close sheet" />
      </Animated.View>

      {/* Sheet */}
      <Animated.View
        style={[
          styles.sheet,
          {
            backgroundColor: colors.card,
            height: defaultHeight,
            transform: [{ translateY }],
          },
        ]}
        {...panResponder.panHandlers}
      >
        {/* Handle */}
        <View style={styles.handleContainer}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
        </View>
        {/* Header */}
        {title ? (
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <Text
              style={[styles.title, { fontFamily: fontFamily.sans.semibold, color: colors.foreground }]}
              accessibilityRole="header"
            >
              {title}
            </Text>
          </View>
        ) : null}
        {/* Content */}
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 16,
  },
  handleContainer: {
    alignItems: "center",
    paddingVertical: 12,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  title: { fontSize: 17 },
  body: { padding: 20 },
});

export default BottomSheet;
