import {
  ArrowRight,
  Eye,
  HandHeart,
  HeartHandshake,
  ShieldCheck,
  Users,
} from "lucide-react";
import {
  tibebPattern,
  valuesPortraitElder,
  valuesPortraitMan,
  valuesPortraitWoman,
} from "@/assets/coming-soon/images";
import {
  ComingSoonFooter,
  ComingSoonHeader,
} from "@/components/coming-soon-shell";
import { OptimizedPicture } from "@/components/optimized-picture";
import { localized, usePublicLanguage } from "@/lib/public-i18n";
import { usePublicPageMeta } from "@/lib/public-page-meta";
import "./coming-soon.css";

const valuesMeta = {
  title: localized("Our Values — Samra Pay", "እሴቶቻችን — Samra Pay"),
  description: localized(
    "The values guiding how Samra Pay is being designed for Ethiopians living across borders.",
    "Samra Pay ድንበር ተሻግረው ለሚኖሩ ኢትዮጵያውያን እንዴት እንደሚነደፍ የሚመሩ እሴቶች።",
  ),
};

const coreValues = [
  {
    id: "stewardship",
    letter: "S",
    icon: HandHeart,
    name: localized("Stewardship", "በኃላፊነት መንከባከብ"),
    title: localized(
      "You worked hard for it. We respect that.",
      "ለፍተው ያገኙት ነው። ያንን እናከብራለን።",
    ),
    body: localized(
      "Your money has a job to do. Rent. School fees. A little breathing room. Something you’ve been saving toward. We believe financial tools should help you take care of today and plan for what’s next.",
      "ገንዘብዎ የሚውልበት ብዙ ነገር አለ። የቤት ኪራይ። የትምህርት ክፍያ። ትንሽ እፎይታ። ሲቆጥቡለት የቆዩት አንድ ነገር። የገንዘብ መሳሪያዎች የዛሬውን ኑሮ እንዲያስተዳድሩና ለነገ እንዲያቅዱ ሊረዱዎት ይገባል ብለን እናምናለን።",
    ),
  },
  {
    id: "access",
    letter: "A",
    icon: Eye,
    name: localized("Access", "ተደራሽነት"),
    title: localized(
      "Understand your credit. Know your next move.",
      "ክሬዲትዎን ይረዱ። ቀጣዩን እርምጃዎን ይወቁ።",
    ),
    body: localized(
      "Helping you build credit in America is a top priority for us. We’re starting with clear, everyday explanations of how credit works—and building tools to help you put that knowledge into action.",
      "በአሜሪካ የክሬዲት ታሪክዎን እንዲገነቡ መርዳት ከዋና ቅድሚያዎቻችን አንዱ ነው። ክሬዲት እንዴት እንደሚሠራ በቀላልና በግልጽ ቋንቋ ከማብራራት እንጀምራለን። ያወቁትንም በተግባር እንዲያውሉ የሚረዱ መሳሪያዎችን እየገነባን ነው።",
    ),
  },
  {
    id: "mutual-progress",
    letter: "M",
    icon: HeartHandshake,
    name: localized("Mutual progress", "አብሮ ማደግ"),
    title: localized(
      "Your financial goals here. Your family back home. Room for both.",
      "የገንዘብ ግቦችዎ እዚህ። ቤተሰብዎ እዚያ። ለሁለቱም ቦታ አለ።",
    ),
    body: localized(
      "Save for your next chapter. Show up for the people you love. We’re building Samra Pay to help you make room for both.",
      "ለቀጣዩ የሕይወትዎ ምዕራፍ ይቆጥቡ። ለሚወዷቸው ሰዎች ይድረሱ። ለሁለቱም ቦታ እንዲኖርዎት ለመርዳት Samra Payን እየገነባን ነው።",
    ),
  },
  {
    id: "respect",
    letter: "R",
    icon: Users,
    name: localized("Respect", "አክብሮት"),
    title: localized(
      "You won’t have to explain why home matters.",
      "የትውልድ አገርዎ ለምን እንደሚያስፈልግዎት ማስረዳት አይጠበቅብዎትም።",
    ),
    body: localized(
      "The languages you speak, the traditions you keep, and the people you show up for belong in the conversation. We’re here to listen and build with that understanding.",
      "የሚናገሯቸው ቋንቋዎች፣ የሚጠብቋቸው ወጎችና የሚደግፏቸው ሰዎች የውይይታችን አካል ናቸው። እርስዎን ለማዳመጥና ይህንን ግንዛቤ ይዘን ለመገንባት እዚህ አለን።",
    ),
  },
  {
    id: "accountability",
    letter: "A",
    icon: ShieldCheck,
    name: localized("Accountability", "ተጠያቂነት"),
    title: localized(
      "Building this right. For all of us.",
      "በትክክል እንገነባለን። ለሁላችንም።",
    ),
    body: localized(
      "Samra is personal to us, and we take that responsibility seriously. That means doing the work, being honest about where we are, and owning what comes next.",
      "Samra የራሳችን ጉዳይ ነው። ይህንንም ኃላፊነት አጥብቀን እንይዛለን። ይህ ማለት የሚጠበቅብንን ሥራ መሥራት፣ የደረስንበትን ደረጃ በቅንነት መናገርና ለቀጣዩ እርምጃ ኃላፊነት መውሰድ ነው።",
    ),
  },
];

