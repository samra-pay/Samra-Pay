import { PageTransition } from "@/components/page-transition";
import { CreditCard, Card3DWrapper } from "@/components/credit-card";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@workspace/samra-pay-ds/components/ui/card";
import { Button } from "@workspace/samra-pay-ds/components/ui/button";
import { cn } from "@workspace/samra-pay-ds/lib/utils";
import { Link } from "wouter";
import { 
  ArrowUpRight, 
  ArrowDownLeft, 
  TrendingUp, 
  Plane, 
  Wallet,
  Coffee,
  ShoppingBag,
  Car,
  Calendar,
  RefreshCw,
  Info
} from "lucide-react";
import { 
  LineChart, 
  Line, 
  ResponsiveContainer
} from "recharts";
import { MOCK_DATA } from "@/lib/mock-data";
import { useDemoState, formatUSD, CHECKING_BASE_BALANCE, BILL_INFO, billRemaining } from "@/lib/demo-state";
import { CheckCircle2 } from "lucide-react";

const creditScoreData = [
  { month: 'Jan', score: 710 },
  { month: 'Feb', score: 715 },
  { month: 'Mar', score: 722 },
  { month: 'Apr', score: 728 },
  { month: 'May', score: 735 },
  { month: 'Jun', score: 745 },
];

const spendingData = [
  { category: 'Travel', amount: 820, icon: Plane, color: "text-primary" },
  { category: 'Dining', amount: 450, icon: Coffee, color: "text-eucalyptus" },
  { category: 'Shopping', amount: 320, icon: ShoppingBag, color: "text-muted-foreground" },
  { category: 'Transport', amount: 150, icon: Car, color: "text-coffee" },
];

const recentTransactions = [
  { id: 1, merchant: "Ethiopian Airlines", date: "Today", amount: -820.00, category: "Travel", card: "Airlines Co-brand", points: "+2,460 miles" },
  { id: 2, merchant: "Buna Cafe", date: "Yesterday", amount: -14.50, category: "Dining", card: "Charge Card", points: "+14 points" },
  { id: 3, merchant: "Direct Deposit", date: "Jun 15", amount: 3200.00, category: "Income", card: "Checking" },
  { id: 4, merchant: "Uber", date: "Jun 14", amount: -24.00, category: "Transport", card: "Charge Card", points: "+24 points" },
  { id: 5, merchant: "Whole Foods", date: "Jun 12", amount: -142.20, category: "Groceries", card: "Charge Card", points: "+142 points" },
];

