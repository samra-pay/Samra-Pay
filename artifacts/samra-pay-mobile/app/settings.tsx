import React, { useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useLanguage, type Language } from '@/context/LanguageContext';
import { useColors } from '@workspace/samra-pay-ds/hooks/use-colors';
import { nativeTheme } from '@workspace/samra-pay-ds/lib/native-theme';
import {
  DEMO_DISCLAIMER,
  NOTIFICATION_PREFS,
  SECURITY_ITEMS,
  SETTINGS_PROFILE,
} from '@/lib/mock-data';

export default function SettingsScreen() {
  const colors = useColors('dark');
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signOut } = useAuth();
  const { t, language, setLanguage, isAmharic } = useLanguage();

  const [prefs, setPrefs] = useState<Record<string, boolean>>(
    Object.fromEntries(NOTIFICATION_PREFS.map((p) => [p.id, p.enabled])),
  );

  // Per the DS voice-tone guide: Amharic uses the Ethiopic serif, one size
  // down from its English sibling, with relaxed leading.
  const amTitle = isAmharic
    ? { fontFamily: font.ethiopic.semibold, fontSize: 24, lineHeight: 34 }
    : null;
  const amSection = isAmharic
    ? { fontFamily: font.ethiopic.semibold, fontSize: 17, lineHeight: 26 }
    : null;
  const amBody = isAmharic
    ? { fontFamily: font.ethiopic.regular, fontSize: 12, lineHeight: 18 }
    : null;
  const amLabel = isAmharic
    ? { fontFamily: font.ethiopic.semibold, fontSize: 13, lineHeight: 20 }
    : null;

  const LANGUAGE_OPTIONS: { value: Language; label: string; native: boolean }[] = [
    { value: 'en', label: 'English', native: false },
    { value: 'am', label: 'አማርኛ', native: true },
  ];

  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const bottomInset = Platform.OS === 'web' ? 34 : insets.bottom;

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingTop: topInset + 12, paddingBottom: bottomInset + 40 }}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Header ── */}
      <View style={styles.header}>
        <Pressable
          testID="settings-back"
          onPress={() => {
            Haptics.selectionAsync();
            router.back();
          }}
          style={({ pressed }) => [
            styles.backBtn,
            { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Feather name="arrow-left" size={18} color={colors.foreground} />
        </Pressable>
        <View>
          <Text style={[styles.title, { color: colors.foreground }, amTitle]}>
            {t('settings.title')}
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }, amBody]}>
            {t('settings.subtitle')}
          </Text>
        </View>
      </View>

      {/* ── Profile ── */}
      <Text style={[styles.sectionTitle, { color: colors.foreground }, amSection]}>
        {t('settings.profile')}
      </Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.profileRow}>
          <View style={[styles.avatar, { backgroundColor: colors.accent }]}>
            <Text style={[styles.avatarText, { color: colors.primary }]}>
              {SETTINGS_PROFILE.initials}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.profileName, { color: colors.foreground }]}>
              {SETTINGS_PROFILE.firstName} {SETTINGS_PROFILE.lastName}
            </Text>
            <Text style={[styles.profileMeta, { color: colors.mutedForeground }, amBody]}>
              {t('settings.memberSince')} {SETTINGS_PROFILE.memberSince}
            </Text>
          </View>
        </View>

        <View style={[styles.fieldRow, { borderTopColor: colors.border }]}>
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }, amBody]}>
            {t('settings.email')}
          </Text>
          <Text style={[styles.fieldValue, { color: colors.foreground }]}>
            {SETTINGS_PROFILE.email}
          </Text>
        </View>
        <View style={[styles.fieldRow, { borderTopColor: colors.border }]}>
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }, amBody]}>
            {t('settings.phone')}
          </Text>
          <Text style={[styles.fieldValue, { color: colors.foreground }]}>
            {SETTINGS_PROFILE.phone}
          </Text>
        </View>
      </View>

      {/* ── Language ── */}
      <Text style={[styles.sectionTitle, { color: colors.foreground }, amSection]}>
        {t('settings.language')}
      </Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.toggleRow}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={[styles.toggleLabel, { color: colors.foreground }, amLabel]}>
              {t('settings.language')}
            </Text>
            <Text style={[styles.toggleDetail, { color: colors.mutedForeground }, amBody]}>
              {t('settings.languageDetail')}
            </Text>
          </View>
          <View style={[styles.langGroup, { borderColor: colors.border, backgroundColor: colors.secondary }]}>
            {LANGUAGE_OPTIONS.map((opt) => {
              const selected = language === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  testID={`settings-language-${opt.value}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setLanguage(opt.value);
                  }}
                  style={[
                    styles.langOption,
                    selected && { backgroundColor: colors.accent },
                  ]}
                >
                  <Text
                    style={[
                      styles.langOptionText,
                      { color: selected ? colors.primary : colors.mutedForeground },
                      opt.native && { fontFamily: font.ethiopic.semibold, lineHeight: 20 },
                    ]}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>

      {/* ── Notifications ── */}
      <Text style={[styles.sectionTitle, { color: colors.foreground }, amSection]}>
        {t('settings.notifications')}
      </Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {NOTIFICATION_PREFS.map((pref, i) => (
          <View
            key={pref.id}
            style={[
              styles.toggleRow,
              i > 0 && { borderTopWidth: 1, borderTopColor: colors.border },
            ]}
          >
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={[styles.toggleLabel, { color: colors.foreground }]}>{pref.label}</Text>
              <Text style={[styles.toggleDetail, { color: colors.mutedForeground }]}>
                {pref.detail}
              </Text>
            </View>
            <Switch
              value={prefs[pref.id]}
              onValueChange={(v) => {
                Haptics.selectionAsync();
                setPrefs((p) => ({ ...p, [pref.id]: v }));
              }}
              trackColor={{ false: colors.secondary, true: colors.primary }}
              thumbColor={colors.foreground}
            />
          </View>
        ))}
      </View>

      {/* ── Security ── */}
      <Text style={[styles.sectionTitle, { color: colors.foreground }, amSection]}>
        {t('settings.security')}
      </Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {SECURITY_ITEMS.map((item, i) => (
          <Pressable
            key={item.id}
            onPress={() => Haptics.selectionAsync()}
            style={({ pressed }) => [
              styles.securityRow,
              i > 0 && { borderTopWidth: 1, borderTopColor: colors.border },
              { opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <View style={[styles.securityIcon, { backgroundColor: colors.secondary }]}>
              <Feather name={item.icon as never} size={15} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.toggleLabel, { color: colors.foreground }]}>{item.label}</Text>
              <Text style={[styles.toggleDetail, { color: colors.mutedForeground }]}>
                {item.detail}
              </Text>
            </View>
            <Text style={[styles.securityAction, { color: colors.primary }]}>{item.action}</Text>
          </Pressable>
        ))}
      </View>

      {/* ── Sign out ── */}
      <Pressable
        testID="settings-sign-out"
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          signOut();
        }}
        style={({ pressed }) => [
          styles.signOutBtn,
          { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
        ]}
      >
        <Feather name="log-out" size={16} color={colors.destructiveForeground} />
        <Text style={[styles.signOutText, { color: colors.foreground }, amLabel]}>
          {t('settings.signOut')}
        </Text>
      </Pressable>

      <Text style={[styles.disclaimer, { color: colors.mutedForeground }]}>{DEMO_DISCLAIMER}</Text>
    </ScrollView>
  );
}

const font = nativeTheme.fontFamily;

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: font.serif.semibold,
    fontSize: 26,
  },
  subtitle: {
    fontFamily: font.sans.regular,
    fontSize: 12,
    marginTop: 1,
  },
  sectionTitle: {
    fontFamily: font.serif.semibold,
    fontSize: 19,
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  card: {
    marginHorizontal: 20,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 18,
    marginBottom: 26,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 16,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: font.sans.bold,
    fontSize: 18,
  },
  profileName: {
    fontFamily: font.sans.semibold,
    fontSize: 16,
  },
  profileMeta: {
    fontFamily: font.sans.regular,
    fontSize: 12,
    marginTop: 2,
  },
  fieldRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderTopWidth: 1,
  },
  fieldLabel: {
    fontFamily: font.sans.regular,
    fontSize: 13,
  },
  fieldValue: {
    fontFamily: font.sans.medium,
    fontSize: 13,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  toggleLabel: {
    fontFamily: font.sans.medium,
    fontSize: 14,
  },
  toggleDetail: {
    fontFamily: font.sans.regular,
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
  },
  securityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
  },
  securityIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  securityAction: {
    fontFamily: font.sans.semibold,
    fontSize: 13,
  },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 20,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 14,
    marginBottom: 20,
  },
  signOutText: {
    fontFamily: font.sans.semibold,
    fontSize: 14,
  },
  langGroup: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 999,
    padding: 2,
  },
  langOption: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  langOptionText: {
    fontFamily: font.sans.semibold,
    fontSize: 13,
  },
  disclaimer: {
    fontFamily: font.sans.regular,
    fontSize: 11,
    lineHeight: 16,
    paddingHorizontal: 20,
  },
});
