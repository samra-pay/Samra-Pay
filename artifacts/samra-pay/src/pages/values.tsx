import {
  ArrowRight,
  Eye,
  Globe2,
  HandHeart,
  HeartHandshake,
  ShieldCheck,
  Sprout,
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
    number: "01",
    icon: HeartHandshake,
    title: localized("Family responsibility is real.", "የቤተሰብ ኃላፊነት እውነተኛ ነው።"),
    body: localized(
      "Supporting people back home is not an occasional transaction. It is part of how many diaspora families plan, provide, and stay connected.",
      "ቤት ያሉ ሰዎችን መደገፍ አልፎ አልፎ የሚደረግ ግብይት አይደለም። ብዙ የዲያስፖራ ቤተሰቦች የሚያቅዱበት፣ የሚያቀርቡበትና ግንኙነታቸውን የሚጠብቁበት የሕይወት ክፍል ነው።",
    ),
  },
  {
    number: "02",
    icon: Eye,
    title: localized("Trust must be visible.", "እምነት ሊታይ ይገባል።"),
    body: localized(
      "Rates, fees, delivery expectations, product status, and risk should be clear before a person commits—not explained after the fact.",
      "አንድ ሰው ከማረጋገጡ በፊት የምንዛሬ ተመን፣ ክፍያ፣ የመድረሻ ግምት፣ የምርት ሁኔታና አደጋ ግልጽ ሊሆኑ ይገባል፤ ከግብይቱ በኋላ የሚብራሩ አይደሉም።",
    ),
  },
  {
    number: "03",
    icon: Sprout,
    title: localized(
      "Progress without unnecessary debt.",
      "ያለ አስፈላጊ ያልሆነ ዕዳ እድገት።",
    ),
    body: localized(
      "Credit-building tools should reward consistent financial behavior without pushing people toward balances they cannot comfortably repay.",
      "የክሬዲት ታሪክ ማጠናከሪያ መሳሪያዎች ሰዎችን በቀላሉ መክፈል ወደማይችሉት ዕዳ ሳይገፉ፣ ተከታታይ የገንዘብ ባህሪን ሊያበረታቱ ይገባል።",
    ),
  },
  {
    number: "04",
    icon: Globe2,
    title: localized(
      "Culture is context, not decoration.",
      "ባህል አውድ ነው፣ ጌጥ አይደለም።",
    ),
    body: localized(
      "Culture should shape the problem we solve, the language we use, and the details we prioritize—not sit on top of a generic product.",
      "ባህል የምንፈታውን ችግኝ፣ የምንጠቀመውን ቋንቋና ቅድሚያ የምንሰጣቸውን ዝርዝሮች ሊቀርጽ ይገባል፤ በአጠቃላይ ምርት ላይ የሚጨመር ጌጥ አይደለም።",
    ),
  },
  {
    number: "05",
    icon: Users,
    title: localized("Access should feel human.", "መዳረሻ ሰዋዊ ሊሆን ይገባል።"),
    body: localized(
      "Financial language, support, and product steps should make sense to the person using them, across languages, generations, and levels of experience.",
      "የገንዘብ ቋንቋ፣ ድጋፍና የምርት ደረጃዎች በቋንቋ፣ በትውልድና በልምድ ደረጃ ልዩነት ቢኖርም ለሚጠቀመው ሰው ሊገቡት ይገባል።",
    ),
  },
  {
    number: "06",
    icon: HandHeart,
    title: localized("Stewardship over shortcuts.", "ከአጭር መንገድ በላይ ኃላፊነት።"),
    body: localized(
      "People's money and trust require disciplined operations, honest limits, and patience. Growth cannot come ahead of readiness.",
      "የሰዎች ገንዘብና እምነት የተደራጀ አሠራር፣ ግልጽ ገደቦችና ትዕግስት ይፈልጋሉ። እድገት ከዝግጁነት በፊት ሊመጣ አይችልም።",
    ),
  },
];