export default function Dashboard() {
  const demo = useDemoState();
  const chargeMinPaid = demo.bills.charge.paid && demo.bills.charge.paidOption === "min";
  const airlinesMinPaid = demo.bills.airlines.paid && demo.bills.airlines.paidOption === "min";
  const chargeFullyPaid = demo.bills.charge.paid && !chargeMinPaid;
  const airlinesFullyPaid = demo.bills.airlines.paid && !airlinesMinPaid;
  const chargeRemaining = billRemaining("charge", demo.bills.charge);
  const airlinesRemaining = billRemaining("airlines", demo.bills.airlines);
  return (
    <PageTransition>
      <div className="max-w-6xl mx-auto space-y-8 pb-12">
        
        {/* Quick Actions & Welcome */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <h1 className="text-3xl font-serif">Overview</h1>
            <p className="text-muted-foreground mt-1 font-light">Welcome back, Selam. Here's your financial snapshot.</p>
          </div>
          <div className="flex gap-3 w-full md:w-auto overflow-x-auto pb-2 md:pb-0 hide-scrollbar">
            <Button variant="outline" className="flex-1 md:flex-none gap-2 bg-card/50 border-white/10 hover:border-white/20 transition-colors h-12 rounded-xl shrink-0 px-6">
              <ArrowDownLeft className="w-4 h-4 text-eucalyptus" />
              Receive
            </Button>
            <Button variant="outline" className="flex-1 md:flex-none gap-2 bg-card/50 border-white/10 hover:border-white/20 transition-colors h-12 rounded-xl shrink-0 px-6">
              <ArrowUpRight className="w-4 h-4 text-primary" />
              Send
            </Button>
            <Button asChild variant="gold" className="flex-1 md:flex-none gap-2 h-12 rounded-xl shrink-0 px-6 shadow-[0_0_15px_rgba(212,175,55,0.2)]">
              <Link href="/dashboard/remittance">
                <Plane className="w-4 h-4" />
                Remit (180 ETB)
              </Link>
            </Button>
          </div>
        </div>

        {/* Top Hero Section: ShebaMiles & Mini Rate/Insight Widgets */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* ShebaMiles Spotlight (Takes up 2 columns) */}
          <Link href="/dashboard/rewards" className="lg:col-span-2 block" data-testid="link-shebamiles-rewards">
          <Card className="h-full bg-gradient-to-br from-[#12281C] to-black border-primary/20 shadow-[0_0_50px_rgba(212,175,55,0.05)] relative overflow-hidden group cursor-pointer">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-[#1B3B2B]" />
            <div className="absolute -right-12 -top-12 text-primary/5 pointer-events-none transition-transform duration-700 group-hover:scale-110 group-hover:-translate-x-2 group-hover:translate-y-2">
              <Plane className="w-64 h-64 transform rotate-45" />
            </div>
            
            <CardContent className="p-8 relative z-10 h-full flex flex-col justify-between">
              <div>
                <div className="inline-block px-3 py-1 bg-primary/10 text-primary text-[10px] font-semibold tracking-widest uppercase rounded-full border border-primary/20 mb-6">
                  ShebaMiles Rewards
                </div>
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
                  <div>
                    <span className="text-6xl md:text-7xl font-serif text-primary drop-shadow-[0_0_15px_rgba(212,175,55,0.3)]">42,500</span>
                    <span className="text-lg text-primary/80 ml-3 font-medium">miles</span>
                  </div>
                  <div className="bg-white/5 border border-white/10 px-4 py-2 rounded-xl text-sm font-medium text-eucalyptus flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" />
                    +1,240 earned this month
                  </div>
                </div>
              </div>
              
              <div className="space-y-3">
                <div className="flex justify-between text-sm font-medium uppercase tracking-widest">
                  <span className="text-white/80">Next Goal: Round trip to Addis</span>
                  <span className="text-primary">85%</span>
                </div>
                <div className="h-2.5 w-full bg-black/60 rounded-full overflow-hidden border border-white/5">
                  <div className="h-full bg-gradient-to-r from-[#b38b22] to-[#FFE29F] w-[85%] rounded-full shadow-[0_0_10px_rgba(212,175,55,0.8)] relative">
                    <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGcgc3Ryb2tlPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMikiIHN0cm9rZS13aWR0aD0iMSI+PHBhdGggZD0iTS0xMCw1MCBMMzAsLTEwIE0wLDUwIEw0MCwtMTAiIC8+PC9nPjwvc3ZnPg==')] opacity-50" />
                  </div>
                </div>
                <div className="text-xs text-muted-foreground flex justify-between">
                  <span>0</span>
                  <span>50,000 miles</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-sm text-primary font-medium mt-4 group-hover:gap-2.5 transition-all">
                Redeem miles in the Rewards hub
                <ArrowUpRight className="w-4 h-4" />
              </div>
            </CardContent>
          </Card>
          </Link>

          {/* Mini Widgets Column */}
          <div className="space-y-6 flex flex-col">
            {/* Promo Rate Widget */}
            <Card className="bg-card/30 border-white/5 flex-1 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-eucalyptus/5 rounded-full blur-2xl group-hover:bg-eucalyptus/10 transition-colors" />
              <CardContent className="p-6 relative z-10 h-full flex flex-col justify-between">
                <div className="flex justify-between items-start mb-4">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">USD to ETB Rate</div>
                  <div className="w-2 h-2 rounded-full bg-eucalyptus animate-pulse shadow-[0_0_8px_hsl(var(--eucalyptus))]" />
                </div>
                <div>
                  <div className="text-4xl font-serif text-white/90 mb-1">180.00</div>
                  <div className="text-xs text-eucalyptus font-medium flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" /> Great time to send
                  </div>
                </div>
                <Button asChild variant="outline" className="w-full mt-6 bg-white/5 border-white/10 hover:border-white/20 h-10 rounded-lg text-sm">
                  <Link href="/dashboard/remittance">Send Money</Link>
                </Button>
              </CardContent>
            </Card>

            {/* Insight Widget */}
            <Card className="bg-card/30 border-white/5 relative overflow-hidden group">
              <div className="absolute top-0 left-0 w-1 bg-primary h-full" />
              <CardContent className="p-6 relative z-10">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Info className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <div className="text-2xl font-serif text-white/90 mb-1">${MOCK_DATA.remittance.ytdTotal.toLocaleString()}</div>
                    <p className="text-sm text-muted-foreground font-light leading-snug">
                      Sent home this year—supporting {MOCK_DATA.remittance.familyMembersSupported} family members in {MOCK_DATA.remittance.location}.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Accounts Row — premium tier */}
        <div>
          <div className="flex justify-between items-end mb-4">
            <div className="flex items-baseline gap-3">
              <h3 className="text-lg font-serif">Accounts</h3>
              <span className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-[0.2em] hidden sm:inline">3 active</span>
            </div>
            <Link href="/dashboard/cards" className="text-sm text-primary font-medium inline-flex items-center gap-1 group/manage">
              Manage Cards
              <ArrowUpRight className="w-3.5 h-3.5 transition-transform group-hover/manage:translate-x-0.5 group-hover/manage:-translate-y-0.5" />
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              {
                key: "debit" as const,
                variant: "debit" as const,
                last4: "4242",
                label: "Checking",
                labelClass: "text-muted-foreground",
                balance: formatUSD(CHECKING_BASE_BALANCE - demo.checkingDeducted),
                balanceNote: "Available",
                status: demo.checkingDeducted > 0
                  ? { text: `${formatUSD(demo.checkingDeducted)} paid out today`, tone: "text-eucalyptus" }
                  : { text: "FDIC insured · $0 ATM fees", tone: "text-muted-foreground/70" },
                accent: "from-[#2D2D3F]/40",
                glow: "group-hover:shadow-[0_16px_40px_-16px_rgba(45,45,63,0.9)]",
                ring: "hover:border-white/20",
              },
              {
                key: "charge" as const,
                variant: "charge" as const,
                last4: "4242",
                label: "Charge",
                labelClass: "text-muted-foreground",
                balance: formatUSD(chargeRemaining),
                balanceNote: chargeFullyPaid ? "Paid off" : "Balance",
                status: chargeFullyPaid
                  ? { text: "Paid in full today", tone: "text-eucalyptus" }
                  : chargeMinPaid
                    ? { text: "Min paid · autopay on", tone: "text-primary" }
                    : { text: "Due Jul 2 · Autopay on", tone: "text-muted-foreground/70" },
                accent: "from-[#1B3B2B]/50",
                glow: "group-hover:shadow-[0_16px_40px_-16px_rgba(27,59,43,0.9)]",
                ring: "hover:border-eucalyptus/25",
              },
              {
                key: "airlines" as const,
                variant: "airlines" as const,
                last4: "1991",
                label: "Premium",
                labelClass: "text-primary/80",
                balance: formatUSD(airlinesRemaining),
                balanceNote: airlinesFullyPaid ? "Paid off" : "Balance",
                status: airlinesFullyPaid
                  ? { text: "Paid in full today", tone: "text-eucalyptus" }
                  : airlinesMinPaid
                    ? { text: "Min paid · " + formatUSD(airlinesRemaining) + " left", tone: "text-primary" }
                    : { text: "Due Jul 8 · Earns 3x miles", tone: "text-primary/70" },
                accent: "from-primary/25",
                glow: "group-hover:shadow-[0_16px_40px_-16px_rgba(212,175,55,0.55)]",
                ring: "hover:border-primary/40",
              },
            ].map((acct) => (
              <Link key={acct.key} href="/dashboard/cards" data-testid={`card-account-${acct.key}`}>
                <Card
                  className={cn(
                    "group relative overflow-hidden bg-card/30 border-white/5 transition-all duration-300 cursor-pointer p-5",
                    "hover:-translate-y-0.5",
                    acct.ring,
                    acct.glow,
                  )}
                >
                  {/* Accent wash bleeding from the card art */}
                  <div className={cn(
                    "absolute -left-10 -top-10 w-44 h-44 rounded-full blur-3xl pointer-events-none bg-gradient-to-br to-transparent opacity-60 transition-opacity duration-500 group-hover:opacity-100",
                    acct.accent,
                  )} />
                  {/* Hairline top edge */}
                  <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />

                  <div className="relative z-10 flex items-center gap-5">
                    {/* Card art — lifts and straightens on hover */}
                    <div className="w-20 sm:w-24 shrink-0 perspective-[1000px]">
                      <div className="transform rotate-y-[-14deg] rotate-x-[6deg] transition-transform duration-500 ease-out group-hover:rotate-y-[-4deg] group-hover:rotate-x-[2deg] group-hover:scale-[1.04] drop-shadow-[0_10px_18px_rgba(0,0,0,0.55)]">
                        <CreditCard variant={acct.variant} last4={acct.last4} />
                      </div>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className={cn("text-[10px] font-semibold uppercase tracking-[0.18em]", acct.labelClass)}>
                          {acct.label}
                        </div>
                        <span className="font-mono text-[10px] text-white/25 tracking-widest">•••• {acct.last4}</span>
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-[22px] leading-none font-serif text-white/95 tabular-nums">{acct.balance}</span>
                        <span className="text-[10px] uppercase tracking-widest text-white/30">{acct.balanceNote}</span>
                      </div>
                      <div className={cn("mt-2 text-[11px] font-medium truncate", acct.status.tone)}>
                        {acct.status.text}
                      </div>
                    </div>

                    {/* Chevron appears on hover */}
                    <ArrowUpRight className="w-4 h-4 text-white/0 transition-all duration-300 group-hover:text-white/40 -translate-x-1 group-hover:translate-x-0 shrink-0" />
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </div>

        {/* Obligations Timeline Strip */}
        <div>
          <h3 className="text-lg font-serif mb-4">Upcoming</h3>
          <div className="flex overflow-x-auto gap-4 pb-4 hide-scrollbar snap-x">
            
            {/* Obligation 1 */}
            <Card className="min-w-[280px] bg-card/30 border-white/5 shrink-0 snap-start">
              <CardContent className="p-5">
                <div className="flex justify-between items-start mb-4">
                  <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center border border-white/10">
                    <RefreshCw className="w-4 h-4 text-eucalyptus" />
                  </div>
                  <span className="text-[10px] font-semibold bg-white/10 px-2 py-1 rounded text-white/80 uppercase tracking-widest">In 3 days</span>
                </div>
                <div className="text-sm font-medium text-white/90 mb-1">Scheduled Transfer</div>
                <div className="text-xs text-muted-foreground mb-3">To Almaz (Addis Ababa)</div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-serif text-white/90">$300</span>
                  <span className="text-xs text-muted-foreground">Jul 1</span>
                </div>
              </CardContent>
            </Card>

            {/* Obligation 2 */}
            <Card className={cn("min-w-[280px] bg-card/30 shrink-0 snap-start", chargeFullyPaid ? "border-eucalyptus/20" : chargeMinPaid ? "border-primary/20" : "border-white/5")}>
              <CardContent className="p-5">
                <div className="flex justify-between items-start mb-4">
                  <div className={cn("w-10 h-10 rounded-full flex items-center justify-center border", chargeFullyPaid ? "bg-eucalyptus/10 border-eucalyptus/20" : chargeMinPaid ? "bg-primary/10 border-primary/20" : "bg-white/5 border-white/10")}>
                    {chargeFullyPaid ? <CheckCircle2 className="w-4 h-4 text-eucalyptus" /> : chargeMinPaid ? <CheckCircle2 className="w-4 h-4 text-primary" /> : <Calendar className="w-4 h-4 text-white/80" />}
                  </div>
                  {chargeFullyPaid ? (
                    <span className="text-[10px] font-semibold bg-eucalyptus/15 text-eucalyptus px-2 py-1 rounded uppercase tracking-widest">Paid</span>
                  ) : chargeMinPaid ? (
                    <span className="text-[10px] font-semibold bg-primary/20 text-primary px-2 py-1 rounded uppercase tracking-widest" data-testid="pill-charge-min-paid">Min paid</span>
                  ) : (
                    <span className="text-[10px] font-semibold bg-white/10 px-2 py-1 rounded text-white/80 uppercase tracking-widest">In 4 days</span>
                  )}
                </div>
                <div className="text-sm font-medium text-white/90 mb-1">Charge Card Bill</div>
                <div className={cn("text-xs mb-3", chargeFullyPaid ? "text-eucalyptus font-medium" : chargeMinPaid ? "text-primary font-medium" : "text-muted-foreground")}>
                  {chargeFullyPaid ? "Paid today from Checking" : chargeMinPaid ? `Minimum paid — ${formatUSD(chargeRemaining)} remaining` : "Autopay ON"}
                </div>
                <div className="flex justify-between items-end">
                  <div className="flex items-baseline gap-2">
                    <span className={cn("text-2xl font-serif", chargeFullyPaid ? "text-white/50 line-through" : "text-white/90")}>{chargeMinPaid ? formatUSD(chargeRemaining) : "$1,240"}</span>
                    <span className="text-xs text-muted-foreground">Jul 2</span>
                  </div>
                  {!demo.bills.charge.paid && (
                    <div className="text-xs text-muted-foreground border-l border-white/10 pl-3">
                      Min: $35
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Obligation 3 */}
            <Card className={cn("min-w-[280px] bg-card/30 shrink-0 snap-start relative overflow-hidden", airlinesFullyPaid ? "border-eucalyptus/20" : "border-primary/20")}>
              {!demo.bills.airlines.paid && <div className="absolute top-0 right-0 w-16 h-16 bg-destructive/10 rounded-full blur-xl pointer-events-none" />}
              <CardContent className="p-5 relative z-10">
                <div className="flex justify-between items-start mb-4">
                  <div className={cn("w-10 h-10 rounded-full flex items-center justify-center border", airlinesFullyPaid ? "bg-eucalyptus/10 border-eucalyptus/20" : "bg-primary/10 border-primary/20")}>
                    {airlinesFullyPaid ? <CheckCircle2 className="w-4 h-4 text-eucalyptus" /> : airlinesMinPaid ? <CheckCircle2 className="w-4 h-4 text-primary" /> : <Calendar className="w-4 h-4 text-primary" />}
                  </div>
                  {airlinesFullyPaid ? (
                    <span className="text-[10px] font-semibold bg-eucalyptus/15 text-eucalyptus px-2 py-1 rounded uppercase tracking-widest">Paid</span>
                  ) : airlinesMinPaid ? (
                    <span className="text-[10px] font-semibold bg-primary/20 text-primary px-2 py-1 rounded uppercase tracking-widest" data-testid="pill-airlines-min-paid">Min paid</span>
                  ) : (
                    <span className="text-[10px] font-semibold bg-primary/20 text-primary px-2 py-1 rounded uppercase tracking-widest">In 10 days</span>
                  )}
                </div>
                <div className="text-sm font-medium text-white/90 mb-1">Co-Brand Bill</div>
                <div className={cn("text-xs mb-3 font-medium", airlinesFullyPaid ? "text-eucalyptus" : airlinesMinPaid ? "text-primary" : "text-destructive")}>
                  {airlinesFullyPaid ? "Paid today from Checking" : airlinesMinPaid ? `Minimum paid — ${formatUSD(airlinesRemaining)} remaining` : "Autopay OFF"}
                </div>
                <div className="flex justify-between items-end">
                  <div className="flex items-baseline gap-2">
                    <span className={cn("text-2xl font-serif", airlinesFullyPaid ? "text-white/50 line-through" : "text-white/90")}>{airlinesMinPaid ? formatUSD(airlinesRemaining) : "$3,450"}</span>
                    <span className="text-xs text-muted-foreground">Jul 8</span>
                  </div>
                  {!demo.bills.airlines.paid && (
                    <div className="text-xs text-muted-foreground border-l border-white/10 pl-3">
                      Min: $89
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

          </div>
        </div>

        {/* Stats Row */}
        <div className="grid md:grid-cols-2 gap-6 pt-2">
          {/* Credit Score Gamified */}
          <Link href="/dashboard/credit">
            <Card className="bg-card/30 border-white/5 shadow-2xl hover:border-white/10 transition-colors group cursor-pointer h-full">
              <CardHeader className="pb-4">
                <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-widest flex items-center justify-between">
                  Credit Health
                  <TrendingUp className="w-4 h-4 text-eucalyptus opacity-50 group-hover:opacity-100 transition-opacity" />
                </CardTitle>
              </CardHeader>
              <CardContent className="flex items-center gap-6">
                <div className="relative w-24 h-24 flex items-center justify-center shrink-0">
                  {/* Pseudo SVG Ring */}
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="6" className="text-white/5" />
                    <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="6" strokeDasharray="283" strokeDashoffset="56" className="text-primary transition-all duration-1000 ease-out" strokeLinecap="round" />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-3xl font-serif text-white/90 leading-none">745</span>
                  </div>
                </div>
                <div>
                  <div className="inline-block px-2 py-0.5 bg-eucalyptus/10 text-eucalyptus text-[10px] font-bold tracking-widest uppercase rounded mb-2">
                    Excellent
                  </div>
                  <p className="text-sm text-muted-foreground font-light leading-relaxed">
                    You're 35 pts away from the "Elite" tier.<br/>
                    Keep utilization low this month.
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>

          {/* Spending Insights */}
          <Link href="/dashboard/analytics">
            <Card className="bg-card/30 border-white/5 shadow-2xl hover:border-white/10 transition-colors group cursor-pointer h-full">
              <CardHeader className="pb-4">
                <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-widest">
                  Top Categories
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {spendingData.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between group/item">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center group-hover/item:bg-white/10 transition-colors">
                          <item.icon className={cn("w-4 h-4", item.color)} />
                        </div>
                        <span className="text-sm font-medium text-white/80">{item.category}</span>
                      </div>
                      <span className="font-mono text-sm">${item.amount}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Transactions */}
        <Card className="bg-card/30 border-white/5 shadow-2xl">
          <CardHeader className="flex flex-row items-center justify-between border-b border-white/5 pb-4">
            <CardTitle className="text-lg font-serif">Recent Transactions</CardTitle>
            <Button variant="link" className="text-primary pr-0 hover:no-underline hover:text-primary/80">View All</Button>
          </CardHeader>
          <CardContent className="pt-4 px-0 pb-0">
            <div className="divide-y divide-white/5">
              {recentTransactions.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between p-4 px-6 hover:bg-white/[0.02] transition-colors cursor-pointer group">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center group-hover:scale-105 transition-transform shrink-0">
                      {tx.category === "Travel" ? <Plane className="w-5 h-5 text-primary" /> :
                       tx.category === "Dining" ? <Coffee className="w-5 h-5 text-eucalyptus" /> :
                       tx.amount > 0 ? <Wallet className="w-5 h-5 text-eucalyptus" /> :
                       <ShoppingBag className="w-5 h-5 text-white/50" />}
                    </div>
                    <div>
                      <div className="font-medium text-white/90 line-clamp-1">{tx.merchant}</div>
                      <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-2 mt-1">
                        <span>{tx.date}</span>
                        <span className="w-1 h-1 rounded-full bg-white/20 hidden sm:block" />
                        <span className="uppercase tracking-widest text-[9px] hidden sm:block">{tx.card}</span>
                        {tx.points && (
                          <>
                            <span className="w-1 h-1 rounded-full bg-white/20" />
                            <span className="text-primary/80 font-medium">{tx.points}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className={cn(
                    "font-mono font-medium text-base md:text-lg whitespace-nowrap ml-4",
                    tx.amount > 0 ? "text-eucalyptus" : "text-white/90"
                  )}>
                    {tx.amount > 0 ? "+" : ""}{tx.amount.toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

      </div>
    </PageTransition>
  );
}