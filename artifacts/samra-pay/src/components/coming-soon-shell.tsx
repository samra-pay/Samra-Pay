import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { configuredCustomerLinks } from "@/lib/public-customer-entry";
import { localized, usePublicLanguage } from "@/lib/public-i18n";

const publicNavigation = [
  { label: localized("Features", "ባህሪያት"), href: "/features" },
  { label: localized("Values", "እሴቶቻችን"), href: "/values" },
  { label: localized("FAQ", "ጥያቄና መልስ"), href: "/faq" },
  { label: localized("Blog", "ጽሑፎች"), href: "/blog" },
];

const socialLinks = [
  { label: "Facebook", href: import.meta.env.VITE_SAMRA_SOCIAL_FACEBOOK_URL },
  { label: "Instagram", href: import.meta.env.VITE_SAMRA_SOCIAL_INSTAGRAM_URL },
  { label: "TikTok", href: import.meta.env.VITE_SAMRA_SOCIAL_TIKTOK_URL },
  { label: "X", href: import.meta.env.VITE_SAMRA_SOCIAL_X_URL },
  { label: "LinkedIn", href: import.meta.env.VITE_SAMRA_SOCIAL_LINKEDIN_URL },
  { label: "YouTube", href: import.meta.env.VITE_SAMRA_SOCIAL_YOUTUBE_URL },
];

export function ComingSoonLogo({ dark = false }: { dark?: boolean }) {
  return (
    <span
      className={dark ? "coming-logo is-dark" : "coming-logo"}
      aria-label="Samra Pay"
    >
      <span>samra</span>
      <em>pay</em>
    </span>
  );
}

function ComingSoonLanguageToggle({ className = "" }: { className?: string }) {
  const { language, setLanguage, text } = usePublicLanguage();

  return (
    <div
      className={`coming-language-toggle ${className}`}
      role="group"
      aria-label={text(localized("Language", "ቋንቋ"))}
    >
      <button
        type="button"
        lang="en"
        aria-pressed={language === "en"}
        onClick={() => setLanguage("en")}
      >
        EN
      </button>
      <button
        type="button"
        lang="am"
        aria-pressed={language === "am"}
        onClick={() => setLanguage("am")}
      >
        አማ
      </button>
    </div>
  );
}

export function ComingSoonHeader() {
  const [open, setOpen] = useState(false);
  const { text } = usePublicLanguage();
  const currentPath = window.location.pathname;
  const customerLinks = configuredCustomerLinks();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const mobileNavRef = useRef<HTMLDivElement>(null);

  const closeMenu = () => {
    setOpen(false);
    window.requestAnimationFrame(() => menuButtonRef.current?.focus());
  };

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const backgroundElements = Array.from(
      document.querySelectorAll<HTMLElement>("main, footer"),
    );
    document.body.style.overflow = "hidden";
    backgroundElements.forEach((element) => {
      element.inert = true;
    });
    window.requestAnimationFrame(() => {
      mobileNavRef.current?.querySelector<HTMLElement>("button")?.focus();
    });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMenu();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        mobileNavRef.current?.querySelectorAll<HTMLElement>(
          "a[href], button:not([disabled])",
        ) ?? [],
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      backgroundElements.forEach((element) => {
        element.inert = false;
      });
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <header className="coming-header">
      <a
        className="coming-skip-link"
        href="#main-content"
        aria-hidden={open || undefined}
        tabIndex={open ? -1 : undefined}
        onClick={() =>
          window.requestAnimationFrame(() =>
            document
              .getElementById("main-content")
              ?.focus({ preventScroll: true }),
          )
        }
      >
        {text(localized("Skip to main content", "ወደ ዋናው ይዘት ይሂዱ"))}
      </a>
      <a
        className="brand-link"
        href="/#top"
        aria-label={text(localized("Samra Pay home", "የSamra Pay መነሻ ገጽ"))}
        aria-hidden={open || undefined}
        tabIndex={open ? -1 : undefined}
      >
        <ComingSoonLogo dark />
      </a>
      <nav
        className="coming-desktop-nav"
        aria-label={text(localized("Primary navigation", "ዋና ምናሌ"))}
      >
        {publicNavigation.map((item) => (
          <a
            key={item.href}
            href={item.href}
            aria-current={currentPath === item.href ? "page" : undefined}
          >
            {text(item.label)}
          </a>
        ))}
      </nav>
      <div className="coming-header-actions">
        <a className="coming-updates-link" href="/#launch-updates">
          {text(localized("Stay informed", "ዜና ይከታተሉ"))}
        </a>
        {customerLinks ? (
          <>
            <a
              className="customer-entry-nav"
              href={`${import.meta.env.BASE_URL}login`}
            >
              {text(localized("Log in", "ይግቡ"))}
            </a>
            <a
              className="customer-entry-nav"
              href={`${import.meta.env.BASE_URL}signup`}
            >
              {text(localized("Create account", "መለያ ይፍጠሩ"))}
            </a>
          </>
        ) : null}
        <ComingSoonLanguageToggle />
        <button
          type="button"
          className="coming-menu-button"
          ref={menuButtonRef}
          aria-hidden={open || undefined}
          tabIndex={open ? -1 : undefined}
          aria-label={
            open
              ? text(localized("Close navigation", "ምናሌውን ይዝጉ"))
              : text(localized("Open navigation", "ምናሌውን ይክፈቱ"))
          }
          aria-expanded={open}
          aria-controls="coming-mobile-nav"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </button>
      </div>
      {open && (
        <div
          id="coming-mobile-nav"
          className="coming-mobile-nav"
          ref={mobileNavRef}
          role="dialog"
          aria-modal="true"
          tabIndex={-1}
          aria-label={text(localized("Mobile navigation", "የሞባይል ምናሌ"))}
        >
          <div className="coming-mobile-nav-top">
            <a
              href="/#top"
              aria-label={text(
                localized("Samra Pay home", "የSamra Pay መነሻ ገጽ"),
              )}
              onClick={() => setOpen(false)}
            >
              <ComingSoonLogo dark />
            </a>
            <button
              type="button"
              onClick={closeMenu}
              aria-label={text(localized("Close navigation", "ምናሌውን ይዝጉ"))}
            >
              <X aria-hidden="true" />
            </button>
          </div>
          <nav
            className="coming-mobile-nav-links"
            aria-label={text(localized("Public pages", "የሕዝብ ገጾች"))}
          >
            {publicNavigation.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                aria-current={currentPath === item.href ? "page" : undefined}
              >
                {text(item.label)}
              </a>
            ))}
            {customerLinks ? (
              <>
                <a
                  href={`${import.meta.env.BASE_URL}login`}
                  onClick={() => setOpen(false)}
                >
                  {text(localized("Log in", "ይግቡ"))}
                </a>
                <a
                  href={`${import.meta.env.BASE_URL}signup`}
                  onClick={() => setOpen(false)}
                >
                  {text(localized("Create account", "መለያ ይፍጠሩ"))}
                </a>
              </>
            ) : null}
            <a href="/#launch-updates" onClick={() => setOpen(false)}>
              {text(localized("Stay informed", "ዜና ይከታተሉ"))}
            </a>
          </nav>
          <ComingSoonLanguageToggle className="coming-mobile-language" />
        </div>
      )}
    </header>
  );
}

