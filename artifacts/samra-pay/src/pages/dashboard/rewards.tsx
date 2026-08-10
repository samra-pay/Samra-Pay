import { useState } from "react";
import { PageTransition } from "@/components/page-transition";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  Plane,
  ArrowUpCircle,
  Armchair,
  Users,
  TrendingUp,
  Check,
  Sparkles,
  Coffee,
  ShoppingBag,
  Send,
} from "lucide-react";

const MILES_BALANCE = 42500;

const earnHistory = [
  { id: 1, source: "Ethiopian Airlines — DC to Addis", date: "Today", miles: 2460, icon: Plane },
  { id: 2, source: "Charge Card spend bonus", date: "Jun 14", miles: 180, icon: ShoppingBag },
  { id: 3, source: "Remittance reward — Almaz", date: "Jun 10", miles: 500, icon: Send },
  { id: 4, source: "Buna Cafe — 2x dining", date: "Jun 8", miles: 28, icon: Coffee },
  { id: 5, source: "Monthly member bonus", date: "Jun 1", miles: 1000, icon: Sparkles },
];

type Reward = {
  id: string;
  title: string;
  description: string;
  cost: number;
  icon: typeof Plane;
  tag?: string;
  confirmation: string;
};

const catalog: Reward[] = [
  {
    id: "rt-addis",
    title: "Round Trip to Addis Ababa",
    description: "Economy round trip on Ethiopian Airlines, from any US gateway.",
    cost: 50000,
    icon: Plane,
    tag: "Most Popular",
    confirmation: "Your award ticket request is in. Ethiopian Airlines will email your booking options within 24 hours.",
  },
  {
    id: "seat-upgrade",
    title: "Cloud Nine Seat Upgrade",
    description: "Upgrade any booked flight to Cloud Nine business class.",
    cost: 25000,
    icon: ArrowUpCircle,
    confirmation: "Upgrade confirmed. Your next Ethiopian Airlines booking will show Cloud Nine options at checkout.",
  },
  {
    id: "lounge-pass",
    title: "Sheba Lounge Pass",
    description: "One-day access to Sheba Premium lounges in Addis, DC, and Newark.",
    cost: 8000,
    icon: Armchair,
    confirmation: "Lounge pass added to your wallet. Show your Samra Pay card at the lounge desk to enter.",
  },
  {
    id: "family-transfer",
    title: "Transfer Miles to Family",
    description: "Send miles to a family member's ShebaMiles account — from DC to Addis in seconds.",
    cost: 10000,
    icon: Users,
    tag: "Diaspora Favorite",
    confirmation: "10,000 miles are on their way to Almaz's ShebaMiles account in Addis Ababa. She'll get a text confirmation shortly.",
  },
];

