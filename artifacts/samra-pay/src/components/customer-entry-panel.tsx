import type { ReactNode } from "react";
import { ArrowLeft, LockKeyhole } from "lucide-react";
import { ComingSoonLogo } from "./coming-soon-shell";
import { localized, usePublicLanguage } from "@/lib/public-i18n";
import "@/pages/coming-soon.css";
import "./customer-entry.css";

export function CustomerEntryPanel({
  signup,
  children,
  alternateHref,
  homeHref = "/",
}: {
  signup: boolean;
  children: ReactNode;
  alternateHref: string;
  homeHref?: string;
}) {
  const { text, language } = usePublicLanguage();
  return (
    <div
      className={`coming-soon-site customer-entry ${language === "am" ? "is-amharic" : ""}`}
      lang={language}
    >
      <header className="customer-entry-header">
        <a href={homeHref} aria-label="Samra Pay home">
          <ComingSoonLogo dark />
        </a>
        <a href={homeHref}>
          <ArrowLeft aria-hidden="true" />
          {text(localized("Back to home", "ወደ መነሻ ይመለሱ"))}
        </a>
      </header>
      <main className="customer-entry-main" id="main-content">
        <section className="customer-entry-story" aria-label="Samra Pay">
          <p className="section-eyebrow">
            {text(localized("Here. Home. Connected.", "እዚህ። አገር ቤት። በግንኙነት።"))}
          </p>
          <h2>
            {text(
              localized(
                "Your next chapter, connected.",
                "የሚቀጥለው ምዕራፍዎ፣ በግንኙነት።",
              ),
            )}
          </h2>
          <p>
            {text(
              localized(
                "A place to begin. A connection to carry forward.",
                "ለመጀመር ቦታ። ወደፊት የሚቀጥል ግንኙነት።",
              ),
            )}
          </p>
        </section>
        <section
          className="customer-entry-card"
          aria-labelledby="customer-entry-title"
        >
          <LockKeyhole className="customer-entry-icon" aria-hidden="true" />
          <h1 id="customer-entry-title">
            {signup
              ? text(localized("Create your account", "መለያዎን ይፍጠሩ"))
              : text(localized("Welcome back", "እንኳን ደህና መጡ"))}
          </h1>
          <p>
            {signup
              ? text(
                  localized(
                    "Start with a secure Samra Pay sign-up.",
                    "በደህንነቱ የተጠበቀ የSamra Pay ምዝገባ ይጀምሩ።",
                  ),
                )
              : text(
                  localized(
                    "Log in to continue your Samra Pay journey.",
                    "የSamra Pay ጉዞዎን ለመቀጠል ይግቡ።",
                  ),
                )}
          </p>
          <div className="customer-entry-actions">{children}</div>
          <p className="customer-entry-alternate">
            {signup
              ? text(localized("Already have an account?", "መለያ አለዎት?"))
              : text(
                  localized("New to Samra Pay?", "ለSamra Pay አዲስ ነዎት?"),
                )}{" "}
            <a href={alternateHref}>
              {signup
                ? text(localized("Log in", "ይግቡ"))
                : text(localized("Create account", "መለያ ይፍጠሩ"))}
            </a>
          </p>
        </section>
      </main>
    </div>
  );
}
