import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '@workspace/samra-pay-ds/hooks/use-colors';
import { nativeTheme } from '@workspace/samra-pay-ds/lib/native-theme';
import { tokens } from '@workspace/samra-pay-ds/tokens';

interface SamraLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showWordmark?: boolean;
  /** Force the wordmark colors (e.g. on gold card art) */
  tone?: 'default' | 'onGold';
}

const FONT_SIZES = { sm: 20, md: 24, lg: 34, xl: 44 } as const;

export function SamraLogo({ size = 'md', showWordmark = true, tone = 'default' }: SamraLogoProps) {
  const colors = useColors('dark');
  const fontSize = FONT_SIZES[size];
  // On gold card art the wordmark sits on the primary gold, so it uses the
  // primary-foreground / background ink tones from the dark palette.
  const samraColor = tone === 'onGold' ? tokens.color.dark.primaryForeground : colors.foreground;
  const payColor = tone === 'onGold' ? tokens.color.dark.background : colors.primary;

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

const font = nativeTheme.fontFamily;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  samra: {
    fontFamily: font.sans.extrabold,
    letterSpacing: -1,
    textTransform: 'lowercase',
  },
  pay: {
    fontFamily: font.serif.mediumItalic,
    marginLeft: 2,
    letterSpacing: -0.5,
    textTransform: 'lowercase',
  },
});