export function DashboardRewards() {
  const [balance, setBalance] = useState(MILES_BALANCE);
  const [confirming, setConfirming] = useState<Reward | null>(null);
  const [redeemed, setRedeemed] = useState<Reward | null>(null);

  const confirmRedeem = () => {
    if (!confirming) return;
    setBalance((b) => b - confirming.cost);
    setRedeemed(confirming);
    setConfirming(null);
  };

  return (
    <PageTransition>
      <div className="max-w-6xl mx-auto space-y-8 pb-12">
        <div>
          <h1 className="text-3xl font-serif">ShebaMiles Rewards</h1>
          <p className="text-muted-foreground mt-1 font-light">
            Earn on every swipe. Redeem for the journeys that matter.
          </p>
        </div>

        {/* Balance hero */}
        <Card className="bg-gradient-to-br from-[#12281C] to-black border-primary/20 shadow-[0_0_50px_rgba(212,175,55,0.05)] relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-[#1B3B2B]" />
          <div className="absolute -right-12 -top-12 text-primary/5 pointer-events-none">
            <Plane className="w-64 h-64 transform rotate-45" />
          </div>
          <CardContent className="p-8 relative z-10">
            <div className="inline-block px-3 py-1 bg-primary/10 text-primary text-[10px] font-semibold tracking-widest uppercase rounded-full border border-primary/20 mb-6">
              Available Balance
            </div>
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div>
                <span className="text-6xl md:text-7xl font-serif text-primary drop-shadow-[0_0_15px_rgba(212,175,55,0.3)]" data-testid="text-miles-balance">
                  {balance.toLocaleString()}
                </span>
                <span className="text-lg text-primary/80 ml-3 font-medium">miles</span>
              </div>
              <div className="bg-white/5 border border-white/10 px-4 py-2 rounded-xl text-sm font-medium text-green-400 flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                +1,240 earned this month
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Redemption catalog */}
        <div>
          <h3 className="text-lg font-serif mb-4">Redeem Miles</h3>
          <div className="grid sm:grid-cols-2 gap-4">
            {catalog.map((reward) => {
              const affordable = balance >= reward.cost;
              return (
                <Card
                  key={reward.id}
                  className={cn(
                    "bg-card/30 border-white/5 relative overflow-hidden group transition-colors",
                    affordable ? "hover:border-primary/40" : "opacity-60"
                  )}
                >
                  {reward.tag && (
                    <div className="absolute top-4 right-4 text-[10px] font-semibold bg-primary/20 text-primary px-2 py-1 rounded uppercase tracking-widest">
                      {reward.tag}
                    </div>
                  )}
                  <CardContent className="p-6 flex flex-col h-full">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4">
                      <reward.icon className="w-6 h-6 text-primary" />
                    </div>
                    <div className="font-medium text-white/90 mb-1">{reward.title}</div>
                    <p className="text-sm text-muted-foreground font-light leading-snug mb-6 flex-1">
                      {reward.description}
                    </p>
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-2xl font-serif text-primary">{reward.cost.toLocaleString()}</span>
                        <span className="text-xs text-muted-foreground ml-1">miles</span>
                      </div>
                      <Button
                        variant={affordable ? "gold" : "outline"}
                        disabled={!affordable}
                        className="rounded-xl px-5"
                        onClick={() => setConfirming(reward)}
                        data-testid={`button-redeem-${reward.id}`}
                      >
                        {affordable ? "Redeem" : "Not enough miles"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Earn history */}
        <Card className="bg-card/30 border-white/5 shadow-2xl">
          <CardHeader className="border-b border-white/5 pb-4">
            <CardTitle className="text-lg font-serif">Earning History</CardTitle>
          </CardHeader>
          <CardContent className="pt-4 px-0 pb-0">
            <div className="divide-y divide-white/5">
              {earnHistory.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between p-4 px-6 hover:bg-white/[0.02] transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center shrink-0">
                      <entry.icon className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <div className="font-medium text-white/90 text-sm">{entry.source}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{entry.date}</div>
                    </div>
                  </div>
                  <span className="font-mono text-sm text-primary">+{entry.miles.toLocaleString()} mi</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Confirm dialog */}
        <Dialog open={!!confirming} onOpenChange={(open) => !open && setConfirming(null)}>
          <DialogContent className="bg-card border-white/10 max-w-md">
            {confirming && (
              <div className="pt-2">
                <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4">
                  <confirming.icon className="w-7 h-7 text-primary" />
                </div>
                <h2 className="text-xl font-serif mb-2">{confirming.title}</h2>
                <p className="text-sm text-muted-foreground font-light mb-6">
                  Redeem <span className="text-primary font-medium">{confirming.cost.toLocaleString()} miles</span>?
                  You'll have {(balance - confirming.cost).toLocaleString()} miles remaining.
                </p>
                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1 rounded-xl border-white/10" onClick={() => setConfirming(null)} data-testid="button-cancel-redeem">
                    Cancel
                  </Button>
                  <Button variant="gold" className="flex-1 rounded-xl" onClick={confirmRedeem} data-testid="button-confirm-redeem">
                    Confirm
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Success dialog */}
        <Dialog open={!!redeemed} onOpenChange={(open) => !open && setRedeemed(null)}>
          <DialogContent className="bg-card border-primary/20 max-w-md text-center">
            {redeemed && (
              <div className="py-4">
                <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center mx-auto mb-5 shadow-[0_0_30px_rgba(212,175,55,0.2)]">
                  <Check className="w-8 h-8 text-primary" />
                </div>
                <h2 className="text-2xl font-serif mb-2">Redeemed!</h2>
                <p className="text-sm text-muted-foreground font-light leading-relaxed mb-6">
                  {redeemed.confirmation}
                </p>
                <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm mb-6">
                  New balance: <span className="text-primary font-medium">{balance.toLocaleString()} miles</span>
                </div>
                <Button variant="gold" className="rounded-xl px-8" onClick={() => setRedeemed(null)} data-testid="button-close-success">
                  Done
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </PageTransition>
  );
}
