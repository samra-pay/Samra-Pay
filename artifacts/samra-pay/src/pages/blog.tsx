import {
  ArrowRight,
  BookOpen,
  Compass,
  MessageCircle,
  PenLine,
  ShieldCheck,
} from "lucide-react";
import { womanWithPhone } from "@/assets/coming-soon/images";
import {
  ComingSoonFooter,
  ComingSoonHeader,
} from "@/components/coming-soon-shell";
import { OptimizedPicture } from "@/components/optimized-picture";
import { localized, usePublicLanguage } from "@/lib/public-i18n";
import { usePublicPageMeta } from "@/lib/public-page-meta";
import "./coming-soon.css";

const blogMeta = {
  title: localized("Founder Notes — Samra Pay", "የመስራች ማስታወሻዎች — Samra Pay"),
  description: localized(
    "Founder notes and practical writing about money, identity, and building life between the United States, Canada, and Ethiopia.",
    "ስለ ገንዘብ፣ ማንነትና በU.S.፣ Canada እና ኢትዮጵያ መካከል ሕይወት መገንባት የመስራች ማስታወሻዎችና ተግባራዊ ጽሑፎች።",
  ),
};

const editorialLanes = [
  {
    icon: Compass,
    label: localized("Building Samra", "Samraን መገንባት"),
    title: localized(
      "What we learn on the road to Alpha.",
      "ወደ Alpha በምንጓዝበት መንገድ የምንማረው።",
    ),
    body: localized(
      "Product decisions, lessons from the community, and the operating questions that must be answered before launch.",
      "የምርት ውሳኔዎች፣ ከማህበረሰቡ የምንማራቸው ትምህርቶችና ከምረቃ በፊት መመለስ ያለባቸው የአሠራር ጥያቄዎች።",
    ),
  },
  {
    icon: BookOpen,
    label: localized("Money between worlds", "በሁለት ዓለማት መካከል ገንዘብ"),
    title: localized(
      "Plain language for complex financial choices.",
      "ለውስብስብ የገንዘብ ምርጫዎች ቀላል ቋንቋ።",
    ),
    body: localized(
      "Clear explanations of transfers, credit, rewards, rates, and emerging infrastructure—without pretending the risk is simple.",
      "ዝውውር፣ ክሬዲት፣ ሽልማቶች፣ ዋጋዎችና አዳዲስ መሠረተ ልማቶችን አደጋው ቀላል እንደሆነ ሳይታሰብ በግልጽ ማብራራት።",
    ),
  },
  {
    icon: MessageCircle,
    label: localized("Community notes", "የማህበረሰብ ማስታወሻዎች"),
    title: localized(
      "The people, culture, and responsibilities behind the product.",
      "ከምርቱ ጀርባ ያሉ ሰዎች፣ ባህልና ኃላፊነቶች።",
    ),
    body: localized(
      "Stories and conversations about building a life across borders while staying responsible to the people and places that shaped us.",
      "ድንበር ተሻግሮ ሕይወት ስለመገንባት፣ እኛን ለቀረጹን ሰዎችና ቦታዎች ኃላፊ ሆነን ስለመቆየት ታሪኮችና ውይይቶች።",
    ),
  },
];

