import { type FormEvent, useId, useState } from "react";
import {
  ArrowRight,
  Gift,
  LockKeyhole,
  PieChart,
  Send,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { ComingSoonFooter, ComingSoonHeader } from "@/components/coming-soon-shell";
import { PublicFaqAccordion } from "@/components/public-faq";
import { homeFaqItems } from "@/content/public-faq";
import { localized, usePublicLanguage } from "@/lib/public-i18n";
import { usePublicPageMeta } from "@/lib/public-page-meta";
import { subscribePublicWaitlist } from "@/lib/public-waitlist";
import "./coming-soon.css";

const homeMeta = {
  title: localized("Samra Pay — U.S. & Canada Alpha, April 2027", "Samra Pay — የU.S. እና Canada Alpha፣ April 2027"),
  description: localized(
    "Samra Pay is building a financial home for Ethiopians in the U.S. and Canada. Limited Alpha is planned for April 2027.",
    "Samra Pay በU.S. እና Canada ለሚኖሩ ኢትዮጵያውያን የገንዘብ ቤት እየገነባ ነው። የተወሰነ Alpha በApril 2027 ለመጀመር ታቅዷል።",
  ),
};

const siteContent = {
  features: [
    {
      icon: TrendingUp,
      title: localized("Build credit through everyday payments", "በዕለታዊ ክፍያዎች የክሬዲት ታሪክዎን ያጠናክሩ።"),
      description: localized(
        "Designed to help eligible payments you already make support your credit journey, with reporting and eligibility tailored to each market—without taking on unnecessary debt.",
        "አስፈላጊ ያልሆነ ዕዳ ሳይወስዱ፣ አስቀድመው የሚከፍሏቸው ብቁ ክፍያዎች የክሬዲት ጉዞዎን እንዲደግፉ በየገበያው ሁኔታ የተነደፈ።",
      ),
    },
    {
      icon: Send,
      title: localized("More value reaches home", "የበለጠ ዋጋ ወደ አገር ቤት ይድረስ።"),
      description: localized(
        "See the rate, fees, delivery estimate, and amount your loved one is expected to receive before you send. We’re building toward highly competitive pricing with no last-step surprises.",
        "ከመላክዎ በፊት የምንዛሬ ተመኑን፣ ክፍያውን፣ የመድረሻ ግምቱንና የሚወዱት ሰው የሚቀበለውን መጠን ይመልከቱ። በመጨረሻው ደረጃ ድንገተኛ ክፍያ የሌለበት ተወዳዳሪ ተመን እየገነባን ነው።",
      ),
    },
    {
      icon: Gift,
      title: localized("Rewards for everyday spending", "በዕለታዊ ወጪዎች ሽልማት ያግኙ።"),
      description: localized(
        "Designed so eligible purchases can earn rewards that add value to life here and strengthen your connection to home.",
        "ብቁ ግዢዎች እዚህ ለሚኖረው ሕይወትዎ ዋጋ የሚጨምሩና ከቤት ጋር ያለዎትን ግንኙነት የሚያጠናክሩ ሽልማቶችን እንዲያገኙ የተነደፈ።",
      ),
    },
  ],
  capabilities: [
    { icon: TrendingUp, label: localized("Explore all four card paths", "አራቱንም የካርድ አማራጮች ያስሱ"), href: "/features#progression-title" },
    { icon: Send, label: localized("See what is planned across the portfolio", "በካርድ ስብስቡ ውስጥ የታቀደውን ይመልከቱ"), href: "/features#included-title" },
    { icon: Gift, label: localized("Compare tiers, rewards, and access", "ደረጃዎችን፣ ሽልማቶችንና መዳረሻን ያወዳድሩ"), href: "/features#compare-title" },
    { icon: PieChart, label: localized("Understand what is still in development", "አሁንም በልማት ላይ ያለውን ይረዱ"), href: "/features#disclosure-title" },
    { icon: LockKeyhole, label: localized("Read the values guiding the product", "ምርቱን የሚመሩትን እሴቶች ያንብቡ"), href: "/values" },
  ],
};

function EarlyAccessForm({ compact = false }: { compact?: boolean }) {
  const emailId = useId();
  const consentId = useId();
  const { language, text } = usePublicLanguage();
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [consented, setConsented] = useState(false);
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!event.currentTarget.checkValidity()) return;
    setStatus("submitting");
    try {
      await subscribePublicWaitlist({ email, locale: language, website });
      setStatus("success");
    } catch {
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className="early-access-success" role="status">
        <ShieldCheck aria-hidden="true" />
        <div>
          <strong>{text(localized("You’re on the list.", "በዝርዝሩ ውስጥ ገብተዋል።"))}</strong>
          <span>{text(localized(
            "We’ll email you when Samra Pay launch updates are ready.",
            "የSamra Pay የመክፈቻ ዜናዎች ሲዘጋጁ በኢሜይል እናሳውቅዎታለን።",
          ))}</span>
        </div>
        <button type="button" onClick={() => setStatus("idle")}>
          {text(localized("Use another email", "ሌላ ኢሜይል ይጠቀሙ"))}
        </button>
      </div>
    );
  }

  return (
    <form className={compact ? "early-access-form is-compact" : "early-access-form"} onSubmit={(event) => void handleSubmit(event)}>
      <label className="sr-only" htmlFor={emailId}>
        {text(localized("Email address", "የኢሜይል አድራሻ"))}
      </label>
      <input
        id={emailId}
        type="email"
        inputMode="email"
        autoComplete="email"
        placeholder={text(localized("Email address", "የኢሜይል አድራሻ"))}
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
      />
      <input
        className="waitlist-honeypot"
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        value={website}
        onChange={(event) => setWebsite(event.target.value)}
        aria-hidden="true"
      />
      <button type="submit" disabled={status === "submitting" || !consented}>
        {status === "submitting"
          ? text(localized("Joining…", "በመመዝገብ ላይ…"))
          : text(localized("Join the waitlist", "የጥበቃ ዝርዝሩን ይቀላቀሉ"))}
      </button>
      <label className="waitlist-consent" htmlFor={consentId}>
        <input
          id={consentId}
          type="checkbox"
          checked={consented}
          onChange={(event) => setConsented(event.target.checked)}
          required
        />
        <span>{text(localized(
          "I agree to receive Samra Pay launch updates by email. I can unsubscribe at any time.",
          "የSamra Pay የመክፈቻ ዜናዎችን በኢሜይል ለመቀበል እስማማለሁ። በማንኛውም ጊዜ ምዝገባዬን ማቋረጥ እችላለሁ።",
        ))} <a href="/privacy">{text(localized("Privacy", "ግላዊነት"))}</a></span>
      </label>
      {status === "error" ? (
        <p className="waitlist-error" role="alert">
          {text(localized(
            "We couldn’t save your signup. Please try again.",
            "ምዝገባዎን ማስቀመጥ አልቻልንም። እባክዎ ዳግም ይሞክሩ።",
          ))}
        </p>
      ) : null}
    </form>
  );
}

