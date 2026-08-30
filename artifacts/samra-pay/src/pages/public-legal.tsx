import { ArrowLeft, FileText, ShieldCheck } from "lucide-react";
import { ComingSoonFooter, ComingSoonHeader } from "@/components/coming-soon-shell";
import { localized, usePublicLanguage, type LocalizedText } from "@/lib/public-i18n";
import { usePublicPageMeta } from "@/lib/public-page-meta";
import "./coming-soon.css";

type LegalKind = "privacy" | "terms";

type LegalSection = {
  title: LocalizedText;
  body: LocalizedText;
};

const legalContent: Record<LegalKind, {
  eyebrow: LocalizedText;
  title: LocalizedText;
  deck: LocalizedText;
  metaDescription: LocalizedText;
  sections: LegalSection[];
}> = {
  privacy: {
    eyebrow: localized("Privacy preview", "የግላዊነት ቅድመ መረጃ"),
    title: localized("Privacy starts before the product is live.", "ግላዊነት ምርቱ ከመጀመሩ በፊት ይጀምራል።"),
    deck: localized(
      "This page explains how the current concept website behaves. It is not the final privacy notice for future financial services.",
      "ይህ ገጽ የአሁኑ የማሳያ ድረ ገጽ እንዴት እንደሚሠራ ያብራራል። ለወደፊት የፋይናንስ አገልግሎቶች የመጨረሻ የግላዊነት ማስታወቂያ አይደለም።",
    ),
    metaDescription: localized(
      "Privacy information for the Samra Pay concept website.",
      "ለSamra Pay የማሳያ ድረ ገጽ የግላዊነት መረጃ።",
    ),
    sections: [
      {
        title: localized("What this website stores", "ይህ ድረ ገጽ የሚያከማቸው"),
        body: localized(
          "The language switch stores your English or Amharic preference in your browser. If you join the waitlist, Samra Pay stores your normalized email address, the consent-notice version, language, and server timestamp. Waitlist contact data is kept separate from acquisition telemetry and is not used for financial onboarding.",
          "የቋንቋ መቀየሪያው የእንግሊዝኛ ወይም የአማርኛ ምርጫዎን በአሳሽዎ ውስጥ ያስቀምጣል። የጥበቃ ዝርዝሩን ከተቀላቀሉ፣ Samra Pay የተስተካከለውን ኢሜይል አድራሻዎን፣ የፈቃድ ማስታወቂያውን ስሪት፣ ቋንቋና የአገልጋዩን የጊዜ ማህተም ያከማቻል። የጥበቃ ዝርዝር መረጃ ከግብይት መለኪያዎች ተለይቶ ይቀመጣል እና ለፋይናንስ ምዝገባ አይውልም።",
        ),
      },
      {
        title: localized("Standard website data", "መደበኛ የድረ ገጽ መረጃ"),
        body: localized(
          "Hosting and security providers may process ordinary request data such as an IP address, browser type, and timestamp. Final providers, retention periods, and rights will be identified before public launch.",
          "የድረ ገጽ ማስተናገጃና የደህንነት አቅራቢዎች እንደ IP አድራሻ፣ የአሳሽ ዓይነትና የጊዜ ማህተም ያሉ መደበኛ የጥያቄ መረጃዎችን ሊያስኬዱ ይችላሉ። የመጨረሻ አቅራቢዎች፣ የማቆያ ጊዜዎችና መብቶች ከሕዝብ ምረቃ በፊት ይገለጻሉ።",
        ),
      },
      {
        title: localized("Do not submit sensitive information", "ሚስጥራዊ መረጃ አያስገቡ"),
        body: localized(
          "Do not send identity documents, account credentials, card information, bank details, or investment funds through this website. An authorized enrollment flow and final privacy notice will be published before any service opens.",
          "በዚህ ድረ ገጽ የማንነት ሰነዶችን፣ የአካውንት ማስረጃዎችን፣ የካርድ መረጃን፣ የባንክ ዝርዝሮችን ወይም የኢንቨስትመንት ገንዘብን አይላኩ። ማንኛውም አገልግሎት ከመክፈቱ በፊት የተፈቀደ የምዝገባ ሂደትና የመጨረሻ የግላዊነት ማስታወቂያ ይታተማሉ።",
        ),
      },
    ],
  },
  terms: {
    eyebrow: localized("Terms preview", "የውሎች ቅድመ መረጃ"),
    title: localized("A concept website, with clear limits.", "ግልጽ ገደብ ያለው የማሳያ ድረ ገጽ።"),
    deck: localized(
      "These interim terms apply only to the current informational preview. Final product terms will be published before any financial service becomes available.",
      "እነዚህ ጊዜያዊ ውሎች ለአሁኑ የመረጃ ማሳያ ብቻ ይሠራሉ። ማንኛውም የፋይናንስ አገልግሎት ከመገኘቱ በፊት የመጨረሻ የምርት ውሎች ይታተማሉ።",
    ),
    metaDescription: localized(
      "Interim website terms for the Samra Pay concept preview.",
      "ለSamra Pay የማሳያ ድረ ገጽ ጊዜያዊ ውሎች።",
    ),
    sections: [
      {
        title: localized("No live financial service", "ቀጥታ የፋይናንስ አገልግሎት የለም"),
        body: localized(
          "This website does not open accounts, issue cards, transfer money, hold funds, provide credit, or accept investments. The visible products, pricing, rewards, partnerships, and timelines are proposed and may change.",
          "ይህ ድረ ገጽ ሂሳብ አይከፍትም፣ ካርድ አያወጣም፣ ገንዘብ አያስተላልፍም፣ ገንዘብ አይዝም፣ ክሬዲት አይሰጥም ወይም ኢንቨስትመንት አይቀበልም። የሚታዩት ምርቶች፣ ዋጋዎች፣ ሽልማቶች፣ አጋርነቶችና የጊዜ ሰሌዳዎች የታቀዱ ናቸው፤ ሊለወጡም ይችላሉ።",
        ),
      },
      {
        title: localized("Information, not advice or an offer", "መረጃ እንጂ ምክር ወይም አቅርቦት አይደለም"),
        body: localized(
          "Content is general information. It is not individualized financial, legal, tax, or investment advice and is not an offer to sell a security or financial product.",
          "ይዘቱ አጠቃላይ መረጃ ነው። የግል የፋይናንስ፣ የሕግ፣ የግብር ወይም የኢንቨስትመንት ምክር አይደለም፤ ዋስትና ሰነድ ወይም የፋይናንስ ምርት ለመሸጥ የቀረበ አቅርቦትም አይደለም።",
        ),
      },
      {
        title: localized("Names and proposed relationships", "ስሞችና የታቀዱ ግንኙነቶች"),
        body: localized(
          "Third-party names and marks identify proposed product directions or compatibility. They do not confirm an executed partnership, endorsement, card program, or service availability unless final disclosures say so.",
          "የሶስተኛ ወገን ስሞችና ምልክቶች የታቀዱ የምርት አቅጣጫዎችን ወይም ተኳሃኝነትን ያመለክታሉ። የመጨረሻ መግለጫዎች ካልገለጹ በስተቀር የተፈጸመ አጋርነትን፣ ድጋፍን፣ የካርድ ፕሮግራምን ወይም የአገልግሎት አቅርቦትን አያረጋግጡም።",
        ),
      },
    ],
  },
};

