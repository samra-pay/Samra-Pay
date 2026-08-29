import { FormEvent, useEffect, useId, useState } from "react";
import {
  ArrowRight,
  ChevronDown,
  CreditCard,
  Globe2,
  LockKeyhole,
  Menu,
  PieChart,
  Send,
  ShieldCheck,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import "./coming-soon.css";

const siteContent = {
  navigation: [
    { label: "Features", href: "#features" },
    { label: "Values", href: "#values" },
    { label: "FAQ", href: "#faq" },
    { label: "Blog", href: "#blog" },
  ],
  features: [
    {
      icon: CreditCard,
      title: "Feature title",
      description: "Short description of the feature and how it helps you manage money with ease and confidence.",
    },
    {
      icon: Users,
      title: "Feature title",
      description: "Short description of the feature and how it helps you manage money with ease and confidence.",
    },
    {
      icon: ShieldCheck,
      title: "Feature title",
      description: "Short description of the feature and how it helps you manage money with ease and confidence.",
    },
  ],
  capabilities: [
    { icon: Send, label: "Move money across borders with clarity" },
    { icon: WalletCards, label: "Manage and spend with global ease" },
    { icon: PieChart, label: "Track and stay on top of what matters" },
    { icon: LockKeyhole, label: "Secure by design, privacy first" },
    { icon: Globe2, label: "Built for the Ethiopian diaspora" },
  ],
  questions: [
    {
      question: "What is Samra Pay?",
      answer: "Samra Pay is a concept-stage financial platform being designed for the Ethiopian diaspora. Final products and availability are still being defined.",
    },
    {
      question: "When will Samra Pay launch?",
      answer: "A public launch date has not been announced. Early-access updates will be shared only after the relevant product and operating details are confirmed.",
    },
    {
      question: "How do I get early access?",
      answer: "This prototype demonstrates the early-access experience. The production signup workflow will be connected before public launch.",
    },
    {
      question: "Will Samra Pay be available globally?",
      answer: "No geographic availability is being represented yet. Future access will depend on the final product, operating partners, and applicable requirements.",
    },
  ],
};

function ComingSoonLogo({ dark = false }: { dark?: boolean }) {
  return (
    <span className={dark ? "coming-logo is-dark" : "coming-logo"} aria-label="Samra Pay">
      <span>samra</span><em>pay</em>
    </span>
  );
}

function ComingSoonLanguageToggle({ className = "" }: { className?: string }) {
  const [language, setLanguage] = useState<"en" | "am">("en");
  return (
    <div className={`coming-language-toggle ${className}`} role="group" aria-label="Language">
      <button type="button" aria-pressed={language === "en"} onClick={() => setLanguage("en")}>EN</button>
      <button type="button" lang="am" aria-pressed={language === "am"} onClick={() => setLanguage("am")}>አማ</button>
    </div>
  );
}

function EarlyAccessForm({ compact = false }: { compact?: boolean }) {
  const emailId = useId();
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!event.currentTarget.checkValidity()) return;
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="early-access-success" role="status">
        <ShieldCheck aria-hidden="true" />
        <div>
          <strong>Preview complete.</strong>
          <span>No information was transmitted or stored.</span>
        </div>
        <button type="button" onClick={() => setSubmitted(false)}>
          Reset
        </button>
      </div>
    );
  }

  return (
    <form className={compact ? "early-access-form is-compact" : "early-access-form"} onSubmit={handleSubmit}>
      <label className="sr-only" htmlFor={emailId}>
        Email address
      </label>
      <input
        id={emailId}
        type="email"
        inputMode="email"
        autoComplete="email"
        placeholder="Enter your email address"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
      />
      <button type="submit">Request early access</button>
    </form>
  );
}

function ComingSoonHeader() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <header className="coming-header">
      <a className="brand-link" href="#top" aria-label="Samra Pay home">
        <ComingSoonLogo dark />
      </a>
      <nav className="coming-desktop-nav" aria-label="Primary navigation">
        {siteContent.navigation.map((item) => (
          <a key={item.href} href={item.href}>
            {item.label}
          </a>
        ))}
      </nav>
      <div className="coming-header-actions">
        <ComingSoonLanguageToggle />
        <button
          type="button"
          className="coming-menu-button"
          aria-label={open ? "Close navigation" : "Open navigation"}
          aria-expanded={open}
          aria-controls="coming-mobile-nav"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </button>
      </div>
      {open && (
        <nav id="coming-mobile-nav" className="coming-mobile-nav" aria-label="Mobile navigation">
          <div className="coming-mobile-nav-top">
            <ComingSoonLogo dark />
            <button type="button" onClick={() => setOpen(false)} aria-label="Close navigation">
              <X aria-hidden="true" />
            </button>
          </div>
          {siteContent.navigation.map((item) => (
            <a key={item.href} href={item.href} onClick={() => setOpen(false)}>
              {item.label}
            </a>
          ))}
          <ComingSoonLanguageToggle className="coming-mobile-language" />
        </nav>
      )}
    </header>
  );
}

