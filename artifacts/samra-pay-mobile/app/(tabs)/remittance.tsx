import React, { useState } from 'react';
import {
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

export default function RemittanceScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [amountText, setAmountText] = useState<string>('1000');
  const [delivery, setDelivery] = useState<DeliveryId>('bank');
  const [funding, setFunding] = useState<FundingId>('bank');

  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const bottomInset = Platform.OS === 'web' ? 34 : insets.bottom;

  const amount = Math.max(0, parseFloat(amountText.replace(/[^0-9.]/g, '')) || 0);
  const receiveEtb = amount * PROMO_RATE;
  const standardEtb = amount * STANDARD_RATE;
  const extraEtb = receiveEtb - standardEtb;
  const fee = funding === 'card' ? amount * CARD_FEE_RATE : 0;
  const total = amount + fee;

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
    </KeyboardAwareScrollViewCompat>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
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
    marginBottom: 26,
  },
  label: {
    fontFamily: 'Outfit_500Medium',
    fontSize: 9,
    letterSpacing: 1.5,
    marginBottom: 8,
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
});
