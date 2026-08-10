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
  FileText,
  Copy,
  Eye,
  EyeOff,
  Building2,
  Calendar,
  AlertCircle,
  Car
} from "lucide-react";
import { PageTransition } from "@/components/page-transition";
import { useState, useEffect } from "react";
import { Switch } from "@/components/ui/switch";
import { PayBillDialog } from "@/components/pay-bill-dialog";
import { useDemoState, formatUSD, CHECKING_BASE_BALANCE, BILL_INFO } from "@/lib/demo-state";
import { CheckCircle2 } from "lucide-react";

type Transaction = {
  id: number;
  merchant: string;
  date: string;
  amount: number;
  category: string;
  type: string;
  points?: string;
};

// Mock ledgers for each card
const ledgers: Record<string, Transaction[]> = {
  debit: [
    { id: 1, merchant: "TechCorp Inc (Payroll)", date: "Jun 15", amount: 3200.00, category: "Income", type: "credit" },
    { id: 2, merchant: "Equity Apartments", date: "Jun 1", amount: -1850.00, category: "Housing", type: "debit" },
    { id: 3, merchant: "Zelle: Almaz T.", date: "May 28", amount: -150.00, category: "Transfer", type: "debit" },
    { id: 4, merchant: "Whole Foods", date: "May 25", amount: -85.20, category: "Groceries", type: "debit" },
    { id: 5, merchant: "ATM Withdrawal", date: "May 20", amount: -100.00, category: "Cash", type: "debit" },
    { id: 6, merchant: "Verizon Wireless", date: "May 18", amount: -95.00, category: "Utilities", type: "debit" }
  ],
  charge: [
    { id: 10, merchant: "Buna Cafe", date: "Yesterday", amount: -14.50, category: "Dining", type: "debit", points: "+14 pts" },
    { id: 11, merchant: "Uber", date: "Jun 14", amount: -24.00, category: "Transport", type: "debit", points: "+48 pts (2x)" },
    { id: 12, merchant: "Whole Foods", date: "Jun 12", amount: -142.20, category: "Groceries", type: "debit", points: "+142 pts" },
    { id: 13, merchant: "Tomoca Social House", date: "Jun 10", amount: -35.00, category: "Dining", type: "debit", points: "+35 pts" },
    { id: 14, merchant: "Hyatt Regency", date: "Jun 5", amount: -450.00, category: "Travel", type: "debit", points: "+900 pts (2x)" },
    { id: 15, merchant: "Payment Received", date: "Jun 1", amount: 1150.00, category: "Payment", type: "credit" }
  ],
  airlines: [
    { id: 20, merchant: "Ethiopian Airlines", date: "Today", amount: -820.00, category: "Travel", type: "debit", points: "+2,460 miles (3x)" },
    { id: 21, merchant: "Le Diplomat", date: "Jun 16", amount: -185.00, category: "Dining", type: "debit", points: "+370 miles (2x)" },
    { id: 22, merchant: "Whole Foods", date: "Jun 12", amount: -95.50, category: "Groceries", type: "debit", points: "+191 miles (2x)" },
    { id: 23, merchant: "Duty Free ADD", date: "May 28", amount: -120.00, category: "Shopping", type: "debit", points: "+120 miles" },
    { id: 24, merchant: "Uber", date: "May 28", amount: -45.00, category: "Transport", type: "debit", points: "+45 miles" },
    { id: 25, merchant: "Payment Received", date: "May 25", amount: 1500.00, category: "Payment", type: "credit" }
  ]
};

