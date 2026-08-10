import { PageTransition } from "@/components/page-transition";
import { Button } from "@/components/ui/button";
import socialHouseImg from "@assets/generated_images/social-house.jpg";
import tomocaCoffeeImg from "@assets/generated_images/tomoca-coffee_2.jpg";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Calendar, Users, MapPin, Music, Coffee, ArrowRight } from "lucide-react";

export default function SocialHouse() {
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
      <div className="w-full">
        {/* HERO */}
        <section className="relative min-h-[90vh] flex items-end pb-32 pt-32 overflow-hidden">
          <div className="absolute inset-0 z-0">
            <motion.img 
              initial={{ scale: 1.1 }}
              animate={{ scale: 1 }}
              transition={{ duration: 2, ease: "easeOut" }}
              src={socialHouseImg} 
              alt="Tomoca Social House" 
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-background/20" />
            <div className="absolute inset-0 bg-black/20" />
          </div>
          
          <div className="container mx-auto px-6 relative z-10">
            <motion.div 
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.8 }}
              className="max-w-4xl"
            >
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/20 bg-primary/10 text-primary text-xs font-semibold tracking-widest uppercase mb-4 backdrop-blur-md">
                Members Only
              </div>
              <div className="font-serif text-lg md:text-xl text-[#F9F7F1]/80 mb-6 italic tracking-wide">
                Coffee by Tomoca · Est. 1953
              </div>
              <h1 className="font-serif text-6xl md:text-8xl mb-8 leading-[1.05] font-normal tracking-tight text-[#F9F7F1]">
                Tomoca Social<br/>
                <span className="italic text-primary">House.</span>
              </h1>
              <p className="text-xl md:text-2xl text-white/80 max-w-2xl font-light leading-relaxed">
                An exclusive hub for members. Experience the warmth of a traditional coffee ceremony wrapped in the atmosphere of a modern listening bar.
              </p>
            </motion.div>
          </div>
        </section>

        {/* NARRATIVE SECTION */}
        <section className="py-32 relative">
          <div className="container mx-auto px-6">
            <div className="grid lg:grid-cols-2 gap-20 items-center">
              <motion.div
                initial={{ opacity: 0, x: -30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.8 }}
              >
                <h2 className="text-4xl md:text-5xl font-serif mb-8 leading-[1.05] tracking-tight font-normal text-[#F9F7F1]">
                  More than an account.<br/>
                  <span className="italic text-primary">A community.</span>
                </h2>
                <div className="space-y-6 text-lg text-muted-foreground font-light leading-relaxed">
                  <p>
                    The Tomoca Social House is our physical footprint—a place where the diaspora gathers to share ideas, build networks, and grow wealth. By day, it’s a co-working space infused with the legendary aroma of freshly roasted Tomoca beans.
                  </p>
                  <p>
                    By night, the lights dim. Vinyl spins. We host intimate financial literacy workshops, angel investing syndicates, and cultural nights celebrating the breadth of our excellence.
                  </p>
                </div>
                
                <div className="grid grid-cols-2 gap-8 mt-12 pt-12 border-t border-white/5">
                  <div>
                    <MapPin className="w-6 h-6 text-primary mb-4" />
                    <h4 className="font-medium text-white/90 mb-1">Washington D.C.</h4>
                    <p className="text-sm text-muted-foreground">Opening 2024</p>
                  </div>
                  <div>
                    <MapPin className="w-6 h-6 text-primary mb-4" />
                    <h4 className="font-medium text-white/90 mb-1">Los Angeles</h4>
                    <p className="text-sm text-muted-foreground">Opening 2025</p>
                  </div>
                </div>
              </motion.div>
              
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.8 }}
                className="relative"
              >
                <div className="absolute -inset-4 bg-primary/10 rounded-[2.5rem] blur-2xl -z-10" />
                <img 
                  src={tomocaCoffeeImg} 
                  alt="Tomoca Coffee Pour" 
                  className="rounded-[2rem] w-full aspect-[4/5] object-cover shadow-2xl border border-white/10"
                />
                <div className="absolute -bottom-10 -left-10 bg-card/80 backdrop-blur-xl border border-white/10 p-8 rounded-[1.5rem] shadow-2xl max-w-[280px]">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                    <Coffee className="w-5 h-5 text-primary" />
                  </div>
                  <div className="font-serif text-2xl text-white/90 mb-2">Access Granted</div>
                  <p className="text-sm text-muted-foreground font-light leading-relaxed">
                    Samra Pay Charge Card members receive priority booking and complimentary Tomoca coffee service.
                  </p>
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        <section className="py-24 bg-[#0A0705] border-y border-white/5 relative">
          <div className="absolute top-0 right-0 w-1/2 h-full bg-[radial-gradient(circle_at_70%_50%,_rgba(212,175,55,0.05),_transparent_70%)] pointer-events-none" />
          <div className="container mx-auto px-6 relative z-10">
            <motion.div 
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8 }}
              className="max-w-4xl mx-auto text-center"
            >
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/20 bg-primary/10 text-primary text-xs font-semibold tracking-widest uppercase mb-8">
                Heritage Partner
              </div>
              <h2 className="text-4xl md:text-5xl font-serif mb-8 leading-[1.05] tracking-tight font-normal text-[#F9F7F1]">
                A legacy of <span className="italic text-primary">roast & ritual.</span>
              </h2>
              <div className="space-y-6 text-lg md:text-xl text-muted-foreground font-light leading-relaxed">
                <p>
                  Founded in 1953 near Piassa, Addis Ababa, Tomoca is Ethiopia's first Italian-style coffee roastery. For seventy years, it has been the cornerstone of the city's café culture—a place where deals are struck, news is shared, and the finest Harar beans are brewed to perfection.
                </p>
                <p>
                  Today, that exact heritage powers the coffee ceremony at the Tomoca Social House. Every cup poured is a direct line back to home.
                </p>
              </div>
            </motion.div>
          </div>
        </section>

        {/* MULATU ASTATKE FEATURE */}
        <section className="py-24 bg-card/30 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_bottom_left,_rgba(212,175,55,0.08),_transparent_50%)] pointer-events-none" />
          <div className="container mx-auto px-6 relative z-10">
            <div className="grid lg:grid-cols-2 gap-16 items-center">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.8 }}
                className="order-2 lg:order-1 flex justify-center"
              >
                {/* Abstract typographic/silhouette treatment */}
                <div className="relative w-72 h-72 md:w-96 md:h-96 rounded-full border border-primary/20 bg-background/50 flex items-center justify-center overflow-hidden group shadow-[0_0_40px_rgba(212,175,55,0.05)]">
                  <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9InJnYmEoMjEyLDE3NSw1NSwwLjE1KSIvPjwvc3ZnPg==')] [mask-image:radial-gradient(black,transparent_70%)] animate-[spin_60s_linear_infinite]" />
                  <div className="text-center z-10">
                    <Music className="w-12 h-12 text-primary/50 mx-auto mb-4 group-hover:scale-110 transition-transform duration-500" />
                    <div className="font-serif italic text-4xl text-primary/40 tracking-widest">Ethio-Jazz</div>
                  </div>
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
                  Evening Programming
                </div>
                <h2 className="text-4xl md:text-5xl font-serif mb-6 leading-[1.05] tracking-tight font-normal text-[#F9F7F1]">
                  The soundtrack of <br/><span className="italic text-primary">an era.</span>
                </h2>
                <div className="space-y-6 text-lg text-muted-foreground font-light leading-relaxed">
                  <p>
                    When the sun sets, the Tomoca Social House transforms. Our "Ethio-jazz Nights" celebrate the golden era of the 1970s swinging Addis scene, heavily inspired by pioneers like Mulatu Astatke.
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
        <section className="py-32 bg-secondary/30 border-y border-white/5 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4wNSkiLz48L3N2Zz4=')] [mask-image:linear-gradient(to_bottom,transparent,black,transparent)]" />
          
          <div className="container mx-auto px-6 relative z-10">
            <div className="flex flex-col md:flex-row justify-between items-end mb-16 gap-6">
              <div>
                <h2 className="text-4xl font-serif mb-4 font-normal tracking-tight text-[#F9F7F1]">Upcoming <span className="italic text-primary">Calendar</span></h2>
                <p className="text-muted-foreground font-light text-lg">Curated experiences for the mind and soul.</p>
              </div>
              <Button asChild variant="outline" className="rounded-full px-6">
                <Link href="/login">Apply for Membership</Link>
              </Button>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              {events.map((event, idx) => (
                <motion.div 
                  key={idx}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: idx * 0.1, duration: 0.6 }}
                  className="bg-card border border-white/5 rounded-3xl p-8 hover:border-primary/30 transition-colors group relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-2xl group-hover:bg-primary/10 transition-colors" />
                  
                  <div className="flex justify-between items-start mb-12">
                    <div className="bg-white/5 border border-white/10 px-4 py-2 rounded-xl text-center">
                      <div className="text-xs text-muted-foreground uppercase tracking-widest mb-1">{event.date.split(' ')[0]}</div>
                      <div className="text-xl font-serif text-white/90">{event.date.split(' ')[1]}</div>
                    </div>
                    <span className="text-xs font-semibold text-primary uppercase tracking-widest">{event.tag}</span>
                  </div>
                  
                  <h3 className="text-2xl font-serif mb-4 group-hover:text-primary transition-colors">{event.title}</h3>
                  <p className="text-muted-foreground font-light leading-relaxed mb-8">
                    {event.desc}
                  </p>
                  
                  <div className="flex items-center gap-2 text-sm text-white/60 font-medium group-hover:text-white/90 transition-colors cursor-pointer w-fit">
                    RSVP <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

      </div>
    </PageTransition>
  );
}