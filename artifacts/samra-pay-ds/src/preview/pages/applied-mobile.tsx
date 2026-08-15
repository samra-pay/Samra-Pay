import {
  ArrowDownLeft,
  ArrowUpRight,
  Home,
  Plane,
  Receipt,
  Signal,
  User,
  Wallet,
  Wifi,
} from 'lucide-react';
import { Avatar, AvatarFallback } from '../../components/ui/avatar';
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from '../../components/ui/item';
import { BankCard } from '../../components/patterns/bank-card';
import { Guidelines } from '../parts';

/* ─── Fixed demo data: Aug 14, 2026 ───────────────────────────────────────── */

const QUICK_ACTIONS = [
  { label: 'Send', icon: ArrowUpRight },
  { label: 'Receive', icon: ArrowDownLeft },
  { label: 'Bills', icon: Receipt },
  { label: 'Top up', icon: Wallet },
];

type Activity = {
  id: string;
  title: string;
  meta: string;
  amount: string;
  initials: string;
  tone: 'coffee' | 'eucalyptus' | 'berbere';
  positive?: boolean;
};

const ACTIVITY: Activity[] = [
  { id: 'a1', title: 'Selam Tesfaye', meta: 'Sent · Aug 14, 2026', amount: '−$120.00', initials: 'ST', tone: 'coffee' },
  { id: 'a2', title: 'Direct deposit', meta: 'Received · Aug 13, 2026', amount: '+$3,200.00', initials: 'DD', tone: 'eucalyptus', positive: true },
  { id: 'a3', title: 'Buna Cafe', meta: 'Charge card · Aug 12, 2026', amount: '−$14.50', initials: 'BC', tone: 'berbere' },
];

const TABS = [
  { label: 'Home', icon: Home, active: true },
  { label: 'Send', icon: Plane, active: false },
  { label: 'Wallet', icon: Wallet, active: false },
  { label: 'Profile', icon: User, active: false },
];

const toneClass: Record<Activity['tone'], string> = {
  coffee: 'bg-coffee text-coffee-foreground',
  eucalyptus: 'bg-eucalyptus text-eucalyptus-foreground',
  berbere: 'bg-berbere text-berbere-foreground',
};

function IllustrativeTag() {
  return (
    <span className="inline-flex items-center rounded-full border border-primary/30 bg-accent/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
      Illustrative
    </span>
  );
}

