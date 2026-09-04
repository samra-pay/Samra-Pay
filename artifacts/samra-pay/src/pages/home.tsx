import { lazy, Suspense } from "react";
import {
  ArrowRight,
  Gift,
  LockKeyhole,
  PieChart,
  Send,
  TrendingUp,
} from "lucide-react";
import {
  heroWomanCoffee,
  proofManLaptop,
  tibebPattern,
  womanWithPhone,
} from "@/assets/coming-soon/images";
import {
  ComingSoonFooter,
  ComingSoonHeader,
} from "@/components/coming-soon-shell";
import { OptimizedPicture } from "@/components/optimized-picture";
import { PublicFaqAccordion } from "@/components/public-faq";
import { homeFaqItems } from "@/content/public-faq";
import { localized, usePublicLanguage } from "@/lib/public-i18n";
import { usePublicPageMeta } from "@/lib/public-page-meta";
import "./coming-soon.css";

const LaunchUpdatesForm = lazy(
  () => import("@/components/launch-updates-form"),
);

const homeMeta = {
  title: localized(
    "Samra Pay — Your next chapter, connected",
    "Samra Pay — የሚቀጥለው ምዕራፍዎ፣ በግንኙነት",
  ),
  description: localized(
    "Connecting life in the U.S. and Canada with Ethiopia. Explore Samra Pay cards and launch news.",
    "በአሜሪካና ካናዳ ያለውን ሕይወት ከኢትዮጵያ ጋር ማገናኘት። የSamra Pay ካርዶችንና የምረቃ ዜናን ያስሱ።",
  ),
};

const siteContent = {
  features: [
    {
      icon: TrendingUp,
      title: localized(
        "Build credit through everyday payments",
        "በዕለታዊ ክፍያዎች የክሬዲት ታሪክዎን ያጠናክሩ።",
      ),
      description: localized(
        "Turn eligible everyday payments into credit-building progress, subject to local reporting and enrollment terms.",
        "ብቁ ዕለታዊ ክፍያዎችን ወደ የክሬዲት እድገት ይቀይሩ፤ በአካባቢው ሪፖርትና የምዝገባ ውሎች መሠረት።",
      ),
    },
    {
      icon: Send,
      title: localized("More value reaches home", "የበለጠ ዋጋ ወደ አገር ቤት ይድረስ።"),
      description: localized(
        "Clear rates, fees, and delivery estimates—before you send. Designed to keep more value in every connection home.",
        "ከመላክዎ በፊት ግልጽ ተመን፣ ክፍያና የመድረሻ ግምት። ወደ ቤት በሚደረግ እያንዳንዱ ግንኙነት የበለጠ ዋጋ ለማድረስ የተነደፈ።",
      ),
    },
    {
      icon: Gift,
      title: localized("Rewards for everyday spending", "በዕለታዊ ወጪዎች ሽልማት ያግኙ።"),
      description: localized(
        "Rewards designed for eligible everyday purchases and your next journey home.",
        "ለብቁ ዕለታዊ ግዢዎችና ለሚቀጥለው የአገር ቤት ጉዞዎ የተዘጋጁ ሽልማቶች።",
      ),
    },
  ],
  capabilities: [
    {
      icon: TrendingUp,
      label: localized("Explore all four card paths", "አራቱንም የካርድ አማራጮች ያስሱ"),
      href: "/features#progression-title",
    },
    {
      icon: Send,
      label: localized(
        "Discover the everyday essentials",
        "የዕለት ተዕለት አስፈላጊ ባህሪያትን ይወቁ",
      ),
      href: "/features#included-title",
    },
    {
      icon: Gift,
      label: localized(
        "Compare tiers, rewards, and access",
        "ደረጃዎችን፣ ሽልማቶችንና መዳረሻን ያወዳድሩ",
      ),
      href: "/features#compare-title",
    },
    {
      icon: PieChart,
      label: localized(
        "Get the details behind the benefits",
        "ከጥቅሞቹ ጀርባ ያሉትን ዝርዝሮች ይወቁ",
      ),
      href: "/features#disclosure-title",
    },
    {
      icon: LockKeyhole,
      label: localized(
        "Read the values guiding the product",
        "ምርቱን የሚመሩትን እሴቶች ያንብቡ",
      ),
      href: "/values",
    },
  ],
};

