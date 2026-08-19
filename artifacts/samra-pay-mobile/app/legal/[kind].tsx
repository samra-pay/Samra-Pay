import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  getSamraLegalDocument,
  parseSamraLegalKind,
} from "@workspace/samra-client/legal";
import { useColors } from "@workspace/samra-pay-ds/hooks/use-colors";
import { nativeTheme } from "@workspace/samra-pay-ds/lib/native-theme";

export default function MobileLegalDocumentScreen() {
  const colors = useColors("dark");
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ kind?: string | string[] }>();
  const kind = parseSamraLegalKind(params.kind);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/login");
  };

  if (!kind) {
    return (
      <View
        accessibilityRole="alert"
        style={[styles.fallback, { backgroundColor: colors.background }]}
      >
        <Text style={[styles.fallbackTitle, { color: colors.foreground }]}>
          Document unavailable
        </Text>
        <Text style={[styles.body, { color: colors.mutedForeground }]}>
          This legal document reference is not recognized.
        </Text>
        <BackButton onPress={goBack} />
      </View>
    );
  }

  const document = getSamraLegalDocument(kind);

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 },
      ]}
    >
      <BackButton onPress={goBack} />
      <Text style={[styles.eyebrow, { color: colors.primary }]}>
        {document.eyebrow.toUpperCase()}
      </Text>
      <Text
        accessibilityRole="header"
        style={[styles.title, { color: colors.foreground }]}
      >
        {document.title}
      </Text>
      <Text style={[styles.intro, { color: colors.mutedForeground }]}>
        {document.intro}
      </Text>

      <View style={[styles.sections, { borderTopColor: colors.border }]}>
        {document.sections.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text
              accessibilityRole="header"
              style={[styles.sectionTitle, { color: colors.foreground }]}
            >
              {section.title}
            </Text>
            <Text style={[styles.body, { color: colors.mutedForeground }]}>
              {section.body}
            </Text>
          </View>
        ))}
      </View>

      <Text
        style={[
          styles.disclaimer,
          { color: colors.mutedForeground, borderTopColor: colors.border },
        ]}
      >
        Last updated {document.lastUpdated}. {document.disclaimer}
      </Text>
    </ScrollView>
  );
}

function BackButton({ onPress }: { onPress: () => void }) {
  const colors = useColors("dark");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Go back"
      onPress={onPress}
      style={({ pressed }) => [
        styles.backButton,
        { opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <Feather
        accessibilityElementsHidden
        name="arrow-left"
        size={18}
        color={colors.primary}
      />
      <Text style={[styles.backText, { color: colors.primary }]}>Back</Text>
    </Pressable>
  );
}

const font = nativeTheme.fontFamily;

const styles = StyleSheet.create({
  content: { paddingHorizontal: 24 },
  backButton: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 8,
    marginBottom: 30,
  },
  backText: { fontFamily: font.sans.semibold, fontSize: 14 },
  eyebrow: {
    fontFamily: font.sans.semibold,
    fontSize: 11,
    letterSpacing: 1.8,
  },
  title: {
    fontFamily: font.serif.semibold,
    fontSize: 34,
    lineHeight: 41,
    marginTop: 12,
  },
  intro: {
    fontFamily: font.sans.regular,
    fontSize: 16,
    lineHeight: 25,
    marginTop: 18,
  },
  sections: { borderTopWidth: 1, marginTop: 30, paddingTop: 8 },
  section: { marginTop: 24 },
  sectionTitle: {
    fontFamily: font.serif.semibold,
    fontSize: 23,
    lineHeight: 29,
  },
  body: {
    fontFamily: font.sans.regular,
    fontSize: 14,
    lineHeight: 22,
    marginTop: 8,
  },
  disclaimer: {
    borderTopWidth: 1,
    fontFamily: font.sans.regular,
    fontSize: 11,
    lineHeight: 18,
    marginTop: 36,
    paddingTop: 18,
  },
  fallback: { flex: 1, justifyContent: "center", padding: 24 },
  fallbackTitle: { fontFamily: font.serif.semibold, fontSize: 28 },
});
