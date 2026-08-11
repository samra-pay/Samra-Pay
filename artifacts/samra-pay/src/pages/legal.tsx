import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { PageTransition } from "@/components/page-transition";

type LegalPageProps = {
  kind: "privacy" | "terms";
};

const pageCopy = {
  privacy: {
    eyebrow: "Privacy",
    title: "Your information, handled with care.",
    intro:
      "This demo page explains the kind of information Samra Pay would collect and how it would be used. The current Samra Pay experience is a client-side product demo and does not open a bank account or transmit an application.",
    sections: [
      {
        title: "What we collect",
        body: "In a production service, this may include contact details, identity information, account activity, and device information needed to provide financial products, prevent fraud, and support members.",
      },
      {
        title: "How we use it",
        body: "Information would be used to provide requested services, communicate with members, improve the product, meet legal obligations, and protect Samra Pay and its partners from misuse.",
      },
      {
        title: "Your choices",
        body: "You would be able to request access, correction, or deletion where applicable, manage marketing preferences, and ask questions about information handling through member support.",
      },
    ],
  },
  terms: {
    eyebrow: "Terms",
    title: "Clear expectations for the Samra Pay experience.",
    intro:
      "These demo terms describe the intended boundaries of this concept. The current site is for exploration only; it does not create an account, extend credit, move money, or submit an application.",
    sections: [
      {
        title: "The demo experience",
        body: "Product descriptions, rates, balances, rewards, card details, and dashboard activity are illustrative. They may change and should not be treated as an offer, approval, financial advice, or a promise of availability.",
      },
      {
        title: "Production services",
        body: "A live Samra Pay service would be subject to final account agreements, eligibility requirements, partner-bank disclosures, Mastercard network rules, fees, and applicable law.",
      },
      {
        title: "Questions",
        body: "For questions about the concept, visit Ask Samra. Before any live launch, the final agreements, privacy notice, rates, and program disclosures would be provided for review.",
      },
    ],
  },
} as const;

export default function LegalPage({ kind }: LegalPageProps) {
  const copy = pageCopy[kind];

  return (
    <PageTransition>
      <main className="min-h-[70vh] px-6 pb-24 pt-40">
        <div className="mx-auto max-w-3xl">
          <Link
            href="/"
            className="mb-12 inline-flex items-center gap-2 rounded-sm text-sm text-primary transition-colors hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to Samra Pay
          </Link>

          <div className="mb-12 border-b border-white/10 pb-12">
            <p className="mb-5 text-xs font-medium uppercase tracking-[0.22em] text-primary">{copy.eyebrow}</p>
            <h1 className="max-w-2xl font-serif text-5xl font-normal leading-[1.05] tracking-tight text-[#F9F7F1] md:text-7xl">
              {copy.title}
            </h1>
            <p className="mt-8 max-w-2xl text-lg font-light leading-relaxed text-muted-foreground">{copy.intro}</p>
          </div>

          <div className="space-y-10">
            {copy.sections.map((section) => (
              <section key={section.title}>
                <h2 className="mb-3 font-serif text-3xl font-normal text-[#F9F7F1]">{section.title}</h2>
                <p className="text-base font-light leading-relaxed text-muted-foreground">{section.body}</p>
              </section>
            ))}
          </div>

          <p className="mt-16 border-t border-white/10 pt-6 text-xs leading-relaxed text-muted-foreground/70">
            Last updated August 11, 2026. This page is part of the Samra Pay concept experience and is not a substitute for final legal agreements.
          </p>
        </div>
      </main>
    </PageTransition>
  );
}