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
import { useColors } from '@/hooks/useColors';
import {
  DEMO_DISCLAIMER,
  NOTIFICATION_PREFS,
  SECURITY_ITEMS,
  SETTINGS_PROFILE,
} from '@/lib/mock-data';

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signOut } = useAuth();

  const [prefs, setPrefs] = useState<Record<string, boolean>>(
    Object.fromEntries(NOTIFICATION_PREFS.map((p) => [p.id, p.enabled])),
  );

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
          <Text style={[styles.title, { color: colors.cream }]}>Settings</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Manage your profile and preferences.
          </Text>
        </View>
      </View>

      {/* ── Profile ── */}
      <Text style={[styles.sectionTitle, { color: colors.cream }]}>Profile Information</Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.profileRow}>
          <View style={[styles.avatar, { backgroundColor: colors.accent }]}>
            <Text style={[styles.avatarText, { color: colors.primary }]}>
              {SETTINGS_PROFILE.initials}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.profileName, { color: colors.cream }]}>
              {SETTINGS_PROFILE.firstName} {SETTINGS_PROFILE.lastName}
            </Text>
            <Text style={[styles.profileMeta, { color: colors.mutedForeground }]}>
              Member since {SETTINGS_PROFILE.memberSince}
            </Text>
          </View>
        </View>

        <View style={[styles.fieldRow, { borderTopColor: colors.border }]}>
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Email</Text>
          <Text style={[styles.fieldValue, { color: colors.foreground }]}>
            {SETTINGS_PROFILE.email}
          </Text>
        </View>
        <View style={[styles.fieldRow, { borderTopColor: colors.border }]}>
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Phone</Text>
          <Text style={[styles.fieldValue, { color: colors.foreground }]}>
            {SETTINGS_PROFILE.phone}
          </Text>
        </View>
      </View>

      {/* ── Notifications ── */}
      <Text style={[styles.sectionTitle, { color: colors.cream }]}>Notifications</Text>
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
              thumbColor={colors.cream}
            />
          </View>
        ))}
      </View>

      {/* ── Security ── */}
      <Text style={[styles.sectionTitle, { color: colors.cream }]}>Security</Text>
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
        <Text style={[styles.signOutText, { color: colors.foreground }]}>Sign out</Text>
      </Pressable>

      <Text style={[styles.disclaimer, { color: colors.mutedForeground }]}>{DEMO_DISCLAIMER}</Text>
    </ScrollView>
  );
}

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
    fontFamily: 'EBGaramond_600SemiBold',
    fontSize: 26,
  },
  subtitle: {
    fontFamily: 'Outfit_400Regular',
    fontSize: 12,
    marginTop: 1,
  },
  sectionTitle: {
    fontFamily: 'EBGaramond_600SemiBold',
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
    fontFamily: 'Outfit_700Bold',
    fontSize: 18,
  },
  profileName: {
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 16,
  },
  profileMeta: {
    fontFamily: 'Outfit_400Regular',
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
    fontFamily: 'Outfit_400Regular',
    fontSize: 13,
  },
  fieldValue: {
    fontFamily: 'Outfit_500Medium',
    fontSize: 13,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  toggleLabel: {
    fontFamily: 'Outfit_500Medium',
    fontSize: 14,
  },
  toggleDetail: {
    fontFamily: 'Outfit_400Regular',
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
    fontFamily: 'Outfit_600SemiBold',
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
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 14,
  },
  disclaimer: {
    fontFamily: 'Outfit_400Regular',
    fontSize: 11,
    lineHeight: 16,
    paddingHorizontal: 20,
  },
});