function HomeFaq() {
  const { text } = usePublicLanguage();

  return (
    <section className="faq-section" id="faq" aria-labelledby="faq-title">
      <div className="coming-container faq-grid">
        <div>
          <p className="section-eyebrow">{text(localized("Three questions to start", "ለመጀመር ሦስት ጥያቄዎች"))}</p>
          <h2 id="faq-title">{text(localized("The essentials, answered.", "ዋናዎቹ ጥያቄዎች፣ በግልጽ።"))}</h2>
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
    <div className={`coming-soon-site ${language === "am" ? "is-amharic" : ""}`} id="top" lang={language}>
      <ComingSoonHeader />

      <main id="main-content" tabIndex={-1}>
        <section className="coming-hero" aria-labelledby="coming-title">
          <div className="coming-hero-copy">
            <div className="coming-status">
              <span aria-hidden="true" />
              {text(localized("Alpha planned for April 2027", "Alpha ለApril 2027 ታቅዷል"))}
            </div>
            <h1 id="coming-title">
              {language === "en" ? (
                <>Banked <em>here</em>, care for family <em className="hero-phrase">at home</em></>
              ) : (
                <>የባንክ ጉዳይዎን <em>እዚህ</em> ያስተዳድሩ፤ <em className="hero-phrase">አገር ቤት</em> ያለውን ቤተሰብዎን ይንከባከቡ።</>
              )}
            </h1>
            <p className="coming-hero-deck">
              {text(localized(
                "Launching in the U.S. and Canada: Direct deposit, credit building, remittance, and rewards on everyday spending—all in one place.",
                "በአሜሪካና ካናዳ የሚጀምረው፦ ቀጥታ የደመወዝ ገቢ፣ የክሬዲት ታሪክ ግንባታ፣ የገንዘብ ልውውጥ እና በዕለታዊ ወጪ ሽልማቶች—ሁሉም በአንድ ቦታ።",
              ))}
            </p>
            <EarlyAccessForm />
            <p className="concept-note" id="concept-status">
              <ShieldCheck aria-hidden="true" />
              {text(localized(
                "Samra Pay is in development",
                "Samra Pay በልማት ላይ ነው",
              ))}
            </p>
          </div>

          <div className="coming-hero-media">
            <img
              src="/coming-soon/hero-woman-coffee.png"
              alt={text(localized("Ethiopian diaspora woman holding a coffee cup", "የቡና ስኒ የያዘች በውጭ የምትኖር ኢትዮጵያዊት"))}
            />
          </div>
        </section>

        <section className="story-intro" id="story" aria-labelledby="story-title">
          <img src="/coming-soon/tibeb-pattern-gold.jpg" alt="" aria-hidden="true" className="section-pattern section-pattern-light" />
          <div className="coming-container story-intro-grid">
            <h2 id="story-title">{text(localized("One life. More than one home.", "አንድ ሕይወት። ከአንድ በላይ ቤት።"))}</h2>
            <p>{text(localized(
              "We build our lives here while the people we love are back home. Samra is being built for us, by us, to make managing and moving money simple, so staying connected never feels like a compromise. That’s how it should be.",
              "ሕይወታችንን እዚህ እንገነባለን፤ የምንወዳቸው ሰዎች ግን አገር ቤት ናቸው። Samra የሚገነባው ለእኛ፣ በእኛ ነው—ገንዘብን ማስተዳደርና ማንቀሳቀስ ቀላል እንዲሆን እና ግንኙነታችንን ለመጠበቅ መደራደር እንዳያስፈልግ። መሆን ያለበት እንዲህ ነው።",
            ))}</p>
          </div>
        </section>

        <section className="feature-framework" id="features" aria-label={text(localized("Samra Pay product vision", "የSamra Pay የምርት ራዕይ"))}>
          <div className="coming-container feature-framework-grid">
            {siteContent.features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <article className={index === 2 ? "feature-framework-item is-wide" : "feature-framework-item"} key={feature.title.en}>
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

        <section className="capability-band" id="capabilities" aria-labelledby="capabilities-title">
          <img src="/coming-soon/tibeb-pattern-gold.jpg" alt="" aria-hidden="true" className="section-pattern section-pattern-dark" />
          <div className="coming-container capability-grid">
            <div>
              <p className="section-eyebrow">{text(localized("What we are building", "እየገነባን ያለነው"))}</p>
              <h2 id="capabilities-title">{text(localized("Everyday money should move you forward.", "ዕለታዊ ገንዘብዎ ወደፊት ሊያራምድዎት ይገባል።"))}</h2>
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

        <section className="proof-section proof-section-dark" id="values" aria-labelledby="approach-title">
          <div className="coming-container proof-grid proof-grid-text-first">
            <div className="proof-copy">
              <p className="section-eyebrow">{text(localized("What guides us", "የሚመራን"))}</p>
              <h2 id="approach-title">{text(localized("Culture is context. Not decoration.", "ባህል አውድ ነው። ጌጥ አይደለም።"))}</h2>
              <p>{text(localized(
                "We are designing Samra Pay around the realities generic financial products often overlook: family responsibility, trust across distance, multiple currencies, and a connection to home that is both practical and personal.",
                "Samra Payን አጠቃላይ የገንዘብ ምርቶች ብዙ ጊዜ በሚዘነጉባቸው እውነታዎች ዙሪያ እየነደፍን ነው፦ የቤተሰብ ኃላፊነት፣ ከርቀት የሚገነባ እምነት፣ ብዙ ምንዛሬዎችና ከቤት ጋር ያለ ተግባራዊና የግል ግንኙነት።",
              ))}</p>
              <a className="proof-inline-link" href="/values">{text(localized("Explore our values", "እሴቶቻችንን ያስሱ"))}<ArrowRight aria-hidden="true" /></a>
            </div>
            <div className="proof-image-wrap">
              <img src="/coming-soon/proof-man-laptop.png" alt={text(localized("Ethiopian diaspora professional working on a laptop in a coffee shop", "በቡና ቤት በላፕቶፕ ላይ የሚሰራ በውጭ የሚኖር ኢትዮጵያዊ"))} />
              <img src="/coming-soon/tibeb-pattern-gold.jpg" alt="" aria-hidden="true" className="proof-pattern" />
            </div>
          </div>
        </section>

        <section className="proof-section proof-section-light" id="blog" aria-labelledby="everyday-title">
          <div className="coming-container proof-grid proof-grid-image-first">
            <div className="proof-image-wrap proof-image-woman">
              <img src="/coming-soon/woman-with-phone-diaspora.jpg" alt={text(localized("Ethiopian diaspora woman using her phone at home", "በቤቷ ስልኳን የምትጠቀም በውጭ የምትኖር ኢትዮጵያዊት"))} />
            </div>
            <div className="proof-copy">
              <p className="section-eyebrow">{text(localized("From Samra Pay's founder", "ከSamra Pay መስራች"))}</p>
              <h2 id="everyday-title">{text(localized("Money, identity, and life between worlds.", "ገንዘብ፣ ማንነትና በሁለት ዓለማት መካከል ያለ ሕይወት።"))}</h2>
              <p>{text(localized(
                "Founder notes, practical guidance, and honest conversations for Ethiopians building lives across borders. The first posts are coming soon.",
                "ድንበር ተሻግረው ሕይወት ለሚገነቡ ኢትዮጵያውያን የመስራች ማስታወሻዎች፣ ተግባራዊ መመሪያዎችና ግልጽ ውይይቶች። የመጀመሪያዎቹ ጽሑፎች በቅርቡ ይመጣሉ።",
              ))}</p>
              <a className="proof-inline-link is-dark" href="/blog">{text(localized("Visit the blog", "ጽሑፎቹን ይመልከቱ"))}<ArrowRight aria-hidden="true" /></a>
            </div>
          </div>
        </section>

        <HomeFaq />

        <section className="final-cta" aria-labelledby="final-cta-title">
          <div className="coming-container final-cta-grid">
            <div>
              <h2 id="final-cta-title">{text(localized("Be first to know when Alpha opens.", "Alpha ሲከፈት መጀመሪያ ይወቁ።"))}</h2>
              <p>{text(localized(
                "Limited Alpha is planned for the U.S. and Canada in April 2027. Get product updates as Samra Pay moves toward release.",
                "የተወሰነ Alpha በU.S. እና Canada በApril 2027 ለመጀመር ታቅዷል። Samra Pay ወደ ምረቃ ሲቀርብ የምርት ዜናዎችን ያግኙ።",
              ))}</p>
            </div>
            <EarlyAccessForm compact />
          </div>
        </section>
      </main>

      <ComingSoonFooter />
    </div>
  );
}