export default function PublicLegalPage() {
  const kind: LegalKind = window.location.pathname.replace(/\/+$/, "").endsWith("/terms") ? "terms" : "privacy";
  const content = legalContent[kind];
  const { language, text } = usePublicLanguage();

  usePublicPageMeta({
    language,
    title: localized(
      `${kind === "privacy" ? "Privacy" : "Terms"} — Samra Pay`,
      `${kind === "privacy" ? "ግላዊነት" : "ውሎች"} — Samra Pay`,
    ),
    description: content.metaDescription,
  });

  return (
    <div className={`coming-soon-site editorial-page public-legal-page ${language === "am" ? "is-amharic" : ""}`} id="top" lang={language}>
      <ComingSoonHeader />
      <main id="main-content" tabIndex={-1}>
        <section className="editorial-hero legal-editorial-hero" aria-labelledby="legal-page-title">
          <img src="/coming-soon/tibeb-pattern-gold.jpg" alt="" aria-hidden="true" className="editorial-hero-pattern" />
          <div className="coming-container editorial-hero-grid">
            <div>
              <div className="coming-status"><span aria-hidden="true" />{text(content.eyebrow)}</div>
              <h1 id="legal-page-title">{text(content.title)}</h1>
            </div>
            <div className="editorial-hero-deck">
              <p>{text(content.deck)}</p>
              <p className="editorial-launch-note"><ShieldCheck aria-hidden="true" />{text(localized("Interim website notice · August 30, 2026", "ጊዜያዊ የድረ ገጽ ማስታወቂያ · August 30, 2026"))}</p>
            </div>
          </div>
        </section>

        <section className="public-legal-content" aria-label={text(content.eyebrow)}>
          <div className="coming-container public-legal-grid">
            <aside>
              <FileText aria-hidden="true" />
              <p>{text(localized("This notice covers the public concept website only.", "ይህ ማስታወቂያ የሕዝብ የማሳያ ድረ ገጽን ብቻ ይሸፍናል።"))}</p>
            </aside>
            <div className="public-legal-sections">
              {content.sections.map((section, index) => (
                <section key={section.title.en} aria-labelledby={`legal-section-${index}`}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <h2 id={`legal-section-${index}`}>{text(section.title)}</h2>
                  <p>{text(section.body)}</p>
                </section>
              ))}
            </div>
          </div>
        </section>

        <section className="page-cta" aria-labelledby="legal-cta-title">
          <div className="coming-container page-cta-grid">
            <div><p className="section-eyebrow">Samra Pay</p><h2 id="legal-cta-title">{text(localized("Return to the public preview.", "ወደ ሕዝብ ማሳያው ይመለሱ።"))}</h2></div>
            <a className="portfolio-primary-link" href="/"><ArrowLeft aria-hidden="true" />{text(localized("Back to home", "ወደ መነሻ ይመለሱ"))}</a>
          </div>
        </section>
      </main>
      <ComingSoonFooter />
    </div>
  );
}
