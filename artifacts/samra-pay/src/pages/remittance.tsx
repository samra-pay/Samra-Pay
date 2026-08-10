import { useState, useEffect } from "react";
import { PageTransition } from "@/components/page-transition";
import { Button } from "@/components/ui/button";
import { ArrowDown } from "lucide-react";
import { Link } from "wouter";

const PROMO_RATE = 180; // 1 USD = 180 ETB

export default function Remittance() {
  const [usdAmount, setUsdAmount] = useState<string>("1000");
  const [etbAmount, setEtbAmount] = useState<string>("");

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

  return (
    <PageTransition>
      <div className="pt-32 pb-24 min-h-screen flex items-center">
        <div className="container mx-auto px-6 grid lg:grid-cols-2 gap-16 items-center">
          
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-green-500/30 bg-green-500/10 text-green-400 text-xs font-medium tracking-widest uppercase mb-6">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              Limited Time Promo Rate
            </div>
            <h1 className="font-serif text-5xl md:text-6xl mb-6">Send love.<br/>Send support.<br/>Send instantly.</h1>
            <p className="text-xl text-muted-foreground mb-8 leading-relaxed">
              We know the value of the money you send home. Enjoy fee-free transfers and an industry-leading exchange rate, powered by Samra Pay.
            </p>
            
            <div className="flex items-center gap-6">
              <div className="flex flex-col">
                <span className="text-3xl font-mono text-primary font-light">180 ETB</span>
                <span className="text-sm text-muted-foreground uppercase tracking-widest mt-1">per 1 USD</span>
              </div>
              <div className="w-px h-12 bg-border" />
              <div className="flex flex-col">
                <span className="text-3xl font-mono text-foreground font-light">$0</span>
                <span className="text-sm text-muted-foreground uppercase tracking-widest mt-1">Transfer Fees</span>
              </div>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-1 bg-gradient-to-r from-primary/30 to-accent rounded-3xl blur opacity-30" />
            <div className="bg-card border border-white/10 p-8 rounded-3xl relative shadow-2xl">
              <h3 className="text-xl font-medium mb-8">Calculate Transfer</h3>
              
              <div className="space-y-6">
                {/* Send */}
                <div className="bg-background border border-white/5 rounded-2xl p-4 flex flex-col">
                  <label className="text-sm text-muted-foreground mb-2 flex justify-between">
                    <span>You send</span>
                  </label>
                  <div className="flex items-center">
                    <span className="text-2xl text-muted-foreground mr-2">$</span>
                    <input 
                      type="text"
                      value={usdAmount}
                      onChange={handleUsdChange}
                      className="bg-transparent text-4xl font-mono outline-none w-full text-foreground placeholder:text-muted"
                      placeholder="0.00"
                    />
                    <div className="flex items-center gap-2 bg-secondary/50 px-3 py-1.5 rounded-lg border border-white/5">
                      <span className="font-medium">USD</span>
                    </div>
                  </div>
                </div>

                <div className="flex justify-center -my-2 relative z-10">
                  <div className="w-10 h-10 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-primary backdrop-blur-sm">
                    <ArrowDown className="w-5 h-5" />
                  </div>
                </div>

                {/* Receive */}
                <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 flex flex-col relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-transparent pointer-events-none" />
                  <label className="text-sm text-primary mb-2 flex justify-between relative z-10">
                    <span>Recipient gets</span>
                    <span className="font-medium">Promo applied</span>
                  </label>
                  <div className="flex items-center relative z-10">
                    <input 
                      type="text"
                      value={etbAmount}
                      readOnly
                      className="bg-transparent text-4xl font-mono outline-none w-full text-primary placeholder:text-primary/50"
                      placeholder="0.00"
                    />
                    <div className="flex items-center gap-2 bg-primary/20 px-3 py-1.5 rounded-lg border border-primary/30">
                      <span className="font-medium text-primary">ETB</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-8 flex justify-between text-sm text-muted-foreground mb-8">
                <span>Delivery: <strong>Instant</strong></span>
                <span>Max send: <strong>$5,000</strong></span>
              </div>

              <Button asChild variant="gold" size="lg" className="w-full rounded-xl text-lg h-14">
                <Link href="/login">Start Transfer</Link>
              </Button>
            </div>
          </div>
          
        </div>
      </div>
    </PageTransition>
  );
}
