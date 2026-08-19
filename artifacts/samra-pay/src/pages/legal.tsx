import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import {
  getSamraLegalDocument,
  type SamraLegalKind,
} from "@workspace/samra-client/legal";
import { PageTransition } from "@/components/page-transition";

type LegalPageProps = {
  kind: SamraLegalKind;
};

export default function LegalPage({ kind }: LegalPageProps) {
  const copy = getSamraLegalDocument(kind);

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
            <p className="mb-5 text-xs font-medium uppercase tracking-[0.22em] text-primary">
              {copy.eyebrow}
            </p>
            <h1 className="max-w-2xl font-serif text-5xl font-normal leading-[1.05] tracking-tight text-[#F9F7F1] md:text-7xl">
              {copy.title}
            </h1>
            <p className="mt-8 max-w-2xl text-lg font-light leading-relaxed text-muted-foreground">
              {copy.intro}
            </p>
          </div>

          <div className="space-y-10">
            {copy.sections.map((section) => (
              <section key={section.title}>
                <h2 className="mb-3 font-serif text-3xl font-normal text-[#F9F7F1]">
                  {section.title}
                </h2>
                <p className="text-base font-light leading-relaxed text-muted-foreground">
                  {section.body}
                </p>
              </section>
            ))}
          </div>

          <p className="mt-16 border-t border-white/10 pt-6 text-xs leading-relaxed text-muted-foreground/70">
            Last updated {copy.lastUpdated}. {copy.disclaimer}
          </p>
        </div>
      </main>
    </PageTransition>
  );
}
