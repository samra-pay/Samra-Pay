import {
  ArrowLeftRight,
  ArrowUpRight,
  CreditCard,
  Home,
  Plane,
  PiggyBank,
  Receipt,
  Settings,
  Users,
} from 'lucide-react';
import { Area, AreaChart, CartesianGrid, XAxis } from 'recharts';
import { Avatar, AvatarFallback } from '../../components/ui/avatar';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import type { ChartConfig } from '../../components/ui/chart';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '../../components/ui/chart';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
} from '../../components/ui/sidebar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import { BankCard } from '../../components/patterns/bank-card';
import { RewardCard } from '../../components/patterns/reward-card';
import { Guidelines } from '../parts';

/* ─── Fixed demo date: Aug 14, 2026 ───────────────────────────────────────── */

const primaryNav = [
  { label: 'Home', icon: Home, active: true, badge: null },
  { label: 'Send money', icon: ArrowLeftRight, badge: null },
  { label: 'Recipients', icon: Users, badge: '8' },
  { label: 'Bills', icon: Receipt, badge: '2' },
];

const moneyNav = [
  { label: 'Cards', icon: CreditCard },
  { label: 'Savings', icon: PiggyBank },
  { label: 'Settings', icon: Settings },
];

/* chart-1 drives the single-series area (on-brand in light + dark). */
const trendConfig = {
  volume: { label: 'Sent home (USD)', color: 'var(--color-chart-1)' },
} satisfies ChartConfig;

const trendData = [
  { month: 'Mar', volume: 720 },
  { month: 'Apr', volume: 890 },
  { month: 'May', volume: 930 },
  { month: 'Jun', volume: 1130 },
  { month: 'Jul', volume: 1300 },
  { month: 'Aug', volume: 1240 },
];

type Transfer = {
  id: string;
  recipient: string;
  destination: string;
  date: string;
  sent: string;
  received: string;
  status: 'Delivered' | 'In transit' | 'Failed';
};

const transfers: Transfer[] = [
  {
    id: 'TX-4821',
    recipient: 'Selam Tesfaye',
    destination: 'Addis Ababa',
    date: 'Aug 14, 2026',
    sent: '$120.00',
    received: 'ETB 21,600',
    status: 'Delivered',
  },
  {
    id: 'TX-4820',
    recipient: 'Dawit Bekele',
    destination: 'Bahir Dar',
    date: 'Aug 12, 2026',
    sent: '$75.00',
    received: 'ETB 13,500',
    status: 'In transit',
  },
  {
    id: 'TX-4818',
    recipient: 'Hanna Girma',
    destination: 'Hawassa',
    date: 'Aug 09, 2026',
    sent: '$200.00',
    received: 'ETB 36,000',
    status: 'Delivered',
  },
  {
    id: 'TX-4815',
    recipient: 'Yonas Alemu',
    destination: 'Mekelle',
    date: 'Aug 05, 2026',
    sent: '$50.00',
    received: '—',
    status: 'Failed',
  },
];

function StatusBadge({ status }: { status: Transfer['status'] }) {
  if (status === 'Delivered') {
    return (
      <Badge className="bg-eucalyptus text-eucalyptus-foreground">
        Delivered
      </Badge>
    );
  }
  if (status === 'In transit') {
    return <Badge variant="secondary">In transit</Badge>;
  }
  return (
    <Badge className="bg-berbere text-berbere-foreground">Failed</Badge>
  );
}

/** An illustrative-figure badge — reused wherever a money claim appears. */
function IllustrativeTag() {
  return (
    <span className="inline-flex items-center rounded-full border border-primary/30 bg-accent/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
      Illustrative
    </span>
  );
}