const productPrinciples = [
  {
    icon: Eye,
    title: localized("The details, upfront.", "ዝርዝሩን አስቀድመው ይወቁ።"),
    body: localized(
      "Clear rates, fees, and timing before you decide.",
      "ከመወሰንዎ በፊት ግልጽ የምንዛሬ ተመኖች፣ ክፍያዎችና የአገልግሎት ጊዜዎች።",
    ),
  },
  {
    icon: HandHeart,
    title: localized("Space for your future.", "ለወደፊትዎ ቦታ።"),
    body: localized(
      "Tools designed with your budget, responsibilities, and goals in mind.",
      "በጀትዎን፣ ኃላፊነቶችዎንና ግቦችዎን ከግምት ውስጥ ያስገቡ መሳሪያዎች።",
    ),
  },
  {
    icon: ShieldCheck,
    title: localized("Care at every step.", "በእያንዳንዱ እርምጃ ጥንቃቄ።"),
    body: localized(
      "Thoughtful testing, useful support, and a launch paced by readiness.",
      "ጥንቃቄ የተሞላበት ሙከራ፣ ጠቃሚ ድጋፍና ዝግጁነታችንን የተከተለ የአገልግሎት ጅማሬ።",
    ),
  },
];

export default function Values() {
  const { language, text } = usePublicLanguage();
  usePublicPageMeta({ language, ...valuesMeta });

  return (
    <div
      className={`coming-soon-site editorial-page values-page ${language === "am" ? "is-amharic" : ""}`}
      id="top"
      lang={language}
    >
      <ComingSoonHeader />
      <main id="main-content" tabIndex={-1}>
        <section
          className="editorial-hero values-hero"
          aria-labelledby="values-title"
        >
          <OptimizedPicture
            asset={tibebPattern}
            alt=""
            aria-hidden="true"
            className="editorial-hero-pattern"
            pictureClassName="public-picture-contents"
            decoding="async"
          />
          <div className="coming-container editorial-hero-grid">
            <div>
              <div className="coming-status">
                <span aria-hidden="true" />
                {text(localized("Our values", "እሴቶቻችን"))}
              </div>
              <h1 id="values-title">
                {text(
                  localized(
                    "Life here. Love back home. Values that connect both.",
                    "ኑሮ እዚህ። ፍቅር በትውልድ አገር። ሁለቱንም የሚያገናኙ እሴቶች።",
                  ),
                )}
              </h1>
            </div>
            <div className="editorial-hero-deck">
              <p>
                {text(
                  localized(
                    "You’re building a future, showing up for family, and making your money work across borders. We’re building Samra Pay with that life in mind. Here’s what guides us.",
                    "ለወደፊትዎ እየሠሩ፣ ለቤተሰብዎ እየደረሱና ገንዘብዎን በድንበር ተሻጋሪ ኑሮዎ እየተጠቀሙበት ነው። ይህንን ሕይወት ከግምት ውስጥ አስገብተን Samra Payን እየገነባን ነው። የሚመሩን እሴቶች እነዚህ ናቸው።",
                  ),
                )}
              </p>
              <p className="editorial-launch-note">
                <ShieldCheck aria-hidden="true" />
                {text(
                  localized(
                    "Launching for the U.S. and Canada. Connected to Ethiopia.",
                    "ለአሜሪካና ካናዳ እየተዘጋጀ። ከኢትዮጵያ ጋር የተገናኘ።",
                  ),
                )}
              </p>
            </div>
          </div>
        </section>

        <section
          className="values-grid-section"
          aria-label={text(
            localized("Samra Pay core values", "የSamra Pay ዋና እሴቶች"),
          )}
        >
          <div className="coming-container values-grid">
            {coreValues.map((value) => {
              const Icon = value.icon;
              return (
                <article
                  className="value-card"
                  key={value.id}
                  id={`value-${value.id}`}
                  aria-labelledby={`value-${value.id}-title`}
                >
                  <div className="value-card-top">
                    <span lang="en">{value.letter}</span>
                    <Icon aria-hidden="true" />
                  </div>
                  <h2 id={`value-${value.id}-title`}>{text(value.name)}</h2>
                  <p className="value-card-tagline">{text(value.title)}</p>
                  <p>{text(value.body)}</p>
                </article>
              );
            })}
            <div className="values-portrait-card" aria-hidden="true">
              <figure className="values-trust-portrait is-primary">
                <OptimizedPicture
                  asset={valuesPortraitWoman}
                  alt=""
                  pictureClassName="public-picture-contents"
                  loading="lazy"
                  decoding="async"
                />
              </figure>
              <figure className="values-trust-portrait is-secondary">
                <OptimizedPicture
                  asset={valuesPortraitMan}
                  alt=""
                  pictureClassName="public-picture-contents"
                  loading="lazy"
                  decoding="async"
                />
              </figure>
              <figure className="values-trust-portrait is-tertiary">
                <OptimizedPicture
                  asset={valuesPortraitElder}
                  alt=""
                  pictureClassName="public-picture-contents"
                  loading="lazy"
                  decoding="async"
                />
              </figure>
            </div>
          </div>
        </section>

        <section
          className="values-in-practice"
          aria-labelledby="practice-title"
        >
          <div className="coming-container">
            <div className="values-in-practice-heading">
              <p className="section-eyebrow">
                {text(localized("Values in practice", "እሴቶች በተግባር"))}
              </p>
              <h2 id="practice-title">
                {text(
                  localized(
                    "What that means for what we’re building",
                    "ይህ ለምንገነባው ምን ማለት ነው?",
                  ),
                )}
              </h2>
            </div>
            <div className="values-principles-grid">
              {productPrinciples.map((principle) => {
                const Icon = principle.icon;
                return (
                  <article key={principle.title.en}>
                    <Icon aria-hidden="true" />
                    <h3>{text(principle.title)}</h3>
                    <p>{text(principle.body)}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="page-cta" aria-labelledby="values-cta-title">
          <div className="coming-container page-cta-grid">
            <div>
              <p className="section-eyebrow">
                {text(localized("From belief to product", "ከእምነት ወደ ምርት"))}
              </p>
              <h2 id="values-cta-title">
                {text(localized("Get to know what’s next.", "ቀጥሎ የሚመጣውን ይወቁ።"))}
              </h2>
            </div>
            <a className="portfolio-primary-link" href="/features">
              {text(localized("Explore features", "ባህሪያቱን ያስሱ"))}
              <ArrowRight aria-hidden="true" />
            </a>
          </div>
        </section>
      </main>
      <ComingSoonFooter />
    </div>
  );
}
