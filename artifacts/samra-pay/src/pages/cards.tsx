import { PageTransition } from "@/components/page-transition";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2 } from "lucide-react";
import { CreditCard } from "@/components/credit-card";
import { Link } from "wouter";

export default function Cards() {
  return (
    <PageTransition>
      <div className="pt-32 pb-24 min-h-screen">
        <div className="container mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-20">
            <h1 className="font-serif text-5xl md:text-6xl mb-6">Designed for your journey</h1>
            <p className="text-xl text-muted-foreground">
              Whether you're establishing your financial footing in the US or optimizing your travel home, we have a card crafted for you.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-12 max-w-5xl mx-auto">
            {/* Standard Charge Card */}
            <Card className="bg-secondary/20 border-white/10 overflow-hidden flex flex-col relative">
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 blur-3xl rounded-full" />
              <div className="p-8 pb-0">
                <CreditCard variant="charge" />
              </div>
              <CardHeader>
                <CardTitle className="text-2xl font-serif">Samra Pay Charge Card</CardTitle>
                <CardDescription className="text-base">The foundation of your American financial identity.</CardDescription>
              </CardHeader>
              <CardContent className="flex-1">
                <div className="mb-6">
                  <span className="text-3xl font-medium">$0</span>
                  <span className="text-muted-foreground ml-2">annual fee</span>
                </div>
                <ul className="space-y-4">
                  {[
                    "Build US credit history without a security deposit",
                    "Pay in full every month—no interest traps",
                    "1x points on all everyday purchases",
                    "No foreign transaction fees",
                    "Access to Samra Pay Social House events"
                  ].map((benefit, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm text-foreground/80">
                      <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
                      <span>{benefit}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                <Button asChild className="w-full" variant="outline">
                  <Link href="/login">Apply Now</Link>
                </Button>
              </CardFooter>
            </Card>

            {/* Premium Card */}
            <Card className="bg-gradient-to-b from-accent/20 to-background border-primary/30 overflow-hidden flex flex-col relative shadow-[0_0_30px_rgba(212,175,55,0.05)]">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-[#B8942E]" />
              <div className="p-8 pb-0 relative z-10">
                <CreditCard variant="airlines" />
              </div>
              <CardHeader className="relative z-10">
                <div className="inline-block px-3 py-1 bg-primary/20 text-primary text-xs font-semibold uppercase tracking-wider rounded-full w-fit mb-3 border border-primary/20">
                  Premium Tier
                </div>
                <CardTitle className="text-2xl font-serif">Ethiopian Airlines Co-brand</CardTitle>
                <CardDescription className="text-base">For the frequent traveler connecting two worlds.</CardDescription>
              </CardHeader>
              <CardContent className="flex-1 relative z-10">
                <div className="mb-6">
                  <span className="text-3xl font-medium">$195</span>
                  <span className="text-muted-foreground ml-2">annual fee</span>
                </div>
                <ul className="space-y-4">
                  {[
                    "3x points on Ethiopian Airlines flights",
                    "2x points on dining and ride-shares",
                    "Priority boarding and discounted lounge access",
                    "Complimentary extra baggage allowance to ADD",
                    "VIP booking concierge service"
                  ].map((benefit, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm text-foreground/80">
                      <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
                      <span>{benefit}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter className="relative z-10">
                <Button asChild className="w-full" variant="gold">
                  <Link href="/login">Apply for Premium</Link>
                </Button>
              </CardFooter>
            </Card>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
