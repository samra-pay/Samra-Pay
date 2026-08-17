import React, { useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@workspace/samra-pay-ds/hooks/use-colors';
import { nativeTheme } from '@workspace/samra-pay-ds/lib/native-theme';
import {
  DEMO_DISCLAIMER,
  MILES_HISTORY,
  REWARDS_CATALOG,
  SHEBA_MILES,
  formatMiles,
  type RewardItem,
} from '@/lib/mock-data';
import { ApiModeUnavailable } from '@/components/ApiModeUnavailable';
import { useSamraDataMode } from '@/lib/samra-runtime';

function MockRewardsScreen() {
  const colors = useColors('dark');
  const insets = useSafeAreaInsets();

  const [balance, setBalance] = useState<number>(SHEBA_MILES.balance);
  const [pendingRedeem, setPendingRedeem] = useState<RewardItem | null>(null);
  const [redeemed, setRedeemed] = useState<RewardItem | null>(null);

  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const bottomInset = Platform.OS === 'web' ? 34 : insets.bottom;

  const progress = Math.min(1, balance / SHEBA_MILES.nextGoal.target);

  function confirmRedeem() {
    if (!pendingRedeem) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setBalance((b) => b - pendingRedeem.cost);
    setRedeemed(pendingRedeem);
    setPendingRedeem(null);
  }

  return (
    <>
      <ScrollView
        style={[styles.root, { backgroundColor: colors.background }]}
        contentContainerStyle={{ paddingTop: topInset + 12, paddingBottom: bottomInset + 100 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.title, { color: colors.foreground }]}>ShebaMiles Rewards</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Earn on every swipe. Redeem for the journeys that matter.
        </Text>

        {/* ── Balance hero ── */}
        <View style={[styles.heroCard, { borderColor: colors.border, backgroundColor: colors.eucalyptusForeground }]}>
          <View style={[styles.heroBadge, { backgroundColor: colors.accent }]}>
            <Feather name="award" size={12} color={colors.primary} />
            <Text style={[styles.heroBadgeText, { color: colors.accentForeground }]}>
              AVAILABLE BALANCE
            </Text>
          </View>
          <Text style={[styles.heroBalance, { color: colors.foreground }]} allowFontScaling={false}>
            {formatMiles(balance)}
          </Text>
          <Text style={[styles.heroUnit, { color: colors.mutedForeground }]}>miles</Text>
          <Text style={[styles.heroEarned, { color: colors.primary }]}>
            +{formatMiles(SHEBA_MILES.earnedThisMonth)} earned this month
          </Text>

          <View style={styles.goalBlock}>
            <View style={styles.goalRow}>
              <Text style={[styles.goalLabel, { color: colors.mutedForeground }]}>
                Next Goal: {SHEBA_MILES.nextGoal.label}
              </Text>
              <Text style={[styles.goalPct, { color: colors.primary }]}>
                {Math.round(progress * 100)}%
              </Text>
            </View>
            <View style={styles.goalTrack}>
              <View
                style={[
                  styles.goalFill,
                  { backgroundColor: colors.primary, width: `${Math.round(progress * 100)}%` },
                ]}
              />
            </View>
            <View style={styles.goalScale}>
              <Text style={[styles.goalScaleText, { color: colors.mutedForeground }]}>0</Text>
              <Text style={[styles.goalScaleText, { color: colors.mutedForeground }]}>
                {formatMiles(SHEBA_MILES.nextGoal.target)} miles
              </Text>
            </View>
          </View>

          <View style={[styles.memberRow, { borderTopColor: colors.border }]}>
            <Feather name="user" size={13} color={colors.mutedForeground} />
            <Text style={[styles.memberText, { color: colors.mutedForeground }]}>
              ShebaMiles member since {SHEBA_MILES.memberSince}
            </Text>
          </View>
        </View>

        {/* ── Redemption catalog ── */}
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Redeem miles</Text>
        {REWARDS_CATALOG.map((item) => {
          const affordable = balance >= item.cost;
          return (
            <View
              key={item.id}
              style={[
                styles.rewardCard,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  opacity: affordable ? 1 : 0.6,
                },
              ]}
            >
              <View style={styles.rewardTop}>
                <View style={[styles.rewardIcon, { backgroundColor: colors.accent }]}>
                  <Feather name={item.icon as never} size={18} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.rewardTitleRow}>
                    <Text style={[styles.rewardTitle, { color: colors.foreground }]}>{item.title}</Text>
                  </View>
                  {item.tag ? (
                    <View style={[styles.rewardTag, { backgroundColor: colors.accent }]}>
                      <Text style={[styles.rewardTagText, { color: colors.accentForeground }]}>
                        {item.tag}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
              <Text style={[styles.rewardDesc, { color: colors.mutedForeground }]}>
                {item.description}
              </Text>
              <View style={styles.rewardBottom}>
                <Text style={[styles.rewardCost, { color: colors.primary }]}>
                  {formatMiles(item.cost)} miles
                </Text>
                <Pressable
                  disabled={!affordable}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setPendingRedeem(item);
                  }}
                  style={({ pressed }) => [
                    styles.redeemBtn,
                    {
                      backgroundColor: affordable ? colors.primary : colors.secondary,
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.redeemBtnText,
                      { color: affordable ? colors.primaryForeground : colors.mutedForeground },
                    ]}
                  >
                    {affordable ? 'Redeem' : 'Not enough miles'}
                  </Text>
                </Pressable>
              </View>
            </View>
          );
        })}

        {/* ── Earning history ── */}
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Earning history</Text>
        <View style={[styles.historyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {MILES_HISTORY.map((entry, i) => (
            <View
              key={entry.id}
              style={[
                styles.historyRow,
                i < MILES_HISTORY.length - 1 && {
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                },
              ]}
            >
              <View style={[styles.historyIcon, { backgroundColor: colors.secondary }]}>
                <Feather name="plus" size={13} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.historyLabel, { color: colors.foreground }]}>
                  {entry.label}
                </Text>
                <Text style={[styles.historyDate, { color: colors.mutedForeground }]}>
                  {entry.date}
                </Text>
              </View>
              <Text style={[styles.historyMiles, { color: colors.primary }]}>
                +{formatMiles(entry.miles)}
              </Text>
            </View>
          ))}
        </View>

        <Text style={[styles.disclaimer, { color: colors.mutedForeground }]}>{DEMO_DISCLAIMER}</Text>
      </ScrollView>

      {/* ── Redeem confirm modal ── */}
      <Modal
        visible={pendingRedeem !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPendingRedeem(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              Redeem {pendingRedeem ? formatMiles(pendingRedeem.cost) : ''} miles?
            </Text>
            <Text style={[styles.modalBody, { color: colors.mutedForeground }]}>
              You'll have {pendingRedeem ? formatMiles(balance - pendingRedeem.cost) : ''} miles
              remaining.
            </Text>
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setPendingRedeem(null)}
                style={({ pressed }) => [
                  styles.modalBtn,
                  { backgroundColor: colors.secondary, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Text style={[styles.modalBtnText, { color: colors.foreground }]}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={confirmRedeem}
                style={({ pressed }) => [
                  styles.modalBtn,
                  { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
                ]}
              >
                <Text style={[styles.modalBtnText, { color: colors.primaryForeground }]}>
                  Confirm
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Redeemed success modal ── */}
      <Modal
        visible={redeemed !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setRedeemed(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.successCircle, { backgroundColor: colors.accent }]}>
              <Feather name="check" size={26} color={colors.primary} />
            </View>
            <Text style={[styles.modalTitle, { color: colors.foreground, textAlign: 'center' }]}>
              Redeemed!
            </Text>
            <Text style={[styles.modalBody, { color: colors.mutedForeground, textAlign: 'center' }]}>
              {redeemed?.title} confirmed.{'\n'}New balance: {formatMiles(balance)} miles
            </Text>
            <Pressable
              onPress={() => setRedeemed(null)}
              style={({ pressed }) => [
                styles.modalBtn,
                { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1, marginTop: 4 },
              ]}
            >
              <Text style={[styles.modalBtnText, { color: colors.primaryForeground }]}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

export default function RewardsScreen() {
  const mode = useSamraDataMode();
  if (mode === 'api') {
    return <ApiModeUnavailable section="Rewards" />;
  }
  return <MockRewardsScreen />;
}

const font = nativeTheme.fontFamily;

const styles = StyleSheet.create({
  root: { flex: 1 },
  title: {
    fontFamily: font.serif.semibold,
    fontSize: 26,
    paddingHorizontal: 20,
    marginBottom: 4,
  },
  subtitle: {
    fontFamily: font.sans.regular,
    fontSize: 13,
    paddingHorizontal: 20,
    marginBottom: 18,
  },
  heroCard: {
    marginHorizontal: 20,
    borderRadius: 20,
    borderWidth: 1,
    padding: 22,
    marginBottom: 28,
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 14,
  },
  heroBadgeText: {
    fontFamily: font.sans.medium,
    fontSize: 9,
    letterSpacing: 1.5,
  },
  heroBalance: {
    fontFamily: font.serif.semibold,
    fontSize: 52,
    lineHeight: 56,
  },
  heroUnit: {
    fontFamily: font.sans.regular,
    fontSize: 14,
    marginBottom: 8,
  },
  heroEarned: {
    fontFamily: font.sans.medium,
    fontSize: 13,
    marginBottom: 20,
  },
  goalBlock: { marginBottom: 18 },
  goalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  goalLabel: {
    fontFamily: font.sans.medium,
    fontSize: 12,
  },
  goalPct: {
    fontFamily: font.sans.bold,
    fontSize: 12,
  },
  goalTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
    marginBottom: 6,
  },
  goalFill: {
    height: 6,
    borderRadius: 3,
  },
  goalScale: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  goalScaleText: {
    fontFamily: font.sans.regular,
    fontSize: 10,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderTopWidth: 1,
    paddingTop: 14,
  },
  memberText: {
    fontFamily: font.sans.regular,
    fontSize: 12,
  },
  sectionTitle: {
    fontFamily: font.serif.semibold,
    fontSize: 21,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  rewardCard: {
    marginHorizontal: 20,
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
    marginBottom: 14,
  },
  rewardTop: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 10,
  },
  rewardIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rewardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rewardTitle: {
    fontFamily: font.sans.semibold,
    fontSize: 15,
    flexShrink: 1,
  },
  rewardTag: {
    alignSelf: 'flex-start',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 5,
  },
  rewardTagText: {
    fontFamily: font.sans.medium,
    fontSize: 9,
    letterSpacing: 0.5,
  },
  rewardDesc: {
    fontFamily: font.sans.regular,
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 14,
  },
  rewardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rewardCost: {
    fontFamily: font.sans.bold,
    fontSize: 14,
  },
  redeemBtn: {
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  redeemBtnText: {
    fontFamily: font.sans.semibold,
    fontSize: 12,
  },
  historyCard: {
    marginHorizontal: 20,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 16,
    marginBottom: 28,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
  },
  historyIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyLabel: {
    fontFamily: font.sans.medium,
    fontSize: 13,
  },
  historyDate: {
    fontFamily: font.sans.regular,
    fontSize: 11,
    marginTop: 1,
  },
  historyMiles: {
    fontFamily: font.sans.semibold,
    fontSize: 13,
  },
  disclaimer: {
    fontFamily: font.sans.regular,
    fontSize: 11,
    lineHeight: 16,
    paddingHorizontal: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  modalCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
  },
  modalTitle: {
    fontFamily: font.serif.semibold,
    fontSize: 22,
    marginBottom: 8,
  },
  modalBody: {
    fontFamily: font.sans.regular,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  modalBtn: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
  },
  modalBtnText: {
    fontFamily: font.sans.semibold,
    fontSize: 14,
  },
  successCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 14,
  },
});
