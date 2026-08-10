import { PageTransition } from "@/components/page-transition";
import { Button } from "@/components/ui/button";
import socialHouseImg from "@assets/generated_images/social-house.jpg";
import coffeeImg from "@assets/generated_images/coffee-pour.jpg";
import { Link } from "wouter";

export default function SocialHouse() {
  return (
    <PageTransition>
      <div className="w-full">
        {/* Hero */}
        <section className="relative min-h-[80vh] flex items-end pb-24 pt-32">
          <div className="absolute inset-0 z-0">
            <img 
              src={socialHouseImg} 
              alt="Samra Social House" 
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-background/20" />
          </div>
          
          <div className="container mx-auto px-6 relative z-10">
            <div className="max-w-3xl">
              <div className="font-serif text-primary text-xl italic mb-4">The Samra Social House</div>
              <h1 className="font-serif text-5xl md:text-7xl mb-6 leading-[1.1]">Where culture<br/>meets capital.</h1>
              <p className="text-xl text-white/80 max-w-xl">
                An exclusive hub for members. Experience the warmth of a traditional coffee ceremony wrapped in the atmosphere of a modern listening bar.
              </p>
            </div>
          </div>
        </section>

        {/* Content */}
        <section className="py-24">
          <div className="container mx-auto px-6">
            <div className="grid md:grid-cols-2 gap-20 items-center">
              <div>
                <h2 className="text-3xl font-serif mb-6">More than an account. A community.</h2>
                <p className="text-muted-foreground mb-6 leading-relaxed">
                  The Samra Social House is our physical footprint—a place where the diaspora gathers to share ideas, build networks, and grow wealth. By day, it’s a co-working space infused with the aroma of freshly roasted Ethiopian beans.
                </p>
                <p className="text-muted-foreground mb-8 leading-relaxed">
                  By night, the lights dim. Vinyl spins. We host intimate financial literacy workshops, angel investing syndicates, and cultural celebrations celebrating the breadth of Habesha excellence.
                </p>
                <div className="space-y-4 border-l-2 border-primary/30 pl-6 my-8">
                  <div>
                    <h4 className="font-medium text-foreground">Buna & Business</h4>
                    <p className="text-sm text-muted-foreground">Weekly morning coffee ceremonies focused on entrepreneurship.</p>
                  </div>
                  <div>
                    <h4 className="font-medium text-foreground">The Syndicate</h4>
                    <p className="text-sm text-muted-foreground">Monthly pitch nights connecting diaspora founders with capital.</p>
                  </div>
                </div>
                <Button asChild variant="outline" className="border-primary/50 text-primary hover:bg-primary/10">
                  <Link href="/login">View Upcoming Events</Link>
                </Button>
              </div>
              
              <div className="relative">
                <img 
                  src={coffeeImg} 
                  alt="Coffee Pour" 
                  className="rounded-2xl w-full aspect-[4/5] object-cover shadow-2xl"
                />
                <div className="absolute -bottom-8 -left-8 bg-card border border-white/10 p-6 rounded-xl shadow-xl max-w-[240px]">
                  <div className="font-serif text-xl text-primary mb-2">Access Granted</div>
                  <p className="text-sm text-muted-foreground">Samra Charge Card members receive priority booking and complimentary coffee service.</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </PageTransition>
  );
}
