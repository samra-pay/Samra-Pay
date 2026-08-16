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
  /** Full 16-digit illustrative card number (no spaces) */
  number: string;
  last4: string;
  expiry: string;
  cvc: string;
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
    number: '4485204856714242',
    last4: '4242',
    expiry: '08/29',
    cvc: '924',
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
    number: '5273041198324242',
    last4: '4242',
    expiry: '11/27',
    cvc: '314',
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
    number: '4622119038541991',
    last4: '1991',
    expiry: '03/28',
    cvc: '749',
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

export const MOBILE_WALLETS = [
  { id: 'telebirr', label: 'telebirr' },
  { id: 'mpesa', label: 'M-PESA Ethiopia' },
  { id: 'hellocash', label: 'HelloCash' },
  { id: 'amole', label: 'Amole' },
] as const;

export const RECIPIENT_BANKS = [
  { id: 'cbe', label: 'Commercial Bank of Ethiopia' },
  { id: 'awash', label: 'Awash Bank' },
  { id: 'abyssinia', label: 'Bank of Abyssinia' },
  { id: 'dashen', label: 'Dashen Bank' },
  { id: 'coop-oromia', label: 'Cooperative Bank of Oromia' },
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

// ─── ShebaMiles rewards — mirrored from web /dashboard/rewards ────────────────

export const SHEBA_MILES = {
  balance: 42500,
  earnedThisMonth: 1240,
  nextGoal: {
    label: 'Round trip to Addis',
    target: 50000,
  },
  memberSince: '2024',
};

export interface MilesActivity {
  id: number;
  label: string;
  date: string;
  miles: number;
}

export const MILES_HISTORY: MilesActivity[] = [
  { id: 1, label: 'Ethiopian Airlines — DC to Addis', date: 'Today', miles: 2460 },
  { id: 2, label: 'Charge Card spend bonus', date: 'Jun 14', miles: 180 },
  { id: 3, label: 'Remittance reward — Almaz', date: 'Jun 10', miles: 500 },
  { id: 4, label: 'Buna Cafe — 2x dining', date: 'Jun 8', miles: 28 },
  { id: 5, label: 'Monthly member bonus', date: 'Jun 1', miles: 1000 },
];

export interface RewardItem {
  id: string;
  title: string;
  description: string;
  cost: number;
  tag?: string;
  icon: string; // Feather icon name
}

export const REWARDS_CATALOG: RewardItem[] = [
  {
    id: 'addis-roundtrip',
    title: 'Round Trip to Addis Ababa',
    description: 'Economy round trip on Ethiopian Airlines, from any US gateway',
    cost: 50000,
    tag: 'Most Popular',
    icon: 'send',
  },
  {
    id: 'cloud-nine',
    title: 'Cloud Nine Seat Upgrade',
    description: 'Upgrade booked flight to Cloud Nine business class',
    cost: 25000,
    icon: 'star',
  },
  {
    id: 'lounge-pass',
    title: 'Sheba Lounge Pass',
    description: 'One-day access in Addis, DC, Newark',
    cost: 8000,
    icon: 'coffee',
  },
  {
    id: 'transfer-miles',
    title: 'Transfer Miles to Family',
    description: "Send to a family member's ShebaMiles account — from DC to Addis in seconds",
    cost: 10000,
    tag: 'Diaspora Favorite',
    icon: 'users',
  },
];

// ─── Per-card transaction ledgers — mirrored from web /dashboard/cards ───────

export interface CardTransaction {
  id: number;
  merchant: string;
  date: string;
  amount: number;
  category: string;
  points?: string;
}

export const CARD_TRANSACTIONS: Record<CardVariant, CardTransaction[]> = {
  debit: [
    { id: 1, merchant: 'TechCorp Inc (Payroll)', date: 'Jun 15', amount: 3200, category: 'Income' },
    { id: 2, merchant: 'Equity Apartments', date: 'Jun 1', amount: -1850, category: 'Housing' },
    { id: 3, merchant: 'Zelle: Almaz T.', date: 'May 28', amount: -150, category: 'Transfer' },
    { id: 4, merchant: 'Whole Foods', date: 'May 25', amount: -85.2, category: 'Groceries' },
    { id: 5, merchant: 'ATM Withdrawal', date: 'May 20', amount: -100, category: 'Cash' },
    { id: 6, merchant: 'Verizon Wireless', date: 'May 18', amount: -95, category: 'Utilities' },
  ],
  charge: [
    { id: 1, merchant: 'Buna Cafe', date: 'Yesterday', amount: -14.5, category: 'Dining', points: '+14 pts' },
    { id: 2, merchant: 'Uber', date: 'Jun 14', amount: -24, category: 'Transport', points: '+48 pts (2x)' },
    { id: 3, merchant: 'Whole Foods', date: 'Jun 12', amount: -142.2, category: 'Groceries', points: '+142 pts' },
    { id: 4, merchant: 'Tomoca Social House', date: 'Jun 10', amount: -35, category: 'Dining', points: '+35 pts' },
    { id: 5, merchant: 'Hyatt', date: 'Jun 5', amount: -450, category: 'Travel', points: '+900 pts (2x)' },
    { id: 6, merchant: 'Payment Received', date: 'Jun 1', amount: 1150, category: 'Payment' },
  ],
  airlines: [
    { id: 1, merchant: 'Ethiopian Airlines', date: 'Today', amount: -820, category: 'Travel', points: '+2,460 miles (3x)' },
    { id: 2, merchant: 'Le Diplomat', date: 'Jun 16', amount: -185, category: 'Dining', points: '+370 miles (2x)' },
    { id: 3, merchant: 'Whole Foods', date: 'Jun 12', amount: -95.5, category: 'Groceries', points: '+191 miles (2x)' },
    { id: 4, merchant: 'Duty Free ADD', date: 'May 28', amount: -120, category: 'Shopping', points: '+120 miles' },
    { id: 5, merchant: 'Uber', date: 'May 28', amount: -45, category: 'Transport', points: '+45 miles' },
    { id: 6, merchant: 'Payment Received', date: 'May 25', amount: 1500, category: 'Payment' },
  ],
};

// ─── Settings / profile — mirrored from web /dashboard/settings ──────────────

export const SETTINGS_PROFILE = {
  firstName: 'Selam',
  lastName: 'Tadesse',
  email: 'selam.t@example.com',
  phone: '+1 (555) 123-4567',
  initials: 'ST',
  memberSince: '2024',
};

export const NOTIFICATION_PREFS = [
  {
    id: 'large-tx',
    label: 'Large Transactions',
    detail: 'Get alerted for purchases over $500',
    enabled: true,
  },
  {
    id: 'intl',
    label: 'International Spending',
    detail: 'Alerts for non-US transactions',
    enabled: true,
  },
  {
    id: 'marketing',
    label: 'Marketing & Offers',
    detail: 'Updates on Tomoca Social House events and promos',
    enabled: false,
  },
] as const;

export const SECURITY_ITEMS = [
  { id: 'password', label: 'Password', detail: 'Last changed 3 months ago', action: 'Update', icon: 'lock' },
  { id: '2fa', label: 'Two-Factor Authentication', detail: 'Secure your account with SMS or Authenticator', action: 'Configure', icon: 'shield' },
  { id: 'devices', label: 'Trusted Devices', detail: 'Manage devices that can access your account', action: 'Manage', icon: 'smartphone' },
] as const;

export function formatMiles(n: number): string {
  return n.toLocaleString('en-US');
}

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
