import { useEffect, useState } from "react";
import { PageTransition } from "@/components/page-transition";
import { Button } from "@workspace/samra-pay-ds/components/ui/button";
import { Loader2, ShieldCheck } from "lucide-react";
import { Link, useLocation } from "wouter";
import { SamraLogo } from "@/components/samra-logo";
import { consumePostLoginRedirect } from "@/lib/remittance-handoff";
import { useSamraDataMode } from "@/lib/samra-runtime";
import { useCustomerAuth } from "@/lib/customer-auth";

export default function Login() {
  const [isLoading, setIsLoading] = useState(false);
  const [signInFailed, setSignInFailed] = useState(false);
  const [, setLocation] = useLocation();
  const mode = useSamraDataMode();
  const auth = useCustomerAuth();

  useEffect(() => {
    if (mode === "api" && auth.status === "authenticated") {
      setLocation("/onboarding", { replace: true });
    }
  }, [auth.status, mode, setLocation]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "api") {
      setIsLoading(true);
      setSignInFailed(false);
      try {
        await auth.signIn();
      } catch {
        setSignInFailed(true);
      } finally {
        setIsLoading(false);
      }
      return;
    }
    setIsLoading(true);

    setTimeout(() => {
      setIsLoading(false);
      setLocation("/onboarding");
    }, 350);
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
            <h1 className="mb-2 font-serif text-3xl font-normal tracking-tight text-[#F9F7F1]">
              {mode === "mock" ? (
                <>
                  Explore <span className="italic text-primary">Samra</span>
                </>
              ) : (
                <>
                  Secure <span className="italic text-primary">Sign In</span>
                </>
              )}
            </h1>
            <p className="text-muted-foreground">
              {mode === "mock"
                ? "Walk through the synthetic customer onboarding journey"
                : "Authenticate with Samra Pay to continue"}
            </p>
          </div>

          <div className="bg-card/50 backdrop-blur-xl border border-white/10 p-8 rounded-2xl shadow-2xl">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="flex gap-3 rounded-xl border border-white/10 bg-background/35 p-4">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <p className="text-sm leading-6 text-muted-foreground">
                  {mode === "mock"
                    ? "No email, password, or real account is used. All onboarding data in this mode is synthetic and resets locally."
                    : "Your credentials are entered only in Auth0 Universal Login. Samra Pay does not collect or store your password or browser token."}
                </p>
              </div>

              {mode === "api" && (auth.status === "error" || signInFailed) ? (
                <p
                  role="alert"
                  className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
                >
                  Secure sign-in could not be completed. Please retry.
                </p>
              ) : null}

              <Button
                type="submit"
                variant="gold"
                className="h-12 w-full text-base font-medium"
                disabled={
                  isLoading ||
                  (mode === "api" &&
                    (auth.status === "loading" ||
                      auth.status === "authenticated"))
                }
              >
                {isLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : mode === "mock" ? (
                  "Start synthetic onboarding"
                ) : auth.status === "loading" ? (
                  "Checking secure session"
                ) : auth.status === "authenticated" ? (
                  "Continuing securely"
                ) : (
                  "Continue with Auth0"
                )}
              </Button>
            </form>

            {mode === "mock" ? (
              <div className="mt-6 text-center text-sm text-muted-foreground">
                Returning to the existing demo?{" "}
                <button
                  type="button"
                  className="min-h-11 text-primary underline-offset-4 hover:underline"
                  onClick={() => setLocation(consumePostLoginRedirect())}
                >
                  Open dashboard
                </button>
              </div>
            ) : (
              <div className="mt-6 text-center text-sm text-muted-foreground">
                <Link href="/">
                  <span className="cursor-pointer text-primary hover:underline">
                    Return home
                  </span>
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
