import React, { useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SamraLogo } from '@/components/SamraLogo';
import { useAuth } from '@/context/AuthContext';
import { useTransfers } from '@/context/TransferContext';
import { useColors } from '@/hooks/useColors';
import {
  CHECKING_BALANCE,
  DEMO_DISCLAIMER,
  PROFILE,
  RECENT_TRANSACTIONS,
  SPENDING_DATA,
  formatUsd,
} from '@/lib/mock-data';

const MAX_VISIBLE_TX = 5;

const QUICK_ACTIONS = [
  { id: 'send', label: 'Send', icon: 'send' as const },
  { id: 'pay', label: 'Pay bill', icon: 'file-text' as const },
  { id: 'cards', label: 'Cards', icon: 'credit-card' as const },
  { id: 'more', label: 'More', icon: 'grid' as const },
] as const;

type QuickActionId = (typeof QUICK_ACTIONS)[number]['id'];

// ─── Demo sheet content ───────────────────────────────────────────────────────

function PayBillSheet({ onClose, colors }: { onClose: () => void; colors: ReturnType<typeof import('@/hooks/useColors').useColors> }) {
  const bills = [
    { name: 'Ethiopian Electric Utility', amount: 420, due: 'Jul 5', icon: 'zap' as const },
    { name: 'Ethio Telecom', amount: 185, due: 'Jul 8', icon: 'phone' as const },
    { name: 'Addis Water & Sewerage', amount: 95, due: 'Jul 10', icon: 'droplet' as const },
  ];
  return (
    <View style={[sheetStyles.container, { backgroundColor: colors.card }]}>
      <View style={[sheetStyles.handle, { backgroundColor: colors.border }]} />
      <Text style={[sheetStyles.title, { color: colors.cream }]}>Pay a bill</Text>
      {bills.map((b) => (
        <Pressable
          key={b.name}
          onPress={() => Haptics.selectionAsync()}
          style={({ pressed }) => [
            sheetStyles.billRow,
            { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <View style={[sheetStyles.billIcon, { backgroundColor: colors.accent }]}>
            <Feather name={b.icon} size={16} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[sheetStyles.billName, { color: colors.foreground }]}>{b.name}</Text>
            <Text style={[sheetStyles.billDue, { color: colors.mutedForeground }]}>Due {b.due}</Text>
          </View>
          <Text style={[sheetStyles.billAmount, { color: colors.cream }]}>{formatUsd(b.amount, {})}</Text>
        </Pressable>
      ))}
      <Text style={[sheetStyles.demoNote, { color: colors.mutedForeground }]}>
        Illustrative demo — no real payments are processed.
      </Text>
      <Pressable
        onPress={onClose}
        style={({ pressed }) => [
          sheetStyles.closeBtn,
          { backgroundColor: colors.secondary, opacity: pressed ? 0.7 : 1 },
        ]}
      >
        <Text style={[sheetStyles.closeBtnText, { color: colors.foreground }]}>Close</Text>
      </Pressable>
    </View>
  );
}

function MoreSheet({ onClose, colors }: { onClose: () => void; colors: ReturnType<typeof import('@/hooks/useColors').useColors> }) {
  const router = useRouter();
  const items = [
    { label: 'Statements & documents', icon: 'file' as const },
    { label: 'Account settings', icon: 'settings' as const },
    { label: 'Notifications', icon: 'bell' as const },
    { label: 'Help & support', icon: 'help-circle' as const },
    { label: 'Refer a friend', icon: 'user-plus' as const },
  ];
  return (
    <View style={[sheetStyles.container, { backgroundColor: colors.card }]}>
      <View style={[sheetStyles.handle, { backgroundColor: colors.border }]} />
      <Text style={[sheetStyles.title, { color: colors.cream }]}>More</Text>
      {items.map((item) => (
        <Pressable
          key={item.label}
          onPress={() => {
            Haptics.selectionAsync();
            if (item.label === 'Account settings') {
              onClose();
              router.push('/settings');
            }
          }}
          style={({ pressed }) => [
            sheetStyles.moreRow,
            { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <View style={[sheetStyles.billIcon, { backgroundColor: colors.secondary }]}>
            <Feather name={item.icon} size={15} color={colors.mutedForeground} />
          </View>
          <Text style={[sheetStyles.moreName, { color: colors.foreground }]}>{item.label}</Text>
          <Feather name="chevron-right" size={15} color={colors.border} />
        </Pressable>
      ))}
      <Pressable
        onPress={onClose}
        style={({ pressed }) => [
          sheetStyles.closeBtn,
          { backgroundColor: colors.secondary, opacity: pressed ? 0.7 : 1 },
        ]}
      >
        <Text style={[sheetStyles.closeBtnText, { color: colors.foreground }]}>Close</Text>
      </Pressable>
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function DashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { sessionTransfers } = useTransfers();

  const [balanceHidden, setBalanceHidden] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activeSheet, setActiveSheet] = useState<null | 'pay' | 'more'>(null);
  const [showAllTx, setShowAllTx] = useState(false);

  // Fade-in entrance animation
  const fadeAnim = useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 420,
      useNativeDriver: true,
    }).start();
  }, []);

  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const bottomInset = Platform.OS === 'web' ? 34 : insets.bottom;
  const totalSpending = SPENDING_DATA.reduce((sum, s) => sum + s.amount, 0);

  // Merge session transfers (newest first) with static mock transactions
  const allTransactions = [...sessionTransfers, ...RECENT_TRANSACTIONS];
  const visibleTransactions = showAllTx ? allTransactions : allTransactions.slice(0, MAX_VISIBLE_TX);

  function handleQuickAction(id: QuickActionId) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (id === 'send') router.push('/(tabs)/remittance');
    else if (id === 'cards') router.push('/(tabs)/cards');
    else if (id === 'pay') setActiveSheet('pay');
    else if (id === 'more') setActiveSheet('more');
  }

  function handleRefresh() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 900);
  }

  return (
    <>
      <ScrollView
        style={[styles.root, { backgroundColor: colors.background }]}
        contentContainerStyle={{ paddingTop: topInset + 12, paddingBottom: bottomInset + 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <Animated.View style={{ opacity: fadeAnim }}>
          {/* ── Header ── */}
          <View style={styles.header}>
            <View>
              <SamraLogo size="md" />
              <Text style={[styles.greeting, { color: colors.mutedForeground }]}>
                Welcome back, {PROFILE.firstName}
              </Text>
            </View>
            <Pressable
              testID="open-settings"
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push('/settings');
              }}
              style={({ pressed }) => [
                styles.iconButton,
                { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Feather name="settings" size={17} color={colors.mutedForeground} />
            </Pressable>
          </View>

          {/* ── Balance card with quick actions ── */}
          <View style={[styles.balanceCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.balanceLabelRow}>
              <Text style={[styles.balanceLabel, { color: colors.mutedForeground }]}>
                CHECKING BALANCE
              </Text>
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync();
                  setBalanceHidden((h) => !h);
                }}
                hitSlop={10}
                style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
              >
                <Feather
                  name={balanceHidden ? 'eye-off' : 'eye'}
                  size={14}
                  color={colors.mutedForeground}
                />
              </Pressable>
            </View>

            {balanceHidden ? (
              <Text style={[styles.balanceHidden, { color: colors.cream }]} allowFontScaling={false}>
                ••••••
              </Text>
            ) : (
              <Text style={[styles.balanceValue, { color: colors.cream }]} allowFontScaling={false}>
                {formatUsd(CHECKING_BALANCE)}
              </Text>
            )}

            <View style={styles.quickRow}>
              {QUICK_ACTIONS.map((action) => (
                <Pressable
                  key={action.id}
                  onPress={() => handleQuickAction(action.id)}
                  style={({ pressed }) => [styles.quickItem, { opacity: pressed ? 0.65 : 1 }]}
                >
                  <View style={[styles.quickIcon, { backgroundColor: colors.accent }]}>
                    <Feather name={action.icon} size={18} color={colors.primary} />
                  </View>
                  <Text style={[styles.quickLabel, { color: colors.mutedForeground }]}>
                    {action.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* ── Recent transactions (now directly below balance) ── */}
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.cream }]}>Recent transactions</Text>
            {allTransactions.length > MAX_VISIBLE_TX && (
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync();
                  setShowAllTx((v) => !v);
                }}
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
              >
                <Text style={[styles.viewAll, { color: colors.primary }]}>
                  {showAllTx ? 'Show less' : 'View all'}
                </Text>
              </Pressable>
            )}
          </View>
          <View style={[styles.txCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {visibleTransactions.map((tx, i) => (
              <View
                key={`${tx.id}-${i}`}
                style={[
                  styles.txRow,
                  i < visibleTransactions.length - 1 && {
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border,
                  },
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
                    {tx.date} · {tx.category}
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

          {/* ── Spending this month ── */}
          <Text style={[styles.sectionTitle, { color: colors.cream, paddingHorizontal: 20, marginBottom: 12, marginTop: 0 }]}>
            Spending this month
          </Text>
          <View style={[styles.spendCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.spendHeader}>
              <Text style={[styles.spendTotal, { color: colors.cream }]}>{formatUsd(totalSpending)}</Text>
              <Text style={[styles.spendSub, { color: colors.mutedForeground }]}>
                across {SPENDING_DATA.length} categories
              </Text>
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

          <Text style={[styles.disclaimer, { color: colors.mutedForeground }]}>{DEMO_DISCLAIMER}</Text>
        </Animated.View>
      </ScrollView>

      {/* ── Demo sheets ── */}
      <Modal
        visible={activeSheet === 'pay'}
        transparent
        animationType="slide"
        onRequestClose={() => setActiveSheet(null)}
      >
        <Pressable style={styles.sheetOverlay} onPress={() => setActiveSheet(null)}>
          <Pressable onPress={() => {}}>
            <PayBillSheet onClose={() => setActiveSheet(null)} colors={colors} />
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={activeSheet === 'more'}
        transparent
        animationType="slide"
        onRequestClose={() => setActiveSheet(null)}
      >
        <Pressable style={styles.sheetOverlay} onPress={() => setActiveSheet(null)}>
          <Pressable onPress={() => {}}>
            <MoreSheet onClose={() => setActiveSheet(null)} colors={colors} />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

// ─── Stylesheet ───────────────────────────────────────────────────────────────

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
  balanceLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  balanceLabel: {
    fontFamily: 'Outfit_500Medium',
    fontSize: 10,
    letterSpacing: 2,
  },
  balanceValue: {
    fontFamily: 'EBGaramond_600SemiBold',
    fontSize: 44,
    marginBottom: 20,
  },
  balanceHidden: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 34,
    marginBottom: 20,
    letterSpacing: 6,
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
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  sectionTitle: {
    fontFamily: 'EBGaramond_600SemiBold',
    fontSize: 21,
  },
  viewAll: {
    fontFamily: 'Outfit_500Medium',
    fontSize: 13,
  },
  txCard: {
    marginHorizontal: 20,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 16,
    marginBottom: 28,
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
  disclaimer: {
    fontFamily: 'Outfit_400Regular',
    fontSize: 11,
    lineHeight: 16,
    paddingHorizontal: 20,
    marginTop: 8,
  },
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
});

const sheetStyles = StyleSheet.create({
  container: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  title: {
    fontFamily: 'EBGaramond_600SemiBold',
    fontSize: 22,
    marginBottom: 20,
  },
  billRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  billIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  billName: {
    fontFamily: 'Outfit_500Medium',
    fontSize: 14,
  },
  billDue: {
    fontFamily: 'Outfit_400Regular',
    fontSize: 11,
    marginTop: 2,
  },
  billAmount: {
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 15,
  },
  demoNote: {
    fontFamily: 'Outfit_400Regular',
    fontSize: 11,
    marginTop: 16,
    marginBottom: 4,
  },
  moreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  moreName: {
    fontFamily: 'Outfit_500Medium',
    fontSize: 15,
    flex: 1,
  },
  closeBtn: {
    marginTop: 20,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  closeBtnText: {
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 15,
  },
});
