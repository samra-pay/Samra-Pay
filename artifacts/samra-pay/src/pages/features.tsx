import {
  ArrowRight,
  CalendarClock,
  Check,
  CreditCard,
  Crown,
  Globe2,
  PackageCheck,
  Plane,
  ReceiptText,
  Send,
  ShieldCheck,
  Smartphone,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { tibebPattern } from "@/assets/coming-soon/images";
import {
  ComingSoonFooter,
  ComingSoonHeader,
  ComingSoonLogo,
} from "@/components/coming-soon-shell";
import { OptimizedPicture } from "@/components/optimized-picture";
import ethiopianAirlinesLogo from "@/assets/ethiopian-airlines-logo.svg";
import mastercardSymbol from "@/assets/mastercard-symbol.svg";
import { featureCopyAm } from "@/content/features-am";
import { localized, usePublicLanguage } from "@/lib/public-i18n";
import { usePublicPageMeta } from "@/lib/public-page-meta";
import "./coming-soon.css";

const featuresMeta = {
  title: localized(
    "Samra Pay — Cards for your next chapter",
    "Samra Pay — ለሚቀጥለው ምዕራፍዎ ካርዶች",
  ),
  description: localized(
    "Discover the upcoming Samra Pay card portfolio: a credit-building foundation, everyday rewards, an airline co-brand proposal, and the invitation-only Elite 100 founding edition.",
    "የሚመጣውን የSamra Pay ካርድ ስብስብ ይወቁ፦ የክሬዲት ታሪክ መሠረት፣ ዕለታዊ ሽልማቶች፣ የአየር መንገድ የጋራ ብራንድ ዕቅድና በግብዣ ብቻ የሚገኝ Elite 100 እትም።",
  ),
};

const cardTiers = [
  {
    level: "01",
    className: "is-charge",
    icon: TrendingUp,
    name: "Samra Pay Charge",
    shortName: "Charge",
    label: "Entry · Credit building",
    headline: "Build your foundation.",
    description:
      "A straightforward starting point designed to help eligible everyday activity support your credit journey.",
    cardLine: "Credit building",
    annualMembership: null,
    annualMiles: null,
    benefits: [
      "Credit-building tools designed around eligible activity",
      "Planned pay-in-full charge structure",
      "Clear balance and spending controls",
      "Base Samra Pay FX rate",
    ],
  },
  {
    level: "02",
    className: "is-elite",
    icon: Sparkles,
    name: "Samra Pay Elite",
    shortName: "Elite",
    label: "Everyday rewards",
    headline: "Turn everyday spend into miles.",
    description:
      "The next level adds proposed ShebaMiles rewards to eligible everyday purchases.",
    cardLine: "Everyday ShebaMiles",
    annualMembership: "$195",
    annualMiles: "15,000",
    benefits: [
      "Everything planned for Samra Pay Charge",
      "Proposed ShebaMiles on eligible everyday spend",
      "Proposed FX benefit: +1%",
      "A single view of spending, rewards, and transfers",
    ],
  },
  {
    level: "03",
    className: "is-cobrand",
    icon: Plane,
    name: "Samra Pay × Ethiopian Airlines",
    shortName: "Co-branded",
    label: "Proposed airline co-brand",
    headline: "Go further with every purchase.",
    description:
      "Our airline tier pairs an Ethiopian Airlines co-brand proposal with a target of 2X ShebaMiles on eligible spend.",
    cardLine: "2X ShebaMiles",
    annualMembership: "$495",
    annualMiles: "45,000",
    benefits: [
      "Everything planned for Samra Pay Elite",
      "Proposed 2X ShebaMiles on eligible spend",
      "Proposed FX benefit: +2%",
      "Airline-linked benefits to be defined with the partner",
    ],
  },
  {
    level: "04",
    className: "is-founder",
    icon: Crown,
    name: "Samra Elite 100",
    shortName: "Elite 100",
    label: "Invitation only · Founding 100",
    headline: "For the first 100 who believed.",
    description:
      "An invitation-only founding edition for 100 people helping shape Samra’s next chapter, distinguished by individually numbered titanium cards.",
    cardLine: "Elite 100",
    annualMembership: null,
    annualMiles: null,
    benefits: [
      "Founder-selected membership by invitation",
      "One of 100 individually numbered titanium cards",
      "Recognition as part of Samra’s founding community",
    ],
  },
];

const comparisonRows = [
  {
    label: "Primary value",
    values: [
      "Credit-building foundation",
      "Everyday rewards",
      "Airline rewards",
      "Elite 100 recognition",
    ],
  },
  {
    label: "Miles on eligible spend",
    values: [
      "—",
      "Proposed ShebaMiles",
      "Proposed 2X ShebaMiles",
      "To be announced",
    ],
  },
  {
    label: "FX benefit",
    values: [
      "Base Samra Pay rate",
      "Proposed +1%",
      "Proposed +2%",
      "To be announced",
    ],
  },
  {
    label: "Annual membership",
    values: [
      "To be announced",
      "Proposed $195",
      "Proposed $495",
      "To be announced",
    ],
  },
  {
    label: "Annual ShebaMiles reward",
    values: ["—", "Proposed 15,000", "Proposed 45,000", "To be announced"],
  },
  {
    label: "Availability",
    values: [
      "Launch portfolio",
      "Launch portfolio",
      "Launch portfolio",
      "Invitation only · First 100",
    ],
  },
];

const includedCardFeatures = [
  {
    icon: CalendarClock,
    eyebrow: "Direct deposit",
    title: "Payday, up to two days early.",
    description:
      "Qualifying direct deposits may arrive up to two days before the scheduled payment date, depending on when the payer sends funds.",
  },
  {
    icon: ReceiptText,
    eyebrow: "Credit building",
    title: "Make recurring bills count.",
    description:
      "Planned reporting of eligible monthly recurring bills to participating credit bureaus, subject to enrollment and program terms.",
  },
  {
    icon: Smartphone,
    eyebrow: "Instant access",
    title: "A virtual card right away.",
    description:
      "Eligible customers can receive a virtual card after approval and identity verification, before the physical card arrives.",
  },
  {
    icon: PackageCheck,
    eyebrow: "Physical card",
    title: "Titanium, delivered home.",
    description:
      "A planned titanium physical card mailed to your verified address in the United States or Canada.",
  },
  {
    icon: Send,
    eyebrow: "Send home",
    title: "Our best available rate.",
    description:
      "See the rate, fees, amount received, and delivery estimate before confirming. Instant delivery is planned where supported.",
  },
];

function CardArtwork({
  tier,
  copy,
}: {
  tier: (typeof cardTiers)[number];
  copy: (english: string) => string;
}) {
  const isFounder = tier.className === "is-founder";
  const { language } = usePublicLanguage();

  return (
    <div
      className={`portfolio-card-art ${tier.className}`}
      role={isFounder ? "img" : undefined}
      aria-label={
        isFounder
          ? language === "am"
            ? "የSamra Elite 100 የቲታኒየም መስራች እትም ካርድ ንድፍ"
            : "Samra Elite 100 titanium founding-edition card design"
          : undefined
      }
      aria-hidden={isFounder ? undefined : "true"}
    >
      {isFounder ? (
        <OptimizedPicture
          asset={tibebPattern}
          className="portfolio-founder-pattern"
          pictureClassName="public-picture-contents"
          alt=""
          loading="lazy"
          decoding="async"
        />
      ) : null}
      <div className="portfolio-card-topline">
        {isFounder ? (
          <div className="portfolio-founder-identity">
            <strong>Samra</strong>
            <span>{copy("Founding member")}</span>
          </div>
        ) : (
          <ComingSoonLogo />
        )}
        {isFounder ? (
          <div className="portfolio-founder-credentials">
            <span className="portfolio-founder-material">
              {copy("Titanium")}
            </span>
            <span className="portfolio-founder-edition">
              {copy("Founding 100")}
            </span>
          </div>
        ) : tier.className === "is-cobrand" ? (
          <img
            className="portfolio-airline-logo"
            src={ethiopianAirlinesLogo}
            alt=""
            width="96"
            height="36"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <span>{tier.shortName}</span>
        )}
      </div>
      <div className="portfolio-card-chip">
        <span />
        <span />
        <span />
        <span />
      </div>
      {isFounder ? (
        <div className="portfolio-founder-index" aria-hidden="true">
          <span>{copy("Limited edition")}</span>
          <strong>100</strong>
        </div>
      ) : null}
      <div className="portfolio-card-bottomline">
        <span>{copy(tier.cardLine)}</span>
        {!isFounder && (
          <img
            className="portfolio-mastercard-logo"
            src={mastercardSymbol}
            alt=""
            width="42"
            height="26"
            loading="lazy"
            decoding="async"
          />
        )}
      </div>
    </div>
  );
}

export default function Features() {
  const { language } = usePublicLanguage();
  const copy = (english: string) =>
    language === "am" ? (featureCopyAm[english] ?? english) : english;
  usePublicPageMeta({ language, ...featuresMeta });

  return (
    <div
      className={`coming-soon-site portfolio-page ${language === "am" ? "is-amharic" : ""}`}
      id="top"
      lang={language}
    >
      <ComingSoonHeader />

      <main id="main-content" tabIndex={-1}>
        <section className="portfolio-hero" aria-labelledby="portfolio-title">
          <div className="coming-container portfolio-hero-grid">
            <div className="portfolio-hero-copy">
              <div className="coming-status">
                <span aria-hidden="true" />
                {copy("The next chapter in your wallet")}
              </div>
              <h1 id="portfolio-title">
                {language === "en" ? (
                  <>
                    Four tailored
                    <br />
                    products for us.
                    <br />
                    One path <em>forward.</em>
                  </>
                ) : (
                  <>
                    ለእኛ የተዘጋጁ
                    <br />
                    አራት ምርቶች።
                    <br />
                    አንድ ወደ <em>ፊት</em> የሚወስድ መንገድ።
                  </>
                )}
              </h1>
            </div>
            <div className="portfolio-hero-deck">
              <p>
                {copy(
                  "Start with credit building. Move into everyday rewards. Unlock more cross-border value—and recognize the first members helping shape Samra.",
                )}
              </p>
              <div className="portfolio-availability">
                <ShieldCheck aria-hidden="true" />
                <span>
                  {copy(
                    "Explore the launch portfolio. Choose the path that speaks to your life.",
                  )}
                </span>
              </div>
            </div>
          </div>
        </section>

        <section
          className="portfolio-progression"
          aria-labelledby="progression-title"
        >
          <div className="coming-container portfolio-progression-heading">
            <div>
              <p className="section-eyebrow">
                {copy("The Samra Pay card portfolio")}
              </p>
              <h2 id="progression-title">
                {copy("Three levels. One founding edition.")}
              </h2>
            </div>
            <p>
              {copy(
                "Charge, Elite, and the proposed Ethiopian Airlines tier form a progression. Elite 100 is a separate, invitation-only founding edition.",
              )}
            </p>
          </div>

          <div className="coming-container portfolio-tier-list">
            {cardTiers.map((tier) => {
              const Icon = tier.icon;
              return (
                <article
                  className={`portfolio-tier ${tier.className}`}
                  id={
                    tier.className === "is-founder"
                      ? "elite-100"
                      : `card-${tier.level}`
                  }
                  key={tier.name}
                >
                  <div className="portfolio-tier-visual">
                    <div className="portfolio-tier-meta">
                      <span>
                        {tier.className === "is-founder"
                          ? copy("Level 04 · Titanium edition")
                          : `${language === "am" ? "ደረጃ" : "Level"} ${tier.level}`}
                      </span>
                      <span className="portfolio-status-pill">
                        {tier.className === "is-founder"
                          ? copy("Invitation only")
                          : copy("Launch portfolio")}
                      </span>
                    </div>
                    <CardArtwork tier={tier} copy={copy} />
                  </div>

                  <div className="portfolio-tier-copy">
                    <div className="portfolio-tier-intro">
                      <div className="portfolio-tier-label">
                        <Icon aria-hidden="true" />
                        <span>{copy(tier.label)}</span>
                      </div>
                      <h3>{tier.name}</h3>
                      <h4>{copy(tier.headline)}</h4>
                      <p>{copy(tier.description)}</p>
                    </div>
                    {tier.className === "is-founder" ? (
                      <dl
                        className="portfolio-founder-facts"
                        aria-label={copy("Elite 100 details")}
                      >
                        <div>
                          <dt>{copy("Material")}</dt>
                          <dd>{copy("Titanium")}</dd>
                        </div>
                        <div>
                          <dt>{copy("Edition")}</dt>
                          <dd>{copy("Founding 100")}</dd>
                        </div>
                        <div>
                          <dt>{copy("Access")}</dt>
                          <dd>{copy("Invitation only")}</dd>
                        </div>
                      </dl>
                    ) : null}
                    {tier.className !== "is-founder" ? (
                      <dl
                        className={`portfolio-tier-economics ${tier.annualMembership ? "" : "is-pending"}`}
                        aria-label={
                          language === "am"
                            ? `ለ${tier.name} የታቀዱ ዓመታዊ አባልነት ውሎች`
                            : `Proposed annual membership terms for ${tier.name}`
                        }
                      >
                        <div>
                          <dt>{copy("Proposed annual membership")}</dt>
                          <dd>
                            {tier.annualMembership ?? copy("To be announced")}
                          </dd>
                        </div>
                        <div>
                          <dt>{copy("Proposed annual ShebaMiles reward")}</dt>
                          <dd>{tier.annualMiles ?? "—"}</dd>
                        </div>
                      </dl>
                    ) : null}
                    <ul>
                      {tier.benefits.map((benefit) => (
                        <li key={benefit}>
                          <Check aria-hidden="true" />
                          <span>{copy(benefit)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section
          className="portfolio-included"
          aria-labelledby="included-title"
        >
          <div className="coming-container portfolio-included-heading">
            <div>
              <p className="section-eyebrow">
                {copy("Built around everyday life")}
              </p>
              <h2 id="included-title">{copy("More value from day one.")}</h2>
            </div>
            <p>
              {copy(
                "The portfolio is designed around these foundational features. Final availability will vary by tier, eligibility, and program terms.",
              )}
            </p>
          </div>

          <div className="coming-container portfolio-included-grid">
            {includedCardFeatures.map((feature) => {
              const Icon = feature.icon;
              return (
                <article
                  className="portfolio-included-feature"
                  key={feature.title}
                >
                  <div className="portfolio-included-icon">
                    <Icon aria-hidden="true" />
                  </div>
                  <p>{copy(feature.eyebrow)}</p>
                  <h3>{copy(feature.title)}</h3>
                  <span>{copy(feature.description)}</span>
                </article>
              );
            })}
          </div>
        </section>

        <section className="portfolio-compare" aria-labelledby="compare-title">
          <div className="coming-container">
            <div className="portfolio-compare-heading">
              <div>
                <p className="section-eyebrow">{copy("At a glance")}</p>
                <h2 id="compare-title">{copy("Compare the portfolio.")}</h2>
              </div>
              <p>
                {copy(
                  "Compare the three everyday tiers and the distinct Elite 100 founding edition. Membership targets and proposed rewards are shown below.",
                )}
              </p>
            </div>

            <p className="portfolio-table-hint" id="portfolio-table-hint">
              {copy("Scroll horizontally to compare all four cards")}
              <ArrowRight aria-hidden="true" />
            </p>
            <div
              className="portfolio-table-wrap"
              tabIndex={0}
              aria-label={copy("Scrollable card tier comparison")}
              aria-describedby="portfolio-table-hint"
            >
              <table className="portfolio-table">
                <caption className="sr-only">
                  {copy("Samra Pay card tier comparison")}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">{copy("Benefit")}</th>
                    {cardTiers.map((tier) => (
                      <th
                        className={
                          tier.className === "is-founder"
                            ? "is-founder-column"
                            : undefined
                        }
                        scope="col"
                        key={tier.name}
                      >
                        {copy(tier.shortName)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {comparisonRows.map((row) => (
                    <tr key={row.label}>
                      <th scope="row">{copy(row.label)}</th>
                      {row.values.map((value, index) => (
                        <td
                          className={
                            cardTiers[index].className === "is-founder"
                              ? "is-founder-column"
                              : undefined
                          }
                          key={`${row.label}-${cardTiers[index].shortName}`}
                        >
                          {row.label === "Availability" ? (
                            <span className="portfolio-table-status">
                              {copy(value)}
                            </span>
                          ) : (
                            copy(value)
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section
          className="portfolio-disclosure"
          aria-labelledby="disclosure-title"
        >
          <div className="coming-container portfolio-disclosure-grid">
            <div className="portfolio-disclosure-title">
              <ShieldCheck aria-hidden="true" />
              <div>
                <p className="section-eyebrow">{copy("The details")}</p>
                <h2 id="disclosure-title">
                  {copy("Clarity comes with the card.")}
                </h2>
              </div>
            </div>
            <div className="portfolio-disclosure-copy">
              <p>
                {copy(
                  "This portfolio presents the products we are preparing to launch. Product rollout, regional eligibility, and final terms will be shared with launch announcements.",
                )}
              </p>
              <p>
                {copy(
                  "ShebaMiles earning and Ethiopian Airlines co-branding depend on executed commercial and technical agreements. Final eligibility, earn rates, fees, reporting, card terms, and benefits may change.",
                )}
              </p>
              <p>
                {copy(
                  "The +1% and +2% FX benefits are proposed tier uplifts. The baseline rate, calculation method, eligible transfers, limits, and final terms have not been established.",
                )}
              </p>
              <p>
                {copy(
                  "Early direct deposit, recurring-bill reporting, instant virtual cards, titanium cards, and instant transfers are proposed features. Availability depends on issuing, bureau reporting, identity, address, corridor, and payment-method eligibility. “Best available rate” refers to the eligible Samra Pay rate presented for a transaction, not a guaranteed market-best rate.",
                )}
              </p>
              <p>
                {copy(
                  "The proposed $195 Elite membership, $495 Ethiopian Airlines-tier membership, and annual rewards of 15,000 and 45,000 ShebaMiles are not final. Qualification, award timing, renewal eligibility, taxes, fees, miles expiration, and final terms have not been established.",
                )}
              </p>
              <p>
                {copy(
                  "Samra Elite 100 is a separate founding edition for 100 founder-selected members, not an automatic upgrade from the airline tier. Its own pricing, benefits, and terms will accompany invitations. Artwork illustrates the edition, not an issued card or assigned membership number.",
                )}
              </p>
            </div>
          </div>
        </section>

        <section
          className="portfolio-cta"
          aria-labelledby="portfolio-cta-title"
        >
          <div className="coming-container portfolio-cta-grid">
            <div>
              <p className="section-eyebrow">{copy("The first chapter")}</p>
              <h2 id="portfolio-cta-title">
                {language === "en" ? (
                  <>
                    Built for progress.
                    <br />
                    Marked by belief.
                  </>
                ) : (
                  <>
                    ለእድገት የተገነባ።
                    <br />
                    በእምነት የተለየ።
                  </>
                )}
              </h2>
              <p>
                {copy(
                  "Follow our launch in the United States and Canada, and the next chapter of your connection to Ethiopia.",
                )}
              </p>
            </div>
            <div className="portfolio-cta-actions">
              <a className="portfolio-primary-link" href="/#launch-updates">
                {copy("Get launch updates")}
                <ArrowRight aria-hidden="true" />
              </a>
              <div
                className="portfolio-cta-markers"
                aria-label={copy("Card portfolio pillars")}
              >
                <span>
                  <CreditCard aria-hidden="true" /> {copy("Credit")}
                </span>
                <span>
                  <Globe2 aria-hidden="true" /> {copy("FX value")}
                </span>
                <span>
                  <Plane aria-hidden="true" /> {copy("Miles")}
                </span>
                <span>
                  <Crown aria-hidden="true" /> Elite 100
                </span>
              </div>
            </div>
          </div>
        </section>
      </main>

      <ComingSoonFooter />
    </div>
  );
}
