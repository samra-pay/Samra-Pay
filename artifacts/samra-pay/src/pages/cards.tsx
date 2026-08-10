import { PageTransition } from "@/components/page-transition";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { CreditCard, Card3DWrapper } from "@/components/credit-card";
import { Link } from "wouter";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export default function Cards() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const faqs = [
    {
      q: "Does the Samra Pay Charge Card build US credit history?",
      a: "Yes. We report your payment history to major US credit bureaus. Because it is a charge card, you must pay your balance in full each month, which promotes responsible credit building without the trap of revolving interest."
    },
    {
      q: "What is a charge card vs. a regular credit card?",
      a: "A charge card requires you to pay your statement balance in full every month. There is no preset spending limit (it adapts to your habits and income), and there is no interest charged because you cannot carry a balance."
    },
    {
      q: "How do ShebaMiles transfers work?",
      a: "Points earned on your Samra Pay Co-branded Card automatically deposit into your linked Ethiopian Airlines ShebaMiles account at the end of each billing cycle at a 1:1 ratio."
    },
    {
      q: "Do I need an SSN to apply?",
      a: "No. While an SSN helps, we also accept ITINs and can underwrite based on connected bank account history and verified income, making it accessible for recent immigrants."
    }
  ];

  return (
    <PageTransition>
      <div className="pt-32 pb-24 min-h-screen">
        <div className="container mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-20">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/20 bg-primary/5 text-primary text-xs font-semibold tracking-widest uppercase mb-6">
              Card Portfolio
            </div>
            <h1 className="font-serif text-5xl md:text-6xl mb-6 font-normal tracking-tight leading-[1.05] text-[#F9F7F1]">
              Designed for <br/>
              <span className="italic text-primary">your journey.</span>
            </h1>
            <p className="text-xl text-muted-foreground font-light">
              Whether you're establishing your financial footing in the US or optimizing your travel home, we have a card crafted for your specific reality.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-12 lg:gap-16 max-w-6xl mx-auto mb-32">
            {/* Standard Charge Card */}
            <div className="flex flex-col">
              <div className="mb-10 px-4">
                <Card3DWrapper>
                  <CreditCard variant="charge" />
                </Card3DWrapper>
              </div>
              
              <Card className="bg-gradient-to-b from-card to-background border-white/5 flex-1 flex flex-col hover:border-white/10 transition-colors">
                <CardHeader>
                  <CardTitle className="text-3xl font-serif">Samra Pay Charge Card</CardTitle>
                  <CardDescription className="text-base mt-2">The foundation of your American financial identity.</CardDescription>
                </CardHeader>
                <CardContent className="flex-1">
                  <div className="mb-8 flex items-baseline">
                    <span className="text-4xl font-serif text-white/90">$0</span>
                    <span className="text-muted-foreground ml-2 text-sm uppercase tracking-widest">annual fee</span>
                  </div>
                  <ul className="space-y-4">
                    {[
                      "Build US credit history without a security deposit",
                      "Pay in full every month—no interest traps",
                      "1x points on all everyday purchases",
                      "No foreign transaction fees",
                      "Access to Tomoca Social House events"
                    ].map((benefit, i) => (
                      <li key={i} className="flex items-start gap-3 text-foreground/80">
                        <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                        <span className="font-light">{benefit}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter className="gap-3">
                  <Button asChild className="w-full h-14 rounded-xl text-base" variant="outline">
                    <Link href="/login">Apply Now</Link>
                  </Button>
                  <Button asChild className="w-full h-14 rounded-xl text-base bg-white/5 border-white/10 hover:bg-white/10" variant="outline">
                    <Link href="/cards/charge">Explore Details</Link>
                  </Button>
                </CardFooter>
              </Card>
            </div>

            {/* Premium Card */}
            <div className="flex flex-col">
              <div className="mb-10 px-4">
                <Card3DWrapper>
                  <CreditCard variant="airlines" />
                </Card3DWrapper>
              </div>

              <Card className="bg-gradient-to-b from-primary/10 to-background border-primary/20 flex-1 flex flex-col relative shadow-[0_0_50px_rgba(212,175,55,0.03)] hover:border-primary/40 transition-colors">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-[#b38b22]" />
                <CardHeader>
                  <div className="inline-block px-3 py-1 bg-primary/10 text-primary text-xs font-semibold uppercase tracking-widest rounded-full w-fit mb-4 border border-primary/20">
                    Premium Tier
                  </div>
                  <CardTitle className="text-3xl font-serif leading-tight">Ethiopian Airlines<br/>Co-brand</CardTitle>
                  <CardDescription className="text-base mt-2">For the frequent traveler connecting two worlds.</CardDescription>
                </CardHeader>
                <CardContent className="flex-1">
                  <div className="mb-8 flex items-baseline">
                    <span className="text-4xl font-serif text-white/90">$195</span>
                    <span className="text-muted-foreground ml-2 text-sm uppercase tracking-widest">annual fee</span>
                  </div>
                  <ul className="space-y-4">
                    {[
                      "3x points on Ethiopian Airlines flights",
                      "2x points on dining and ride-shares",
                      "Priority boarding and discounted lounge access",
                      "Complimentary extra baggage allowance to ADD",
                      "VIP booking concierge service"
                    ].map((benefit, i) => (
                      <li key={i} className="flex items-start gap-3 text-foreground/80">
                        <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                        <span className="font-light">{benefit}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter className="gap-3">
                  <Button asChild className="w-full h-14 rounded-xl text-base shadow-[0_0_20px_rgba(212,175,55,0.2)]" variant="gold">
                    <Link href="/login">Apply Now</Link>
                  </Button>
                  <Button asChild className="w-full h-14 rounded-xl text-base border-primary/30 text-primary hover:bg-primary/10" variant="outline">
                    <Link href="/cards/co-brand">Explore Details</Link>
                  </Button>
                </CardFooter>
              </Card>
            </div>
          </div>

          {/* Side by side comparison (desktop) */}
          <div className="max-w-4xl mx-auto mb-32 hidden md:block">
            <h3 className="font-serif text-3xl mb-10 text-center">Compare Benefits</h3>
            <div className="bg-card/50 border border-white/5 rounded-3xl overflow-hidden">
              <div className="grid grid-cols-3 p-6 border-b border-white/5 bg-background/50">
                <div className="font-medium text-muted-foreground uppercase tracking-widest text-xs flex items-center">Feature</div>
                <div className="font-serif text-xl text-center">Charge Card</div>
                <div className="font-serif text-xl text-center text-primary">Co-brand</div>
              </div>
              
              {[
                { label: "Annual Fee", standard: "$0", premium: "$195" },
                { label: "Base Earn Rate", standard: "1x Points", premium: "1x Miles" },
                { label: "Travel Earn Rate", standard: "1x Points", premium: "3x EA Flights" },
                { label: "Dining & Rideshare", standard: "1x Points", premium: "2x Miles" },
                { label: "Foreign Transaction Fees", standard: "None", premium: "None" },
                { label: "Lounge Access", standard: "-", premium: "Discounted EA Lounges" },
                { label: "Credit Building", standard: "Yes (All bureaus)", premium: "Yes (All bureaus)" },
              ].map((row, idx) => (
                <div key={idx} className="grid grid-cols-3 p-6 border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition-colors">
                  <div className="text-sm font-medium">{row.label}</div>
                  <div className="text-center text-muted-foreground font-light">{row.standard}</div>
                  <div className="text-center font-medium text-white/90">{row.premium}</div>
                </div>
              ))}
            </div>
          </div>

          {/* FAQs */}
          <div className="max-w-3xl mx-auto">
            <h3 className="font-serif text-3xl mb-10 text-center">Frequently Asked Questions</h3>
            <div className="space-y-4">
              {faqs.map((faq, idx) => (
                <div key={idx} className="border border-white/5 bg-card/30 rounded-2xl overflow-hidden">
                  <button 
                    onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                    className="w-full flex items-center justify-between p-6 text-left hover:bg-white/[0.02] transition-colors"
                  >
                    <span className="font-medium text-lg pr-8">{faq.q}</span>
                    <Plus className={cn("w-5 h-5 text-primary shrink-0 transition-transform duration-300", openFaq === idx && "rotate-45")} />
                  </button>
                  <AnimatePresence>
                    {openFaq === idx && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: "easeInOut" }}
                      >
                        <div className="p-6 pt-0 text-muted-foreground font-light leading-relaxed">
                          {faq.a}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>
          </div>
          
        </div>
      </div>
    </PageTransition>
  );
}