function HomeFaq() {
  const { text } = usePublicLanguage();

  return (
    <section className="faq-section" id="faq" aria-labelledby="faq-title">
      <div className="coming-container faq-grid">
        <div>
          <p className="section-eyebrow">
            {text(localized("Three questions to start", "ለመጀመር ሦስት ጥያቄዎች"))}
          </p>
          <h2 id="faq-title">
            {text(localized("The essentials, answered.", "ዋናዎቹ ጥያቄዎች፣ በግልጽ።"))}
          </h2>
          <a className="section-text-link" href="/faq">
            {text(localized("Visit the full FAQ", "ሙሉውን ጥያቄና መልስ ይመልከቱ"))}
            <ArrowRight aria-hidden="true" />
          </a>
        </div>
        <PublicFaqAccordion items={homeFaqItems} idPrefix="home-faq-answer" />
      </div>
    </section>
  );
}

export default function Home() {
  const { language, text } = usePublicLanguage();
  usePublicPageMeta({ language, ...homeMeta });

  return (
    <div
      className={`coming-soon-site ${language === "am" ? "is-amharic" : ""}`}
      id="top"
      lang={language}
    >
      <ComingSoonHeader />

      <main id="main-content" tabIndex={-1}>
        <section className="coming-hero" aria-labelledby="coming-title">
          <div className="coming-hero-copy">
            <div className="coming-status">
              <span aria-hidden="true" />
              {text(
                localized(
                  "Your next chapter starts here",
                  "የሚቀጥለው ምዕራፍዎ እዚህ ይጀምራል",
                ),
              )}
            </div>
            <h1 id="coming-title">
              {language === "en" ? (
                <>
                  Banked <em>here</em>, care for family{" "}
                  <em className="hero-phrase">at home</em>
                </>
              ) : (
                <>
                  የባንክ ጉዳይዎን <em>እዚህ</em> ያስተዳድሩ፤{" "}
                  <em className="hero-phrase">አገር ቤት</em> ያለውን ቤተሰብዎን ይንከባከቡ።
                </>
              )}
            </h1>
            <p className="coming-hero-deck">
              {text(
                localized(
                  "Launching in the U.S. and Canada: Direct deposit, credit building, remittance, and rewards on everyday spending—all in one place.",
                  "በአሜሪካና ካናዳ የሚጀምረው፦ ቀጥታ የደመወዝ ገቢ፣ የክሬዲት ታሪክ ግንባታ፣ የገንዘብ ልውውጥ እና በዕለታዊ ወጪ ሽልማቶች—ሁሉም በአንድ ቦታ።",
                ),
              )}
            </p>
            <Suspense
              fallback={
                <div
                  className="launch-updates launch-updates-loading"
                  id="launch-updates"
                  aria-hidden="true"
                />
              }
            >
              <LaunchUpdatesForm />
            </Suspense>
            <a className="coming-hero-explore" href="/features">
              {text(localized("Explore the card portfolio", "የካርድ ስብስቡን ያስሱ"))}
              <ArrowRight aria-hidden="true" />
            </a>
          </div>

          <div className="coming-hero-media">
            <OptimizedPicture
              asset={heroWomanCoffee}
              pictureClassName="coming-hero-picture"
              alt={text(
                localized(
                  "Ethiopian diaspora woman holding a coffee cup",
                  "የቡና ስኒ የያዘች በውጭ የምትኖር ኢትዮጵያዊት",
                ),
              )}
              decoding="async"
              fetchPriority="high"
            />
          </div>
        </section>

        <section
          className="story-intro"
          id="story"
          aria-labelledby="story-title"
        >
          <OptimizedPicture
            asset={tibebPattern}
            alt=""
            aria-hidden="true"
            className="section-pattern section-pattern-light"
            pictureClassName="public-picture-contents"
            loading="lazy"
            decoding="async"
          />
          <div className="coming-container story-intro-grid">
            <h2 id="story-title">
              {text(
                localized(
                  "One life. More than one home.",
                  "አንድ ሕይወት። ከአንድ በላይ ቤት።",
                ),
              )}
            </h2>
            <p>
              {text(
                localized(
                  "We build our lives here while the people we love are back home. Samra is being built for us, by us, to make managing and moving money simple, so staying connected never feels like a compromise. That’s how it should be.",
                  "ሕይወታችንን እዚህ እንገነባለን፤ የምንወዳቸው ሰዎች ግን አገር ቤት ናቸው። Samra የሚገነባው ለእኛ፣ በእኛ ነው—ገንዘብን ማስተዳደርና ማንቀሳቀስ ቀላል እንዲሆን እና ግንኙነታችንን ለመጠበቅ መደራደር እንዳያስፈልግ። መሆን ያለበት እንዲህ ነው።",
                ),
              )}
            </p>
          </div>
        </section>

        <section
          className="feature-framework"
          id="features"
          aria-label={text(
            localized("Samra Pay product vision", "የSamra Pay የምርት ራዕይ"),
          )}
        >
          <div className="coming-container feature-framework-grid">
            {siteContent.features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <article
                  className={
                    index === 2
                      ? "feature-framework-item is-wide"
                      : "feature-framework-item"
                  }
                  key={feature.title.en}
                >
                  <Icon aria-hidden="true" />
                  <div>
                    <h3>{text(feature.title)}</h3>
                    <p>{text(feature.description)}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section
          className="capability-band"
          id="capabilities"
          aria-labelledby="capabilities-title"
        >
          <OptimizedPicture
            asset={tibebPattern}
            alt=""
            aria-hidden="true"
            className="section-pattern section-pattern-dark"
            pictureClassName="public-picture-contents"
            loading="lazy"
            decoding="async"
          />
          <div className="coming-container capability-grid">
            <div>
              <p className="section-eyebrow">
                {text(localized("What we are building", "እየገነባን ያለነው"))}
              </p>
              <h2 id="capabilities-title">
                {text(
                  localized(
                    "Everyday money should move you forward.",
                    "ዕለታዊ ገንዘብዎ ወደፊት ሊያራምድዎት ይገባል።",
                  ),
                )}
              </h2>
            </div>
            <div className="capability-list">
              {siteContent.capabilities.map((capability) => {
                const Icon = capability.icon;
                return (
                  <a key={capability.label.en} href={capability.href}>
                    <Icon aria-hidden="true" />
                    <span>{text(capability.label)}</span>
                    <ArrowRight aria-hidden="true" />
                  </a>
                );
              })}
            </div>
          </div>
        </section>

        <section
          className="proof-section proof-section-dark"
          id="values"
          aria-labelledby="approach-title"
        >
          <div className="coming-container proof-grid proof-grid-text-first">
            <div className="proof-copy">
              <p className="section-eyebrow">
                {text(localized("What guides us", "የሚመራን"))}
              </p>
              <h2 id="approach-title">
                {text(
                  localized(
                    "Culture is context. Not decoration.",
                    "ባህል አውድ ነው። ጌጥ አይደለም።",
                  ),
                )}
              </h2>
              <p>
                {text(
                  localized(
                    "We are designing Samra Pay around the realities generic financial products often overlook: family responsibility, trust across distance, multiple currencies, and a connection to home that is both practical and personal.",
                    "Samra Payን አጠቃላይ የገንዘብ ምርቶች ብዙ ጊዜ በሚዘነጉባቸው እውነታዎች ዙሪያ እየነደፍን ነው፦ የቤተሰብ ኃላፊነት፣ ከርቀት የሚገነባ እምነት፣ ብዙ ምንዛሬዎችና ከቤት ጋር ያለ ተግባራዊና የግል ግንኙነት።",
                  ),
                )}
              </p>
              <a className="proof-inline-link" href="/values">
                {text(localized("Explore our values", "እሴቶቻችንን ያስሱ"))}
                <ArrowRight aria-hidden="true" />
              </a>
            </div>
            <div className="proof-image-wrap">
              <OptimizedPicture
                asset={proofManLaptop}
                pictureClassName="proof-photo-picture"
                alt={text(
                  localized(
                    "Ethiopian diaspora professional working on a laptop in a coffee shop",
                    "በቡና ቤት በላፕቶፕ ላይ የሚሰራ በውጭ የሚኖር ኢትዮጵያዊ",
                  ),
                )}
                loading="lazy"
                decoding="async"
              />
              <OptimizedPicture
                asset={tibebPattern}
                alt=""
                aria-hidden="true"
                className="proof-pattern"
                pictureClassName="public-picture-contents"
                loading="lazy"
                decoding="async"
              />
            </div>
          </div>
        </section>

        <section
          className="proof-section proof-section-light"
          id="blog"
          aria-labelledby="everyday-title"
        >
          <div className="coming-container proof-grid proof-grid-image-first">
            <div className="proof-image-wrap proof-image-woman">
              <OptimizedPicture
                asset={womanWithPhone}
                pictureClassName="proof-photo-picture"
                alt={text(
                  localized(
                    "Ethiopian diaspora woman using her phone at home",
                    "በቤቷ ስልኳን የምትጠቀም በውጭ የምትኖር ኢትዮጵያዊት",
                  ),
                )}
                loading="lazy"
                decoding="async"
              />
            </div>
            <div className="proof-copy">
              <p className="section-eyebrow">
                {text(localized("From Samra Pay's founder", "ከSamra Pay መስራች"))}
              </p>
              <h2 id="everyday-title">
                {text(
                  localized(
                    "Money, identity, and life between worlds.",
                    "ገንዘብ፣ ማንነትና በሁለት ዓለማት መካከል ያለ ሕይወት።",
                  ),
                )}
              </h2>
              <p>
                {text(
                  localized(
                    "Founder notes and conversations on life across borders. First stories coming soon.",
                    "የመስራች ማስታወሻዎችና ድንበር ተሻጋሪ የሕይወት ውይይቶች። የመጀመሪያ ታሪኮች በቅርቡ።",
                  ),
                )}
              </p>
              <a className="proof-inline-link is-dark" href="/blog">
                {text(localized("Visit the blog", "ጽሑፎቹን ይመልከቱ"))}
                <ArrowRight aria-hidden="true" />
              </a>
            </div>
          </div>
        </section>

        <HomeFaq />

        <section className="final-cta" aria-labelledby="final-cta-title">
          <div className="coming-container final-cta-grid">
            <div>
              <h2 id="final-cta-title">
                {text(
                  localized(
                    "Your next chapter starts with Samra.",
                    "የሚቀጥለው ምዕራፍዎ ከSamra ጋር ይጀምራል።",
                  ),
                )}
              </h2>
              <p>
                {text(
                  localized(
                    "Follow our launch. Explore the cards and benefits connecting life here with home.",
                    "የምረቃ ጉዟችንን ይከታተሉ። የእዚህን ሕይወት ከቤት ጋር የሚያገናኙ ካርዶችንና ጥቅሞችን ያስሱ።",
                  ),
                )}
              </p>
            </div>
            <div
              className="static-launch-actions is-final"
              aria-label={text(
                localized("Public site links", "የሕዝብ ድረ ገጽ አገናኞች"),
              )}
            >
              <a className="static-launch-primary" href="#launch-updates">
                {text(localized("Get launch updates", "የምረቃ ዜና ያግኙ"))}
                <ArrowRight aria-hidden="true" />
              </a>
              <a className="static-launch-secondary" href="/values">
                {text(localized("Read our values", "እሴቶቻችንን ያንብቡ"))}
              </a>
            </div>
          </div>
        </section>
      </main>

      <ComingSoonFooter />
    </div>
  );
}
