import { PageTransition } from "@/components/page-transition";
import { Button } from "@/components/ui/button";
import socialHouseImg from "@assets/generated_images/social-house.jpg";
import coffeeImg from "@assets/generated_images/coffee-pour.jpg";
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
      desc: "Late-night listening session featuring rare 70s Ethiopian jazz cuts. Curated cocktails and connection.",
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
              alt="Samra Pay Social House" 
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
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/20 bg-primary/10 text-primary text-xs font-semibold tracking-widest uppercase mb-6 backdrop-blur-md">
                Members Only
              </div>
              <h1 className="font-serif text-6xl md:text-8xl mb-8 leading-[1.05] font-normal tracking-tight text-[#F9F7F1]">
                Where culture<br/>
                <span className="italic text-primary">meets capital.</span>
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
                    The Samra Pay Social House is our physical footprint—a place where the diaspora gathers to share ideas, build networks, and grow wealth. By day, it’s a co-working space infused with the aroma of freshly roasted Ethiopian beans.
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
                  src={coffeeImg} 
                  alt="Coffee Pour" 
                  className="rounded-[2rem] w-full aspect-[4/5] object-cover shadow-2xl border border-white/10"
                />
                <div className="absolute -bottom-10 -left-10 bg-card/80 backdrop-blur-xl border border-white/10 p-8 rounded-[1.5rem] shadow-2xl max-w-[280px]">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                    <Coffee className="w-5 h-5 text-primary" />
                  </div>
                  <div className="font-serif text-2xl text-white/90 mb-2">Access Granted</div>
                  <p className="text-sm text-muted-foreground font-light leading-relaxed">
                    Samra Pay Charge Card members receive priority booking and complimentary coffee service.
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