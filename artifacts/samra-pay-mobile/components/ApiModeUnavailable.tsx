import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { useColors } from "@workspace/samra-pay-ds/hooks/use-colors";
import { nativeTheme } from "@workspace/samra-pay-ds/lib/native-theme";

export function ApiModeUnavailable({ section }: { section: string }) {
  const colors = useColors("dark");
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const topInset = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View
      testID="api-mode-unavailable"
      style={[
        styles.root,
        { backgroundColor: colors.background, paddingTop: topInset + 28 },
      ]}
    >
      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <View style={[styles.icon, { backgroundColor: colors.accent }]}>
          <Feather name="alert-circle" size={24} color={colors.primary} />
        </View>
        <Text style={[styles.title, { color: colors.foreground }]}>
          {section} is not connected in API mode
        </Text>
        <Text style={[styles.body, { color: colors.mutedForeground }]}>
          Mock balances and transactions stay hidden until this section has an
          approved backend contract.
        </Text>
        <Pressable
          onPress={() => router.replace("/(tabs)")}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <Text
            style={[styles.buttonText, { color: colors.primaryForeground }]}
          >
            Return to backend overview
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const font = nativeTheme.fontFamily;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: 20,
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    alignItems: "center",
  },
  icon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    marginTop: 18,
    fontFamily: font.serif.semibold,
    fontSize: 23,
    textAlign: "center",
  },
  body: {
    marginTop: 10,
    fontFamily: font.sans.regular,
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
  },
  button: {
    marginTop: 22,
    minHeight: 48,
    borderRadius: 14,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    fontFamily: font.sans.semibold,
    fontSize: 14,
  },
});
