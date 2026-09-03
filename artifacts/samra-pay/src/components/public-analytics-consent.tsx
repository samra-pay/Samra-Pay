import { useEffect, useRef, useState } from "react";
import { localized, usePublicLanguage } from "../lib/public-i18n";
import {
  CONSENT_KEY,
  PREFERENCES_EVENT,
  analyticsNeedsReload,
  privacySignalEnabled,
  readAnalyticsChoice,
  startPublicAnalytics,
  stopPublicAnalytics,
  storeAnalyticsChoice,
  type AnalyticsChoice,
} from "../lib/public-analytics";

export function PublicAnalyticsConsent({
  showPrompt = true,
}: {
  showPrompt?: boolean;
}) {
  const { text, language } = usePublicLanguage();
  const [open, setOpen] = useState(
    () => showPrompt && readAnalyticsChoice() === null,
  );
  const [saved, setSaved] = useState(true);
  const heading = useRef<HTMLHeadingElement>(null);
  const trigger = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const sync = () => {
      const choice = readAnalyticsChoice();
      if (choice === "granted") startPublicAnalytics();
      else stopPublicAnalytics();
      if (choice === null && showPrompt) setOpen(true);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === CONSENT_KEY || event.key === null) sync();
    };
    const show = () => {
      trigger.current = document.activeElement as HTMLElement;
      setOpen(true);
      requestAnimationFrame(() => heading.current?.focus());
    };
    sync();
    window.addEventListener(PREFERENCES_EVENT, show);
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", sync);
    const interval = window.setInterval(sync, 60_000);
    return () => {
      window.removeEventListener(PREFERENCES_EVENT, show);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", sync);
      window.clearInterval(interval);
    };
  }, [showPrompt]);

  const choose = (choice: AnalyticsChoice) => {
    const allowed = choice === "granted" && !privacySignalEnabled();
    const stored = storeAnalyticsChoice(allowed ? "granted" : "denied");
    setSaved(stored);
    if (allowed && stored) {
      // A fresh document safely reinitializes a tag previously withdrawn.
      if (analyticsNeedsReload()) window.location.reload();
      else startPublicAnalytics();
    } else stopPublicAnalytics();
    if (stored) {
      setOpen(false);
      trigger.current?.focus();
    }
  };

  if (!open) return null;
  return (
    <section
      className="public-analytics-consent"
      aria-labelledby="analytics-title"
      lang={language}
    >
      <h2 id="analytics-title" ref={heading} tabIndex={-1}>
        {text(localized("Optional website analytics", "አማራጭ የድረ ገጽ ትንታኔ"))}
      </h2>
      <p>
        {text(
          localized(
            "With your permission, Google Analytics uses cookies to measure visits and engagement on this public website. No advertising or form tracking. You can change your choice in the footer.",
            "በፈቃድዎ፣ Google Analytics በዚህ ድረ ገጽ ላይ ጉብኝቶችንና አጠቃቀምን ለመለካት ኩኪዎችን ይጠቀማል። የማስታወቂያ ወይም የቅጽ ክትትል የለም። ምርጫዎን ከገጹ ግርጌ መቀየር ይችላሉ።",
          ),
        )}{" "}
        <a href="/privacy">
          {text(localized("Privacy details", "የግላዊነት ዝርዝሮች"))}
        </a>
      </p>
      {privacySignalEnabled() && (
        <p role="status">
          {text(
            localized(
              "Your browser privacy signal keeps analytics off.",
              "የአሳሽዎ የግላዊነት ምልክት ትንታኔን ያግዳል።",
            ),
          )}
        </p>
      )}
      {!saved && (
        <p role="status">
          {text(
            localized(
              "Your choice could not be saved. Analytics stays off on this page.",
              "ምርጫዎ ሊቀመጥ አልቻለም። በዚህ ገጽ ላይ ትንታኔ ጠፍቷል።",
            ),
          )}
        </p>
      )}
      <div>
        <button type="button" onClick={() => choose("denied")}>
          {text(localized("Reject analytics", "ትንታኔን አትፍቀድ"))}
        </button>
        <button
          type="button"
          disabled={privacySignalEnabled()}
          onClick={() => choose("granted")}
        >
          {text(localized("Accept analytics", "ትንታኔን ፍቀድ"))}
        </button>
      </div>
    </section>
  );
}
