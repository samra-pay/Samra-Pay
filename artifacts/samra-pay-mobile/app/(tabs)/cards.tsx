import React, { useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Feather } from '@expo/vector-icons';
import { BankCard } from '@/components/BankCard';
import { useColors } from '@/hooks/useColors';
import { CARDS, DEMO_DISCLAIMER, formatUsd } from '@/lib/mock-data';

export default function CardsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [selectedIndex, setSelectedIndex] = useState<number>(1);

  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const bottomInset = Platform.OS === 'web' ? 34 : insets.bottom;
  const cardWidth = Math.min(width - 72, 340);
  const card = CARDS[selectedIndex];

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingTop: topInset + 12, paddingBottom: bottomInset + 100 }}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.title, { color: colors.cream }]}>Your cards</Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={cardWidth + 14}
        decelerationRate="fast"
        contentContainerStyle={styles.carousel}
        onMomentumScrollEnd={(e) => {
          const index = Math.round(e.nativeEvent.contentOffset.x / (cardWidth + 14));
          const clamped = Math.max(0, Math.min(CARDS.length - 1, index));
          if (clamped !== selectedIndex) {
            setSelectedIndex(clamped);
            Haptics.selectionAsync();
          }
        }}
      >
        {CARDS.map((c, i) => (
          <Pressable
            key={c.id}
            testID={`card-${c.id}`}
            onPress={() => {
              setSelectedIndex(i);
              Haptics.selectionAsync();
            }}
            style={{ marginRight: 14, opacity: i === selectedIndex ? 1 : 0.55 }}
          >
            <BankCard card={c} width={cardWidth} />
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.dots}>
        {CARDS.map((c, i) => (
          <View
            key={c.id}
            style={[
              styles.dot,
              { backgroundColor: i === selectedIndex ? colors.primary : colors.border },
            ]}
          />
        ))}
      </View>

      <View style={[styles.detailCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.cardName, { color: colors.cream }]}>{card.name}</Text>
        <View style={styles.balanceRow}>
          <View>
            <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>
              {card.balanceLabel.toUpperCase()}
            </Text>
            <Text style={[styles.balanceValue, { color: colors.cream }]}>
              {formatUsd(card.balance)}
            </Text>
          </View>
          <View style={styles.balanceRight}>
            <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>LIMIT</Text>
            <Text style={[styles.detailValue, { color: colors.foreground }]}>{card.limit}</Text>
          </View>
        </View>

        {card.due ? (
          <View style={[styles.dueRow, { borderColor: colors.border }]}>
            <View style={styles.dueItem}>
              <Feather name="calendar" size={14} color={colors.primary} />
              <Text style={[styles.dueText, { color: colors.foreground }]}>Due {card.due}</Text>
            </View>
            <View style={styles.dueItem}>
              <Feather name="dollar-sign" size={14} color={colors.primary} />
              <Text style={[styles.dueText, { color: colors.foreground }]}>
                Min {formatUsd(card.minDue ?? 0)}
              </Text>
            </View>
            <View style={styles.dueItem}>
              <Feather
                name={card.autopay ? 'check-circle' : 'circle'}
                size={14}
                color={card.autopay ? colors.green : colors.mutedForeground}
              />
              <Text style={[styles.dueText, { color: colors.foreground }]}>
                Autopay {card.autopay ? 'on' : 'off'}
              </Text>
            </View>
          </View>
        ) : null}

        <Text style={[styles.rewardsTitle, { color: colors.mutedForeground }]}>REWARDS</Text>
        {card.rewards.map((r) => (
          <View key={r.label} style={styles.rewardRow}>
            <Text style={[styles.rewardLabel, { color: colors.foreground }]}>{r.label}</Text>
            <Text style={[styles.rewardValue, { color: colors.primary }]}>{r.value}</Text>
          </View>
        ))}

        <Text style={[styles.issuer, { color: colors.mutedForeground }]}>{card.issuer}</Text>
      </View>

      <Text style={[styles.disclaimer, { color: colors.mutedForeground }]}>{DEMO_DISCLAIMER}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  title: {
    fontFamily: 'EBGaramond_600SemiBold',
    fontSize: 26,
    paddingHorizontal: 20,
    marginBottom: 18,
  },
  carousel: {
    paddingHorizontal: 20,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: 16,
    marginBottom: 24,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  detailCard: {
    marginHorizontal: 20,
    borderRadius: 18,
    borderWidth: 1,
    padding: 20,
  },
  cardName: {
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 17,
    marginBottom: 16,
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  balanceRight: { alignItems: 'flex-end' },
  detailLabel: {
    fontFamily: 'Outfit_500Medium',
    fontSize: 9,
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  balanceValue: {
    fontFamily: 'EBGaramond_600SemiBold',
    fontSize: 32,
  },
  detailValue: {
    fontFamily: 'Outfit_500Medium',
    fontSize: 14,
    marginTop: 8,
  },
  dueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    paddingVertical: 14,
    marginBottom: 16,
  },
  dueItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dueText: {
    fontFamily: 'Outfit_500Medium',
    fontSize: 12,
  },
  rewardsTitle: {
    fontFamily: 'Outfit_500Medium',
    fontSize: 9,
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  rewardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  rewardLabel: {
    fontFamily: 'Outfit_400Regular',
    fontSize: 14,
  },
  rewardValue: {
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 14,
  },
  issuer: {
    fontFamily: 'Outfit_400Regular',
    fontSize: 10,
    marginTop: 12,
    lineHeight: 15,
  },
  disclaimer: {
    fontFamily: 'Outfit_400Regular',
    fontSize: 11,
    lineHeight: 16,
    paddingHorizontal: 20,
    marginTop: 24,
  },
});
