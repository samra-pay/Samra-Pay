import { PageTransition } from "@/components/page-transition";
import { Button } from "@/components/ui/button";
import { ArrowRight, ChevronRight, Plane, Coffee, ShieldCheck, Globe, Star, Users } from "lucide-react";
import { Link } from "wouter";
import heroBg from "@assets/generated_images/hero-bg.jpg";
import { CreditCard, Card3DWrapper } from "@/components/credit-card";
import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0 }
};

export default function Home() {
  const containerRef = useRef(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end start"]
  });
  
  const yBg = useTransform(scrollYProgress, [0, 1], ["0%", "30%"]);
  const opacityBg = useTransform(scrollYProgress, [0, 0.5], [0.4, 0]);

  return (
    <PageTransition>
      <div className="w-full" ref={containerRef}>
        
        {/* HERO SECTION */}
        <section className="relative min-h-[100dvh] flex items-center overflow-hidden pt-20">
          <div className="absolute inset-0 z-0 bg-background">
            <motion.div 
              style={{ y: yBg, opacity: opacityBg }}
              className="absolute inset-0 mix-blend-screen"
            >
              <img 
                src={heroBg} 
                alt="Background pattern" 
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-r from-background via-transparent to-background/80" />
            </motion.div>
          </div>
          
          <div className="container relative z-20 px-6 mx-auto grid lg:grid-cols-2 gap-16 lg:gap-8 items-center h-full py-12 lg:py-0">
            <motion.div 
              initial="hidden"
              animate="visible"
              transition={{ staggerChildren: 0.1, delayChildren: 0.2 }}
              className="max-w-2xl"
            >
              <motion.div variants={fadeUp} className="inline-flex items-center gap-3 px-4 py-1.5 rounded-full border border-primary/20 bg-primary/5 text-primary text-xs font-medium tracking-[0.2em] uppercase mb-8 backdrop-blur-sm shadow-[0_0_15px_rgba(212,175,55,0.15)]">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse shadow-[0_0_8px_var(--color-primary)]" />
                Designed in Addis. Polished in NY.
              </motion.div>
              
              <motion.h1 variants={fadeUp} className="font-serif text-5xl md:text-7xl lg:text-[5.5rem] font-medium leading-[1.05] mb-8">
                Build your <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#FFE29F] via-[#D4AF37] to-[#b38b22] italic pr-2">American credit.</span><br/>
                Honor your roots.
              </motion.h1>
              
              <motion.p variants={fadeUp} className="text-lg md:text-xl text-muted-foreground mb-10 leading-relaxed max-w-lg font-light">
                The premier financial platform for the Ethiopian diaspora. One card builds your life here. The other flies you home.
              </motion.p>
              
              <motion.div variants={fadeUp} className="flex flex-col sm:flex-row gap-5">
                <Button asChild variant="gold" size="lg" className="rounded-full w-full sm:w-auto h-14 px-8 text-base">
                  <Link href="/cards">
                    Explore Cards <ArrowRight className="ml-2 w-5 h-5" />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg" className="rounded-full w-full sm:w-auto h-14 px-8 text-base border-white/20 hover:bg-white/5 hover:border-white/40 transition-all">
                  <Link href="/remittance">
                    View Remittance Rates
                  </Link>
                </Button>
              </motion.div>
            </motion.div>
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, x: 20 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              transition={{ delay: 0.6, duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
              className="relative lg:h-[700px] flex items-center justify-center lg:justify-end"
            >
              <div className="relative w-full max-w-[440px]">
                {/* Floating stat chips */}
                <motion.div 
                  initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.2 }}
                  className="absolute -left-12 top-10 z-30 bg-card/60 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-2xl flex items-center gap-4 animate-float-slow hidden md:flex"
                >
                  <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center">
                    <Star className="w-5 h-5 text-green-400" />
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Credit Score</div>
                    <div className="text-xl font-serif text-white/90">745 <span className="text-green-400 text-sm font-sans font-medium ml-1">+12</span></div>
                  </div>
                </motion.div>

                <motion.div 
                  initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.4 }}
                  className="absolute -right-8 bottom-12 z-30 bg-card/60 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-2xl flex items-center gap-4 animate-float-slow-reverse hidden md:flex"
                >
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Globe className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Promo Rate</div>
                    <div className="text-xl font-mono text-primary/90 tracking-tight">180 ETB</div>
                  </div>
                </motion.div>

                <Card3DWrapper>
                  <CreditCard variant="charge" />
                </Card3DWrapper>
                
                {/* Ambient glow behind card */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-primary/10 blur-[100px] rounded-full -z-10" />
              </div>
            </motion.div>
          </div>
        </section>

        {/* SOCIAL PROOF BAND */}
        <section className="border-y border-white/5 bg-background/50 relative z-20">
          <div className="container mx-auto px-6 py-10 flex flex-col md:flex-row justify-between items-center gap-8 text-center md:text-left">
            <div>
              <div className="text-3xl font-serif text-white/90 mb-1">$40M+</div>
              <div className="text-sm text-muted-foreground uppercase tracking-widest">Remitted Home</div>
            </div>
            <div className="w-px h-10 bg-white/10 hidden md:block" />
            <div>
              <div className="text-3xl font-serif text-primary mb-1">180 ETB</div>
              <div className="text-sm text-muted-foreground uppercase tracking-widest">Current Promo Rate</div>
            </div>
            <div className="w-px h-10 bg-white/10 hidden md:block" />
            <div>
              <div className="text-3xl font-serif text-white/90 mb-1">12,000+</div>
              <div className="text-sm text-muted-foreground uppercase tracking-widest">Community Members</div>
            </div>
          </div>
        </section>

        {/* FEATURE GRID */}
        <section className="py-32 relative">
          <div className="container mx-auto px-6">
            <div className="text-center max-w-3xl mx-auto mb-24">
              <h2 className="font-serif text-4xl md:text-5xl mb-6">Financial tools with soul.</h2>
              <p className="text-xl text-muted-foreground font-light">
                We didn't just put a new coat of paint on a banking app. We built features specifically designed for the financial reality of the diaspora.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              {[
                {
                  icon: <ShieldCheck className="w-8 h-8 text-primary" />,
                  title: "Credit, Without the Catch",
                  desc: "A true charge card. Build your US credit history month-by-month without the indignity of tying up a security deposit."
                },
                {
                  icon: <Plane className="w-8 h-8 text-primary" />,
                  title: "Direct to Addis",
                  desc: "Every swipe earns points. Upgrade to the Co-brand to earn 3x on Ethiopian Airlines and get priority toward your flight home."
                },
                {
                  icon: <Users className="w-8 h-8 text-primary" />,
                  title: "The Social House",
                  desc: "Banking shouldn't be isolating. Join our physical hubs for traditional coffee ceremonies, pitch nights, and community wealth building."
                }
              ].map((feature, idx) => (
                <motion.div 
                  key={idx}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-100px" }}
                  transition={{ delay: idx * 0.15, duration: 0.7 }}
                  className="p-10 rounded-[2rem] border border-white/5 bg-gradient-to-b from-card to-background hover:border-primary/20 transition-colors group"
                >
                  <div className="w-16 h-16 rounded-2xl bg-primary/5 border border-primary/10 flex items-center justify-center mb-8 group-hover:bg-primary/10 transition-colors">
                    {feature.icon}
                  </div>
                  <h3 className="text-2xl font-serif mb-4">{feature.title}</h3>
                  <p className="text-muted-foreground leading-relaxed font-light">
                    {feature.desc}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* CO-BRAND HIGHLIGHT */}
        <section className="py-24 relative overflow-hidden bg-[#0A0D0B] border-y border-white/5">
          {/* Green/Gold atmospheric lighting */}
          <div className="absolute top-0 right-0 w-full h-full bg-[radial-gradient(circle_at_70%_50%,_rgba(212,175,55,0.05),_rgba(27,59,43,0.2)_40%,_transparent_70%)] pointer-events-none" />
          
          <div className="container mx-auto px-6 relative z-10">
            <div className="grid lg:grid-cols-2 items-center gap-16 lg:gap-24">
              <motion.div 
                initial={{ opacity: 0, x: -30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.8 }}
                className="order-2 lg:order-1"
              >
                <div className="relative w-full max-w-[500px] mx-auto perspective-[1200px]">
                  <Card3DWrapper>
                    <CreditCard variant="airlines" last4="1991" />
                  </Card3DWrapper>
                </div>
              </motion.div>
              
              <motion.div 
                initial={{ opacity: 0, x: 30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.8 }}
                className="order-1 lg:order-2"
              >
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/20 bg-primary/10 text-primary text-xs font-semibold tracking-widest uppercase mb-6">
                  Premium Tier
                </div>
                <h2 className="font-serif text-4xl md:text-5xl lg:text-6xl mb-6 leading-tight">
                  The ultimate <br/><i className="text-primary/90">upgrade.</i>
                </h2>
                <p className="text-lg text-muted-foreground mb-8 font-light leading-relaxed">
                  Elevate your travel with the Ethiopian Airlines Co-branded Card. 3x points on EA flights, discounted lounge access, and a VIP booking concierge. Because the journey home should feel like you've already arrived.
                </p>
                <Button asChild variant="link" className="p-0 h-auto text-primary text-lg group font-medium">
                  <Link href="/cards/co-brand">
                    Explore Co-brand Card <ChevronRight className="ml-1 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </Link>
                </Button>
              </motion.div>
            </div>
          </div>
        </section>

        {/* FINAL CTA */}
        <section className="py-32 relative">
          <div className="absolute inset-0 bg-primary/5 pattern-dots" />
          <div className="container mx-auto px-6 relative z-10 text-center">
            <h2 className="font-serif text-5xl md:text-6xl mb-6">Ready to claim your spot?</h2>
            <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto font-light">
              Join the waitlist today. We're rolling out access to the diaspora community city by city.
            </p>
            <Button asChild variant="gold" size="lg" className="rounded-full h-16 px-10 text-lg shadow-[0_0_30px_rgba(212,175,55,0.3)] hover:scale-105 transition-transform duration-300">
              <Link href="/login">
                Apply for Samra Pay
              </Link>
            </Button>
          </div>
        </section>

      </div>
    </PageTransition>
  );
}
