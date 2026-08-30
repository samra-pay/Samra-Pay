import { useMemo, useState } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { ComingSoonFooter, ComingSoonHeader } from "@/components/coming-soon-shell";
import { PublicFaqAccordion } from "@/components/public-faq";
import { faqCategories, fullFaqItems, type FaqCategory } from "@/content/public-faq";
import { localized, usePublicLanguage } from "@/lib/public-i18n";
import { usePublicPageMeta } from "@/lib/public-page-meta";
import "./coming-soon.css";

const faqMeta = {
  title: localized("Frequently Asked Questions — Samra Pay", "ተደጋጋሚ ጥያቄዎች — Samra Pay"),
  description: localized("Clear answers about Samra Pay's product status, transfers, cards, credit, technology, and investment inquiries.", "ስለ Samra Pay የምርት ሁኔታ፣ ዝውውሮች፣ ካርዶች፣ ክሬዲት፣ ቴክኖሎጂና ኢንቨስትመንት ጥያቄዎች ግልጽ መልሶች።"),
};

export default function FaqPage() {
  const { language, text } = usePublicLanguage();
  const [activeCategory, setActiveCategory] = useState<"all" | FaqCategory>("all");
  usePublicPageMeta({ language, ...faqMeta });

  const visibleItems = useMemo(
    () => activeCategory === "all" ? fullFaqItems : fullFaqItems.filter((item) => item.category === activeCategory),
    [activeCategory],
  );

  return (
    <div className={`coming-soon-site editorial-page faq-page ${language === "am" ? "is-amharic" : ""}`} id="top" lang={language}>
      <ComingSoonHeader />
      <main id="main-content" tabIndex={-1}>
        <section className="editorial-hero faq-editorial-hero" aria-labelledby="faq-page-title">
          <img src="/coming-soon/tibeb-pattern-gold.jpg" alt="" aria-hidden="true" className="editorial-hero-pattern" />
          <div className="coming-container editorial-hero-grid">
            <div>
              <div className="coming-status"><span aria-hidden="true" />{text(localized("Answers before access", "ከመግባትዎ በፊት መልሶች"))}</div>
              <h1 id="faq-page-title">{text(localized("Questions deserve clear answers.", "ጥያቄዎች ግልጽ መልስ ይገባቸዋል።"))}</h1>
            </div>
            <div className="editorial-hero-deck">
              <p>{text(localized(
                "Samra Pay is still in development. These answers describe the current direction—not live services, final terms, or confirmed availability.",
                "Samra Pay አሁንም በግንባታ ላይ ነው። እነዚህ መልሶች የአሁኑን አቅጣጫ ይገልጻሉ፤ ቀጥታ አገልግሎቶችን፣ የመጨረሻ ውሎችን ወይም የተረጋገጠ አቅርቦትን አይደለም።",
              ))}</p>
              <p className="editorial-launch-note"><ShieldCheck aria-hidden="true" />{text(localized("Limited Alpha planned for the U.S. and Canada · April 2027", "የተወሰነ Alpha በU.S. እና Canada ታቅዷል · April 2027"))}</p>
            </div>
          </div>
        </section>

        <section className="faq-library" aria-labelledby="faq-library-title">
          <div className="coming-container faq-library-grid">
            <aside className="faq-library-aside">
              <p className="section-eyebrow">{text(localized("Browse by topic", "በርዕስ ይፈልጉ"))}</p>
              <h2 id="faq-library-title">{text(localized("What people are asking now.", "ሰዎች አሁን የሚጠይቋቸው።"))}</h2>
              <div className="faq-filter-list" role="group" aria-label={text(localized("Filter questions by topic", "ጥያቄዎችን በርዕስ ያጣሩ"))}>
                {faqCategories.map((category) => (
                  <button
                    type="button"
                    key={category.id}
                    aria-pressed={activeCategory === category.id}
                    onClick={() => setActiveCategory(category.id)}
                  >
                    {text(category.label)}
                  </button>
                ))}
              </div>
            </aside>
            <div className="faq-library-content">
              <div className="faq-library-count" role="status" aria-live="polite" aria-atomic="true">
                <span>{String(visibleItems.length).padStart(2, "0")}</span>
                <p>{text(localized("questions in this view", "በዚህ እይታ ያሉ ጥያቄዎች"))}</p>
              </div>
              <PublicFaqAccordion key={activeCategory} items={visibleItems} idPrefix={`faq-page-${activeCategory}`} initiallyOpen={activeCategory === "all"} />
            </div>
          </div>
        </section>

        <section className="faq-boundary-note" aria-labelledby="faq-boundary-title">
          <div className="coming-container faq-boundary-grid">
            <ShieldCheck aria-hidden="true" />
            <div><p className="section-eyebrow">{text(localized("Trust before launch", "ከመጀመር በፊት እምነት"))}</p><h2 id="faq-boundary-title">{text(localized("We’re currently in stealth.", "በአሁኑ ጊዜ ምርቱን በስውር እየገነባን ነው።"))}</h2></div>
            <p>{text(localized(
              "We plan to launch once regulatory compliance is in place. We won’t compromise when it comes to your finances—our reputation is banking on it.",
              "የደንብ ተገዢነት ሲሟላ ለመጀመር አቅደናል። የእርስዎን ገንዘብ በተመለከተ አንደራደርም—የእኛ መልካም ስም በዚህ ላይ የተመሰረተ ነው።",
            ))}</p>
          </div>
        </section>

        <section className="page-cta" aria-labelledby="faq-cta-title">
          <div className="coming-container page-cta-grid">
            <div><p className="section-eyebrow">{text(localized("Follow the build", "ግንባታውን ይከተሉ"))}</p><h2 id="faq-cta-title">{text(localized("Get the answer when a final term is confirmed.", "የመጨረሻ ውል ሲረጋገጥ መልሱን ያግኙ።"))}</h2></div>
            <a className="portfolio-primary-link" href="/#concept-status">{text(localized("Join the waitlist", "የጥበቃ ዝርዝሩን ይቀላቀሉ"))}<ArrowRight aria-hidden="true" /></a>
          </div>
        </section>
      </main>
      <ComingSoonFooter />
    </div>
  );
}