export function DashboardCards() {
  const [activeCard, setActiveCard] = useState<"debit" | "charge" | "airlines">("charge");
  const [showAccountInfo, setShowAccountInfo] = useState(false);
  const [copiedRouting, setCopiedRouting] = useState(false);
  const [copiedAccount, setCopiedAccount] = useState(false);
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const demo = useDemoState();

  useEffect(() => {
    setShowAccountInfo(false);
    setCopiedRouting(false);
    setCopiedAccount(false);
  }, [activeCard]);
  
  const getCardDetails = () => {
    switch(activeCard) {
      case "debit": return { 
        name: "Checking Account", 
        balance: formatUSD(CHECKING_BASE_BALANCE - demo.checkingDeducted), 
        limit: "N/A",
        hasBill: false,
        billPaid: false,
        hasAccountInfo: true,
        earnRules: [
          { label: "FDIC Insured", value: "Up to $250k" },
          { label: "Direct Deposit", value: "Available up to 2 days early" },
          { label: "ATM Fees", value: "$0 Domestic" }
        ]
      };
      case "airlines": return { 
        name: "Airlines Premium", 
        balance: demo.bills.airlines.paid ? "$0.00" : formatUSD(BILL_INFO.airlines.amount), 
        limit: "$15,000.00",
        hasBill: true,
        billPaid: demo.bills.airlines.paid,
        billDue: "Jul 8",
        minDue: "$89.00",
        autopay: false,
        daysUntil: 10,
        hasAccountInfo: false,
        earnRules: [
          { label: "EA Flights", value: "3x Miles" },
          { label: "Dining & Groceries", value: "2x Miles" },
          { label: "All other spend", value: "1x Miles" }
        ]
      };
      case "charge": default: return { 
        name: "Samra Pay Charge Card", 
        balance: demo.bills.charge.paid ? "$0.00" : formatUSD(BILL_INFO.charge.amount), 
        limit: "No Preset Limit",
        hasBill: true,
        billPaid: demo.bills.charge.paid,
        billDue: "Jul 2",
        minDue: "$35.00",
        autopay: true,
        daysUntil: 4,
        hasAccountInfo: true,
        earnRules: [
          { label: "Travel", value: "2x Points" },
          { label: "Dining", value: "1x Points" },
          { label: "Conversion", value: "1:1 to ShebaMiles" }
        ]
      };
    }
  }

  const handleCopy = async (type: 'routing' | 'account', text: string) => {
    try {
      if (!navigator?.clipboard?.writeText) {
        throw new Error("Clipboard API not available");
      }
      await navigator.clipboard.writeText(text);
      if (type === 'routing') {
        setCopiedRouting(true);
        setTimeout(() => setCopiedRouting(false), 2000);
      } else {
        setCopiedAccount(true);
        setTimeout(() => setCopiedAccount(false), 2000);
      }
    } catch (err) {
      console.error("Failed to copy", err);
      // Fallback or visual feedback for failure could go here, 
      // but preventing the false 'copied' state is the key fix.
    }
  };

  const details = getCardDetails();
  const currentLedger =
    activeCard !== "debit" && demo.bills[activeCard].paid
      ? [
          { id: 999, merchant: "Payment Received — Thank You", date: "Today", amount: BILL_INFO[activeCard].amount, category: "Payment", type: "credit" } as Transaction,
          ...ledgers[activeCard],
        ]
      : ledgers[activeCard];

  return (
    <PageTransition>
      <div className="max-w-6xl mx-auto space-y-8 pb-12">
        <div>
          <h1 className="text-3xl font-serif">Cards & Accounts</h1>
          <p className="text-muted-foreground mt-1 font-light">Manage your cards, limits, and transactions.</p>
        </div>

        {/* Card Selector Row */}
        <div className="grid md:grid-cols-3 gap-6">
          <button 
            type="button"
            aria-pressed={activeCard === "debit"}
            aria-label="Select Checking Account"
            onClickCapture={(e) => {
              // First click selects the card (and suppresses the flip); once selected, clicks flip it
              if (activeCard !== "debit") {
                e.stopPropagation();
                setActiveCard("debit");
              }
            }}
            className={cn("cursor-pointer transition-all text-left duration-300 transform rounded-2xl relative block w-full", activeCard === "debit" ? "scale-100 ring-2 ring-primary/50 shadow-[0_0_30px_rgba(212,175,55,0.15)]" : "scale-95 opacity-50 hover:opacity-80")}
          >
            {activeCard === "debit" && <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-[10px] uppercase tracking-widest font-bold px-3 py-1 rounded-full z-10 shadow-lg">Selected</div>}
            <CreditCard variant="debit" />
          </button>
          <button 
            type="button"
            aria-pressed={activeCard === "charge"}
            aria-label="Select Charge Card"
            onClickCapture={(e) => {
              if (activeCard !== "charge") {
                e.stopPropagation();
                setActiveCard("charge");
              }
            }}
            className={cn("cursor-pointer transition-all text-left duration-300 transform rounded-2xl relative block w-full", activeCard === "charge" ? "scale-100 ring-2 ring-primary/50 shadow-[0_0_30px_rgba(212,175,55,0.15)]" : "scale-95 opacity-50 hover:opacity-80")}
          >
            {activeCard === "charge" && <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-[10px] uppercase tracking-widest font-bold px-3 py-1 rounded-full z-10 shadow-lg">Selected</div>}
            <CreditCard variant="charge" />
          </button>
          <button 
            type="button"
            aria-pressed={activeCard === "airlines"}
            aria-label="Select Airlines Co-brand Card"
            onClickCapture={(e) => {
              if (activeCard !== "airlines") {
                e.stopPropagation();
                setActiveCard("airlines");
              }
            }}
            className={cn("cursor-pointer transition-all text-left duration-300 transform rounded-2xl relative block w-full", activeCard === "airlines" ? "scale-100 ring-2 ring-primary/50 shadow-[0_0_30px_rgba(212,175,55,0.15)]" : "scale-95 opacity-50 hover:opacity-80")}
          >
            {activeCard === "airlines" && <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-[10px] uppercase tracking-widest font-bold px-3 py-1 rounded-full z-10 shadow-lg">Selected</div>}
            <CreditCard variant="airlines" last4="1991" />
          </button>
        </div>

        <div className="grid lg:grid-cols-3 gap-8 pt-6">
          <div className="lg:col-span-1 space-y-6">
            
            {/* Balance & Bill Block */}
            <Card className="bg-card/30 border-white/5 shadow-xl relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary/50 to-primary" />
              <CardHeader className="pb-2">
                <CardTitle className="text-lg font-serif">{details.name}</CardTitle>
                <CardDescription>Current Balance</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <div className="text-4xl font-serif text-white/90">{details.balance}</div>
                  <div className="text-sm text-muted-foreground mt-1">Limit: {details.limit}</div>
                </div>

                {details.hasBill && (
                  <div className="pt-6 border-t border-white/5 space-y-4">
                    {details.billPaid ? (
                      <div className="flex items-center gap-3 bg-green-500/10 border border-green-500/20 rounded-xl p-4">
                        <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" />
                        <div>
                          <div className="text-sm font-medium text-green-400">Statement Paid</div>
                          <div className="text-xs text-muted-foreground mt-0.5">Paid today from Checking &bull;&bull;&bull;&bull; 8834</div>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="text-sm font-medium text-white/90">Payment Due {details.billDue}</div>
                            <div className="text-xs text-muted-foreground mt-0.5">Min Due: {details.minDue}</div>
                          </div>
                          <div className="bg-white/10 px-2 py-1 rounded text-[10px] font-semibold uppercase tracking-widest text-white/80">
                            In {details.daysUntil} Days
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2 text-xs">
                          {details.autopay ? (
                            <span className="flex items-center gap-1.5 text-green-400 font-medium bg-green-400/10 px-2 py-1 rounded">
                              <AlertCircle className="w-3 h-3" /> Autopay ON
                            </span>
                          ) : (
                            <span className="flex items-center gap-1.5 text-red-400 font-medium bg-red-400/10 px-2 py-1 rounded">
                              <AlertCircle className="w-3 h-3" /> Autopay OFF
                            </span>
                          )}
                        </div>

                        <Button variant="gold" className="w-full font-medium" onClick={() => setPayDialogOpen(true)}>Pay Statement Balance</Button>
                      </>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Account Numbers (Checking & Charge) */}
            {details.hasAccountInfo && (
              <Card className="bg-card/30 border-white/5 shadow-xl">
                <CardHeader className="pb-4">
                  <div className="flex justify-between items-center">
                    <CardTitle className="text-sm font-medium uppercase tracking-widest text-muted-foreground">Account Details</CardTitle>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setShowAccountInfo(!showAccountInfo)}>
                      {showAccountInfo ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Routing Number</div>
                    <div className="flex justify-between items-center bg-background/50 p-2.5 rounded-lg border border-white/5">
                      <code className="text-sm">{showAccountInfo ? "026009593" : "•••••••••"}</code>
                      <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => handleCopy('routing', '026009593')}>
                        {copiedRouting ? "Copied" : <Copy className="w-3 h-3" />}
                      </Button>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Account Number</div>
                    <div className="flex justify-between items-center bg-background/50 p-2.5 rounded-lg border border-white/5">
                      <code className="text-sm">{showAccountInfo ? "99384728834" : "•••• •••• 8834"}</code>
                      <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => handleCopy('account', '99384728834')}>
                        {copiedAccount ? "Copied" : <Copy className="w-3 h-3" />}
                      </Button>
                    </div>
                  </div>
                  <div className="text-[10px] text-muted-foreground flex gap-2 items-start mt-2 bg-primary/5 p-2 rounded border border-primary/10">
                    <Building2 className="w-3 h-3 text-primary shrink-0 mt-0.5" />
                    Use these for direct deposit and inbound ACH transfers.
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Earn Rules / Perks */}
            <Card className="bg-card/30 border-white/5 shadow-xl">
              <CardHeader className="pb-4">
                <CardTitle className="text-sm font-medium uppercase tracking-widest text-muted-foreground">Account Perks</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {details.earnRules.map((rule, idx) => (
                  <div key={idx} className="flex justify-between items-center border-b border-white/5 pb-3 last:border-0 last:pb-0">
                    <span className="text-sm text-white/80">{rule.label}</span>
                    <span className="text-sm font-medium text-primary">{rule.value}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Card Controls */}
            <Card className="bg-card/30 border-white/5 shadow-xl">
              <CardContent className="pt-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded bg-white/5 flex items-center justify-center">
                      <Lock className="w-4 h-4 text-white/80" />
                    </div>
                    <span className="text-sm font-medium">Freeze Card</span>
                  </div>
                  <Switch />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded bg-white/5 flex items-center justify-center">
                      <SlidersHorizontal className="w-4 h-4 text-white/80" />
                    </div>
                    <span className="text-sm font-medium">Spending Limits</span>
                  </div>
                  <Button variant="ghost" size="sm" className="h-8 px-2 text-primary">Edit</Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Ledger */}
          <div className="lg:col-span-2">
            <Card className="bg-card/30 border-white/5 shadow-xl h-full">
              <CardHeader className="flex flex-row justify-between items-center border-b border-white/5 pb-4">
                <div>
                  <CardTitle className="font-serif text-2xl">Ledger</CardTitle>
                  <CardDescription>Transactions for {details.name}</CardDescription>
                </div>
                <Button variant="outline" size="sm" className="bg-white/5 border-white/10 hidden sm:flex">
                  <FileText className="w-4 h-4 mr-2" /> Statements
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-white/5">
                  {currentLedger.map((tx) => (
                    <div key={tx.id} className="flex items-center justify-between p-4 sm:px-6 hover:bg-white/[0.02] transition-colors group">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                          {tx.category === "Travel" ? <Plane className="w-5 h-5 text-primary" /> :
                           tx.category === "Dining" ? <Coffee className="w-5 h-5 text-green-400" /> :
                           tx.category === "Transport" ? <Car className="w-5 h-5 text-orange-400" /> :
                           tx.type === "credit" ? <Wallet className="w-5 h-5 text-green-400" /> :
                           <ShoppingBag className="w-5 h-5 text-white/50" />}
                        </div>
                        <div>
                          <div className="font-medium text-white/90 text-sm sm:text-base">{tx.merchant}</div>
                          <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-2 mt-1">
                            <span>{tx.date}</span>
                            <span className="w-1 h-1 rounded-full bg-white/20 hidden sm:block" />
                            <span className="uppercase tracking-widest text-[9px] hidden sm:block">{tx.category}</span>
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
                        "font-mono font-medium text-base sm:text-lg whitespace-nowrap ml-4",
                        tx.type === "credit" ? "text-green-400" : "text-white/90"
                      )}>
                        {tx.type === "credit" ? "+" : ""}{tx.amount.toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
      {activeCard !== "debit" && (
        <PayBillDialog bill={activeCard} open={payDialogOpen} onOpenChange={setPayDialogOpen} />
      )}
    </PageTransition>
  );
}