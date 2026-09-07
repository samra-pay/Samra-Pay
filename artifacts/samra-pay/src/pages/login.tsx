import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@workspace/samra-pay-ds/components/ui/button";
import { CustomerEntryPanel } from "@/components/customer-entry-panel";
import { consumePostLoginRedirect } from "@/lib/remittance-handoff";
import { useSamraDataMode } from "@/lib/samra-runtime";
import { useCustomerAuth } from "@/lib/customer-auth";
import type { CustomerEntryIntent } from "@/lib/customer-entry";
import { localized, usePublicLanguage } from "@/lib/public-i18n";

export default function Login({ signup = false }: { signup?: boolean }) {
  const [isLoading, setIsLoading] = useState(false);
  const [signInFailed, setSignInFailed] = useState(false);
  const [, setLocation] = useLocation();
  const mode = useSamraDataMode();
  const auth = useCustomerAuth();
  const { text } = usePublicLanguage();

  useEffect(() => {
    if (mode === "api" && auth.status === "authenticated") {
      setLocation("/session", { replace: true });
    }
  }, [auth.status, mode, setLocation]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "mock") {
      setLocation(signup ? "/onboarding" : consumePostLoginRedirect());
      return;
    }
    await startSignIn(signup ? "signup" : "login");
  };

  const startSignIn = async (intent: CustomerEntryIntent) => {
    setIsLoading(true);
    setSignInFailed(false);
    try {
      await auth.signIn(intent);
    } catch {
      setSignInFailed(true);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <CustomerEntryPanel
      signup={signup}
      homeHref={import.meta.env.BASE_URL}
      alternateHref={`${import.meta.env.BASE_URL}${signup ? "login" : "signup"}`}
    >
      <form onSubmit={handleSubmit}>
        {mode === "mock" ? (
          <p role="status">
            {text(
              localized(
                "This is a synthetic walkthrough. No real account is created and no credentials are collected.",
                "ይህ የሙከራ ጉዞ ነው። እውነተኛ መለያ አይፈጠርም፣ የመግቢያ መረጃም አይሰበሰብም።",
              ),
            )}
          </p>
        ) : null}
        {mode === "api" ? (
          <p className="customer-entry-note">
            {text(
              localized(
                "Access is by invitation. Use the same sign-in method each time to return to your account.",
                "መግባት የሚቻለው በግብዣ ብቻ ነው። ወደ መለያዎ ለመመለስ ሁልጊዜ ተመሳሳይ የመግቢያ ዘዴ ይጠቀሙ።",
              ),
            )}
          </p>
        ) : null}
        {mode === "api" && (auth.status === "error" || signInFailed) ? (
          <p role="alert">
            {text(
              localized(
                "We couldn’t complete your request. Please try again.",
                "ጥያቄዎን መጨረስ አልቻልንም። እንደገና ይሞክሩ።",
              ),
            )}
          </p>
        ) : null}
        <button
          type="submit"
          className="customer-entry-primary"
          disabled={
            isLoading ||
            (mode === "api" &&
              (auth.status === "loading" || auth.status === "authenticated"))
          }
        >
          {isLoading ||
          (mode === "api" &&
            (auth.status === "loading" || auth.status === "authenticated"))
            ? text(localized("Continuing securely…", "በደህንነት በመቀጠል ላይ…"))
            : mode === "mock"
              ? signup
                ? text(localized("Preview account setup", "የመለያ ማዋቀርን ይመልከቱ"))
                : text(localized("Open demo", "ማሳያውን ይክፈቱ"))
              : signup
                ? text(localized("Create account", "መለያ ይፍጠሩ"))
                : text(localized("Log in", "ይግቡ"))}
        </button>
        {mode === "api" ? (
          <p className="customer-entry-note">
            {text(
              localized(
                "You’ll continue to secure sign-in. Your password is never collected on this page.",
                "ወደ ደህንነቱ የተጠበቀ መግቢያ ይቀጥላሉ። በዚህ ገጽ የይለፍ ቃልዎ አይሰበሰብም።",
              ),
            )}
          </p>
        ) : null}
        {mode === "api" && !signup ? (
          <>
            <Button
              type="button"
              variant="link"
              className="customer-entry-recovery w-full"
              disabled={
                isLoading ||
                auth.status === "loading" ||
                auth.status === "authenticated"
              }
              aria-describedby="customer-recovery-help"
              onClick={() => void startSignIn("recovery")}
            >
              {text(localized("Forgot your password?", "የይለፍ ቃልዎን ረሱ?"))}
            </Button>
            <p id="customer-recovery-help" className="customer-entry-note">
              {text(
                localized(
                  "On the secure sign-in page, choose Forgot password. If you use Google, recover access with Google.",
                  "በደህንነቱ የተጠበቀ መግቢያ ገጽ ላይ የይለፍ ቃል መርሳትን ይምረጡ። በGoogle የሚገቡ ከሆነ፣ መግቢያዎን በGoogle ያስመልሱ።",
                ),
              )}
            </p>
          </>
        ) : null}
      </form>
    </CustomerEntryPanel>
  );
}