function FAQ() {
  const [openQuestion, setOpenQuestion] = useState<number | null>(null);

  return (
    <section className="faq-section" id="faq" aria-labelledby="faq-title">
      <div className="coming-container faq-grid">
        <div>
          <p className="section-eyebrow">Questions</p>
          <h2 id="faq-title">Frequently asked questions</h2>
        </div>
        <div className="faq-list">
          {siteContent.questions.map((item, index) => {
            const isOpen = openQuestion === index;
            const answerId = `faq-answer-${index}`;
            return (
              <div className="faq-item" key={item.question}>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={answerId}
                  onClick={() => setOpenQuestion(isOpen ? null : index)}
                >
                  <span>{item.question}</span>
                  <ChevronDown aria-hidden="true" />
                </button>
                <div id={answerId} className="faq-answer" hidden={!isOpen}>
                  <p>{item.answer}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default function Home() {
  return (
    <div className="coming-soon-site" id="top">
      <ComingSoonHeader />

      <main>
        <section className="coming-hero" aria-labelledby="coming-title">
          <div className="coming-hero-copy">
            <div className="coming-status">
              <span aria-hidden="true" />
              Coming soon
            </div>
            <h1 id="coming-title">
              Your financial home. Built between <em>here</em> and <em>home.</em>
            </h1>
            <p className="coming-hero-deck">A modern financial platform being designed for the Ethiopian diaspora.</p>
            <EarlyAccessForm />
            <p className="concept-note" id="concept-status">
              <ShieldCheck aria-hidden="true" />
              Concept preview. Samra Pay is not yet live, and no financial services are offered through this page.
            </p>
          </div>

          <div className="coming-hero-media">
            <img src="/coming-soon/hero-woman-coffee.png" alt="Ethiopian diaspora woman holding a coffee cup" />
            <div className="concept-preview-card" aria-label="Illustrative product preview">
              <span>Concept preview</span>
              <WalletCards aria-hidden="true" />
              <strong>Product moment</strong>
              <p>Replace with an approved feature and supporting line.</p>
            </div>
          </div>
        </section>

        <section className="story-intro" id="story" aria-labelledby="story-title">
          <img src="/coming-soon/tibeb-pattern-gold.jpg" alt="" aria-hidden="true" className="section-pattern section-pattern-light" />
          <div className="coming-container story-intro-grid">
            <h2 id="story-title">Bridging lives.<br />Connecting futures.</h2>
            <p>
              Samra Pay is being shaped for a global Ethiopian community. This framework separates the design system from the final product story so approved content can be added without rebuilding the experience.
            </p>
          </div>
        </section>

        <section className="feature-framework" id="features" aria-label="Replaceable feature framework">
          <div className="coming-container feature-framework-grid">
            {siteContent.features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <article className={index === 2 ? "feature-framework-item is-wide" : "feature-framework-item"} key={`${feature.title}-${index}`}>
                  <Icon aria-hidden="true" />
                  <div>
                    <h3>{feature.title}</h3>
                    <p>{feature.description}</p>
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
              <p className="section-eyebrow">Built around you</p>
              <h2 id="capabilities-title">Designed for how you move, give, and grow.</h2>
            </div>
            <div className="capability-list">
              {siteContent.capabilities.map((capability) => {
                const Icon = capability.icon;
                return (
                  <a key={capability.label} href="#concept-status">
                    <Icon aria-hidden="true" />
                    <span>{capability.label}</span>
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
              <p className="section-eyebrow">Our approach</p>
              <h2 id="approach-title">Rooted in culture.<br />Focused on people.</h2>
              <p>
                The final narrative will be supplied here. The framework is ready for approved product positioning, user evidence, and specific calls to action.
              </p>
            </div>
            <div className="proof-image-wrap">
              <img src="/coming-soon/proof-man-laptop.png" alt="Ethiopian diaspora professional working on a laptop in a coffee shop" />
              <img src="/coming-soon/tibeb-pattern-gold.jpg" alt="" aria-hidden="true" className="proof-pattern" />
            </div>
          </div>
        </section>

        <section className="proof-section proof-section-light" id="blog" aria-labelledby="everyday-title">
          <div className="coming-container proof-grid proof-grid-image-first">
            <div className="proof-image-wrap proof-image-woman">
              <img src="/coming-soon/woman-with-phone-diaspora.jpg" alt="Ethiopian diaspora woman using her phone at home" />
            </div>
            <div className="proof-copy">
              <p className="section-eyebrow">Built for real life</p>
              <h2 id="everyday-title">Simple to use.<br />Every day.</h2>
              <p>
                Replace this section with the strongest approved proof point once the final product scope and supporting evidence are ready.
              </p>
            </div>
          </div>
        </section>

        <FAQ />

        <section className="final-cta" aria-labelledby="final-cta-title">
          <div className="coming-container final-cta-grid">
            <div>
              <h2 id="final-cta-title">Be the first to know when we launch.</h2>
              <p>This preview does not transmit information. Connect the approved signup workflow before publication.</p>
            </div>
            <EarlyAccessForm compact />
          </div>
        </section>
      </main>

      <footer className="coming-footer">
        <div className="coming-container coming-footer-grid">
          <div className="coming-footer-brand">
            <a href="#top" aria-label="Samra Pay home"><ComingSoonLogo /></a>
            <p>Your financial home, built between here and home.</p>
            <small>© {new Date().getFullYear()} Samra Pay. Concept preview.</small>
          </div>
          <div>
            <h3>Explore</h3>
            <a href="#features">Features</a>
            <a href="#values">Values</a>
            <a href="#faq">FAQ</a>
            <a href="#blog">Blog</a>
          </div>
          <div>
            <h3>Legal</h3>
            <a href="/privacy">Privacy Policy</a>
            <a href="/terms">Terms of Service</a>
          </div>
          <div>
            <h3>Status</h3>
            <p>Concept-stage product</p>
            <p>No live financial services</p>
            <p>No sign-in or account access</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
