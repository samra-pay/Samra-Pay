import { PageTransition } from "@/components/page-transition";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Users, GraduationCap, Home, HandCoins, ArrowRight, MapPin, Calendar, ShieldCheck } from "lucide-react";

export default function AskSamra() {
  const workshops = [
    {
      title: "Credit Building 101",
      date: "Nov 12",
      format: "In-Person",
      location: "Tomoca Social House DC",
      spots: 12
    },
    {
      title: "First-Generation Homeownership",
      date: "Nov 18",
      format: "Virtual",
      location: "Zoom",
      spots: "Unlimited"
    },
    {
      title: "Navigating Small Business Loans",
      date: "Dec 05",
      format: "In-Person",
      location: "Tomoca Social House LA",
      spots: 20
    }
  ];

  return (
    <PageTransition>
      <div className="w-full">
        {/* HERO SECTION */}
        <section className="relative pt-32 pb-24 lg:pt-48 lg:pb-32 overflow-hidden border-b border-white/5">
          <div className="absolute inset-0 bg-[#0c0a00]" />
          {/* Warm background gradient */}
          <div className="absolute top-0 right-0 w-3/4 h-3/4 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/20 via-transparent to-transparent opacity-80" />

          <div className="container mx-auto px-6 relative z-10">
            <div className="max-w-4xl">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
              >
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/20 bg-primary/10 text-primary text-xs font-semibold tracking-widest uppercase mb-6 backdrop-blur-md">
                  Nonprofit Initiative
                </div>
                <h1 className="font-serif text-5xl md:text-7xl mb-8 leading-[1.05] font-normal tracking-tight text-[#F9F7F1]">
                  Financial literacy <br/>
                  <span className="italic text-primary">for the community.</span>
                </h1>
                <p className="text-xl text-white/80 max-w-2xl font-light leading-relaxed mb-10">
                  Ask Samra is our dedicated 501(c)(3) arm. We believe access to capital starts with access to knowledge. Our mission is to demystify the US financial system for first-generation immigrants and their families.
                </p>
                <div className="flex flex-col sm:flex-row gap-4">
                  <Button asChild variant="gold" size="lg" className="rounded-full h-14 px-8 text-base shadow-[0_0_20px_rgba(212,175,55,0.2)]">
                    <a href="#workshops">View Workshops</a>
                  </Button>
                  <Button asChild variant="outline" size="lg" className="rounded-full h-14 px-8 text-base border-white/20">
                    <Link href="/login">Partner With Us</Link>
                  </Button>
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* PILLARS SECTION */}
        <section className="py-24 bg-card/30 border-b border-white/5 relative">
          <div className="container mx-auto px-6">
            <div className="text-center max-w-3xl mx-auto mb-20">
              <h2 className="font-serif text-4xl mb-4 font-normal tracking-tight text-[#F9F7F1]">Our Core <span className="italic text-primary">Pillars</span></h2>
              <p className="text-muted-foreground font-light text-lg">Curriculums designed culturally and linguistically for our community.</p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                { icon: ShieldCheck, title: "Credit Building", desc: "Understanding FICO scores, credit utilization, and how to build a strong history without debt traps." },
                { icon: Home, title: "Homeownership", desc: "Navigating mortgages, down payment assistance, and the timeline to owning your first US home." },
                { icon: HandCoins, title: "Business Capital", desc: "For diaspora entrepreneurs: securing SBA loans, building business credit, and scaling operations." },
                { icon: GraduationCap, title: "Youth Literacy", desc: "Equipping the next generation with the tools to budget, save, and invest early." }
              ].map((pillar, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: idx * 0.1, duration: 0.6 }}
                  className="bg-background border border-white/5 p-8 rounded-3xl hover:border-primary/20 transition-colors group"
                >
                  <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                    <pillar.icon className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="font-serif text-2xl mb-3">{pillar.title}</h3>
                  <p className="text-muted-foreground font-light text-sm leading-relaxed">{pillar.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* IMPACT BAND */}
        <section className="py-20 bg-primary/5 relative overflow-hidden">
          <div className="absolute inset-0 pattern-dots opacity-50" />
          <div className="container mx-auto px-6 relative z-10">
            <div className="grid md:grid-cols-3 gap-12 text-center divide-y md:divide-y-0 md:divide-x divide-white/10">
              <div className="py-4">
                <div className="text-5xl font-serif text-primary mb-2">2,500+</div>
                <div className="text-sm text-muted-foreground uppercase tracking-widest">Community Members Taught</div>
              </div>
              <div className="py-4">
                <div className="text-5xl font-serif text-white/90 mb-2">+45 pts</div>
                <div className="text-sm text-muted-foreground uppercase tracking-widest">Avg. Credit Score Lift</div>
              </div>
              <div className="py-4">
                <div className="text-5xl font-serif text-primary mb-2">$50k</div>
                <div className="text-sm text-muted-foreground uppercase tracking-widest">In Scholarships Awarded</div>
              </div>
            </div>
          </div>
        </section>

        {/* WORKSHOPS SECTION */}
        <section id="workshops" className="py-32 relative">
          <div className="container mx-auto px-6">
            <div className="flex flex-col md:flex-row justify-between items-end mb-16 gap-6">
              <div>
                <h2 className="text-4xl font-serif mb-4 font-normal tracking-tight text-[#F9F7F1]">Upcoming <span className="italic text-primary">Workshops</span></h2>
                <p className="text-muted-foreground font-light text-lg">Free to attend. Registration required.</p>
              </div>
            </div>

            <div className="grid lg:grid-cols-3 gap-6">
              {workshops.map((ws, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: idx * 0.1, duration: 0.6 }}
                  className="bg-card border border-white/5 rounded-3xl p-8 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex justify-between items-start mb-6">
                      <div className="bg-white/5 px-3 py-1.5 rounded-lg text-sm text-white/80 font-medium flex items-center gap-2 border border-white/10">
                        <Calendar className="w-4 h-4 text-primary" /> {ws.date}
                      </div>
                      <span className="text-xs font-semibold text-primary uppercase tracking-widest bg-primary/10 px-2 py-1 rounded">{ws.format}</span>
                    </div>
                    <h3 className="text-2xl font-serif mb-6">{ws.title}</h3>
                    <div className="space-y-3 mb-8 text-sm text-muted-foreground font-light">
                      <div className="flex items-center gap-3">
                        <MapPin className="w-4 h-4 text-white/50" /> {ws.location}
                      </div>
                      <div className="flex items-center gap-3">
                        <Users className="w-4 h-4 text-white/50" /> {ws.spots} Spots Available
                      </div>
                    </div>
                  </div>
                  <Button asChild variant="outline" className="w-full rounded-xl hover:bg-primary/10 hover:text-primary hover:border-primary/30 transition-colors">
                    <Link href="/login">Register to Attend</Link>
                  </Button>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </PageTransition>
  );
}