export default function Blog() {
  const { language, text } = usePublicLanguage();
  usePublicPageMeta({ language, ...blogMeta });

  return (
    <div
      className={`coming-soon-site editorial-page blog-page ${language === "am" ? "is-amharic" : ""}`}
      id="top"
      lang={language}
    >
      <ComingSoonHeader />
      <main id="main-content" tabIndex={-1}>
        <section className="blog-hero" aria-labelledby="blog-title">
          <div className="coming-container blog-hero-grid">
            <div className="blog-hero-copy">
              <div className="coming-status">
                <span aria-hidden="true" />
                {text(localized("Founder notes", "የመስራች ማስታወሻዎች"))}
              </div>
              <h1 id="blog-title">
                {text(
                  localized(
                    "Money, identity, and life between worlds.",
                    "ገንዘብ፣ ማንነትና በሁለት ዓለማት መካከል ያለ ሕይወት።",
                  ),
                )}
              </h1>
              <p>
                {text(
                  localized(
                    "Personal notes from Samra Pay's founder, practical guidance, and honest conversations about building across the U.S., Canada, and Ethiopia.",
                    "ከSamra Pay መስራች የግል ማስታወሻዎች፣ ተግባራዊ መመሪያዎችና በU.S.፣ Canada እና ኢትዮጵያ መካከል ስለመገንባት ግልጽ ውይይቶች።",
                  ),
                )}
              </p>
              <div className="blog-hero-status">
                <PenLine aria-hidden="true" />
                <span>
                  {text(
                    localized(
                      "First founder post in preparation",
                      "የመጀመሪያው የመስራች ጽሑፍ በዝግጅት ላይ ነው",
                    ),
                  )}
                </span>
              </div>
            </div>
            <div className="blog-hero-image">
              <OptimizedPicture
                asset={womanWithPhone}
                pictureClassName="blog-hero-picture"
                alt={text(
                  localized(
                    "Ethiopian diaspora woman reading on her phone at home",
                    "በቤቷ በስልኳ ላይ የምታነብ በውጭ የምትኖር ኢትዮጵያዊት",
                  ),
                )}
                decoding="async"
              />
            </div>
          </div>
        </section>

        <section
          className="blog-featured"
          aria-labelledby="featured-note-title"
        >
          <div className="coming-container blog-featured-grid">
            <div className="blog-featured-marker">
              <span>01</span>
              <p>
                {text(
                  localized("Founder note · Coming soon", "የመስራች ማስታወሻ · በቅርቡ"),
                )}
              </p>
            </div>
            <article>
              <p className="section-eyebrow">
                {text(localized("The first note", "የመጀመሪያው ማስታወሻ"))}
              </p>
              <h2 id="featured-note-title">
                {text(
                  localized(
                    "Why Samra starts between here and home.",
                    "Samra ለምን በእዚህና በቤት መካከል ይጀምራል።",
                  ),
                )}
              </h2>
              <p>
                {text(
                  localized(
                    "Samra begins with a simple observation: diaspora finances are rarely only personal. A paycheck earned here can carry responsibilities, opportunities, and care across an ocean. The first founder note will explain why that reality—not a product category—is the starting point for what we are building.",
                    "Samra በቀላል ምልከታ ይጀምራል፦ የዲያስፖራ ገንዘብ ብዙ ጊዜ የግል ብቻ አይደለም። እዚህ የተገኘ ደመወዝ ኃላፊነትን፣ እድልንና እንክብካቤን ውቅያኖስ አሻግሮ ሊያደርስ ይችላል። የመጀመሪያው የመስራች ማስታወሻ ይህ እውነታ—የምርት ምድብ ሳይሆን—ለምን የምንገነባው መነሻ እንደሆነ ያብራራል።",
                  ),
                )}
              </p>
              <div className="blog-draft-label">
                <span />
                {text(
                  localized(
                    "No posts published yet. The first founder note is in progress.",
                    "እስካሁን የታተመ ጽሑፍ የለም። የመጀመሪያው የመስራች ማስታወሻ በዝግጅት ላይ ነው።",
                  ),
                )}
              </div>
            </article>
          </div>
        </section>

        <section className="blog-lanes" aria-labelledby="blog-lanes-title">
          <div className="coming-container">
            <div className="blog-lanes-heading">
              <p className="section-eyebrow">
                {text(localized("What will live here", "እዚህ የሚቀርበው"))}
              </p>
              <h2 id="blog-lanes-title">
                {text(
                  localized(
                    "Three editorial lanes. One honest voice.",
                    "ሦስት የጽሑፍ አቅጣጫዎች። አንድ ግልጽ ድምፅ።",
                  ),
                )}
              </h2>
            </div>
            <div className="blog-lanes-grid">
              {editorialLanes.map((lane) => {
                const Icon = lane.icon;
                return (
                  <article key={lane.label.en}>
                    <Icon aria-hidden="true" />
                    <p>{text(lane.label)}</p>
                    <h3>{text(lane.title)}</h3>
                    <span>{text(lane.body)}</span>
                    <small>
                      {text(
                        localized(
                          "Upcoming editorial category",
                          "በቅርቡ የሚመጣ የጽሑፍ ምድብ",
                        ),
                      )}
                    </small>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section
          className="blog-editorial-note"
          aria-labelledby="editorial-standard-title"
        >
          <div className="coming-container blog-editorial-note-grid">
            <ShieldCheck aria-hidden="true" />
            <div>
              <p className="section-eyebrow">
                {text(localized("Editorial standard", "የጽሑፍ መስፈርት"))}
              </p>
              <h2 id="editorial-standard-title">
                {text(
                  localized(
                    "Perspective will be labeled. Claims will be qualified.",
                    "አመለካከት ይለያል። መግለጫዎች በገደብ ይቀርባሉ።",
                  ),
                )}
              </h2>
            </div>
            <p>
              {text(
                localized(
                  "Posts will distinguish founder perspective, product updates, and financial education. Nothing published here will be an investment offer, individualized financial advice, or confirmation that a proposed product is live.",
                  "ጽሑፎች የመስራች አመለካከትን፣ የምርት ዜናንና የገንዘብ ትምህርትን በግልጽ ይለያሉ። እዚህ የሚታተም ምንም ነገር የኢንቨስትመንት ግብዣ፣ የግል የገንዘብ ምክር ወይም የታቀደ ምርት ቀጥታ ስለመሆኑ ማረጋገጫ አይሆንም።",
                ),
              )}
            </p>
          </div>
        </section>

        <section className="page-cta" aria-labelledby="blog-cta-title">
          <div className="coming-container page-cta-grid">
            <div>
              <p className="section-eyebrow">
                {text(localized("Launching the conversation", "ውይይቱን መጀመር"))}
              </p>
              <h2 id="blog-cta-title">
                {text(
                  localized(
                    "Follow Samra as the first notes take shape.",
                    "የመጀመሪያዎቹ ማስታወሻዎች ሲቀረጹ Samraን ይከተሉ።",
                  ),
                )}
              </h2>
            </div>
            <a className="portfolio-primary-link" href="/values">
              {text(localized("Read what guides us", "የሚመራንን ያንብቡ"))}
              <ArrowRight aria-hidden="true" />
            </a>
          </div>
        </section>
      </main>
      <ComingSoonFooter />
    </div>
  );
}
