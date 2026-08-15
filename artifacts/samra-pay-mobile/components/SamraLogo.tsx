import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';

interface SamraLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showWordmark?: boolean;
  /** Force the wordmark colors (e.g. on gold card art) */
  tone?: 'default' | 'onGold';
}

const FONT_SIZES = { sm: 20, md: 24, lg: 34, xl: 44 } as const;

export function SamraLogo({ size = 'md', showWordmark = true, tone = 'default' }: SamraLogoProps) {
  const colors = useColors();
  const fontSize = FONT_SIZES[size];
  const samraColor = tone === 'onGold' ? '#1A1A1A' : colors.cream;
  const payColor = tone === 'onGold' ? '#0A0A0A' : colors.primary;

  return (
    <View style={styles.row}>
      <Text
        style={[styles.samra, { fontSize, color: samraColor }]}
        allowFontScaling={false}
      >
        {showWordmark ? 'samra' : 's'}
      </Text>
      <Text
        style={[styles.pay, { fontSize, color: payColor }]}
        allowFontScaling={false}
      >
        {showWordmark ? 'pay' : 'p'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  samra: {
    fontFamily: 'Outfit_800ExtraBold',
    letterSpacing: -1,
    textTransform: 'lowercase',
  },
  pay: {
    fontFamily: 'EBGaramond_500Medium_Italic',
    marginLeft: 2,
    letterSpacing: -0.5,
    textTransform: 'lowercase',
  },
});
