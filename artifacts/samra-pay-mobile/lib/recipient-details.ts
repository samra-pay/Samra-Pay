export type RecipientDelivery = 'wallet' | 'bank';

export interface RecipientDetails {
  delivery: RecipientDelivery;
  phone: string;
  walletId: string | null;
  bankId: string | null;
  accountNumber: string;
}

export function isPhoneNumberValid(phone: string): boolean {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 9 && digits.length <= 15;
}

export function isAccountNumberValid(accountNumber: string): boolean {
  const digits = accountNumber.replace(/\s/g, '');
  return /^\d{8,20}$/.test(digits);
}

export function hasValidRecipientDetails({
  delivery,
  phone,
  walletId,
  bankId,
  accountNumber,
}: RecipientDetails): boolean {
  if (delivery === 'wallet') {
    return walletId !== null && isPhoneNumberValid(phone);
  }

  return bankId !== null && isAccountNumberValid(accountNumber);
}