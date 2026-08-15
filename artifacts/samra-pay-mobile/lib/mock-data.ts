/**
 * Illustrative demo data — mirrored from the Samra Pay web dashboard
 * (artifacts/samra-pay/src). All figures are illustrative and not real offers.
 */

export const PROFILE = {
  name: 'Selam Tesfaye',
  firstName: 'Selam',
  cardholder: 'SELAM T.',
  location: 'Addis Ababa',
};

export const CHECKING_BALANCE = 4250;

export interface SpendingCategory {
  category: string;
  amount: number;
  icon: string; // Feather icon name
}

export const SPENDING_DATA: SpendingCategory[] = [
  { category: 'Travel', amount: 820, icon: 'send' },
  { category: 'Dining', amount: 450, icon: 'coffee' },
  { category: 'Shopping', amount: 320, icon: 'shopping-bag' },
  { category: 'Transport', amount: 150, icon: 'truck' },
];

export interface Transaction {
  id: number;
  merchant: string;
  date: string;
  amount: number;
  category: string;
  card: string;
  points?: string;
}

export const RECENT_TRANSACTIONS: Transaction[] = [
  { id: 1, merchant: 'Ethiopian Airlines', date: 'Today', amount: -820.0, category: 'Travel', card: 'Airlines Co-brand', points: '+2,460 miles' },
  { id: 2, merchant: 'Buna Cafe', date: 'Yesterday', amount: -14.5, category: 'Dining', card: 'Charge Card', points: '+14 points' },
  { id: 3, merchant: 'Direct Deposit', date: 'Jun 15', amount: 3200.0, category: 'Income', card: 'Checking' },
  { id: 4, merchant: 'Uber', date: 'Jun 14', amount: -24.0, category: 'Transport', card: 'Charge Card', points: '+24 points' },
  { id: 5, merchant: 'Whole Foods', date: 'Jun 12', amount: -142.2, category: 'Groceries', card: 'Charge Card', points: '+142 points' },
];

export type CardVariant = 'debit' | 'charge' | 'airlines';

export interface CardInfo {
  id: CardVariant;
  name: string;
  shortName: string;
  last4: string;
  expiry: string;
  balanceLabel: string;
  balance: number;
  limit: string;
  due?: string;
  minDue?: number;
  autopay?: boolean;
  rewards: { label: string; value: string }[];
  issuer: string;
}

export const CARDS: CardInfo[] = [
  {
    id: 'debit',
    name: 'Samra Pay Checking',
    shortName: 'Debit',
    last4: '4242',
    expiry: '08/29',
    balanceLabel: 'Available balance',
    balance: CHECKING_BALANCE,
    limit: '—',
    rewards: [{ label: 'Everyday spend', value: 'No fees' }],
    issuer: 'Samra Pay Debit · Issued by Samra Financial S.C., Addis Ababa',
  },
  {
    id: 'charge',
    name: 'Samra Pay Charge Card',
    shortName: 'Charge',
    last4: '4242',
    expiry: '08/29',
    balanceLabel: 'Current balance',
    balance: 1240,
    limit: 'No preset limit',
    due: 'Jul 2',
    minDue: 35,
    autopay: true,
    rewards: [
      { label: 'Travel', value: '2x points' },
      { label: 'Dining', value: '1x points' },
      { label: 'Conversion', value: '1:1 ShebaMiles' },
    ],
    issuer: 'Samra Pay Charge · Issued by Samra Financial S.C., Addis Ababa',
  },
  {
    id: 'airlines',
    name: 'Airlines Premium',
    shortName: 'Airlines',
    last4: '1991',
    expiry: '08/29',
    balanceLabel: 'Current balance',
    balance: 3450,
    limit: '$15,000 limit',
    due: 'Jul 8',
    minDue: 89,
    autopay: false,
    rewards: [
      { label: 'EA Flights', value: '3x miles' },
      { label: 'Dining & Groceries', value: '2x miles' },
      { label: 'Everything else', value: '1x miles' },
    ],
    issuer: 'Samra Pay × Ethiopian Airlines · Issued by Samra Financial S.C.',
  },
];

// Remittance calculator — mirrored from web remittance page
export const PROMO_RATE = 180; // 1 USD = 180 ETB (illustrative demo rate)
export const STANDARD_RATE = 115;
export const CARD_FEE_RATE = 0.03;

export const DELIVERY_OPTIONS = [
  { id: 'wallet', label: 'Mobile money wallet', detail: 'Telebirr and more', icon: 'smartphone' },
  { id: 'bank', label: 'Bank account', detail: 'Direct to their bank', icon: 'home' },
] as const;

export const FUNDING_OPTIONS = [
  { id: 'card', label: 'Card', detail: '3% service fee', icon: 'credit-card' },
  { id: 'bank', label: 'Bank transfer', detail: 'No service fee', icon: 'repeat' },
] as const;

export const REMITTANCE_STATS = {
  ytdTotal: 1950,
  familyMembersSupported: 3,
  location: 'Addis Ababa',
};

export const DEMO_DISCLAIMER =
  'Balances, rates, rewards, and activity shown are illustrative. The Samra Pay experience is a product demo — it does not open accounts, extend credit, or move money.';

export function formatUsd(n: number, opts: { sign?: boolean } = {}): string {
  const abs = Math.abs(n);
  const formatted = abs.toLocaleString('en-US', {
    minimumFractionDigits: abs % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
  if (opts.sign) return `${n < 0 ? '-' : '+'}$${formatted}`;
  return `$${formatted}`;
}

export function formatEtb(n: number): string {
  return `${n.toLocaleString('en-US', { maximumFractionDigits: 0 })} ETB`;
}
