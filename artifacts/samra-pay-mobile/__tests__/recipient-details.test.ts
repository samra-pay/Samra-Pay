import { describe, expect, it } from 'vitest';
import {
  hasValidRecipientDetails,
  isAccountNumberValid,
  isPhoneNumberValid,
} from '@/lib/recipient-details';

describe('recipient delivery details', () => {
  it('accepts valid mobile money phone numbers', () => {
    expect(isPhoneNumberValid('+251 912 345 678')).toBe(true);
    expect(isPhoneNumberValid('91234567')).toBe(false);
  });

  it('accepts only numeric bank account numbers with 8–20 digits', () => {
    expect(isAccountNumberValid('1234567890')).toBe(true);
    expect(isAccountNumberValid('1234 5678 90')).toBe(true);
    expect(isAccountNumberValid('1234567')).toBe(false);
    expect(isAccountNumberValid('1234ABCD5678')).toBe(false);
  });

  it('requires a phone number for mobile money', () => {
    expect(
      hasValidRecipientDetails({
        delivery: 'wallet',
        phone: '+251 912 345 678',
        walletId: 'telebirr',
        bankId: null,
        accountNumber: '',
      }),
    ).toBe(true);
    expect(
      hasValidRecipientDetails({
        delivery: 'wallet',
        phone: '',
        walletId: 'telebirr',
        bankId: 'cbe',
        accountNumber: '1234567890',
      }),
    ).toBe(false);
  });

  it('requires a wallet selection for mobile money', () => {
    expect(
      hasValidRecipientDetails({
        delivery: 'wallet',
        phone: '+251 912 345 678',
        walletId: null,
        bankId: null,
        accountNumber: '',
      }),
    ).toBe(false);
  });

  it('requires both a bank selection and account number for bank delivery', () => {
    expect(
      hasValidRecipientDetails({
        delivery: 'bank',
        phone: '',
        walletId: null,
        bankId: 'cbe',
        accountNumber: '1234567890',
      }),
    ).toBe(true);
    expect(
      hasValidRecipientDetails({
        delivery: 'bank',
        phone: '',
        walletId: null,
        bankId: null,
        accountNumber: '1234567890',
      }),
    ).toBe(false);
  });
});