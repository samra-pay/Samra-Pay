import { PageTransition } from "@/components/page-transition";
import { CreditCard, Card3DWrapper } from "@/components/credit-card";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { 
  ArrowUpRight, 
  ArrowDownLeft, 
  TrendingUp, 
  Plane, 
  Wallet,
  Coffee,
  ShoppingBag,
  Car
} from "lucide-react";
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer
} from "recharts";

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
  { category: 'Dining', amount: 450, icon: Coffee, color: "text-green-400" },
  { category: 'Shopping', amount: 320, icon: ShoppingBag, color: "text-blue-400" },
  { category: 'Transport', amount: 150, icon: Car, color: "text-orange-400" },
];

const recentTransactions = [
  { id: 1, merchant: "Ethiopian Airlines", date: "Today", amount: -820.00, category: "Travel", card: "Airlines Co-brand" },
  { id: 2, merchant: "Buna Cafe", date: "Yesterday", amount: -14.50, category: "Dining", card: "Charge Card" },
  { id: 3, merchant: "Direct Deposit", date: "Jun 15", amount: 3200.00, category: "Income", card: "Checking" },
  { id: 4, merchant: "Uber", date: "Jun 14", amount: -24.00, category: "Transport", card: "Charge Card" },
  { id: 5, merchant: "Whole Foods", date: "Jun 12", amount: -142.20, category: "Groceries", card: "Charge Card" },
];

export default function Dashboard() {
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
              <ArrowDownLeft className="w-4 h-4 text-green-400" />
              Receive
            </Button>
            <Button variant="outline" className="flex-1 md:flex-none gap-2 bg-card/50 border-white/10 hover:border-white/20 transition-colors h-12 rounded-xl shrink-0 px-6">
              <ArrowUpRight className="w-4 h-4 text-primary" />
              Send
            </Button>
            <Button variant="gold" className="flex-1 md:flex-none gap-2 h-12 rounded-xl shrink-0 px-6 shadow-[0_0_15px_rgba(212,175,55,0.2)]">
              <Plane className="w-4 h-4" />
              Remit (180 ETB)
            </Button>
          </div>
        </div>

        {/* Cards Overview */}
        <div className="grid lg:grid-cols-3 gap-8">
          <div className="space-y-4 group">
            <div className="flex justify-between items-end px-2">
              <span className="text-sm font-medium text-muted-foreground uppercase tracking-widest">Checking</span>
              <span className="text-2xl font-serif">$4,250.00</span>
            </div>
            <div className="transform transition-transform duration-500 group-hover:-translate-y-1">
              <CreditCard variant="debit" />
            </div>
          </div>
          <div className="space-y-4 group">
            <div className="flex justify-between items-end px-2">
              <span className="text-sm font-medium text-muted-foreground uppercase tracking-widest">Charge</span>
              <span className="text-2xl font-serif text-primary">$1,240.00</span>
            </div>
            <div className="transform transition-transform duration-500 group-hover:-translate-y-1">
              <CreditCard variant="charge" />
            </div>
          </div>
          <div className="space-y-4 group">
            <div className="flex justify-between items-end px-2">
              <span className="text-sm font-medium text-muted-foreground uppercase tracking-widest">Co-Brand</span>
              <span className="text-2xl font-serif text-primary">$3,450.00</span>
            </div>
            <div className="transform transition-transform duration-500 group-hover:-translate-y-1">
              <CreditCard variant="airlines" last4="1991" />
            </div>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid md:grid-cols-3 gap-6 pt-4">
          {/* Credit Score */}
          <Card className="bg-card/30 border-white/5 shadow-2xl hover:border-white/10 transition-colors group cursor-pointer">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-widest flex items-center justify-between">
                FICO® Score
                <TrendingUp className="w-4 h-4 text-green-400 opacity-50 group-hover:opacity-100 transition-opacity" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-2 mb-4">
                <span className="text-5xl font-serif text-white/90">745</span>
                <span className="text-sm text-green-400 font-medium">+12</span>
              </div>
              <div className="h-[60px] opacity-70 group-hover:opacity-100 transition-opacity">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={creditScoreData}>
                    <Line type="monotone" dataKey="score" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* ShebaMiles */}
          <Card className="bg-gradient-to-br from-card/30 to-[#1B3B2B]/10 border-white/5 shadow-2xl relative overflow-hidden group cursor-pointer hover:border-primary/20 transition-colors">
            <div className="absolute -right-8 -top-8 text-primary/5 pointer-events-none transition-transform duration-700 group-hover:scale-110 group-hover:-translate-x-2 group-hover:translate-y-2">
              <Plane className="w-40 h-40 transform rotate-45" />
            </div>
            <CardHeader className="pb-2 relative z-10">
              <CardTitle className="text-sm font-medium text-primary/80 uppercase tracking-widest">
                ShebaMiles
              </CardTitle>
            </CardHeader>
            <CardContent className="relative z-10">
              <div className="flex items-baseline gap-2 mb-8">
                <span className="text-5xl font-serif text-primary">42,500</span>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-medium text-white/70 uppercase tracking-widest">
                  <span>Reward: RT to ADD</span>
                  <span className="text-primary">85%</span>
                </div>
                <div className="h-1.5 w-full bg-black/40 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-primary/50 to-primary w-[85%] rounded-full shadow-[0_0_10px_rgba(212,175,55,0.5)]" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Spending Insights */}
          <Card className="bg-card/30 border-white/5 shadow-2xl hover:border-white/10 transition-colors group cursor-pointer">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-widest">
                Top Spend
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 mt-2">
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
                    <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center group-hover:scale-105 transition-transform">
                      {tx.category === "Travel" ? <Plane className="w-5 h-5 text-primary" /> :
                       tx.category === "Dining" ? <Coffee className="w-5 h-5 text-green-400" /> :
                       tx.amount > 0 ? <Wallet className="w-5 h-5 text-green-400" /> :
                       <ShoppingBag className="w-5 h-5 text-white/50" />}
                    </div>
                    <div>
                      <div className="font-medium text-white/90">{tx.merchant}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                        {tx.date}
                        <span className="w-1 h-1 rounded-full bg-white/20" />
                        <span className="uppercase tracking-widest text-[10px]">{tx.card}</span>
                      </div>
                    </div>
                  </div>
                  <div className={cn(
                    "font-mono font-medium text-lg",
                    tx.amount > 0 ? "text-green-400" : "text-white/90"
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