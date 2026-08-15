import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SamraLogo } from '@/components/SamraLogo';
import { tokens } from '@workspace/samra-pay-ds/tokens';
import { nativeTheme } from '@workspace/samra-pay-ds/lib/native-theme';
import type { CardInfo } from '@/lib/mock-data';

// expo-linear-gradient is built against React 18 class-component types, which are
// incompatible with @types/react@19.2.x's stricter JSX constraint. `as any` is the
// targeted escape hatch — prop types are still enforced at the usage site by the
// underlying library's .d.ts through normal IDE autocomplete.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const GradView = LinearGradient as any;

// Bank-card gradient ramps are domain art (like the web DS bank-card), kept
// local to the app. Where a stop maps 1:1 to a design token we reference the
// token (the airlines mid-stop is the primary gold). The remaining ramp
// endpoints (gold light/dark, and the debit/charge metal tones) have no exact
// token equivalent and stay literal as card art.
const GRADIENTS: Record<string, readonly [string, string, string]> = {
  debit: ['#1A1A24', '#2D2D3F', '#1A1A24'],
  charge: ['#14301F', '#1B3B2B', '#0C1D13'],
  airlines: ['#E6C27A', tokens.color.dark.primary, '#B38B22'],
};

interface BankCardProps {
  card: CardInfo;
  width: number;
}

export function BankCard({ card, width }: BankCardProps) {
  const height = width * 0.62;
  const onGold = card.id === 'airlines';
  // Card-art ink tones: dark ink on the gold card, off-white on dark cards.
  // These are domain art values with no 1:1 token equivalent (kept literal).
  const textColor = onGold ? '#1A130A' : '#F9F7F1';
  const subColor = onGold ? 'rgba(26,19,10,0.65)' : 'rgba(249,247,241,0.6)';

  return (
    <GradView
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
          {/* Mastercard brand marks — third-party brand colors, kept literal. */}
          <View style={[styles.mcCircle, { backgroundColor: '#EB001B' }]} />
          <View style={[styles.mcCircle, styles.mcCircleRight, { backgroundColor: '#F79E1B' }]} />
        </View>
      </View>
    </GradView>
  );
}

const font = nativeTheme.fontFamily;

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
    fontFamily: font.sans.bold,
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
    fontFamily: font.sans.semibold,
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
    fontFamily: font.sans.medium,
    fontSize: 17,
    letterSpacing: 2,
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  label: {
    fontFamily: font.sans.medium,
    fontSize: 8,
    letterSpacing: 1.5,
    marginBottom: 3,
  },
  value: {
    fontFamily: font.sans.semibold,
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
