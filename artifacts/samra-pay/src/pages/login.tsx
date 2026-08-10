import { useState } from "react";
import { PageTransition } from "@/components/page-transition";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { Link, useLocation } from "wouter";
import { SamraLogo } from "@/components/samra-logo";

export default function Login() {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    // Simulate network delay then route to dashboard
    setTimeout(() => {
      setIsLoading(false);
      setLocation("/dashboard");
    }, 800);
  };

  return (
    <PageTransition>
      <div className="min-h-screen flex items-center justify-center p-6 bg-background relative overflow-hidden">
        {/* Abstract background elements */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-[30rem] h-[30rem] bg-accent/20 rounded-full blur-[120px] pointer-events-none" />

        <div className="w-full max-w-md relative z-10">
          <div className="text-center mb-10">
            <Link href="/">
              <div className="cursor-pointer mb-6 inline-block">
                <SamraLogo size="lg" showWordmark={false} />
              </div>
            </Link>
            <h1 className="font-serif text-3xl mb-2">Welcome Back</h1>
            <p className="text-muted-foreground">Sign in to your Samra Pay account</p>
          </div>

          <div className="bg-card/50 backdrop-blur-xl border border-white/10 p-8 rounded-2xl shadow-2xl">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground/80">Email</label>
                <Input 
                  type="email" 
                  placeholder="name@example.com" 
                  className="bg-background/50 border-white/10 focus-visible:border-primary focus-visible:ring-primary/20"
                />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-medium text-foreground/80">Password</label>
                  <span className="text-xs text-primary cursor-pointer hover:underline">Forgot?</span>
                </div>
                <Input 
                  type="password" 
                  placeholder="••••••••" 
                  className="bg-background/50 border-white/10 focus-visible:border-primary focus-visible:ring-primary/20"
                />
              </div>

              <Button 
                type="submit" 
                variant="gold" 
                className="w-full h-12 text-base font-medium"
                disabled={isLoading}
              >
                {isLoading ? <Loader2 className="animate-spin w-5 h-5" /> : "Sign In"}
              </Button>
            </form>

            <div className="mt-6 text-center text-sm text-muted-foreground">
              Don't have an account? <Link href="/"><span className="text-primary hover:underline cursor-pointer">Apply for access</span></Link>
            </div>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
