import { ArrowLeft, Compass } from "lucide-react";
import { tibebPattern } from "@/assets/coming-soon/images";
import {
  ComingSoonFooter,
  ComingSoonHeader,
} from "@/components/coming-soon-shell";
import { OptimizedPicture } from "@/components/optimized-picture";
import { localized, usePublicLanguage } from "@/lib/public-i18n";
import { usePublicPageMeta } from "@/lib/public-page-meta";
import "./coming-soon.css";

const notFoundMeta = {
  title: localized("Page not found — Samra Pay", "ገጹ አልተገኘም — Samra Pay"),
  description: localized(
    "The requested Samra Pay public page could not be found.",
    "የጠየቁት የSamra Pay የሕዝብ ገጽ አልተገኘም።",
  ),
};

export default function PublicNotFound() {
  const { language, text } = usePublicLanguage();
  usePublicPageMeta({ language, ...notFoundMeta });

  return (
    <div
      className={`coming-soon-site editorial-page public-not-found ${language === "am" ? "is-amharic" : ""}`}
      id="top"
      lang={language}
    >
      <ComingSoonHeader />
      <main id="main-content" tabIndex={-1}>
        <section className="not-found-panel" aria-labelledby="not-found-title">
          <OptimizedPicture
            asset={tibebPattern}
            alt=""
            aria-hidden="true"
            className="not-found-pattern"
            pictureClassName="public-picture-contents"
            decoding="async"
          />
          <div className="coming-container not-found-panel-content">
            <Compass aria-hidden="true" />
            <p>404</p>
            <h1 id="not-found-title">
              {text(
                localized(
                  "This page is not part of the public preview.",
                  "ይህ ገጽ የሕዝብ ማሳያው አካል አይደለም።",
                ),
              )}
            </h1>
            <span>
              {text(
                localized(
                  "Use the public navigation or return home. Account access and sign-in are not available on this website.",
                  "የሕዝብ ምናሌውን ይጠቀሙ ወይም ወደ መነሻ ይመለሱ። በዚህ ድረ ገጽ ወደ አካውንት መግባት ወይም አካውንት መጠቀም አይቻልም።",
                ),
              )}
            </span>
            <a className="portfolio-primary-link" href="/">
              <ArrowLeft aria-hidden="true" />
              {text(localized("Back to home", "ወደ መነሻ ይመለሱ"))}
            </a>
          </div>
        </section>
      </main>
      <ComingSoonFooter />
    </div>
  );
}
