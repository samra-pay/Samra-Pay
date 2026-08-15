import React, { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import * as Haptics from 'expo-haptics';
import { Feather } from '@expo/vector-icons';
import { SamraLogo } from '@/components/SamraLogo';
import { useAuth } from '@/context/AuthContext';
import { useColors } from '@workspace/samra-pay-ds/hooks/use-colors';
import { nativeTheme } from '@workspace/samra-pay-ds/lib/native-theme';

export default function LoginScreen() {
  const colors = useColors('dark');
  const insets = useSafeAreaInsets();
  const { signIn } = useAuth();
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const bottomInset = Platform.OS === 'web' ? 34 : insets.bottom;

  const handleSignIn = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Enter any email and password to explore the demo.');
      return;
    }
    setError(null);
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await new Promise((r) => setTimeout(r, 600));
    await signIn();
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

        <View style={styles.form}>
          <View style={[styles.inputWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="mail" size={18} color={colors.mutedForeground} />
            <TextInput
              testID="login-email"
              style={[styles.input, { color: colors.foreground }]}
              placeholder="Email"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={(t) => {
                setEmail(t);
                if (error) setError(null);
              }}
            />
          </View>
          <View style={[styles.inputWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="lock" size={18} color={colors.mutedForeground} />
            <TextInput
              testID="login-password"
              style={[styles.input, { color: colors.foreground }]}
              placeholder="Password"
              placeholderTextColor={colors.mutedForeground}
              secureTextEntry
              value={password}
              onChangeText={(t) => {
                setPassword(t);
                if (error) setError(null);
              }}
            />
          </View>

          {error ? (
            <Text style={[styles.error, { color: colors.destructiveForeground }]}>{error}</Text>
          ) : null}

          <Pressable
            testID="login-submit"
            onPress={handleSignIn}
            disabled={loading}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: colors.primary, opacity: pressed || loading ? 0.8 : 1 },
            ]}
          >
            {loading ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Sign in</Text>
            )}
          </Pressable>
        </View>

        <View style={[styles.demoNote, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <Feather name="info" size={14} color={colors.primary} />
          <Text style={[styles.demoNoteText, { color: colors.mutedForeground }]}>
            This is a product demo. Any email and password will sign you in — no real account is
            created.
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
    alignItems: 'center',
  },
  tagline: {
    fontFamily: font.serif.mediumItalic,
    fontSize: 17,
    marginTop: 10,
    marginBottom: 48,
  },
  form: {
    width: '100%',
    gap: 14,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    height: 54,
    gap: 12,
  },
  input: {
    flex: 1,
    fontFamily: font.sans.regular,
    fontSize: 15,
  },
  error: {
    fontFamily: font.sans.regular,
    fontSize: 13,
  },
  button: {
    height: 54,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  buttonText: {
    fontFamily: font.sans.semibold,
    fontSize: 16,
  },
  demoNote: {
    flexDirection: 'row',
    gap: 10,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginTop: 32,
    alignItems: 'flex-start',
  },
  demoNoteText: {
    flex: 1,
    fontFamily: font.sans.regular,
    fontSize: 12,
    lineHeight: 17,
  },
});
