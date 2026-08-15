import React, { useState } from 'react';
import {
  Animated,
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
import { useColors } from '@/hooks/useColors';
import { useTransfers } from '@/context/TransferContext';
import {
  CARD_FEE_RATE,
  DELIVERY_OPTIONS,
  FUNDING_OPTIONS,
  PROMO_RATE,
  REMITTANCE_STATS,
  STANDARD_RATE,
  formatEtb,
  formatUsd,
} from '@/lib/mock-data';

type DeliveryId = (typeof DELIVERY_OPTIONS)[number]['id'];
type FundingId = (typeof FUNDING_OPTIONS)[number]['id'];
type Step = 'form' | 'review' | 'success';

function getTodayLabel() {
  return 'Today';
}

export default function RemittanceScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { addTransfer } = useTransfers();

  const [step, setStep] = useState<Step>('form');
  const [amountText, setAmountText] = useState<string>('1000');
  const [delivery, setDelivery] = useState<DeliveryId>('bank');
  const [funding, setFunding] = useState<FundingId>('bank');
  const [recipientName, setRecipientName] = useState<string>('Almaz Tesfaye');

  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const bottomInset = Platform.OS === 'web' ? 34 : insets.bottom;

  const amount = Math.max(0, parseFloat(amountText.replace(/[^0-9.]/g, '')) || 0);
  const receiveEtb = amount * PROMO_RATE;
  const standardEtb = amount * STANDARD_RATE;
  const extraEtb = receiveEtb - standardEtb;
  const fee = funding === 'card' ? amount * CARD_FEE_RATE : 0;
  const total = amount + fee;

  const deliveryLabel = DELIVERY_OPTIONS.find((d) => d.id === delivery)?.label ?? delivery;
  const fundingLabel = FUNDING_OPTIONS.find((f) => f.id === funding)?.label ?? funding;

  const recipientValid = recipientName.trim().length > 0;
  const canContinue = amount > 0 && recipientValid;

  function handleContinue() {
    if (!canContinue) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setStep('review');
  }

  function handleConfirm() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    addTransfer({
      id: 0, // overwritten by TransferContext
      merchant: `Transfer to ${recipientName}`,
      date: getTodayLabel(),
      amount: -total,
      category: 'Transfer',
      card: 'Checking',
    });
    setStep('success');
  }

  function handleSendAnother() {
    Haptics.selectionAsync();
    setStep('form');
    setAmountText('1000');
  }

  // ── Success state ──────────────────────────────────────────────────────────
  if (step === 'success') {
    return (
      <View
        style={[
          styles.centeredPage,
          { backgroundColor: colors.background, paddingTop: topInset, paddingBottom: bottomInset },
        ]}
      >
        <View style={[styles.successCircle, { backgroundColor: colors.accent }]}>
          <Feather name="check" size={38} color={colors.primary} />
        </View>
        <Text style={[styles.successTitle, { color: colors.cream }]}>Transfer sent!</Text>
        <Text style={[styles.successSub, { color: colors.mutedForeground }]}>
          {formatUsd(total)} sent to {recipientName}
        </Text>
        <Text style={[styles.successDetail, { color: colors.mutedForeground }]}>
          {formatEtb(receiveEtb)} via {deliveryLabel.toLowerCase()}
        </Text>

        <View
          style={[styles.successCard, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <Row label="Amount sent" value={formatUsd(amount)} colors={colors} />
          <Row label="Service fee" value={fee > 0 ? formatUsd(fee) : 'Free'} colors={colors} />
          <Row label="Total charged" value={formatUsd(total)} colors={colors} bold />
          <Row label="They receive" value={formatEtb(receiveEtb)} colors={colors} highlight />
        </View>

        <Text style={[styles.demoNote, { color: colors.mutedForeground }]}>
          Illustrative demo — no real money was moved.
        </Text>

        <Pressable
          onPress={handleSendAnother}
          style={({ pressed }) => [
            styles.primaryBtn,
            { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <Text style={[styles.primaryBtnText, { color: colors.primaryForeground }]}>
            Send another
          </Text>
        </Pressable>
      </View>
    );
  }

  // ── Review step ────────────────────────────────────────────────────────────
  if (step === 'review') {
    return (
      <View
        style={[
          styles.centeredPage,
          { backgroundColor: colors.background, paddingTop: topInset + 12, paddingBottom: bottomInset + 100 },
        ]}
      >
        <Text style={[styles.reviewTitle, { color: colors.cream }]}>Review transfer</Text>
        <Text style={[styles.reviewSub, { color: colors.mutedForeground }]}>
          Please confirm the details below.
        </Text>

        <View
          style={[styles.reviewCard, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <Row label="Recipient" value={recipientName} colors={colors} />
          <Row label="Amount" value={formatUsd(amount)} colors={colors} />
          <Row label="Service fee" value={fee > 0 ? formatUsd(fee) : 'Free'} colors={colors} />
          <Row label="Total charged" value={formatUsd(total)} colors={colors} bold />
          <Row label="They receive" value={formatEtb(receiveEtb)} colors={colors} highlight />
          <Row label="Delivery" value={deliveryLabel} colors={colors} />
          <Row label="Funded via" value={fundingLabel} colors={colors} />
          <Row label="Exchange rate" value={`${PROMO_RATE} ETB / $1`} colors={colors} />
        </View>

        <Text style={[styles.demoNote, { color: colors.mutedForeground }]}>
          Illustrative demo — no real money is moved.
        </Text>

        <Pressable
          onPress={handleConfirm}
          style={({ pressed }) => [
            styles.primaryBtn,
            { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <Text style={[styles.primaryBtnText, { color: colors.primaryForeground }]}>
            Confirm &amp; send
          </Text>
        </Pressable>

        <Pressable
          onPress={() => {
            Haptics.selectionAsync();
            setStep('form');
          }}
          style={({ pressed }) => [styles.ghostBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Text style={[styles.ghostBtnText, { color: colors.mutedForeground }]}>Edit</Text>
        </Pressable>
      </View>
    );
  }

  // ── Form step ─────────────────────────────────────────────────────────────
  return (
    <KeyboardAwareScrollViewCompat
      style={[styles.root, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingTop: topInset + 12, paddingBottom: bottomInset + 100 }}
      keyboardShouldPersistTaps="handled"
      bottomOffset={40}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.title, { color: colors.cream }]}>Send money home</Text>
      <View style={[styles.rateBadge, { backgroundColor: colors.accent }]}>
        <Feather name="trending-up" size={13} color={colors.primary} />
        <Text style={[styles.rateBadgeText, { color: colors.accentForeground }]}>
          {PROMO_RATE} ETB / $1 · illustrative demo rate
        </Text>
      </View>

      {/* Recipient */}
      <View style={[styles.calcCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.label, { color: colors.mutedForeground }]}>RECIPIENT NAME</Text>
        <View style={[styles.recipientWrap, { borderColor: colors.input }]}>
          <Feather name="user" size={15} color={colors.mutedForeground} style={{ marginRight: 8 }} />
          <TextInput
            testID="recipient-name"
            style={[styles.recipientInput, { color: colors.cream }]}
            value={recipientName}
            onChangeText={setRecipientName}
            placeholder="Full name"
            placeholderTextColor={colors.mutedForeground}
          />
        </View>
      </View>

      <View style={[styles.calcCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.label, { color: colors.mutedForeground }]}>YOU SEND (USD)</Text>
        <View style={[styles.amountWrap, { borderColor: colors.input }]}>
          <Text style={[styles.dollar, { color: colors.primary }]}>$</Text>
          <TextInput
            testID="remit-amount"
            style={[styles.amountInput, { color: colors.cream }]}
            keyboardType="decimal-pad"
            value={amountText}
            onChangeText={setAmountText}
            placeholder="0"
            placeholderTextColor={colors.mutedForeground}
            allowFontScaling={false}
          />
        </View>

        <View style={styles.receiveRow}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>THEY RECEIVE</Text>
          <Text style={[styles.receiveValue, { color: colors.primary }]} allowFontScaling={false}>
            {formatEtb(receiveEtb)}
          </Text>
          <Text style={[styles.compare, { color: colors.mutedForeground }]}>
            {formatEtb(extraEtb)} more than the {STANDARD_RATE} ETB standard rate
          </Text>
        </View>
      </View>

      <Text style={[styles.sectionTitle, { color: colors.cream }]}>Delivery method</Text>
      <View style={styles.optionRow}>
        {DELIVERY_OPTIONS.map((opt) => {
          const active = delivery === opt.id;
          return (
            <Pressable
              key={opt.id}
              testID={`delivery-${opt.id}`}
              onPress={() => {
                setDelivery(opt.id);
                Haptics.selectionAsync();
              }}
              style={({ pressed }) => [
                styles.option,
                {
                  backgroundColor: colors.card,
                  borderColor: active ? colors.primary : colors.border,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              <Feather
                name={opt.icon as never}
                size={18}
                color={active ? colors.primary : colors.mutedForeground}
              />
              <Text style={[styles.optionLabel, { color: colors.foreground }]}>{opt.label}</Text>
              <Text style={[styles.optionDetail, { color: colors.mutedForeground }]}>
                {opt.detail}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={[styles.sectionTitle, { color: colors.cream }]}>Pay with</Text>
      <View style={styles.optionRow}>
        {FUNDING_OPTIONS.map((opt) => {
          const active = funding === opt.id;
          return (
            <Pressable
              key={opt.id}
              testID={`funding-${opt.id}`}
              onPress={() => {
                setFunding(opt.id);
                Haptics.selectionAsync();
              }}
              style={({ pressed }) => [
                styles.option,
                {
                  backgroundColor: colors.card,
                  borderColor: active ? colors.primary : colors.border,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              <Feather
                name={opt.icon as never}
                size={18}
                color={active ? colors.primary : colors.mutedForeground}
              />
              <Text style={[styles.optionLabel, { color: colors.foreground }]}>{opt.label}</Text>
              <Text style={[styles.optionDetail, { color: colors.mutedForeground }]}>
                {opt.detail}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.summaryRow}>
          <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Amount</Text>
          <Text style={[styles.summaryValue, { color: colors.foreground }]}>{formatUsd(amount)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Service fee</Text>
          <Text style={[styles.summaryValue, { color: colors.foreground }]}>
            {fee > 0 ? formatUsd(fee) : 'Free'}
          </Text>
        </View>
        <View style={[styles.summaryTotal, { borderTopColor: colors.border }]}>
          <Text style={[styles.summaryLabel, { color: colors.foreground }]}>Total</Text>
          <Text style={[styles.totalValue, { color: colors.cream }]}>{formatUsd(total)}</Text>
        </View>
      </View>

      <View style={[styles.statsCard, { borderColor: colors.border }]}>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: colors.primary }]}>
            {formatUsd(REMITTANCE_STATS.ytdTotal)}
          </Text>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Sent this year</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: colors.primary }]}>
            {REMITTANCE_STATS.familyMembersSupported}
          </Text>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>
            Family supported
          </Text>
        </View>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: colors.primary }]}>
            {REMITTANCE_STATS.location}
          </Text>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Destination</Text>
        </View>
      </View>

      <Pressable
        onPress={handleContinue}
        disabled={!canContinue}
        style={({ pressed }) => [
          styles.primaryBtn,
          styles.primaryBtnMargin,
          {
            backgroundColor: canContinue ? colors.primary : colors.secondary,
            opacity: pressed ? 0.8 : 1,
          },
        ]}
      >
        <Text
          style={[
            styles.primaryBtnText,
            { color: canContinue ? colors.primaryForeground : colors.mutedForeground },
          ]}
        >
          Continue →
        </Text>
      </Pressable>
    </KeyboardAwareScrollViewCompat>
  );
}

// ── Small helper component ────────────────────────────────────────────────────

function Row({
  label,
  value,
  colors,
  bold,
  highlight,
}: {
  label: string;
  value: string;
  colors: ReturnType<typeof import('@/hooks/useColors').useColors>;
  bold?: boolean;
  highlight?: boolean;
}) {
  return (
    <View style={rowStyles.row}>
      <Text style={[rowStyles.label, { color: colors.mutedForeground }]}>{label}</Text>
      <Text
        style={[
          rowStyles.value,
          bold && rowStyles.bold,
          { color: highlight ? colors.primary : colors.foreground },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  label: {
    fontFamily: 'Outfit_400Regular',
    fontSize: 13,
  },
  value: {
    fontFamily: 'Outfit_500Medium',
    fontSize: 13,
  },
  bold: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 14,
  },
});

// ── Stylesheet ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  centeredPage: {
    flex: 1,
    paddingHorizontal: 24,
  },

  // Form
  title: {
    fontFamily: 'EBGaramond_600SemiBold',
    fontSize: 26,
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  rateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginHorizontal: 20,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 18,
  },
  rateBadgeText: {
    fontFamily: 'Outfit_500Medium',
    fontSize: 11,
  },
  calcCard: {
    marginHorizontal: 20,
    borderRadius: 18,
    borderWidth: 1,
    padding: 20,
    marginBottom: 20,
  },
  label: {
    fontFamily: 'Outfit_500Medium',
    fontSize: 9,
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  recipientWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    paddingBottom: 8,
  },
  recipientInput: {
    flex: 1,
    fontFamily: 'Outfit_500Medium',
    fontSize: 17,
    padding: 0,
  },
  amountWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    paddingBottom: 8,
    marginBottom: 18,
  },
  dollar: {
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 28,
    marginRight: 6,
  },
  amountInput: {
    flex: 1,
    fontFamily: 'Outfit_700Bold',
    fontSize: 34,
    padding: 0,
  },
  receiveRow: {},
  receiveValue: {
    fontFamily: 'EBGaramond_600SemiBold',
    fontSize: 36,
    marginBottom: 4,
  },
  compare: {
    fontFamily: 'Outfit_400Regular',
    fontSize: 12,
  },
  sectionTitle: {
    fontFamily: 'EBGaramond_600SemiBold',
    fontSize: 19,
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  optionRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  option: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 14,
    gap: 6,
  },
  optionLabel: {
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 13,
  },
  optionDetail: {
    fontFamily: 'Outfit_400Regular',
    fontSize: 11,
  },
  summaryCard: {
    marginHorizontal: 20,
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
    marginBottom: 20,
    gap: 10,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summaryLabel: {
    fontFamily: 'Outfit_400Regular',
    fontSize: 13,
  },
  summaryValue: {
    fontFamily: 'Outfit_500Medium',
    fontSize: 13,
  },
  summaryTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    paddingTop: 12,
  },
  totalValue: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 16,
  },
  statsCard: {
    flexDirection: 'row',
    marginHorizontal: 20,
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
    marginBottom: 24,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 15,
  },
  statLabel: {
    fontFamily: 'Outfit_400Regular',
    fontSize: 10,
    textAlign: 'center',
  },
  primaryBtn: {
    marginHorizontal: 20,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryBtnMargin: {
    marginBottom: 8,
  },
  primaryBtnText: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 16,
  },
  ghostBtn: {
    alignItems: 'center',
    paddingVertical: 14,
    marginHorizontal: 20,
  },
  ghostBtnText: {
    fontFamily: 'Outfit_500Medium',
    fontSize: 14,
  },

  // Review
  reviewTitle: {
    fontFamily: 'EBGaramond_600SemiBold',
    fontSize: 28,
    marginBottom: 6,
    marginTop: 12,
  },
  reviewSub: {
    fontFamily: 'Outfit_400Regular',
    fontSize: 14,
    marginBottom: 24,
  },
  reviewCard: {
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 18,
    marginBottom: 12,
  },
  demoNote: {
    fontFamily: 'Outfit_400Regular',
    fontSize: 11,
    marginBottom: 20,
    marginHorizontal: 20,
    lineHeight: 16,
  },

  // Success
  successCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginTop: 48,
    marginBottom: 24,
  },
  successTitle: {
    fontFamily: 'EBGaramond_600SemiBold',
    fontSize: 32,
    textAlign: 'center',
    marginBottom: 8,
  },
  successSub: {
    fontFamily: 'Outfit_500Medium',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 4,
  },
  successDetail: {
    fontFamily: 'Outfit_400Regular',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 32,
  },
  successCard: {
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 18,
    marginBottom: 16,
  },
});