export function AppliedMobilePage() {
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="space-y-2 rounded-xl border bg-card p-6 text-card-foreground">
        <h1 className="font-serif text-3xl">Applied — Mobile home</h1>
        <p className="text-sm text-muted-foreground">
          A phone-shaped recreation of the Samra Pay home screen, built from the
          same tokens as every other surface: a co-brand BankCard at small size,
          gold quick-action buttons, an Item-based activity feed, and a
          token-driven bottom tab bar.
        </p>
        <p className="text-xs text-muted-foreground">
          All balances and amounts are <IllustrativeTag /> demo values on a fixed
          date of Aug 14, 2026.
        </p>
      </div>

      {/* Centered phone frame */}
      <div className="flex justify-center py-4">
        <div className="w-[390px] max-w-full overflow-hidden rounded-[2.5rem] border bg-background text-foreground shadow-e4">
          {/* Status bar */}
          <div className="flex items-center justify-between px-6 pt-3 pb-1 text-xs font-medium text-muted-foreground">
            <span className="tabular-nums">9:41</span>
            <span className="flex items-center gap-1.5" aria-hidden="true">
              <Signal className="size-3.5" />
              <Wifi className="size-3.5" />
              <span className="rounded-sm border border-muted-foreground/50 px-1 text-[9px] leading-tight">
                82%
              </span>
            </span>
          </div>

          {/* App header: avatar + bilingual greeting */}
          <div className="flex items-center justify-between px-6 pb-4 pt-2">
            <div>
              <p className="text-sm font-medium">Selam, Selam</p>
              <p
                className="font-ethiopic text-xs leading-relaxed text-muted-foreground"
                lang="am"
              >
                ሰላም፣ ሰላም
              </p>
            </div>
            <Avatar className="size-9">
              <AvatarFallback className="bg-coffee text-coffee-foreground">
                SB
              </AvatarFallback>
            </Avatar>
          </div>

          {/* Balance + card */}
          <div className="px-6">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Available balance
            </p>
            <p className="mt-1 font-serif text-3xl tabular-nums">$1,240.00</p>
            <p className="mt-1 text-xs text-muted-foreground">
              ≈ ETB 223,200 · <IllustrativeTag /> rate
            </p>

            <div className="mt-4">
              <BankCard
                variant="co-brand"
                cardholderName="SELAM BEKELE"
                last4="4242"
                expiry="08/29"
                coBrandSlot="ETHIOPIAN"
              />
            </div>
          </div>

          {/* Quick actions — gold icon buttons */}
          <div className="mt-6 grid grid-cols-4 gap-2 px-6">
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action.label}
                type="button"
                className="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-card p-2 text-[11px] font-medium text-muted-foreground transition-colors duration-standard hover:border-primary/40 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <span className="flex size-10 items-center justify-center rounded-full bg-gradient-to-br from-primary/90 to-primary text-primary-foreground shadow-gold-sm">
                  <action.icon className="size-4" />
                </span>
                <span className="text-foreground">{action.label}</span>
              </button>
            ))}
          </div>

          {/* Recent activity */}
          <div className="mt-6 px-6">
            <div className="mb-2 flex items-baseline justify-between">
              <p className="text-sm font-medium">Recent activity</p>
              <span className="text-xs text-primary">See all</span>
            </div>
            <ItemGroup className="rounded-xl border bg-card p-1">
              {ACTIVITY.map((a, i) => (
                <div key={a.id}>
                  {i > 0 ? <ItemSeparator /> : null}
                  <Item size="sm">
                    <ItemMedia>
                      <Avatar className="size-8">
                        <AvatarFallback className={toneClass[a.tone]}>
                          {a.initials}
                        </AvatarFallback>
                      </Avatar>
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle>{a.title}</ItemTitle>
                      <ItemDescription>{a.meta}</ItemDescription>
                    </ItemContent>
                    <span
                      className={`text-sm font-medium tabular-nums ${
                        a.positive ? 'text-eucalyptus-foreground' : 'text-foreground'
                      }`}
                    >
                      {a.amount}
                    </span>
                  </Item>
                </div>
              ))}
            </ItemGroup>
            <p className="mt-2 text-[10px] text-muted-foreground">
              <IllustrativeTag /> demo activity.
            </p>
          </div>

          {/* Bottom tab bar — built from tokens */}
          <nav
            aria-label="Primary"
            className="mt-6 grid grid-cols-4 border-t bg-card"
          >
            {TABS.map((tab) => (
              <button
                key={tab.label}
                type="button"
                aria-current={tab.active ? 'page' : undefined}
                className={`flex flex-col items-center gap-1 py-3 text-[10px] font-medium transition-colors duration-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${
                  tab.active
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <tab.icon className="size-5" />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Guidelines */}
      <div className="rounded-xl border bg-card p-6 text-card-foreground">
        <Guidelines
          items={[
            {
              kind: 'do',
              text: 'Bound the mobile screen in a phone-shaped container (rounded-[2.5rem], border, shadow-e4) so the preview reads as a device, not a full-bleed page.',
            },
            {
              kind: 'do',
              text: 'Scale the BankCard down in a container-query-aware slot — the pattern reflows its type and logos automatically, so it stays legible at phone width.',
            },
            {
              kind: 'do',
              text: 'Build the tab bar and quick actions from tokens (primary, muted-foreground, card) so the same screen holds up in light and dark modes.',
            },
            {
              kind: 'dont',
              text: 'Hard-code a device colour or drop-shadow hex; every surface here is a semantic or cultural token, with fixed art confined to the card face.',
            },
            {
              kind: 'dont',
              text: 'Present the co-brand slot text as a live airline partnership — it is an illustrative wordmark for the demo card.',
            },
          ]}
        />
      </div>
    </div>
  );
}
