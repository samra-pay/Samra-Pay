import { PageTransition } from "@/components/page-transition";
import { Button } from "@/components/ui/button";
import { Card3DWrapper, CreditCard } from "@/components/credit-card";
import { CheckCircle2, ChevronRight, ShieldCheck } from "lucide-react";
import { Link } from "wouter";
import { motion } from "framer-motion";

export default function ChargeCardPage() {
  return (
    <PageTransition>
      <div className="w-full">
        {/* HERO */}
        <section className="relative min-h-[90vh] flex items-center pt-24 pb-20 overflow-hidden border-b border-white/5">
          <div className="absolute inset-0 bg-[#050505]" />
          <div className="absolute top-0 right-0 w-full h-full bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.03),_transparent_50%)]" />
          
          <div className="container mx-auto px-6 relative z-10 grid lg:grid-cols-2 gap-16 items-center">
            <motion.div 
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8 }}
            >
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/5 text-white/70 text-xs font-semibold tracking-widest uppercase mb-6">
                Foundation Tier
              </div>
              <h1 className="font-serif text-5xl md:text-7xl mb-6 leading-[1.05]">
                Samra Pay <br/><i className="text-white/80">Charge Card.</i>
              </h1>
              <p className="text-xl text-muted-foreground max-w-lg font-light leading-relaxed mb-8">
                Build your US credit history month-by-month without the indignity of a security deposit. A true charge card for the diaspora.
              </p>
              <div className="flex items-center gap-6 mb-10">
                <div>
                  <div className="text-3xl font-serif text-white/90">$0</div>
                  <div className="text-xs text-muted-foreground uppercase tracking-widest mt-1">Annual Fee</div>
                </div>
                <div className="w-px h-10 bg-white/10" />
                <div>
                  <div className="text-3xl font-serif text-white/90">1x</div>
                  <div className="text-xs text-muted-foreground uppercase tracking-widest mt-1">Points on all spend</div>
                </div>
              </div>
              <Button asChild variant="gold" size="lg" className="rounded-full h-14 px-10 text-base shadow-[0_0_20px_rgba(212,175,55,0.2)]">
                <Link href="/login">Apply Now</Link>
              </Button>
            </motion.div>
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="relative perspective-[1200px] w-full max-w-[500px] mx-auto"
            >
              <Card3DWrapper>
                <CreditCard variant="charge" />
              </Card3DWrapper>
            </motion.div>
          </div>
        </section>

        {/* BENEFITS */}
        <section className="py-24 bg-card/30">
          <div className="container mx-auto px-6 max-w-5xl">
            <div className="grid md:grid-cols-2 gap-12">
              <div className="space-y-10">
                <div>
                  <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center mb-6">
                    <ShieldCheck className="w-6 h-6 text-white/80" />
                  </div>
                  <h3 className="text-2xl font-serif mb-3">Responsible Credit Building</h3>
                  <p className="text-muted-foreground font-light leading-relaxed">
                    We report to all major US credit bureaus. By requiring you to pay your balance in full each month, we help you build a strong payment history without the trap of revolving interest.
                  </p>
                </div>
                <div>
                  <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center mb-6">
                    <span className="font-serif text-2xl text-white/80">$0</span>
                  </div>
                  <h3 className="text-2xl font-serif mb-3">No Foreign Transaction Fees</h3>
                  <p className="text-muted-foreground font-light leading-relaxed">
                    Use your card anywhere in the world, including back home, without paying extra fees on every swipe.
                  </p>
                </div>
              </div>
              
              <div className="bg-background border border-white/5 rounded-3xl p-8 shadow-2xl">
                <h3 className="font-serif text-2xl mb-6">At a Glance</h3>
                <div className="space-y-4">
                  <div className="flex justify-between items-center py-4 border-b border-white/5">
                    <span className="text-muted-foreground">Annual Fee</span>
                    <span className="font-medium">$0</span>
                  </div>
                  <div className="flex justify-between items-center py-4 border-b border-white/5">
                    <span className="text-muted-foreground">APR</span>
                    <span className="font-medium">N/A (Pay in full)</span>
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