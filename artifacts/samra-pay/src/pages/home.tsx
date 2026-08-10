import { PageTransition } from "@/components/page-transition";
import { Button } from "@/components/ui/button";
import { ArrowRight, ChevronRight, Plane, Coffee, ShieldCheck } from "lucide-react";
import { Link } from "wouter";
import heroBg from "@assets/generated_images/hero-bg.jpg";
import { CreditCard } from "@/components/credit-card";
import { motion } from "framer-motion";

export default function Home() {
  return (
    <PageTransition>
      <div className="w-full">
        {/* Hero Section */}
        <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden pt-20">
          <div className="absolute inset-0 z-0">
            <div className="absolute inset-0 bg-background/80 z-10" />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent z-10" />
            <img 
              src={heroBg} 
              alt="Background pattern" 
              className="w-full h-full object-cover opacity-40 mix-blend-overlay"
            />
          </div>
          
          <div className="container relative z-20 px-6 mx-auto grid lg:grid-cols-2 gap-12 items-center">
            <motion.div 
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.8 }}
              className="max-w-2xl"
            >
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/30 bg-primary/10 text-primary text-xs font-medium tracking-widest uppercase mb-8">
                <span className="w-2 h-2 rounded-full bg-primary" />
                Designed in Addis. Polished in NY.
              </div>
              <h1 className="font-serif text-5xl md:text-7xl lg:text-8xl font-medium leading-[1.1] mb-6">
                Build your <br/>
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-[#B8942E] italic">American dream.</span><br/>
                Honor your roots.
              </h1>
              <p className="text-lg md:text-xl text-muted-foreground mb-8 leading-relaxed max-w-lg">
                The premier charge card for the Ethiopian diaspora. Build US credit, earn flights home, and join a community that understands where you're from.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Button asChild variant="gold" size="lg" className="rounded-full w-full sm:w-auto">
                  <Link href="/cards">
                    Explore the Card <ArrowRight className="ml-2 w-4 h-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg" className="rounded-full w-full sm:w-auto border-white/20 hover:bg-white/5">
                  <Link href="/remittance">
                    Send Money Home
                  </Link>
                </Button>
              </div>
            </motion.div>
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4, duration: 1 }}
              className="relative lg:h-[600px] flex items-center justify-center perspective-[1000px]"
            >
              <div className="relative w-full max-w-md transform rotate-y-[-15deg] rotate-x-[5deg] hover:rotate-y-0 hover:rotate-x-0 transition-transform duration-700">
                <CreditCard variant="charge" />
                {/* Glow effect */}
                <div className="absolute -inset-4 bg-primary/20 blur-3xl rounded-full -z-10 opacity-50" />
              </div>
            </motion.div>
          </div>
        </section>

        {/* Feature Teasers */}
        <section className="py-24 bg-secondary/30 relative">
          <div className="container mx-auto px-6 relative z-10">
            <div className="grid md:grid-cols-3 gap-8">
              {[
                {
                  icon: <ShieldCheck className="w-6 h-6 text-primary" />,
                  title: "Build Credit Proudly",
                  desc: "A charge card that builds your US credit history without the indignity of a security deposit."
                },
                {
                  icon: <Plane className="w-6 h-6 text-primary" />,
                  title: "Fly Ethiopian Airlines",
                  desc: "Earn points directly transferrable to ShebaMiles. Your everyday spending brings you closer to home."
                },
                {
                  icon: <Coffee className="w-6 h-6 text-primary" />,
                  title: "Samra Pay Social House",
                  desc: "More than a bank. Join our members-only cultural hub for coffee, connection, and financial literacy."
                }
              ].map((feature, idx) => (
                <motion.div 
                  key={idx}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: idx * 0.1, duration: 0.5 }}
                  className="p-8 rounded-2xl border border-white/5 bg-background hover:border-primary/30 transition-colors"
                >
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-6">
                    {feature.icon}
                  </div>
                  <h3 className="text-xl font-medium mb-3">{feature.title}</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    {feature.desc}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Co-branded Upgrade Promo */}
        <section className="py-32 relative overflow-hidden">
          <div className="container mx-auto px-6 relative z-10">
            <div className="bg-gradient-to-r from-accent/40 to-background border border-primary/20 rounded-3xl p-10 md:p-16 flex flex-col md:flex-row items-center gap-12 overflow-hidden relative">
              <div className="absolute top-0 right-0 w-1/2 h-full bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent opacity-50" />
              
              <div className="flex-1">
                <h2 className="font-serif text-4xl md:text-5xl mb-4">The Ultimate Upgrade</h2>
                <p className="text-lg text-muted-foreground mb-8 max-w-md">
                  Unlock elevated earn rates, priority boarding, and lounge access with the Ethiopian Airlines Co-branded Card.
                </p>
                <Button asChild variant="link" className="p-0 h-auto text-primary text-lg group">
                  <Link href="/cards">
                    Compare Cards <ChevronRight className="ml-1 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </Link>
                </Button>
              </div>
              <div className="flex-1 flex justify-center perspective-[1000px]">
                <div className="w-full max-w-sm transform rotate-y-[-10deg]">
                   <CreditCard variant="airlines" last4="1991" />
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </PageTransition>
  );
}
