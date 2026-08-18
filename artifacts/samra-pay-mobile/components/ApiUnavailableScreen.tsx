import React from "react";
import { Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@workspace/samra-pay-ds/hooks/use-colors";
import { nativeTheme } from "@workspace/samra-pay-ds/lib/native-theme";

export function ApiUnavailableScreen({
  title,
  detail,
}: {
  title: string;
  detail: string;
}) {
  const colors = useColors("dark");
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <ScrollView
      testID="api-unavailable-screen"
      style={[styles.root, { backgroundColor: colors.background }]}
      contentContainerStyle={{
        paddingTop: topInset + 12,
        paddingBottom: bottomInset + 100,
      }}
    >
      <Text style={[styles.eyebrow, { color: colors.primary }]}>
        API MODE · SYNTHETIC DATA
      </Text>
      <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <View style={[styles.icon, { backgroundColor: colors.secondary }]}>
          <Feather name="slash" size={20} color={colors.mutedForeground} />
        </View>
        <Text style={[styles.cardTitle, { color: colors.foreground }]}>
          Not connected in API mode
        </Text>
        <Text style={[styles.detail, { color: colors.mutedForeground }]}>
          {detail}
        </Text>
      </View>
      <Text style={[styles.note, { color: colors.mutedForeground }]}>
        No mock financial data is shown in API mode.
      </Text>
    </ScrollView>
  );
}

const font = nativeTheme.fontFamily;

const styles = StyleSheet.create({
  root: { flex: 1 },
  eyebrow: {
    fontFamily: font.sans.bold,
    fontSize: 10,
    letterSpacing: 1.1,
    marginHorizontal: 20,
    marginBottom: 8,
  },
  title: {
    fontFamily: font.serif.semibold,
    fontSize: 30,
    marginHorizontal: 20,
    marginBottom: 18,
  },
  card: {
    marginHorizontal: 20,
    borderRadius: 18,
    borderWidth: 1,
    padding: 24,
    alignItems: "center",
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  cardTitle: { fontFamily: font.sans.semibold, fontSize: 16 },
  detail: {
    fontFamily: font.sans.regular,
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
    marginTop: 7,
  },
  note: {
    fontFamily: font.sans.regular,
    fontSize: 10,
    textAlign: "center",
    marginHorizontal: 32,
    marginTop: 16,
  },
});
