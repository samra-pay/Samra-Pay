import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SamraLogo } from '@/components/SamraLogo';
import type { CardInfo } from '@/lib/mock-data';

const GRADIENTS: Record<string, readonly [string, string, string]> = {
  debit: ['#1A1A24', '#2D2D3F', '#1A1A24'],
  charge: ['#14301F', '#1B3B2B', '#0C1D13'],
  airlines: ['#E6C27A', '#D4AF37', '#B38B22'],
};

interface BankCardProps {
  card: CardInfo;
  width: number;
}

export function BankCard({ card, width }: BankCardProps) {
  const height = width * 0.62;
  const onGold = card.id === 'airlines';
  const textColor = onGold ? '#1A130A' : '#F9F7F1';
  const subColor = onGold ? 'rgba(26,19,10,0.65)' : 'rgba(249,247,241,0.6)';

  return (
    <LinearGradient
      colors={GRADIENTS[card.id]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.card, { width, height }]}
    >
      <View style={styles.topRow}>
        <SamraLogo size="sm" tone={onGold ? 'onGold' : 'default'} />
        {card.id === 'airlines' ? (
          <Text style={[styles.cobrand, { color: textColor }]}>ETHIOPIAN{'\n'}AIRLINES</Text>
        ) : card.id === 'charge' ? (
          <View style={styles.chargeBadge}>
            <Text style={styles.chargeBadgeText}>CHARGE</Text>
          </View>
        ) : (
          <Text style={[styles.cobrand, { color: subColor }]}>DEBIT</Text>
        )}
      </View>

      <View style={styles.chipRow}>
        <View style={styles.chip}>
          <View style={styles.chipLine} />
          <View style={styles.chipLine} />
        </View>
      </View>

      <Text style={[styles.number, { color: textColor }]} allowFontScaling={false}>
        ••••  ••••  ••••  {card.last4}
      </Text>

      <View style={styles.bottomRow}>
        <View>
          <Text style={[styles.label, { color: subColor }]}>CARDHOLDER</Text>
          <Text style={[styles.value, { color: textColor }]}>SELAM T.</Text>
        </View>
        <View>
          <Text style={[styles.label, { color: subColor }]}>EXPIRES</Text>
          <Text style={[styles.value, { color: textColor }]}>{card.expiry}</Text>
        </View>
        <View style={styles.mastercard}>
          <View style={[styles.mcCircle, { backgroundColor: '#EB001B' }]} />
          <View style={[styles.mcCircle, styles.mcCircleRight, { backgroundColor: '#F79E1B' }]} />
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    padding: 20,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cobrand: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 10,
    letterSpacing: 1.5,
    textAlign: 'right',
    lineHeight: 13,
  },
  chargeBadge: {
    borderWidth: 1,
    borderColor: 'rgba(249,247,241,0.35)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  chargeBadgeText: {
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 9,
    letterSpacing: 2,
    color: 'rgba(249,247,241,0.8)',
  },
  chipRow: {
    flexDirection: 'row',
  },
  chip: {
    width: 36,
    height: 26,
    borderRadius: 5,
    backgroundColor: 'rgba(230,194,122,0.85)',
    justifyContent: 'space-evenly',
    paddingHorizontal: 4,
  },
  chipLine: {
    height: 1,
    backgroundColor: 'rgba(26,19,10,0.35)',
  },
  number: {
    fontFamily: 'Outfit_500Medium',
    fontSize: 17,
    letterSpacing: 2,
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  label: {
    fontFamily: 'Outfit_500Medium',
    fontSize: 8,
    letterSpacing: 1.5,
    marginBottom: 3,
  },
  value: {
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 13,
    letterSpacing: 0.5,
  },
  mastercard: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  mcCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    opacity: 0.9,
  },
  mcCircleRight: {
    marginLeft: -10,
  },
});
