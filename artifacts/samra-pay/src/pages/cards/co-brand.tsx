import { PageTransition } from "@/components/page-transition";
import { Button } from "@/components/ui/button";
import { Card3DWrapper, CreditCard } from "@/components/credit-card";
import { CheckCircle2, ChevronRight, Plane, Coffee } from "lucide-react";
import { Link } from "wouter";
import { motion } from "framer-motion";

export default function CoBrandCardPage() {
  return (
    <PageTransition>
      <div className="w-full">
        {/* HERO */}
        <section className="relative min-h-[90vh] flex items-center pt-24 pb-20 overflow-hidden border-b border-white/5">
          <div className="absolute inset-0 bg-gradient-to-br from-[#12281C] via-[#0A120E] to-black" />
          <div className="absolute top-0 right-0 w-full h-full bg-[radial-gradient(ellipse_at_top_right,_rgba(212,175,55,0.1),_transparent_60%)]" />
          
          <div className="container mx-auto px-6 relative z-10 grid lg:grid-cols-2 gap-16 items-center">
            <motion.div 
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8 }}
            >
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/20 bg-primary/10 text-primary text-xs font-semibold tracking-widest uppercase mb-6 shadow-[0_0_15px_rgba(212,175,55,0.15)]">
                Premium Tier
              </div>
              <h1 className="font-serif text-5xl md:text-7xl mb-6 leading-[1.05] tracking-tight font-normal text-[#F9F7F1]">
                Ethiopian Airlines <br/>
                <span className="italic text-primary">Co-brand.</span>
              </h1>
              <p className="text-xl text-muted-foreground max-w-lg font-light leading-relaxed mb-8">
                Elevate your travel. Earn ShebaMiles faster, enjoy priority boarding, and access exclusive lounges. Because the journey home should feel like you've already arrived.
              </p>
              <div className="flex items-center gap-6 mb-10">
                <div>
                  <div className="text-3xl font-serif text-white/90">$195</div>
                  <div className="text-xs text-muted-foreground uppercase tracking-widest mt-1">Annual Fee</div>
                </div>
                <div className="w-px h-10 bg-white/10" />
                <div>
                  <div className="text-3xl font-serif text-primary">3x</div>
                  <div className="text-xs text-muted-foreground uppercase tracking-widest mt-1">Miles on EA Flights</div>
                </div>
              </div>
              <Button asChild variant="gold" size="lg" className="rounded-full h-14 px-10 text-base shadow-[0_0_20px_rgba(212,175,55,0.3)]">
                <Link href="/login">Apply for Premium</Link>
              </Button>
            </motion.div>
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="relative perspective-[1200px] w-full max-w-[500px] mx-auto"
            >
              <Card3DWrapper>
                <CreditCard variant="airlines" last4="1991" showFlipHint />
              </Card3DWrapper>
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-[#1B3B2B]/30 blur-[100px] rounded-full -z-10" />
            </motion.div>
          </div>
        </section>

        {/* BENEFITS */}
        <section className="py-24 bg-card/30">
          <div className="container mx-auto px-6 max-w-5xl">
            <div className="grid md:grid-cols-2 gap-12">
              <div className="space-y-10">
                <div>
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-6">
                    <Plane className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="text-2xl font-serif mb-3">Accelerated Earn Rates</h3>
                  <p className="text-muted-foreground font-light leading-relaxed">
                    Earn 3x ShebaMiles on all direct Ethiopian Airlines purchases. Earn 2x on global dining and rideshares. Earn 1x on everything else.
                  </p>
                </div>
                <div>
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-6">
                    <Coffee className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="text-2xl font-serif mb-3">Premium Travel Perks</h3>
                  <p className="text-muted-foreground font-light leading-relaxed">
                    Enjoy priority boarding on EA flights, discounted access to ShebaMiles lounges worldwide, and a complimentary extra baggage allowance when flying to ADD.
                  </p>
                </div>
              </div>
              
              <div className="bg-background border border-primary/20 rounded-3xl p-8 shadow-[0_0_40px_rgba(27,59,43,0.3)]">
                <h3 className="font-serif text-2xl mb-6 text-primary/90">At a Glance</h3>
                <div className="space-y-4">
                  <div className="flex justify-between items-center py-4 border-b border-white/5">
                    <span className="text-muted-foreground">Annual Fee</span>
                    <span className="font-medium">$195</span>
                  </div>
                  <div className="flex justify-between items-center py-4 border-b border-white/5">
                    <span className="text-muted-foreground">Sign-up Bonus</span>
                    <span className="font-medium">40,000 Miles</span>
                  </div>
                  <div className="flex justify-between items-center py-4 border-b border-white/5">
                    <span className="text-muted-foreground">Foreign Transaction Fee</span>
                    <span className="font-medium">None</span>
                  </div>
                  <div className="flex justify-between items-center py-4 border-b border-white/5">
                    <span className="text-muted-foreground">Network</span>
                    <span className="font-medium">Mastercard</span>
                  </div>
                </div>
                <div className="mt-8 text-xs text-muted-foreground/60 leading-relaxed text-center">
                  Issued on the Mastercard network. Accepted in 210+ countries.
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </PageTransition>
  );
}