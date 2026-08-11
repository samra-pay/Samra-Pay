import { PageTransition } from "@/components/page-transition";
import { Button } from "@/components/ui/button";
import socialHouseImg from "@assets/ceremony-lounge.jpg";
import socialHouseImg768 from "@assets/ceremony-lounge-768.jpg";
import socialHouseImg1280 from "@assets/ceremony-lounge-1280.jpg";
import tomocaCoffeeImg from "@assets/generated_images/tomoca-pour-luxe.jpg";
import tomocaCoffeeImg640 from "@assets/generated_images/tomoca-pour-luxe-640.jpg";
import bankingCoffeeImg from "@assets/generated_images/banking-over-coffee.jpg";
import bankingCoffeeImg640 from "@assets/generated_images/banking-over-coffee-640.jpg";
import { Link } from "wouter";
import { motion, useScroll, useTransform, useReducedMotion } from "framer-motion";
import { MapPin, Music, Coffee, ArrowRight } from "lucide-react";
import { useRef } from "react";

export default function SocialHouse() {
  const heroRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"]
  });

  const parallaxY = useTransform(scrollYProgress, [0, 1], ["0%", "50%"]);
  const fadeOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);
  const y = prefersReducedMotion ? "0%" : parallaxY;
  const opacity = prefersReducedMotion ? 1 : fadeOpacity;

  const events = [
    {
      date: "Oct 12",
      title: "Buna & Business: Angel Investing 101",
      desc: "A morning coffee ceremony followed by a workshop on evaluating early-stage startups within the diaspora.",
      tag: "Workshop"
    },
    {
      date: "Oct 18",
      title: "The Syndicate: Fall Pitch Night",
      desc: "Three founders. Three pitches. One community. Join us to hear what the next generation is building.",
      tag: "Pitch Night"
    },
    {
      date: "Oct 25",
      title: "Vinyl & Vibes: Tezeta Edition",
      desc: "Late-night listening session featuring rare 70s Ethiopian jazz cuts, including a tribute set to Mulatu Astatke. Curated cocktails and connection.",
      tag: "Culture"
    }
  ];

  return (
    <PageTransition>
      <div className="w-full bg-[#050505]">
        {/* HERO */}
        <section ref={heroRef} className="relative min-h-[100dvh] flex items-end pb-24 md:pb-32 pt-32 overflow-hidden border-b border-primary/20">
          <motion.div style={{ y, opacity }} className="absolute inset-0 z-0">
            <img
              src={socialHouseImg}
              srcSet={`${socialHouseImg768} 768w, ${socialHouseImg1280} 1280w, ${socialHouseImg} 1920w`}
              sizes="100vw"
              fetchPriority="high"
              alt="Tomoca Social House"
              className="w-full h-full object-cover scale-[1.05]"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-[#050505]/60 to-transparent" />
            <div className="absolute inset-0 bg-black/30" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_0%,_#050505_120%)]" />
          </motion.div>

          <div className="container mx-auto px-6 relative z-10">
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 1, ease: [0.16, 1, 0.3, 1] }}
              className="max-w-4xl"
            >
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/30 bg-primary/10 text-primary text-[10px] md:text-xs font-medium tracking-[0.2em] uppercase mb-6 backdrop-blur-md">
                Members Only
              </div>
              <div className="font-serif text-lg md:text-2xl text-[#F9F7F1]/70 mb-4 italic tracking-wide">
                Coffee by Tomoca · Est. 1953
              </div>
              <h1 className="font-serif text-6xl md:text-8xl lg:text-[10rem] mb-6 leading-[0.9] font-normal tracking-[-0.02em] text-[#F9F7F1]">
                Social<br/>
                <span className="italic text-primary">House.</span>
              </h1>
              <div className="w-24 h-[1px] bg-primary/40 mb-8" />
              <p className="text-xl md:text-3xl text-white/70 max-w-2xl font-light leading-[1.4]">
                An exclusive hub for members. Where buna is poured over fresh-cut grass, live krar sessions set the rhythm, and deals are sketched at the long table.
              </p>
            </motion.div>
          </div>
        </section>

        {/* NARRATIVE SECTION */}
        <section className="py-24 md:py-40 relative">
          <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-primary/5 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/3 pointer-events-none" />
          <div className="container mx-auto px-6 relative z-10">
            <div className="grid lg:grid-cols-2 gap-16 md:gap-24 items-center">
              <motion.div
                initial={{ opacity: 0, x: -40 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
              >
                <div className="w-12 h-[1px] bg-primary mb-8" />
                <h2 className="text-4xl md:text-6xl font-serif mb-8 leading-[1.1] tracking-tight font-normal text-[#F9F7F1]">
                  More than an account.<br/>
                  <span className="italic text-primary">A community.</span>
                </h2>
                <div className="space-y-6 text-lg md:text-xl text-muted-foreground font-light leading-[1.6]">
                  <p>
                    The Social House is our physical footprint—a place where the diaspora gathers to share ideas, build networks, and grow wealth. By day, it’s a co-working space infused with the legendary aroma of freshly roasted Tomoca beans.
                  </p>
                  <p>
                    By night, the lights dim. Vinyl spins. We host intimate financial literacy workshops, angel investing syndicates, and cultural nights celebrating the breadth of our excellence.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-8 mt-12 pt-12 border-t border-white/10">
                  <div className="group cursor-default">
                    <MapPin className="w-5 h-5 text-primary/70 mb-4 group-hover:text-primary transition-colors" />
                    <h4 className="font-serif text-xl text-white/90 mb-1">Washington D.C.</h4>
                    <p className="text-sm font-light tracking-wide text-primary/60 uppercase">Opening 2024</p>
                  </div>
                  <div className="group cursor-default">
                    <MapPin className="w-5 h-5 text-primary/70 mb-4 group-hover:text-primary transition-colors" />
                    <h4 className="font-serif text-xl text-white/90 mb-1">Los Angeles</h4>
                    <p className="text-sm font-light tracking-wide text-primary/60 uppercase">Opening 2025</p>
                  </div>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
                className="relative"
              >
                <div className="relative group">
                  <div className="absolute -inset-4 bg-primary/10 rounded-[2px] blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-1000 -z-10" />
                  <img
                    src={tomocaCoffeeImg}
                    srcSet={`${tomocaCoffeeImg640} 640w, ${tomocaCoffeeImg} 1024w`}
                    sizes="(max-width: 1024px) 100vw, 45vw"
                    loading="lazy"
                    decoding="async"
                    alt="Tomoca Coffee Pour"
                    className="w-full aspect-[4/5] object-cover border border-white/10 shadow-2xl filter brightness-90 group-hover:brightness-100 transition-all duration-700"
                  />
                  <div className="mt-4 flex items-center justify-between border-b border-primary/20 pb-4">
                    <span className="font-serif italic text-primary/80 text-lg">Tomoca Macchiato</span>
                    <span className="text-xs tracking-[0.2em] text-white/40 uppercase">Fig. 01</span>
                  </div>
                </div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.4, duration: 0.8 }}
                  className="absolute -bottom-12 -left-4 lg:-left-12 bg-[#0A0705]/90 backdrop-blur-xl border border-white/10 p-6 md:p-8 shadow-2xl max-w-[280px]"
                >
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mb-4 border border-primary/20">
                    <Coffee className="w-4 h-4 text-primary" />
                  </div>
                  <div className="font-serif text-xl text-white/90 mb-2">Access Granted</div>
                  <p className="text-xs md:text-sm text-white/50 font-light leading-relaxed">
                    Samra Pay Charge Card members receive priority booking and complimentary Tomoca coffee service daily.
                  </p>
                </motion.div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* BANKING OVER COFFEE SECTION */}
        <section className="py-24 md:py-40 bg-[#080604] border-y border-white/5 relative overflow-hidden">
          <div className="absolute top-1/2 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-primary/10 to-transparent -translate-y-1/2" />
          <div className="container mx-auto px-6 relative z-10">
            <div className="grid lg:grid-cols-2 gap-16 md:gap-24 items-center">

              <motion.div
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
                className="order-2 lg:order-1 relative"
              >
                <div className="relative group">
                  <div className="absolute -inset-4 bg-primary/10 rounded-[2px] blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-1000 -z-10" />
                  <img
                    src={bankingCoffeeImg}
                    srcSet={`${bankingCoffeeImg640} 640w, ${bankingCoffeeImg} 1024w`}
                    sizes="(max-width: 1024px) 100vw, 45vw"
                    loading="lazy"
                    decoding="async"
                    alt="Banking over coffee at the espresso counter"
                    className="w-full aspect-square object-cover border border-white/10 shadow-2xl filter brightness-90 group-hover:brightness-100 transition-all duration-700"
                  />
                  <div className="mt-4 flex items-center justify-between border-b border-primary/20 pb-4">
                    <span className="font-serif italic text-primary/80 text-lg">Financial Advisory Session</span>
                    <span className="text-xs tracking-[0.2em] text-white/40 uppercase">Fig. 02</span>
                  </div>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: 40 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
                className="order-1 lg:order-2"
              >
                <div className="w-12 h-[1px] bg-primary mb-8" />
                <h2 className="text-4xl md:text-6xl font-serif mb-8 leading-[1.1] tracking-tight font-normal text-[#F9F7F1]">
                  Private banking,<br/>
                  <span className="italic text-primary">poured slowly.</span>
                </h2>
                <div className="space-y-6 text-lg md:text-xl text-muted-foreground font-light leading-[1.6]">
                  <p>
                    Financial planning shouldn't happen in sterile cubicles under fluorescent lights. We believe the best decisions about wealth, family, and future are made over a warm cup.
                  </p>
                  <p>
                    Our dedicated on-site wealth advisors are available for one-on-one sessions at the Social House counter. From optimizing your remittances to planning for generational wealth—book a consultation, sit back, and let the espresso machine hum in the background.
                  </p>
                </div>

                <div className="mt-10 pt-10 border-t border-white/10">
                  <Button asChild variant="gold" className="rounded-none px-8 py-6 text-sm tracking-widest uppercase">
                    <Link href="/login">Book an Advisory Session</Link>
                  </Button>
                </div>
              </motion.div>

            </div>
          </div>
        </section>

        {/* HERITAGE PARTNER TEXT */}
        <section className="py-24 md:py-40 relative">
          <div className="absolute top-0 right-0 w-1/2 h-full bg-[radial-gradient(circle_at_70%_50%,_rgba(212,175,55,0.05),_transparent_70%)] pointer-events-none" />
          <div className="container mx-auto px-6 relative z-10">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
              className="max-w-3xl mx-auto text-center"
            >
              <div className="inline-flex items-center gap-2 px-4 py-1.5 border border-primary/20 bg-primary/5 text-primary text-xs font-medium tracking-[0.2em] uppercase mb-8">
                Heritage Partner
              </div>
              <h2 className="text-4xl md:text-6xl font-serif mb-8 leading-[1.1] tracking-tight font-normal text-[#F9F7F1]">
                A legacy of <br className="hidden md:block"/><span className="italic text-primary">roast & ritual.</span>
              </h2>
              <div className="w-16 h-[1px] bg-primary/40 mx-auto mb-8" />
              <div className="space-y-6 text-lg md:text-xl text-white/60 font-light leading-[1.7]">
                <p>
                  Founded in 1953 near Piassa, Addis Ababa, Tomoca is Ethiopia's first Italian-style coffee roastery. For seventy years, it has been the cornerstone of the city's café culture—a place where deals are struck, news is shared, and the finest Harar beans are brewed to perfection.
                </p>
                <p>
                  Today, that exact heritage powers the coffee ceremony at the Social House. Every cup poured is a direct line back to home.
                </p>
              </div>
            </motion.div>
          </div>
        </section>

        {/* MULATU ASTATKE FEATURE */}
        <section className="py-24 md:py-40 bg-[#080604] border-t border-white/5 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_bottom_left,_rgba(212,175,55,0.05),_transparent_50%)] pointer-events-none" />
          <div className="container mx-auto px-6 relative z-10">
            <div className="grid lg:grid-cols-2 gap-16 md:gap-24 items-center">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
                className="order-2 lg:order-1 flex justify-center lg:justify-start"
              >
                {/* Abstract typographic/silhouette treatment */}
                <div className="relative w-[300px] h-[300px] md:w-[450px] md:h-[450px] rounded-full border border-primary/20 bg-background/50 flex items-center justify-center overflow-hidden group shadow-[0_0_60px_rgba(212,175,55,0.03)]">
                  <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9InJnYmEoMjEyLDE3NSw1NSwwLjE1KSIvPjwvc3ZnPg==')] [mask-image:radial-gradient(black,transparent_70%)] motion-safe:animate-[spin_120s_linear_infinite]" />
                  <div className="absolute inset-0 border-[1px] border-primary/10 rounded-full scale-[0.8]" />
                  <div className="absolute inset-0 border-[1px] border-primary/5 rounded-full scale-[0.6]" />
                  <div className="text-center z-10">
                    <Music className="w-10 h-10 md:w-12 md:h-12 text-primary/40 mx-auto mb-6 group-hover:scale-110 group-hover:text-primary/70 transition-all duration-700" />
                    <div className="font-serif italic text-4xl md:text-5xl text-primary/60 tracking-wider">Ethio-Jazz</div>
                    <div className="mt-4 text-[10px] uppercase tracking-[0.3em] text-white/30">Curated Evenings</div>
                  </div>
                </div>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, x: 40 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
                className="order-1 lg:order-2"
              >
                <div className="w-12 h-[1px] bg-primary mb-8" />
                <div className="inline-flex items-center gap-2 text-primary text-xs font-medium tracking-[0.2em] uppercase mb-6">
                  Evening Programming
                </div>
                <h2 className="text-4xl md:text-6xl font-serif mb-8 leading-[1.1] tracking-tight font-normal text-[#F9F7F1]">
                  The soundtrack of <br/><span className="italic text-primary">an era.</span>
                </h2>
                <div className="space-y-6 text-lg md:text-xl text-muted-foreground font-light leading-[1.6]">
                  <p>
                    When the sun sets, the Social House transforms. Our "Ethio-jazz Nights" celebrate the golden era of the 1970s swinging Addis scene, heavily inspired by pioneers like Mulatu Astatke.
                  </p>
                  <p>
                    Astatke, the father of Ethio-jazz and a legendary vibraphone innovator, blended Latin jazz, traditional Ethiopian pentatonic scales, and Afro-funk into a sound that defined the iconic <i>Éthiopiques</i> era. We curate our vinyl selections to honor that boundary-pushing spirit—the exact same spirit driving the diaspora today.
                  </p>
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* EVENTS BOARD */}
        <section className="py-24 md:py-40 border-t border-white/10 relative overflow-hidden bg-[#050505]">
          <div className="absolute top-0 left-0 w-full h-full bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4wMykiLz48L3N2Zz4=')] [mask-image:linear-gradient(to_bottom,transparent,black,transparent)] pointer-events-none" />

          <div className="container mx-auto px-6 relative z-10">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-16 gap-8">
              <div>
                <h2 className="text-4xl md:text-5xl font-serif mb-4 font-normal tracking-tight text-[#F9F7F1]">Upcoming <span className="italic text-primary">Calendar</span></h2>
                <div className="w-12 h-[1px] bg-primary/40 mb-4" />
                <p className="text-white/50 font-light text-lg">Curated experiences for the mind and soul.</p>
              </div>
              <Button asChild variant="outline" className="rounded-none border-primary/30 hover:bg-primary hover:text-primary-foreground transition-colors px-8 py-6 text-xs tracking-[0.15em] uppercase">
                <Link href="/login">Apply for Membership</Link>
              </Button>
            </div>

            <div className="grid md:grid-cols-3 gap-8 md:gap-6">
              {events.map((event, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-50px" }}
                  transition={{ delay: idx * 0.15, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                  className="bg-[#080604] border border-white/5 p-8 hover:border-primary/40 transition-all duration-500 group relative overflow-hidden flex flex-col h-full"
                >
                  <div className="absolute top-0 right-0 w-40 h-40 bg-primary/5 rounded-full blur-3xl group-hover:bg-primary/10 transition-colors duration-700 pointer-events-none" />

                  <div className="flex justify-between items-start mb-16 relative z-10">
                    <div className="border-l-2 border-primary/50 pl-4 py-1">
                      <div className="text-[10px] text-white/40 uppercase tracking-[0.2em] mb-1">{event.date.split(' ')[0]}</div>
                      <div className="text-2xl font-serif text-white/90 leading-none">{event.date.split(' ')[1]}</div>
                    </div>
                    <span className="text-[9px] font-medium text-primary/80 uppercase tracking-[0.2em] border border-primary/20 px-2 py-1 bg-primary/5">{event.tag}</span>
                  </div>

                  <h3 className="text-2xl font-serif mb-4 group-hover:text-primary transition-colors duration-300 relative z-10 leading-[1.2]">{event.title}</h3>
                  <p className="text-white/50 font-light leading-[1.6] mb-10 flex-1 relative z-10 text-sm">
                    {event.desc}
                  </p>

                  <Link href="/login" className="flex items-center gap-3 text-xs text-primary/80 font-medium group-hover:text-primary transition-colors w-fit uppercase tracking-[0.15em] relative z-10 mt-auto">
                    RSVP <ArrowRight className="w-4 h-4 group-hover:translate-x-2 transition-transform duration-300" />
                  </Link>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

      </div>
    </PageTransition>
  );
}