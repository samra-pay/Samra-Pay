import React from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { SamraLogo } from '@/components/SamraLogo';
import { useAuth } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';
import {
  CHECKING_BALANCE,
  DEMO_DISCLAIMER,
  PROFILE,
  RECENT_TRANSACTIONS,
  SPENDING_DATA,
  formatUsd,
} from '@/lib/mock-data';

const QUICK_ACTIONS = [
  { id: 'send', label: 'Send', icon: 'send' },
  { id: 'pay', label: 'Pay bill', icon: 'file-text' },
  { id: 'cards', label: 'Cards', icon: 'credit-card' },
  { id: 'more', label: 'More', icon: 'grid' },
] as const;

export default function DashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { signOut } = useAuth();

  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const bottomInset = Platform.OS === 'web' ? 34 : insets.bottom;
  const totalSpending = SPENDING_DATA.reduce((sum, s) => sum + s.amount, 0);

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingTop: topInset + 12, paddingBottom: bottomInset + 100 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <View>
          <SamraLogo size="md" />
          <Text style={[styles.greeting, { color: colors.mutedForeground }]}>
            Welcome back, {PROFILE.firstName}
          </Text>
        </View>
        <Pressable
          testID="sign-out"
          onPress={signOut}
          style={({ pressed }) => [
            styles.iconButton,
            { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Feather name="log-out" size={17} color={colors.mutedForeground} />
        </Pressable>
      </View>

      <View style={[styles.balanceCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.balanceLabel, { color: colors.mutedForeground }]}>
          CHECKING BALANCE
        </Text>
        <Text style={[styles.balanceValue, { color: colors.cream }]} allowFontScaling={false}>
          {formatUsd(CHECKING_BALANCE)}
        </Text>
        <View style={styles.quickRow}>
          {QUICK_ACTIONS.map((action) => (
            <View key={action.id} style={styles.quickItem}>
              <View style={[styles.quickIcon, { backgroundColor: colors.accent }]}>
                <Feather name={action.icon} size={18} color={colors.primary} />
              </View>
              <Text style={[styles.quickLabel, { color: colors.mutedForeground }]}>
                {action.label}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <Text style={[styles.sectionTitle, { color: colors.cream }]}>Spending this month</Text>
      <View style={[styles.spendCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.spendHeader}>
          <Text style={[styles.spendTotal, { color: colors.cream }]}>{formatUsd(totalSpending)}</Text>
          <Text style={[styles.spendSub, { color: colors.mutedForeground }]}>across 4 categories</Text>
        </View>
        {SPENDING_DATA.map((item) => (
          <View key={item.category} style={styles.spendRow}>
            <View style={[styles.spendIcon, { backgroundColor: colors.secondary }]}>
              <Feather name={item.icon as never} size={15} color={colors.primary} />
            </View>
            <Text style={[styles.spendCategory, { color: colors.foreground }]}>{item.category}</Text>
            <View style={styles.spendBarTrack}>
              <View
                style={[
                  styles.spendBarFill,
                  {
                    backgroundColor: colors.primary,
                    width: `${Math.round((item.amount / totalSpending) * 100)}%`,
                  },
                ]}
              />
            </View>
            <Text style={[styles.spendAmount, { color: colors.mutedForeground }]}>
              {formatUsd(item.amount)}
            </Text>
          </View>
        ))}
      </View>

      <Text style={[styles.sectionTitle, { color: colors.cream }]}>Recent transactions</Text>
      <View style={[styles.txCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {RECENT_TRANSACTIONS.map((tx, i) => (
          <View
            key={tx.id}
            style={[
              styles.txRow,
              i < RECENT_TRANSACTIONS.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
            ]}
          >
            <View style={[styles.txIcon, { backgroundColor: colors.secondary }]}>
              <Feather
                name={tx.amount > 0 ? 'arrow-down-left' : 'arrow-up-right'}
                size={15}
                color={tx.amount > 0 ? colors.green : colors.mutedForeground}
              />
            </View>
            <View style={styles.txInfo}>
              <Text style={[styles.txMerchant, { color: colors.foreground }]}>{tx.merchant}</Text>
              <Text style={[styles.txMeta, { color: colors.mutedForeground }]}>
                {tx.date} · {tx.card}
              </Text>
            </View>
            <View style={styles.txRight}>
              <Text
                style={[
                  styles.txAmount,
                  { color: tx.amount > 0 ? colors.green : colors.foreground },
                ]}
              >
                {formatUsd(tx.amount, { sign: true })}
              </Text>
              {tx.points ? (
                <Text style={[styles.txPoints, { color: colors.primary }]}>{tx.points}</Text>
              ) : null}
            </View>
          </View>
        ))}
      </View>

      <Text style={[styles.disclaimer, { color: colors.mutedForeground }]}>{DEMO_DISCLAIMER}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  greeting: {
    fontFamily: 'Outfit_400Regular',
    fontSize: 13,
    marginTop: 2,
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  balanceCard: {
    marginHorizontal: 20,
    borderRadius: 20,
    borderWidth: 1,
    padding: 22,
    marginBottom: 28,
  },
  balanceLabel: {
    fontFamily: 'Outfit_500Medium',
    fontSize: 10,
    letterSpacing: 2,
    marginBottom: 6,
  },
  balanceValue: {
    fontFamily: 'EBGaramond_600SemiBold',
    fontSize: 44,
    marginBottom: 20,
  },
  quickRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  quickItem: {
    alignItems: 'center',
    gap: 6,
  },
  quickIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLabel: {
    fontFamily: 'Outfit_500Medium',
    fontSize: 11,
  },
  sectionTitle: {
    fontFamily: 'EBGaramond_600SemiBold',
    fontSize: 21,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  spendCard: {
    marginHorizontal: 20,
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
    marginBottom: 28,
    gap: 14,
  },
  spendHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginBottom: 2,
  },
  spendTotal: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 22,
  },
  spendSub: {
    fontFamily: 'Outfit_400Regular',
    fontSize: 12,
  },
  spendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  spendIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spendCategory: {
    fontFamily: 'Outfit_500Medium',
    fontSize: 13,
    width: 74,
  },
  spendBarTrack: {
    flex: 1,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.07)',
    overflow: 'hidden',
  },
  spendBarFill: {
    height: 5,
    borderRadius: 3,
  },
  spendAmount: {
    fontFamily: 'Outfit_500Medium',
    fontSize: 12,
    width: 46,
    textAlign: 'right',
  },
  txCard: {
    marginHorizontal: 20,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 16,
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 12,
  },
  txIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txInfo: { flex: 1 },
  txMerchant: {
    fontFamily: 'Outfit_500Medium',
    fontSize: 14,
  },
  txMeta: {
    fontFamily: 'Outfit_400Regular',
    fontSize: 11,
    marginTop: 2,
  },
  txRight: { alignItems: 'flex-end' },
  txAmount: {
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 14,
  },
  txPoints: {
    fontFamily: 'Outfit_500Medium',
    fontSize: 10,
    marginTop: 2,
  },
  disclaimer: {
    fontFamily: 'Outfit_400Regular',
    fontSize: 11,
    lineHeight: 16,
    paddingHorizontal: 20,
    marginTop: 24,
  },
});
