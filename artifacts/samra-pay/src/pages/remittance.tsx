import { useState, useEffect } from "react";
import { PageTransition } from "@/components/page-transition";
import { Button } from "@/components/ui/button";
import { ArrowDown, Building2, Smartphone, CreditCard, Landmark, ShieldCheck, Check, Plane } from "lucide-react";
import { Link } from "wouter";

const PROMO_RATE = 180; // 1 USD = 180 ETB
const CARD_FEE_RATE = 0.03;
const SHEBA_MILES_THRESHOLD = 500;
const SHEBA_MILES_BONUS = 100;

type DeliveryMethod = "wallet" | "bank";
type FundingMethod = "card" | "bank";

export default function Remittance() {
  const [usdAmount, setUsdAmount] = useState<string>("1000");
  const [etbAmount, setEtbAmount] = useState<string>("");
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>("bank");
  const [fundingMethod, setFundingMethod] = useState<FundingMethod>("bank");

  useEffect(() => {
    const num = parseFloat(usdAmount);
    if (!isNaN(num)) {
      setEtbAmount((num * PROMO_RATE).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    } else {
      setEtbAmount("0.00");
    }
  }, [usdAmount]);

  const handleUsdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^\d.]/g, "");
    setUsdAmount(val);
  };

  const stdRate = 115; // Example standard rate for comparison
  const parsedUsdAmount = Math.max(parseFloat(usdAmount || "0") || 0, 0);
  const serviceFee = fundingMethod === "card" ? parsedUsdAmount * CARD_FEE_RATE : 0;
  const totalCharged = parsedUsdAmount + serviceFee;
  const shebaMilesEarned = parsedUsdAmount > SHEBA_MILES_THRESHOLD ? SHEBA_MILES_BONUS : 0;
  const difference = ((parsedUsdAmount * PROMO_RATE) - (parsedUsdAmount * stdRate)).toLocaleString("en-US", { maximumFractionDigits: 0 });
  const formatUsd = (amount: number) => amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return (
    <PageTransition>
      <div className="pt-32 pb-24 min-h-screen">
        <div className="container mx-auto px-6 grid lg:grid-cols-2 gap-16 lg:gap-24 items-center">
          
          <div className="order-2 lg:order-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-green-500/30 bg-green-500/10 text-green-400 text-xs font-semibold tracking-widest uppercase mb-8">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              Limited Time Promo Rate
            </div>
            
            <h1 className="font-serif text-5xl md:text-6xl lg:text-7xl mb-8 leading-[1.05] tracking-tight font-normal text-[#F9F7F1]">
              Your hard work <br/>
              <span className="italic text-primary">goes further.</span>
            </h1>
            
            <p className="text-lg md:text-xl text-muted-foreground mb-10 leading-relaxed font-light max-w-lg">
              Send directly to a mobile money wallet or bank account at an industry-leading exchange rate. Bank-funded transfers are free; card-funded transfers include a simple 3% service fee.
            </p>
            
            {/* Live Ticker Style */}
            <div className="flex items-center gap-8 bg-card/30 border border-white/5 p-6 rounded-2xl mb-10 w-fit">
              <div className="flex flex-col">
                <div className="text-sm text-muted-foreground uppercase tracking-widest mb-1">Samra Rate</div>
                <span className="text-4xl font-serif text-primary font-medium">180 ETB</span>
              </div>
              <div className="w-px h-12 bg-white/10" />
              <div className="flex flex-col">
                <div className="text-sm text-muted-foreground uppercase tracking-widest mb-1">Transfer Fees</div>
                 <span className="text-4xl font-serif text-white/90 font-medium">
                   {fundingMethod === "card" ? "3%" : "$0"}
                 </span>
              </div>
            </div>

            <div className="flex items-center gap-3 text-sm text-muted-foreground font-light">
              <ShieldCheck className="w-5 h-5 text-green-400" />
              Fully regulated and secure transfers via partner banks.
            </div>
          </div>

          <div className="relative order-1 lg:order-2 perspective-[1000px]">
            <div className="absolute -inset-4 bg-gradient-to-tr from-primary/20 via-transparent to-primary/5 rounded-[3rem] blur-2xl opacity-50 -z-10" />
            
            <div className="bg-card border border-white/10 p-8 md:p-10 rounded-[2.5rem] relative shadow-[0_20px_50px_-12px_rgba(0,0,0,0.8)] backdrop-blur-xl">
              <div className="flex justify-between items-center mb-8">
                <h3 className="text-2xl font-serif">Calculate Transfer</h3>
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_#22c55e]" />
              </div>
              
              <div className="space-y-6">
                {/* Send */}
                <div className="bg-background/50 border border-white/5 rounded-2xl p-5 flex flex-col focus-within:border-primary/50 transition-colors">
                  <label className="text-xs text-muted-foreground uppercase tracking-widest mb-3">You send</label>
                  <div className="flex items-center">
                    <span className="text-3xl text-muted-foreground mr-2 font-light">$</span>
                    <input 
                      type="text"
                      value={usdAmount}
                      onChange={handleUsdChange}
                      className="bg-transparent text-5xl font-serif outline-none w-full text-foreground placeholder:text-muted"
                      placeholder="0.00"
                    />
                    <div className="flex items-center gap-2 bg-secondary/80 px-4 py-2 rounded-xl border border-white/5">
                      <span className="font-semibold tracking-wider">USD</span>
                    </div>
                  </div>
                </div>

                <div className="flex justify-center -my-2 relative z-10">
                  <div className="w-12 h-12 rounded-full bg-card border border-white/10 flex items-center justify-center text-primary shadow-xl">
                    <ArrowDown className="w-5 h-5" />
                  </div>
                </div>

                {/* Receive */}
                <div className="bg-primary/[0.03] border border-primary/20 rounded-2xl p-5 flex flex-col relative overflow-hidden group">
                  <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-transparent pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity" />
                  
                  <div className="flex justify-between items-center mb-3 relative z-10">
                    <label className="text-xs text-primary uppercase tracking-widest">Recipient gets</label>
                    <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded uppercase tracking-wider font-semibold">Promo Applied</span>
                  </div>
                  
                  <div className="flex min-w-0 items-center relative z-10">
                    <span
                      aria-live="polite"
                      className="min-w-0 flex-1 truncate bg-transparent text-4xl font-serif text-primary md:text-5xl"
                    >
                      {etbAmount || "0.00"}
                    </span>
                    <div className="flex items-center gap-2 bg-primary/10 px-4 py-2 rounded-xl border border-primary/20">
                      <span className="font-semibold tracking-wider text-primary">ETB</span>
                    </div>
                  </div>
                </div>

                {/* Comparison Bar */}
                <div className="pt-4 pb-2">
                  <div className="text-xs text-muted-foreground mb-2 flex justify-between">
                    <span>vs. Traditional Wire (est. {stdRate})</span>
                    <span className="text-green-400 font-medium">+{difference} ETB more</span>
                  </div>
                  <div className="h-2 bg-white/5 rounded-full overflow-hidden flex">
                    <div className="bg-white/20 h-full w-[65%]" />
                    <div className="bg-primary h-full w-[35%]" />
                  </div>
                </div>

                {/* Delivery Method */}
                <div className="space-y-6">
                  <div>
                    <label className="text-xs text-muted-foreground uppercase tracking-widest block mb-3">
                      Send to
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        {
                          id: "wallet" as const,
                          icon: Smartphone,
                          label: "Mobile money wallet",
                          detail: "Telebirr and more",
                        },
                        {
                          id: "bank" as const,
                          icon: Landmark,
                          label: "Bank account",
                          detail: "Direct to their bank",
                        },
                      ].map((method) => {
                        const selected = deliveryMethod === method.id;
                        return (
                          <button
                            key={method.id}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            onClick={() => setDeliveryMethod(method.id)}
                            className={`relative flex min-h-[112px] flex-col items-start gap-2 rounded-xl border p-4 text-left transition-all ${
                              selected
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-white/5 bg-background/50 text-muted-foreground hover:border-white/15 hover:bg-white/[0.03]"
                            }`}
                          >
                            {selected && (
                              <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                                <Check className="h-3 w-3" />
                              </span>
                            )}
                            <method.icon className="h-5 w-5" />
                            <span className="text-sm font-medium leading-tight">{method.label}</span>
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                              {method.detail}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-muted-foreground uppercase tracking-widest block mb-3">
                      Pay with
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        {
                          id: "card" as const,
                          icon: CreditCard,
                          label: "Card",
                          detail: "3% service fee",
                        },
                        {
                          id: "bank" as const,
                          icon: Building2,
                          label: "Bank transfer",
                          detail: "No service fee",
                        },
                      ].map((method) => {
                        const selected = fundingMethod === method.id;
                        return (
                          <button
                            key={method.id}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            onClick={() => setFundingMethod(method.id)}
                            className={`relative flex min-h-[100px] flex-col items-start gap-2 rounded-xl border p-4 text-left transition-all ${
                              selected
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-white/5 bg-background/50 text-muted-foreground hover:border-white/15 hover:bg-white/[0.03]"
                            }`}
                          >
                            {selected && (
                              <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                                <Check className="h-3 w-3" />
                              </span>
                            )}
                            <method.icon className="h-5 w-5" />
                            <span className="text-sm font-medium leading-tight">{method.label}</span>
                            <span className={`text-[10px] uppercase tracking-wider ${
                              method.id === "card" ? "text-primary/80" : "text-green-400/80"
                            }`}>
                              {method.detail}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Sender quote */}
                <div className="space-y-3 border-t border-white/10 pt-5 text-sm">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>Amount to send</span>
                    <span className="text-foreground">${formatUsd(parsedUsdAmount)}</span>
                  </div>
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>Service fee {fundingMethod === "card" ? "(3% card fee)" : "(bank-funded)"}</span>
                    <span className={serviceFee > 0 ? "text-primary" : "text-green-400"}>
                      {serviceFee > 0 ? `$${formatUsd(serviceFee)}` : "Free"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t border-white/5 pt-3 text-base font-medium">
                    <span>Total charged</span>
                    <span className="text-primary">${formatUsd(totalCharged)}</span>
                  </div>
                </div>

                <div
                  role="status"
                  aria-live="polite"
                  className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
                    shebaMilesEarned > 0
                      ? "border-primary/30 bg-primary/10"
                      : "border-white/10 bg-background/40"
                  }`}
                >
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                    shebaMilesEarned > 0
                      ? "bg-primary/20 text-primary"
                      : "bg-white/5 text-muted-foreground"
                  }`}>
                    <Plane className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <div className={`font-medium ${shebaMilesEarned > 0 ? "text-primary" : "text-foreground"}`}>
                      {shebaMilesEarned > 0
                        ? `+${SHEBA_MILES_BONUS} Sheba Miles`
                        : `Send over $${SHEBA_MILES_THRESHOLD} to earn ${SHEBA_MILES_BONUS} Sheba Miles`}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Illustrative demo reward
                    </div>
                  </div>
                </div>
              </div>

              <Button asChild variant="gold" size="lg" className="w-full rounded-2xl text-lg h-16 mt-8 shadow-[0_0_20px_rgba(212,175,55,0.2)]">
                <Link href="/login">Continue to send ${formatUsd(totalCharged)}</Link>
              </Button>
            </div>
          </div>
          
        </div>
      </div>
    </PageTransition>
  );
}