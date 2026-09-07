import { useEffect, useRef, useState } from "react";
import {
  ExternalLink,
  Loader2,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import type { SamraOnboardingSource } from "@workspace/samra-client/onboarding";
import { Button } from "@workspace/samra-pay-ds/components/ui/button";

export function PersonaHostedVerification({
  source,
  onReturn,
}: {
  source: SamraOnboardingSource;
  onReturn: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const mounted = useRef(true);
  const inFlight = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!url) return;
    // Drop the browser copy before the provider's five-minute maximum.
    const timer = window.setTimeout(() => setUrl(null), 4 * 60_000);
    return () => window.clearTimeout(timer);
  }, [url]);
  useEffect(() => {
    const returned = () => {
      setUrl(null);
      onReturn(); // Refresh Samra state; browser events never grant a KYC outcome.
    };
    const visibility = () => {
      setUrl(null);
      if (document.visibilityState === "visible") onReturn();
    };
    window.addEventListener("focus", returned);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("focus", returned);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [onReturn]);

  async function prepare() {
    if (inFlight.current || !source.createIdentityHostedLaunch) return;
    inFlight.current = true;
    setPending(true);
    setFailed(false);
    setUrl(null);
    try {
      const launch = await source.createIdentityHostedLaunch(
        crypto.randomUUID(),
      );
      if (mounted.current) setUrl(launch.url);
    } catch {
      if (mounted.current) setFailed(true);
    } finally {
      inFlight.current = false;
      if (mounted.current) setPending(false);
    }
  }

  return (
    <section
      className="space-y-3 rounded-xl border border-border bg-muted/30 p-4"
      aria-label="Persona verification"
    >
      <p className="flex items-center gap-2 text-sm font-semibold">
        <ShieldCheck className="h-4 w-4" aria-hidden="true" />
        Continue verification with Persona
      </p>
      <p className="text-sm text-muted-foreground">
        Sandbox verification uses test information only. Persona opens in a new
        tab. Return here to check your saved status.
      </p>
      {failed ? (
        <p role="alert" className="flex items-center gap-2 text-sm">
          <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
          We could not open verification. Try again; your saved progress is
          unchanged.
        </p>
      ) : null}
      {url ? (
        <div className="space-y-2">
          <p role="status" className="text-sm text-muted-foreground">
            Your verification link is ready.
          </p>
          <Button asChild className="min-h-11 w-full">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              referrerPolicy="no-referrer"
              onClick={() => {
                window.setTimeout(() => {
                  if (mounted.current) setUrl(null);
                }, 0);
              }}
            >
              Continue to Persona (new tab)
              <ExternalLink className="ml-2 h-4 w-4" aria-hidden="true" />
            </a>
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          className="min-h-11 w-full"
          disabled={pending}
          onClick={() => void prepare()}
        >
          {pending ? (
            <Loader2
              className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
          ) : null}
          {pending ? "Preparing verification…" : "Prepare verification link"}
        </Button>
      )}
    </section>
  );
}
