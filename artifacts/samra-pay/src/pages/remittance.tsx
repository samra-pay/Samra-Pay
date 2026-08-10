import { useState, useEffect } from "react";
import { PageTransition } from "@/components/page-transition";
import { Button } from "@/components/ui/button";
import { ArrowDown, Building2, Smartphone, Banknote, ShieldCheck } from "lucide-react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";

const PROMO_RATE = 180; // 1 USD = 180 ETB

export default function Remittance() {
  const [usdAmount, setUsdAmount] = useState<string>("1000");
  const [etbAmount, setEtbAmount] = useState<string>("");
  const [deliveryMethod, setDeliveryMethod] = useState<"bank"|"telebirr"|"cash">("bank");

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
  const stdEtb = (parseFloat(usdAmount || "0") * stdRate).toLocaleString("en-US", { maximumFractionDigits: 0 });
  const difference = ((parseFloat(usdAmount || "0") * PROMO_RATE) - (parseFloat(usdAmount || "0") * stdRate)).toLocaleString("en-US", { maximumFractionDigits: 0 });

  return (
    <PageTransition>
      <div className="pt-32 pb-24 min-h-screen">
        <div className="container mx-auto px-6 grid lg:grid-cols-2 gap-16 lg:gap-24 items-center">
          
          <div className="order-2 lg:order-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-green-500/30 bg-green-500/10 text-green-400 text-xs font-semibold tracking-widest uppercase mb-8">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              Limited Time Promo Rate
            </div>
            
            <h1 className="font-serif text-5xl md:text-6xl lg:text-7xl mb-8 leading-[1.05]">
              Your hard work <br/><i className="text-primary/90">goes further.</i>
            </h1>
            
            <p className="text-lg md:text-xl text-muted-foreground mb-10 leading-relaxed font-light max-w-lg">
              We know the value of the money you send home. Enjoy fee-free transfers and an industry-leading exchange rate, powered exclusively by Samra Pay.
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
                <span className="text-4xl font-serif text-white/90 font-medium">$0</span>
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
                  
                  <div className="flex items-center relative z-10">
                    <input 
                      type="text"
                      value={etbAmount}
                      readOnly
                      className="bg-transparent text-5xl font-serif outline-none w-full text-primary placeholder:text-primary/50"
                      placeholder="0.00"
                    />
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
                <div>
                  <label className="text-xs text-muted-foreground uppercase tracking-widest block mb-3">Delivery Method</label>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { id: "bank", icon: Banknote, label: "Bank" },
                      { id: "telebirr", icon: Smartphone, label: "Telebirr" },
                      { id: "cash", icon: Building2, label: "Cash" },
                    ].map(method => (
                      <button
                        key={method.id}
                        onClick={() => setDeliveryMethod(method.id as any)}
                        className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all ${
                          deliveryMethod === method.id 
                            ? "bg-primary/10 border-primary text-primary" 
                            : "bg-background/50 border-white/5 text-muted-foreground hover:bg-white/[0.02]"
                        }`}
                      >
                        <method.icon className="w-5 h-5" />
                        <span className="text-[10px] font-semibold uppercase tracking-wider">{method.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <Button asChild variant="gold" size="lg" className="w-full rounded-2xl text-lg h-16 mt-8 shadow-[0_0_20px_rgba(212,175,55,0.2)]">
                <Link href="/login">Send Money Now</Link>
              </Button>
            </div>
          </div>
          
        </div>
      </div>
    </PageTransition>
  );
}