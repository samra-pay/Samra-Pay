import { cn } from "@workspace/samra-pay-ds/lib/utils";
import { useLanguage, type Language } from "@/lib/i18n";

const OPTIONS: { value: Language; label: string; aria: string; lang: Language }[] = [
  { value: "en", label: "EN", aria: "Switch to English", lang: "en" },
  { value: "am", label: "አማ", aria: "ወደ አማርኛ ቀይር (Switch to Amharic)", lang: "am" },
];

export function LanguageToggle({ className }: { className?: string }) {
  const { language, setLanguage, t } = useLanguage();

  return (
    <div
      role="group"
      aria-label={t("lang.label")}
      className={cn(
        "inline-flex items-center rounded-full border border-white/10 bg-secondary/40 p-0.5",
        className,
      )}
    >
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          lang={opt.lang}
          aria-label={opt.aria}
          aria-pressed={language === opt.value}
          onClick={() => setLanguage(opt.value)}
          className={cn(
            "rounded-full px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            opt.value === "am" && "font-ethiopic",
            language === opt.value
              ? "bg-primary/15 text-primary"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