const productPrinciples = [
  {
    icon: Eye,
    title: localized("Show the full picture first.", "መጀመሪያ ሙሉውን ምስል ያሳዩ።"),
    body: localized(
      "A person should see the rate, fee, timing, amount received, and relevant limits before confirming.",
      "አንድ ሰው ከማረጋገጡ በፊት ዋጋውን፣ ክፍያውን፣ ጊዜውን፣ የሚደርሰውን መጠንና አስፈላጊ ገደቦችን ማየት አለበት።",
    ),
  },
  {
    icon: Globe2,
    title: localized(
      "Design for life in two places.",
      "በሁለት ቦታዎች ለሚኖር ሕይወት ይንደፉ።",
    ),
    body: localized(
      "The experience should connect everyday finances in the U.S. and Canada with real responsibilities in Ethiopia.",
      "አገልግሎቱ በU.S. እና Canada ያለውን ዕለታዊ የገንዘብ ሕይወት በኢትዮጵያ ካሉ እውነተኛ ኃላፊነቶች ጋር ማገናኘት አለበት።",
    ),
  },
  {
    icon: ShieldCheck,
    title: localized("Earn trust before scale.", "ከመስፋፋት በፊት እምነትን ያግኙ።"),
    body: localized(
      "Alpha is for testing carefully, listening closely, and proving the operating model before broader release.",
      "Alpha በጥንቃቄ ለመፈተሽ፣ በቅርብ ለማዳመጥና ከሰፊ ምረቃ በፊት የአሠራር ሞዴሉን ለማረጋገጥ ነው።",
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
                    "What we believe shapes what we build.",
                    "የምናምነው የምንገነባውን ይቀርጻል።",
                  ),
                )}
              </h1>
            </div>
            <div className="editorial-hero-deck">
              <p>
                {text(
                  localized(
                    "Samra Pay is being built for people whose financial lives cross borders. These values are the standard for deciding what belongs in the product—and what does not.",
                    "Samra Pay የገንዘብ ሕይወታቸው ድንበር ለሚሻገር ሰዎች እየተገነባ ነው። እነዚህ እሴቶች በምርቱ ውስጥ ምን መኖር እንዳለበትና ምን መኖር እንደሌለበት የምንወስንበት መስፈርት ናቸው።",
                  ),
                )}
              </p>
              <p className="editorial-launch-note">
                <ShieldCheck aria-hidden="true" />
                {text(
                  localized(
                    "Limited Alpha planned for the U.S. and Canada · April 2027",
                    "የተወሰነ Alpha በU.S. እና Canada ታቅዷል · April 2027",
                  ),
                )}
              </p>
            </div>
          </div>
        </section>

        <section
          className="values-manifesto"
          aria-labelledby="values-manifesto-title"
        >
          <div className="coming-container values-manifesto-grid">
            <div>
              <p className="section-eyebrow">
                {text(localized("The standard", "መስፈርታችን"))}
              </p>
              <h2 id="values-manifesto-title">
                {text(
                  localized(
                    "Built around responsibility, not just transactions.",
                    "በግብይት ብቻ ሳይሆን በኃላፊነት ዙሪያ የተገነባ።",
                  ),
                )}
              </h2>
            </div>
            <p>
              {text(
                localized(
                  "A product can look polished and still misunderstand the person using it. Our values are meant to keep Samra grounded in the realities, obligations, and ambitions of the community it intends to serve.",
                  "አንድ ምርት የተዋበ ሊመስል ይችላል፣ ነገር ግን የሚጠቀመውን ሰው ሊሳሳት ይችላል። እሴቶቻችን Samra ሊያገለግል ባሰበው ማህበረሰብ እውነታዎች፣ ግዴታዎችና ምኞቶች ላይ እንዲቆም የሚያደርጉ ናቸው።",
                ),
              )}
            </p>
          </div>
        </section>

        <section className="values-trust" aria-labelledby="values-trust-title">
          <div className="coming-container values-trust-grid">
            <div className="values-trust-copy">
              <p className="section-eyebrow">
                {text(localized("Trust is personal", "እምነት ግላዊ ነው"))}
              </p>
              <h2 id="values-trust-title">
                {text(
                  localized(
                    "Built for people. Accountable to people.",
                    "ለሰዎች የተገነባ። ለሰዎች ተጠያቂ።",
                  ),
                )}
              </h2>
              <p>
                {text(
                  localized(
                    "Every financial decision carries a person, a family, and a responsibility. Samra should earn trust by listening closely, explaining clearly, and building with the people it intends to serve.",
                    "እያንዳንዱ የገንዘብ ውሳኔ ከአንድ ሰው፣ ከቤተሰብ እና ከኃላፊነት ጋር የተያያዘ ነው። Samra በቅርብ በማዳመጥ፣ በግልጽ በማብራራት እና ሊያገለግላቸው ከታሰቡ ሰዎች ጋር በመገንባት እምነትን ማግኘት አለበት።",
                  ),
                )}
              </p>
            </div>
            <div className="values-trust-portraits" aria-hidden="true">
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
          className="values-grid-section"
          aria-label={text(
            localized("Samra Pay core values", "የSamra Pay ዋና እሴቶች"),
          )}
        >
          <div className="coming-container values-grid">
            {coreValues.map((value) => {
              const Icon = value.icon;
              return (
                <article className="value-card" key={value.number}>
                  <div className="value-card-top">
                    <span>{value.number}</span>
                    <Icon aria-hidden="true" />
                  </div>
                  <h2>{text(value.title)}</h2>
                  <p>{text(value.body)}</p>
                </article>
              );
            })}
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
                    "How this should show up in the product.",
                    "ይህ በምርቱ ውስጥ እንዴት ሊታይ ይገባል።",
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
                {text(
                  localized(
                    "See how the values shape the card portfolio.",
                    "እሴቶቹ የካርድ ስብስቡን እንዴት እንደሚቀርጹ ይመልከቱ።",
                  ),
                )}
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