export function ComingSoonFooter() {
  const { text } = usePublicLanguage();

  return (
    <footer className="coming-footer">
      <div className="coming-container coming-footer-grid">
        <div className="coming-footer-brand">
          <a
            href="/#top"
            aria-label={text(localized("Samra Pay home", "የSamra Pay መነሻ ገጽ"))}
          >
            <ComingSoonLogo />
          </a>
          <p>
            {text(
              localized(
                "Your financial home, built between here and home.",
                "እዚህም አገር ቤትም ያሉ የገንዘብ ጉዳዮችዎን ለማስተዳደር የተገነባ።",
              ),
            )}
          </p>
          <small>
            © {new Date().getFullYear()} Samra Pay.{" "}
            {text(localized("All rights reserved.", "መብቱ በሕግ የተጠበቀ ነው።"))}
          </small>
        </div>
        <div>
          <h3>{text(localized("Explore", "ያስሱ"))}</h3>
          {publicNavigation.map((item) => (
            <a href={item.href} key={item.href}>
              {text(item.label)}
            </a>
          ))}
        </div>
        <div>
          <h3>{text(localized("Legal", "ሕጋዊ መረጃ"))}</h3>
          <a href="/privacy">
            {text(localized("Privacy Policy", "የግላዊነት ፖሊሲ"))}
          </a>
          <a href="/terms">
            {text(localized("Terms of Service", "የአገልግሎት ውሎች"))}
          </a>
          <button
            className="analytics-preferences"
            type="button"
            onClick={() =>
              window.dispatchEvent(new Event("samra-analytics-preferences"))
            }
          >
            {text(localized("Analytics preferences", "የትንታኔ ምርጫዎች"))}
          </button>
        </div>
        <div>
          <h3>{text(localized("Our next chapter", "የሚቀጥለው ምዕራፋችን"))}</h3>
          <p>
            {text(
              localized(
                "Launching for the U.S. and Canada. Connected to Ethiopia.",
                "ለአሜሪካና ካናዳ እየተዘጋጀ። ከኢትዮጵያ ጋር የተገናኘ።",
              ),
            )}
          </p>
          <a href="/#launch-updates">
            {text(localized("Get launch updates", "የምረቃ ዜና ያግኙ"))}
          </a>
        </div>
      </div>
      {socialLinks.some((social) => social.href) && (
        <div className="coming-container coming-footer-social">
          <div>
            <h3>{text(localized("Follow Samra Pay", "Samra Payን ይከተሉ"))}</h3>
            <p>
              {text(
                localized(
                  "Follow the people and stories behind Samra.",
                  "ከSamra ጀርባ ያሉትን ሰዎችና ታሪኮች ይከታተሉ።",
                ),
              )}
            </p>
          </div>
          <div
            className="coming-social-links"
            aria-label={text(
              localized(
                "Samra Pay social channels",
                "የSamra Pay ማህበራዊ ሚዲያ መለያዎች",
              ),
            )}
          >
            {socialLinks
              .filter((social) => social.href)
              .map((social) => (
                <a
                  className="coming-social-link"
                  href={social.href}
                  key={social.label}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`${social.label} — ${text(localized("opens in a new tab", "በአዲስ ትር ይከፈታል"))}`}
                >
                  {social.label}
                  <ArrowUpRight aria-hidden="true" />
                </a>
              ))}
          </div>
        </div>
      )}
    </footer>
  );
}
