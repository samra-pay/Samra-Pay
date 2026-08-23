import React, { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import { SamraLogo } from "@/components/SamraLogo";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@workspace/samra-pay-ds/hooks/use-colors";
import { nativeTheme } from "@workspace/samra-pay-ds/lib/native-theme";
import { useRouter } from "expo-router";

export default function LoginScreen() {
  const colors = useColors("dark");
  const insets = useSafeAreaInsets();
  const { authMode, signIn } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const handleSignIn = async () => {
    setError(null);
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      if (authMode === "disabled") {
        await new Promise((r) => setTimeout(r, 350));
      }
      await signIn();
      router.replace("/onboarding");
    } catch {
      setError(
        authMode === "auth0-native"
          ? "Could not complete secure sign-in. Try again."
          : "Could not start the synthetic session. Try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <KeyboardAwareScrollViewCompat
        contentContainerStyle={[
          styles.content,
          { paddingTop: topInset + 60, paddingBottom: bottomInset + 32 },
        ]}
        keyboardShouldPersistTaps="handled"
        bottomOffset={40}
      >
        <SamraLogo size="xl" />
        <Text style={[styles.tagline, { color: colors.mutedForeground }]}>
          Banking for the Ethiopian diaspora
        </Text>
        <Text
          style={[styles.taglineAmharic, { color: colors.primary }]}
          accessibilityLanguage="am"
        >
          ለዲያስፖራ
        </Text>

        <View style={styles.form}>
          <View
            style={[
              styles.authBoundary,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Feather name="shield" size={20} color={colors.primary} />
            <Text
              style={[
                styles.authBoundaryText,
                { color: colors.mutedForeground },
              ]}
            >
              {authMode === "disabled"
                ? "No email, password, or real account is used. This opens a synthetic onboarding journey only."
                : "Direct password entry is disabled. Sign-in opens Auth0 Universal Login and credentials remain in secure device storage."}
            </Text>
          </View>

          {error ? (
            <Text
              style={[styles.error, { color: colors.destructiveForeground }]}
            >
              {error}
            </Text>
          ) : null}

          <Pressable
            testID="login-submit"
            accessibilityRole="button"
            accessibilityState={{ disabled: loading }}
            onPress={handleSignIn}
            disabled={loading}
            style={({ pressed }) => [
              styles.button,
              {
                backgroundColor: colors.primary,
                opacity: pressed || loading ? 0.8 : 1,
              },
            ]}
          >
            {loading ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <Text
                style={[styles.buttonText, { color: colors.primaryForeground }]}
              >
                {authMode === "disabled"
                  ? "Start synthetic onboarding"
                  : "Continue securely with Auth0"}
              </Text>
            )}
          </Pressable>
        </View>

        <View
          style={[
            styles.demoNote,
            { borderColor: colors.border, backgroundColor: colors.card },
          ]}
        >
          <Feather name="info" size={14} color={colors.primary} />
          <Text
            style={[styles.demoNoteText, { color: colors.mutedForeground }]}
          >
            {authMode === "disabled"
              ? "This is a product demo. Progress is local and no financial capability is created."
              : "Auth0 supplies only a short-lived API access token. The app does not store passwords or tokens in local application storage."}
          </Text>
        </View>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const font = nativeTheme.fontFamily;

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: {
    flexGrow: 1,
    paddingHorizontal: 28,
    alignItems: "center",
  },
  tagline: {
    fontFamily: font.serif.mediumItalic,
    fontSize: 17,
    marginTop: 10,
    marginBottom: 8,
  },
  taglineAmharic: {
    fontFamily: font.ethiopic.regular,
    fontSize: 15,
    lineHeight: 24,
    marginBottom: 40,
  },
  form: {
    width: "100%",
    gap: 14,
  },
  authBoundary: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    gap: 12,
  },
  authBoundaryText: {
    flex: 1,
    fontFamily: font.sans.regular,
    fontSize: 13,
    lineHeight: 20,
  },
  error: {
    fontFamily: font.sans.regular,
    fontSize: 13,
  },
  button: {
    height: 54,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
  },
  buttonText: {
    fontFamily: font.sans.semibold,
    fontSize: 16,
  },
  demoNote: {
    flexDirection: "row",
    gap: 10,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginTop: 32,
    alignItems: "flex-start",
  },
  demoNoteText: {
    flex: 1,
    fontFamily: font.sans.regular,
    fontSize: 12,
    lineHeight: 17,
  },
});
