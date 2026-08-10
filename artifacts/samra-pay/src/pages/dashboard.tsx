import { PageTransition } from "@/components/page-transition";
import { CreditCard } from "@/components/credit-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell
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
  { category: 'Dining', amount: 450, icon: Coffee },
  { category: 'Travel', amount: 820, icon: Plane },
  { category: 'Shopping', amount: 320, icon: ShoppingBag },
  { category: 'Transport', amount: 150, icon: Car },
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
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Quick Actions & Welcome */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-serif">Welcome back, Selam</h1>
            <p className="text-muted-foreground mt-1">Here's your financial overview for this month.</p>
          </div>
          <div className="flex gap-3 w-full md:w-auto">
            <Button variant="outline" className="flex-1 md:flex-none gap-2 bg-secondary/50 border-white/5">
              <ArrowDownLeft className="w-4 h-4 text-green-400" />
              Receive
            </Button>
            <Button variant="outline" className="flex-1 md:flex-none gap-2 bg-secondary/50 border-white/5">
              <ArrowUpRight className="w-4 h-4 text-primary" />
              Send
            </Button>
            <Button variant="gold" className="flex-1 md:flex-none gap-2">
              <Plane className="w-4 h-4" />
              Remit (180 ETB)
            </Button>
          </div>
        </div>

        {/* Cards Overview */}
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="space-y-4 group">
            <div className="flex justify-between items-end px-1">
              <span className="text-sm font-medium text-muted-foreground">Checking Account</span>
              <span className="text-2xl font-mono">$4,250.00</span>
            </div>
            <div className="transform transition-transform duration-500 group-hover:-translate-y-2 group-hover:shadow-2xl">
              <CreditCard variant="debit" />
            </div>
          </div>
          <div className="space-y-4 group">
            <div className="flex justify-between items-end px-1">
              <span className="text-sm font-medium text-muted-foreground">Charge Card (Due Jun 28)</span>
              <span className="text-2xl font-mono text-primary">$1,240.00</span>
            </div>
            <div className="transform transition-transform duration-500 group-hover:-translate-y-2 group-hover:shadow-2xl">
              <CreditCard variant="charge" />
            </div>
          </div>
          <div className="space-y-4 group">
            <div className="flex justify-between items-end px-1">
              <span className="text-sm font-medium text-muted-foreground">Airlines Premium</span>
              <span className="text-2xl font-mono text-primary">$3,450.00</span>
            </div>
            <div className="transform transition-transform duration-500 group-hover:-translate-y-2 group-hover:shadow-2xl">
              <CreditCard variant="airlines" last4="1991" />
            </div>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid md:grid-cols-3 gap-6">
          {/* Credit Score */}
          <Card className="bg-card/50 border-white/5 shadow-lg">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
                FICO® Score 8
                <TrendingUp className="w-4 h-4 text-green-400" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-2 mb-4">
                <span className="text-4xl font-serif text-primary">745</span>
                <span className="text-sm text-green-400 font-medium">+12 pts</span>
              </div>
              <div className="h-[80px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={creditScoreData}>
                    <Line type="monotone" dataKey="score" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground mt-4 pt-4 border-t border-white/5">
                <span>Utilization: <strong>18%</strong></span>
                <span>On-time: <strong>100%</strong></span>
              </div>
            </CardContent>
          </Card>

          {/* ShebaMiles */}
          <Card className="bg-card/50 border-white/5 shadow-lg relative overflow-hidden">
            <div className="absolute -right-10 -top-10 text-white/5 pointer-events-none">
              <Plane className="w-40 h-40 transform rotate-45" />
            </div>
            <CardHeader className="pb-2 relative z-10">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                ShebaMiles Balance
              </CardTitle>
            </CardHeader>
            <CardContent className="relative z-10">
              <div className="flex items-baseline gap-2 mb-6">
                <span className="text-4xl font-serif text-[#D4AF37]">42,500</span>
                <span className="text-sm text-muted-foreground font-medium">pts</span>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-foreground/80">Next reward: Roundtrip to ADD</span>
                  <span className="font-mono text-primary">85%</span>
                </div>
                <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-primary to-[#B8942E] w-[85%]" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Spending Insights */}
          <Card className="bg-card/50 border-white/5 shadow-lg">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Top Categories (This Month)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 mt-2">
                {spendingData.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <item.icon className="w-4 h-4 text-primary" />
                      </div>
                      <span className="text-sm font-medium">{item.category}</span>
                    </div>
                    <span className="font-mono text-sm">${item.amount}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Transactions */}
        <Card className="bg-card/50 border-white/5 shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent Transactions</CardTitle>
            <Button variant="link" className="text-primary pr-0">View All</Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentTransactions.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-white/5 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center">
                      {tx.category === "Travel" ? <Plane className="w-4 h-4" /> :
                       tx.category === "Dining" ? <Coffee className="w-4 h-4" /> :
                       tx.amount > 0 ? <Wallet className="w-4 h-4 text-green-400" /> :
                       <ShoppingBag className="w-4 h-4" />}
                    </div>
                    <div>
                      <div className="font-medium">{tx.merchant}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2">
                        {tx.date}
                        <span className="w-1 h-1 rounded-full bg-white/20" />
                        {tx.card}
                      </div>
                    </div>
                  </div>
                  <div className={cn(
                    "font-mono font-medium",
                    tx.amount > 0 ? "text-green-400" : "text-foreground"
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