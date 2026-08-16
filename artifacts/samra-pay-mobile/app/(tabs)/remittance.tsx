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
import { useColors } from '@workspace/samra-pay-ds/hooks/use-colors';
import { nativeTheme } from '@workspace/samra-pay-ds/lib/native-theme';
import { useTransfers } from '@/context/TransferContext';
import {
  hasValidRecipientDetails,
} from '@/lib/recipient-details';
import {
  CARD_FEE_RATE,
  DELIVERY_OPTIONS,
  FUNDING_OPTIONS,
  MOBILE_WALLETS,
  PROMO_RATE,
  RECIPIENT_BANKS,
  REMITTANCE_STATS,
  STANDARD_RATE,
  formatEtb,
  formatUsd,
} from '@/lib/mock-data';

type DeliveryId = (typeof DELIVERY_OPTIONS)[number]['id'];
type FundingId = (typeof FUNDING_OPTIONS)[number]['id'];
type RecipientBankId = (typeof RECIPIENT_BANKS)[number]['id'];
type MobileWalletId = (typeof MOBILE_WALLETS)[number]['id'];
type Step = 'form' | 'review' | 'success';

function getTodayLabel() {
  return 'Today';
}

export default function RemittanceScreen() {
  const colors = useColors('dark');
  const insets = useSafeAreaInsets();
  const { addTransfer } = useTransfers();

  const [step, setStep] = useState<Step>('form');
  const [amountText, setAmountText] = useState<string>('1000');
  const [delivery, setDelivery] = useState<DeliveryId>('bank');
  const [funding, setFunding] = useState<FundingId>('samra');
  const [recipientName, setRecipientName] = useState<string>('Almaz Tesfaye');
  const [recipientPhone, setRecipientPhone] = useState<string>('');
  const [recipientWallet, setRecipientWallet] = useState<MobileWalletId | null>(null);
  const [recipientBank, setRecipientBank] = useState<RecipientBankId | null>(null);
  const [recipientAccountNumber, setRecipientAccountNumber] = useState<string>('');
  const [walletPickerOpen, setWalletPickerOpen] = useState<boolean>(false);
  const [bankPickerOpen, setBankPickerOpen] = useState<boolean>(false);

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
  const recipientWalletLabel =
    MOBILE_WALLETS.find((wallet) => wallet.id === recipientWallet)?.label ?? '';
  const recipientBankLabel =
    RECIPIENT_BANKS.find((bank) => bank.id === recipientBank)?.label ?? '';

  const recipientValid = recipientName.trim().length > 0;
  const recipientDestinationValid = hasValidRecipientDetails({
    delivery,
    phone: recipientPhone,
    walletId: recipientWallet,
    bankId: recipientBank,
    accountNumber: recipientAccountNumber,
  });
  const canContinue = amount > 0 && recipientValid && recipientDestinationValid;

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
        <Text style={[styles.successTitle, { color: colors.foreground }]}>Transfer sent!</Text>
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
        <Text style={[styles.reviewTitle, { color: colors.foreground }]}>Review transfer</Text>
        <Text style={[styles.reviewSub, { color: colors.mutedForeground }]}>
          Please confirm the details below.
        </Text>

        <View
          style={[styles.reviewCard, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <Row label="Recipient" value={recipientName} colors={colors} />
          {delivery === 'wallet' ? (
            <>
              <Row label="Mobile wallet" value={recipientWalletLabel} colors={colors} />
              <Row label="Mobile number" value={recipientPhone.trim()} colors={colors} />
            </>
          ) : (
            <>
              <Row label="Recipient bank" value={recipientBankLabel} colors={colors} />
              <Row
                label="Account number"
                value={recipientAccountNumber.trim()}
                colors={colors}
              />
            </>
          )}
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
      <Text style={[styles.title, { color: colors.foreground }]}>Send money home</Text>
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
            style={[styles.amountInput, { color: colors.foreground }]}
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

      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Delivery method</Text>
      <View style={styles.optionRow}>
        {DELIVERY_OPTIONS.map((opt) => {
          const active = delivery === opt.id;
          return (
            <Pressable
              key={opt.id}
              testID={`delivery-${opt.id}`}
              onPress={() => {
                setDelivery(opt.id);
                setWalletPickerOpen(false);
                setBankPickerOpen(false);
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

      {/* Recipient */}
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Recipient details</Text>
      <View style={[styles.calcCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.label, { color: colors.mutedForeground }]}>RECIPIENT NAME</Text>
        <View style={[styles.recipientWrap, { borderColor: colors.input }]}>
          <Feather name="user" size={15} color={colors.mutedForeground} style={{ marginRight: 8 }} />
          <TextInput
            testID="recipient-name"
            style={[styles.recipientInput, { color: colors.foreground }]}
            value={recipientName}
            onChangeText={setRecipientName}
            placeholder="Full name"
            placeholderTextColor={colors.mutedForeground}
          />
        </View>

        {delivery === 'wallet' ? (
          <>
            <View style={styles.recipientField}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>MOBILE WALLET</Text>
              <Pressable
                testID="recipient-wallet-picker"
                accessibilityRole="button"
                accessibilityState={{ expanded: walletPickerOpen }}
                onPress={() => {
                  Haptics.selectionAsync();
                  setWalletPickerOpen((open) => !open);
                }}
                style={({ pressed }) => [
                  styles.bankPicker,
                  {
                    borderColor: colors.input,
                    opacity: pressed ? 0.75 : 1,
                  },
                ]}
              >
                <View style={styles.bankPickerContent}>
                  <Feather name="smartphone" size={15} color={colors.mutedForeground} />
                  <Text
                    style={[
                      styles.bankPickerValue,
                      { color: recipientWalletLabel ? colors.foreground : colors.mutedForeground },
                    ]}
                  >
                    {recipientWalletLabel || 'Choose mobile wallet'}
                  </Text>
                </View>
                <Feather
                  name={walletPickerOpen ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={colors.mutedForeground}
                />
              </Pressable>
              {walletPickerOpen ? (
                <View
                  testID="recipient-wallet-options"
                  style={[
                    styles.bankMenu,
                    { backgroundColor: colors.background, borderColor: colors.border },
                  ]}
                >
                  {MOBILE_WALLETS.map((wallet) => {
                    const active = wallet.id === recipientWallet;
                    return (
                      <Pressable
                        key={wallet.id}
                        testID={`recipient-wallet-${wallet.id}`}
                        onPress={() => {
                          setRecipientWallet(wallet.id);
                          setWalletPickerOpen(false);
                          Haptics.selectionAsync();
                        }}
                        style={({ pressed }) => [
                          styles.bankOption,
                          {
                            backgroundColor: active ? colors.accent : colors.background,
                            opacity: pressed ? 0.7 : 1,
                          },
                        ]}
                      >
                        <Text style={[styles.bankOptionText, { color: colors.foreground }]}>
                          {wallet.label}
                        </Text>
                        {active ? <Feather name="check" size={16} color={colors.primary} /> : null}
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </View>
            <View style={styles.recipientField}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>MOBILE NUMBER</Text>
              <View style={[styles.recipientWrap, { borderColor: colors.input }]}>
                <Feather name="phone" size={15} color={colors.mutedForeground} style={{ marginRight: 8 }} />
                <TextInput
                  testID="recipient-phone"
                  style={[styles.recipientInput, { color: colors.foreground }]}
                  value={recipientPhone}
                  onChangeText={setRecipientPhone}
                  keyboardType="phone-pad"
                  textContentType="telephoneNumber"
                  placeholder="+251 9XX XXX XXX"
                  placeholderTextColor={colors.mutedForeground}
                />
              </View>
              <Text style={[styles.fieldHelp, { color: colors.mutedForeground }]}>
                Enter the number registered with the selected mobile wallet.
              </Text>
            </View>
          </>
        ) : (
          <>
            <View style={styles.recipientField}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>RECIPIENT BANK</Text>
              <Pressable
                testID="recipient-bank-picker"
                accessibilityRole="button"
                accessibilityState={{ expanded: bankPickerOpen }}
                onPress={() => {
                  Haptics.selectionAsync();
                  setBankPickerOpen((open) => !open);
                }}
                style={({ pressed }) => [
                  styles.bankPicker,
                  {
                    borderColor: colors.input,
                    opacity: pressed ? 0.75 : 1,
                  },
                ]}
              >
                <View style={styles.bankPickerContent}>
                  <Feather name="home" size={15} color={colors.mutedForeground} />
                  <Text
                    style={[
                      styles.bankPickerValue,
                      { color: recipientBankLabel ? colors.foreground : colors.mutedForeground },
                    ]}
                  >
                    {recipientBankLabel || 'Choose recipient bank'}
                  </Text>
                </View>
                <Feather
                  name={bankPickerOpen ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={colors.mutedForeground}
                />
              </Pressable>
              {bankPickerOpen ? (
                <View
                  testID="recipient-bank-options"
                  style={[
                    styles.bankMenu,
                    { backgroundColor: colors.background, borderColor: colors.border },
                  ]}
                >
                  {RECIPIENT_BANKS.map((bank) => {
                    const active = bank.id === recipientBank;
                    return (
                      <Pressable
                        key={bank.id}
                        testID={`recipient-bank-${bank.id}`}
                        onPress={() => {
                          setRecipientBank(bank.id);
                          setBankPickerOpen(false);
                          Haptics.selectionAsync();
                        }}
                        style={({ pressed }) => [
                          styles.bankOption,
                          {
                            backgroundColor: active ? colors.accent : colors.background,
                            opacity: pressed ? 0.7 : 1,
                          },
                        ]}
                      >
                        <Text style={[styles.bankOptionText, { color: colors.foreground }]}>
                          {bank.label}
                        </Text>
                        {active ? <Feather name="check" size={16} color={colors.primary} /> : null}
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </View>

            <View style={styles.recipientField}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>ACCOUNT NUMBER</Text>
              <View style={[styles.recipientWrap, { borderColor: colors.input }]}>
                <Feather name="hash" size={15} color={colors.mutedForeground} style={{ marginRight: 8 }} />
                <TextInput
                  testID="recipient-account-number"
                  style={[styles.recipientInput, { color: colors.foreground }]}
                  value={recipientAccountNumber}
                  onChangeText={(value) => setRecipientAccountNumber(value.replace(/\D/g, ''))}
                  keyboardType="number-pad"
                  placeholder="8–20 digits"
                  placeholderTextColor={colors.mutedForeground}
                  maxLength={20}
                />
              </View>
              <Text style={[styles.fieldHelp, { color: colors.mutedForeground }]}>
                Confirm the account number with the recipient before sending.
              </Text>
            </View>
          </>
        )}
      </View>

      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Pay with</Text>
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
                  backgroundColor: active && opt.recommended ? colors.accent : colors.card,
                  borderColor: active ? colors.primary : colors.border,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              {opt.recommended ? (
                <View
                  testID="funding-samra-badge"
                  style={[styles.recommendBadge, { backgroundColor: colors.primary }]}
                >
                  <Text style={[styles.recommendBadgeText, { color: colors.primaryForeground }]}>
                    BEST VALUE
                  </Text>
                </View>
              ) : null}
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
          <Text style={[styles.totalValue, { color: colors.foreground }]}>{formatUsd(total)}</Text>
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
  colors: ReturnType<typeof import('@workspace/samra-pay-ds/hooks/use-colors').useColors>;
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

const font = nativeTheme.fontFamily;

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  label: {
    fontFamily: font.sans.regular,
    fontSize: 13,
  },
  value: {
    fontFamily: font.sans.medium,
    fontSize: 13,
  },
  bold: {
    fontFamily: font.sans.bold,
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
    fontFamily: font.serif.semibold,
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
    fontFamily: font.sans.medium,
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
    fontFamily: font.sans.medium,
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
    fontFamily: font.sans.medium,
    fontSize: 17,
    padding: 0,
  },
  recipientField: {
    marginTop: 18,
  },
  fieldHelp: {
    fontFamily: font.sans.regular,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 8,
  },
  bankPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    paddingBottom: 10,
  },
  bankPickerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 8,
  },
  bankPickerValue: {
    fontFamily: font.sans.medium,
    fontSize: 16,
    flex: 1,
  },
  bankMenu: {
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 10,
    overflow: 'hidden',
  },
  bankOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  bankOptionText: {
    fontFamily: font.sans.medium,
    fontSize: 14,
  },
  amountWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    paddingBottom: 8,
    marginBottom: 18,
  },
  dollar: {
    fontFamily: font.sans.semibold,
    fontSize: 28,
    marginRight: 6,
  },
  amountInput: {
    flex: 1,
    fontFamily: font.sans.bold,
    fontSize: 34,
    padding: 0,
  },
  receiveRow: {},
  receiveValue: {
    fontFamily: font.serif.semibold,
    fontSize: 36,
    marginBottom: 4,
  },
  compare: {
    fontFamily: font.sans.regular,
    fontSize: 12,
  },
  sectionTitle: {
    fontFamily: font.serif.semibold,
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
    fontFamily: font.sans.semibold,
    fontSize: 13,
  },
  optionDetail: {
    fontFamily: font.sans.regular,
    fontSize: 11,
  },
  recommendBadge: {
    position: 'absolute',
    top: -9,
    right: 10,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  recommendBadgeText: {
    fontFamily: font.sans.semibold,
    fontSize: 9,
    letterSpacing: 0.6,
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
    fontFamily: font.sans.regular,
    fontSize: 13,
  },
  summaryValue: {
    fontFamily: font.sans.medium,
    fontSize: 13,
  },
  summaryTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    paddingTop: 12,
  },
  totalValue: {
    fontFamily: font.sans.bold,
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
    fontFamily: font.sans.bold,
    fontSize: 15,
  },
  statLabel: {
    fontFamily: font.sans.regular,
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
    fontFamily: font.sans.bold,
    fontSize: 16,
  },
  ghostBtn: {
    alignItems: 'center',
    paddingVertical: 14,
    marginHorizontal: 20,
  },
  ghostBtnText: {
    fontFamily: font.sans.medium,
    fontSize: 14,
  },

  // Review
  reviewTitle: {
    fontFamily: font.serif.semibold,
    fontSize: 28,
    marginBottom: 6,
    marginTop: 12,
  },
  reviewSub: {
    fontFamily: font.sans.regular,
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
    fontFamily: font.sans.regular,
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
    fontFamily: font.serif.semibold,
    fontSize: 32,
    textAlign: 'center',
    marginBottom: 8,
  },
  successSub: {
    fontFamily: font.sans.medium,
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 4,
  },
  successDetail: {
    fontFamily: font.sans.regular,
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
