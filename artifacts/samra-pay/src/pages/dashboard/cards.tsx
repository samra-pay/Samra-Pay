import { CreditCard } from "@/components/credit-card";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { 
  Plane, 
  Coffee,
  ShoppingBag,
  Wallet,
  Lock,
  SlidersHorizontal,
  FileText
} from "lucide-react";
import { PageTransition } from "@/components/page-transition";
import { useState } from "react";
import { Switch } from "@/components/ui/switch";

const recentTransactions = [
  { id: 1, merchant: "Ethiopian Airlines", date: "Today", amount: -820.00, category: "Travel", card: "Airlines Co-brand" },
  { id: 2, merchant: "Buna Cafe", date: "Yesterday", amount: -14.50, category: "Dining", card: "Charge Card" },
  { id: 3, merchant: "Uber", date: "Jun 14", amount: -24.00, category: "Transport", card: "Charge Card" },
  { id: 4, merchant: "Whole Foods", date: "Jun 12", amount: -142.20, category: "Groceries", card: "Charge Card" },
  { id: 5, merchant: "Direct Deposit", date: "Jun 10", amount: 3200.00, category: "Income", card: "Checking" },
];

export function DashboardCards() {
  const [activeCard, setActiveCard] = useState<"debit" | "charge" | "airlines">("charge");
  
  const getCardDetails = () => {
    switch(activeCard) {
      case "debit": return { name: "Checking Account", balance: "$4,250.00", limit: "N/A" };
      case "airlines": return { name: "Airlines Premium", balance: "$3,450.00", limit: "$15,000.00" };
      case "charge": default: return { name: "Samra Pay Charge Card", balance: "$1,240.00", limit: "No Preset Limit" };
    }
  }

  const details = getCardDetails();

  return (
    <PageTransition>
      <div className="max-w-6xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-serif">Cards & Accounts</h1>
          <p className="text-muted-foreground mt-1">Manage your cards, limits, and transactions.</p>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div 
            onClick={() => setActiveCard("debit")}
            className={cn("cursor-pointer transition-all duration-300 transform", activeCard === "debit" ? "scale-105 shadow-2xl ring-2 ring-primary/50 rounded-2xl" : "opacity-70 hover:opacity-100 hover:-translate-y-1")}
          >
            <CreditCard variant="debit" />
          </div>
          <div 
            onClick={() => setActiveCard("charge")}
            className={cn("cursor-pointer transition-all duration-300 transform", activeCard === "charge" ? "scale-105 shadow-2xl ring-2 ring-primary/50 rounded-2xl" : "opacity-70 hover:opacity-100 hover:-translate-y-1")}
          >
            <CreditCard variant="charge" />
          </div>
          <div 
            onClick={() => setActiveCard("airlines")}
            className={cn("cursor-pointer transition-all duration-300 transform", activeCard === "airlines" ? "scale-105 shadow-2xl ring-2 ring-primary/50 rounded-2xl" : "opacity-70 hover:opacity-100 hover:-translate-y-1")}
          >
            <CreditCard variant="airlines" />
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-8 pt-6">
          <div className="lg:col-span-1 space-y-6">
            <Card className="bg-card/50 border-white/5">
              <CardHeader>
                <CardTitle className="text-lg">{details.name}</CardTitle>
                <CardDescription>Card Details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Current Balance</div>
                  <div className="text-3xl font-mono text-primary">{details.balance}</div>
                </div>
                <div className="pt-4 border-t border-white/5">
                  <div className="text-sm text-muted-foreground mb-1">Credit Limit</div>
                  <div className="text-xl font-mono">{details.limit}</div>
                </div>
                
                <div className="pt-4 border-t border-white/5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Lock className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Freeze Card</span>
                    </div>
                    <Switch />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <SlidersHorizontal className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Spending Limits</span>
                    </div>
                    <Button variant="ghost" size="sm" className="h-8 px-2 text-primary">Edit</Button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <FileText className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Statements</span>
                    </div>
                    <Button variant="ghost" size="sm" className="h-8 px-2 text-primary">View</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-2">
            <Card className="bg-card/50 border-white/5 h-full">
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>Filtering by {details.name}</CardDescription>
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
        </div>
      </div>
    </PageTransition>
  );
}