export function AppliedDashboardPage() {
  return (
    <div className="space-y-6">
      {/* Page header — consistent with other preview pages */}
      <div className="space-y-2 rounded-xl border bg-card p-6 text-card-foreground">
        <h1 className="font-serif text-3xl">Applied — Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          A desktop account overview recreated{' '}
          <span className="italic text-primary">entirely</span> from design-system
          components and tokens — bounded Sidebar, gold Buttons, the signature
          BankCard and RewardCard patterns, a token-driven Chart, and a
          status-badged Table. No bespoke layout code, no hex outside the fixed
          card art.
        </p>
        <p className="text-xs text-muted-foreground">
          All balances, rates, and figures below are <IllustrativeTag /> demo
          values on a fixed date of Aug 14, 2026.
        </p>
      </div>

      {/* Bounded app shell */}
      <div className="overflow-hidden rounded-xl border bg-card text-card-foreground shadow-e2">
        <SidebarProvider className="min-h-0">
          <Sidebar collapsible="none">
            <SidebarHeader>
              <div className="flex items-baseline px-2 py-1 leading-none">
                <span className="font-sans text-lg font-extrabold lowercase tracking-tighter">
                  samra
                </span>
                <span className="ml-0.5 font-serif text-lg italic lowercase text-primary">
                  pay
                </span>
              </div>
            </SidebarHeader>
            <SidebarSeparator />
            <SidebarContent>
              <SidebarGroup>
                <SidebarGroupLabel>Banking</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {primaryNav.map((item) => (
                      <SidebarMenuItem key={item.label}>
                        <SidebarMenuButton isActive={item.active}>
                          <item.icon /> <span>{item.label}</span>
                        </SidebarMenuButton>
                        {item.badge ? (
                          <SidebarMenuBadge>{item.badge}</SidebarMenuBadge>
                        ) : null}
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
              <SidebarGroup>
                <SidebarGroupLabel>Money</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {moneyNav.map((item) => (
                      <SidebarMenuItem key={item.label}>
                        <SidebarMenuButton>
                          <item.icon /> <span>{item.label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>
            <SidebarFooter>
              <div className="flex items-center gap-2 px-2 py-1">
                <span className="flex size-7 items-center justify-center rounded-full bg-coffee text-xs font-semibold text-coffee-foreground">
                  SB
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">Selam Bekele</p>
                  <p className="truncate text-xs text-muted-foreground">
                    USD wallet
                  </p>
                </div>
              </div>
            </SidebarFooter>
          </Sidebar>

          {/* Main content — a plain bounded column, no fixed positioning */}
          <div className="min-w-0 flex-1 space-y-6 p-6">
            {/* Header: avatar + bilingual greeting */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <Avatar className="size-11">
                  <AvatarFallback className="bg-coffee text-coffee-foreground">
                    SB
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-serif text-xl leading-tight">
                    Selam, Selam Bekele
                  </p>
                  <p
                    className="font-ethiopic text-sm leading-relaxed text-muted-foreground"
                    lang="am"
                  >
                    ሰላም፣ ሰላም በቀለ — እንኳን ደህና መጡ።
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" size="sm">
                  <ArrowUpRight /> Receive
                </Button>
                <Button variant="gold" size="sm">
                  <Plane /> Send money
                </Button>
              </div>
            </div>

            {/* Balance + card row */}
            <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="flex flex-col justify-between rounded-2xl border bg-background p-6 shadow-e1">
                <div>
                  <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                    Available balance
                  </p>
                  <p className="mt-2 font-serif text-4xl tabular-nums">
                    $1,240.00
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    ≈ ETB 223,200 · <IllustrativeTag /> rate 1 USD = 180 ETB
                  </p>
                </div>
                <div className="mt-6 flex items-center gap-4 border-t pt-4 text-sm">
                  <span className="inline-flex items-center gap-1.5 text-eucalyptus-foreground">
                    <span className="size-2 rounded-full bg-eucalyptus" />
                    Checking
                  </span>
                  <span className="text-muted-foreground">
                    Sent home this year: <span className="text-foreground">$8,420</span>
                  </span>
                </div>
              </div>

              <div className="rounded-2xl border bg-background p-6 shadow-e1">
                <p className="mb-4 text-xs font-medium uppercase tracking-widest text-muted-foreground">
                  Your debit card
                </p>
                <div className="mx-auto max-w-[19rem]">
                  <BankCard
                    variant="debit"
                    cardholderName="SELAM BEKELE"
                    last4="4242"
                    expiry="08/29"
                  />
                </div>
              </div>
            </div>

            {/* Reward + chart row */}
            <div className="grid gap-6 lg:grid-cols-2">
              <RewardCard
                programName="ShebaMiles Rewards"
                points="42,500"
                unit="miles"
                tier="Gold"
                earnedNote="+1,240 earned this month"
                goalLabel="Next goal · Round trip to Addis"
                goalPercent={85}
                goalCeilingLabel="50,000 miles"
                action={{ label: 'Redeem in the Rewards hub' }}
              />

              <div className="rounded-2xl border bg-background p-6 shadow-e1">
                <div className="mb-4">
                  <p className="font-medium">Sent home over time</p>
                  <p className="text-sm text-muted-foreground">
                    Illustrative six-month trend (demo data).
                  </p>
                </div>
                <ChartContainer config={trendConfig} className="max-h-56 w-full">
                  <AreaChart data={trendData} accessibilityLayer>
                    <CartesianGrid vertical={false} />
                    <XAxis
                      dataKey="month"
                      tickLine={false}
                      axisLine={false}
                    />
                    <ChartTooltip
                      content={<ChartTooltipContent indicator="line" />}
                    />
                    <defs>
                      <linearGradient
                        id="fillDashboardVolume"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor="var(--color-volume)"
                          stopOpacity={0.4}
                        />
                        <stop
                          offset="95%"
                          stopColor="var(--color-volume)"
                          stopOpacity={0.05}
                        />
                      </linearGradient>
                    </defs>
                    <Area
                      dataKey="volume"
                      type="natural"
                      stroke="var(--color-volume)"
                      fill="url(#fillDashboardVolume)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ChartContainer>
              </div>
            </div>

            {/* Recent transactions */}
            <div className="rounded-2xl border bg-background p-6 shadow-e1">
              <div className="mb-4 flex items-baseline justify-between">
                <p className="font-medium">Recent transactions</p>
                <span className="text-xs text-muted-foreground">
                  <IllustrativeTag /> demo history
                </span>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>Recipient</TableHead>
                    <TableHead>Destination</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Sent</TableHead>
                    <TableHead className="text-right">Received</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transfers.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {t.id}
                      </TableCell>
                      <TableCell className="font-medium">
                        {t.recipient}
                      </TableCell>
                      <TableCell>{t.destination}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {t.date}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={t.status} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {t.sent}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {t.received}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <p className="text-xs text-muted-foreground">
              Every element on this screen — shell, cards, chart, and table — is a
              Samra Pay design-system component styled with semantic and cultural
              tokens. It reads correctly in both light and dark preview modes.
            </p>
          </div>
        </SidebarProvider>
      </div>

      {/* Guidelines */}
      <div className="rounded-xl border bg-card p-6 text-card-foreground">
        <Guidelines
          items={[
            {
              kind: 'do',
              text: 'Assemble product screens from DS primitives and signature patterns (BankCard, RewardCard) so upgrades to the system flow through to every page.',
            },
            {
              kind: 'do',
              text: 'Bound the app shell in a rounded container with collapsible="none" — never let the Sidebar position itself over the whole viewport inside an embedded preview.',
            },
            {
              kind: 'do',
              text: 'Encode transfer status with eucalyptus (delivered) and berbere (failed) cultural tokens plus a text label, so meaning survives colour-blind and monochrome viewing.',
            },
            {
              kind: 'dont',
              text: 'Present demo balances or rates as live figures — label them illustrative next to the number, not only in a footer.',
            },
            {
              kind: 'dont',
              text: 'Reach for raw hex or one-off colours; the only fixed art here is the physical card face inside BankCard.',
            },
          ]}
        />
      </div>
    </div>
  );
}
